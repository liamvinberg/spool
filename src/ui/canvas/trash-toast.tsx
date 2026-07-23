/**
 * The Trash toast (#23), matching screens v1: raised pill, message, Undo in
 * thread (red binds the destructive action, #13), ⌘Z in muted mono. While it
 * stands, the disk move is deferred — Undo restores the canvas and nothing
 * ever left the folder (#7: ⌘Z answers the toast ahead of the geometry undo).
 */

export function TrashToast({ frames, onUndo }: { frames: readonly string[]; onUndo: () => void }) {
	const [first] = frames;
	const subject = frames.length === 1 && first !== undefined ? first : `${frames.length} frames`;
	return (
		<div
			className="-translate-x-1/2 absolute bottom-6 left-1/2 z-10 flex items-center gap-4 rounded-md border border-border-raised bg-raised px-3.5 py-2.5"
			onPointerDown={(event) => event.stopPropagation()}
		>
			<span className="text-base text-text leading-base">Moved {subject} to Trash</span>
			<button type="button" className="font-medium text-base text-thread leading-base" onClick={onUndo}>
				Undo
			</button>
			<span className="font-mono text-muted text-xs leading-xs">⌘Z</span>
		</div>
	);
}
