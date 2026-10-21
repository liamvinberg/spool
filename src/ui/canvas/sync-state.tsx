import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { type CanvasSync, fetchSyncState, postForgetProject, type SyncState } from "../api";
import { MovedSheet } from "../moved-away";
import { TextAction, Toast } from "../primitives/feedback";
import { Popover } from "../primitives/overlays";

/** Said whenever a project's sync changes, so its canvas reads it again. */
export const SYNC_CHANGED = "spool-sync-change";

/**
 * A team project's sync, said on its canvas for as long as it lasts and whenever the canvas opens: that the project
 * ended here, that it has gone local until its team pays, that sync is paused on a limit, that changes are waiting
 * out a long spell on the minute's limit, and which files didn't travel. A solo project's canvas says nothing. One
 * whose design/ moved into a team this account can't edit stands the moved sheet over the canvas (spool#194).
 */
export function useSyncState(project: string, root?: string): ReactNode {
	const [state, setState] = useState<CanvasSync | undefined>(undefined);
	// the moved sheet, once put away, stays away until it has something else to say
	const [putAway, setPutAway] = useState<string | null>(null);
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
	if (state === undefined) return null;
	const moved = state.moved;
	const movedKey = moved === null ? null : `${moved.standing}\n${moved.commit?.hash ?? ""}`;
	return (
		<>
			{moved !== null && movedKey !== putAway && (
				<MovedSheet
					name={project}
					moved={moved}
					onRemove={() => {
						if (root !== undefined) void postForgetProject(root);
					}}
					onClose={() => setPutAway(movedKey)}
				/>
			)}
			<SyncNotices state={state} />
		</>
	);
}

/**
 * What a state says, one line each, keyed by its words: a line closed stays closed until it says something else. A
 * long wait is keyed as one line however its count changes, so it counts down in place, and once closed it stays
 * closed until that wait ends.
 */
function linesOf({ ended, goneLocal, paused, sending, held }: SyncState): { key: string; text: string }[] {
	const lines: { key: string; text: string }[] = [];
	const say = (text: string) => lines.push({ key: text, text });
	if (ended !== null) say(`No longer synced with ${ended}. This is now a project on this Mac only.`);
	if (goneLocal !== null)
		say(`${goneLocal} has gone local. Your copy keeps working here and syncs again once the team pays.`);
	if (paused !== null) say(`Sync paused: ${paused}. Changes stay on this Mac until it lifts.`);
	if (sending !== null) lines.push({ key: SENDING, text: `${sending}.` });
	const [only] = held;
	if (held.length === 1 && only !== undefined) say(`${only.path} didn't travel: ${only.why}`);
	else if (held.length > 1) say(`${held.length} files didn't travel`);
	return lines;
}

const SENDING = "sending";

export function SyncNotices({ state }: { state: SyncState }) {
	const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
	const [open, setOpen] = useState(false);
	// a wait closed while it lasted is said again when the next one begins
	if (state.sending === null && closed.has(SENDING))
		setClosed((was) => new Set([...was].filter((key) => key !== SENDING)));
	const lines = linesOf(state).filter((line) => !closed.has(line.key));
	if (lines.length === 0) return null;
	const many = state.held.length > 1 ? linesOf(state).at(-1)?.key : undefined;
	return (
		<>
			{open && many !== undefined && lines.some((line) => line.key === many) && (
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
			{lines.map(({ key, text }) => (
				<Toast
					key={key}
					data-sync-state=""
					className="max-w-sheet"
					message={text}
					action={
						key === many ? (
							<TextAction aria-expanded={open} onClick={() => setOpen((was) => !was)}>
								{open ? "Hide" : "Show"}
							</TextAction>
						) : undefined
					}
					onDismiss={() => setClosed((was) => new Set([...was, key]))}
				/>
			))}
		</>
	);
}
