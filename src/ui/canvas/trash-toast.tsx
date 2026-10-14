/**
 * The Trash toast (#23): what went, Undo in thread (red binds the destructive
 * action, #13), the chord that does the same, and the undo window draining
 * along its foot. While it stands, the disk move is deferred: Undo restores the
 * canvas and nothing ever left the folder (#7: ⌘Z answers the toast ahead of
 * the geometry undo).
 *
 * A page deleted from the rail is one entry rather than one per frame inside
 * it (#229), and it says how many frames went with it, because a folder is the
 * one thing you can delete here without seeing what is in it.
 */

import { accelLabel } from "../../runtime/platform-keys";
import { TextAction, Toast } from "../primitives/feedback";

const UNDO_CHORD = `${accelLabel()}Z`;

export function TrashToast({
	frames,
	page = null,
	undoMs,
	onUndo,
}: {
	frames: readonly string[];
	/** The page this entry is about, when a whole folder went. */
	page?: string | null;
	/** ms the undo stands for */
	undoMs: number;
	onUndo: () => void;
}) {
	return (
		<Toast
			message={`Moved ${subjectOf(frames, page)} to Trash`}
			action={<TextAction onClick={onUndo}>Undo</TextAction>}
			keys={UNDO_CHORD}
			drain={undoMs}
		/>
	);
}

function subjectOf(frames: readonly string[], page: string | null): string {
	if (page !== null) {
		if (frames.length === 0) return page;
		return `${page} and ${frames.length === 1 ? "1 frame" : `${frames.length} frames`}`;
	}
	const [first] = frames;
	return frames.length === 1 && first !== undefined ? first : `${frames.length} frames`;
}
