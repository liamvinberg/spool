/**
 * The right-click menu (#23), the second door to decided actions only (#7),
 * matching screens v1 verbatim: Play from here / Open in editor / separator /
 * Move to Trash, 200px raised panel, 30px rows, hover = surface. Play is the
 * player's door (#13) and stays disabled until the player exists (#24) —
 * modes control time, so the canvas never fakes play by entering.
 */

export interface MenuPlacement {
	x: number;
	y: number;
}

/** The rendered footprint (4px pad + three 30px rows + 1px separator + border) — placement clamps with it. */
export const MENU_SIZE = { w: 200, h: 101 } as const;

export function ContextMenu({
	at,
	onPlay,
	onOpenEditor,
	onTrash,
}: {
	at: MenuPlacement;
	/** null renders Play from here disabled — the player arrives with #24. */
	onPlay: (() => void) | null;
	onOpenEditor: () => void;
	onTrash: () => void;
}) {
	return (
		<div
			role="menu"
			className="absolute z-10 flex w-[200px] flex-col rounded-md border border-border-raised bg-raised p-unit"
			style={{ left: at.x, top: at.y }}
			onPointerDown={(event) => event.stopPropagation()}
			onContextMenu={(event) => event.preventDefault()}
		>
			<button
				type="button"
				role="menuitem"
				className={`flex h-[30px] shrink-0 items-center rounded-sm px-3 text-left text-base leading-[14px] ${
					onPlay === null ? "text-muted" : "text-text hover:bg-surface"
				}`}
				disabled={onPlay === null}
				title={onPlay === null ? "The player arrives with #24" : undefined}
				onClick={onPlay ?? undefined}
			>
				Play from here
			</button>
			<button
				type="button"
				role="menuitem"
				className="flex h-[30px] shrink-0 items-center rounded-sm px-3 text-left text-base text-text leading-[14px] hover:bg-surface"
				onClick={onOpenEditor}
			>
				Open in editor
			</button>
			<div className="mx-auto h-px w-[176px] shrink-0 bg-border-raised" />
			<button
				type="button"
				role="menuitem"
				className="flex h-[30px] shrink-0 items-center rounded-sm px-3 text-left text-base text-text leading-[14px] hover:bg-surface"
				onClick={onTrash}
			>
				Move to Trash
			</button>
		</div>
	);
}
