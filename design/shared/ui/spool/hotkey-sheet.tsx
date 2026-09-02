// Mirrors src/ui/hotkey-sheet.tsx.
// The register is handed in as rows; the hotkey layer that closes it is the frame's.

/**
 * The shortcut sheet: press `?` and the whole register is told, grouped and in
 * the register's own order. It is a reading surface, so it draws every group
 * wherever it opens — Home's one shortcut is worth knowing from the canvas too.
 * Rendered straight from the register: a binding that exists is a binding that
 * is told, and there is nothing to keep in step by hand.
 */

export interface HotkeyRow {
	readonly id: string;
	readonly label: string;
	/** the key faces, already spelled for this platform */
	readonly keys: readonly string[];
	/** a pointer move that means a command, told beside the keys */
	readonly gesture?: string | undefined;
}

export interface HotkeyGroupRows {
	readonly group: string;
	readonly rows: readonly HotkeyRow[];
}

export function HotkeySheet({
	groups,
	onClose,
}: {
	groups: readonly HotkeyGroupRows[];
	onClose?: (() => void) | undefined;
}) {
	return (
		<>
			<div className="absolute inset-0 z-30 animate-find-in bg-bg/48 backdrop-blur-[2px]">
				<button
					type="button"
					aria-label="Close the shortcut sheet"
					tabIndex={-1}
					className="absolute inset-0 cursor-default"
					onMouseDown={onClose}
				/>
			</div>
			<div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-8">
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Shortcuts"
					className="pointer-events-auto flex max-h-[calc(100%-128px)] w-[760px] animate-find-panel-in flex-col overflow-hidden rounded-lg border border-border-raised bg-surface"
				>
					<header className="flex h-12 shrink-0 items-center justify-between border-border border-b px-6">
						<span className="font-semibold text-md text-text tracking-tight leading-md">Shortcuts</span>
						<span className="font-mono text-2xs text-muted leading-3">esc closes</span>
					</header>
					<div className="overflow-y-auto px-6 py-5">
						<div className="columns-2 gap-x-12">
							{groups.map(({ group, rows }) =>
								rows.length === 0 ? null : (
									<section key={group} className="mb-5 break-inside-avoid">
										<h3 className="mb-1.5 text-muted text-sm leading-sm">{group}</h3>
										{rows.map((row) => (
											<Row key={row.id} row={row} />
										))}
									</section>
								),
							)}
						</div>
					</div>
				</div>
			</div>
		</>
	);
}

function Row({ row }: { row: HotkeyRow }) {
	return (
		<div className="flex h-7 items-center justify-between gap-4">
			<span className="truncate text-base text-text leading-base">{row.label}</span>
			<span className="flex shrink-0 items-center gap-1.5">
				{row.keys.map((face) => (
					<kbd
						key={face}
						className="flex h-5 min-w-5 items-center justify-center rounded-xs border border-border-raised bg-raised px-1.5 font-mono text-2xs text-muted leading-none"
					>
						{face}
					</kbd>
				))}
				{row.gesture === undefined ? null : (
					<span className="font-mono text-2xs text-muted/70 leading-3">{row.gesture}</span>
				)}
			</span>
		</div>
	);
}
