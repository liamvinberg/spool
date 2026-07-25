/**
 * The right-click menu (#23), the second door to decided actions only (#7),
 * Play from here / Open in editor / Reload / Tidy / adaptive export / Move to
 * Trash. Export exists only for a frame selection: one frame downloads
 * immediately; a multi-selection opens the format choice. Tidy is always here —
 * it lays out the field, so it answers to no one frame.
 * Play is the player's door (#13/#24); the player owns cinema in its own tab.
 *
 * Every item that has a bare key wears it, so the menu teaches the shortcut
 * that replaces it. Opening the source is the one verb without one: it leaves
 * the canvas for an editor, which is not something the hands do by reflex.
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

function Item({ label, keys, onClick }: { label: string; keys?: string; onClick: () => void }) {
	return (
		<button
			type="button"
			role="menuitem"
			className="flex h-[30px] shrink-0 items-center justify-between gap-3 rounded-sm px-3 text-left text-base text-text leading-[14px] hover:bg-surface"
			onClick={onClick}
		>
			<span className="truncate">{label}</span>
			{/* the UI face, not the mono the tooltips wear: it has no ⇧ or ⌫, and
			    the fallback draws them at metrics that read as smudges */}
			{keys === undefined ? null : <span className="shrink-0 text-sm text-muted">{keys}</span>}
		</button>
	);
}

function Rule() {
	return <div className="mx-auto h-px w-[176px] shrink-0 bg-border-raised" />;
}

export function ContextMenu({
	at,
	exportAction,
	tidyLabel,
	onTidy,
	onPlay,
	onOpenEditor,
	onReload,
	onTrash,
}: {
	at: MenuPlacement;
	exportAction: { selectionCount: number; onSelect: () => void } | null;
	tidyLabel: string;
	onTidy: () => void;
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
			<Item label="Play from here" keys="P" onClick={onPlay} />
			<Item label="Open in editor" onClick={onOpenEditor} />
			<Item label="Reload frame" keys="R" onClick={onReload} />
			<Rule />
			<Item label={tidyLabel} keys="⇧A" onClick={onTidy} />
			{exportAction !== null ? (
				<Item
					label={
						exportAction.selectionCount === 1 ? "Export as PNG" : `Export ${exportAction.selectionCount} frames…`
					}
					keys="E"
					onClick={exportAction.onSelect}
				/>
			) : null}
			<Rule />
			<Item label="Move to Trash" keys="⌫" onClick={onTrash} />
		</div>
	);
}
