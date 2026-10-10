import { useEffect } from "react";
import { attachHotkeyLayer, type HotkeyHandler } from "./hotkey-dispatch";
import { HOTKEY_GROUPS, type HotkeyEntry, type HotkeyIdFor, hotkeyChips, listedHotkeys } from "./hotkeys";
import { Kbd } from "./primitives/display";

/**
 * The shortcut sheet: press `?` and the whole register is told, grouped and
 * in the register's own order. It is a reading surface, so it draws every
 * group wherever it opens — Home's one shortcut is worth knowing from the
 * canvas too. Rendered straight from the register: a binding that exists is
 * a binding that is told, and there is nothing to keep in step by hand.
 */

export function HotkeySheet({ onClose }: { onClose: () => void }) {
	// the sheet is modal the way the finder is: its scope owns the keys, and
	// both the summon key and esc put it away
	useEffect(() => {
		return attachHotkeyLayer({
			scope: "help",
			handlers: {
				"help.close": (event) => {
					event?.preventDefault();
					onClose();
				},
			} satisfies Record<HotkeyIdFor<"help">, HotkeyHandler>,
		});
	}, [onClose]);

	return (
		<>
			<div className="absolute inset-0 z-30 animate-find-in bg-surface-window/48 backdrop-blur-[2px]">
				<button
					type="button"
					aria-label="Close the shortcut sheet"
					tabIndex={-1}
					className="absolute inset-0 cursor-default"
					onMouseDown={onClose}
				/>
			</div>
			<div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center px-8">
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Shortcuts"
					className="pointer-events-auto flex max-h-[calc(100%-128px)] w-[760px] animate-find-panel-in flex-col overflow-hidden rounded-lg border border-line-strong bg-surface-panel"
				>
					<header className="flex h-12 shrink-0 items-center justify-between border-line-default border-b px-6">
						<span className="font-semibold text-primary tracking-tight type-title">Shortcuts</span>
						<span className="text-secondary type-detail">esc closes</span>
					</header>
					<div className="overflow-y-auto px-6 py-5">
						<div className="columns-2 gap-x-12">
							{HOTKEY_GROUPS.map((group) => {
								const rows = listedHotkeys(group);
								if (rows.length === 0) return null;
								return (
									<section key={group} className="mb-5 break-inside-avoid">
										<h3 className="mb-1.5 text-secondary type-label">{group}</h3>
										{rows.map((entry) => (
											<Row key={entry.id} entry={entry} />
										))}
									</section>
								);
							})}
						</div>
					</div>
				</div>
			</div>
		</>
	);
}

function Row({ entry }: { entry: HotkeyEntry }) {
	const { keys, gesture } = hotkeyChips(entry);
	return (
		<div className="flex h-7 items-center justify-between gap-4">
			<span className="truncate text-primary type-control">{entry.label}</span>
			<span className="flex shrink-0 items-center gap-1.5">
				{keys.map((face) => (
					<Kbd key={face}>{face}</Kbd>
				))}
				{gesture === undefined ? null : <span className="text-secondary type-detail">{gesture}</span>}
			</span>
		</div>
	);
}
