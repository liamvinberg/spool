import { useMemo } from "react";
import type { FlowEdge, FlowUnreadable, ProjectedFrame } from "../api";
import { pageLabel, pageOf } from "./pages";

/**
 * The walk layer (#151, resolving #146): the flow map draws everything it
 * knows, always. Same-page edges are the arrows (#34) and stay them. Two facts
 * the map holds and no arrow can reach are drawn here instead, at rest, on
 * every frame that has them.
 *
 * **A walk that leaves the page docks on the frame that declares it**: a short
 * leader off the wall — anchor dot, hairline, one bend — running into a bare
 * mono tag, `checkout · shop`. A tag is ink at rest and a surface under the
 * pointer, because pressing one travels, and a thing that travels has to look
 * pressable while you are about to press it and not before.
 *
 * **A walk that lands nowhere is the same object, fault-toned.** Its leader
 * stops short of its tag — the gap is the unpressable tell — with a crossed
 * terminator, and the tag reports rather than points: `chekout` struck when no
 * frame answers to the name, `nav.tsx:12` when the parser could not read the
 * site. Grey at full text strength, never the accent: the accent belongs to
 * the selection, and on a healthy canvas the only loud thing is a fault.
 *
 * **Below readable width the tags degrade to wall nubs**, the same law the
 * covers already follow. A tag is screen size and the frame under it is not,
 * so past the point where the words are wider than the rectangle they label
 * they stop labelling it and start covering the page. Fault nubs keep the
 * cross: faults read at survey distance, exits read per frame, and that
 * asymmetry is the model.
 *
 * `verified` gets no face. The data stays in the graph and the CLI.
 */

/** A walk out of this page: an address, and pressing it travels. */
export interface WalkExit {
	kind: "exit";
	/** The frame declaring it — a mark belongs to a rectangle, never to the field. */
	frame: string;
	target: string;
	/** The page the target sits on, as chrome spells it. */
	page: string;
	certainty: FlowEdge["certainty"];
}

/** A walk with nothing at the other end. Which kind of broken lives in the words. */
export interface WalkFault {
	kind: "fault";
	frame: string;
	/** What the tag prints: the name nothing answers to, or `file:line`. */
	name: string;
	why: "missing" | "unreadable";
	/** The dark site's design-relative file — the tag prints only its basename. */
	path?: string;
}

export type Walk = WalkExit | WalkFault;

/** The widest tag the layer draws: `→ checkout · shop` at 10px mono with its padding. */
export const WIDEST_TAG = 118;

/* ---------- the leader's geometry, in screen pixels ---------- */

/** The arrows own the wall's mid-height; the leaders dock under that channel. */
const ANCHOR_DROP = 25;
/** The diagonal step off the wall, where the one bend lands. */
const BEND = 11;
/** Where the leader ends: docked short, a third of the reach a coaching leader takes. */
const REACH = 20;
/** A fault's stop stands off its tag; closer reads as punctuation, not as a line ending. */
const TERM_GAP = 9;
/** The tag row starts just above its first anchor, so the first leader has a bend to make. */
const TAG_LIFT = 4;
/** Walks on one wall stack: one tag plus the gap between two. */
const TAG_STEP = 21;
/** The anchors sit tighter than the tags — the wall is short and the fan does the spreading. */
const ANCHOR_STEP = 13;
/** A stub stack, where six pixels of fan is a fan nobody can read. */
const NUB_STEP = 6;
const NUB_LEN = 10;
const NUB_FAULT_LEN = 8;

/** A tag is the label row's line box, so a tag and a name read as one family. */
export const TAG_HEIGHT = 18;

/** One walk, from its frame's coordinates into the canvas's. */
export interface PlacedWalk {
	key: string;
	walk: Walk;
	/** The anchor dot, on the wall. */
	ax: number;
	ay: number;
	/** The leader's far end: where a tag begins, or where a broken walk stops. */
	ex: number;
	ey: number;
	/** Where the tag's box starts — a fault's sits past its stop. */
	tagX: number;
	/** The leader, as one path. */
	d: string;
	/** A broken walk carries the cross, at every size. */
	stop: boolean;
}

export interface FrameWalks {
	frame: string;
	/** Below readable, the words go and the stub stays. */
	size: "readable" | "nub";
	marks: PlacedWalk[];
}

/**
 * When a tag stops being worth its ink.
 *
 * The rule scales itself rather than naming a zoom: a tag is screen size and
 * the frame it docks to is not, so the crossover is where the words become
 * wider than the rectangle they belong to. A 390-wide frame reaches it at 30%,
 * under the 41% a page is read at and well over the 15% one is surveyed at.
 */
export function walkSize(frameWidth: number, k: number): FrameWalks["size"] {
	return frameWidth * k >= WIDEST_TAG ? "readable" : "nub";
}

/**
 * What this page knows and cannot draw as an arrow.
 *
 * Both halves are read off the derived graph and nothing else: an edge whose
 * far end is not on this page, and an edge or a site that lands nowhere at
 * all. A frame that is not on the page contributes nothing — its own page
 * draws its marks, where the frame is.
 */
export function walksOf(
	edges: readonly FlowEdge[],
	unreadable: readonly FlowUnreadable[],
	here: readonly ProjectedFrame[],
	all: readonly ProjectedFrame[],
): Walk[] {
	const onPage = new Set(here.map((frame) => frame.name));
	const pageByName = new Map(all.map((frame) => [frame.name, pageOf(frame)]));
	const exits: WalkExit[] = [];
	const missing: WalkFault[] = [];
	const dark: WalkFault[] = [];

	for (const edge of edges) {
		if (!onPage.has(edge.from) || edge.from === edge.to) continue;
		const page = pageByName.get(edge.to);
		if (edge.missing === true || page === undefined) {
			missing.push({ kind: "fault", frame: edge.from, name: edge.to, why: "missing" });
			continue;
		}
		// the same page is an arrow's job, and the arrow is already drawing it
		if (onPage.has(edge.to)) continue;
		exits.push({ kind: "exit", frame: edge.from, target: edge.to, page: pageLabel(page), certainty: edge.certainty });
	}

	// one dark line is one report, however many sites of it share the line
	const seen = new Set<string>();
	for (const site of unreadable) {
		if (!onPage.has(site.frame)) continue;
		const at = `${site.frame}\0${site.path}:${site.line}`;
		if (seen.has(at)) continue;
		seen.add(at);
		dark.push({
			kind: "fault",
			frame: site.frame,
			name: `${basename(site.path)}:${site.line}`,
			why: "unreadable",
			path: site.path,
		});
	}

	// exits first, so a fault is always the last thing on a wall
	return [
		...exits.sort(byFrameThen((walk) => walk.target)),
		...missing.sort(byFrameThen((walk) => walk.name)),
		...dark.sort(byFrameThen((walk) => walk.name)),
	];
}

function byFrameThen<T extends Walk>(key: (walk: T) => string): (a: T, b: T) => number {
	return (a, b) => a.frame.localeCompare(b.frame) || key(a).localeCompare(key(b));
}

/** The file a design-relative path names — a tag has room for the name, not the road. */
function basename(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * Every mark's place, in world space.
 *
 * The whole block is measured off the frame's own box, so it travels with a
 * drag and survives a reflow. World measures divide by the camera, which is
 * what holds a leader at one weight and a tag at one size through the zoom.
 *
 * Marks dock on the right wall at every size. The side is a property of a
 * frame's situation rather than of the mark, but a side that recomputes is a
 * side that flips mid-drag, and that motion is undesigned (#146).
 */
export function placeWalks(walks: readonly Walk[], frames: readonly ProjectedFrame[], k: number): FrameWalks[] {
	const byName = new Map(frames.map((frame) => [frame.name, frame]));
	const grouped = new Map<string, Walk[]>();
	for (const walk of walks) {
		if (!byName.has(walk.frame)) continue;
		const list = grouped.get(walk.frame);
		if (list === undefined) grouped.set(walk.frame, [walk]);
		else list.push(walk);
	}

	const layers: FrameWalks[] = [];
	for (const [name, list] of grouped) {
		const frame = byName.get(name);
		if (frame === undefined) continue;
		const size = walkSize(frame.w, k);
		const wall = frame.x + frame.w;
		const top = frame.y + frame.h / 2 + ANCHOR_DROP / k;
		layers.push({
			frame: name,
			size,
			marks: list.map((walk, index) =>
				size === "nub" ? nub(walk, wall, top + (index * NUB_STEP) / k, k) : tag(walk, index, wall, top, k),
			),
		});
	}
	return layers;
}

/** A leader with words at the end of it: one bend, and a stack that fans. */
function tag(walk: Walk, index: number, wall: number, top: number, k: number): PlacedWalk {
	const stop = walk.kind === "fault";
	const ay = top + (index * ANCHOR_STEP) / k;
	const ey = top + (index * TAG_STEP - TAG_LIFT) / k;
	const bx = wall + BEND / k;
	const ex = wall + REACH / k;
	return {
		key: keyOf(walk),
		walk,
		ax: wall,
		ay,
		ex,
		ey,
		tagX: stop ? ex + TERM_GAP / k : ex,
		d: `M ${round(wall)} ${round(ay)} L ${round(bx)} ${round(ey)} L ${round(ex)} ${round(ey)}`,
		stop,
	};
}

/**
 * The leader with its words taken away: no bend, because there is nothing to
 * bend towards, and no fan, because the stack is six pixels tall. What
 * survives is that walks leave this wall and how many — and, on a fault, the
 * stop, at exactly the size it had when the words were still there.
 */
function nub(walk: Walk, wall: number, y: number, k: number): PlacedWalk {
	const stop = walk.kind === "fault";
	const ex = wall + (stop ? NUB_FAULT_LEN : NUB_LEN) / k;
	return {
		key: keyOf(walk),
		walk,
		ax: wall,
		ay: y,
		ex,
		ey: y,
		tagX: ex,
		d: `M ${round(wall)} ${round(y)} L ${round(ex)} ${round(y)}`,
		stop,
	};
}

/**
 * A mark's identity. A fault keys on its source path rather than the words it
 * prints: a tag shows the file's basename, so two dark lines at the same line
 * of two same-named files would otherwise collide into one mark.
 */
function keyOf(walk: Walk): string {
	if (walk.kind === "exit") return `exit\0${walk.frame}\0${walk.target}`;
	return `fault\0${walk.frame}\0${walk.path ?? ""}\0${walk.name}`;
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/* ---------- the marks a leader carries ---------- */

/**
 * The certainty mark: the canvas's own edge, one row long. Solid for a walk
 * that will be taken, the same stroke broken for one inside a branch — drawn
 * rather than set, because `→` and `⇢` are two characters a mono face renders
 * at two different weights and the difference has to be the dashes.
 */
function EdgeMark({ certain }: { certain: boolean }) {
	return (
		<svg
			viewBox="0 0 10 8"
			className={`h-2 w-2.5 shrink-0 ${certain ? "text-muted/80" : "text-muted/45"}`}
			fill="none"
			aria-hidden="true"
		>
			<path d="M0.5 4h6" stroke="currentColor" strokeWidth="1.5" strokeDasharray={certain ? undefined : "2 2"} />
			<path d="m9.5 4-3-1.8v3.6Z" fill="currentColor" />
		</svg>
	);
}

/**
 * The stop, at the end of a leader that goes nowhere. One shape for both kinds
 * of fault: which kind it is belongs to the words, where the difference is
 * actionable, and the stop only has to survive to the far side of the page.
 */
function Terminator({ x, y, k }: { x: number; y: number; k: number }) {
	const arm = 3.6 / k;
	return (
		<path
			d={`M${round(x - arm)} ${round(y - arm)}L${round(x + arm)} ${round(y + arm)}M${round(x + arm)} ${round(y - arm)}L${round(x - arm)} ${round(y + arm)}`}
			stroke="var(--color-muted)"
			strokeWidth={1.4 / k}
			strokeLinecap="round"
		/>
	);
}

/* ---------- the tags ---------- */

/**
 * A tag's box: welded to world geometry, drawn at screen size.
 *
 * The camera scales this layer, so the tag counter-scales by 1/k — the frame
 * label's own trick, one layer out. Its own half-height translate runs before
 * that scale, so the words centre on the leader's end at every zoom rather
 * than drifting off it as the camera moves.
 *
 * `bg-canvas` rather than nothing, so a tag that lands over a neighbour on a
 * page somebody packed tighter than this one stays readable instead of
 * becoming two fonts on top of each other. On open canvas it is invisible.
 */
function tagBox(placed: PlacedWalk, k: number): React.CSSProperties {
	return {
		left: placed.tagX,
		top: placed.ey,
		transform: `scale(${1 / k}) translateY(-50%)`,
		transformOrigin: "0 0",
		height: TAG_HEIGHT,
	};
}

function ExitTag({
	placed,
	exit,
	k,
	onOpen,
}: {
	placed: PlacedWalk;
	exit: WalkExit;
	k: number;
	onOpen: (target: string) => void;
}) {
	return (
		<button
			type="button"
			data-walk-exit={exit.target}
			title={`go to ${exit.target} on ${exit.page}`}
			// the canvas owns the pointer everywhere else: a press here is this
			// tag's, never the start of a marquee over the frame behind it
			onPointerDown={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onClick={() => onOpen(exit.target)}
			className="absolute flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xs bg-canvas px-1.5 font-mono text-2xs leading-3 transition-colors duration-150 hover:bg-surface"
			style={tagBox(placed, k)}
		>
			<EdgeMark certain={exit.certainty === "will"} />
			<span className="text-text/85">{exit.target}</span>
			<span className="text-muted/40">·</span>
			<span className="text-muted/70">{exit.page}</span>
		</button>
	);
}

/**
 * Not a button: there is nowhere to go, which is what the leader's own gap
 * already says. Full text strength, and the name struck when nothing answers
 * to it.
 */
function FaultTag({ placed, fault, k }: { placed: PlacedWalk; fault: WalkFault; k: number }) {
	return (
		<div
			data-walk-fault={fault.why}
			title={
				fault.why === "missing"
					? `no frame answers to ${fault.name}`
					: `${fault.path} — spool cannot read this destination`
			}
			className="pointer-events-none absolute flex items-center gap-2 whitespace-nowrap bg-canvas px-1.5 font-mono text-2xs leading-3"
			style={tagBox(placed, k)}
		>
			<span className={`text-text ${fault.why === "missing" ? "line-through decoration-text/55" : ""}`}>
				{fault.name}
			</span>
			<span className="text-muted/75">{fault.why}</span>
		</div>
	);
}

/* ---------- the layer ---------- */

/**
 * Every leader on the page in one coordinate space, over the frames, with the
 * tags over them in turn. The leaders sit above the covers rather than under
 * them the way the arrows do, because a leader is 20 pixels long and would
 * otherwise vanish under the very frame it docks to. One SVG rather than one
 * per frame: a leader leaves its frame's box by design, and a stack of
 * overflowing SVGs is a stack of z-index arguments nobody wins.
 */
export function WalkLayer({
	walks,
	frames,
	k,
	onOpen,
}: {
	walks: readonly Walk[];
	frames: readonly ProjectedFrame[];
	k: number;
	/** Pressing an exit tag travels: page follows, arrival centred, target selected. */
	onOpen: (target: string) => void;
}) {
	const layers = useMemo(() => placeWalks(walks, frames, k), [walks, frames, k]);
	if (layers.length === 0) return null;

	const marks = layers.flatMap((layer) => (layer.size === "nub" ? [] : layer.marks));
	return (
		<>
			<svg
				aria-hidden="true"
				width="1"
				height="1"
				className="pointer-events-none absolute top-0 left-0"
				style={{ overflow: "visible" }}
			>
				{layers.map((layer) =>
					layer.marks.map((placed) => (
						<g key={`${layer.frame}\0${placed.key}`} fill="none">
							<path
								d={placed.d}
								stroke={placed.stop ? FAULT_HAIRLINE : EXIT_HAIRLINE}
								strokeWidth={(layer.size === "nub" ? 1.25 : 1) / k}
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
							<circle
								cx={placed.ax}
								cy={placed.ay}
								r={(layer.size === "nub" ? 1.5 : 2.5) / k}
								fill="var(--color-muted)"
								// a nub is the only thing left on its wall, so it carries one
								// weight; at readable size the fault's dot is the heavier ink
								fillOpacity={layer.size === "nub" ? 0.8 : placed.stop ? 1 : 0.85}
							/>
							{placed.stop && (
								<Terminator x={layer.size === "nub" ? placed.ex + 3 / k : placed.ex} y={placed.ey} k={k} />
							)}
						</g>
					)),
				)}
			</svg>
			{marks.map((placed) =>
				placed.walk.kind === "exit" ? (
					<ExitTag key={placed.key} placed={placed} exit={placed.walk} k={k} onOpen={onOpen} />
				) : (
					<FaultTag key={placed.key} placed={placed} fault={placed.walk} k={k} />
				),
			)}
		</>
	);
}

/** The hairline's two strengths — a fault is heavier ink, never a different colour. */
const EXIT_HAIRLINE = "color-mix(in srgb, var(--color-text) 30%, transparent)";
const FAULT_HAIRLINE = "color-mix(in srgb, var(--color-text) 55%, transparent)";
