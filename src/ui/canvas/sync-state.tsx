import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { fetchSyncState, type SyncState } from "../api";
import { TextAction, Toast } from "../primitives/feedback";
import { Popover } from "../primitives/overlays";

/** Said whenever a project's sync changes, so its canvas reads it again. */
export const SYNC_CHANGED = "spool-sync-change";

/**
 * A team project's sync, said on its canvas for as long as it lasts and whenever the canvas opens: that the project
 * ended here, that it has gone local until its team pays, that sync is paused on a limit, that changes are waiting
 * out a long spell on the minute's limit, and which files didn't travel. A solo project's canvas says nothing.
 */
export function useSyncState(project: string): ReactNode {
	const [state, setState] = useState<SyncState | undefined>(undefined);
	const revision = useRef(0);
	const refresh = useCallback(() => {
		const asked = ++revision.current;
		void fetchSyncState(project).then((next) => {
			if (asked === revision.current) setState(next);
		});
	}, [project]);
	useEffect(() => {
		refresh();
		window.addEventListener(SYNC_CHANGED, refresh);
		window.addEventListener("focus", refresh);
		return () => {
			revision.current++;
			window.removeEventListener(SYNC_CHANGED, refresh);
			window.removeEventListener("focus", refresh);
		};
	}, [refresh]);
	return state === undefined ? null : <SyncNotices state={state} />;
}

/** What a state says, one line each, keyed by the words: a line closed stays closed until it says something else. */
function linesOf({ ended, goneLocal, paused, sending, held }: SyncState): string[] {
	const lines: string[] = [];
	if (ended !== null) lines.push(`No longer synced with ${ended}. This is now a project on this Mac only.`);
	if (goneLocal !== null)
		lines.push(`${goneLocal} has gone local. Your copy keeps working here and syncs again once the team pays.`);
	if (paused !== null) lines.push(`Sync paused: ${paused}. Changes stay on this Mac until it lifts.`);
	if (sending !== null) lines.push(`${sending}.`);
	const [only] = held;
	if (held.length === 1 && only !== undefined) lines.push(`${only.path} didn't travel: ${only.why}`);
	else if (held.length > 1) lines.push(`${held.length} files didn't travel`);
	return lines;
}

export function SyncNotices({ state }: { state: SyncState }) {
	const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
	const [open, setOpen] = useState(false);
	const lines = linesOf(state).filter((line) => !closed.has(line));
	if (lines.length === 0) return null;
	const many = state.held.length > 1 ? linesOf(state).at(-1) : undefined;
	return (
		<>
			{open && many !== undefined && lines.includes(many) && (
				<Popover aria-label="Files that didn't travel" className="max-h-[40vh] w-toast gap-1 overflow-auto">
					<ul className="flex flex-col gap-1">
						{state.held.map(({ path, why }) => (
							<li key={path} className="text-secondary type-detail">
								<span className="font-mono text-primary">{path}</span> {why}
							</li>
						))}
					</ul>
				</Popover>
			)}
			{lines.map((line) => (
				<Toast
					key={line}
					data-sync-state=""
					className="max-w-sheet"
					message={line}
					action={
						line === many ? (
							<TextAction aria-expanded={open} onClick={() => setOpen((was) => !was)}>
								{open ? "Hide" : "Show"}
							</TextAction>
						) : undefined
					}
					onDismiss={() => setClosed((was) => new Set([...was, line]))}
				/>
			))}
		</>
	);
}
