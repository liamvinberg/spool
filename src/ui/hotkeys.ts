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
	"Tabs",
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
	/**
	 * Reaches out of an entered frame: the frame shim relays it to the canvas,
	 * which runs the entry (daemon/document.ts). `true` relays the entry's own
	 * keys; a list names the combos that do from inside a frame, where the
	 * frame keeps the plain keys or Esc must leave whatever is held.
	 */
	readonly relay?: true | readonly string[];
	/**
	 * Relayed only when the frame did not keep it: the shim decides once every
	 * listener in the frame has had the press, and a frame that called
	 * preventDefault keeps the key, as one that takes it in a text field does
	 * (unless the entry answers while `typing`). For keys a prototype may well
	 * bind itself, ⌥ above all.
	 */
	readonly yields?: true;
}

/** The accel face without its joining `+`: `⌘`, `ctrl`. */
function accelBare(): string {
	return accelLabel().replace(/\+$/, "");
}

type TabNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** ⌘N for tab N: unlisted, the sheet tells all eight in one row. */
function tabKey<N extends TabNumber>(n: N) {
	return {
		id: `app.tab-${n}` as `app.tab-${N}`,
		scope: "app",
		group: "Tabs",
		label: "",
		keys: [`accel+${n}`] as readonly [`accel+${N}`],
		repeats: false,
		listed: false,
		typing: true,
	} as const;
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
		// Esc must still exit (#22), whatever else is held
		relay: ["any+escape"],
	},
	// pages (#265) go in and out the way frames do, and the way Finder's
	// folders do: ⌘↓ and ⌘↑ beside ⏎ and the last Esc
	{
		id: "canvas.page-in",
		scope: "canvas",
		group: "Frames",
		label: "Go inside the selected page",
		keys: ["accel+arrowdown"],
		shown: () => ["⏎", `${accelLabel()}↓`],
		gesture: "double-click",
		repeats: false,
	},
	{
		id: "canvas.page-up",
		scope: "canvas",
		group: "Frames",
		label: "Go up to the page holding this one",
		keys: ["accel+arrowup"],
		shown: () => ["esc", `${accelLabel()}↑`],
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
	// the Pages rail's copy, paste and duplicate (#229), for the frames
	// selected out on the canvas
	{
		id: "canvas.copy",
		scope: "canvas",
		group: "Frames",
		label: "Copy the selected frames",
		keys: ["accel+c"],
		repeats: false,
	},
	{
		id: "canvas.paste",
		scope: "canvas",
		group: "Frames",
		label: "Paste frames onto this page",
		keys: ["accel+v"],
		repeats: false,
	},
	{
		id: "canvas.duplicate",
		scope: "canvas",
		group: "Frames",
		label: "Duplicate the selected frames",
		keys: ["accel+d"],
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
	// ⌥ arrows, and vim's hjkl by place under ⌥ (⌥H is ˙ before it is an H):
	// out here they move the selection, from inside a frame they open the
	// overview on the way to the next one (DEV-295)
	{
		id: "canvas.step",
		scope: "canvas",
		group: "Selection",
		label: "Step to the neighbouring frame, inside it if you were inside one; the opposite key steps back",
		keys: ["alt+arrowleft", "alt+arrowright", "alt+arrowup", "alt+arrowdown", "alt+h", "alt+j", "alt+k", "alt+l"],
		shown: ["⌥←↑→↓", "⌥HJKL"],
		relay: true,
		yields: true,
	},
	// the same step from a text field, where ⌥ arrows are the caret's
	{
		id: "canvas.step-through",
		scope: "canvas",
		group: "Selection",
		label: "Step to the neighbouring frame even from a text field",
		keys: ["accel+alt+arrowleft", "accel+alt+arrowright", "accel+alt+arrowup", "accel+alt+arrowdown"],
		shown: () => [`${accelLabel()}⌥←↑→↓`],
		typing: true,
		relay: true,
		yields: true,
	},
	// ⌥ alone, held a moment: the camera steps back to show the frames around
	// this one, arrows pick, letting go goes there. Any other key under ⌥ ends
	// it unopened, so ⌥2 still types @ on a Swedish board
	{
		id: "canvas.overview",
		scope: "canvas",
		group: "Selection",
		label: "See the frames around this one; arrows pick, let go to go there",
		keys: ["alt"],
		shown: ["hold ⌥"],
		repeats: false,
		relay: true,
		yields: true,
	},
	{
		id: "canvas.switch",
		scope: "canvas",
		group: "Frames",
		label: "Enter another frame from inside one",
		gesture: "click it",
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
		// the browser's zoom chords, so a focused frame cannot zoom the page into a trap
		relay: ["accel+plus", "accel+equals"],
	},
	{
		id: "canvas.zoom-out",
		scope: "canvas",
		group: "Camera",
		label: "Zoom out",
		keys: ["accel+minus", "minus"],
		shown: () => [`${accelLabel()}-`],
		relay: ["accel+minus"],
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
		// owed mid-walk, inside a frame, on every platform (#166)
		relay: true,
	},
	{
		id: "canvas.jump-forward",
		scope: "canvas",
		group: "Find and jump",
		label: "Jump forward again",
		keys: ["ctrl+i"],
		relay: true,
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
	// along the flow map, the way a browser's ⌘] and ⌘[ go forward and back;
	// matched by place, so ⌘¨ and ⌘å on a Swedish board. At a fork ] again
	// before ⌘ comes up takes the next thread instead
	{
		id: "canvas.thread-next",
		scope: "canvas",
		group: "Threads",
		label: "Walk on along the thread; ] again at a fork for the next one",
		keys: ["accel+bracketright"],
		relay: true,
	},
	{
		id: "canvas.thread-back",
		scope: "canvas",
		group: "Threads",
		label: "Walk back the way you came",
		keys: ["accel+bracketleft"],
		relay: true,
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
		label: "Open or close the left side",
		keys: ["accel+b"],
		repeats: false,
		typing: true,
	},
	{
		id: "panes.right",
		scope: "panes",
		group: "Panes",
		label: "Open or close the right side",
		keys: ["accel+alt+b"],
		repeats: false,
		typing: true,
	},
	{
		id: "panes.pages",
		scope: "panes",
		group: "Panes",
		label: "Open Pages and focus it",
		keys: ["accel+shift+e"],
		repeats: false,
		typing: true,
	},
	{
		id: "panes.properties",
		scope: "panes",
		group: "Panes",
		label: "Open Properties and focus it",
		keys: ["accel+shift+i"],
		repeats: false,
		typing: true,
	},
	{
		id: "panes.agent",
		scope: "panes",
		group: "Panes",
		label: "Open the agent and focus its composer",
		keys: ["accel+shift+k"],
		repeats: false,
		typing: true,
	},
	{
		id: "panes.move",
		scope: "panes",
		group: "Panes",
		label: "Move a pane to another tab row, or split a side",
		gesture: "drag a pane's tab",
	},
	{
		id: "panes.menu",
		scope: "panes",
		group: "Panes",
		label: "Move a pane to the other side, split or merge it",
		gesture: "right-click a pane's tab",
	},

	// --- Undo -------------------------------------------------------------------
	{ id: "canvas.undo", scope: "canvas", group: "Undo", label: "Undo", keys: ["accel+z"] },
	{ id: "canvas.redo", scope: "canvas", group: "Undo", label: "Redo", keys: ["accel+shift+z"] },

	// --- Tabs: the strip of Home and the open projects -------------------------
	// A browser's tab keys, for the Mac app: a plain browser tab keeps ⌘W, ⌘T,
	// ⌘⇧T, ⌘1-9 and ctrl+Tab for its own tabs, so there these never fire. They
	// answer from a text field, where none of them means anything to the text.
	// From an entered frame the Mac menu wears them (desktop-window.ts), all but
	// the bracket chords, which match by place where a menu matches by glyph
	// (⌘⇧¨ on Swedish), so the frame relays those.
	{
		id: "app.close-tab",
		scope: "app",
		group: "Tabs",
		label: "Close the tab, or what is open over it",
		keys: ["accel+w"],
		repeats: false,
		typing: true,
	},
	{
		id: "app.close-window",
		scope: "app",
		group: "Tabs",
		label: "Close the window",
		keys: ["accel+shift+w"],
		repeats: false,
		typing: true,
	},
	{
		id: "app.reopen-tab",
		scope: "app",
		group: "Tabs",
		label: "Reopen the tab closed last",
		keys: ["accel+shift+t"],
		repeats: false,
		typing: true,
	},
	{
		id: "app.home",
		scope: "app",
		group: "Tabs",
		label: "Go to Home",
		keys: ["accel+t"],
		repeats: false,
		typing: true,
	},
	{
		id: "app.next-tab",
		scope: "app",
		group: "Tabs",
		label: "Next tab",
		keys: ["ctrl+tab", "accel+shift+bracketright"],
		typing: true,
		relay: ["accel+shift+bracketright"],
	},
	{
		id: "app.previous-tab",
		scope: "app",
		group: "Tabs",
		label: "Previous tab",
		keys: ["ctrl+shift+tab", "accel+shift+bracketleft"],
		typing: true,
		relay: ["accel+shift+bracketleft"],
	},
	// ⌘1 is Home and ⌘2-8 the project tabs in order: one row on the sheet for
	// the eight entries the menu and the dispatch need one apiece
	{
		id: "app.tab-numbered",
		scope: "app",
		group: "Tabs",
		label: "Go to tab 1 to 8, Home first",
		shown: () => [`${accelLabel()}1-8`],
	},
	...([1, 2, 3, 4, 5, 6, 7, 8] as const).map(tabKey),
	{
		id: "app.tab-last",
		scope: "app",
		group: "Tabs",
		label: "Go to the last tab",
		keys: ["accel+9"],
		repeats: false,
		typing: true,
	},

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
	{ id: "home.search", scope: "home", group: "Home", label: "Search projects", keys: ["slash"] },
	{ id: "home.close-menu", scope: "home", group: "Home", label: "", keys: ["escape"], listed: false },

	// --- Settings ---------------------------------------------------------------
	{ id: "app.settings", scope: "app", group: "Settings", label: "Open settings", keys: ["accel+comma"] },
	{
		id: "settings.close",
		scope: "settings",
		group: "Settings",
		label: "",
		keys: ["escape", "accel+comma"],
		listed: false,
	},

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

/** An entry that reaches out of an entered frame, with the combos that carry it out. */
export interface RelayedHotkey {
	id: HotkeyId;
	combos: readonly string[];
	/** relayed only when the frame did not keep the press (`yields`) */
	yields: boolean;
	/** answers from a text field */
	typing: boolean;
}

/** What the frame shim relays, in register order. */
export function relayedHotkeys(): readonly RelayedHotkey[] {
	const relayed: RelayedHotkey[] = [];
	for (const entry of HOTKEYS) {
		if (!("relay" in entry)) continue;
		const combos = entry.relay === true ? ("keys" in entry ? entry.keys : []) : entry.relay;
		relayed.push({
			id: entry.id,
			combos,
			yields: "yields" in entry && entry.yields === true,
			typing: "typing" in entry && entry.typing === true,
		});
	}
	return relayed;
}

/** Whether a frame may ask the canvas to run this id: only what the register relays. */
export function isRelayedHotkey(id: unknown): id is HotkeyId {
	return relayedHotkeys().some((relayed) => relayed.id === id);
}

/**
 * The window's tab keys, every combo: a frame whose words are being edited
 * holds them back from the Mac menu, since closing or leaving the tab then
 * would take the open edit with it (daemon/document.ts).
 */
export function tabHotkeyCombos(): readonly string[] {
	return HOTKEYS.flatMap((entry) => (entry.group === "Tabs" && "keys" in entry ? entry.keys : []));
}
