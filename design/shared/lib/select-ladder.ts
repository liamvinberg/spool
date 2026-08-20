/**
 * The selection ladder, as four rival readings of the same gestures.
 *
 * The canvas already climbs Figma's ladder to *point* at an element: ⌘-click
 * lands deepest, a plain click walks the scope sideways, Esc climbs down. What
 * it has never done is *hand* you the element — selection is a reference the
 * agent reads, not a handle you drag. Direct manipulation turns it into a
 * handle, which makes descent the common act rather than the occasional one,
 * and that is what puts double-click in play: today it enters the frame.
 *
 * Each ladder below answers "what does double-click mean" differently and
 * carries the consequence. The rules are data so the four frames differ in one
 * table rather than in four screens.
 */

export type LadderName = "descend" | "fallthrough" | "shipped" | "run" | "depth";

/** One element in the mock document. Children are what descent descends into. */
export interface Node {
	id: string;
	/** what the inspector and the readout call it */
	name: string;
	children?: readonly Node[];
}

/** The path from the frame's root element down to one node, as ids. */
export type Path = readonly string[];

export type Selection =
	| { kind: "none" }
	| { kind: "frame"; frame: string }
	| { kind: "element"; frame: string; path: Path };

/** What a gesture is about to land on, which is also what the hover ring draws. */
export type Target =
	| { kind: "frame"; frame: string }
	| { kind: "element"; frame: string; path: Path }
	| { kind: "run"; frame: string }
	| { kind: "nothing" };

export const CART: Node = {
	id: "screen",
	name: "screen",
	children: [
		{
			id: "header",
			name: "header",
			children: [
				{ id: "back", name: "back" },
				{ id: "title", name: "title" },
			],
		},
		{
			id: "items",
			name: "items",
			children: [
				{
					id: "row-brygg",
					name: "row",
					children: [
						{ id: "brygg-name", name: "name" },
						{ id: "brygg-price", name: "price" },
					],
				},
				{
					id: "row-bulle",
					name: "row",
					children: [
						{ id: "bulle-name", name: "name" },
						{ id: "bulle-price", name: "price" },
					],
				},
				{
					id: "row-latte",
					name: "row",
					children: [
						{ id: "latte-name", name: "name" },
						{ id: "latte-price", name: "price" },
					],
				},
			],
		},
		{
			id: "footer",
			name: "footer",
			children: [
				{ id: "total", name: "total" },
				{ id: "pay", name: "pay", children: [{ id: "pay-label", name: "label" }] },
			],
		},
	],
};

const INDEX = new Map<string, Node>();
(function walk(node: Node) {
	INDEX.set(node.id, node);
	for (const child of node.children ?? []) walk(child);
})(CART);

export function nodeOf(id: string): Node | undefined {
	return INDEX.get(id);
}

export function nameOf(path: Path): string {
	return path.map((id) => nodeOf(id)?.name ?? id).join(" / ");
}

/**
 * Figma's scope memory: the element at the held selection's depth under a fresh
 * chain — a sibling inside the shared ancestry, the divergence point outside it,
 * the shallowest child when no scope holds. Ported from the shipped canvas.
 */
export function atDepth(chain: Path, held: Path | null): Path {
	if (chain.length === 0) return [];
	if (held === null || held.length === 0) return chain.slice(0, 1);
	const depth = held.length - 1;
	let shared = 0;
	while (shared < depth && shared < chain.length && held[shared] === chain[shared]) shared++;
	return chain.slice(0, Math.min(shared, chain.length - 1) + 1);
}

/** One rung down from the held selection, along this chain. */
export function oneDown(chain: Path, held: Path | null): Path {
	if (chain.length === 0) return [];
	if (held === null) return chain.slice(0, 1);
	const shares = held.every((id, index) => chain[index] === id);
	if (!shares) return chain.slice(0, 1);
	return chain.slice(0, Math.min(held.length + 1, chain.length));
}

/**
 * Enter's target: one rung down with no pointer to aim it, so it takes the
 * first child. Figma selects every child at once; a canvas whose selection is
 * a handle wants one, and Tab walks the rest of the row from there.
 */
export function firstChildOf(selection: Selection, frame: string): Selection {
	if (selection.kind !== "element" || selection.frame !== frame) {
		return { kind: "element", frame, path: [CART.id] };
	}
	const child = nodeOf(selection.path[selection.path.length - 1] ?? "")?.children?.[0];
	return child === undefined ? selection : { kind: "element", frame, path: [...selection.path, child.id] };
}

/** Tab and shift-Tab: the next or previous child of the same parent. */
export function siblingOf(selection: Selection, frame: string, step: 1 | -1): Selection {
	if (selection.kind !== "element" || selection.frame !== frame || selection.path.length < 2) return selection;
	const parent = nodeOf(selection.path[selection.path.length - 2] ?? "");
	const row = parent?.children ?? [];
	const at = row.findIndex((child) => child.id === selection.path[selection.path.length - 1]);
	const next = row[at + step];
	if (at < 0 || next === undefined) return selection;
	return { kind: "element", frame, path: [...selection.path.slice(0, -1), next.id] };
}

/** One rung up: the parent element, then the frame, then nothing. */
export function ascend(selection: Selection): Selection {
	if (selection.kind === "element" && selection.path.length > 1) {
		return { kind: "element", frame: selection.frame, path: selection.path.slice(0, -1) };
	}
	if (selection.kind === "element") return { kind: "frame", frame: selection.frame };
	if (selection.kind === "frame") return { kind: "none" };
	return { kind: "none" };
}

/** The element scope this frame holds, if the selection is inside it. */
export function heldIn(selection: Selection, frame: string): Path | null {
	return selection.kind === "element" && selection.frame === frame ? selection.path : null;
}

export interface Gesture {
	/** the chain of ids under the pointer, root first; empty on frame background */
	chain: Path;
	frame: string;
	/** ⌥ stands in for ⌘ inside these frames — see the note in each rail */
	accel: boolean;
	selection: Selection;
}

/** What a plain click, or a hover, is aimed at. */
export function aim(ladder: LadderName, gesture: Gesture): Target {
	const { chain, frame, accel, selection } = gesture;
	const rules = LADDERS[ladder];
	const held = heldIn(selection, frame);
	if (chain.length === 0) return { kind: "frame", frame };
	if (accel) {
		return rules.accelStairs
			? { kind: "element", frame, path: oneDown(chain, held) }
			: { kind: "element", frame, path: chain };
	}
	// The Figma port drops the frame off the click: a click on the body takes
	// the shallowest child, and the frame is reached from its label or by Esc.
	if (rules.clickTakesElement) return { kind: "element", frame, path: atDepth(chain, held) };
	if (held !== null) return { kind: "element", frame, path: atDepth(chain, held) };
	return { kind: "frame", frame };
}

/** What a double-click is aimed at — the question this whole ticket turns on. */
export function aimDouble(ladder: LadderName, gesture: Gesture): Target {
	const { chain, frame, selection } = gesture;
	const rules = LADDERS[ladder];
	const held = heldIn(selection, frame);
	if (rules.doubleRuns) return { kind: "run", frame };
	// the frame label and anything that is not an element: there is no rung under
	// the pointer, so a double-click there can only mean the frame itself
	if (chain.length === 0) return { kind: "run", frame };
	if (held !== null && held.length === chain.length) {
		// the leaf: either the ladder simply ends and running is Enter's, or the
		// rung after the last one is the live document
		return rules.leafRuns ? { kind: "run", frame } : { kind: "element", frame, path: held };
	}
	return { kind: "element", frame, path: oneDown(chain, held) };
}

export interface Binding {
	keys: string;
	does: string;
	/** the row that differs from what ships, drawn lit */
	changed?: boolean;
}

export interface Ladder {
	name: LadderName;
	title: string;
	/** the one-line claim, in the rail under the title */
	claim: string;
	/** what it costs, said plainly */
	cost: string;
	bindings: readonly Binding[];
	/** a click on the body takes the element at the scope rather than the frame */
	clickTakesElement: boolean;
	/** accel walks one rung instead of landing on the deepest element */
	accelStairs: boolean;
	/** every double-click runs the frame, whatever is under the pointer */
	doubleRuns: boolean;
	/** at the leaf, the rung after the last one is the live document */
	leafRuns: boolean;
	/** Enter takes one rung down, Figma's keyboard twin of the double-click */
	enterDescends: boolean;
	/** hover draws the rung a double-click would take as well as the one a click would */
	twoRing: boolean;
	/** a double-click on the frame label runs the frame */
	labelRuns: boolean;
}

export const LADDERS: Record<LadderName, Ladder> = {
	descend: {
		name: "descend",
		title: "double-click descends",
		claim: "Figma's ladder, whole, keyboard included: Enter descends, ⇧Enter climbs, Tab walks the row. Hover shows the rung you are on and the one under it, so a descent lands where you were already looking.",
		cost: "Enter is Figma's descent, so running the frame is left without a key and has to find a gesture.",
		bindings: [
			{ keys: "hover", does: "this rung, and the next one faint", changed: true },
			{ keys: "click", does: "the element at the scope", changed: true },
			{ keys: "click label", does: "the frame", changed: true },
			{ keys: "⌥ click", does: "the deepest element" },
			{ keys: "double", does: "down one rung", changed: true },
			{ keys: "enter", does: "down one rung", changed: true },
			{ keys: "⇧ enter", does: "up one rung", changed: true },
			{ keys: "tab", does: "the next sibling", changed: true },
			{ keys: "⇧ tab", does: "the one before", changed: true },
			{ keys: "double label", does: "run the frame", changed: true },
			{ keys: "esc", does: "leave, then up one rung" },
		],
		clickTakesElement: true,
		accelStairs: false,
		doubleRuns: false,
		leafRuns: false,
		enterDescends: true,
		twoRing: true,
		labelRuns: true,
	},
	fallthrough: {
		name: "fallthrough",
		title: "descend, and keep going past the last rung",
		claim: "Everything descend does, plus the one gesture it is missing: at the leaf there is nothing left to descend into, so the next double-click falls through into the live document.",
		cost: "Whether a leaf is a leaf is a fact about the document, so how far the fall is varies by what the agent wrote.",
		bindings: [
			{ keys: "hover", does: "this rung, and the next one faint" },
			{ keys: "click", does: "the element at the scope" },
			{ keys: "click label", does: "the frame" },
			{ keys: "⌥ click", does: "the deepest element" },
			{ keys: "double", does: "down one rung" },
			{ keys: "double at the leaf", does: "run the frame", changed: true },
			{ keys: "enter", does: "down one rung" },
			{ keys: "⇧ enter", does: "up one rung" },
			{ keys: "tab", does: "the next sibling" },
			{ keys: "double label", does: "run the frame" },
			{ keys: "esc", does: "leave, then up one rung" },
		],
		clickTakesElement: true,
		accelStairs: false,
		doubleRuns: false,
		leafRuns: true,
		enterDescends: true,
		twoRing: true,
		labelRuns: true,
	},
	shipped: {
		name: "shipped",
		title: "as it ships",
		claim: "Double-click enters the frame. Elements are ⌘'s alone.",
		cost: "The act you will do all day needs a modifier, and no design tool trains that.",
		bindings: [
			{ keys: "hover", does: "the frame, or the scope" },
			{ keys: "click", does: "the frame, or the scope" },
			{ keys: "⌥ click", does: "the deepest element" },
			{ keys: "double", does: "run the frame" },
			{ keys: "esc", does: "up one rung" },
		],
		clickTakesElement: false,
		accelStairs: false,
		doubleRuns: true,
		leafRuns: false,
		enterDescends: false,
		twoRing: false,
		labelRuns: false,
	},
	run: {
		name: "run",
		title: "⌘ becomes the ladder",
		claim: "Running keeps its double-click. ⌘ stops being an elevator and starts being stairs.",
		cost: "Descent stays behind a modifier forever.",
		bindings: [
			{ keys: "hover", does: "the frame; ⌥ the next rung" },
			{ keys: "click", does: "the frame, or the scope" },
			{ keys: "⌥ click", does: "down one rung", changed: true },
			{ keys: "⌥ double", does: "the deepest element", changed: true },
			{ keys: "double", does: "run the frame" },
			{ keys: "esc", does: "up one rung" },
		],
		clickTakesElement: false,
		accelStairs: true,
		doubleRuns: true,
		leafRuns: false,
		enterDescends: false,
		twoRing: false,
		labelRuns: false,
	},
	depth: {
		name: "depth",
		title: "the ladder ends in the live document",
		claim: "Double-click descends until there is nothing left to descend into, and the rung after the last one is the running frame.",
		cost: "Where descending turns into running is the document's shape, not yours. The hover ring has to say it.",
		bindings: [
			{ keys: "hover", does: "the next rung, and whether it runs", changed: true },
			{ keys: "click", does: "the frame, or the scope" },
			{ keys: "⌥ click", does: "the deepest element" },
			{ keys: "double", does: "down one rung", changed: true },
			{ keys: "double again", does: "run the frame", changed: true },
			{ keys: "esc", does: "up one rung" },
		],
		clickTakesElement: false,
		accelStairs: false,
		doubleRuns: false,
		leafRuns: true,
		enterDescends: false,
		twoRing: false,
		labelRuns: false,
	},
};
