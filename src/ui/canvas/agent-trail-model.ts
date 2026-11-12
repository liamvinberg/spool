import type { Camera } from "../api";
import type { AgentDeck } from "./agent-stream";
import type { AgentTile } from "./agent-transcript";
import type { Box } from "./camera";

/**
 * What the agent's trail says (task 443): the open thread's last turn, read off
 * what the rail already folds, and nothing the canvas keeps of its own.
 *
 * Only the last turn's frames. The unseen disc stays on everything else nobody
 * has looked at, on its name and its Pages row, as it ships; the trail tells
 * what just arrived, for ten minutes after the turn that wrote it.
 */

/** How long a finished turn's frames stay told: ten minutes after it ends. */
export const FRESH_MS = 600_000;

/** Following lets go this long after the turn ends, on the last thing it made. */
export const LET_GO_MS = 900;

/** Which way what the trail names lies from the middle of the canvas. */
export type Way = { kind: "here" } | { kind: "angle"; angle: number } | { kind: "page"; page: string };

/** The open thread's last turn, as little as the trail draws from it. */
export interface TrailTurn {
	/** the thread and the turn in it: a new one comes in afresh */
	readonly key: string;
	/** the agent's name as its binary is called (`claude`), or null where the thread has none yet */
	readonly agent: string | null;
	readonly running: boolean;
	/** unix ms the turn ended, once it has */
	readonly ended: number | null;
	/** every frame the turn touched, in the order it first touched them */
	readonly tiles: readonly Pick<AgentTile, "frame" | "state">[];
	/** the frame the agent itself is at, as a path under frames/, and whether it only reads it */
	readonly at: { readonly frame: string; readonly reading: boolean } | null;
}

/** the tile states of a frame being written right now: its source streaming in, or a designer at its placeholder */
const WRITING: ReadonlySet<AgentTile["state"]> = new Set(["drawing", "reading"]);
/** the tile states of a frame something just landed in */
const JUST: ReadonlySet<AgentTile["state"]> = new Set(["fresh", "editing", "shooting"]);

/** The open thread's last turn, or null before it has one. */
export function trailTurnOf(deck: AgentDeck): TrailTurn | null {
	const { entries, phase, companions } = deck.turn;
	let said = -1;
	for (let at = entries.length - 1; at >= 0; at -= 1)
		if (entries[at]?.kind === "user") {
			said = at;
			break;
		}
	// the foot after the last thing said is this turn's; one before it is the turn before's
	let foot = null;
	for (let at = entries.length - 1; at > said; at -= 1) {
		const entry = entries[at];
		if (entry?.kind === "turn") {
			foot = entry;
			break;
		}
	}
	const running = phase === "playing" || phase === "asking";
	if (foot === null && !running) return null;
	const own = companions.find((one) => one.key === "" && one.frame !== null);
	const thread = deck.threads.find((one) => one.id === deck.open);
	return {
		key: `${deck.open}:${said}`,
		agent: deck.engine ?? thread?.engine ?? null,
		running,
		ended: running ? null : (thread?.at ?? null),
		tiles: (foot?.tiles ?? []).map(({ frame, state }) => ({ frame, state })),
		at: own?.frame == null ? null : { frame: own.frame, reading: own.act === "read" },
	};
}

/** Two readings of a turn that draw the same trail. */
export function sameTrailTurn(a: TrailTurn | null, b: TrailTurn | null): boolean {
	if (a === null || b === null) return a === b;
	return (
		a.key === b.key &&
		a.agent === b.agent &&
		a.running === b.running &&
		a.ended === b.ended &&
		a.at?.frame === b.at?.frame &&
		a.at?.reading === b.at?.reading &&
		a.tiles.length === b.tiles.length &&
		a.tiles.every((tile, at) => tile.frame === b.tiles[at]?.frame && tile.state === b.tiles[at]?.state)
	);
}

/** The frames the turn wrote that still stand, in the order it wrote them: what `n new` counts. */
export function madeOf(turn: TrailTurn, standing: ReadonlySet<string>): string[] {
	return turn.tiles
		.filter((tile) => tile.state !== "deleted" && tile.state !== "reading" && standing.has(tile.frame))
		.map((tile) => tile.frame);
}

/**
 * The frame a running turn is on: the one being written, else the one a change
 * just landed in, else the last it wrote, else, before it has written anything,
 * the one it reads. `known` resolves the agent's own path, which may name a
 * file in a frame's subfolder, to the frame holding it.
 */
export function writingOf(
	turn: TrailTurn,
	known: (path: string) => string,
): { frame: string; reading: boolean } | null {
	const tiles = [...turn.tiles].reverse().filter((tile) => tile.state !== "deleted");
	const on = tiles.find((tile) => WRITING.has(tile.state)) ?? tiles.find((tile) => JUST.has(tile.state)) ?? tiles[0];
	if (on !== undefined) return { frame: on.frame, reading: false };
	return turn.at === null ? null : { frame: known(turn.at.frame), reading: turn.at.reading };
}

/** How much of the ten minutes is left, 1 to 0, at `now`. */
export function freshness(ended: number, now: number): number {
	return Math.max(0, Math.min(1, 1 - (now - ended) / FRESH_MS));
}

/** How far in from the canvas's edge a frame's middle must be to count as in view. */
const IN_VIEW = 24;

/**
 * Which way a set of frames lies from the middle of the canvas. A frame counts
 * as in view once its middle is, so one peeking in at the edge still gets an
 * arrow; frames on another page point at the first one's page.
 */
export function wayTo(
	frames: readonly (Box & { readonly page: string })[],
	page: string,
	camera: Camera,
	size: { readonly w: number; readonly h: number },
): Way {
	if (frames.length === 0) return { kind: "here" };
	const here = frames.filter((frame) => frame.page === page);
	const first = frames[0];
	if (here.length === 0 && first !== undefined) return { kind: "page", page: first.page };
	const middle = (frame: Box) => ({
		x: (frame.x + frame.w / 2) * camera.k + camera.x,
		y: (frame.y + frame.h / 2) * camera.k + camera.y,
	});
	const away = here
		.map(middle)
		.filter((at) => at.x < IN_VIEW || at.x > size.w - IN_VIEW || at.y < IN_VIEW || at.y > size.h - IN_VIEW);
	if (away.length === 0) return { kind: "here" };
	const x = away.reduce((sum, at) => sum + at.x, 0) / away.length;
	const y = away.reduce((sum, at) => sum + at.y, 0) / away.length;
	return { kind: "angle", angle: Math.atan2(y - size.h / 2, x - size.w / 2) };
}

/** Two ways an arrow draws alike: a turn under a degree is not worth a render. */
export function sameWay(a: Way, b: Way): boolean {
	if (a.kind === "angle" && b.kind === "angle") return Math.abs(a.angle - b.angle) < 0.015;
	if (a.kind === "page" && b.kind === "page") return a.page === b.page;
	return a.kind === b.kind;
}

/** How much of the trail shows when the top right's row is short of room (`corner-row.tsx`). */
export type TrailFold = "full" | "middle" | "cut" | "name";

/** Past this many characters the frame's name is cut in its middle when the row is short… */
const CUT_OVER = 20;
/** …keeping this many at each end. */
const CUT_KEEP = 9;

/**
 * The trail's words at a fold: the pages between the agent and the frame fold to one `…`, then the frame's name is
 * cut in its middle, then only the agent's name stays, the whole path then said in its tooltip.
 */
export function trailWords(
	pages: readonly string[],
	label: string,
	fold: TrailFold,
): { pages: readonly string[]; label: string | null } {
	const cut = label.length > CUT_OVER ? `${label.slice(0, CUT_KEEP)}…${label.slice(-CUT_KEEP)}` : label;
	if (fold === "name") return { pages: [], label: null };
	return {
		pages: pages.length === 0 || fold === "full" ? pages : ["…"],
		label: fold === "cut" ? cut : label,
	};
}
