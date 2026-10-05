import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { fetchSyncState, type SyncState } from "../api";

/** Said whenever a project's sync changes, so its canvas reads it again. */
export const SYNC_CHANGED = "spool-sync-change";

/**
 * A team project's sync, said on its canvas for as long as it lasts and whenever the canvas opens: that the project
 * ended here, that sync is paused on a limit, and which files didn't travel. A solo project's canvas says nothing.
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
	return state === undefined ? null : <SyncStateLine state={state} />;
}

export function SyncStateLine({ state }: { state: SyncState }) {
	const [open, setOpen] = useState(false);
	const { ended, paused, held } = state;
	if (ended === null && paused === null && held.length === 0) return null;
	return (
		<section
			aria-label="Sync"
			data-sync-state=""
			className="absolute top-4 left-4 z-30 flex max-h-[40vh] w-[380px] flex-col gap-2 overflow-auto rounded-md border border-border-raised bg-raised p-3 type-control"
			onPointerDown={(event) => event.stopPropagation()}
			onWheel={(event) => event.stopPropagation()}
		>
			{ended !== null && (
				<p className="text-text">No longer synced with {ended}. This is now a project on this Mac only.</p>
			)}
			{paused !== null && (
				<p className="text-text">Sync paused: {paused}. Changes stay on this Mac until it lifts.</p>
			)}
			{held.length > 0 && (
				<>
					<button
						type="button"
						aria-expanded={open}
						className="self-start text-text hover:text-muted"
						onClick={() => setOpen((was) => !was)}
					>
						{held.length === 1 ? "1 file" : `${held.length} files`} didn't travel
					</button>
					{open && (
						<ul className="flex flex-col gap-1">
							{held.map(({ path, why }) => (
								<li key={path} className="text-muted type-detail">
									<span className="font-mono text-text">{path}</span> {why}
								</li>
							))}
						</ul>
					)}
				</>
			)}
		</section>
	);
}
