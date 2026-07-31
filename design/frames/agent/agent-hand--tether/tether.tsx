import { type ReactNode, useEffect, useRef, useState } from "react";
import type { PlayEntry } from "../../../shared/lib/turn-play";

/**
 * The tether: one line from the live row's own state mark, out through the rail's
 * inner edge, to the frame that row names.
 *
 * Everything here is geometry between two things that move — a row that slides as
 * the transcript grows, and a frame that moves when the canvas is panned — so none
 * of it can be laid out in React. The SVG below is a fixed skeleton and a single
 * requestAnimationFrame loop writes its attributes: `d` on the path, `y` on the
 * port, the pulse positions. Nothing in this file sets state per frame, which is
 * the whole reason a 60Hz line can sit next to a transcript that re-renders ten
 * times a second without either one costing the other anything.
 */

/* ---------- which way the work is going ---------- */

/**
 * The three characters, off the row's own verb.
 *
 * The verbs in this capture are `write`, `shot`, `look`, `edit` and `logs` — the
 * brief for this direction said `read`, and there is no `read` row anywhere in the
 * turn. So the mapping is by what the call *moves* rather than by its name, which
 * is the only reading that survives the next verb spool adds:
 *
 *   out    the agent puts something into the frame. `write`, `edit`.
 *   in     the agent takes something out of it. `look`, `logs`, `read`.
 *   ask    a request with nothing in it yet. `shot` — spool renders the frame and
 *          the picture comes back on the *next* row, so a round trip is two rows
 *          and not one animation.
 */
export type Flow = "out" | "in" | "ask";

const FLOWS: Record<string, Flow> = {
	write: "out",
	edit: "out",
	read: "in",
	look: "in",
	logs: "in",
	shot: "ask",
};

/** the row the tether is tied to, and everything the line needs to know about it */
export interface Held {
	/** the entry's key, which is also what tells one row from the next */
	readonly key: string;
	readonly frame: string;
	readonly flow: Flow;
	/** the call is in flight rather than finished */
	readonly working: boolean;
	/** how many writes a run has made so far; 1 for everything that is not a run */
	readonly count: number;
	/** where the row sits in the transcript, which is how its element is found */
	readonly index: number;
}

/**
 * The row the tether leaves from: the last one in the log that names a frame.
 *
 * The last one rather than the running one, because between two calls there is no
 * running row and the tether has to survive the gap. In this turn the gaps are 0.7s
 * to 3.9s and there are eleven of them, so a tether that only existed during a call
 * would flicker eleven times in thirty-eight seconds.
 */
export function holdOf(entries: readonly PlayEntry[]): Held | null {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry === undefined || entry.kind !== "line") continue;
		const frame = entry.frame ?? null;
		if (frame === null) continue;
		const flow = FLOWS[entry.verb];
		if (flow === undefined) continue;
		return {
			key: entry.key,
			frame,
			flow,
			working: entry.state === "running",
			count: entry.count ?? 1,
			index,
		};
	}
	return null;
}

/* ---------- where the frame is ---------- */

/**
 * A frame reporting its own box.
 *
 * `PlayField` hands a frame's drawing to a `render` prop and gives nothing back, so
 * this rides in on that prop rather than reaching into the field's DOM: the probe is
 * the frame's own content, wrapped, and `getBoundingClientRect` on it already carries
 * the field's 0.633 scale and whatever the canvas has been panned by. The canvas end
 * of the tether needs no shared code at all.
 */
export function Probe({
	name,
	on,
	children,
}: {
	name: string;
	on: (name: string, node: HTMLElement | null) => void;
	children: ReactNode;
}) {
	return (
		<div className="h-full w-full" ref={(node) => on(name, node)}>
			{children}
		</div>
	);
}

/* ---------- the drawing ---------- */

interface Point {
	readonly x: number;
	readonly y: number;
}

/** how long one pulse takes to cross, whichever way it is going */
const PULSE_MS = 540;
/** pulses in flight at once; six writes 1.6s apart never need more than two */
const TRAIL = 6;
/** the line drawing itself in, and fading out when the turn ends */
const DRAW_MS = 420;
const RETIRE_MS = 520;
/** how far inside the viewport the line stops when the frame is past its edge */
const EDGE = 24;

interface Pulse {
	readonly born: number;
	/** 1 leaves the rail, -1 comes back to it */
	readonly dir: 1 | -1;
	/** a request carries nothing and draws hollow; everything else is filled */
	readonly carrying: boolean;
}

const cubic = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
	const u = 1 - t;
	return {
		x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
		y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
	};
};

const slope = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
	const u = 1 - t;
	return {
		x: 3 * u * u * (b.x - a.x) + 6 * u * t * (c.x - b.x) + 3 * t * t * (d.x - c.x),
		y: 3 * u * u * (b.y - a.y) + 6 * u * t * (c.y - b.y) + 3 * t * t * (d.y - c.y),
	};
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
/** gentle at both ends, so a pulse leaves and arrives rather than starting at speed */
const ease = (t: number) => t * t * (3 - 2 * t);

const unit = (from: Point, to: Point): Point => {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const length = Math.hypot(dx, dy) || 1;
	return { x: dx / length, y: dy / length };
};

interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/**
 * Where the line touches the frame: the wall that faces the rail, never a point
 * floating in the middle of the picture.
 *
 * Which wall is not the wall a straight line would exit through, because the line is
 * not straight: it leaves the seam horizontally, spends its sideways travel getting
 * clear of the rail, and arrives steeper than the geometry says. So the horizontal
 * extent is weighted, which is what makes a frame sitting high and left of the port
 * take the tether on its underside — where there is empty canvas — rather than on the
 * side wall it would have to swing back up into, across whatever else is on the row.
 * The landing is held inside the middle 56% of the wall so it never reads as clipped
 * to a corner.
 */
const LEAN = 1.9;

function land(box: Box, port: Point): { at: Point; out: Point } {
	const cx = box.x + box.w / 2;
	const cy = box.y + box.h / 2;
	const dx = port.x - cx;
	const dy = port.y - cy;
	if (Math.abs(dx) / Math.max(1, box.w * LEAN) >= Math.abs(dy) / Math.max(1, box.h)) {
		const side = dx >= 0 ? 1 : -1;
		return {
			at: { x: cx + (side * box.w) / 2, y: clamp(port.y, box.y + box.h * 0.22, box.y + box.h * 0.78) },
			out: { x: side, y: 0 },
		};
	}
	const side = dy >= 0 ? 1 : -1;
	return {
		at: { x: clamp(port.x, box.x + box.w * 0.22, box.x + box.w * 0.78), y: cy + (side * box.h) / 2 },
		out: { x: 0, y: side },
	};
}

/**
 * The transcript's live rows, found the way the transcript itself finds them.
 *
 * `spool-play-rail.tsx` scrolls to `box.firstElementChild?.lastElementChild` on every
 * entry, so the log's rows already are the children of one element in entry order —
 * this reads the same list one index further back. It is a real coupling and the
 * honest cost of this direction: **the rail publishes no geometry**, so a line that
 * starts at a row has to go and find the row. What the design actually implies is a
 * rail that hands out the live row's box, and nothing here would change if it did.
 */
function rowMark(index: number): DOMRect | null {
	const log = document.querySelector(".pages-scrollbar");
	const list = log?.firstElementChild;
	const entry = list?.children.item(index);
	// the first svg inside a row is the state mark's own ring, which is where the
	// tether starts: the same 14px box that says the call is running
	const mark = entry?.querySelector("svg");
	return mark === null || mark === undefined ? null : mark.getBoundingClientRect();
}

function logBand(): DOMRect | null {
	const log = document.querySelector(".pages-scrollbar");
	return log === null ? null : log.getBoundingClientRect();
}

export function TetherLayer({
	held,
	boxes,
	still,
}: {
	held: Held | null;
	boxes: React.RefObject<Map<string, HTMLElement>>;
	/** movement is not allowed, so the line is drawn once and never travels */
	still: boolean;
}) {
	const svg = useRef<SVGSVGElement>(null);
	const line = useRef<SVGPathElement>(null);
	const port = useRef<SVGRectElement>(null);
	const cleat = useRef<SVGLineElement>(null);
	const arrow = useRef<SVGPathElement>(null);
	const off = useRef<SVGGElement>(null);
	const offMark = useRef<SVGPathElement>(null);
	const offName = useRef<SVGTextElement>(null);
	const dots = useRef<(SVGCircleElement | null)[]>([]);

	const pulses = useRef<Pulse[]>([]);
	const seen = useRef<{ key: string; count: number } | null>(null);
	const bornAt = useRef<number | null>(null);
	const goneAt = useRef<number | null>(null);
	const last = useRef<Held | null>(null);
	const [alive, setAlive] = useState(false);

	if (held !== null) last.current = held;

	// the tether outlives the row that made it by half a second, so the end of a turn
	// is the line retiring rather than the line disappearing
	useEffect(() => {
		if (held !== null) {
			goneAt.current = null;
			if (bornAt.current === null) bornAt.current = performance.now();
			setAlive(true);
			return;
		}
		if (!alive) return;
		if (goneAt.current === null) goneAt.current = performance.now();
		const timer = window.setTimeout(() => {
			setAlive(false);
			bornAt.current = null;
			pulses.current = [];
			seen.current = null;
		}, RETIRE_MS + 60);
		return () => window.clearTimeout(timer);
	}, [held, alive]);

	/*
	 * One pulse per thing that moved, never a running train.
	 *
	 * A new row is one crossing in its own direction. A run is one crossing per
	 * write, which is what makes `edit ×6` read as six: the count climbs off the
	 * capture's own cues at 1.6s, 0.6s, 0.6s, 0.8s and 1.3s apart, so the six
	 * crossings have the uneven rhythm the writes had rather than a metronome.
	 */
	useEffect(() => {
		if (held === null || still) return;
		const before = seen.current;
		seen.current = { key: held.key, count: held.count };
		if (before !== null && before.key === held.key && before.count >= held.count) return;
		const crossings = before === null || before.key !== held.key ? 1 : held.count - before.count;
		const now = performance.now();
		for (let index = 0; index < crossings; index += 1) {
			pulses.current.push({
				born: now + index * 110,
				dir: held.flow === "in" ? -1 : 1,
				carrying: held.flow !== "ask",
			});
		}
		if (pulses.current.length > TRAIL) pulses.current = pulses.current.slice(-TRAIL);
	}, [held, still]);

	useEffect(() => {
		if (!alive) return;
		let frame = 0;
		const paint = () => {
			frame = requestAnimationFrame(paint);
			const root = svg.current;
			const path = line.current;
			const seam = port.current;
			const wall = cleat.current;
			const still1 = arrow.current;
			const away = off.current;
			if (root === null || path === null || seam === null || wall === null || still1 === null || away === null) return;
			const tied = last.current;
			const node = tied === null ? null : (boxes.current.get(tied.frame) ?? null);
			const view = root.getBoundingClientRect();
			const mark = tied === null ? null : rowMark(tied.index);
			const band = logBand();
			if (tied === null || node === null || mark === null || band === null || view.width === 0) {
				root.style.opacity = "0";
				return;
			}

			const now = performance.now();
			const drawn = clamp((now - (bornAt.current ?? now)) / DRAW_MS, 0, 1);
			const leaving = goneAt.current === null ? 0 : clamp((now - goneAt.current) / RETIRE_MS, 0, 1);
			root.style.opacity = String(1 - leaving);

			// the row can be scrolled out of the log while the line still holds; the port
			// then stops at the edge of the band and says so by going quiet, because a
			// correspondence you cannot see is one the line must not claim
			const wanted = mark.top + mark.height / 2 - view.top;
			const low = band.top - view.top + 14;
			const high = band.bottom - view.top - 14;
			const at = clamp(wanted, low, high);
			const adrift = Math.abs(at - wanted) > 1;

			const from: Point = { x: view.width, y: at };
			const rect = node.getBoundingClientRect();
			const box: Box = { x: rect.left - view.left, y: rect.top - view.top, w: rect.width, h: rect.height };
			const found = land(box, from);
			const gone =
				found.at.x < EDGE || found.at.x > view.width - EDGE || found.at.y < EDGE || found.at.y > view.height - EDGE;
			const to: Point = gone
				? {
						x: clamp(found.at.x, EDGE, view.width - EDGE),
						y: clamp(found.at.y, EDGE, view.height - EDGE),
					}
				: found.at;
			const outward = gone ? unit(to, found.at) : found.out;
			const reach = Math.max(70, Math.hypot(to.x - from.x, to.y - from.y) * 0.42);
			const c1: Point = { x: from.x - reach, y: from.y };
			const c2: Point = gone
				? { x: to.x - outward.x * reach, y: to.y - outward.y * reach }
				: { x: to.x + outward.x * reach, y: to.y + outward.y * reach };

			path.setAttribute("d", `M${from.x} ${from.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`);
			const length = path.getTotalLength();
			path.setAttribute("stroke-dasharray", `${length * drawn} ${length}`);
			// working reads louder than held, and neither is the accent: `spool-play-rail.tsx`
			// keeps the thread colour for the selection, which is the one thing on screen the
			// human owns, and this is the agent's
			const weight = (tied.working ? 0.34 : 0.2) * (adrift ? 0.45 : 1);
			path.setAttribute("stroke-opacity", weight.toFixed(3));

			// the port: the row's own height, cut into the canvas side of the seam. Nothing
			// of the tether is ever drawn over the transcript
			const tall = adrift ? 10 : 26;
			seam.setAttribute("x", String(view.width - 2));
			seam.setAttribute("y", String(at - tall / 2));
			seam.setAttribute("height", String(tall));
			seam.setAttribute("opacity", ((tied.working ? 0.85 : 0.4) * (adrift ? 0.5 : 1) * drawn).toFixed(3));

			// the cleat: the same bar again, lying along the wall the line landed on, and
			// held a pixel outside it because the tether runs *under* the frames
			const along = { x: -outward.y, y: outward.x };
			const arm = gone ? 0 : 13;
			const sit = { x: to.x + outward.x * 1.5, y: to.y + outward.y * 1.5 };
			wall.setAttribute("x1", String(sit.x - along.x * arm));
			wall.setAttribute("y1", String(sit.y - along.y * arm));
			wall.setAttribute("x2", String(sit.x + along.x * arm));
			wall.setAttribute("y2", String(sit.y + along.y * arm));
			wall.setAttribute("opacity", (gone ? 0 : (tied.working ? 0.85 : 0.4) * drawn).toFixed(3));

			if (gone) {
				away.style.display = "";
				const head = offMark.current;
				const name = offName.current;
				if (head !== null) {
					const angle = (Math.atan2(outward.y, outward.x) * 180) / Math.PI;
					head.setAttribute("transform", `translate(${to.x} ${to.y}) rotate(${angle})`);
					head.setAttribute("opacity", ((tied.working ? 0.9 : 0.5) * drawn).toFixed(3));
				}
				if (name !== null) {
					name.setAttribute("x", String(to.x - along.x * 15 - outward.x * 4));
					name.setAttribute("y", String(to.y - along.y * 15 - outward.y * 4));
					name.textContent = tied.frame;
					name.setAttribute("opacity", (0.75 * drawn).toFixed(3));
				}
			} else {
				away.style.display = "none";
			}

			if (still) {
				// No travel, so the direction is one chevron parked on the line, pointing the
				// way the last call went. Near the port rather than at the middle of the curve:
				// the middle is out over the frames, where a chevron is behind one as often as
				// not, and the rail end is where the eye is when it is reading the row anyway.
				const t = 0.1;
				const spot = cubic(from, c1, c2, to, t);
				const tangent = slope(from, c1, c2, to, t);
				const face = tied.flow === "in" ? -1 : 1;
				const angle = (Math.atan2(tangent.y * face, tangent.x * face) * 180) / Math.PI;
				still1.setAttribute("transform", `translate(${spot.x} ${spot.y}) rotate(${angle})`);
				still1.setAttribute("opacity", "0.75");
				still1.setAttribute("fill", tied.flow === "ask" ? "none" : "var(--color-text)");
				still1.setAttribute("stroke-opacity", tied.flow === "ask" ? "0.75" : "0");
				for (const dot of dots.current) dot?.setAttribute("opacity", "0");
				return;
			}
			still1.setAttribute("opacity", "0");

			const live = pulses.current.filter((pulse) => now - pulse.born < PULSE_MS && now >= pulse.born).slice(-TRAIL);
			dots.current.forEach((dot, index) => {
				if (dot === null) return;
				const pulse = live[index];
				if (pulse === undefined) {
					dot.setAttribute("opacity", "0");
					return;
				}
				const part = ease(clamp((now - pulse.born) / PULSE_MS, 0, 1));
				const t = pulse.dir === 1 ? part : 1 - part;
				const spot = cubic(from, c1, c2, to, t);
				dot.setAttribute("cx", spot.x.toFixed(2));
				dot.setAttribute("cy", spot.y.toFixed(2));
				dot.setAttribute("r", pulse.carrying ? "3.1" : "2.6");
				dot.setAttribute("fill", pulse.carrying ? "var(--color-text)" : "none");
				dot.setAttribute("stroke-opacity", pulse.carrying ? "0" : "0.8");
				// a pulse fades in off the end it left and out into the end it reaches, so
				// neither the rail nor the frame is ever hit by a dot appearing on top of it
				const edge = Math.min(part, 1 - part) / 0.14;
				dot.setAttribute("opacity", clamp(edge, 0, 1).toFixed(3));
			});
		};
		frame = requestAnimationFrame(paint);
		return () => cancelAnimationFrame(frame);
	}, [alive, still, boxes]);

	if (!alive) return null;
	return (
		<svg
			ref={svg}
			className="pointer-events-none absolute inset-0 h-full w-full"
			fill="none"
			aria-hidden="true"
			style={{ opacity: 0 }}
		>
			<path ref={line} stroke="var(--color-text)" strokeWidth="1.25" strokeLinecap="round" />
			<rect ref={port} x={-2} width={2} y={0} height={26} rx={1} fill="var(--color-text)" opacity={0} />
			<line ref={cleat} stroke="var(--color-text)" strokeWidth="2" strokeLinecap="round" opacity={0} />
			<path
				ref={arrow}
				d="M-3.4 -3.6 4.2 0 -3.4 3.6Z"
				fill="var(--color-text)"
				stroke="var(--color-text)"
				strokeWidth="1.2"
				strokeLinejoin="round"
				opacity={0}
			/>
			<g ref={off} style={{ display: "none" }}>
				<path ref={offMark} d="M-2 -4.4 4.6 0 -2 4.4Z" fill="var(--color-text)" opacity={0} />
				<text
					ref={offName}
					className="font-mono text-2xs"
					fill="var(--color-muted)"
					textAnchor="middle"
					dominantBaseline="middle"
					opacity={0}
				/>
			</g>
			{Array.from({ length: TRAIL }, (_, index) => (
				<circle
					// biome-ignore lint/suspicious/noArrayIndexKey: a fixed pool of six slots, never a list
					key={index}
					ref={(node) => {
						dots.current[index] = node;
					}}
					r={3}
					fill="var(--color-text)"
					stroke="var(--color-text)"
					strokeWidth="1.2"
					opacity={0}
				/>
			))}
		</svg>
	);
}
