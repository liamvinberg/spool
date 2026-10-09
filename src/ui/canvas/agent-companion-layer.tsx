import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Camera, ProjectedFrame } from "../api";
import type { AgentCompanion, CompanionAct } from "./agent-companion";
import type { HandMark } from "./agent-hand";
import { curve, EASE, MOTION } from "./agent-motion";
import { type Box, shellRadiusOnScreen, toScreen } from "./camera";
import type { CameraStore } from "./camera-store";
import { useStillness } from "./stillness";

/**
 * The agent's companions on the canvas (#366): one small ink square per working agent.
 *
 * It replaced the agent's hand (#214), the node and thread on a frame's wall: the square is
 * the node let off the wall, and it goes to the work. While a frame's source streams it is
 * the caret at the newest line; when the frame lands it rides the picture's edge down as it
 * draws in; while the agent reads a frame it slides down its left wall with a hairline
 * behind it; it hops to the block a change landed in; four corners fly out of it while the
 * frame is photographed; a deleted frame gathers into it; and when the agent stops to ask,
 * it opens into the waiting ring. Between calls it docks on the frame's name row, where a
 * teammate's face would stand, and two seconds later dims. When the turn ends it leaves.
 *
 * Screen space, like the hand before it: a 10px square is 10px at every zoom. Where it is
 * lives in canvas units against the frame it is at, so a frame dragged mid-motion carries
 * the square with it, and the camera moving moves it on the same frame. Travel is driven
 * here frame by frame rather than by a transition, because a CSS transition between two
 * screen points is wrong the moment the camera moves under it.
 *
 * The vocabulary and every number are `design/frames/explore/agent-rail/marks`'s.
 */

/** the square's side, its halo against the canvas, and how far off the left wall it rides */
const BEAD = 10;
const HALO = 2;
const WALL = 12;
/** the frame's name row: its centre stands this far above the frame's top edge */
const NAME_ROW = 18;
/** a streamed frame holds about this many lines, which is how far down its caret is */
const FULL = 320;
/** the corners, struck just outside the frame and never closed */
const OUT = 5;
const ARM = 10;
/** how long a changed block stays ringed before the square lets go of it */
const HOLD_EDIT_MS = 1200;
/** the read's slide down the wall */
const READ_MS = 700;

const OUT_EASE = curve(EASE.out);
const IN_OUT = curve(EASE.inOut);
const LINEAR = (t: number) => t;

/** a place on a frame: a share of its size, then screen pixels off it */
interface Anchor {
	readonly ox: number;
	readonly oy: number;
	readonly dx: number;
	readonly dy: number;
}

interface Step {
	readonly to: Anchor;
	readonly ms: number;
	readonly ease: (t: number) => number;
	/** travel bows into a low arc; a slide along a wall does not */
	readonly arc: boolean;
	readonly start?: () => void;
}

const DOCK: Anchor = { ox: 1, oy: 0, dx: -BEAD / 2, dy: -NAME_ROW };
const WALL_TOP: Anchor = { ox: 0, oy: 0, dx: -WALL, dy: 0 };
const WALL_FOOT: Anchor = { ox: 0, oy: 1, dx: -WALL, dy: 0 };
/** under the frame, where an ask standing on the canvas hangs from it */
const FOOT: Anchor = { ox: 0, oy: 1, dx: 9, dy: 14 };

function caretOf(lines: number): Anchor {
	return { ox: 0.045, oy: 0.04 + 0.92 * Math.min(1, Math.max(lines, 1) / FULL), dx: -11, dy: 0 };
}

function at(anchor: Anchor, rect: Box): { x: number; y: number } {
	return { x: rect.x + anchor.ox * rect.w + anchor.dx, y: rect.y + anchor.oy * rect.h + anchor.dy };
}

export interface CompanionLayerProps {
	camera: CameraStore;
	/** the frames on the page the canvas shows */
	frames: readonly ProjectedFrame[];
	companions: readonly AgentCompanion[];
	/** the blocks writes landed in, measured by the documents showing them */
	marks: readonly HandMark[];
	/** the rail is shut, so an ask stands on the canvas under its frame and the square hangs it */
	footed: boolean;
}

export function AgentCompanionLayer({ camera, frames, companions, marks, footed }: CompanionLayerProps) {
	const byName = useMemo(() => new Map(frames.map((frame) => [frame.name, frame])), [frames]);
	/** the last place each frame stood, which is where a deleted one gathers */
	const stood = useRef(new Map<string, Box>());
	for (const frame of frames) stood.current.set(frame.name, { x: frame.x, y: frame.y, w: frame.w, h: frame.h });

	const placed = companions.filter((one) => placeOf(one, byName, stood.current) !== null);
	const shown = useLeaving(placed);
	// names only once two agents share the page: one agent is the agent, two are a team
	const named = placed.length >= 2;

	return (
		<div className="pointer-events-none absolute inset-0" aria-hidden="true" data-agent-companions="">
			{shown.map(({ companion, leaving }) => {
				const place = placeOf(companion, byName, stood.current);
				if (place === null) return null;
				const located = companion.frame === null ? null : latestMark(marks, companion.frame);
				return (
					<Companion
						key={companion.key === "" ? "main" : companion.key}
						camera={camera}
						companion={companion}
						place={place}
						located={located}
						named={named && companion.name !== null}
						footed={footed}
						leaving={leaving}
					/>
				);
			})}
		</div>
	);
}

/** where a companion stands: its frame, else the frame it just deleted, else its held spot */
function placeOf(one: AgentCompanion, frames: Map<string, ProjectedFrame>, stood: Map<string, Box>): Box | null {
	if (one.frame !== null) {
		const frame = frames.get(one.frame);
		if (frame !== undefined) return frame;
		if (one.act === "delete") return stood.get(one.frame) ?? null;
	}
	return one.spot;
}

function latestMark(marks: readonly HandMark[], frame: string): HandMark | null {
	for (let index = marks.length - 1; index >= 0; index -= 1) {
		const mark = marks[index];
		if (mark?.frame === frame) return mark;
	}
	return null;
}

/** every companion still drawn: the ones working, and the ones leaving where they stopped */
function useLeaving(now: readonly AgentCompanion[]): { companion: AgentCompanion; leaving: boolean }[] {
	const still = useStillness();
	const keys = now.map((one) => `[${one.key}]`).join("");
	const [was, setWas] = useState({ keys, now });
	const [gone, setGone] = useState<readonly AgentCompanion[]>([]);
	const here = new Set(now.map((one) => one.key));
	// adjusted while rendering, so a square that leaves is never unmounted for a frame first
	if (was.keys !== keys) {
		const left = still ? [] : was.now.filter((one) => !here.has(one.key) && !gone.some((g) => g.key === one.key));
		setWas({ keys, now });
		if (left.length > 0 || gone.some((one) => here.has(one.key)))
			setGone([...gone.filter((one) => !here.has(one.key)), ...left]);
	}
	const goneKeys = gone.map((one) => `[${one.key}]`).join("");
	// biome-ignore lint/correctness/useExhaustiveDependencies: the set leaving is the trigger
	useEffect(() => {
		if (gone.length === 0) return;
		const leaving = new Set(gone.map((one) => one.key));
		const timer = setTimeout(() => setGone((all) => all.filter((one) => !leaving.has(one.key))), MOTION.leave);
		return () => clearTimeout(timer);
	}, [goneKeys]);
	return [
		...now.map((companion) => ({ companion, leaving: false })),
		...gone.filter((one) => !here.has(one.key)).map((companion) => ({ companion, leaving: true })),
	];
}

interface Motion {
	/** where the square was when the step began, in canvas units */
	from: { x: number; y: number } | null;
	step: Step | null;
	began: number;
	queue: Step[];
	/** where it rests once the queue runs dry */
	rest: Anchor;
}

function Companion({
	camera,
	companion,
	place,
	located,
	named,
	footed,
	leaving,
}: {
	camera: CameraStore;
	companion: AgentCompanion;
	place: Box;
	located: HandMark | null;
	named: boolean;
	footed: boolean;
	leaving: boolean;
}) {
	const still = useStillness();
	const bead = useRef<HTMLDivElement | null>(null);
	const trail = useRef<HTMLSpanElement | null>(null);
	const cover = useRef<HTMLSpanElement | null>(null);
	const ring = useRef<HTMLSpanElement | null>(null);
	const ghost = useRef<HTMLSpanElement | null>(null);
	const flash = useRef<HTMLSpanElement | null>(null);
	const corners = useRef<(HTMLSpanElement | null)[]>([]);

	const latest = useRef({ place, located, camera });
	latest.current = { place, located, camera };
	const motion = useRef<Motion>({ from: null, step: null, began: 0, queue: [], rest: DOCK });
	const drawn = useRef<{ x: number; y: number } | null>(null);
	/** what the read's trail reaches down to, and whether the wipe is uncovering the frame */
	const wiping = useRef(false);
	const frame = useRef(0);
	const ticking = useRef(false);

	const [dim, setDim] = useState(false);
	const [shooting, setShooting] = useState<"out" | "in" | null>(null);
	const [ringed, setRinged] = useState<Box | null>(null);
	const [reading, setReading] = useState<"down" | "off" | null>(null);
	const [gathering, setGathering] = useState(false);
	const [drawing, setDrawing] = useState(false);

	/** one drawn frame: where the square is now, and everything that rides with it */
	const draw = (now: number): boolean => {
		const { place: box, camera: store, located: mark } = latest.current;
		const view = store.get();
		const element = bead.current;
		if (view === null || element === null) return false;
		const rect = toScreen(box, view);
		const m = motion.current;
		let busy = false;
		let point: { x: number; y: number };
		if (m.step === null && m.queue.length > 0) {
			m.step = m.queue.shift() ?? null;
			m.began = now;
			m.step?.start?.();
		}
		if (m.step !== null) {
			const step = m.step;
			const target = at(step.to, rect);
			const from = m.from === null ? target : worldToScreen(m.from, view);
			const t = step.ms <= 0 ? 1 : Math.min(1, (now - m.began) / step.ms);
			const e = step.ease(t);
			point = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e };
			if (step.arc) {
				// a low arc: it bows up by a share of the distance, never more than a square or two
				const lift = Math.min(24, Math.hypot(target.x - from.x, target.y - from.y) * 0.12);
				point.y -= Math.sin(Math.PI * t) * lift;
			}
			if (t >= 1) {
				m.from = screenToWorld(target, view);
				m.rest = step.to;
				m.step = null;
				busy = m.queue.length > 0;
			} else busy = true;
		} else point = at(m.rest, rect);
		drawn.current = screenToWorld(point, view);
		element.style.transform = `translate(${point.x - BEAD / 2}px, ${point.y - BEAD / 2}px)`;

		if (trail.current !== null) {
			trail.current.style.left = `${rect.x - WALL - 0.5}px`;
			trail.current.style.top = `${rect.y}px`;
			trail.current.style.height = `${Math.max(0, Math.min(rect.h, point.y - rect.y))}px`;
		}
		if (cover.current !== null) {
			// the picture uncovers from its top edge down, the square riding the edge
			const edge = wiping.current ? Math.max(0, Math.min(rect.h, point.y - rect.y)) : 0;
			cover.current.style.left = `${rect.x}px`;
			cover.current.style.top = `${rect.y + edge}px`;
			cover.current.style.width = `${rect.w}px`;
			cover.current.style.height = `${rect.h - edge}px`;
		}
		const fitTo = (element: HTMLElement | null, inner: Box) => {
			if (element === null) return;
			element.style.left = `${inner.x}px`;
			element.style.top = `${inner.y}px`;
			element.style.width = `${inner.w}px`;
			element.style.height = `${inner.h}px`;
		};
		fitTo(flash.current, rect);
		fitTo(ghost.current, rect);
		if (mark !== null && ring.current !== null) {
			fitTo(ring.current, {
				x: rect.x + mark.box.x * view.k - 2,
				y: rect.y + mark.box.y * view.k - 2,
				w: mark.box.w * view.k + 4,
				h: mark.box.h * view.k + 4,
			});
		}
		const radius = shellRadiusOnScreen(view.k) + OUT;
		const side = Math.max(radius, ARM);
		corners.current.forEach((corner, index) => {
			if (corner === null) return;
			const right = index === 1 || index === 2;
			const bottom = index >= 2;
			corner.style.left = `${right ? rect.x + rect.w + OUT - side : rect.x - OUT}px`;
			corner.style.top = `${bottom ? rect.y + rect.h + OUT - side : rect.y - OUT}px`;
			corner.style.width = `${side}px`;
			corner.style.height = `${side}px`;
			corner.style.setProperty(
				`border-${bottom ? "bottom" : "top"}-${right ? "right" : "left"}-radius`,
				`${radius}px`,
			);
			corner.style.setProperty("--agent-dx", `${point.x - (right ? rect.x + rect.w : rect.x)}px`);
			corner.style.setProperty("--agent-dy", `${point.y - (bottom ? rect.y + rect.h : rect.y)}px`);
		});
		return busy;
	};

	const run = () => {
		if (ticking.current) return;
		ticking.current = true;
		let asking = true;
		const tick = (now: number) => {
			ticking.current = false;
			if (!draw(now)) return;
			// a frame that came back before it was even asked for is no display frame at
			// all, and asking again from inside it would never let the clock move
			if (asking) setTimeout(run, 16);
			else run();
		};
		frame.current = requestAnimationFrame(tick);
		asking = false;
	};
	useEffect(() => () => cancelAnimationFrame(frame.current), []);

	// the camera moving moves the square on the frame it moves, without a render
	// biome-ignore lint/correctness/useExhaustiveDependencies: draw reads its inputs through refs
	useLayoutEffect(
		() =>
			camera.subscribe(() => {
				if (!ticking.current) draw(performance.now());
			}),
		[camera],
	);

	/** the queue, laid for one act; a new act replaces whatever the last one had left to do */
	const go = (steps: Step[], rest: Anchor) => {
		const m = motion.current;
		m.from = drawn.current;
		m.step = null;
		m.queue = still ? steps.map((step) => ({ ...step, ms: 0 })) : steps;
		m.rest = rest;
		if (steps.length === 0) {
			m.from = null;
		}
		run();
	};

	const act: CompanionAct = companion.act;
	const parked = act === "ask" && footed ? FOOT : DOCK;
	// biome-ignore lint/correctness/useExhaustiveDependencies: a beat is an event, and the act's motion plays once per event
	useLayoutEffect(() => {
		const first = drawn.current === null;
		const travel = (to: Anchor, ms: number = MOTION.travel): Step => ({
			to,
			ms: first ? 0 : ms,
			ease: IN_OUT,
			arc: true,
		});
		setGathering(false);
		setReading((was) => (was === null ? null : "off"));
		setShooting((was) => (was === "out" ? "in" : null));
		wiping.current = false;
		setDrawing(false);
		switch (act) {
			case "new":
				go([travel(caretOf(companion.lines))], caretOf(companion.lines));
				break;
			case "landed": {
				const ride: Step = {
					to: WALL_FOOT,
					ms: MOTION.drawIn,
					ease: OUT_EASE,
					arc: false,
					start: () => {
						wiping.current = true;
						setDrawing(true);
					},
				};
				const done: Step = {
					...travel(DOCK),
					start: () => {
						wiping.current = false;
						setDrawing(false);
					},
				};
				go([travel(WALL_TOP, MOTION.hop), ride, done], DOCK);
				break;
			}
			case "read":
				go(
					[
						travel(WALL_TOP),
						{ to: WALL_FOOT, ms: READ_MS, ease: IN_OUT, arc: false, start: () => setReading("down") },
					],
					WALL_FOOT,
				);
				break;
			case "edit":
				go([travel(cornerOf(companion, place, located), MOTION.hop)], cornerOf(companion, place, located));
				break;
			case "shot":
				go([{ ...travel(DOCK), start: () => setShooting("out") }], DOCK);
				break;
			case "delete":
				go([{ ...travel(DOCK), start: () => setGathering(true) }], DOCK);
				break;
			default:
				go([travel(parked)], parked);
		}
	}, [act, companion.beat, parked]);

	// a stream's caret glides line to line at the stream's own pace, one act however long
	const lastLine = useRef(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the line count is the trigger
	useLayoutEffect(() => {
		if (act !== "new") return;
		const now = performance.now();
		const gap = lastLine.current === 0 ? MOTION.lineIn : Math.min(MOTION.travel, now - lastLine.current);
		lastLine.current = now;
		const to = caretOf(companion.lines);
		if (motion.current.step !== null || motion.current.queue.length > 0) {
			motion.current.rest = to;
			return;
		}
		go([{ to, ms: gap, ease: LINEAR, arc: false }], to);
	}, [companion.lines]);

	// the block a change landed in is measured after the change lands: the square hops to
	// it when the measure comes, rings it, and lets go
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new mark is the trigger
	useLayoutEffect(() => {
		if (act !== "edit") return;
		const corner = cornerOf(companion, place, located);
		if (located !== null) {
			setRinged(located.box);
			go([{ to: corner, ms: MOTION.hop, ease: IN_OUT, arc: true }], corner);
		}
		const timer = setTimeout(() => {
			setRinged(null);
			go([{ to: DOCK, ms: MOTION.travel, ease: IN_OUT, arc: true }], DOCK);
		}, HOLD_EDIT_MS);
		return () => clearTimeout(timer);
	}, [act, companion.beat, located?.key]);

	// two seconds after its last call the square dims, and lights again the moment it moves
	// biome-ignore lint/correctness/useExhaustiveDependencies: a beat is a new call, which lights it again
	useEffect(() => {
		setDim(false);
		if (act !== "idle") return;
		const timer = setTimeout(() => setDim(true), MOTION.idleAfter);
		return () => clearTimeout(timer);
	}, [act, companion.beat]);

	// corners folding back into the square take their own beat to go
	useEffect(() => {
		if (shooting !== "in") return;
		const timer = setTimeout(() => setShooting(null), MOTION.cornersIn);
		return () => clearTimeout(timer);
	}, [shooting]);

	// a frame or a mark moving under a still camera is drawn moved
	// biome-ignore lint/correctness/useExhaustiveDependencies: what moved is the trigger
	useLayoutEffect(() => {
		if (!ticking.current) draw(performance.now());
	}, [place.x, place.y, place.w, place.h, located, shooting, ringed, reading, gathering, drawing]);

	const waiting = act === "ask";
	const id = companion.key === "" ? "main" : companion.key;
	return (
		<div data-agent-companion={id} data-act={act} data-frame={companion.frame ?? ""}>
			{drawing ? <span ref={cover} data-companion-cover="" className="absolute block bg-canvas" /> : null}
			{reading !== null ? (
				<span
					ref={trail}
					data-companion-trail={reading}
					className="absolute block w-px bg-muted transition-opacity duration-[1000ms] ease-[cubic-bezier(0.65,0,0.35,1)]"
					style={{ opacity: reading === "down" ? 0.6 : 0 }}
					onTransitionEnd={() => setReading((was) => (was === "off" ? null : was))}
				/>
			) : null}
			{act === "shot" ? (
				<span
					ref={flash}
					data-companion-flash=""
					className="absolute block animate-agent-flash bg-white"
					style={{ animationDelay: `${MOTION.cornersOut}ms` }}
				/>
			) : null}
			{gathering ? (
				<span ref={ghost} data-companion-ghost="" className="absolute block" style={{ borderRadius: 4 }}>
					<span
						className="absolute inset-0 block animate-agent-gather rounded-[inherit] border border-muted/50 bg-text/10"
						style={{ transformOrigin: "100% 0" }}
					/>
					<span
						className="absolute inset-0 block rounded-[inherit] border border-muted/60 border-dashed"
						style={
							still
								? undefined
								: { animation: `agent-fade-in 260ms cubic-bezier(0.22, 0.61, 0.36, 1) 220ms both` }
						}
					/>
				</span>
			) : null}
			{ringed !== null && act === "edit" ? (
				<span
					ref={ring}
					data-companion-ring=""
					className="absolute block animate-agent-ring rounded-[3px] border-[1.5px] border-white mix-blend-difference"
					style={{ opacity: 0.6 }}
				/>
			) : null}
			{shooting !== null
				? (["nw", "ne", "se", "sw"] as const).map((corner, index) => (
						<span
							key={corner}
							ref={(element) => {
								corners.current[index] = element;
							}}
							data-companion-corner={corner}
							className={`absolute block border-text ${shooting === "out" ? "animate-agent-corners-out" : "animate-agent-corners-in"}`}
							style={cornerStyle(corner)}
						/>
					))
				: null}
			<div
				ref={bead}
				className="absolute top-0 left-0"
				style={{ width: BEAD, height: BEAD, willChange: "transform" }}
			>
				<span className={`relative block size-full ${leaving ? "animate-agent-depart" : "animate-agent-arrive"}`}>
					{named ? (
						<span
							data-companion-name=""
							className="absolute top-1/2 right-full mr-1.5 -translate-y-1/2 whitespace-nowrap text-muted type-detail"
						>
							{companion.name}
						</span>
					) : null}
					{waiting ? (
						<svg
							key="waiting"
							viewBox="0 0 12 12"
							fill="none"
							aria-hidden="true"
							data-companion-waiting=""
							className="-top-[2px] -left-[2px] absolute block animate-agent-arrive rounded-full bg-canvas text-text"
							style={{ width: BEAD + 4, height: BEAD + 4 }}
						>
							<circle
								className="animate-agent-breathe"
								cx="6"
								cy="6"
								r="4.6"
								stroke="currentColor"
								strokeWidth="1.4"
							/>
							<circle cx="6" cy="6" r="2.1" fill="currentColor" />
						</svg>
					) : (
						<span
							data-companion-bead=""
							className="block size-full bg-text transition-opacity duration-[400ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]"
							style={{
								borderRadius: BEAD * 0.3,
								boxShadow: `0 0 0 ${HALO}px var(--color-canvas)`,
								opacity: dim ? 0.45 : 1,
							}}
						/>
					)}
				</span>
			</div>
		</div>
	);
}

/** one corner's two arms, drawn as the two borders that meet in it */
function cornerStyle(corner: "nw" | "ne" | "se" | "sw"): CSSProperties {
	const top = corner === "nw" || corner === "ne";
	const left = corner === "nw" || corner === "sw";
	return {
		borderStyle: "solid",
		borderWidth: 0,
		[top ? "borderTopWidth" : "borderBottomWidth"]: 2,
		[left ? "borderLeftWidth" : "borderRightWidth"]: 2,
	};
}

/** where the square stands on a change: the measured block's corner, else the lines' height */
function cornerOf(companion: AgentCompanion, place: Box, located: HandMark | null): Anchor {
	if (located !== null && place.w > 0 && place.h > 0) {
		return { ox: located.box.x / place.w, oy: located.box.y / place.h, dx: 0, dy: 0 };
	}
	const from = companion.range?.from ?? 1;
	const share = companion.lines > 0 ? Math.min(1, Math.max(0, (from - 1) / companion.lines)) : 0.4;
	return { ox: 0, oy: share, dx: 0, dy: 0 };
}

function worldToScreen(point: { x: number; y: number }, view: Camera) {
	return { x: point.x * view.k + view.x, y: point.y * view.k + view.y };
}

function screenToWorld(point: { x: number; y: number }, view: Camera) {
	return { x: (point.x - view.x) / view.k, y: (point.y - view.y) / view.k };
}
