// Mirrors src/ui/canvas/context-menu.tsx.
// The hotkey faces are handed in rather than read off the register.

/**
 * The right-click menu, the second door to decided actions only: Play from
 * here / Copy path / Reload / Tidy / adaptive export / Move to Trash. Export
 * exists only for a frame selection: one frame downloads immediately, a
 * multi-selection opens the format choice. Tidy is always here — it lays out
 * the field, so it answers to no one frame.
 *
 * Every item that has a bare key wears it, so the menu teaches the shortcut
 * that replaces it. Copying the source path is the one verb without one: it
 * hands the file to something outside spool, which is not a reflex the hands
 * need a key for.
 */

export interface MenuPlacement {
	x: number;
	y: number;
}

const MENU_WIDTH = 200;
const MENU_HEIGHT_WITH_EXPORT = 192;
const MENU_HEIGHT_WITHOUT_EXPORT = 162;

export function contextMenuSize(canExport: boolean): { w: number; h: number } {
	return { w: MENU_WIDTH, h: canExport ? MENU_HEIGHT_WITH_EXPORT : MENU_HEIGHT_WITHOUT_EXPORT };
}

/**
 * One row of a spool menu. The rail's menus are built from this too, so a
 * right-click means the same thing everywhere: the same height, the same key
 * face, and the same word for the same verb.
 */
export function MenuItem({
	label,
	keys,
	disabled = false,
	go,
	onClick,
}: {
	label: string;
	keys?: string | undefined;
	/** an item that exists but has nothing to act on right now — told, not hidden */
	disabled?: boolean;
	/** a walk target, for a menu standing on a frame that plays one */
	go?: string | undefined;
	onClick?: (() => void) | undefined;
}) {
	return (
		<button
			type="button"
			role="menuitem"
			data-go={go}
			disabled={disabled}
			className={`flex h-[30px] shrink-0 items-center justify-between gap-3 rounded-sm px-3 text-left text-base leading-[14px] ${
				disabled ? "text-muted/40" : "text-text hover:bg-surface"
			}`}
			onClick={onClick}
		>
			<span className="truncate">{label}</span>
			{/* the UI face, not the mono the tooltips wear: it has no ⇧ or ⌫, and
			    the fallback draws them at metrics that read as smudges */}
			{keys === undefined ? null : (
				<span className={`shrink-0 text-sm ${disabled ? "text-muted/30" : "text-muted"}`}>{keys}</span>
			)}
		</button>
	);
}

export function MenuRule() {
	return <div className="mx-auto h-px w-[176px] shrink-0 bg-border-raised" />;
}

/** The shipped keys, as the register spells them on this platform. */
export interface MenuKeys {
	play?: string | undefined;
	reload?: string | undefined;
	tidy?: string | undefined;
	trash?: string | undefined;
}

const KEYS: MenuKeys = { play: "P", reload: "R", tidy: "⇧A", trash: "⌫" };

export function ContextMenu({
	at,
	exportAction = null,
	tidyLabel = "Tidy page",
	keys = KEYS,
	playTarget,
	onTidy,
	onPlay,
	onCopyPath,
	onReload,
	onTrash,
}: {
	at: MenuPlacement;
	exportAction?: { selectionCount: number; onSelect?: () => void } | null;
	tidyLabel?: string;
	keys?: MenuKeys;
	/** the frame Play walks to, for a specimen standing inside the player's flow */
	playTarget?: string | undefined;
	onTidy?: (() => void) | undefined;
	onPlay?: (() => void) | undefined;
	onCopyPath?: (() => void) | undefined;
	onReload?: (() => void) | undefined;
	onTrash?: (() => void) | undefined;
}) {
	return (
		<div
			role="menu"
			className="absolute z-30 flex w-[200px] flex-col rounded-md border border-border-raised bg-raised p-unit"
			style={{ left: at.x, top: at.y }}
			onPointerDown={(event) => event.stopPropagation()}
			onContextMenu={(event) => event.preventDefault()}
		>
			<MenuItem label="Play from here" keys={keys.play} go={playTarget} onClick={onPlay} />
			<MenuItem label="Copy path" onClick={onCopyPath} />
			<MenuItem label="Reload frame" keys={keys.reload} onClick={onReload} />
			<MenuRule />
			<MenuItem label={tidyLabel} keys={keys.tidy} onClick={onTidy} />
			{exportAction !== null ? (
				<MenuItem
					label={
						exportAction.selectionCount === 1 ? "Export as PNG" : `Export ${exportAction.selectionCount} frames…`
					}
					onClick={exportAction.onSelect}
				/>
			) : null}
			<MenuRule />
			<MenuItem label="Move to Trash" keys={keys.trash} onClick={onTrash} />
		</div>
	);
}
