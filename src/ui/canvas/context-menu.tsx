/**
 * The right-click menu (#23), the second door to decided actions only (#7),
 * Play from here / Open in editor / adaptive export / Move to Trash. Export
 * exists only for a frame selection: one frame downloads immediately; a
 * multi-selection opens the format choice.
 * Play is the player's door (#13/#24); the player owns cinema in its own tab.
 */

export interface MenuPlacement {
	x: number;
	y: number;
}

const MENU_WIDTH = 200;
const MENU_HEIGHT_WITH_EXPORT = 162;
const MENU_HEIGHT_WITHOUT_EXPORT = 131;

export function contextMenuSize(canExport: boolean): { w: number; h: number } {
	return { w: MENU_WIDTH, h: canExport ? MENU_HEIGHT_WITH_EXPORT : MENU_HEIGHT_WITHOUT_EXPORT };
}

export function ContextMenu({
	at,
	exportAction,
	onPlay,
	onOpenEditor,
	onReload,
	onTrash,
}: {
	at: MenuPlacement;
	exportAction: { selectionCount: number; onSelect: () => void } | null;
	onPlay: () => void;
	onOpenEditor: () => void;
	onReload: () => void;
	onTrash: () => void;
}) {
	return (
		<div
			role="menu"
			className="absolute z-30 flex w-[200px] flex-col rounded-md border border-border-raised bg-raised p-unit"
			style={{ left: at.x, top: at.y }}
			onPointerDown={(event) => event.stopPropagation()}
			onContextMenu={(event) => event.preventDefault()}
		>
			<button
				type="button"
				role="menuitem"
				className="flex h-[30px] shrink-0 items-center rounded-sm px-3 text-left text-base text-text leading-[14px] hover:bg-surface"
				onClick={onPlay}
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
			<button
				type="button"
				role="menuitem"
				className="flex h-[30px] shrink-0 items-center rounded-sm px-3 text-left text-base text-text leading-[14px] hover:bg-surface"
				onClick={onReload}
			>
				Reload frame
			</button>
			<div className="mx-auto h-px w-[176px] shrink-0 bg-border-raised" />
			{exportAction !== null ? (
				<>
					<button
						type="button"
						role="menuitem"
						className="flex h-[30px] shrink-0 items-center rounded-sm px-3 text-left text-base text-text leading-[14px] hover:bg-surface"
						onClick={exportAction.onSelect}
					>
						{exportAction.selectionCount === 1
							? "Export as PNG"
							: `Export ${exportAction.selectionCount} frames…`}
					</button>
					<div className="mx-auto h-px w-[176px] shrink-0 bg-border-raised" />
				</>
			) : null}
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
