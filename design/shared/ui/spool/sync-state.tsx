/**
 * A team project's sync, said on its canvas for as long as it lasts (`src/ui/canvas/sync-state.tsx`): that the project
 * ended here, that sync is paused on a limit, and which files didn't travel. Drawn with the file list open.
 */
export interface SyncState {
	ended: string | null;
	paused: string | null;
	held: { path: string; why: string }[];
}

export function SyncStateLine({ state, open = false }: { state: SyncState; open?: boolean }) {
	const { ended, paused, held } = state;
	return (
		<section
			aria-label="Sync"
			className="absolute top-4 left-4 z-30 flex max-h-[40vh] w-[380px] flex-col gap-2 overflow-auto rounded-md border border-border-raised bg-raised p-3 type-control"
		>
			{ended !== null && <p className="text-text">No longer synced with {ended}. This is now a project on this Mac only.</p>}
			{paused !== null && <p className="text-text">Sync paused: {paused}. Changes stay on this Mac until it lifts.</p>}
			{held.length > 0 && (
				<>
					<button type="button" aria-expanded={open} className="self-start text-text hover:text-muted">
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
