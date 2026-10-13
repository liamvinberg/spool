/**
 * The right-click menu (#23), the second door to decided actions only (#7),
 * Play from here / Copy path / Reload / Set as thumbnail / Tidy / adaptive
 * export / Move to Trash. Set as thumbnail makes the frame's
 * still as it is now the project's picture on Home; it waits, disabled, until
 * the frame has one. Export exists only for a frame selection: one frame downloads
 * immediately; a multi-selection opens the format choice. Tidy is always here —
 * it lays out the field, so it answers to no one frame.
 * Play is the player's door (#13/#24); the player owns cinema in its own tab.
 *
 * Every item that has a bare key wears it, so the menu teaches the shortcut
 * that replaces it. Copying the source path is the one verb without one: it
 * hands the file to something outside spool, which is not a reflex the hands
 * need a key for.
 */

import { hotkeyKey } from "../hotkeys";
import { Menu, MenuItem, MenuSeparator } from "../primitives/overlays";

export interface MenuPlacement {
	x: number;
	y: number;
}

/** the menu's box: rows and rules in a 4px inset, inside a hairline */
const MENU_WIDTH = 200;
const ROW = 28;
const RULE = 9;
const FRAME = 10;

export function contextMenuSize(canExport: boolean): { w: number; h: number } {
	const rows = 6 + (canExport ? 1 : 0);
	const rules = 2;
	return { w: MENU_WIDTH, h: rows * ROW + rules * RULE + FRAME };
}

export function ContextMenu({
	at,
	exportAction,
	tidyLabel,
	onTidy,
	onPlay,
	onCopyPath,
	onReload,
	onSetThumbnail,
	onTrash,
}: {
	at: MenuPlacement;
	exportAction: { selectionCount: number; onSelect: () => void } | null;
	tidyLabel: string;
	onTidy: () => void;
	onPlay: () => void;
	onCopyPath: () => void;
	onReload: () => void;
	/** "Set as thumbnail"; absent while the frame has no still, which leaves the item disabled. */
	onSetThumbnail?: (() => void) | undefined;
	onTrash: () => void;
}) {
	return (
		<Menu
			className="absolute z-30"
			style={{ left: at.x, top: at.y }}
			onPointerDown={(event) => event.stopPropagation()}
			onContextMenu={(event) => event.preventDefault()}
		>
			<MenuItem label="Play from here" shortcut={hotkeyKey("canvas.play")} onClick={onPlay} />
			<MenuItem label="Copy path" onClick={onCopyPath} />
			<MenuItem label="Reload frame" shortcut={hotkeyKey("canvas.reload")} onClick={onReload} />
			<MenuItem
				label="Set as thumbnail"
				disabled={onSetThumbnail === undefined}
				onClick={() => onSetThumbnail?.()}
			/>
			<MenuSeparator />
			<MenuItem label={tidyLabel} shortcut={hotkeyKey("canvas.tidy")} onClick={onTidy} />
			{exportAction !== null ? (
				<MenuItem
					label={
						exportAction.selectionCount === 1 ? "Export as PNG" : `Export ${exportAction.selectionCount} frames…`
					}
					onClick={exportAction.onSelect}
				/>
			) : null}
			<MenuSeparator />
			<MenuItem label="Move to Trash" shortcut={hotkeyKey("canvas.trash")} onClick={onTrash} />
		</Menu>
	);
}
