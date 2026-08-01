import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { Camera, ProjectedFrame } from "../api";
import { type Hand, type HandMark, PLATE_DRAWN } from "./agent-hand";

/**
 * The five objects of the agent's hand, drawn over the field (#214).
 *
 * Screen space, like the selection furniture beside it and for the same reason: a
 * hairline is a hairline at every zoom, and a stand-off measured in world units would be
 * a mile wide at overview and invisible at 400%. The one thing that comes out of the
 * field is a located box, because a plate is the block's own rectangle and that lives in
 * the document.
 *
 * **Nothing here fades in. Everything is drawn on from where it means something.** The
 * thread winds off the node and back onto it — two halves of one line, each growing from
 * the node outward — so taking hold and letting go are the same gesture in two
 * directions. The corners stroke on from their own arms and never close, because a closed
 * rectangle outside a frame is the selection ring `SelectionOverlay` already draws. The
 * plate opens from the block's own centre. A fade has no origin, and every one of these
 * objects has a place it comes from.
 *
 * The vocabulary and every number in it are argued in `design/frames/agent/agent-hand`.
 */

/** how far outside the wall the node's centre sits, and the thread's line with it */
const OUT = 12;
/** the corners are decoupled, because they are struck around the whole box while the
 * frame's name sets in a 12px line box ending 5 pixels above it */
const OUT_SHOT = 4;
const THREAD = 2;
/** a change is a segment: a write is somewhere in the file rather than all of it */
const PART = 76;
const NODE = 9;
const INK = 0.78;
const ARM = 11;
/** slack amplitude, and the wavelength it runs at */
const SLACK = 4;
const WAVE = 46;
/** a write plucks a line that is already taut, and never changes its length */
const PLUCK = 1.6;
/** tension arrives on the instant and slack comes back slowly, which is what a thread does */
const TAUT_MS = 90;
const SLACK_MS = 320;
const POSTURE_MS = 220;
const PLUCK_MS = 240;
/** taking hold and letting go, one gesture in two directions. The rule itself is in
 * `ui.css` with the rest of the motion; this is how long the layer holds a hand that
 * has let go, so the gesture has something to run on */
export const WIND_MS = 240;

/** the lane's own claim, against the frame's edge and inside everything else */
const MARK_IN = 2;
const MARK_W = 3;

/**
 * The plate's ink, which is the one mark here that is not spool's own.
 *
 * Every other object stands on the canvas, so it is drawn in `--color-text` and reads
 * against the dark surface behind it. The plate stands on a design, and a design is
 * whatever somebody made — so it takes the canonical frame's own tone, which darkens the
 * block rather than lifting it. Spool's ink here would be a near-white wash that does
 * least where a design is lightest, which is where most of them are.
 */
const TINT = "#17171A";

/**
 * How many points each half of the wall run is sampled at.
 *
 * Fixed, and that is the constraint everything else here bends to: `d` interpolates in CSS
 * only between paths built the same way, and the thread's length and tension both live
 * inside `d`. A count that grew with the thread would make every posture change a jump.
 *
 * So the count is set by the density the curve needs at its worst rather than by the
 * length. The wave is 46px whatever the thread is doing, and a sine needs roughly ten
 * points per period before the polyline stops reading as a polygon — at 160 that holds out
 * to a thread 1,280px tall, which is past any frame anybody is looking at the whole of.
 * The canonical frame samples every 4px and this is 4px at a 640px half.
 */
const STEPS = 160;

interface Wall {
	/** the thread's line, outside the frame's own edge */
	readonly line: number;
	/** the frame's vertical middle, where the node is welded */
	readonly mid: number;
}

/**
 * Which edge the hand stands at.
 *
 * The frame's left, always. The nearer edge to the viewport's centre would follow the
 * camera around, and a thread that swapped sides on a pan would read as the agent moving
 * — the wall is a place, not a preference.
 */
function wallOf(rect: { x: number; y: number; w: number; h: number }): Wall {
	return { line: rect.x - OUT, mid: rect.y + rect.h / 2 };
}

/**
 * One half of the wall run, sampled from the node outward — **around the origin, never
 * where it stands**.
 *
 * Two halves rather than one line, because that is what lets the thread wind off the node
 * and back onto it: each half grows from its own first point, and its own first point is
 * the node. A sine displaces it with a zero at the node itself, so the two halves meet as
 * one thread rather than as two lines that happen to touch.
 *
 * Shape only, and that is load-bearing. This path is the one thing here that eases between
 * its own states, so anything inside it eases too — and where the frame *is* must never
 * ease. Put the wall's coordinates in here and the thread swims after the camera for a
 * fifth of a second on every pan. The group's own transform carries the place instead, and
 * a transform is not in the transition.
 */
function halfPath(length: number, amp: number, dir: 1 | -1): string {
	const half = Math.max(0, length) / 2;
	const points: string[] = [];
	for (let step = 0; step <= STEPS; step += 1) {
		const y = dir * ((half * step) / STEPS);
		// away from the frame, since the wall is its left edge
		const x = -amp * Math.sin((2 * Math.PI * y) / WAVE);
		points.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
	}
	return `M ${points.join(" L ")}`;
}

/** the four arcs, each struck from its own arm and stopping short of closing */
function cornerPaths(rect: { x: number; y: number; w: number; h: number }, radius: number): string[] {
	const r = radius + OUT_SHOT;
	const x0 = rect.x - OUT_SHOT;
	const x1 = rect.x + rect.w + OUT_SHOT;
	const y0 = rect.y - OUT_SHOT;
	const y1 = rect.y + rect.h + OUT_SHOT;
	return [
		`M ${x0} ${y0 + r + ARM} V ${y0 + r} A ${r} ${r} 0 0 1 ${x0 + r} ${y0} H ${x0 + r + ARM}`,
		`M ${x1 - r - ARM} ${y0} H ${x1 - r} A ${r} ${r} 0 0 1 ${x1} ${y0 + r} V ${y0 + r + ARM}`,
		`M ${x1} ${y1 - r - ARM} V ${y1 - r} A ${r} ${r} 0 0 1 ${x1 - r} ${y1} H ${x1 - r - ARM}`,
		`M ${x0 + r + ARM} ${y1} H ${x0 + r} A ${r} ${r} 0 0 1 ${x0} ${y1 - r} V ${y1 - r - ARM}`,
	];
}

export function AgentHandLayer({
	camera,
	frames,
	hand,
	marks,
	shellRadius,
}: {
	camera: Camera;
	frames: readonly ProjectedFrame[];
	/** where the agent is, or null when nobody is at any frame */
	hand: Hand | null;
	/** every located write still on screen, in the order they landed */
	marks: readonly HandMark[];
	shellRadius: number;
}) {
	const k = camera.k;
	const held = useWindOff(hand);
	const byName = new Map(frames.map((frame) => [frame.name, frame]));
	const screenRect = (frame: ProjectedFrame) => ({
		x: frame.x * k + camera.x,
		y: frame.y * k + camera.y,
		w: frame.w * k,
		h: frame.h * k,
	});

	return (
		<div className="pointer-events-none absolute inset-0" aria-hidden="true" data-agent-hand="">
			{marks.map((mark) => {
				const frame = byName.get(mark.frame);
				if (frame === undefined) return null;
				const rect = screenRect(frame);
				const top = rect.y + mark.box.y * k;
				const height = mark.box.h * k;
				return (
					<div key={mark.key}>
						{/* the plate: the block itself, tinted and drained. The one place the hand
						    puts ink on the design rather than in the seam beside it, which is why
						    it is severable — see `PLATE_DRAWN` */}
						{PLATE_DRAWN ? (
							<span
								data-hand-plate={mark.frame}
								className="animate-hand-plate absolute block rounded-[3px]"
								style={{ background: TINT, left: rect.x + mark.box.x * k, top, width: mark.box.w * k, height }}
							/>
						) : null}
						{/* the lane: the run's ledger, at the height the write landed at. Ink
						    carries the age and width carries it again, so a stale mark reads as
						    residue rather than as a live one somebody drew faintly */}
						<span
							data-hand-lane={mark.frame}
							className="animate-hand-lane absolute block rounded-[1px] bg-text"
							style={{ left: rect.x - MARK_IN - MARK_W, top, height: Math.max(4, height), width: MARK_W }}
						/>
					</div>
				);
			})}
			{held.map((one) => {
				const at = byName.get(one.hand.frame);
				if (at === undefined) return null;
				return (
					<Held
						key={one.hand.frame}
						hand={one.hand}
						going={one.going}
						rect={screenRect(at)}
						radius={Math.min(12, shellRadius * k)}
					/>
				);
			})}
		</div>
	);
}

/**
 * The presence: one frame, one thread, one node, and the corners while it is being
 * photographed.
 *
 * Two numbers and one line. Length is the hold and moves at the pace a posture changes;
 * amplitude is the pull and moves at the pace a call opens. Both live inside the path,
 * which is why the sample count is fixed — `d` interpolates between paths of the same
 * shape and jumps between paths of different ones.
 */
function Held({
	hand,
	going,
	rect,
	radius,
}: {
	hand: Hand;
	/** the turn is over: the thread is winding back onto the node */
	going: boolean;
	rect: { x: number; y: number; w: number; h: number };
	radius: number;
}) {
	const wall = wallOf(rect);
	const live = hand.verb !== null;
	// a photograph takes the ink off the wall entirely and puts it around the frame
	const length = hand.picturing ? 0 : hand.hold === "whole" ? rect.h : Math.min(PART, rect.h);
	// a write is a pluck on a line that is already taut, never a change of length: the
	// posture channel says what kind of hold this is and an event must not spend it
	const struck = usePluck(hand.count) && live;
	const amp = struck ? PLUCK : live ? 0 : SLACK;
	const ms = usePace(length, struck, live);

	const corners = cornerPaths(rect, radius);

	return (
		<>
			<svg
				className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
				fill="none"
				aria-hidden="true"
			>
				{/* the thread stands here and is shaped in its own coordinates: the place is a
				    transform and moves with the camera on the frame it moves, and only the shape
				    is inside the eased path */}
				<g data-hand-wall={hand.frame} transform={`translate(${wall.line} ${wall.mid})`}>
					{([1, -1] as const).map((dir) => {
						const d = halfPath(length, amp, dir);
						return (
							<path
								key={dir}
								className="animate-hand-wind"
								data-hand-thread={dir}
								d={d}
								// `pathLength` normalizes the dash to the run, so one rule winds a
								// full-height thread and a 76px one at the same pace
								pathLength={1}
								strokeDasharray={1}
								strokeDashoffset={going ? 1 : 0}
								stroke="var(--color-text)"
								strokeOpacity={INK}
								strokeWidth={THREAD}
								strokeLinecap="round"
								style={{ d: `path("${d}")`, "--hand-pace": `${ms}ms` } as CSSProperties}
							/>
						);
					})}
				</g>
				{/* the `shot` posture: four corners at their own stand-off, struck on from their
				    arms and never closing */}
				{corners.map((path) => (
					<path
						key={path}
						data-hand-corner=""
						d={path}
						stroke="var(--color-text)"
						strokeOpacity={0.75}
						strokeWidth={1.5}
						strokeLinecap="round"
						pathLength={1}
						strokeDasharray={1}
						strokeDashoffset={hand.picturing && !going ? 0 : 1}
						style={{ "--hand-pace": hand.picturing ? "260ms" : "200ms" } as CSSProperties}
					/>
				))}
			</svg>
			{/* the node: the participant itself, drawn last so nothing crosses it. It never
			    changes, because being at a frame is not a state with degrees */}
			<span
				data-hand-node={hand.frame}
				className="animate-hand-node absolute rounded-[2px] border border-muted bg-canvas"
				style={{
					width: NODE,
					height: NODE,
					left: wall.line - NODE / 2,
					top: wall.mid - NODE / 2,
					opacity: going ? 0 : 1,
					transform: going ? "scale(0.4)" : undefined,
				}}
			/>
		</>
	);
}

/**
 * The hands on screen: the one that has hold, and the one still letting go.
 *
 * React would take a presence away the instant its frame stopped being the one, and a mark
 * that disappears has no more origin than one that fades in. So the hand that is done
 * stays for the length of the gesture with `going` set, which is the winding-on run
 * backwards — and there are two of them exactly while the agent moves from one frame to
 * the next, which is what letting go there and taking hold here looks like.
 *
 * **The leaving hand is decided during render and not in an effect**, which is the whole
 * of why the gesture runs at all. An effect notices the change one commit late, and that
 * one commit has nothing drawn in it: React takes the element out and puts a fresh one
 * back, and a fresh thread mounts already wound off, so letting go is a disappearance.
 * Adjusting state during render is React's own answer for a value derived from the last
 * one, and here it keeps the element the transition is running on alive.
 *
 * `was` holds a whole hand rather than a name because a thread has to retract from the
 * shape it had; it is compared by frame, so a posture changing ten times a second moves
 * nothing here.
 */
function useWindOff(hand: Hand | null): { hand: Hand; going: boolean }[] {
	const at = hand?.frame ?? null;
	const [was, setWas] = useState<Hand | null>(hand);
	const [going, setGoing] = useState<Hand | null>(null);

	if ((was?.frame ?? null) !== at) {
		if (was !== null) setGoing(was);
		setWas(hand);
	}

	useEffect(() => {
		if (going === null) return;
		const timer = setTimeout(() => setGoing((now) => (now === going ? null : now)), WIND_MS);
		return () => clearTimeout(timer);
	}, [going]);

	// a hand that came back to the frame it was leaving is not leaving it
	const letting = going !== null && going.frame !== at ? [{ hand: going, going: true }] : [];
	return hand === null ? letting : [...letting, { hand, going: false }];
}

/**
 * How fast the line moves, chosen by which of its two channels moved.
 *
 * Length and amplitude are one animated property here — they are both inside the path —
 * so the pace has to be picked rather than declared per channel. Which is not a
 * compromise as long as it is picked by what actually changed: a posture takes 220ms and
 * is the slower of the two, so it wins whenever the length moved. When only the pull
 * moved, the thread gets its own numbers, and they are not symmetric on purpose —
 * **tension arrives over 90ms and slack comes back over 320**, because five of the twelve
 * calls in the capture run under 320ms and a symmetric channel blinks twelve times in
 * thirty-seven seconds. A pluck is faster than either.
 */
function usePace(length: number, struck: boolean, live: boolean): number {
	const before = useRef(length);
	const moved = before.current !== length;
	before.current = length;
	if (struck) return PLUCK_MS / 2;
	if (moved) return POSTURE_MS;
	return live ? TAUT_MS : SLACK_MS;
}

/**
 * Whether the thread is mid-pluck, which is true for one beat after each landed call.
 *
 * A count rather than a clock: the run's own number is what the rail prints as `×6`, and
 * every increment of it is a call reaching its end. The flag falls on its own so the line
 * eases back to whatever tension the posture asks for.
 */
function usePluck(count: number): boolean {
	const [struck, setStruck] = useState(false);
	const seen = useRef(count);
	useEffect(() => {
		if (count === seen.current || count === 0) {
			seen.current = count;
			return;
		}
		seen.current = count;
		setStruck(true);
		const timer = setTimeout(() => setStruck(false), PLUCK_MS / 2);
		return () => clearTimeout(timer);
	}, [count]);
	return struck;
}
