// Mirrors src/ui/canvas/trash-toast.tsx.
// The undo chord is a prop, since a frame cannot ask the platform for it.

/**
 * The Trash toast: raised pill, message, Undo in thread, ⌘Z in muted mono.
 * While it stands the disk move is deferred — Undo restores the canvas and
 * nothing ever left the folder.
 *
 * A page deleted from the rail is one entry rather than one per frame inside
 * it, and it says how many frames went with it, because a folder is the one
 * thing you can delete here without seeing what is in it.
 */

export function TrashToast({
	frames,
	page = null,
	undoChord = "⌘Z",
	onUndo,
}: {
	frames: readonly string[];
	/** The page this entry is about, when a whole folder went. */
	page?: string | null;
	undoChord?: string;
	onUndo?: (() => void) | undefined;
}) {
	return (
		<div
			className="-translate-x-1/2 absolute bottom-[120px] left-1/2 z-30 flex items-center gap-4 rounded-md border border-border-raised bg-raised px-3.5 py-2.5"
			onPointerDown={(event) => event.stopPropagation()}
		>
			<span className="text-base text-text leading-base">Moved {subjectOf(frames, page)} to Trash</span>
			<button type="button" className="font-medium text-base text-thread leading-base" onClick={onUndo}>
				Undo
			</button>
			<span className="font-mono text-muted text-xs leading-xs">{undoChord}</span>
		</div>
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
