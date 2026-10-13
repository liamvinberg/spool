// The keys the app menu wears, as the canvas page reads them off its hotkey
// register (src/ui/hotkeys.ts) and reports them, so menu and page cannot drift
// and a rebinding later reaches the menu by the same road.
//
// The defaults are what a page that reports nothing gets: one served by a
// daemon from before the report, adopted from the cli, and the moment before
// the canvas has loaded at all. Only these items take a key from the page:
// the canvas's own camera chords stay in the page, where an entered prototype
// can own its keys.

export const DEFAULT_MENU_KEYS = {
	"app.new-project": "CmdOrCtrl+N",
	"app.open-project": "CmdOrCtrl+O",
	"app.settings": "CmdOrCtrl+,",
} as const;

export type KeyedCommand = keyof typeof DEFAULT_MENU_KEYS;

export type MenuKeys = Partial<Record<KeyedCommand, string>>;

/** An Electron accelerator as the page's converter writes one (hotkey-combos.ts). */
const ACCELERATOR =
	/^(?:(?:CmdOrCtrl|Ctrl|Alt|Shift)\+){0,4}(?:[A-Z0-9]|F[0-9]{1,2}|Space|Escape|Enter|Tab|Backspace|Delete|Plus|Left|Right|Up|Down|[-=/,[\]])$/;

function keyed(command: string): command is KeyedCommand {
	return Object.hasOwn(DEFAULT_MENU_KEYS, command);
}

/** What the page reported, kept only where it names a keyed item and a real accelerator. */
export function reportedMenuKeys(value: unknown): MenuKeys {
	const keys: MenuKeys = {};
	if (typeof value !== "object" || value === null) return keys;
	for (const [command, accelerator] of Object.entries(value)) {
		if (keyed(command) && typeof accelerator === "string" && ACCELERATOR.test(accelerator)) {
			keys[command] = accelerator;
		}
	}
	return keys;
}

/** The accelerator a keyed item wears: the page's, else its default. */
export function menuKey(command: KeyedCommand, reported: MenuKeys): string {
	return reported[command] ?? DEFAULT_MENU_KEYS[command];
}
