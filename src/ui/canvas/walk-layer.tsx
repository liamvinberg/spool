import { useMemo } from "react";
import type { FlowEdge, ProjectedFrame } from "../api";
import { pageLabel, pageOf } from "./pages";

/**
 * The walk layer (#151, amended by #203): the canvas draws the walks you can
 * take. Same-page edges are the arrows (#34) and stay them; a walk that leaves
 * the page is drawn here, at rest, on every frame that has one.
 *
 * **An off-page walk docks on the frame that declares it**: a short leader off
 * the wall — anchor dot, hairline, one bend — running into a bare mono tag,
 * `checkout · shop`. A tag is ink at rest and a surface under the pointer,
 * because pressing one travels, and a thing that travels has to look pressable
 * while you are about to press it and not before.
 *
 * **Below readable width the tags degrade to wall nubs**, the same law the
 * covers already follow. A tag is screen size and the frame under it is not,
 * so past the point where the words are wider than the rectangle they label
 * they stop labelling it and start covering the page. What survives the
 * degrade is which frames leave this page and how many.
 *
 * **A broken walk gets no face**, and neither does `verified` (#203). #151
 * shipped one, drawn against a mistyped frame name — rare, and worth being
 * loud about. The dogfood canvas then showed what the real case is: a walk to
 * a frame nobody has drawn yet. Eight marks on one page, five distinct names,
 * not one of them a mistake. A canvas draws what you can act on, and the fix
 * for a dead walk is in source, which is the agent's surface. It stays in the
 * derived graph, in `spool flows`, and in what an agent reads.
 */

/** A walk out of this page: an address, and pressing it travels. */
export interface Walk {
	/** The frame declaring it — a mark belongs to a rectangle, never to the field. */
	frame: string;
	target: string;
	/** The page the target sits on, as chrome spells it. */
	page: string;
	certainty: FlowEdge["certainty"];
}

/** The widest tag the layer draws: `→ checkout · shop` at 10px mono with its padding. */
export const WIDEST_TAG = 118;

/* ---------- the leader's geometry, in screen pixels ---------- */

/** The arrows own the wall's mid-height; the leaders dock under that channel. */
const ANCHOR_DROP = 25;
/** The diagonal step off the wall, where the one bend lands. */
const BEND = 11;
/** Where the leader ends: docked short, a third of the reach a coaching leader takes. */
const REACH = 20;
/** The tag row starts just above its first anchor, so the first leader has a bend to make. */
const TAG_LIFT = 4;
/** Walks on one wall stack: one tag plus the gap between two. */
const TAG_STEP = 21;
/** The anchors sit tighter than the tags — the wall is short and the fan does the spreading. */
const ANCHOR_STEP = 13;
/** A stub stack, where six pixels of fan is a fan nobody can read. */
const NUB_STEP = 6;
const NUB_LEN = 10;

/** A tag is the label row's line box, so a tag and a name read as one family. */
export const TAG_HEIGHT = 18;

/** The hairline's one strength — the leader is coaching-layer ink, never the accent. */
const HAIRLINE = "color-mix(in srgb, var(--color-text) 30%, transparent)";

/** One walk, from its frame's coordinates into the canvas's. */
export interface PlacedWalk {
	key: string;
	walk: Walk;
	/** The anchor dot, on the wall. */
	ax: number;
	ay: number;
	/** The leader's far end, where the tag begins. */
	ex: number;
	ey: number;
	/** The leader, as one path. */
	d: string;
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
 * The walks this page can take and no arrow can reach.
 *
 * Read off the derived graph and nothing else: an edge out of a frame on this
 * page whose far end is on another one. A frame that is not on the page
 * contributes nothing — its own page draws its marks, where the frame is. A
 * target no frame answers to is not drawn at all (#203): there is nowhere to
 * go, so there is nothing to press.
 */
export function walksOf(
	edges: readonly FlowEdge[],
	here: readonly ProjectedFrame[],
	all: readonly ProjectedFrame[],
): Walk[] {
	const onPage = new Set(here.map((frame) => frame.name));
	const pageByName = new Map(all.map((frame) => [frame.name, pageOf(frame)]));
	const walks: Walk[] = [];

	for (const edge of edges) {
		// a self-walk goes nowhere, and the same page is an arrow's job — the
		// arrow is already drawing it
		if (!onPage.has(edge.from) || edge.from === edge.to || onPage.has(edge.to)) continue;
		const page = pageByName.get(edge.to);
		if (edge.missing === true || page === undefined) continue;
		walks.push({ frame: edge.from, target: edge.to, page: pageLabel(page), certainty: edge.certainty });
	}

	return walks.sort((a, b) => a.frame.localeCompare(b.frame) || a.target.localeCompare(b.target));
}

/**
 * Every mark's place, in world space.
 *
 * The whole block is measured off the frame's own box, so it travels with a
 * drag and survives a reflow. World measures divide by the camera, which is
 * what holds a leader at one weight and a tag at one size through the zoom.
 *
 * Marks dock on the right wall at every size. The side is a property of a
 * frame's situation, but a side that recomputes is a side that flips mid-drag,
 * and that motion is undesigned (#146).
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
		d: `M ${round(wall)} ${round(ay)} L ${round(bx)} ${round(ey)} L ${round(ex)} ${round(ey)}`,
	};
}

/**
 * The leader with its words taken away: no bend, because there is nothing to
 * bend towards, and no fan, because the stack is six pixels tall. What
 * survives is that walks leave this wall and how many.
 */
function nub(walk: Walk, wall: number, y: number, k: number): PlacedWalk {
	const ex = wall + NUB_LEN / k;
	return {
		key: keyOf(walk),
		walk,
		ax: wall,
		ay: y,
		ex,
		ey: y,
		d: `M ${round(wall)} ${round(y)} L ${round(ex)} ${round(y)}`,
	};
}

function keyOf(walk: Walk): string {
	return `${walk.frame}\0${walk.target}`;
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/* ---------- the mark a leader carries ---------- */

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
		left: placed.ex,
		top: placed.ey,
		transform: `scale(${1 / k}) translateY(-50%)`,
		transformOrigin: "0 0",
		height: TAG_HEIGHT,
	};
}

function WalkTag({ placed, k, onOpen }: { placed: PlacedWalk; k: number; onOpen: (target: string) => void }) {
	const walk = placed.walk;
	return (
		<button
			type="button"
			data-walk-exit={walk.target}
			title={`go to ${walk.target} on ${walk.page}`}
			// the canvas owns the pointer everywhere else: a press here is this
			// tag's, never the start of a marquee over the frame behind it
			onPointerDown={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onClick={() => onOpen(walk.target)}
			className="absolute flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xs bg-canvas px-1.5 font-mono text-2xs leading-3 transition-colors duration-150 hover:bg-surface"
			style={tagBox(placed, k)}
		>
			<EdgeMark certain={walk.certainty === "will"} />
			<span className="text-text/85">{walk.target}</span>
			<span className="text-muted/40">·</span>
			<span className="text-muted/70">{walk.page}</span>
		</button>
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
	/** Pressing a tag travels: page follows, arrival centred, target selected. */
	onOpen: (target: string) => void;
}) {
	const layers = useMemo(() => placeWalks(walks, frames, k), [walks, frames, k]);
	if (layers.length === 0) return null;

	const readable = layers.flatMap((layer) => (layer.size === "nub" ? [] : layer.marks));
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
								stroke={HAIRLINE}
								strokeWidth={(layer.size === "nub" ? 1.25 : 1) / k}
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
							<circle
								cx={placed.ax}
								cy={placed.ay}
								r={(layer.size === "nub" ? 1.5 : 2.5) / k}
								fill="var(--color-muted)"
								// a nub is the only thing left on its wall, so it carries
								// slightly more ink than the drawing it replaces
								fillOpacity={layer.size === "nub" ? 0.8 : 0.85}
							/>
						</g>
					)),
				)}
			</svg>
			{readable.map((placed) => (
				<WalkTag key={placed.key} placed={placed} k={k} onOpen={onOpen} />
			))}
		</>
	);
}
