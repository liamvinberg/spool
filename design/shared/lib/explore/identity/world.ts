/**
 * The one world every identity take draws: the same project, the same pages, the same
 * selection, so two takes differ only in how they look. A take reads this and never
 * invents its own data.
 */

export type Appearance = "dark" | "light";

export interface Tab {
	name: string;
	active?: boolean;
}

export interface PageFrame {
	name: string;
	selected?: boolean;
	/** a frame nobody has looked at since it changed */
	unseen?: boolean;
}

export interface Page {
	name: string;
	open?: boolean;
	current?: boolean;
	frames: PageFrame[];
	/** pages it holds and frames under them, for the count */
	count: number;
	/** a teammate is on this page */
	presence?: boolean;
}

export const tabs: Tab[] = [{ name: "kaffe", active: true }, { name: "tvärsö" }, { name: "fieldnotes" }];

export const project = { name: "kaffe", frames: 7, team: "Eidra", synced: "saved" };

export const pages: Page[] = [
	{
		name: "app",
		open: true,
		current: true,
		count: 3,
		frames: [{ name: "menu" }, { name: "cart", selected: true }, { name: "receipt", unseen: true }],
	},
	{ name: "site", count: 2, presence: true, frames: [{ name: "landing" }, { name: "pricing" }] },
	{ name: "directing", count: 2, frames: [{ name: "annotate" }, { name: "annotate--empty" }] },
];

/** The three frames on the canvas, left to right. Each is drawn 240×520 on screen:
 * a 390×844 phone at the zoom the canvas shows. */
export const canvasFrames = [
	{ name: "menu", screen: "menu" },
	{ name: "cart", screen: "cart", selected: true },
	{ name: "receipt", screen: "receipt", unseen: true },
] as const;

export const frameSize = { w: 390, h: 844 };
export const drawnSize = { w: 240, h: 520 };
export const zoom = "72%";

export const selection = {
	name: "cart",
	path: "frames/app/cart/frame.tsx",
	x: 325,
	y: 170,
	w: 390,
	h: 844,
	flowsIn: 1,
	flowsOut: 1,
	scenario: "default",
};

export const flows = [
	{ from: "menu", to: "cart", certainty: "will" as const, verified: true },
	{ from: "cart", to: "receipt", certainty: "might" as const, verified: false },
];

export const teammate = { name: "Ada Lindqvist", initials: "AL", page: "site", color: "#3b82f6" };

/** The parts sheet: what every take draws as its components. */
export const menuItems = [
	{ label: "Rename", key: "↵" },
	{ label: "Duplicate", key: "⌘D" },
	{ label: "Move to page…", key: "" },
	{ label: "Copy path", key: "⌘⇧C" },
	{ label: "Move to Trash", key: "⌫", danger: true },
];

export const toast = { text: "cart moved to Trash", action: "Undo" };

export const commandHint = "⌘K";
