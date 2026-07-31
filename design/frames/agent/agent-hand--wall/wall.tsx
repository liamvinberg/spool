import { useReducedMotion } from "motion/react";
import type { Script } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";

/**
 * The wall layer: everything this direction draws, and it draws it nowhere else.
 *
 * One SVG over the field in the field's own coordinates. Nothing here leaves a
 * frame's rectangle, so there is no docking, no leader and no z-index argument —
 * the layer exists only because a stroke on a rounded rectangle wants a path and
 * `spool-play-field.tsx` gives its slots a CSS border.
 *
 * The geometry below mirrors `shared/ui/spool-play-field.tsx` and is copied rather
 * than imported because that file does not export it. If the field's grid moves,
 * these move with it or the marks land on nothing.
 */

export const COLS = [114, 310, 506] as const;
export const ROW_1 = 46;
export const FW = 152;
export const FH = 329;

/**
 * The agent's ink.
 *
 * Not the accent: `--color-thread` is the human's, spent on selection and on the
 * entered badge, and this whole direction rests on never borrowing it. Not light
 * either, and that is the constraint the canvas imposed rather than one anybody
 * chose — every frame on it is `#FEFEFE`, so a light hairline drawn inside a frame
 * is not a faint mark, it is no mark. So the agent works in the darkest ink spool
 * has, on the surface it is standing on.
 */
const INK = "var(--color-bg)";

/** the wall sits 3.5px inside the rectangle, clear of the product's own 1px edge */
const WALL = ring(3.5, 3.5, FW - 7, FH - 7, 9);
/** the picture sits 4px inside the wall: far enough to count as a second line at 39% */
const PICTURE = ring(7.5, 7.5, FW - 15, FH - 15, 6);

/** normalised so a dash reads the same however the field is scaled */
const LEN = 1000;
/** the read segment: about a sixth of the perimeter, near 150px of travel */
const ARC = 150;
/** the edit break: forty periods around the wall, so one write is one notch */
const PERIOD = 25;

const HELD = 0.3;
/** the wall goes quieter under an edit, because that is the one verb that unmakes it */
const HELD_UNDER = 0.14;
const READ = 0.62;
const EDIT = 0.78;
const PICTURE_FRESH = 0.42;
const PICTURE_STALE = 0.14;
const PICTURE_READ = 0.9;

const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

/** a `read` of the frame: the verbs that take the frame in and change nothing */
const READS = new Set(["read", "logs"]);
/** an `edit` of the frame: the verbs that change it */
const WRITES = new Set(["edit", "write"]);

/** what a shot leaves behind, and whether it still describes the frame */
export type Picture = "none" | "fresh" | "stale";

/** the agent's hand on one frame, at one instant of the turn */
export interface Hand {
	/** the agent has touched this frame in this turn and the turn is still running */
	readonly held: boolean;
	/** a read is open; `ms` is how long the capture says it takes, which is one lap */
	readonly read: { readonly key: string; readonly ms: number } | null;
	/** how many writes of an open run have landed, or null when no run is open */
	readonly writes: number | null;
	/** a shot is being taken; the picture draws itself over exactly this long */
	readonly shot: { readonly key: string; readonly ms: number } | null;
	/** how many shots have landed, which is what makes the exposure fire once each */
	readonly landed: number;
	readonly picture: Picture;
	/** the agent is reading the picture back */
	readonly looking: boolean;
}

const REST: Hand = { held: false, read: null, writes: null, shot: null, landed: 0, picture: "none", looking: false };

/**
 * The hand, read off the same script and the same clock the rail reads.
 *
 * Nothing here is authored. Every state is a tool row naming this frame plus
 * whether its cue has fired, which is exactly what `railEntries` does one column
 * over — so a row resolving in the transcript and a wall settling on the canvas
 * are the same instant rather than two guesses.
 *
 * Presence ends with the turn. A wall that outlived the conversation would be
 * claiming the agent is still standing there.
 */
export function handOf(script: Script, turn: Turn, frame: string): Hand {
	if (turn.phase !== "playing") return REST;
	const at = new Map(script.cues.map((cue) => [cue.name, cue.at]));
	const span = (row: { readonly cue: string; readonly doneCue: string | null }): number =>
		row.doneCue === null ? 0 : Math.max(0, (at.get(row.doneCue) ?? 0) - (at.get(row.cue) ?? 0));

	let hand = REST;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || !turn.at(row.cue)) continue;
		const done = row.doneCue !== null && turn.at(row.doneCue);
		hand = { ...hand, held: true };
		if (READS.has(row.verb)) {
			hand = { ...hand, read: done ? null : { key: row.key, ms: span(row) } };
			continue;
		}
		if (WRITES.has(row.verb)) {
			const landed = row.children.filter((child) => turn.at(child.cue)).length;
			hand = {
				...hand,
				// a write does not delete the picture, it makes it wrong, and the wall is the
				// only place that fact has ever been drawable
				picture: hand.picture === "fresh" ? "stale" : hand.picture,
				writes: done ? null : Math.max(1, landed),
			};
			continue;
		}
		if (row.verb === "shot") {
			hand = done
				? { ...hand, shot: null, landed: hand.landed + 1, picture: "fresh" }
				: { ...hand, shot: { key: row.key, ms: span(row) } };
			continue;
		}
		if (row.verb === "look") hand = { ...hand, looking: !done };
	}
	return hand;
}

export function WallLayer({ frames, hands }: { frames: readonly string[]; hands: Readonly<Record<string, Hand>> }) {
	const still = useReducedMotion() === true;
	return (
		<>
			<style>{CSS}</style>
			<svg
				className={still ? "pointer-events-none absolute inset-0 h-full w-full wall-still" : "pointer-events-none absolute inset-0 h-full w-full"}
				fill="none"
				aria-hidden="true"
			>
				{frames.map((name, index) => {
					const hand = hands[name];
					if (hand === undefined || !hand.held) return null;
					return (
						<g key={name} transform={`translate(${COLS[index] ?? 0} ${ROW_1})`}>
							<Wall hand={hand} still={still} />
						</g>
					);
				})}
			</svg>
		</>
	);
}

/**
 * One frame's wall, in four strokes at most and usually two.
 *
 * The held wall is always under whatever else is happening, so the three verbs are
 * modulations of one line rather than three unrelated marks. A frame is never left
 * with a broken edge and no whole one: an edit is the agent cutting into the wall,
 * not the wall failing.
 */
function Wall({ hand, still }: { hand: Hand; still: boolean }) {
	return (
		<>
			<path
				d={WALL}
				className="wall-held"
				stroke={INK}
				strokeWidth={1.25}
				strokeOpacity={hand.writes === null ? HELD : HELD_UNDER}
			/>

			{/* read — one lap, finishing exactly when the call does */}
			{hand.read === null ? null : still ? (
				<path d={WALL} stroke={INK} strokeWidth={1.5} strokeOpacity={READ} />
			) : (
				<path
					key={hand.read.key}
					d={WALL}
					className="wall-read"
					pathLength={LEN}
					stroke={INK}
					strokeWidth={1.5}
					strokeOpacity={READ}
					strokeLinecap="round"
					strokeDasharray={`${ARC} ${LEN - ARC}`}
					style={{ animationDuration: `${Math.max(400, hand.read.ms)}ms` }}
				/>
			)}

			{/* edit — the wall broken, ratcheting one notch per write */}
			{hand.writes === null ? null : (
				<path
					d={WALL}
					className="wall-edit"
					pathLength={LEN}
					stroke={INK}
					strokeWidth={1.5}
					strokeOpacity={EDIT}
					strokeDasharray={`${PERIOD - 11} 11`}
					style={{ strokeDashoffset: -PERIOD * hand.writes }}
				/>
			)}

			{/* shot — the wall doubles, and the copy draws itself over the length of the call */}
			{hand.shot !== null ? (
				<path
					key={hand.shot.key}
					d={PICTURE}
					className="wall-open"
					stroke={INK}
					strokeWidth={1}
					style={{ animationDuration: `${Math.max(240, hand.shot.ms)}ms` }}
				/>
			) : hand.picture === "none" ? null : (
				<path
					d={PICTURE}
					className="wall-picture"
					stroke={INK}
					strokeWidth={1}
					strokeOpacity={hand.looking ? PICTURE_READ : hand.picture === "fresh" ? PICTURE_FRESH : PICTURE_STALE}
					style={{ transitionDuration: hand.looking ? "90ms" : "260ms" }}
				/>
			)}

			{/* the exposure: one beat, at the instant the picture exists */}
			{hand.landed === 0 || still ? null : (
				<path key={`exposure-${hand.landed}`} d={WALL} className="wall-flash" stroke={INK} strokeWidth={1.5} />
			)}
		</>
	);
}

/**
 * Why this is CSS rather than motion.
 *
 * Every value being animated is a stroke property — `stroke-dashoffset`,
 * `stroke-opacity` — and this direction is measured in exactly those. Motion's own
 * path helpers normalise `pathLength` and rewrite the dash array underneath you,
 * which is fine when the path is a drawing and wrong when the dash *is* the
 * argument. A keyed element and one keyframe restart a lap or an exposure with no
 * ambiguity about what is on the wire.
 *
 * `.wall-still` is the reduced-motion floor: the flash and the lap are gone (a lap
 * with no travel is not a slower lap, it is a whole ring), the break and the second
 * line stay, and every transition is zero. What survives is the state; what goes is
 * the character.
 */
const CSS = `
.wall-held { transition: stroke-opacity 300ms ${EASE}; }
.wall-edit { transition: stroke-dashoffset 240ms ${EASE}; }
.wall-picture { transition-property: stroke-opacity; transition-timing-function: ${EASE}; }
.wall-read { animation: wall-lap linear forwards; }
.wall-open { animation: wall-open linear forwards; }
.wall-flash { animation: wall-flash 520ms ease-out forwards; }
@keyframes wall-lap { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -${LEN}; } }
@keyframes wall-open { from { stroke-opacity: 0; } to { stroke-opacity: ${PICTURE_FRESH}; } }
@keyframes wall-flash { from { stroke-opacity: 0.9; } to { stroke-opacity: 0; } }
.wall-still * { animation-duration: 0ms !important; transition-duration: 0ms !important; }
`;

/** a rounded rectangle as one path, clockwise from the top-left corner */
function ring(x: number, y: number, w: number, h: number, r: number): string {
	return [
		`M ${x + r} ${y}`,
		`H ${x + w - r}`,
		`A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
		`V ${y + h - r}`,
		`A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
		`H ${x + r}`,
		`A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
		`V ${y + r}`,
		`A ${r} ${r} 0 0 1 ${x + r} ${y}`,
		"Z",
	].join(" ");
}
