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

export type LadderName = "shipped" | "descend" | "run" | "depth";

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
	const held = heldIn(selection, frame);
	if (chain.length === 0) return { kind: "frame", frame };
	if (accel) {
		return ladder === "run"
			? { kind: "element", frame, path: oneDown(chain, held) }
			: { kind: "element", frame, path: chain };
	}
	// The Figma port drops the frame off the click: a click on the body takes
	// the shallowest child, and the frame is reached from its label or by Esc.
	if (ladder === "descend") return { kind: "element", frame, path: atDepth(chain, held) };
	if (held !== null) return { kind: "element", frame, path: atDepth(chain, held) };
	return { kind: "frame", frame };
}

/** What a double-click is aimed at — the question this whole ticket turns on. */
export function aimDouble(ladder: LadderName, gesture: Gesture): Target {
	const { chain, frame, selection } = gesture;
	const held = heldIn(selection, frame);
	if (ladder === "shipped" || ladder === "run") return { kind: "run", frame };
	if (chain.length === 0) return { kind: "run", frame };
	const next = oneDown(chain, held);
	if (ladder === "descend") {
		// nothing below the leaf: the ladder simply ends, and running is Enter's
		return held !== null && held.length === chain.length ? { kind: "element", frame, path: held } : { kind: "element", frame, path: next };
	}
	// depth: the bottom rung is the live document, so the ladder falls through
	if (held !== null && held.length === chain.length) return { kind: "run", frame };
	return { kind: "element", frame, path: next };
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
	/** Enter runs the frame */
	enterRuns: boolean;
}

export const LADDERS: Record<LadderName, Ladder> = {
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
		enterRuns: false,
	},
	descend: {
		name: "descend",
		title: "double-click descends",
		claim: "Figma's ladder, whole. Running the frame moves to Enter.",
		cost: "A click on the body no longer takes the frame, and running loses its gesture.",
		bindings: [
			{ keys: "hover", does: "the element at the scope", changed: true },
			{ keys: "click", does: "the element at the scope", changed: true },
			{ keys: "click label", does: "the frame", changed: true },
			{ keys: "⌥ click", does: "the deepest element" },
			{ keys: "double", does: "down one rung", changed: true },
			{ keys: "enter", does: "run the frame", changed: true },
			{ keys: "esc", does: "up one rung" },
		],
		enterRuns: true,
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
		enterRuns: false,
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
		enterRuns: false,
	},
};
