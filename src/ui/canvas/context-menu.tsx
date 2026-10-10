/**
 * The right-click menu (#23), the second door to decided actions only (#7),
 * Play from here / Copy path / Reload / Set as thumbnail / Tidy / adaptive
 * export / the frame's link / Move to Trash. Set as thumbnail makes the frame's
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

/** `shareRows` is the sharing verbs the menu carries: none, the one that makes a link, or a live link's three. */
export function contextMenuSize(canExport: boolean, shareRows: 0 | 1 | 3 = 0): { w: number; h: number } {
	const rows = 6 + (canExport ? 1 : 0) + shareRows;
	const rules = 2 + (shareRows === 0 ? 0 : 1);
	return { w: MENU_WIDTH, h: rows * ROW + rules * RULE + FRAME };
}

/**
 * The frame's link. Before it exists it is one row that copies a new one; after,
 * the row becomes the three verbs a live link has, so ending it is never buried
 * inside the popover that made it.
 */
export interface MenuShare {
	shared: boolean;
	onCopy: () => void;
	onManage: () => void;
	onStop: () => void;
}

export function ContextMenu({
	at,
	exportAction,
	tidyLabel,
	onTidy,
	onPlay,
	share,
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
	share?: MenuShare | undefined;
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
			{share !== undefined && (
				<>
					<MenuSeparator />
					{share.shared ? (
						<>
							<MenuItem label="Copy link" onClick={share.onCopy} />
							<MenuItem label="Sharing…" onClick={share.onManage} />
							<MenuItem label="Stop sharing…" onClick={share.onStop} />
						</>
					) : (
						<MenuItem label="Copy share link" onClick={share.onCopy} />
					)}
				</>
			)}
			<MenuSeparator />
			<MenuItem label="Move to Trash" shortcut={hotkeyKey("canvas.trash")} onClick={onTrash} />
		</Menu>
	);
}
