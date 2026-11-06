import { pageName } from "../../page-path";
import { accelLabel } from "../../runtime/platform-keys";
import { TextAction, Toast } from "../primitives/feedback";
import type { HistoryEntry } from "./history";

/**
 * The undo for a move (spool#224): every change a drag in the Pages tree makes
 * is said once on a toast with its Undo, the same step ⌘Z takes off the one
 * stack. Nothing is held back while it stands, unlike the Trash's: the move has
 * already happened, and this is only the nearest way to take it back.
 */

export const MOVED_UNDO_MS = 5000;

export type MovedEntry = Extract<HistoryEntry, { kind: "move" | "move-page" | "reorder" }>;

export function isMovedEntry(entry: HistoryEntry): entry is MovedEntry {
	return entry.kind === "move" || entry.kind === "move-page" || entry.kind === "reorder";
}

/** what the toast says: `Moved pay to loyalty`, `Moved checkout into explore`, `Reordered explore` */
export function movedLine(entry: MovedEntry, label: (page: string) => string): string {
	const many = (names: readonly { name: string }[], kind: string) => {
		const [first] = names;
		return names.length === 1 && first !== undefined ? pageName(first.name) : `${names.length} ${kind}`;
	};
	if (entry.kind === "move") return `Moved ${many(entry.frames, "frames")} to ${label(entry.to)}`;
	if (entry.kind === "move-page") return `Moved ${many(entry.pages, "pages")} into ${label(entry.to)}`;
	const page = entry.lists[0]?.page;
	return page === undefined ? "Reordered" : `Reordered ${label(page)}`;
}

export function MovedToast({ line, onUndo }: { line: string; onUndo: () => void }) {
	return (
		<Toast
			message={line}
			action={<TextAction onClick={onUndo}>Undo</TextAction>}
			keys={`${accelLabel()}Z`}
			drain={MOVED_UNDO_MS}
		/>
	);
}
