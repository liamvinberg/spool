/**
 * The one world every identity take draws, read off spool as it ships (0.31.1): the same
 * project, the same pages, the same selection, so two takes differ only in how they look.
 * A take reads this and never invents its own data or adds surfaces the app lacks.
 */

export type Appearance = "dark" | "light";

/** The window's tab strip: Home, then one tab per open project. */
export const tabs = [{ name: "kaffe", active: true }, { name: "tvärsö" }, { name: "fieldnotes" }];

/** Top right of the window: the flows toggle (shows the arrows between frames) and the zoom. */
export const zoom = "54%";

export interface PageFrame {
	name: string;
	selected?: boolean;
	/** a frame nobody has looked at since it changed */
	unseen?: boolean;
}

export interface Page {
	name: string;
	open?: boolean;
	/** the page the canvas shows */
	current?: boolean;
	count: number;
	frames: PageFrame[];
}

/** The left rail: "Pages 3" with new page, close and collapse; frames sort by name. */
export const pages: Page[] = [
	{
		name: "app",
		open: true,
		current: true,
		count: 3,
		frames: [{ name: "cart", selected: true }, { name: "menu" }, { name: "receipt", unseen: true }],
	},
	{ name: "directing", count: 1, frames: [{ name: "annotate" }] },
	{ name: "site", count: 2, frames: [{ name: "landing" }, { name: "pricing" }] },
];

/** The rail's foot carries one hint line, today "folder switches page". */
export const railHint = "folder switches page";

/**
 * The three frames on the app page, left to right. Each is drawn 240×520 on screen (a
 * 390×844 phone at the zoom shown). Flows: cart → receipt (Pay), menu → cart (Checkout),
 * receipt → menu. The arrows are thin red curves; a "might" edge is dashed.
 */
export const canvasFrames = [
	{ name: "cart", screen: "cart", selected: true },
	{ name: "menu", screen: "menu" },
	{ name: "receipt", screen: "receipt", unseen: true },
] as const;

export const flows = [
	{ from: "menu", to: "cart", certainty: "will" as const },
	{ from: "cart", to: "receipt", certainty: "will" as const },
	{ from: "receipt", to: "menu", certainty: "might" as const },
];

export const frameSize = { w: 390, h: 844 };
export const drawnSize = { w: 240, h: 520 };

/** The canvas toolbar, bottom centre: three tools and their keys. */
export const tools = [
	{ name: "select", key: "V", active: true },
	{ name: "edit", key: "E" },
	{ name: "hand", key: "H" },
];

/**
 * The right side: a panel and, at the window's right edge, a narrow rail that switches it
 * (properties, agent) with help (?) and the settings cog at its foot.
 */
export const panels = ["properties", "agent"] as const;

/** The properties panel for a selected frame: its name, then frame.json's geometry. */
export const selection = {
	name: "cart",
	path: "frames/app/cart/frame.tsx",
	source: "frame.json",
	x: 320,
	y: 80,
	w: 390,
	h: 844,
};

/** With nothing selected the panel says so. */
export const emptySelection = "select an element";

/**
 * Edit mode: an element inside a frame is picked. The canvas tags it with its kind and
 * the agent's composer carries it as a chip.
 */
export const element = {
	frame: "cart",
	kind: "Group",
	label: "1 × Cortado",
	chip: "app/cart · div · 31-38",
};

/** The agent panel: a chat with spool's own agent. */
export const agent = {
	title: "New chat",
	model: "spool",
	scope: "For this new chat",
	placeholder: "say what to change",
	account: "Connect account",
	mode: "ask",
	/** one finished turn, for the takes that draw a conversation */
	turn: {
		ask: "Make the cart rows taller and put the price on the right.",
		said: "Rows are 56px now with the price right-aligned. Both items still fit above Pay.",
		edits: [{ path: "frames/app/cart/frame.tsx", added: 6, removed: 3 }],
	},
};

/** Home: the projects page. Artwork kinds come from shared/ui/demo/home-data.ts. */
export const home = {
	title: "Projects",
	count: "6 projects",
	search: "Search projects",
	searchKey: "/",
	actions: ["Import…", "Open…", "New project…"],
	sort: "Recent",
	nav: ["Projects"],
	foot: "Settings",
};

/** Parts-sheet copy. */
export const menuItems = [
	{ label: "Play", key: "P" },
	{ label: "Rename", key: "↵" },
	{ label: "Duplicate", key: "⌘D" },
	{ label: "Copy path", key: "⌘⇧C" },
	{ label: "Move to Trash", key: "⌫", danger: true },
];

export const toast = { text: "cart moved to Trash", action: "Undo" };

export const settingsRow = {
	title: "Check for updates",
	detail: "Once a day, and a line in the canvas when there is one.",
};
