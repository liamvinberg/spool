// The keys the app menu wears, as the canvas page reads them off its hotkey
// register (src/ui/hotkeys.ts) and reports them, so menu and page cannot drift
// and a rebinding later reaches the menu by the same road.
//
// The defaults are what a page that reports nothing gets: one served by a
// daemon from before the report, adopted from the cli, and the moment before
// the canvas has loaded at all. Only these items take a key from the page:
// the canvas's own camera chords stay in the page, where an entered prototype
// can own its keys.
//
// The tab keys have no defaults: a page from before them has nothing to answer
// them with, so their items appear only once the page reports their keys, and
// until then Close Window keeps ⌘W.

export const DEFAULT_MENU_KEYS = {
	"app.new-project": "CmdOrCtrl+N",
	"app.open-project": "CmdOrCtrl+O",
	"app.settings": "CmdOrCtrl+,",
} as const;

export type DefaultKeyedCommand = keyof typeof DEFAULT_MENU_KEYS;

/** Mirrored by the page's TAB_COMMANDS (src/ui/desktop-window.ts). */
export const TAB_COMMANDS = [
	"app.close-tab",
	"app.close-window",
	"app.reopen-tab",
	"app.home",
	"app.next-tab",
	"app.previous-tab",
	"app.tab-1",
	"app.tab-2",
	"app.tab-3",
	"app.tab-4",
	"app.tab-5",
	"app.tab-6",
	"app.tab-7",
	"app.tab-8",
	"app.tab-last",
] as const;

export type TabCommand = (typeof TAB_COMMANDS)[number];

export type KeyedCommand = DefaultKeyedCommand | TabCommand;

export type MenuKeys = Partial<Record<KeyedCommand, string>>;

/** An Electron accelerator as the page's converter writes one (hotkey-combos.ts). */
const ACCELERATOR =
	/^(?:(?:CmdOrCtrl|Ctrl|Alt|Shift)\+){0,4}(?:[A-Z0-9]|F[0-9]{1,2}|Space|Escape|Enter|Tab|Backspace|Delete|Plus|Left|Right|Up|Down|[-=/,[\]])$/;

function keyed(command: string): command is KeyedCommand {
	return Object.hasOwn(DEFAULT_MENU_KEYS, command) || (TAB_COMMANDS as readonly string[]).includes(command);
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

/**
 * The keys after the page reports `value`, or undefined when they stand as
 * they are. A page navigated away reports nothing, so its keys go with it: the
 * page that loads next may be an older daemon's that answers none of them.
 */
export function nextMenuKeys(current: MenuKeys, value: unknown): MenuKeys | undefined {
	const next = reportedMenuKeys(value);
	return JSON.stringify(next) === JSON.stringify(current) ? undefined : next;
}

/** The accelerator a keyed item wears: the page's, else its default. */
export function menuKey(command: DefaultKeyedCommand, reported: MenuKeys): string {
	return reported[command] ?? DEFAULT_MENU_KEYS[command];
}

/** Whether the page answers the tab keys: it reports Close Tab's. */
export function answersTabs(reported: MenuKeys): boolean {
	return reported["app.close-tab"] !== undefined;
}

/** Close Window keeps ⌘W until the page answers Close Tab, and then wears the page's key for it. */
export function closeWindowKey(reported: MenuKeys): string | undefined {
	return answersTabs(reported) ? reported["app.close-window"] : "CmdOrCtrl+W";
}

export interface TabItem {
	command: TabCommand;
	label: string;
	accelerator: string;
	visible: boolean;
}

/** A tab key's menu item, once the page reports its key; `visible: false` keeps only the key. */
export function tabItem(command: TabCommand, label: string, reported: MenuKeys, visible = true): TabItem | undefined {
	const accelerator = reported[command];
	return accelerator === undefined ? undefined : { command, label, accelerator, visible };
}
