import type {
	KeyboardEvent as ReactKeyboardEvent,
	MouseEvent as ReactMouseEvent,
	ReactNode,
	PointerEvent as ReactPointerEvent,
	RefObject,
} from "react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { heldBox, type PlayerSize } from "./player-fit";
import {
	ALONG_SPRING,
	cursorFor,
	DWELL_MS,
	FADE,
	FOLLOW_SPRING,
	type Grab,
	GUTTER,
	type Held,
	heightStops,
	MENU_OUT_S,
	MENU_SPRING,
	marked,
	PULL_SPRING,
	pullAt,
	pullRest,
	rows,
	SETTLE_MS,
	type Size,
	type SizeId,
	sizeOf,
	stopWord,
	TICKS_FADE,
	TYPE_AHEAD_MS,
	widthStops,
	wordFor,
	type Zone,
	zoneAt,
} from "./player-size-model";
import { Animated } from "./spring";

/**
 * Choosing the size a frame plays at (spool#264), ported from the design's
 * `shared/ui/spool/player-size.tsx`: the readout in the bar's middle opens a
 * short list of sizes, and the frame's own edges, out on the desk, pull to any
 * size between. Its numbers and rules are `player-size-model.ts`.
 *
 * The frame is laid out for real at every size it passes through: each step
 * of a spring or a pull is laid through {@link PlayerSize.lay}, which the
 * shell hands across the port, so the box the frame's document measures is
 * the box the chrome draws at every moment.
 */

/** A pull on its way, from where it was grabbed, and what it holds on. */
interface Drag extends Grab {
	snapW: number | null;
	snapH: number | null;
	toWindow: boolean;
	moved: boolean;
}

type GripZone = Zone & { dragging: boolean; snapped: boolean };

export interface Sizing {
	own: Size;
	room: Size;
	held: Held;
	/** The row the list marks. */
	marked: SizeId | null;
	open: boolean;
	active: SizeId | null;
	/** What the readout names after the size, or null. */
	word: string | null;
	/** Away from the frame's own size: the readout in full ink. */
	away: boolean;
	pulling: boolean;
	drag: Drag | null;
	/** The grip on show, if any. */
	grip: GripZone | null;
	/** At Window and resting there: no ring and no grips, since the frame is the window. */
	filling: boolean;
	/** The cursor the desk wears over a grip, and the page while a pull is on. */
	cursor: string | undefined;
	along: Animated;
	deskRef: RefObject<HTMLDivElement | null>;
	openMenu(): void;
	preview(id: SizeId | null): void;
	closeMenu(): void;
	pick(id: SizeId): void;
	desk: {
		onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void;
		onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void;
		onPointerUp(): void;
		onPointerCancel(): void;
		onPointerLeave(): void;
		onDoubleClick(event: ReactMouseEvent<HTMLDivElement>): void;
		onMouseDown(event: ReactMouseEvent<HTMLDivElement>): void;
	};
}

/**
 * The size control's state, for the desk and the bar's middle to draw: the
 * list, the pull and the springs between, for the frame on show in `room`,
 * drawn at `scale` with `drawn` its box on the desk.
 */
export function useSizing(
	size: PlayerSize,
	frame: string,
	room: Size,
	drawn: Size,
	scale: number,
	narrow: boolean,
): Sizing {
	const still = useReducedMotion();
	const own = size.authored(frame);
	const held = size.held();
	const rest = heldBox(held, own, room);
	const heldRow = marked(held, own, room);
	/** The box a row plays at: as drawn, a long page keeps its width and scrolls (spool#263). */
	const boxOf = (id: SizeId) => heldBox({ id, size: sizeOf(id, own, room) }, own, room);

	const [open, setOpen] = useState(false);
	const [active, setActive] = useState<SizeId | null>(null);
	const [zone, setZone] = useState<Zone | null>(null);
	const [drag, setDrag] = useState<Drag | null>(null);
	const settleUntil = useRef(0);
	const deskRef = useRef<HTMLDivElement | null>(null);
	// The size the frame is laid out at, sprung or pulled; laid out for real at every step, in whole px.
	const [w] = useState(() => new Animated(rest.w));
	const [h] = useState(() => new Animated(rest.h));
	const [along] = useState(() => new Animated(0));
	const box = useRef(drawn);
	box.current = drawn;

	// Every step goes to the frame, once per task however many of the two moved: away from what is held while a
	// spring, a pull or the list has it, and back to resting on it once none has.
	const away = drag !== null || open;
	const latest = useRef({ size, away });
	latest.current = { size, away };
	const queue = useRef(() => {});
	useEffect(() => {
		let queued = false;
		const lay = () => {
			queued = false;
			const moving = w.moving() || h.moving() || latest.current.away;
			latest.current.size.lay(moving ? { w: Math.round(w.get()), h: Math.round(h.get()) } : null);
		};
		queue.current = () => {
			if (queued) return;
			queued = true;
			queueMicrotask(lay);
		};
		const stopW = w.subscribe(() => queue.current());
		const stopH = h.subscribe(() => queue.current());
		return () => {
			stopW();
			stopH();
			w.stop();
			h.stop();
			along.stop();
		};
	}, [w, h, along]);
	// a pull or the list ending with no spring to run still lets the frame rest
	useEffect(() => {
		if (!away) queue.current();
	}, [away]);

	// A walk lands at what is held, the list shut.
	const shown = useRef(frame);
	useLayoutEffect(() => {
		if (shown.current === frame) return;
		shown.current = frame;
		setOpen(false);
		setActive(null);
		if (drag === null) {
			w.jump(rest.w);
			h.jump(rest.h);
		}
	}, [frame, drag, rest.w, rest.h, w, h]);

	// Resting, the frame follows what it rests at. The window follows the window, the way a page does: at it or
	// previewing it, a resize is followed exactly; going there, or back there, springs like any other size.
	const following = drag === null && (open ? active === "window" : held.id === "window");
	const resting = drag === null && !open;
	const roomWas = useRef(room);
	useLayoutEffect(() => {
		const resized = roomWas.current.w !== room.w || roomWas.current.h !== room.h;
		roomWas.current = room;
		if (following) {
			if (!resized) return;
			w.jump(room.w);
			h.jump(room.h);
		} else if (resting && !w.moving() && !h.moving()) {
			w.jump(rest.w);
			h.jump(rest.h);
		}
	}, [following, resting, rest.w, rest.h, room, w, h]);

	const goTo = (to: Size, by: "menu" | "pull") => {
		const spring = by === "menu" ? MENU_SPRING : PULL_SPRING;
		w.to(to.w, spring, still);
		h.to(to.h, spring, still);
	};

	/* ------------------------------------------------------------ the menu -- */

	const openMenu = () => {
		setActive(heldRow);
		setOpen(true);
		setZone(null);
	};
	const preview = (id: SizeId | null) => {
		setActive(id);
		goTo(id === null ? rest : boxOf(id), "menu");
	};
	const closeMenu = () => {
		setOpen(false);
		setActive(null);
		goTo(rest, "menu");
	};
	const pick = (id: SizeId) => {
		size.hold({ id, size: sizeOf(id, own, room) });
		setOpen(false);
		setActive(null);
		goTo(boxOf(id), "menu");
	};

	/* ------------------------------------------------------------ the drag -- */

	const local = (event: { clientX: number; clientY: number }) => {
		const r = deskRef.current?.getBoundingClientRect();
		return r === undefined
			? { px: 0, py: 0 }
			: { px: event.clientX - r.left - r.width / 2, py: event.clientY - r.top - r.height / 2 };
	};

	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const { px, py } = local(event);
		if (drag !== null) {
			// past the most the desk allows, with the pointer at the window's own edge (or past it, the pointer is
			// held), the box lets go into the window
			const { w: fw, h: fh, snapW, snapH, toWindow } = pullAt(drag, px, py, own, room);
			if (drag.sx === 0) along.to(px, ALONG_SPRING, still);
			else if (drag.sy === 0) along.to(py, ALONG_SPRING, still);
			if (toWindow) {
				if (!drag.toWindow) {
					w.to(room.w, PULL_SPRING, still);
					h.to(room.h, PULL_SPRING, still);
					setDrag({ ...drag, snapW: null, snapH: null, toWindow, moved: true });
				}
				return;
			}
			if (drag.toWindow) settleUntil.current = performance.now() + SETTLE_MS;
			if (performance.now() < settleUntil.current) {
				// back from the window, the box springs to the hand before it follows it again
				w.to(fw, FOLLOW_SPRING, still);
				h.to(fh, FOLLOW_SPRING, still);
			} else {
				w.set(fw);
				h.set(fh);
			}
			const moved = drag.moved || fw !== drag.w || fh !== drag.h;
			if (snapW !== drag.snapW || snapH !== drag.snapH || toWindow !== drag.toWindow || moved !== drag.moved) {
				setDrag({ ...drag, snapW, snapH, toWindow, moved });
			}
			return;
		}
		// touch has no hover: on a touch screen the list is the way in
		if (open || narrow || event.pointerType === "touch") return;
		const next = zoneAt(px, py, box.current, room);
		if (next !== null) {
			const a = next.sx === 0 ? px : py;
			// a grip arrives where the pointer is, then follows it along the edge on a spring
			if (zone === null || next.sx !== zone.sx || next.sy !== zone.sy) along.jump(a);
			else along.to(a, ALONG_SPRING, still);
		}
		if (next === null && zone === null) return;
		if (
			next !== null &&
			zone !== null &&
			next.sx === zone.sx &&
			next.sy === zone.sy &&
			next.hit === zone.hit &&
			Math.abs(next.strength - zone.strength) < 0.04
		) {
			return;
		}
		setZone(next);
	};

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0 || narrow || event.pointerType === "touch") return;
		// read where the press is, never the last move's zone: a press inside the frame is the frame's
		const { px, py } = local(event);
		const at = zoneAt(px, py, box.current, room);
		if (at === null || !at.hit) return;
		event.preventDefault();
		// held for the length of the pull, wherever the pointer goes: over the frame's own document, or off the window
		event.currentTarget.setPointerCapture(event.pointerId);
		w.stop();
		h.stop();
		setZone(at);
		setDrag({
			sx: at.sx,
			sy: at.sy,
			x: px,
			y: py,
			w: w.get(),
			h: h.get(),
			s: scale,
			snapW: null,
			snapH: null,
			toWindow: false,
			moved: false,
		});
	};

	const onPointerUp = () => {
		if (drag === null) return;
		setDrag(null);
		if (drag.toWindow) {
			size.hold({ id: "window", size: room });
			goTo(room, "pull");
			return;
		}
		if (!drag.moved) return;
		const { w: fw, h: fh } = pullRest(drag, { w: w.get(), h: h.get() }, room);
		if (fw !== w.get()) w.to(fw, PULL_SPRING, still);
		if (fh !== h.get()) h.to(fh, PULL_SPRING, still);
		size.hold(fw === own.w && fh === own.h ? { id: "drawn", size: own } : { id: null, size: { w: fw, h: fh } });
	};

	// A double-click on an edge springs back to the frame's own size.
	const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
		const { px, py } = local(event);
		if (held.id === "drawn" || narrow || zoneAt(px, py, box.current, room)?.hit !== true) return;
		size.hold({ id: "drawn", size: own });
		goTo(boxOf("drawn"), "pull");
	};

	/* ---------------------------------------------------------- the readout -- */

	const word = narrow
		? null
		: drag !== null
			? drag.toWindow
				? "window"
				: stopWord(Math.round(w.get()), Math.round(h.get()), own)
			: wordFor(open && active !== null ? active : heldRow);
	const grabbed = drag ?? (zone?.hit === true ? zone : null);
	const filling = held.id === "window" && drag === null && !open;
	return {
		own,
		room,
		held,
		marked: heldRow,
		open,
		active,
		word,
		away: heldRow !== "drawn" || drag !== null || (open && active !== null && active !== "drawn"),
		pulling: drag !== null,
		drag,
		grip:
			filling || narrow
				? null
				: drag !== null
					? {
							sx: drag.sx,
							sy: drag.sy,
							hit: true,
							strength: 1,
							dragging: true,
							snapped: (drag.snapW !== null && drag.sx !== 0) || (drag.snapH !== null && drag.sy !== 0),
						}
					: zone === null || open
						? null
						: { ...zone, dragging: false, snapped: false },
		filling,
		cursor: grabbed === null ? undefined : cursorFor(grabbed.sx, grabbed.sy),
		along,
		deskRef,
		openMenu,
		preview,
		closeMenu,
		pick,
		desk: {
			onPointerMove,
			onPointerDown,
			onPointerUp,
			onPointerCancel: onPointerUp,
			onPointerLeave: () => {
				if (drag === null) setZone(null);
			},
			onDoubleClick,
			onMouseDown: (event) => {
				// the desk holds no words: a double-click on it never selects the bar's
				if (event.target === event.currentTarget) event.preventDefault();
			},
		},
	};
}

/* ------------------------------------------------------------------ the menu -- */

/**
 * The readout and the list it opens, size first: the size the frame is laid
 * out at, counting while it changes; what it is at, when that is the window or
 * a device; and how far it is drawn smaller.
 */
export function SizeMenu({
	sizing,
	laid,
	scale,
	quiet,
	tip,
}: {
	sizing: Sizing;
	laid: Size;
	scale: number;
	/** No tooltip: a pull is on. */
	quiet: boolean;
	/** Its name under it, after a beat: the bar's own tooltip. */
	tip: ReactNode;
}) {
	const {
		own,
		room,
		open,
		active,
		marked: at,
		onClose,
		onPreview,
		onPick,
	} = {
		...sizing,
		onClose: sizing.closeMenu,
		onPreview: sizing.preview,
		onPick: sizing.pick,
	};
	const list = rows(own, room);
	const rootRef = useRef<HTMLSpanElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const dwell = useRef<number | undefined>(undefined);
	const typed = useRef({ text: "", at: 0 });
	const closing = useRef(onClose);
	closing.current = onClose;
	const menu = usePresence(open ? "menu" : null, String, MENU_OUT_MS);

	// Open, the list takes the keys; a press anywhere outside it puts the frame back and closes it, and so does a
	// press on the frame, whose document the page only hears of as its own window losing focus.
	useEffect(() => {
		if (!open) return;
		menuRef.current?.focus({ preventScroll: true });
		const away = (event: PointerEvent) => {
			if (rootRef.current?.contains(event.target as Node)) return;
			closing.current();
		};
		const blurred = () => closing.current();
		document.addEventListener("pointerdown", away, true);
		window.addEventListener("blur", blurred);
		return () => {
			document.removeEventListener("pointerdown", away, true);
			window.removeEventListener("blur", blurred);
		};
	}, [open]);
	useEffect(() => () => window.clearTimeout(dwell.current), []);

	const rest = (id: SizeId) => {
		window.clearTimeout(dwell.current);
		dwell.current = window.setTimeout(() => onPreview(id), DWELL_MS);
	};
	const pick = (id: SizeId) => {
		window.clearTimeout(dwell.current);
		onPick(id);
		buttonRef.current?.focus({ preventScroll: true });
	};
	const close = () => {
		window.clearTimeout(dwell.current);
		onClose();
		buttonRef.current?.focus({ preventScroll: true });
	};

	const keys = (event: ReactKeyboardEvent) => {
		const i = list.findIndex((row) => row.id === active);
		const step = (to: number) => {
			event.preventDefault();
			window.clearTimeout(dwell.current);
			onPreview(list[(to + list.length) % list.length]?.id ?? "drawn");
		};
		if (event.key === "ArrowDown") return step(i + 1);
		if (event.key === "ArrowUp") return step(i < 0 ? list.length - 1 : i - 1);
		if (event.key === "Home") return step(0);
		if (event.key === "End") return step(list.length - 1);
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			if (active !== null) pick(active);
			return;
		}
		if (event.key === "Escape") {
			// the list's own esc: the player's esc is left alone while the list is shut
			event.preventDefault();
			event.stopPropagation();
			return close();
		}
		if (event.key === "Tab") return onClose();
		// Type-ahead: letters typed within half a second of each other spell the start of a row.
		if (event.key.length === 1 && /\S/.test(event.key) && !event.metaKey && !event.ctrlKey) {
			const now = Date.now();
			const text = (now - typed.current.at < TYPE_AHEAD_MS ? typed.current.text : "") + event.key.toLowerCase();
			typed.current = { text, at: now };
			const hit = list.find((row) => row.label.toLowerCase().startsWith(text));
			if (hit !== undefined) {
				event.preventDefault();
				window.clearTimeout(dwell.current);
				onPreview(hit.id);
			}
		}
	};

	const percent = Math.round(scale * 100);
	return (
		<span ref={rootRef} className="spool-bar-tipped spool-bar-fit spool-size">
			<button
				ref={buttonRef}
				type="button"
				className={[
					"spool-size-readout",
					...(sizing.away ? ["is-away"] : []),
					...(open || sizing.pulling ? ["is-pressed"] : []),
				].join(" ")}
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => (open ? close() : sizing.openMenu())}
				onKeyDown={(event) => {
					if (!open && event.key === "ArrowDown") {
						event.preventDefault();
						sizing.openMenu();
					}
				}}
			>
				<span className="spool-size-said">
					<span>
						{laid.w} × {laid.h}
					</span>
					<Swapped value={sizing.word} idOf={String} render={(word) => ` · ${word}`} />
					<Swapped value={percent < 100 ? percent : null} idOf={() => "percent"} render={(p) => ` · ${p}%`} />
				</span>
				<svg viewBox="0 0 8 8" width="8" height="8" aria-hidden="true" className="spool-size-caret">
					<path
						d="m1.5 3 2.5 2.5L6.5 3"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>
			{!open && !quiet && tip}
			{menu.map((entry) => (
				<div
					key={entry.key}
					ref={entry.leaving ? undefined : menuRef}
					role="menu"
					aria-label="Play at"
					tabIndex={-1}
					className={entry.leaving ? "spool-size-menu is-out" : "spool-size-menu"}
					onKeyDown={entry.leaving ? undefined : keys}
					onPointerLeave={
						entry.leaving
							? undefined
							: () => {
									window.clearTimeout(dwell.current);
									onPreview(at);
								}
					}
				>
					{list.map((row, i) => (
						<Ruled key={row.id} rule={i === 2}>
							<button
								type="button"
								role="menuitemcheckbox"
								aria-checked={row.id === at}
								tabIndex={-1}
								className="spool-size-row"
								data-state={row.id === active ? "hover" : undefined}
								onPointerEnter={() => rest(row.id)}
								onClick={() => pick(row.id)}
							>
								<span className="spool-size-check">
									{row.id === at && (
										<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
											<path
												d="m2.5 6.25 2.25 2.25 4.75-5"
												fill="none"
												stroke="currentColor"
												strokeWidth="1.3"
												strokeLinecap="round"
												strokeLinejoin="round"
											/>
										</svg>
									)}
								</span>
								<span className="spool-size-label">{row.label}</span>
								<span className="spool-size-meta">
									{row.size.w} × {row.size.h}
								</span>
							</button>
						</Ruled>
					))}
				</div>
			))}
		</span>
	);
}

/** How long the list takes to go. */
const MENU_OUT_MS = MENU_OUT_S * 1000;
/** How long a word in the readout, or a grip, takes to come and go. */
const FADE_MS = FADE.duration * 1000;
/** How long the stop marks take to come and go. */
const TICKS_FADE_MS = TICKS_FADE.duration * 1000;

function Ruled({ rule, children }: { rule: boolean; children: ReactNode }) {
	return (
		<>
			{rule && <hr className="spool-size-rule" />}
			{children}
		</>
	);
}

/**
 * A part of the readout that comes and goes: in from the left as it arrives,
 * out to the right as it leaves, popped out of the line so what follows moves
 * up at once. A word swaps for another; the percent stays one part however it
 * counts.
 */
function Swapped<T extends string | number>({
	value,
	idOf,
	render,
}: {
	value: T | null;
	idOf: (value: T) => string;
	render: (value: T) => string;
}) {
	const entries = usePresence(value, idOf, FADE_MS, false);
	return (
		<span className="spool-size-slot">
			{entries.map((entry) => (
				<span
					key={entry.key}
					className={[
						"spool-size-word",
						...(entry.entering ? ["is-in"] : []),
						...(entry.leaving ? ["is-out"] : []),
					].join(" ")}
				>
					{render(entry.value)}
				</span>
			))}
		</span>
	);
}

interface Presence<T> {
	key: number;
	id: string;
	value: T;
	entering: boolean;
	leaving: boolean;
}

/**
 * What is on show of a value that comes and goes, kept a while after it goes
 * so it can be seen going: Motion's `AnimatePresence`, for CSS to animate.
 * Values of one `idOf` are one thing changing, shown with the latest value;
 * one that goes keeps the value it went with. `animateFirst` false shows the
 * first value without an entrance.
 */
function usePresence<T>(
	value: T | null,
	idOf: (value: T) => string,
	leaveMs: number,
	animateFirst = true,
): Presence<T>[] {
	const next = useRef(1);
	const id = value === null ? null : idOf(value);
	const [entries, setEntries] = useState<Presence<T>[]>(() =>
		value === null || id === null ? [] : [{ key: 0, id, value, entering: animateFirst, leaving: false }],
	);
	// changed in the same render it is seen in, so what arrives is on show in the very commit that brought it
	const [seen, setSeen] = useState(id);
	if (seen !== id) {
		setSeen(id);
		setEntries((now) => [
			...now.map((entry) => (entry.leaving ? entry : { ...entry, entering: false, leaving: true })),
			...(value === null || id === null ? [] : [{ key: next.current++, id, value, entering: true, leaving: false }]),
		]);
	}
	useEffect(() => {
		if (!entries.some((entry) => entry.leaving)) return;
		const timer = window.setTimeout(() => setEntries((now) => now.filter((entry) => !entry.leaving)), leaveMs);
		return () => window.clearTimeout(timer);
	}, [entries, leaveMs]);
	return entries.map((entry) => (!entry.leaving && entry.id === id && value !== null ? { ...entry, value } : entry));
}

/* ------------------------------------------------------------------ the desk -- */

/**
 * The desk round the frame, under it: where a grip is grabbed, and while a
 * pull is on, short marks beside the box where its stops sit, lit when the
 * size holds on one.
 */
export function SizeDesk({ sizing, drawn }: { sizing: Sizing; drawn: Size }) {
	const { drag, own, room } = sizing;
	const ticks = usePresence(drag, () => "pull", TICKS_FADE_MS);
	return (
		<div
			ref={sizing.deskRef}
			className="spool-desk"
			style={sizing.cursor === undefined ? undefined : { cursor: sizing.cursor }}
			{...sizing.desk}
		>
			{ticks.map(({ key, value: pull, leaving }) => {
				const s = pull.s;
				const widths = widthStops(own).filter((v) => v * s <= room.w - 2 * GUTTER);
				const heights = heightStops(own).filter((v) => v * s <= room.h - 2 * GUTTER);
				const snapW = leaving ? null : pull.snapW;
				const snapH = leaving ? null : pull.snapH;
				return (
					<div key={key} className={leaving ? "spool-ticks is-out" : "spool-ticks"} aria-hidden="true">
						{pull.sx !== 0 &&
							widths.flatMap((v) =>
								[-1, 1].map((side) => (
									<span
										key={`w${v}${side}`}
										className={snapW === v ? "spool-tick is-across is-lit" : "spool-tick is-across"}
										style={{
											left: `calc(50% + ${(side * v * s) / 2}px)`,
											top: `calc(50% - ${drawn.h / 2 + 10}px)`,
										}}
									/>
								)),
							)}
						{pull.sy !== 0 &&
							heights.flatMap((v) =>
								[-1, 1].map((side) => (
									<span
										key={`h${v}${side}`}
										className={snapH === v ? "spool-tick is-down is-lit" : "spool-tick is-down"}
										style={{
											top: `calc(50% + ${(side * v * s) / 2}px)`,
											left: `calc(50% - ${drawn.w / 2 + 10}px)`,
										}}
									/>
								)),
							)}
					</div>
				);
			})}
		</div>
	);
}

/** Over the frame: the grip that shows where the pointer is beside an edge, a pill on a side, a bracket on a corner. */
export function SizeGrips({ sizing, drawn }: { sizing: Sizing; drawn: Size }) {
	// the same edge or corner is one grip however near or held it is; another comes as this one goes
	const grips = usePresence(sizing.grip, (zone) => `${zone.sx}${zone.sy}`, FADE_MS);
	return (
		<div className="spool-grips" aria-hidden="true">
			{grips.map((entry) => (
				<Grip key={entry.key} zone={entry.value} leaving={entry.leaving} drawn={drawn} along={sizing.along} />
			))}
		</div>
	);
}

function Grip({ zone, leaving, drawn, along }: { zone: GripZone; leaving: boolean; drawn: Size; along: Animated }) {
	const a = useSyncExternalStore(along.subscribe, () => along.get());
	const { sx, sy } = zone;
	const tone = zone.snapped ? "is-snapped" : zone.dragging || zone.hit ? "is-held" : "is-near";
	const corner = sx !== 0 && sy !== 0;
	const lit = zone.dragging || zone.hit;
	const edgeOpacity = lit ? (zone.snapped ? 0.9 : 0.45) : 0;
	const opacity = lit ? 1 : 0.2 + 0.55 * Math.max(0, Math.min(1, zone.strength));
	return (
		<div className={leaving ? "spool-grip is-out" : "spool-grip"}>
			{sx !== 0 && (
				<span
					className={`spool-grip-edge is-side ${tone}`}
					style={{
						left: `calc(50% + ${sx * (drawn.w / 2) + (sx > 0 ? 0 : -1)}px)`,
						top: `calc(50% - ${drawn.h / 2}px)`,
						height: drawn.h,
						opacity: edgeOpacity,
					}}
				/>
			)}
			{sy !== 0 && (
				<span
					className={`spool-grip-edge is-end ${tone}`}
					style={{
						top: `calc(50% + ${sy * (drawn.h / 2) + (sy > 0 ? 0 : -1)}px)`,
						left: `calc(50% - ${drawn.w / 2}px)`,
						width: drawn.w,
						opacity: edgeOpacity,
					}}
				/>
			)}
			{corner ? (
				<span
					className={`spool-grip-corner ${tone}`}
					style={{
						left: `calc(50% + ${sx * (drawn.w / 2 + 4)}px)`,
						top: `calc(50% + ${sy * (drawn.h / 2 + 4)}px)`,
					}}
				>
					<svg
						viewBox="0 0 24 24"
						width="24"
						height="24"
						style={{ transform: `scale(${sx}, ${sy})` }}
						aria-hidden="true"
					>
						<path
							d="M2 12H12V2"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.5"
							strokeLinecap="round"
							strokeLinejoin="round"
							className={zone.snapped ? "is-snapped" : undefined}
						/>
					</svg>
				</span>
			) : (
				<span
					className="spool-grip-pill"
					style={{
						left:
							sx !== 0 ? `calc(50% + ${sx * (drawn.w / 2 + 7)}px)` : `calc(50% + ${clampAlong(a, drawn.w)}px)`,
						top: sy !== 0 ? `calc(50% + ${sy * (drawn.h / 2 + 7)}px)` : `calc(50% + ${clampAlong(a, drawn.h)}px)`,
					}}
				>
					<span
						className={`${sx !== 0 ? "is-side" : "is-end"} ${tone}`}
						style={{ opacity, scale: zone.snapped ? "1.18" : zone.dragging ? "1.06" : "1" }}
					/>
				</span>
			)}
		</div>
	);
}

function clampAlong(a: number, length: number) {
	const reach = Math.max(0, length / 2 - 22);
	return Math.max(-reach, Math.min(reach, a));
}

/** Whether this reader asked for less motion: every spring then jumps. */
function useReducedMotion(): boolean {
	return useSyncExternalStore(
		(listener) => {
			const query = window.matchMedia("(prefers-reduced-motion: reduce)");
			query.addEventListener("change", listener);
			return () => query.removeEventListener("change", listener);
		},
		() => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
	);
}
