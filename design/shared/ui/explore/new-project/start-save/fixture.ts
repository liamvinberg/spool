import type { Artwork } from "shared/ui/demo/home-data";
import { FINDINGS, PROJECTS, type Finding, type Place, type Project } from "shared/lib/explore/new-project/places";

/**
 * What start-save adds to the shared world: the unsaved canvases, the folders spool
 * remembers being handed, and the disk the Finder sheet and spool's own browser list.
 *
 * An unsaved canvas is a real project in spool's scratch, so an agent can write into
 * it from the first second. It is never on Home's grid. It is always an open tab,
 * quitting included, and Home lists every one in its Unsaved strip.
 */

/** spool's own scratch: app-owned, outside every place a person keeps work */
export const SCRATCH = "~/.spool/unsaved";

export interface Shot {
	/** the frame's path under frames/ */
	name: string;
	title: string;
	sub: string;
	rows: number;
	/** 0..3, how far along the order is; null draws no tracker */
	step: number | null;
	cta: string;
}

export interface Doc {
	id: string;
	/** "untitled", "untitled 2": what the tab says until it is saved */
	label: string;
	/** where its files are while it is unsaved */
	dir: string;
	/** what the agent was asked, and the name the save sheet offers */
	ask: string;
	suggest: string;
	/** what the agent says when it stops */
	summary: string;
	frames: Shot[];
	/** what the agent has still to write, in order */
	todo: Shot[];
	agent: "idle" | "writing" | "done";
	since: string;
	/** the Home it was started from: a canvas started under Tidemark offers Tidemark first */
	team: boolean;
	/** the agent's log, as the rail prints it */
	log: LogLine[];
	/** set once saved: the doc stops being unsaved and becomes a project with a place */
	saved?: { name: string; place: Place; project: string };
}

export type LogLine = { kind: "write"; text: string } | { kind: "moved"; text: string };

const tracker = (name: string, title: string, sub: string, step: number | null, cta: string, rows = 2): Shot => ({ name, title, sub, step, cta, rows });

/** what the agent writes into a fresh canvas, one frame at a time */
export const ORDER_SCRIPT: Shot[] = [
	tracker("order/placed", "Order placed", "Torsgatan 11 · 2 items", 0, "Track order"),
	tracker("order/brewing", "Brewing", "About 4 minutes", 1, "Add a pastry"),
	tracker("order/ready", "Ready at the counter", "Say “Ada” at the bar", 2, "I have it"),
	tracker("order/ready--late", "Still waiting?", "It has been 9 minutes", 2, "Ask the bar", 1),
	tracker("order/picked-up", "Enjoy", "Picked up 08:42", 3, "Rate it", 1),
	tracker("order/history", "Your orders", "This week", null, "Order again", 3),
];

export const PICKUP_SCRIPT: Shot[] = [
	tracker("pickup/menu", "Menu", "Torsgatan 11", null, "Checkout", 3),
	tracker("pickup/menu--closed", "Closed", "Opens 07:00", null, "Notify me", 0),
	tracker("pickup/cart", "Your cart", "2 items", null, "Pay", 2),
	tracker("pickup/receipt", "Thanks", "Order 214", 3, "Done", 1),
];

/** the one already open when Home loads: started Tuesday, kept through a quit */
export const KEPT: Doc = {
	id: "untitled",
	label: "untitled",
	dir: `${SCRATCH}/untitled`,
	ask: "a pickup flow for the coffee cart",
	suggest: "pickup flow",
	summary: "Four frames under pickup/. menu--closed is what the cart shows before 07:00.",
	frames: PICKUP_SCRIPT,
	todo: [],
	agent: "done",
	since: "since tue",
	team: false,
	log: PICKUP_SCRIPT.map((shot) => ({ kind: "write", text: shot.name })),
};

export const nextDoc = (taken: readonly string[], team: boolean): Doc => {
	let n = 1;
	const label = (i: number) => (i === 1 ? "untitled" : `untitled ${i}`);
	while (taken.includes(label(n))) n += 1;
	return {
		id: label(n),
		label: label(n),
		dir: `${SCRATCH}/${label(n).replace(" ", "-")}`,
		ask: "an order tracker for the cart: placed, brewing, ready",
		suggest: "order tracker",
		summary: "Six frames under order/. Each one walks to the next, and ready--late is where the wait runs long.",
		frames: [],
		todo: ORDER_SCRIPT,
		agent: "idle",
		since: "now",
		team,
		log: [],
	};
};

/** the fresh canvas the --untitled, --save, --close states start on */
export const fresh = (written: number, agent: Doc["agent"]): Doc => ({
	...nextDoc(["untitled"], false),
	frames: ORDER_SCRIPT.slice(0, written),
	todo: ORDER_SCRIPT.slice(written),
	agent,
	log: ORDER_SCRIPT.slice(0, written).map((shot) => ({ kind: "write", text: shot.name })),
});

export const slug = (name: string) =>
	name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9äöå]+/g, "-")
		.replace(/^-+|-+$/g, "") || "untitled";

/* ── places a save can go ─────────────────────────────────── */

export interface Known {
	path: string;
	name: string;
	branch?: string;
	stack?: string;
	/** a project already lives here; a second design/ cannot */
	holds?: string;
}

/**
 * Folders spool has been handed, and only those: every ⌘O, drop and save is
 * remembered, whatever it found. tidemark-api was opened once and closed again.
 */
export const KNOWN: Known[] = [
	{ path: "~/code/tidemark-api", name: "tidemark-api", branch: "main", stack: "TypeScript · Hono" },
	{ path: "~/code/kaffe-web", name: "kaffe-web", branch: "checkout", stack: "Next.js" },
	{ path: "~/code/tvarso-web", name: "tvarso-web", branch: "main", holds: "tvärsö" },
	{ path: "~/code/dispatch", name: "dispatch", branch: "design-pass", holds: "dispatch" },
];

export type SaveTo = { kind: "draft" } | { kind: "folder"; folder: Known } | { kind: "team" };

export const placeOf = (to: SaveTo, name: string): Place =>
	to.kind === "draft"
		? { kind: "draft", label: "Drafts", path: `~/spool/${slug(name)}` }
		: to.kind === "team"
			? { kind: "team", label: "Tidemark", path: `~/spool/tidemark/${slug(name)}` }
			: { kind: "folder", label: to.folder.path, path: to.folder.path, ...(to.folder.branch ? { branch: to.folder.branch } : {}) };

/** where design/ ends up, in the words a terminal would print */
export const designPath = (to: SaveTo, name: string) =>
	to.kind === "folder" ? `${to.folder.path}/design` : `${placeOf(to, name).path}/design`;

/* ── the disk the open sheets list ────────────────────────── */

export interface Entry {
	name: string;
	/** what spool reads when handed it; absent is a folder spool has nothing to say about */
	finding?: keyof typeof FINDINGS;
	children?: Entry[];
	/** a file rather than a folder, drawn but not openable */
	file?: boolean;
}

export const DISK: Entry[] = [
	{
		name: "code",
		children: [
			{ name: "dispatch", children: [{ name: "design" }, { name: "src" }] },
			{ name: "harbor", finding: "project", children: [{ name: "design" }, { name: "src" }, { name: "package.json", file: true }] },
			{ name: "kaffe-web", children: [{ name: "app" }, { name: "package.json", file: true }] },
			{ name: "tidemark-api", finding: "repo", children: [{ name: "src" }, { name: "package.json", file: true }] },
			{
				name: "tvarso-web",
				children: [
					{ name: "design" },
					{ name: "src", children: [{ name: "lib" }, { name: "routes", finding: "inside", children: [{ name: "+page.svelte", file: true }] }] },
				],
			},
		],
	},
	{ name: "Desktop", children: [{ name: "moodboard", finding: "plain", children: [{ name: "refs.png", file: true }] }, { name: "invoice.pdf", file: true }] },
	{ name: "Documents", children: [{ name: "notes" }] },
	{ name: "Downloads", children: [] },
];

export const findingAt = (key: keyof typeof FINDINGS): Finding => FINDINGS[key]!;

/** a git link typed or pasted anywhere a path goes */
export const isLink = (text: string) => /github\.com|gitlab\.com|\.git$|^git@/.test(text.trim());

/* ── projects ─────────────────────────────────────────────── */

export interface Item extends Project {
	/** born in this walk: the card arrives rather than standing there */
	born?: boolean;
	/** a saved canvas: its cover is its own frames */
	doc?: string;
	shots?: Shot[];
}

export const STARTING: Item[] = PROJECTS.map((project) => ({ ...project }));

export const projectFor = (finding: Finding): Item | null => {
	switch (finding.kind) {
		case "project":
			return { id: finding.name, name: finding.name, art: finding.art, frames: finding.frames, edited: "just now", place: { kind: "folder", label: finding.path, path: finding.path, ...(finding.branch ? { branch: finding.branch } : {}) }, born: true };
		case "repo":
			return { id: finding.name, name: finding.name, art: "blank", frames: 0, edited: "just now", place: { kind: "folder", label: finding.path, path: finding.path, branch: finding.branch }, born: true };
		case "plain":
			return { id: finding.name, name: finding.name, art: "blank", frames: 0, edited: "just now", place: { kind: "folder", label: finding.path, path: finding.path }, born: true };
		case "clone":
			return { id: finding.name, name: finding.name, art: finding.art, frames: finding.frames, edited: "just now", place: { kind: "folder", label: finding.into, path: finding.into, branch: "main" }, born: true };
		default:
			return null;
	}
};

export const ART_FOR_DOC: Artwork = "blank";
