/**
 * The right-click menu (#23), the second door to decided actions only (#7),
 * Play from here / Open in editor / adaptive export / Move to Trash. One frame
 * exports as PNG immediately; a multi-selection opens the format choice.
 * Play is the player's door (#13/#24) — modes control time, so the canvas
 * never fakes play by entering; the player owns cinema in its own tab.
 */

export interface MenuPlacement {
	x: number;
	y: number;
}

/** The rendered footprint (4px pad + four 30px rows + two separators + border) — placement clamps with it. */
export const MENU_SIZE = { w: 200, h: 132 } as const;

export function ContextMenu({
	at,
	selectionCount,
	onExport,
	onPlay,
	onOpenEditor,
	onTrash,
}: {
	at: MenuPlacement;
	selectionCount: number;
	onExport: () => void;
	onPlay: () => void;
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
			<div className="mx-auto h-px w-[176px] shrink-0 bg-border-raised" />
			<button
				type="button"
				role="menuitem"
				className="flex h-[30px] shrink-0 items-center rounded-sm px-3 text-left text-base text-text leading-[14px] hover:bg-surface"
				onClick={onExport}
			>
				{selectionCount === 1 ? "Export as PNG" : `Export ${selectionCount} frames…`}
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
