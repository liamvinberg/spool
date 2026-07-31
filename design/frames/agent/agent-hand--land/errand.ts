import type { Script } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";

/**
 * When a write reaches the picture on the canvas.
 *
 * This direction's whole claim is that a write landing is already the effect, so
 * the one thing it may not fake is *when* a write lands. Below 400 drawn pixels a
 * frame on the canvas is not a live document at all — `cover.ts:8` sets
 * `LIVE_MIN_CSS_PX = 400` and `lifecycle.ts:245` refuses to mount anything under it
 * — so at the 39% this page draws, `home` is 152px of stored still and the redraw
 * happens out of sight, behind it. What the human sees is not a document rebooting.
 * It is one photograph replaced by the next.
 *
 * So the write does not land when the write lands. It lands when the errand behind
 * it finishes, and every term of that wait is a constant somebody already chose:
 *
 *   the wait           1500ms  CAPTURE_AFTER_READY_MS, `lifecycle.ts:66`
 *   the errand        ~1050ms  #94's 660-1437 with CAPTURE_SETTLE_BUDGET_MS on top,
 *                              boot included, taken at the middle
 *
 * Two and a half seconds, and that is the good case: it assumes an errand slot free
 * (three of them, `lifecycle.ts:89`), a warm compile, and no capture still in flight
 * from the write before. And it restarts. `canvas.tsx:522` bumps the document nonce
 * and stales the picture on every change event, `frame-shell.tsx:159` keys the
 * iframe on that nonce, and `lifecycle.ts:375` will not photograph a document until
 * it has run CAPTURE_AFTER_READY_MS. A second write inside the window throws the
 * first errand's work away and starts the clock again.
 *
 * Which is why the answer is three. Thirteen source writes, in runs whose internal
 * gaps measure 573ms to 1605ms, produce three photographs — one per run, each
 * carrying its whole run at once, each arriving after the agent has moved on.
 */

/** CAPTURE_AFTER_READY_MS at `src/ui/canvas/lifecycle.ts:66` */
const AFTER_READY_MS = 1500;
/** #94's 660-1437 for the whole errand, boot and the 900ms settle budget included, at the middle */
const ERRAND_MS = 1050;

/** source change to new still, at best */
export const LAG_MS = AFTER_READY_MS + ERRAND_MS;

/**
 * The writes this turn lands on one frame, in the order it lands them.
 *
 * Only `edit` rows. The turn opens with a `write` on `home` and that one is
 * `frames/home/frame.json`, which the daemon drops before it ever becomes an event
 * — `events.ts:174`, `if (parts.length === 3 && parts[2]?.startsWith("frame.json")
 * === true) return undefined`, under a comment saying a resize must never read as a
 * source edit. So the first row of this turn moves the rectangle and cannot move
 * the picture, and counting it here would draw a redraw that never happens.
 */
function writesOn(script: Script, frame: string): readonly number[] {
	const cueAt = new Map(script.cues.map((cue) => [cue.name, cue.at]));
	const at: number[] = [];
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) at.push(cueAt.get(child.cue) ?? 0);
	}
	return at;
}

/** how many writes are on disk: what `spool shot` would photograph if you asked it now */
export function sourceRev(script: Script, turn: Turn, frame: string): number {
	let count = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) if (turn.at(child.cue)) count += 1;
	}
	return count;
}

/**
 * How many writes the picture on the canvas has caught up to.
 *
 * A write's errand only ever completes if nothing interrupts it, so a write with
 * another one less than `LAG_MS` behind it is never seen on its own — its work is
 * thrown away and its change arrives inside a later photograph. The last write of a
 * run is the one that gets through, and it brings the whole run with it.
 */
export function pictureRev(script: Script, elapsed: number, frame: string): number {
	const at = writesOn(script, frame);
	let rev = 0;
	for (let index = 0; index < at.length; index += 1) {
		const lands = (at[index] as number) + LAG_MS;
		const next = at[index + 1];
		if (next !== undefined && next < lands) continue;
		if (elapsed >= lands) rev = index + 1;
	}
	return rev;
}
