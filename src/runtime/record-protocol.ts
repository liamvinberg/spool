/**
 * What a recording is (spool#221), shared by the player that takes one and the
 * daemon that renders it. A person plays a frame in the player while it notes
 * what their hands did; the daemon then plays those inputs back into a fresh
 * copy of the frame on a paused clock and renders it one frame at a time, so
 * the clip is the person's own motion at a steady 60 fps and never a capture of
 * their screen.
 */

/** One thing the hands did, `t` milliseconds after the recording began, in the frame's CSS pixels. */
export type RecordedInput =
	| { t: number; kind: "move" | "down" | "up"; x: number; y: number; button: number }
	| { t: number; kind: "wheel"; x: number; y: number; dx: number; dy: number }
	| { t: number; kind: "key-down" | "key-up"; key: string; code: string; text: string }
	| { t: number; kind: "leave" };

/** The clip's shape: a post's 16:9 or 1:1, or the frame's own. */
export const CLIP_ASPECTS = ["16:9", "1:1", "frame"] as const;
export type ClipAspect = (typeof CLIP_ASPECTS)[number];

/** The gap kept round a frame played at a post's shape, so the window's edge never reads as the clip's. */
const SHAPED_MARGIN = 32;

/**
 * The box a frame is played in while it records: at a post's shape, the
 * largest of that shape that fits the room with a margin round it, so the clip
 * is the frame edge to edge rather than a wide page with bands above and
 * below. At the frame's own shape, the size it has on the canvas, or the
 * largest of its shape that fits when the room is smaller. The frame lays
 * itself out at that size.
 */
export function shapedBox(
	aspect: ClipAspect,
	room: { w: number; h: number },
	authored: { w: number; h: number },
): { w: number; h: number } {
	const ratio = aspect === "1:1" ? 1 : aspect === "16:9" ? 16 / 9 : authored.w / authored.h;
	const fits = Math.min(room.w - 2 * SHAPED_MARGIN, (room.h - 2 * SHAPED_MARGIN) * ratio);
	const w = Math.max(1, aspect === "frame" ? Math.min(authored.w, fits) : fits);
	return { w: Math.floor(w), h: Math.max(1, Math.floor(w / ratio)) };
}

/** A recording stops itself here. */
export const RECORD_LIMIT_MS = 60_000;
/** The timer says the limit is near from here. */
export const RECORD_WARN_MS = 50_000;

/** Lead before the first input and tail after the last, so a clip neither starts nor ends on a move. */
export const CLIP_LEAD_MS = 300;
export const CLIP_TAIL_MS = 500;
/** Moves closer together than this are one stroke of the hand. */
const STROKE_GAP_MS = 250;

/**
 * The part of a session the clip keeps, in ms from its start. It starts just
 * before the first input, so the wait between opening the player and reaching
 * for the frame is gone. It ends just after the last, except that a session
 * whose pointer left the frame at the end ends before that last stroke: it was
 * the hand on its way to the stop button, not part of the interaction. A
 * session with no inputs, a frame that plays itself, is kept whole.
 */
export function clipWindow(inputs: readonly RecordedInput[], duration: number): { start: number; end: number } {
	const first = inputs[0];
	if (first === undefined) return { start: 0, end: duration };
	const start = Math.max(0, first.t - CLIP_LEAD_MS);
	const end = (at: number) => Math.min(duration, Math.max(start + 1, at));
	const lastIndex = inputs.length - 1;
	const lastInput = inputs[lastIndex] as RecordedInput;
	if (lastInput.kind !== "leave" || lastIndex === 0) return { start, end: end(lastInput.t + CLIP_TAIL_MS) };
	// walk back over the final stroke: the moves before the leave, each close to the next
	let at = lastIndex - 1;
	while (at > 0) {
		const here = inputs[at];
		const before = inputs[at - 1];
		if (here?.kind !== "move" || before === undefined || here.t - before.t > STROKE_GAP_MS) break;
		at--;
	}
	const from = inputs[at] as RecordedInput;
	// a session that is one stroke from end to end was the interaction itself
	if (at === 0 && from.kind === "move") return { start, end: end(lastInput.t) };
	// the hand set off for the stop button here; anything that was not a move still gets its tail
	return { start, end: end(from.kind === "move" ? from.t : from.t + CLIP_TAIL_MS) };
}
