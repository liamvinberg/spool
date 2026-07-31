import type { Script } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";

/**
 * When a write reaches the picture on the canvas, which is the clock this whole
 * direction hangs off.
 *
 * Carried from `agent-hand--land`, whose measurement it is. Below 400 drawn pixels a
 * frame is not a live document — `cover.ts:8` sets `LIVE_MIN_CSS_PX = 400` and
 * `lifecycle.ts:245` refuses to mount one under it — so at 39% `home` is 152px of
 * stored still and a write reaches it only when the capture errand behind it
 * finishes. Two constants and one restart:
 *
 *   the wait           1500ms  CAPTURE_AFTER_READY_MS, `lifecycle.ts:66`
 *   the errand        ~1050ms  #94's 660-1437 with the settle budget on top, at the middle
 *   the restart                `canvas.tsx:522` stales the picture on every change,
 *                              so a write inside the window throws the errand away
 *
 * Thirteen source writes in runs of six, four and three therefore produce **three**
 * photographs, at 14.5s, 26.8s and 35.4s of a 37.7 second turn.
 *
 * **That is the number the parent's ceiling was derived against, and it is why the
 * ceiling is gone.** `agent-hand--ghost` capped its ghost at 573ms, the shortest gap
 * between two *writes*, because a ghost still alive when the next write lands is a
 * ghost of the wrong revision. On the photograph clock the shortest gap is
 * 35.4 − 26.8 = **8.6 seconds**, fifteen times the old ceiling and twenty times any
 * duration that still reads as a transition. Nothing collides with anything. So the
 * length of the ghost stopped being arithmetic and became a judgement, and this
 * frame is that judgement.
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
 * `frames/home/frame.json`, which the daemon drops before it is ever an event
 * (`events.ts:174`) so that a resize can never read as a source edit. It moves the
 * rectangle and it cannot move the picture, so counting it here would draw a redraw
 * that never happens.
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
 * A write with another one less than `LAG_MS` behind it never lands on its own: its
 * errand is thrown away and its change arrives inside a later photograph. The last
 * write of a run is the one that gets through, and it brings its whole run with it.
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
