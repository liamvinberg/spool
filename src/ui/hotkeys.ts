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

export type HotkeyScope = "dialog" | "finder" | "picker" | "help" | "toast" | "canvas" | "home" | "app";

/**
 * Most modal first; dispatch stops at the first exclusive scope that is up.
 * The toast sits above help on purpose: an undo window keeps draining while
 * the sheet is read, so ⌘Z must reach it even then.
 */
export const SCOPE_PRIORITY: readonly HotkeyScope[] = [
	"dialog",
	"finder",
	"picker",
	"toast",
	"help",
	"canvas",
	"home",
	"app",
];

/** Scopes that own the keyboard outright while they are up. */
export const EXCLUSIVE_SCOPES: ReadonlySet<HotkeyScope> = new Set(["dialog", "finder", "picker", "help"]);

export const HOTKEY_GROUPS = [
	"Frames",
	"Selection",
	"Camera",
	"Tools",
	"Find and jump",
	"Threads",
	"Undo",
	"Home",
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
		keys: ["p", "shift+enter"],
		repeats: false,
	},
	{ id: "canvas.reload", scope: "canvas", group: "Frames", label: "Reload the selected frames", keys: ["r"] },
	{ id: "canvas.export", scope: "canvas", group: "Frames", label: "Export the selection as PNG", keys: ["e"] },
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
		label: "Select the element under the cursor",
		gesture: () => `${accelBare()} click`,
	},
	{ id: "canvas.accel-hold", scope: "canvas", group: "Selection", label: "", keys: ["accel"], listed: false },
	{
		id: "canvas.nudge",
		scope: "canvas",
		group: "Selection",
		label: "Nudge the selection 1 px",
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

	// --- Undo -------------------------------------------------------------------
	{ id: "canvas.undo", scope: "canvas", group: "Undo", label: "Undo", keys: ["accel+z"] },
	{ id: "canvas.redo", scope: "canvas", group: "Undo", label: "Redo", keys: ["accel+shift+z"] },

	// --- Home -------------------------------------------------------------------
	{ id: "home.search", scope: "home", group: "Home", label: "Search your projects", keys: ["slash"] },
	{ id: "home.close-menu", scope: "home", group: "Home", label: "", keys: ["escape"], listed: false },

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
