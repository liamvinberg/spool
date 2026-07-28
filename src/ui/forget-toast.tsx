/**
 * Home's remove toast (#13), on the Trash-toast pattern (#23): raised pill,
 * Undo in thread, ⌘Z in muted mono. The hairline drains the undo window so the
 * closing door is visible. Nothing has been written while it stands — the copy
 * says so, because "removed" reads heavier than a forgotten registry entry is.
 */

import { accelLabel } from "../runtime/platform-keys";

const UNDO_CHORD = `${accelLabel()}Z`;

export function ForgetToast({ name, windowMs, onUndo }: { name: string; windowMs: number; onUndo: () => void }) {
	return (
		<div className="-translate-x-1/2 fixed bottom-6 left-1/2 z-30 flex animate-toast-in items-center gap-3.5 overflow-hidden rounded-md border border-border-raised bg-raised py-2.5 pr-3.5 pl-4">
			<span className="text-base text-text leading-base">
				Removed <span className="font-medium">{name}</span>
			</span>
			<span className="font-mono text-muted text-xs leading-xs">files stay on disk</span>
			<span className="h-4 w-px bg-border-raised" />
			<button type="button" className="font-medium text-base text-thread leading-base" onClick={onUndo}>
				Undo
			</button>
			<span className="font-mono text-muted text-xs leading-xs">{UNDO_CHORD}</span>
			<span
				className="absolute bottom-0 left-0 h-px w-full origin-left animate-toast-drain bg-thread"
				style={{ animationDuration: `${windowMs}ms` }}
			/>
		</div>
	);
}
