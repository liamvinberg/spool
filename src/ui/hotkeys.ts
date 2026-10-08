import { accelLabel } from "../runtime/platform-keys";
import { formatCombo } from "./hotkey-combos";

/**
 * The hotkey register: every shortcut and command-gesture spool answers, as
 * data. Dispatch reads it to route keys (hotkey-dispatch.ts), the `?` sheet
 * renders it, and menus and tooltips take their key faces from it, so a
 * binding cannot drift from what the app says about it.
 *
 * A scope is who may answer while it is up, from the most modal down to the
 * app shell; dispatch walks them in order and an exclusive scope swallows
 * whatever it does not answer, the way the finder and the export dialog
 * always have. Entries with `keys` dispatch; entries with only a `gesture`
 * are told on the sheet and handled where the pointer already lives.
 *
 * What a binding needs to *act* — a selection, not being inside a frame, an
 * idle gesture — stays in its handler beside the state it reads. The register
 * only knows what exists, never what is currently possible.
 */

export type HotkeyScope =
	| "dialog"
	| "finder"
	| "picker"
	| "help"
	| "settings"
	| "toast"
	| "sidebar"
	| "panes"
	| "canvas"
	| "home"
	| "app";

/**
 * Most modal first; dispatch stops at the first exclusive scope that is up.
 * The toast sits above help on purpose: an undo window keeps draining while
 * the sheet is read, so ⌘Z must reach it even then.
 *
 * The sidebar sits above the canvas and is not exclusive (#229): while the
 * rail has focus its own list answers ⌫, ↵ and the arrows, and every key it
 * does not claim carries on to the canvas exactly as it did before. The panes
 * answer only chords nothing else binds, so where they sit in the walk is moot.
 */
export const SCOPE_PRIORITY: readonly HotkeyScope[] = [
	"dialog",
	"finder",
	"picker",
	"toast",
	"help",
	"settings",
	"sidebar",
	"panes",
	"canvas",
	"home",
	"app",
];

/** Scopes that own the keyboard outright while they are up. */
export const EXCLUSIVE_SCOPES: ReadonlySet<HotkeyScope> = new Set(["dialog", "finder", "picker", "help", "settings"]);

export const HOTKEY_GROUPS = [
	"Frames",
	"Selection",
	"Camera",
	"Tools",
	"Find and jump",
	"Threads",
	"Pages",
	"Panes",
	"Undo",
	"Home",
	"Settings",
	"Help",
] as const;

export type HotkeyGroup = (typeof HOTKEY_GROUPS)[number];

interface HotkeySpec {
	readonly id: string;
	readonly scope: HotkeyScope;
	readonly group: HotkeyGroup;
	/** what it does, told plainly on the sheet */
	readonly label: string;
	/** combo strings (hotkey-combos.ts grammar); the first is the face menus wear */
	readonly keys?: readonly string[];
	/** a pointer move that means a command, told beside the keys */
	readonly gesture?: string | (() => string);
	/** overrides the derived key faces where the derivation would mislead */
	readonly shown?: readonly string[] | (() => readonly string[]);
	/** false: held-key repeats are ignored (default: they fire) */
	readonly repeats?: false;
	/** false: dispatch-only plumbing, never a row on the sheet */
	readonly listed?: false;
	/** true: answers even from a text field, for chords that mean nothing to text */
	readonly typing?: true;
}

/** The accel face without its joining `+`: `⌘`, `ctrl`. */
function accelBare(): string {
	return accelLabel().replace(/\+$/, "");
}

export const HOTKEYS = [
	// --- Frames ---------------------------------------------------------------
	{
		id: "canvas.enter",
		scope: "canvas",
		group: "Frames",
		label: "Enter the selected frame",
		keys: ["enter"],
		gesture: "double-click",
		repeats: false,
	},
	{
		id: "canvas.leave",
		scope: "canvas",
		group: "Frames",
		label: "Leave the frame you are inside",
		keys: ["accel+escape"],
		shown: () => ["esc", `${accelLabel()}esc`],
	},
	{
		id: "canvas.play",
		scope: "canvas",
		group: "Frames",
		label: "Play the flow from here",
		keys: ["p"],
		repeats: false,
	},
	{ id: "canvas.reload", scope: "canvas", group: "Frames", label: "Reload the selected frames", keys: ["r"] },
	// Export gave up `e` to the Edit tool: it is an occasional act, and the
	// frame's own menu has carried it all along.
	{
		id: "canvas.export",
		scope: "canvas",
		group: "Frames",
		label: "Export the selection as PNG",
		gesture: "right-click a frame",
	},
	{
		id: "canvas.trash",
		scope: "canvas",
		group: "Frames",
		label: "Move the selection to the Trash",
		keys: ["backspace", "delete"],
		shown: ["⌫"],
	},
	{
		id: "canvas.tidy",
		scope: "canvas",
		group: "Frames",
		label: "Tidy the frames",
		keys: ["shift+a"],
		repeats: false,
	},
	{ id: "canvas.menu", scope: "canvas", group: "Frames", label: "Open the frame menu", gesture: "right-click" },
	{ id: "canvas.move", scope: "canvas", group: "Frames", label: "Move a frame", gesture: "drag" },
	{
		id: "canvas.resize",
		scope: "canvas",
		group: "Frames",
		label: "Resize the selected frame",
		gesture: "drag a corner",
	},

	// --- Selection ------------------------------------------------------------
	{ id: "canvas.select", scope: "canvas", group: "Selection", label: "Select a frame", gesture: "click" },
	{
		id: "canvas.marquee",
		scope: "canvas",
		group: "Selection",
		label: "Select frames in a sweep",
		gesture: "drag empty canvas",
	},
	{
		id: "canvas.select-add",
		scope: "canvas",
		group: "Selection",
		label: "Add or remove a frame",
		gesture: "⇧ click",
	},
	{
		id: "canvas.select-element",
		scope: "canvas",
		group: "Selection",
		label: "Select the deepest element under the cursor",
		gesture: () => `${accelBare()} click`,
	},
	// The Edit tool's keys (#339): a click takes the deepest element, and the
	// keys step from what is held. ⏎ opens the words or the children and ⌘⏎ is
	// the same from Select, which ⌘ borrows Edit in; ⇧⏎ and Esc climb to the
	// parent, Tab walks round the siblings and ⌘A takes all of them.
	{
		id: "canvas.descend",
		scope: "canvas",
		group: "Selection",
		label: "Edit the words, or select the children",
		keys: ["accel+enter"],
		repeats: false,
	},
	{
		id: "canvas.ascend",
		scope: "canvas",
		group: "Selection",
		label: "Select the parent",
		keys: ["shift+enter"],
		repeats: false,
	},
	{
		id: "canvas.sibling",
		scope: "canvas",
		group: "Selection",
		label: "Select the next element, or the one before",
		keys: ["tab", "shift+tab"],
	},
	{
		id: "canvas.select-siblings",
		scope: "canvas",
		group: "Selection",
		label: "Select the element and its siblings",
		keys: ["accel+a"],
		repeats: false,
	},
	// The words of the element held (#323), from a key that hit-tests nothing.
	// F2 is the sidebar's own rename key; ⏎ is handed over by `canvas.enter`
	// before it means anything else, so the face says both.
	{
		id: "canvas.words",
		scope: "canvas",
		group: "Selection",
		label: "Edit the words of the element held",
		keys: ["f2"],
		shown: ["⏎", "F2"],
		repeats: false,
	},
	{ id: "canvas.accel-hold", scope: "canvas", group: "Selection", label: "", keys: ["accel"], listed: false },
	{
		id: "canvas.nudge",
		scope: "canvas",
		group: "Selection",
		label: "Nudge the frames 1 px, or move the element held one step",
		keys: ["arrowleft", "arrowright", "arrowup", "arrowdown"],
		shown: ["←↑→↓"],
	},
	{
		id: "canvas.nudge-far",
		scope: "canvas",
		group: "Selection",
		label: "Nudge 10 px",
		keys: ["shift+arrowleft", "shift+arrowright", "shift+arrowup", "shift+arrowdown"],
		shown: ["⇧←↑→↓"],
	},
	{
		id: "canvas.step",
		scope: "canvas",
		group: "Selection",
		label: "Select the neighbouring frame",
		keys: ["alt+arrowleft", "alt+arrowright", "alt+arrowup", "alt+arrowdown"],
		shown: ["⌥←↑→↓"],
	},
	{
		id: "canvas.escape",
		scope: "canvas",
		group: "Selection",
		label: "Step back out, one layer at a time",
		keys: ["escape"],
	},

	// --- Camera ---------------------------------------------------------------
	{
		id: "canvas.zoom-in",
		scope: "canvas",
		group: "Camera",
		label: "Zoom in",
		keys: ["accel+plus", "accel+equals", "plus", "equals"],
		shown: () => [`${accelLabel()}+`],
	},
	{
		id: "canvas.zoom-out",
		scope: "canvas",
		group: "Camera",
		label: "Zoom out",
		keys: ["accel+minus", "minus"],
		shown: () => [`${accelLabel()}-`],
	},
	{ id: "canvas.zoom-reset", scope: "canvas", group: "Camera", label: "Zoom to 100%", keys: ["0"] },
	{ id: "canvas.fit-all", scope: "canvas", group: "Camera", label: "Zoom to fit every frame", keys: ["shift+1"] },
	{
		id: "canvas.fit-selection",
		scope: "canvas",
		group: "Camera",
		label: "Zoom to fit the selection",
		keys: ["shift+2"],
	},
	{ id: "canvas.space-hold", scope: "canvas", group: "Camera", label: "", keys: ["space"], listed: false },
	{
		id: "canvas.pan",
		scope: "canvas",
		group: "Camera",
		label: "Pan the canvas",
		gesture: "space drag · middle drag · scroll",
	},
	{
		id: "canvas.zoom-cursor",
		scope: "canvas",
		group: "Camera",
		label: "Zoom at the cursor",
		gesture: () => `${accelBare()} scroll · pinch`,
	},

	// --- Tools ----------------------------------------------------------------
	{ id: "canvas.tool-select", scope: "canvas", group: "Tools", label: "Select tool", keys: ["v"] },
	{ id: "canvas.tool-edit", scope: "canvas", group: "Tools", label: "Edit tool", keys: ["e"] },
	{
		id: "canvas.tool-hand",
		scope: "canvas",
		group: "Tools",
		label: "Hand tool",
		keys: ["h"],
		gesture: "hold space",
	},

	// --- Find and jump ----------------------------------------------------------
	{
		id: "canvas.find",
		scope: "canvas",
		group: "Find and jump",
		label: "Find a frame",
		keys: ["slash", "accel+k"],
		shown: () => ["/", `${accelLabel()}K`],
		repeats: false,
	},
	{
		id: "canvas.jump-back",
		scope: "canvas",
		group: "Find and jump",
		label: "Jump back to where you were",
		keys: ["ctrl+o"],
	},
	{
		id: "canvas.jump-forward",
		scope: "canvas",
		group: "Find and jump",
		label: "Jump forward again",
		keys: ["ctrl+i"],
	},

	// --- Threads ----------------------------------------------------------------
	{
		id: "canvas.threads",
		scope: "canvas",
		group: "Threads",
		label: "Show or hide the threads",
		keys: ["t"],
		repeats: false,
	},

	// --- Pages: the rail's own keys, while the rail has focus (#229) -------------
	{
		id: "sidebar.walk",
		scope: "sidebar",
		group: "Pages",
		label: "Walk the rows",
		keys: ["arrowup", "arrowdown"],
		shown: ["↑↓"],
	},
	{
		id: "sidebar.extend",
		scope: "sidebar",
		group: "Pages",
		label: "Extend the selection as you walk",
		keys: ["shift+arrowup", "shift+arrowdown"],
		shown: ["⇧↑↓"],
	},
	{
		id: "sidebar.collapse",
		scope: "sidebar",
		group: "Pages",
		label: "Collapse a page, or step up to it",
		keys: ["arrowleft"],
		shown: ["←"],
	},
	{
		id: "sidebar.expand",
		scope: "sidebar",
		group: "Pages",
		label: "Expand a page",
		keys: ["arrowright"],
		shown: ["→"],
	},
	{
		id: "sidebar.rename",
		scope: "sidebar",
		group: "Pages",
		label: "Rename the selected row",
		keys: ["enter", "f2"],
		repeats: false,
	},
	{
		id: "sidebar.duplicate",
		scope: "sidebar",
		group: "Pages",
		label: "Duplicate the selection",
		keys: ["accel+d"],
		repeats: false,
	},
	{ id: "sidebar.copy", scope: "sidebar", group: "Pages", label: "Copy frames", keys: ["accel+c"], repeats: false },
	{
		id: "sidebar.paste",
		scope: "sidebar",
		group: "Pages",
		label: "Paste frames onto the active page",
		keys: ["accel+v"],
		repeats: false,
	},
	{
		id: "sidebar.trash",
		scope: "sidebar",
		group: "Pages",
		label: "Move the selection to the Trash",
		keys: ["backspace", "delete", "accel+backspace"],
		shown: ["⌫"],
	},
	{ id: "sidebar.jump", scope: "sidebar", group: "Pages", label: "Jump to a name by typing it", shown: ["a-z"] },
	{ id: "sidebar.menu", scope: "sidebar", group: "Pages", label: "Open the row menu", gesture: "right-click" },
	{
		id: "sidebar.move",
		scope: "sidebar",
		group: "Pages",
		label: "Reorder, or move a frame to a page",
		gesture: "drag",
	},
	{
		id: "sidebar.fold-all",
		scope: "sidebar",
		group: "Pages",
		label: "Open or shut a page and every page inside it",
		gesture: "⌥ click a chevron",
	},
	{ id: "sidebar.close-menu", scope: "sidebar", group: "Pages", label: "", keys: ["escape"], listed: false },

	// --- Panes: the canvas window's two sides (#359) -----------------------------
	// ⌘B is the side bar's key in most editors, and ⌥ makes it the other side.
	// The pane keys are ⌘⇧ and a letter no browser on a Mac holds on to:
	// ⇧A is Chrome's tab search and ⇧P Firefox's private window, so Pages is
	// E (the explorer), Properties I (the inspector) and Agent K, beside the ⌘K
	// palette its commands live in.
	{
		id: "panes.left",
		scope: "panes",
		group: "Panes",
		label: "Show or hide the left side",
		keys: ["accel+b"],
		repeats: false,
		typing: true,
	},
	{
		id: "panes.right",
		scope: "panes",
		group: "Panes",
		label: "Show or hide the right side",
		keys: ["accel+alt+b"],
		repeats: false,
		typing: true,
	},
	{
		id: "panes.pages",
		scope: "panes",
		group: "Panes",
		label: "Show Pages and focus it",
		keys: ["accel+shift+e"],
		repeats: false,
		typing: true,
	},
	{
		id: "panes.properties",
		scope: "panes",
		group: "Panes",
		label: "Show Properties and focus it",
		keys: ["accel+shift+i"],
		repeats: false,
		typing: true,
	},
	{
		id: "panes.agent",
		scope: "panes",
		group: "Panes",
		label: "Show the agent and focus its composer",
		keys: ["accel+shift+k"],
		repeats: false,
		typing: true,
	},
	{
		id: "panes.only",
		scope: "panes",
		group: "Panes",
		label: "Show only that pane on its side",
		gesture: "⌥ click a pane toggle",
	},
	{
		id: "panes.move",
		scope: "panes",
		group: "Panes",
		label: "Move a pane, or split it with another",
		gesture: "drag a pane toggle or a pane's title",
	},
	{
		id: "panes.menu",
		scope: "panes",
		group: "Panes",
		label: "Hide, move or remove a pane",
		gesture: "right-click a pane toggle",
	},

	// --- Undo -------------------------------------------------------------------
	{ id: "canvas.undo", scope: "canvas", group: "Undo", label: "Undo", keys: ["accel+z"] },
	{ id: "canvas.redo", scope: "canvas", group: "Undo", label: "Redo", keys: ["accel+shift+z"] },

	// --- Home -------------------------------------------------------------------
	{ id: "app.new-project", scope: "app", group: "Home", label: "New project", keys: ["accel+n"], repeats: false },
	{
		id: "app.open-project",
		scope: "app",
		group: "Home",
		label: "Open a project or folder",
		keys: ["accel+o"],
		repeats: false,
	},
	{ id: "home.search", scope: "home", group: "Home", label: "Search your projects", keys: ["slash"] },
	{ id: "home.close-menu", scope: "home", group: "Home", label: "", keys: ["escape"], listed: false },

	// --- Settings ---------------------------------------------------------------
	{ id: "app.settings", scope: "app", group: "Settings", label: "Open settings", keys: ["accel+comma"] },
	{ id: "settings.close", scope: "settings", group: "Settings", label: "", keys: ["escape"], listed: false },

	// --- Help -------------------------------------------------------------------
	{ id: "app.help", scope: "app", group: "Help", label: "Show this sheet", keys: ["question"] },
	{ id: "help.close", scope: "help", group: "Help", label: "", keys: ["escape", "question"], listed: false },

	// --- Modal plumbing: each open surface answers its own escape ---------------
	{ id: "dialog.close", scope: "dialog", group: "Frames", label: "", keys: ["escape"], listed: false },
	{ id: "finder.close", scope: "finder", group: "Find and jump", label: "", keys: ["escape"], listed: false },
	{ id: "picker.close", scope: "picker", group: "Home", label: "", keys: ["escape"], listed: false },
	{ id: "toast.undo", scope: "toast", group: "Undo", label: "", keys: ["accel+z"], listed: false },
] as const satisfies readonly HotkeySpec[];

export type HotkeyEntry = (typeof HOTKEYS)[number];
export type HotkeyId = HotkeyEntry["id"];

/** Entries that dispatch: the ones carrying key combos. */
export type KeyedHotkeyEntry = Extract<HotkeyEntry, { keys: readonly string[] }>;

/** The handler ids a surface of scope S must answer for. */
export type HotkeyIdFor<S extends HotkeyScope> = Extract<KeyedHotkeyEntry, { scope: S }>["id"];

export function hotkeyEntry(id: HotkeyId): HotkeyEntry {
	const entry = HOTKEYS.find((candidate) => candidate.id === id);
	if (entry === undefined) throw new Error(`unknown hotkey "${id}"`);
	return entry;
}

function told<T>(value: T | (() => T) | undefined): T | undefined {
	return typeof value === "function" ? (value as () => T)() : value;
}

/**
 * The short face a menu item or tooltip wears beside its label: the entry's
 * first combo. The sheet is where every synonym is told.
 */
export function hotkeyKey(id: HotkeyId): string {
	const entry = hotkeyEntry(id);
	const first = "keys" in entry ? entry.keys[0] : undefined;
	if (first === undefined) throw new Error(`hotkey "${id}" has no keys to show`);
	return formatCombo(first);
}

/** Everything the sheet draws for an entry: key faces as chips, gesture as prose. */
export function hotkeyChips(entry: HotkeyEntry): { keys: readonly string[]; gesture: string | undefined } {
	const shown = told<readonly string[]>("shown" in entry ? entry.shown : undefined);
	const keys = shown ?? ("keys" in entry ? entry.keys.map((combo) => formatCombo(combo)) : ([] as readonly string[]));
	return { keys, gesture: told<string>("gesture" in entry ? entry.gesture : undefined) };
}

/** The sheet's rows: listed entries of one group, in register order. */
export function listedHotkeys(group: HotkeyGroup): readonly HotkeyEntry[] {
	return HOTKEYS.filter((entry) => entry.group === group && !("listed" in entry && entry.listed === false));
}
