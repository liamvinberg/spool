import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";

/**
 * The rule, as code. There is no object in this direction, so there is nothing
 * here that describes one — only four facts about a frame, read off the same rows
 * the rail is reading.
 *
 * The three postures are not three values of one field. They are three separate
 * things that can be true of the rectangle, because a rectangle is not a token and
 * has no posture of its own to switch. `taking it in` is the absence of the other
 * two, which is why `look`, `logs` and `read` need no member here.
 */

/** the verbs that change the frame, so its body has to redraw */
const CHANGES = new Set(["write", "edit"]);

export interface Held {
	/**
	 * The frame the agent has hold of, from the first call that names one until the
	 * turn lands. Not a call and not a state a call ends: it spans all eleven gaps,
	 * which are 20.0 of this turn's 37.7 seconds.
	 */
	readonly frame: string | null;
	/**
	 * A call is open right now. This is the one reading that needs no address: with
	 * one agent, whether something is happening does not depend on knowing where, so
	 * it is true on the instant the tool block opens rather than when the argument
	 * finishes typing itself in.
	 */
	readonly live: boolean;
	/**
	 * Writes landed on the held frame so far. A counter rather than a flag because
	 * the frame redraws once per write, and the six writes of a run are six redraws
	 * — spool re-renders on source change, so this is a report of the frame's own
	 * behaviour rather than a mark about it.
	 */
	readonly writes: number;
	/** a `shot` is open: the subject is the whole rectangle */
	readonly shooting: boolean;
}

export const NOBODY: Held = { frame: null, live: false, writes: 0, shooting: false };

/**
 * Where the agent is, what it is doing there, and what has landed.
 *
 * **The address is paid for once.** A tool block opens with an empty input and the
 * file name arrives in the argument deltas after it, so every row in this capture
 * knows its verb before it knows its subject: 157ms on the first row, 314ms on the
 * worst, **1,794ms across the twelve of them**. A direction that prints a word per
 * row pays that lag twelve times, and on the 186ms `look` at 27.6s the address
 * lands with 68ms of the call left to run. A property of a frame pays it once, at
 * 274ms, and never again — because after that the frame is already held and every
 * later row is about the same rectangle. So the hold waits for `subjectCue` and
 * nothing else in here does.
 *
 * **Nothing falls back.** When no call is open the frame is still held and nothing
 * is being done to it, which is exactly what the canvas then draws. There is no
 * last-posture to keep, because a posture here is something happening to the
 * rectangle rather than a shape the token is holding.
 */
export function heldOf(script: Script, turn: Turn): Held {
	if (turn.phase === "idle") return NOBODY;

	const reached = script.rows.filter((row): row is ToolRow => row.kind === "tool" && turn.at(row.cue));
	const addressed = reached.filter(
		(row) => row.frame !== null && (row.subjectCue === null || turn.at(row.subjectCue)),
	);
	const on = addressed.at(-1)?.frame ?? null;
	const open = reached.filter((row) => row.doneCue === null || !turn.at(row.doneCue));

	/**
	 * The writes survive the turn, and the hold does not.
	 *
	 * Letting go is not undoing: fourteen writes landed in `home` and `home` is
	 * different now, so a settled canvas has to draw the frame the agent left rather
	 * than the one it found. It is the only trace this direction leaves anywhere, and
	 * it is the right one — the agent is gone and its work is not.
	 */
	const writes =
		on === null
			? 0
			: addressed
					.filter((row) => row.frame === on && CHANGES.has(row.verb))
					.reduce((total, row) => total + (row.runs ? row.children.filter((kid) => turn.at(kid.cue)).length : 1), 0);

	// presence is a live state; a turn that has landed or been cut has nobody at a frame
	const here = turn.phase === "playing";

	return {
		frame: here ? on : null,
		live: here && on !== null && open.length > 0,
		writes,
		shooting: here && open.some((row) => row.verb === "shot"),
	};
}

/**
 * The revision the newest picture is of.
 *
 * A screenshot is of a frame as it was when it was taken, and this turn rewrites
 * that frame fourteen times, so a thumbnail drawn at the current revision would be
 * a picture of a file the camera never saw. This counts the writes that had landed
 * when the last `shot` opened and draws that.
 *
 * It is one number for every row rather than one per row, so an older `look` in
 * the log shows the newest picture. That is this frame's stand-in being cheap
 * rather than the direction saying anything: `ShotRef` carries a path, a media
 * type and a frame, and nothing that tells two shots of one frame apart.
 */
export function shotRev(script: Script, turn: Turn): number {
	const at = new Map(script.cues.map((cue) => [cue.name, cue.at]));
	const tools = script.rows.filter((row): row is ToolRow => row.kind === "tool");
	const last = tools.filter((row) => row.verb === "shot" && row.doneCue !== null && turn.at(row.doneCue)).at(-1);
	if (last === undefined) return 0;
	const when = at.get(last.cue) ?? 0;
	const by = (cue: string) => (at.get(cue) ?? Number.POSITIVE_INFINITY) <= when;
	return tools
		.filter((row) => CHANGES.has(row.verb))
		.reduce(
			(total, row) =>
				total + (row.runs ? row.children.filter((kid) => by(kid.cue)).length : by(row.cue) ? 1 : 0),
			0,
		);
}
