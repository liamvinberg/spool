import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { ReferenceSent } from "../../../src/reference-wire";

/**
 * The picker as a state machine, on a real page: the design's `use-capture.ts` (`app/extension/capture`) with the
 * window for its viewport, the document for its content, and a real send.
 *
 * The pointer aims at the element under it; ↑ walks to the parent, and past body to the whole page; ↓ back down the
 * way it came (or to the first child); click or ↵ grabs; ⌘↵ grabs the page; esc leaves. A grab is sent at once: there
 * is no review step. While it is open the page gets no clicks, so a link under the pointer is picked, not followed.
 *
 * Boxes are in the window's coordinates (the viewport's), as the overlay is fixed over it.
 */

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export type Phase = "aim" | "sending" | "sent" | "failed";

export interface Aim {
	el: Element | null;
	whole: boolean;
	label: string;
	size: string;
}

export interface Grab {
	box: Box;
	label: string;
	size: string;
	whole: boolean;
	el: Element;
	/** counts grabs, so the overlay can key its moment on it */
	n: number;
}

/** what became of a grab: spool has it, or nothing answered, or spool answered with an error */
export type Delivery =
	| { ok: true; sent: ReferenceSent }
	| { ok: false; offline: true }
	| { ok: false; offline: false; error: string };

export interface PickerOptions {
	/** the overlay's own host, which the pointer never aims at */
	host: RefObject<HTMLElement | null>;
	/** serializes the grab and sends it to spool */
	deliver: (grab: { el: Element; whole: boolean; label: string }) => Promise<Delivery>;
	/** the least time a send shows for, so its line is seen running even when spool answers at once */
	sendMs: number;
	/** how far the hand moves after a send before the picker lets the receipt go */
	holdPx: number;
	/** how long the hand stays on one element before it counts as resting */
	restMs: number;
}

const NONE: Aim = { el: null, whole: false, label: "", size: "" };

/** what the page's own handlers must not see while the picker is open: a click would follow a link */
const SWALLOWED = ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "auxclick"] as const;

export function viewportBox(): Box {
	const d = document.documentElement;
	return { x: 0, y: 0, w: d.clientWidth || window.innerWidth, h: window.innerHeight };
}

export function usePicker(o: PickerOptions) {
	const [open, setOpen] = useState(true);
	const [aim, setAimState] = useState<Aim>(NONE);
	const [box, setBox] = useState<Box | null>(null);
	const [dir, setDir] = useState<1 | -1 | 0>(0);
	const [step, setStep] = useState(0);
	const [bump, setBump] = useState({ n: 0, dir: 0 as 1 | -1 | 0 });
	const [phase, setPhaseState] = useState<Phase>("aim");
	const [grab, setGrab] = useState<Grab | null>(null);
	const [receipt, setReceipt] = useState<ReferenceSent | null>(null);
	const [failure, setFailure] = useState<{ offline: true } | { offline: false; error: string } | null>(null);
	const [resting, setResting] = useState(false);
	const [openedAt, setOpenedAt] = useState(() => performance.now());
	const [view, setView] = useState(viewportBox);

	const live = useRef({ open, aim, phase, grab });
	live.current = { open, aim, phase, grab };
	const opts = useRef(o);
	opts.current = o;

	const ptr = useRef<{ x: number; y: number } | null>(null);
	const anchor = useRef({ x: -999, y: -999 });
	const walked = useRef(false);
	const trail = useRef<Element[]>([]);
	const before = useRef<Aim>(NONE);
	const grabs = useRef(0);
	const restTimer = useRef(0);

	const setPhase = useCallback((p: Phase) => {
		live.current.phase = p;
		setPhaseState(p);
	}, []);

	const measure = useCallback((el: Element | null, whole: boolean): Box | null => {
		if (el === null) return null;
		if (whole) return viewportBox();
		const r = el.getBoundingClientRect();
		return { x: r.left, y: r.top, w: r.width, h: r.height };
	}, []);

	const rest = useCallback(() => {
		setResting(false);
		window.clearTimeout(restTimer.current);
		restTimer.current = window.setTimeout(() => setResting(true), opts.current.restMs);
	}, []);

	const describe = useCallback((el: Element, whole: boolean): Aim => {
		if (whole) {
			const d = document.documentElement;
			const h = Math.max(d.scrollHeight, document.body.scrollHeight);
			return {
				el,
				whole,
				label: location.host || "this page",
				size: `${Math.round(d.clientWidth)} × ${Math.round(h)}`,
			};
		}
		const r = el.getBoundingClientRect();
		const tag = el.localName;
		const cls = Array.from(el.classList).find((c) => /^[a-z][a-z0-9-]*$/.test(c) && c.length < 18);
		const label = el === document.body ? "body" : cls === undefined ? tag : `${tag}.${cls}`;
		return { el, whole, label, size: `${Math.round(r.width)} × ${Math.round(r.height)}` };
	}, []);

	const setAim = useCallback(
		(next: Aim, d: 1 | -1 | 0) => {
			const cur = live.current.aim;
			if (cur.el === next.el && cur.whole === next.whole) return;
			live.current.aim = next;
			setAimState(next);
			setDir(d);
			setStep((s) => s + 1);
			rest();
		},
		[rest],
	);

	const nudge = useCallback((d: 1 | -1) => setBump((b) => ({ n: b.n + 1, dir: d })), []);

	const pointAt = useCallback(
		(raw: Element | null) => {
			const body = document.body;
			if (raw === null || body === null || !body.contains(raw)) return;
			const el = raw.closest("svg") ?? raw;
			trail.current = [];
			setAim(describe(el, false), 0);
		},
		[describe, setAim],
	);

	/* ---------------------------------------------------------------- sending -- */

	const send = useCallback(
		(target: Aim) => {
			if (target.el === null) return;
			const b = measure(target.el, target.whole);
			if (b === null) return;
			grabs.current += 1;
			const n = grabs.current;
			setGrab({ box: b, label: target.label, size: target.size, whole: target.whole, el: target.el, n });
			setPhase("sending");
			if (ptr.current !== null) anchor.current = { ...ptr.current };
			const el = target.el;
			const started = performance.now();
			// a frame first, so the grab is drawn before the page is read
			requestAnimationFrame(() => {
				void opts.current
					.deliver({ el, whole: target.whole, label: target.label })
					.catch((): Delivery => ({ ok: false, offline: true }))
					.then(async (done) => {
						const wait = opts.current.sendMs - (performance.now() - started);
						if (wait > 0) await new Promise((r) => window.setTimeout(r, wait));
						if (grabs.current !== n || !live.current.open) return;
						if (done.ok) {
							setReceipt(done.sent);
							setFailure(null);
						} else setFailure(done.offline ? { offline: true } : { offline: false, error: done.error });
						setPhase(done.ok ? "sent" : "failed");
					});
			});
		},
		[measure, setPhase],
	);

	const pick = useCallback(
		(whole: boolean) => {
			const { phase: p, aim: a } = live.current;
			if (p === "sending") return;
			if (whole) {
				const page = document.body;
				if (page === null) return;
				if (!a.whole) before.current = a;
				const all = describe(page, true);
				setAim(all, 1);
				send(all);
				return;
			}
			send(a);
		},
		[describe, send, setAim],
	);

	const retry = useCallback(() => {
		const g = live.current.grab;
		if (g === null || live.current.phase === "sending") return;
		send(describe(g.el, g.whole));
	}, [describe, send]);

	/* ---------------------------------------------------------------- walking -- */

	const walk = useCallback(
		(up: boolean) => {
			const { aim: a, phase: p } = live.current;
			if (p === "sending") return;
			if (p !== "aim") setPhase("aim");
			const body = document.body;
			if (a.el === null || body === null) return;
			walked.current = true;
			if (ptr.current !== null) anchor.current = { ...ptr.current };
			if (a.whole) {
				if (up) return nudge(1);
				const back = before.current.el === null ? NONE : describe(before.current.el, false);
				if (back.el === null) return nudge(-1);
				return setAim(back, -1);
			}
			if (up) {
				const parent = a.el.parentElement;
				if (a.el === body || parent === null || !body.contains(parent)) {
					before.current = a;
					return setAim(describe(body, true), 1);
				}
				trail.current.push(a.el);
				return setAim(describe(parent, false), 1);
			}
			let next = trail.current.pop() ?? null;
			if (next === null) {
				next =
					Array.from(a.el.children).find((c) => {
						const r = c.getBoundingClientRect();
						return r.width > 2 && r.height > 2;
					}) ?? null;
			}
			if (next === null) return nudge(-1);
			setAim(describe(next, false), -1);
		},
		[describe, nudge, setAim, setPhase],
	);

	/* --------------------------------------------------------- open and close -- */

	const openUp = useCallback(() => {
		setOpen(true);
		live.current.open = true;
		setPhase("aim");
		setOpenedAt(performance.now());
		trail.current = [];
		live.current.aim = NONE;
		setAimState(NONE);
		const p = ptr.current;
		if (p !== null) requestAnimationFrame(() => pointAt(document.elementFromPoint(p.x, p.y)));
	}, [pointAt, setPhase]);

	const close = useCallback(() => {
		setOpen(false);
		live.current.open = false;
		grabs.current += 1;
		setPhase("aim");
	}, [setPhase]);

	const toggle = useCallback(() => (live.current.open ? close() : openUp()), [close, openUp]);

	/* ------------------------------------------------------------------ input -- */

	useEffect(() => {
		const ours = (e: Event) => {
			const host = opts.current.host.current;
			return host !== null && e.composedPath().includes(host);
		};
		const move = (e: PointerEvent) => {
			// the hand over the tab still counts as where it is: a send from Try again holds the receipt from there
			ptr.current = { x: e.clientX, y: e.clientY };
			if (ours(e)) return;
			const { open: on, phase: p } = live.current;
			if (!on || p === "sending" || p === "failed") return;
			const d = Math.hypot(e.clientX - anchor.current.x, e.clientY - anchor.current.y);
			if (p === "sent") {
				if (d < opts.current.holdPx) return;
				setPhase("aim");
			}
			if (walked.current) {
				if (d < 8) return;
				walked.current = false;
			}
			pointAt(e.target as Element);
		};
		const swallow = (e: Event) => {
			if (!live.current.open || ours(e)) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			if (e.type !== "click") return;
			const target = e.target as Element;
			if (live.current.phase === "failed") {
				setPhase("aim");
				pointAt(target);
				return;
			}
			if (live.current.aim.el === null) pointAt(target);
			pick(false);
		};
		const scroll = () => {
			if (!live.current.open) return;
			const a = live.current.aim;
			setBox(measure(a.el, a.whole));
			rest();
		};
		const resize = () => {
			setView(viewportBox());
			scroll();
		};
		window.addEventListener("pointermove", move, true);
		for (const type of SWALLOWED) window.addEventListener(type, swallow, true);
		window.addEventListener("scroll", scroll, { capture: true, passive: true });
		window.addEventListener("resize", resize);
		return () => {
			window.removeEventListener("pointermove", move, true);
			for (const type of SWALLOWED) window.removeEventListener(type, swallow, true);
			window.removeEventListener("scroll", scroll, { capture: true });
			window.removeEventListener("resize", resize);
		};
	}, [measure, pick, pointAt, rest, setPhase]);

	useEffect(() => {
		const key = (e: KeyboardEvent) => {
			if (!live.current.open) return;
			const mine = e.key === "Escape" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter";
			if (!mine) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			if (e.key === "Escape") close();
			else if (e.key === "ArrowUp" || e.key === "ArrowDown") walk(e.key === "ArrowUp");
			else if (e.metaKey || e.ctrlKey) pick(true);
			else if (live.current.phase === "failed") retry();
			else pick(false);
		};
		window.addEventListener("keydown", key, true);
		return () => window.removeEventListener("keydown", key, true);
	}, [close, pick, retry, walk]);

	useEffect(() => {
		setBox(measure(aim.el, aim.whole));
	}, [aim, measure]);

	// the page moves under a resting hand (a carousel, a hero settling): the body follows what it is on
	useEffect(() => {
		if (!open || aim.el === null || aim.whole) return;
		const t = window.setInterval(() => {
			const b = measure(aim.el, false);
			setBox((cur) =>
				b === null || cur === null || (cur.x === b.x && cur.y === b.y && cur.w === b.w && cur.h === b.h) ? cur : b,
			);
		}, 200);
		return () => window.clearInterval(t);
	}, [open, aim, measure]);

	useEffect(() => () => window.clearTimeout(restTimer.current), []);

	return {
		open,
		toggle,
		close,
		aim,
		box,
		/** the last move's direction: 1 out to the parent, -1 in to a child, 0 the pointer */
		dir,
		/** counts every change of aim */
		step,
		/** a walk that hit an end: n counts them, dir says which end */
		bump,
		phase,
		grab,
		/** what spool said it took: the receipt's project */
		receipt,
		failure,
		resting,
		openedAt,
		/** the window's size, which the whole page fills */
		view,
		pick,
		walk,
		retry,
	};
}

export type Picker = ReturnType<typeof usePicker>;
