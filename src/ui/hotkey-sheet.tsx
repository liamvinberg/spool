import { useEffect, useState } from "react";
import { learnKeyboardLayout } from "./hotkey-combos";
import { attachHotkeyLayer, type HotkeyHandler } from "./hotkey-dispatch";
import { HOTKEY_GROUPS, type HotkeyEntry, type HotkeyIdFor, hotkeyChips, listedHotkeys } from "./hotkeys";
import { Kbd } from "./primitives/display";
import { Scrim, Sheet } from "./primitives/overlays";

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

	// keys matched by place wear this layout's glyph (⌘¨ on Swedish) once read
	const [, setLayoutRead] = useState(false);
	useEffect(() => {
		let open = true;
		void learnKeyboardLayout().then((learned) => {
			if (open && learned) setLayoutRead(true);
		});
		return () => {
			open = false;
		};
	}, []);

	return (
		<>
			<Scrim label="Close the shortcut sheet" onMouseDown={onClose} />
			<div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center px-8">
				<Sheet
					aria-label="Shortcuts"
					title="Shortcuts"
					hint="esc closes"
					className="pointer-events-auto max-h-[calc(100%-128px)]"
				>
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
				</Sheet>
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
