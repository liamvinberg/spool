import { useEffect, useMemo, useRef, useState } from "react";
import { attachHotkeyLayer, type HotkeyHandler } from "../hotkey-dispatch";
import type { HotkeyIdFor } from "../hotkeys";
import {
	type Carried,
	type Carrier,
	canLand,
	type MapFit,
	PEEK_MAP,
	type PeekFrom,
	SPRING_MS,
	worldAt,
} from "./page-peek";

/**
 * The peek (spool#224), Quick Look for a folder: Space over a tree row, a row
 * of a list of pages or a name on the path shows that folder's stills beside
 * it; the arrows walk to the next folder with the peek following; Space, Esc or
 * the pointer moving off puts it back. A frame carried over a folder for a beat
 * springs its peek open too, so it can be let go on a spot there.
 *
 * Space is the Hand borrowed everywhere else, so the peek's keys are up only
 * while there is a folder to peek at: one under the pointer, the tree's cursor
 * on one while the tree holds focus, the lit row of a list of pages, or a peek
 * already open. A field being typed in, and a frame being used, keep theirs.
 *
 * Every folder that can be peeked at or dropped on says so in the DOM: its page
 * as `data-drop-page`, what it is as `data-drop-at`, and, where a peek can open
 * beside it, `data-peek-from`. A peek's map says its page and its fit, so a
 * point over it reads back as a spot on that page's canvas.
 */

export interface Peek {
	readonly page: string;
	readonly from: PeekFrom;
	/** a key opened it, or a frame resting on its folder mid-drag */
	readonly why: "key" | "drop";
	/** where the card stands, in the window's own pixels */
	readonly left: number;
	readonly top: number;
	/** which way the last arrow went, so the next folder's stills come from that side */
	readonly dir: number;
}

/** the card's header and foot around its map, its side padding, and the gap it keeps from its source */
export const PEEK_HEAD = 36;
export const PEEK_FOOT = 12;
export const PEEK_CARD_W = PEEK_MAP.w + 24;
const GAP = 8;
const LIST_GAP = 16;
/** how far a list of pages steps aside so it and a peek opened from it stand centred together */
export const LIST_ASIDE = (PEEK_CARD_W + LIST_GAP) / 2;
/** how far the pointer can drift from where a key opened the peek before leaving puts it away */
const DRIFT = 24;
const CLOSE_MS = 180;
/** a peek a drag sprang waits this long off every folder, so the gap to it can be crossed */
const LET_GO_MS = 240;

export interface PeekTarget {
	readonly page: string;
	readonly at: PeekFrom | "peek";
	/** where on the map, in its own pixels, for a frame let go on a spot */
	readonly spot?: { readonly mx: number; readonly my: number };
}

function sourceEl(page: string, from: PeekFrom): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-peek-from="${from}"][data-drop-page="${CSS.escape(page)}"]`);
}

function readFit(map: HTMLElement): MapFit | undefined {
	const [s, ox, oy] = (map.dataset.peekFit ?? "").split(" ").map(Number);
	if (s === undefined || ox === undefined || oy === undefined || !(s > 0)) return undefined;
	return { s, ox, oy };
}

/** where a card stands beside what opened it: right of the tree or the list, under a name on the path */
function anchorOf(el: HTMLElement, from: PeekFrom, h: number): { left: number; top: number } {
	const r = el.getBoundingClientRect();
	let left: number;
	let top = r.top + r.height / 2 - PEEK_HEAD / 2 - 6;
	if (from === "path") {
		left = r.left - 4;
		top = r.bottom + 8;
	} else if (from === "tree") {
		left = (el.closest('[role="tree"]')?.getBoundingClientRect().right ?? r.right) + GAP;
	} else {
		// read from the list's own layout, which a step aside does not move, so a
		// second row peeked at stands where the first one did
		const list = el.closest<HTMLElement>("[data-page-list-rows]");
		const holder = list?.offsetParent?.getBoundingClientRect();
		const right =
			list === null || list === undefined || holder === undefined
				? r.right
				: holder.left + list.offsetLeft + list.offsetWidth;
		left = right - LIST_ASIDE + LIST_GAP;
	}
	const width = window.innerWidth || 0;
	const height = window.innerHeight || 0;
	return {
		left: Math.max(8, Math.min(width - PEEK_CARD_W - 8, left)),
		top: Math.max(8, Math.min(height - h - 8, top)),
	};
}

export function cardHeight(carrying: boolean): number {
	return PEEK_HEAD + PEEK_MAP.h + PEEK_FOOT + (carrying ? 22 : 0);
}

export function usePagePeek({
	activePage,
	pageOfFrame,
	onLight,
	onGo,
}: {
	activePage: string;
	/** the page a frame stands on, by its name */
	pageOfFrame: (name: string) => string;
	/** a list's lit row follows a peek walked through the list */
	onLight: (page: string) => void;
	/** ⏎ or ⌘↓ with a peek open: into its folder */
	onGo: (page: string) => void;
}) {
	const [peek, setPeekState] = useState<Peek | null>(null);
	const [target, setTargetState] = useState<PeekTarget | null>(null);
	const [carrying, setCarryingState] = useState<Carried | null>(null);

	// what handlers that outlive a render read
	const peekRef = useRef<Peek | null>(null);
	const targetRef = useRef<PeekTarget | null>(null);
	const carryingRef = useRef<Carried | null>(null);
	const live = useRef({ activePage, pageOfFrame, onLight, onGo });
	live.current = { activePage, pageOfFrame, onLight, onGo };
	const hover = useRef<HTMLElement | null>(null);
	const openedAt = useRef({ x: 0, y: 0 });
	const pointer = useRef({ x: 0, y: 0 });
	const timers = useRef({ close: 0, dwell: 0, dwellOn: "" });

	const api = useMemo(() => {
		const setPeek = (next: Peek | null) => {
			peekRef.current = next;
			setPeekState(next);
		};
		const setTarget = (next: PeekTarget | null) => {
			const was = targetRef.current;
			if (
				was === next ||
				(was !== null &&
					next !== null &&
					was.page === next.page &&
					was.at === next.at &&
					was.spot?.mx === next.spot?.mx &&
					was.spot?.my === next.spot?.my)
			)
				return;
			targetRef.current = next;
			setTargetState(next);
		};
		const setCarrying = (next: Carried | null) => {
			const was = carryingRef.current;
			if (
				was === next ||
				(was !== null && next !== null && was.kind === next.kind && was.names.join("\n") === next.names.join("\n"))
			)
				return;
			carryingRef.current = next;
			setCarryingState(next);
		};

		const open = (page: string, from: PeekFrom, why: Peek["why"], dir = 0): boolean => {
			if (page === live.current.activePage) return false;
			const el = sourceEl(page, from);
			if (el === null) return false;
			window.clearTimeout(timers.current.close);
			timers.current.close = 0;
			openedAt.current = { ...pointer.current };
			setPeek({ page, from, why, dir, ...anchorOf(el, from, cardHeight(why === "drop")) });
			return true;
		};
		const close = () => {
			window.clearTimeout(timers.current.close);
			timers.current.close = 0;
			if (peekRef.current !== null) setPeek(null);
		};
		/** the folders an arrow walks through, in the order they stand; the page you are on has nothing to show */
		const walkOf = (from: PeekFrom): string[] =>
			[...document.querySelectorAll<HTMLElement>(`[data-peek-from="${from}"]`)]
				.map((el) => el.dataset.dropPage ?? "")
				.filter((page, at, all) => page !== live.current.activePage && all.indexOf(page) === at);
		const walk = (by: -1 | 1) => {
			const was = peekRef.current;
			if (was === null) return;
			const list = walkOf(was.from);
			const at = list.indexOf(was.page);
			const next = list[Math.max(0, Math.min(list.length - 1, at + by))];
			if (next === undefined || next === was.page) return;
			if (was.from === "list") live.current.onLight(next);
			open(next, was.from, "key", by);
		};
		/** what Space would peek at now: the folder under the pointer, under the keys, or the list's lit row */
		const sourceNow = (): { page: string; from: PeekFrom } | null => {
			const read = (el: Element | null | undefined) => {
				const at = el?.closest<HTMLElement>("[data-peek-from]");
				if (at === null || at === undefined || !at.isConnected) return null;
				const page = at.dataset.dropPage;
				const from = at.dataset.peekFrom as PeekFrom | undefined;
				return page === undefined || from === undefined || page === live.current.activePage ? null : { page, from };
			};
			const focused = document.activeElement;
			return (
				read(hover.current) ??
				read(focused) ??
				(focused?.getAttribute("role") === "tree" ? read(focused.querySelector("[data-rail-cursor]")) : null) ??
				read(document.querySelector('[data-peek-from="list"][aria-current="true"]'))
			);
		};

		/** a frame resting on a folder springs its peek; off every folder, a peek a drag sprang goes */
		const dwell = (carried: Carried, folder: { page: string; from: PeekFrom } | null, onCard: boolean) => {
			const t = timers.current;
			const key = onCard ? "card" : folder === null ? "none" : `${folder.from}:${folder.page}`;
			if (key === t.dwellOn) return;
			window.clearTimeout(t.dwell);
			t.dwellOn = key;
			if (key === "card") return;
			if (folder === null) {
				t.dwell = window.setTimeout(() => {
					if (peekRef.current?.why === "drop") close();
				}, LET_GO_MS);
				return;
			}
			const shown = peekRef.current;
			if (shown?.page === folder.page && shown.from === folder.from) return;
			if (carried.kind !== "frame" || !canLand(carried, folder.page, live.current.pageOfFrame)) return;
			t.dwell = window.setTimeout(() => open(folder.page, folder.from, "drop"), SPRING_MS);
		};

		const carrier: Carrier = {
			over(carried, x, y, own) {
				pointer.current = { x, y };
				setCarrying(carried);
				const can = (page: string) => canLand(carried, page, live.current.pageOfFrame);
				if (own !== undefined) {
					dwell(carried, own === null ? null : { page: own, from: "tree" }, false);
					setTarget(null);
					return null;
				}
				const hit = typeof document.elementFromPoint === "function" ? document.elementFromPoint(x, y) : null;
				const onCard = hit?.closest("[data-peek-card]") != null;
				const map = hit?.closest<HTMLElement>("[data-peek-map]");
				if (map !== null && map !== undefined && carried.kind === "frame") {
					dwell(carried, null, true);
					const page = map.dataset.peekMap ?? "";
					const fit = readFit(map);
					if (fit === undefined || !can(page)) {
						setTarget(null);
						return null;
					}
					const r = map.getBoundingClientRect();
					const mx = x - r.left;
					const my = y - r.top;
					setTarget({ page, at: "peek", spot: { mx, my } });
					return { kind: "spot", page, ...worldAt(fit, mx, my) };
				}
				const drop = hit?.closest<HTMLElement>("[data-drop-page]");
				const page = drop?.dataset.dropPage;
				const at = drop?.dataset.dropAt as PeekFrom | "peek" | undefined;
				const from = drop?.dataset.peekFrom as PeekFrom | undefined;
				dwell(carried, page === undefined || from === undefined ? null : { page, from }, onCard);
				if (page === undefined || at === undefined || !can(page)) {
					setTarget(null);
					return null;
				}
				setTarget({ page, at });
				return { kind: "into", page, at };
			},
			end() {
				const t = timers.current;
				window.clearTimeout(t.dwell);
				t.dwellOn = "";
				setTarget(null);
				setCarrying(null);
				if (peekRef.current?.why === "drop") close();
			},
		};

		return { open, close, walk, sourceNow, carrier };
	}, []);

	// the pointer over the chrome, read when Space comes
	useEffect(() => {
		const over = (event: PointerEvent) => {
			hover.current = event.target instanceof HTMLElement ? event.target : null;
		};
		const out = (event: PointerEvent) => {
			if (event.relatedTarget === null) hover.current = null;
		};
		document.addEventListener("pointerover", over);
		document.addEventListener("pointerout", out);
		return () => {
			document.removeEventListener("pointerover", over);
			document.removeEventListener("pointerout", out);
		};
	}, []);

	// a peek a key opened goes once the pointer drifts off it and what opened it
	const keyPeek = peek?.why === "key" ? peek : null;
	useEffect(() => {
		if (keyPeek === null) return;
		const move = (event: PointerEvent) => {
			pointer.current = { x: event.clientX, y: event.clientY };
			const t = timers.current;
			const hit = event.target instanceof Element ? event.target : null;
			const src = hit?.closest<HTMLElement>("[data-peek-from]");
			const onSource = src?.dataset.dropPage === keyPeek.page && src.dataset.peekFrom === keyPeek.from;
			const onCard = hit?.closest("[data-peek-card]") != null;
			const drifted = Math.hypot(event.clientX - openedAt.current.x, event.clientY - openedAt.current.y) > DRIFT;
			if (onSource || onCard || !drifted) {
				window.clearTimeout(t.close);
				t.close = 0;
				return;
			}
			if (t.close === 0) t.close = window.setTimeout(api.close, CLOSE_MS);
		};
		window.addEventListener("pointermove", move);
		return () => window.removeEventListener("pointermove", move);
	}, [keyPeek, api]);

	// going somewhere puts a peek away: what it showed is where you are now, or behind you
	// biome-ignore lint/correctness/useExhaustiveDependencies: the page changing is the event
	useEffect(() => {
		api.close();
	}, [activePage, api]);

	useEffect(() => {
		const openKeys = {
			"peek.open": (event) => {
				event?.preventDefault();
				api.close();
			},
			"peek.walk": (event) => {
				event?.preventDefault();
				const sideways = event?.key === "ArrowLeft" || event?.key === "ArrowRight";
				// the path walks sideways and up and down alike; a tree and a list only up and down
				if (sideways && peekRef.current?.from !== "path") return;
				api.walk(event?.key === "ArrowUp" || event?.key === "ArrowLeft" ? -1 : 1);
			},
			"peek.go": (event) => {
				event?.preventDefault();
				const page = peekRef.current?.page;
				api.close();
				if (page !== undefined) live.current.onGo(page);
			},
			"peek.close": (event) => {
				event?.preventDefault();
				api.close();
			},
		} satisfies Record<HotkeyIdFor<"peek">, HotkeyHandler>;
		const detachOpen = attachHotkeyLayer({
			scope: "peek",
			active: () => peekRef.current?.why === "key",
			handlers: openKeys,
		});
		// nothing open: only Space, and only with a folder under the pointer or the keys
		const detachCan = attachHotkeyLayer({
			scope: "peek",
			active: () => peekRef.current === null && carryingRef.current === null && api.sourceNow() !== null,
			handlers: {
				"peek.open": (event) => {
					event?.preventDefault();
					const source = api.sourceNow();
					if (source !== null) api.open(source.page, source.from, "key");
				},
			},
		});
		return () => {
			detachOpen();
			detachCan();
		};
	}, [api]);

	return { peek, target, carrying, carrier: api.carrier, close: api.close };
}
