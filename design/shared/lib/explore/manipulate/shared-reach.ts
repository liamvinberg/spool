/**
 * What the five `shared--` frames read: one document assembled out of parts
 * that live outside it, and the frames on the field that render the same parts.
 *
 * The whole point of the model is that an element's identity is its id and
 * nothing else. Three documents render `pay`; there is one entry for `pay` and
 * one className behind it, so an edit made on the cart lands on the menu in the
 * same commit, because there was only ever one place to write. That is Way 1
 * drawn rather than argued (spool-cloud#29).
 *
 * Two counts, deliberately. `framesUsing` in `flows.ts` indexes by file, so
 * today spool can only say "rendered by 12 frames" about `kaffe-chrome.tsx` —
 * true of the file, false of `Button`, which nine frames render. Every take
 * that says a number has to say which one it means, and the ones that mean the
 * export are asking for a finer index.
 */

export interface Origin {
	/** the file the element is defined in, under design/ */
	file: string;
	line: number;
	/** the export the stamp lands inside, which is finer than the file */
	export: string;
	/** frames rendering the file: what the flow graph answers today, free */
	fileFrames: number;
	/** frames rendering this export: what a hand actually means, and needs a finer index */
	exportFrames: number;
	/** those frames by name, on screen or not, so a rail can point at them instead of counting */
	holders: readonly string[];
}

export interface DocElement {
	id: string;
	/** what the rail calls it, which is the element's own word */
	name: string;
	tag: string;
	/** the line it is written on, in whichever file owns it */
	line: number;
	parent: string | null;
	/** set where the element is written outside the frame that renders it */
	origin?: Origin;
	/** a value the component takes: no hand writes it, whatever else changes */
	prop?: string;
	/** the string in the file, where the file holds one */
	text?: string;
	/** one source element, this many rendered */
	mapped?: number;
}

const CHROME = "shared/ui/kaffe-chrome.tsx";

const HEADER: Origin = {
	file: CHROME,
	line: 12,
	export: "ScreenHeader",
	fileFrames: 12,
	exportFrames: 6,
	holders: ["menu", "cart", "receipt", "checkout", "orders", "profile"],
};
const BUTTON: Origin = {
	file: CHROME,
	line: 34,
	export: "Button",
	fileFrames: 12,
	exportFrames: 9,
	holders: ["menu", "cart", "checkout", "orders", "profile", "tip", "welcome", "signin", "verify"],
};

/** kaffe's cart as three files write it: the frame's own, and the two exports it renders. */
export const DOC: readonly DocElement[] = [
	{ id: "screen", name: "cart", tag: "div", line: 14, parent: null },
	{ id: "header", name: "header", tag: "ScreenHeader", line: 12, parent: "screen", origin: HEADER },
	{ id: "back", name: "back", tag: "button", line: 18, parent: "header", origin: HEADER },
	{ id: "title", name: "title", tag: "span", line: 22, parent: "header", origin: HEADER, prop: "title", text: "Din beställning" },
	{ id: "promo", name: "promo", tag: "div", line: 21, parent: "screen" },
	{ id: "promo-label", name: "label", tag: "span", line: 22, parent: "promo", text: "Kanelbulle på köpet över 120 kr" },
	{ id: "items", name: "items", tag: "div", line: 25, parent: "screen" },
	{ id: "row", name: "row", tag: "div", line: 27, parent: "items", mapped: 3 },
	{ id: "name", name: "name", tag: "span", line: 29, parent: "row", mapped: 3 },
	{ id: "price", name: "price", tag: "span", line: 32, parent: "row", mapped: 3 },
	{ id: "footer", name: "footer", tag: "div", line: 38, parent: "screen" },
	{ id: "total", name: "total", tag: "div", line: 39, parent: "footer" },
	{ id: "pay", name: "pay", tag: "Button", line: 34, parent: "footer", origin: BUTTON },
	{ id: "pay-label", name: "label", tag: "span", line: 39, parent: "pay", origin: BUTTON, prop: "label", text: "Betala" },
];

const BY_ID = new Map(DOC.map((element) => [element.id, element]));

export function elementOf(id: string): DocElement | undefined {
	return BY_ID.get(id);
}

/** root first, the way a crumb reads. */
export function chainOf(id: string): readonly DocElement[] {
	const chain: DocElement[] = [];
	let at = BY_ID.get(id);
	while (at !== undefined) {
		chain.unshift(at);
		at = at.parent === null ? undefined : BY_ID.get(at.parent);
	}
	return chain;
}

/** The className the file was written with, which is also what a reset returns to. */
export const CLASSES: Readonly<Record<string, string>> = {
	screen: "flex h-full w-full flex-col bg-bg",
	header: "flex h-12 shrink-0 items-center gap-3 border-b border-border px-4",
	back: "flex h-7 w-7 items-center justify-center rounded-sm text-muted",
	title: "font-medium text-base leading-base",
	promo: "mx-4 mt-3 flex h-16 shrink-0 items-end rounded-lg bg-surface p-3",
	"promo-label": "font-medium text-sm text-muted leading-sm",
	items: "flex min-h-0 flex-1 flex-col gap-2 px-4 pt-3",
	row: "flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5",
	name: "text-base leading-base",
	price: "ml-auto font-mono text-sm text-muted leading-sm",
	footer: "flex shrink-0 flex-col gap-3 p-4",
	total: "flex items-baseline justify-between",
	pay: "flex h-11 items-center justify-center rounded-md bg-thread",
	"pay-label": "font-medium text-base text-on-thread leading-base",
};

/* ---------- the field ---------- */

export interface FieldFrame {
	name: string;
	/** where it sits in the field's own space */
	x: number;
	y: number;
	w: number;
	h: number;
	/** the ids this frame renders, so reach is read rather than guessed */
	renders: readonly string[];
	/** the one the rail is pointed at */
	edited?: true;
	/** an agent is working this frame while the hand works the other one */
	agent?: string;
}

const CHROME_IDS = ["header", "back", "title", "pay", "pay-label"] as const;

export const FIELD: readonly FieldFrame[] = [
	{ name: "menu", x: 24, y: 176, w: 232, h: 470, renders: CHROME_IDS },
	{ name: "cart", x: 296, y: 120, w: 300, h: 560, renders: DOC.map((element) => element.id), edited: true },
	{ name: "receipt", x: 636, y: 200, w: 232, h: 400, renders: ["header", "back", "title"], agent: "claude" },
];

/** The other frames on screen that would move if this element were written. */
export function reachOf(id: string): readonly string[] {
	return FIELD.filter((frame) => frame.edited !== true && frame.renders.includes(id)).map((frame) => frame.name);
}

/* ---------- the takes ---------- */

export type TakeName = "source" | "ring" | "tint" | "reach" | "wake" | "select" | "echo" | "rail" | "name";

export interface Take {
	name: TakeName;
	/** what the mark is */
	mark: string;
	/** what it says at the write */
	volume: string;
	/** what it costs, said in the frame so it is judged with the picture */
	cost: string;
	/** which count this take claims, and therefore what it asks of the index */
	counts: "none" | "file" | "export" | "screen";
}

export const TAKES: Readonly<Record<TakeName, Take>> = {
	source: {
		name: "source",
		mark: "Nothing on the canvas. The rail names the file and the count, and the rail is live.",
		volume: "The count sits in the head and never moves. No moment, no interruption.",
		cost: "You only learn an element is shared by selecting it. Hovering tells you nothing.",
		counts: "file",
	},
	ring: {
		name: "ring",
		mark: "A second hairline outside the ring, hover and selection both. One accent, two lines.",
		volume: "The outer line pulses once as the write lands, then holds.",
		cost: "A weight, not a colour, so it reads at a glance only once you have learnt it.",
		counts: "export",
	},
	tint: {
		name: "tint",
		mark: "A second colour. Shared rings, handles and crumb turn pink wherever they appear.",
		volume: "The colour is the whole message. The write says nothing more.",
		cost: "tokens.css says there is exactly one accent. This is a second one, and on the red button it is nearly the first.",
		counts: "export",
	},
	reach: {
		name: "reach",
		mark: "Point at it and the same element rings in every frame on screen that renders it.",
		volume: "The reach is the count, drawn where it lands. The edit arrives in all of them live.",
		cost: "Only says what is on screen. Nine frames render this and you can see two.",
		counts: "screen",
	},
	wake: {
		name: "wake",
		mark: "Nothing, until it matters. A shared element rings exactly like a local one.",
		volume: "The first write of a session wakes the frames it changed, once. After that, silence.",
		cost: "The first edit is a surprise by design, and the second is unannounced.",
		counts: "none",
	},
	select: {
		name: "select",
		mark: "Reach, on a click. Hover rings the element under the cursor and nothing else; select it and it rings wherever it stands.",
		volume: "The rings hold while it is selected, so the write lands inside them.",
		cost: "Most of what a cursor crosses is shared. Hover answering everywhere is a field that flickers, so the cursor learns nothing until it commits.",
		counts: "screen",
	},
	echo: {
		name: "echo",
		mark: "Reach at two volumes. Hover echoes faintly in the other frames; selection rings them.",
		volume: "Same as select. The faint echo is the cursor's, the ring is the hand's.",
		cost: "Two weights of the same line, and the faint one still moves the periphery on every hover.",
		counts: "screen",
	},
	rail: {
		name: "rail",
		mark: "Select, and the pages rail marks every frame that renders the export, on this page or another. The canvas rings the ones on screen.",
		volume: "Same as select. The rail is the map of the seven you cannot see.",
		cost: "Two surfaces carry one fact. The rail has to know the export, which is the finer index again.",
		counts: "export",
	},
	name: {
		name: "name",
		mark: "Rail, and a name at hover. Point at a shared element and its export stands over the hover ring, Button, in the one accent. A local element stays unlabelled.",
		volume: "Same as rail. The name is the cursor's mark, the rings and the dots are the hand's.",
		cost: "A word on every hover of a shared element, which is most hovers. It is the smallest word there is, and it still has to earn its place.",
		counts: "export",
	},
};

/** What a take's head says about how far this element goes. */
export function countLine(take: Take, element: DocElement): string | null {
	const origin = element.origin;
	if (origin === undefined) return null;
	if (take.counts === "none") return null;
	if (take.counts === "file") return `rendered by ${origin.fileFrames} frames`;
	if (take.counts === "export") return `${origin.export} is in ${origin.exportFrames} frames`;
	const here = reachOf(element.id);
	const seen = here.length === 0 ? "no other frame on screen" : `${here.join(" and ")} on screen`;
	return `${origin.exportFrames} frames · ${seen}`;
}
