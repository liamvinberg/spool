import { createHash } from "node:crypto";
import { parse } from "@babel/parser";
import type { JSXAttribute, JSXElement, JSXSpreadAttribute, Node } from "@babel/types";
import { parseStampRef } from "../stamp";
import { isLayoutOnly, readJsxText, textCore, writeJsxText } from "./jsx-text";
import { walkNodes } from "./jsx-walk";

/**
 * The write lane (#253): a typed op in, the exact characters out.
 *
 * Everything a hand changes about frame source comes through here. An op names
 * the stamp it acted on; this parses the file fresh, never a mirror of it,
 * finds the element that stamp points at, and either answers with a span patch
 * or refuses with a reason the surface can show. A refusal means the gesture
 * does not apply and nothing else happens: nothing is forwarded to an agent,
 * and the element stays what it was.
 *
 * The splice replaces the touched characters and nothing else, so the file
 * comes back byte-identical outside them — the other attributes on the same
 * element, the author's indentation, the trailing comma three lines down. That
 * is what keeps a hand edit an ordinary working-tree change rather than a
 * reformat.
 *
 * The module is pure over text. Reading the file, checking the fingerprint and
 * writing the bytes belong to the caller, which is the one that owns the
 * design/ boundary.
 */

export type HandOp =
	/** the element's words, as the frame's child nodes after the edit (#314) */
	| { kind: "set-text"; source: string; nodes: readonly EditedNode[] }
	/** words a call site supplies to a component, written at that call (#314) */
	| { kind: "set-supplied"; source: string; prop: string; text: string }
	/** the element out of the file, its own line with it when it stands alone (#317) */
	| { kind: "delete"; source: string }
	/** the element before or after a sibling written in the same parent (#340) */
	| { kind: "move"; source: string; target: string; place: Place };

/** Which side of the sibling a move lands on (#340). */
export type Place = "before" | "after";

export type RefusalCode =
	| "stale-stamp"
	| "expression-text"
	| "no-text"
	| "text-shape"
	| "supplied-text"
	// the element is the whole of what a component returns, so taking it out
	// would take the component with it (#317)
	| "whole-return"
	// it is one literal a `.map()` renders once per row, and nothing said which
	// row the hand is on, so taking it out would take every row (#324)
	| "mapped-template"
	// the rows come from something with no literal to take an entry out of: a
	// call, a fetched value, a prop (#324)
	| "mapped-expression"
	// it is written inside an expression rather than standing as a child, so
	// its characters are not a thing that can simply go (#317)
	| "expression-child"
	// a move whose neighbour is not written beside it in the same parent (#340):
	// another container, another file, or across words
	| "not-siblings"
	// a move across something the file computes: a condition, a list, a spread (#340)
	| "sibling-expression"
	| "unparsable"
	| "overlapping-ops"
	// the one the caller answers, because only it can: the file moved under
	// the read the op was formed against
	| "stale-file";

export interface PatchRefusal {
	code: RefusalCode;
	/** the sentence the surface shows on the element the gesture was about */
	says: string;
	/** what the file says instead, when naming it is the whole of the answer */
	expression?: string;
	/** the line the sentence points at, when editing the file there is the answer (#317) */
	line?: number;
}

export type Planned =
	| {
			ok: true;
			/** the file after the ops, byte-identical outside what they touched */
			text: string;
			/** Exact planner spans, including identical bytes inside the authored value. */
			patches: readonly SpanPatch[];
			/** the ops landed on an element inside a `map`, so every row moved */
			mapped: boolean;
	  }
	| { ok: false; refusal: PatchRefusal };

/** One replacement of a run of characters — a patch, and its own inverse. */
export interface SpanPatch {
	start: number;
	end: number;
	text: string;
}

/**
 * One child node of an edited element, as the frame hands it back (#314): a
 * text node's words, or an element and its own children. The daemon maps each
 * one to the JSX child at the same index, so this is the whole of what a
 * commit says.
 */
export type EditedNode = { text: string } | { tag: string; nodes: readonly EditedNode[] };

/** The inline tags an editable element may hold, each passing the same rule. */
export const INLINE_TAGS: ReadonlySet<string> = new Set(["span", "i", "b", "em", "strong", "a", "small", "code"]);

const NODE_CAP = 256;
const NODE_DEPTH = 8;

/** The child nodes a commit carries, or nothing: bounded, because the daemon is about to walk them. */
export function parseEditedNodes(value: unknown, depth = 0): EditedNode[] | undefined {
	if (!Array.isArray(value) || value.length > NODE_CAP || depth > NODE_DEPTH) return undefined;
	const nodes: EditedNode[] = [];
	for (const one of value) {
		if (typeof one !== "object" || one === null) return undefined;
		const held = one as Record<string, unknown>;
		if (typeof held.text === "string") {
			nodes.push({ text: held.text });
			continue;
		}
		if (typeof held.tag !== "string" || !/^[a-z][a-z0-9]*$/.test(held.tag)) return undefined;
		const inner = parseEditedNodes(held.nodes ?? [], depth + 1);
		if (inner === undefined) return undefined;
		nodes.push({ tag: held.tag, nodes: inner });
	}
	return nodes;
}

/** The words of a node list as one string: what a supplied prop or an ask carries. */
export function flatText(nodes: readonly EditedNode[]): string {
	return nodes.map((node) => ("text" in node ? node.text : node.tag === "br" ? "\n" : flatText(node.nodes))).join("");
}

const STAMP = /^[^\s:]+:\d+:\d+$/;

/**
 * The stamps a read asks about, or nothing. Strict for the same reason the ops
 * are: every one of them names a place in a file the daemon is about to open.
 */
export function parseStamps(value: unknown): string[] | undefined {
	if (!Array.isArray(value) || value.length === 0 || value.length > 32) return undefined;
	if (!value.every((source): source is string => typeof source === "string" && STAMP.test(source))) return undefined;
	return [...value];
}

export function fingerprintOf(source: string): string {
	return createHash("sha256").update(source).digest("hex");
}

/** The bytes a file's fingerprint was taken of, changed exactly where the patch says. */
export function applySpan(source: string, patch: SpanPatch): string {
	return source.slice(0, patch.start) + patch.text + source.slice(patch.end);
}

/**
 * The patch that turns `after` back into `before`: the run between the common
 * ends, and nothing else. One gesture is one patch even when it wrote two
 * tokens, which is what makes it one press of undo.
 */
export function spanBetween(before: string, after: string): SpanPatch {
	let start = 0;
	while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
	let tail = 0;
	while (
		tail < before.length - start &&
		tail < after.length - start &&
		before[before.length - 1 - tail] === after[after.length - 1 - tail]
	) {
		tail += 1;
	}
	const end = after.length - tail;
	let text = before.slice(start, before.length - tail);
	// A run put back where nothing was taken is slid as far left as it will go.
	// Any rotation of it writes the same bytes, and the leftmost one is the
	// place an author would have written it — which is what makes the stamp
	// sitting there the element the run begins rather than its neighbour: the
	// `<` of a paragraph put back is the paragraph's, not the link after it.
	if (start === end) {
		while (start > 0 && text.length > 0 && after[start - 1] === text[text.length - 1]) {
			text = `${after[start - 1]}${text.slice(0, -1)}`;
			start -= 1;
		}
		return { start, end: start, text };
	}
	return { start, end, text };
}

/**
 * The ops against one file's text, all of them or none.
 *
 * Every stamp is resolved against the text as the canvas read it and the
 * splices are applied from the back, so an op never lands on offsets an
 * earlier op moved.
 */
export function planOps(source: string, ops: readonly HandOp[]): Planned {
	let program: Node;
	try {
		program = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as Node;
	} catch {
		return { ok: false, refusal: { code: "unparsable", says: "the file does not parse" } };
	}

	const patches: SpanPatch[] = [];
	let mapped = false;

	for (const op of ops) {
		const stamp = parseStampRef(op.source);
		const element = stamp === undefined ? undefined : elementAt(program, stamp.line, stamp.column, stamp.rel);
		if (element === undefined) return { ok: false, refusal: STALE_STAMP };
		if (element.mapped) mapped = true;
		const planned = planOne(source, program, element, op);
		if ("refusal" in planned) return { ok: false, refusal: planned.refusal };
		patches.push(...planned.patches);
	}

	const ordered = [...patches].sort((a, b) => a.start - b.start);
	for (const [index, patch] of ordered.entries()) {
		const next = ordered[index + 1];
		if (next !== undefined && next.start < patch.end) {
			return { ok: false, refusal: { code: "overlapping-ops", says: "two edits touch the same characters" } };
		}
	}
	let text = source;
	for (const patch of [...ordered].reverse()) text = applySpan(text, patch);
	return { ok: true, text, mapped, patches: ordered };
}

/** The stamp names a position the file no longer has anything at. */
export const STALE_STAMP: PatchRefusal = { code: "stale-stamp", says: "the stamp hits nothing" };

/**
 * What the file says about one element, for a surface that has to draw it
 * before anybody touches it (#256).
 *
 * The properties rail reads rather than writes: the crumbs want the name the
 * author wrote. That is a fact about the file, so it is parsed out of it the
 * same way an op is — fresh, never from a mirror.
 */
export interface ElementRead {
	/**
	 * Why a hand may not type into this element's words, when the file alone
	 * says so (#339): the refusal a text write here would meet, asked before
	 * the words are opened, so Enter on them can say it on the element rather
	 * than after the typing. Absent where the file allows it, and where the
	 * answer is a call site's: words a caller passes are the call's to allow.
	 */
	words?: PatchRefusal;
}

/** One read per position asked about, in order; nothing where the stamp hits nothing. */
export function readElements(
	source: string,
	at: readonly { line: number; column: number }[],
	/** how the file is named to a person */
	rel = "",
): (ElementRead | undefined)[] {
	let program: Node;
	try {
		program = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as Node;
	} catch {
		return at.map(() => undefined);
	}
	return at.map(({ line, column }) => {
		const element = elementAt(program, line, column, rel);
		if (element === undefined) return undefined;
		const words = wordsRefusal(source, element);
		return words === undefined ? {} : { words };
	});
}

/**
 * The file's own answer to typing into an element's words, before anything
 * is typed (#339): the same rule a text write runs, minus the words.
 *
 * A self-closing element has none to type into, and children that are code
 * refuse by name. Words a call site supplies are left to the write, because
 * whether the call wrote a literal is a fact about another file.
 */
function wordsRefusal(source: string, element: Element): PatchRefusal | undefined {
	if (element.selfClosing) return { code: "no-text", says: "no text of its own" };
	const children = spoken(source, element.children);
	const only = children.length === 1 ? children[0] : undefined;
	if (only?.type === "JSXExpressionContainer" && only.expression.type === "Identifier") return undefined;
	return textRule(source, element.children);
}

/**
 * One op's characters, or the reason it has none.
 *
 * Several patches rather than one, because a text edit rewrites each run of
 * words it touched. They still land as one undo step — the stack holds the
 * span between the file before and after, not the ops that made it.
 */
export type OnePlan = { patches: SpanPatch[] } | { refusal: PatchRefusal };

function planOne(source: string, program: Node, element: Element, op: HandOp): OnePlan {
	switch (op.kind) {
		case "set-text":
			return planText(source, element, op.nodes);
		case "set-supplied":
			return planSupplied(source, element, op.prop, op.text);
		case "delete":
			return planDelete(source, element);
		case "move":
			return planMove(source, element, targetOf(program, op), op.place);
	}
}

/** The sibling a move names, or why it names none: nothing there, or a place in another file. */
function targetOf(program: Node, op: Extract<HandOp, { kind: "move" }>): Element | PatchRefusal {
	const from = parseStampRef(op.source);
	const to = parseStampRef(op.target);
	if (to === undefined) return STALE_STAMP;
	if (from?.rel !== to.rel) {
		return { code: "not-siblings", says: "the one next to it is written in another file; ask the agent" };
	}
	return elementAt(program, to.line, to.column, to.rel) ?? STALE_STAMP;
}

/* ---------- the ops ---------- */

/**
 * The words, in place (#314).
 *
 * The rule is about the file and not the DOM: every child of the element at
 * the stamp is JSX text, a line break, a string in braces, or an inline
 * element whose children pass the same rule. An expression child refuses and
 * is named, because it is code. What the frame hands back is its child nodes,
 * and each text node maps to the JSX child at the same index and rewrites its
 * range with the lane's escaping; a child the hand did not touch is not
 * written, so the file keeps its spelling there.
 *
 * Inline elements anchor the mapping and must still be there, in order. Text
 * between two anchors is a run: while the browser kept the run's shape the
 * nodes map one to one, and once it merged or split them the run is written
 * whole. A `<br/>` is part of a run rather than an anchor, because deleting
 * across a line break is the most ordinary edit there is.
 */
function planText(source: string, element: Element, nodes: readonly EditedNode[]): OnePlan {
	if (element.selfClosing) return { refusal: { code: "no-text", says: "no text of its own" } };
	const refused = textRule(source, element.children);
	if (refused !== undefined) return { refusal: refused };
	return planChildren(source, spoken(source, element.children), element.openEnd, nodes);
}

/**
 * Whose words the element at a stamp carries (#314): its own, or ones a call
 * site supplies as `{children}` or a prop name standing alone between the
 * tags. Nothing when the stamp hits nothing.
 */
export function textOwner(
	source: string,
	line: number,
	column: number,
): { kind: "own" } | { kind: "supplied"; prop: string } | undefined {
	let program: Node;
	try {
		program = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as Node;
	} catch {
		return undefined;
	}
	const element = elementAt(program, line, column);
	if (element === undefined) return undefined;
	const children = spoken(source, element.children);
	const only = children.length === 1 ? children[0] : undefined;
	if (only?.type === "JSXExpressionContainer" && only.expression.type === "Identifier") {
		return { kind: "supplied", prop: only.expression.name };
	}
	return { kind: "own" };
}

/**
 * How a write moved the stamps around it (#314): every element on the same
 * line after a patch shifts by the characters it added or took, and a frame
 * that is not reloaded carries those stamps on. Nothing when a patch crossed
 * a line, because then the lines under it moved too and only a reload says
 * where to.
 */
export interface StampShift {
	line: number;
	column: number;
	delta: number;
	/**
	 * How many characters the patch replaced.
	 *
	 * It is what tells an insertion from a replacement, and the two move the
	 * stamp sitting exactly at the patch differently: characters put in front of
	 * an element push it along, characters written over a run leave whatever
	 * stood at the run's own start where it was.
	 */
	taken: number;
}

export function shiftsOf(source: string, patches: readonly SpanPatch[]): StampShift[] | null {
	const shifts: StampShift[] = [];
	for (const patch of patches) {
		const replaced = source.slice(patch.start, patch.end);
		if (replaced.includes("\n") || patch.text.includes("\n")) return null;
		const before = source.slice(0, patch.start);
		const line = before.split("\n").length;
		const column = patch.start - (before.lastIndexOf("\n") + 1) + 1;
		shifts.push({ line, column, delta: patch.text.length - replaced.length, taken: replaced.length });
	}
	return shifts;
}

function planSupplied(source: string, call: Element, prop: string, text: string): OnePlan {
	const computed: OnePlan = {
		refusal: { code: "supplied-text", says: `${prop} is computed at the call site` },
	};
	if (prop === "children") {
		if (call.selfClosing) return computed;
		const children = spoken(source, call.children);
		if (children.length === 0 || children.some((child) => !isTextish(child))) return computed;
		return { patches: [runPatch(source, children, call.openEnd, [{ text }])] };
	}
	const held = attributeNamed(call, prop);
	if (held === undefined) return computed;
	if (held.value?.type === "JSXExpressionContainer" && held.value.expression.type === "StringLiteral") {
		const literal = held.value.expression;
		return { patches: [{ start: nodeStart(literal), end: nodeEnd(literal), text: jsonString(text) }] };
	}
	const slot = literalSlotOf(source, held);
	if (slot === undefined) return computed;
	// a raw line break in an attribute is legal, and it would move the stamp of
	// every element under it, so typed ones are written as the entity
	const escaped = escapeAttribute(text).replaceAll("\n", "&#10;").replaceAll("\r", "&#13;");
	return { patches: [narrowed(slot.start, slot.raw, escaped)] };
}

/**
 * The element, out of the file (#317).
 *
 * Its own characters where it sits among words on a line, and its whole line
 * where it stands alone on one — indentation and line break included, because
 * an author who gave an element a line of its own did not also ask for a blank
 * one in its place.
 *
 * It has to be a child of JSX for its characters to be a thing that can simply
 * go. The whole of what a function returns is not: taking it out would leave a
 * component returning nothing, so that refuses and the surface offers the call
 * that renders it instead. Anything written inside an expression — a branch, a
 * row of an array, a value passed to a prop — refuses for the same reason in a
 * different shape.
 */
function planDelete(source: string, element: Element): OnePlan {
	// One literal, every row (#324). Taking these characters out takes the row
	// off every entry of the list at once, which is never what a hand meant by
	// pressing ⌫ on one of them. The honest gesture is the item, and the canvas
	// sends that one whenever the running document could say which row it was.
	const rows = mapCallOver(element.ancestors);
	if (rows !== undefined) {
		return {
			refusal: {
				code: "mapped-template",
				says: `these rows come from \`${rows.callee}\`; delete one item, or ask the agent`,
				expression: rows.callee,
				line: element.node.loc?.start.line ?? 0,
			},
		};
	}
	const parent = element.parent;
	if (parent?.type !== "JSXElement" && parent?.type !== "JSXFragment") {
		const owner = returnedFrom(element);
		if (owner === undefined) {
			return {
				refusal: {
					code: "expression-child",
					says: "it is written inside an expression; edit it in code or ask the agent",
				},
			};
		}
		return {
			refusal: {
				code: "whole-return",
				says:
					owner === ""
						? "it is the whole of what a function returns; edit it in code or ask the agent"
						: `it is all of ${owner}; the call that renders it is what a hand can take out`,
				// the line it is defined on, so the notice names the file it is
				// defined in rather than the frame the hand was looking at
				line: element.node.loc?.start.line ?? 0,
			},
		};
	}
	return { patches: [cutOut(source, nodeStart(element.node), nodeEnd(element.node))] };
}

/** Whether this element is the whole of a function's return, and what that function is called. */
function returnedFrom(element: Element): string | undefined {
	const ancestors = element.ancestors;
	const parent = ancestors[ancestors.length - 1];
	if (parent === undefined) return undefined;
	const returned =
		parent.type === "ReturnStatement" || (parent.type === "ArrowFunctionExpression" && parent.body === element.node);
	if (!returned) return undefined;
	for (let at = ancestors.length - 1; at >= 0; at -= 1) {
		const node = ancestors[at];
		if (node === undefined) continue;
		if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression") return node.id?.name ?? "";
		if (node.type === "ArrowFunctionExpression") {
			const held = ancestors[at - 1];
			if (held?.type === "VariableDeclarator" && held.id.type === "Identifier") return held.id.name;
			return "";
		}
	}
	return "";
}

/** The characters an element takes with it: its own, plus its line when nothing else is on it. */
function cutOut(source: string, start: number, end: number): SpanPatch {
	const lineStart = source.lastIndexOf("\n", start - 1) + 1;
	let after = end;
	while (after < source.length && (source[after] === " " || source[after] === "\t")) after += 1;
	const alone = /^[ \t]*$/.test(source.slice(lineStart, start)) && (after >= source.length || source[after] === "\n");
	if (!alone) return { start, end, text: "" };
	// the last line of a file has no break of its own to take, so it takes the
	// one above it and leaves the line before it ending where it did
	if (after >= source.length) return { start: lineStart === 0 ? 0 : lineStart - 1, end: after, text: "" };
	return { start: lineStart, end: after + 1, text: "" };
}

/**
 * The element before or after a sibling (#340).
 *
 * Both have to be children the same parent JSX writes, with nothing the file
 * computes between them, because only then is the order on screen the order
 * in the file. The elements in the run between them change places and every
 * character between two of them stays where it was, so the indentation, the
 * line breaks and a space between two inline siblings all keep their places.
 * The splice is the one run from the first of them to the last.
 */
function planMove(source: string, element: Element, target: Element | PatchRefusal, place: Place): OnePlan {
	const rows = mapCallOver(element.ancestors);
	if (rows !== undefined) {
		return {
			refusal: {
				code: "mapped-template",
				says: `these rows come from \`${rows.callee}\`; move one item, or ask the agent`,
				expression: rows.callee,
				line: element.node.loc?.start.line ?? 0,
			},
		};
	}
	const parent = element.parent;
	if (parent?.type !== "JSXElement" && parent?.type !== "JSXFragment") {
		const owner = returnedFrom(element);
		return {
			refusal:
				owner === undefined
					? { code: "expression-child", says: "it is written inside an expression; ask the agent" }
					: {
							code: "whole-return",
							says:
								owner === ""
									? "it is the whole of what a function returns; ask the agent"
									: `it is all of ${owner}; the call that renders it is what moves`,
							line: element.node.loc?.start.line ?? 0,
						},
		};
	}
	if ("code" in target) return { refusal: target };
	const children = parent.children;
	const from = children.indexOf(element.node);
	const to = children.indexOf(target.node as Child);
	if (to === -1) {
		// written inside an expression that is itself a child of this parent: the
		// sibling on screen is something the file computes
		const held = children.find((child) => child.type === "JSXExpressionContainer" && contains(child, target.node));
		if (held?.type === "JSXExpressionContainer") return { refusal: computedSibling(source, held) };
		return {
			refusal: { code: "not-siblings", says: "they are not written side by side in one container; ask the agent" },
		};
	}
	const low = Math.min(from, to);
	const high = Math.max(from, to);
	const slots: Node[] = [];
	for (const child of children.slice(low, high + 1)) {
		if (child.type === "JSXElement" || child.type === "JSXFragment") {
			slots.push(child);
			continue;
		}
		if (child.type === "JSXText") {
			// a space between two inline siblings is a gap, and it stays put
			if (rawOf(source, child).trim() === "") continue;
			return { refusal: { code: "not-siblings", says: "there are words between them; ask the agent" } };
		}
		if (child.type === "JSXExpressionContainer" && child.expression.type === "JSXEmptyExpression") continue;
		if (child.type === "JSXExpressionContainer") return { refusal: computedSibling(source, child) };
		return { refusal: { code: "sibling-expression", says: "a spread sits between them; ask the agent" } };
	}
	return rotated(source, slots, element.node, target.node, place);
}

/** Why a sibling the file computes cannot be moved past, named the way a person would. */
function computedSibling(source: string, held: Extract<Child, { type: "JSXExpressionContainer" }>): PatchRefusal {
	const expression = held.expression;
	const what =
		expression.type === "LogicalExpression" || expression.type === "ConditionalExpression"
			? "a condition"
			: expression.type === "CallExpression" && isMapCall(expression)
				? "a list"
				: "an expression";
	const said = rawOf(source, held);
	const shown = said.length > 40 ? `${said.slice(0, 37)}…}` : said;
	return {
		code: "sibling-expression",
		says: `the one next to it comes from ${what}; ask the agent`,
		expression: shown,
	};
}

function contains(outer: Node, inner: Node): boolean {
	return nodeStart(outer) <= nodeStart(inner) && nodeEnd(inner) <= nodeEnd(outer);
}

/**
 * One run of siblings with one of them moved (#340): the slots change order
 * and the characters between two slots stay where they were. Nothing moves
 * when the element already stands where it would land.
 */
function rotated(source: string, slots: readonly Node[], moved: Node, target: Node, place: Place): OnePlan {
	const order = slots.filter((slot) => slot !== moved);
	const at = order.indexOf(target);
	if (at === -1) return { patches: [] };
	order.splice(place === "before" ? at : at + 1, 0, moved);
	if (order.every((slot, index) => slot === slots[index])) return { patches: [] };
	const first = slots[0];
	const last = slots[slots.length - 1];
	if (first === undefined || last === undefined) return { patches: [] };
	let text = "";
	for (const [index, slot] of order.entries()) {
		text += rawOf(source, slot);
		const next = slots[index + 1];
		const here = slots[index];
		if (next !== undefined && here !== undefined) text += source.slice(nodeEnd(here), nodeStart(next));
	}
	const start = nodeStart(first);
	return { patches: [narrowed(start, source.slice(start, nodeEnd(last)), text)] };
}

/**
 * Whether the element at a stamp is the whole of what a component returns
 * (#340). A move of one addresses the call that renders it instead, because
 * the call is what the parent writes beside its siblings.
 */
export function wholeReturnAt(source: string, at: { line: number; column: number }): boolean {
	let program: Node;
	try {
		program = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as Node;
	} catch {
		return false;
	}
	const element = elementAt(program, at.line, at.column);
	if (element === undefined) return false;
	const parent = element.parent;
	if (parent?.type === "JSXElement" || parent?.type === "JSXFragment") return false;
	return returnedFrom(element) !== undefined;
}

type Child = JSXElement["children"][number];

/** The children the frame draws: layout whitespace and JSX comments are neither words nor nodes. */
function spoken(source: string, children: readonly Child[]): Child[] {
	return children.filter((child) =>
		child.type === "JSXText"
			? !isLayoutOnly(rawOf(source, child))
			: !(child.type === "JSXExpressionContainer" && child.expression.type === "JSXEmptyExpression"),
	);
}

/** A child that is words: JSX text, or a string in braces. */
function isTextish(child: Child): boolean {
	return (
		child.type === "JSXText" || (child.type === "JSXExpressionContainer" && child.expression.type === "StringLiteral")
	);
}

function isBreak(child: Child): boolean {
	return child.type === "JSXElement" && nameOf(child.openingElement.name) === "br" && child.children.length === 0;
}

/** Why these children are not words a hand may write, or nothing when they are. */
function textRule(source: string, children: readonly Child[]): PatchRefusal | undefined {
	for (const child of spoken(source, children)) {
		if (isTextish(child) || isBreak(child)) continue;
		const says = rawOf(source, child);
		if (child.type === "JSXElement") {
			const tag = nameOf(child.openingElement.name);
			if (!INLINE_TAGS.has(tag)) {
				return { code: "no-text", says: `<${tag}> is not inline text; edit it in code or ask the agent` };
			}
			const inner = textRule(source, child.children);
			if (inner !== undefined) return inner;
			continue;
		}
		return {
			code: "expression-text",
			says: `${says} is an expression; edit it in code or ask the agent`,
			expression: says,
		};
	}
	return undefined;
}

const RESHAPED: PatchRefusal = {
	code: "text-shape",
	says: "the words changed shape; edit it in code or ask the agent",
};

function planChildren(
	source: string,
	children: readonly Child[],
	openEnd: number,
	nodes: readonly EditedNode[],
): OnePlan {
	const anchors = children.filter((child): child is JSXElement => child.type === "JSXElement" && !isBreak(child));
	const held = nodes.filter(
		(node): node is { tag: string; nodes: readonly EditedNode[] } => "tag" in node && node.tag !== "br",
	);
	if (anchors.length !== held.length) return { refusal: RESHAPED };
	const patches: SpanPatch[] = [];
	let at = 0;
	let from = 0;
	for (const [index, anchor] of anchors.entries()) {
		const node = held[index];
		if (node === undefined || nameOf(anchor.openingElement.name) !== node.tag) return { refusal: RESHAPED };
		const run = planRun(
			source,
			children.slice(at, children.indexOf(anchor)),
			nodes.slice(from, nodes.indexOf(node)),
			insertionBefore(children, at, openEnd),
		);
		if ("refusal" in run) return run;
		patches.push(...run.patches);
		const inner = planChildren(source, spoken(source, anchor.children), nodeEnd(anchor.openingElement), node.nodes);
		if ("refusal" in inner) return inner;
		patches.push(...inner.patches);
		at = children.indexOf(anchor) + 1;
		from = nodes.indexOf(node) + 1;
	}
	const tail = planRun(source, children.slice(at), nodes.slice(from), insertionBefore(children, at, openEnd));
	if ("refusal" in tail) return tail;
	patches.push(...tail.patches);
	return { patches };
}

/** Where words go when a run has none: past the anchor before it, or past the opening tag. */
function insertionBefore(children: readonly Child[], at: number, openEnd: number): number {
	const before = children[at - 1];
	return before === undefined ? openEnd : nodeEnd(before);
}

/**
 * One run of words against the nodes the frame has for it. The same shape
 * maps one to one and writes only what changed; any other shape is written
 * whole, which is the one place the file's own spelling of a run gives way.
 */
function planRun(source: string, run: readonly Child[], nodes: readonly EditedNode[], insertAt: number): OnePlan {
	const kinds = (child: Child) => (isBreak(child) ? "br" : "text");
	const same =
		run.length === nodes.length &&
		run.every((child, index) => {
			const node = nodes[index];
			return (
				node !== undefined &&
				("text" in node ? kinds(child) === "text" : node.tag === "br" && kinds(child) === "br")
			);
		});
	if (same) {
		const patches: SpanPatch[] = [];
		for (const [index, child] of run.entries()) {
			const node = nodes[index];
			if (node === undefined || !("text" in node)) continue;
			const text = plainText(node.text);
			if (text === shown(source, child)) continue;
			patches.push(textPatch(source, child, text));
		}
		return { patches };
	}
	if (nodes.some((node) => "tag" in node && node.tag !== "br")) return { refusal: RESHAPED };
	if (run.length === 0) return { patches: [{ start: insertAt, end: insertAt, text: serialize(nodes) }] };
	return { patches: [runPatch(source, run, insertAt, nodes)] };
}

/** A whole run rewritten between the indentation it sits in. */
function runPatch(source: string, run: readonly Child[], insertAt: number, nodes: readonly EditedNode[]): SpanPatch {
	const first = run[0];
	const last = run[run.length - 1];
	if (first === undefined || last === undefined) return { start: insertAt, end: insertAt, text: serialize(nodes) };
	const lead = first.type === "JSXText" ? textCore(rawOf(source, first)).start : 0;
	const trail = last.type === "JSXText" ? rawOf(source, last).length - textCore(rawOf(source, last)).end : 0;
	return { start: nodeStart(first) + lead, end: nodeEnd(last) - trail, text: serialize(nodes) };
}

function serialize(nodes: readonly EditedNode[]): string {
	return nodes
		.map((node) => ("text" in node ? writeJsxText(plainText(node.text)) : node.tag === "br" ? "<br/>" : ""))
		.join("");
}

/** What the frame shows for one words child, which is what an unchanged node is measured against. */
function shown(source: string, child: Child): string {
	if (child.type === "JSXText") return readJsxText(rawOf(source, child));
	if (child.type === "JSXExpressionContainer" && child.expression.type === "StringLiteral") {
		return child.expression.value;
	}
	return "";
}

function textPatch(source: string, child: Child, text: string): SpanPatch {
	if (child.type === "JSXExpressionContainer" && child.expression.type === "StringLiteral") {
		const literal = child.expression;
		return { start: nodeStart(literal), end: nodeEnd(literal), text: jsonString(text) };
	}
	const raw = rawOf(source, child);
	const core = textCore(raw);
	return { start: nodeStart(child) + core.start, end: nodeStart(child) + core.end, text: writeJsxText(text) };
}

/** A no-break space the editor minted to keep a trailing space visible is a space. */
function plainText(text: string): string {
	return text.replaceAll("\u00a0", " ");
}

/** A string literal as JS spells it, kept on one line: a raw separator would move every stamp under it. */
function jsonString(text: string): string {
	return JSON.stringify(text).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

/**
 * The same replacement, trimmed to the characters that differ.
 *
 * Supplied words rewrite a whole attribute string, and most of what they write
 * is what was already there. Narrowing to the run between the common ends
 * keeps the promise the lane is built on: the file comes back byte-identical
 * outside the characters the edit touched.
 */
function narrowed(at: number, was: string, now: string): SpanPatch {
	const inverse = spanBetween(was, now);
	return {
		start: at + inverse.start,
		end: at + inverse.text.length + inverse.start,
		text: now.slice(inverse.start, inverse.end),
	};
}

/**
 * A JSX attribute string carries no escapes — the next quote ends it — so a
 * quote or an ampersand in the value is written as the entity JSX decodes.
 */
function escapeAttribute(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/* ---------- the element a stamp points at ---------- */

interface Element {
	node: JSXElement;
	/** the opening tag as the file spells it: `img`, `CartRow` */
	tag: string;
	attributes: readonly (JSXAttribute | JSXSpreadAttribute)[];
	children: readonly JSXElement["children"][number][];
	parent: Node | undefined;
	/** everything above it, outermost first: what says whose return this is (#317) */
	ancestors: readonly Node[];
	/** an ancestor is a `map` call: one literal here, every rendered row moved */
	mapped: boolean;
	selfClosing: boolean;
	/** just past the opening tag's `>`, where an element's own words begin */
	openEnd: number;
	/** the file as a person names it, which is what a refusal points at */
	rel: string;
}

/**
 * The element whose opening tag starts exactly where the stamp points.
 *
 * The stamp convention is the compiler's: 1-based line, 1-based column, minted
 * at serve time by the same triple esbuild hands `jsxDEV`. Anything else is a
 * stamp the file has moved on from.
 */
function elementAt(program: Node, line: number, column: number, rel = ""): Element | undefined {
	let found: Element | undefined;
	walkNodes(program, [], (node, ancestors) => {
		if (node.type !== "JSXElement") return;
		if (node.loc?.start.line !== line || node.loc.start.column + 1 !== column) return;
		const opening = node.openingElement;
		found = {
			node,
			tag: nameOf(opening.name),
			attributes: opening.attributes,
			children: node.children,
			parent: ancestors[ancestors.length - 1],
			ancestors: [...ancestors],
			mapped: ancestors.some(isMapCall),
			selfClosing: opening.selfClosing,
			openEnd: nodeEnd(opening),
			rel,
		};
	});
	return found;
}

/** `items.map(...)`: the element inside it is one literal and every row. */
function isMapCall(node: Node): boolean {
	if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression") return false;
	const property = node.callee.property;
	return property.type === "Identifier" && property.name === "map";
}

/**
 * The nearest `.map()` an element is written inside, and what it runs over
 * (#324): the callee exactly as the file spells it, and its identifier when it
 * is one, which is the only shape that has a declaration to look up.
 */
function mapCallOver(ancestors: readonly Node[]): { callee: string; name?: string } | undefined {
	for (let at = ancestors.length - 1; at >= 0; at -= 1) {
		const node = ancestors[at];
		if (node === undefined || !isMapCall(node)) continue;
		if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression") continue;
		const over = node.callee.object;
		const callee = calleeText(over);
		return over.type === "Identifier" ? { callee, name: over.name } : { callee };
	}
	return undefined;
}

/** What the rows come from, as short as a notice can name it. */
function calleeText(node: Node): string {
	if (node.type === "Identifier") return node.name;
	if (node.type === "MemberExpression" && node.property.type === "Identifier" && !node.computed) {
		return `${calleeText(node.object)}.${node.property.name}`;
	}
	if (node.type === "CallExpression") return `${calleeText(node.callee)}()`;
	if (node.type === "ThisExpression") return "this";
	if (node.type === "AwaitExpression") return `await ${calleeText(node.argument)}`;
	return "an expression";
}

/**
 * Where the array one row of a list is an entry of is written (#324).
 *
 * The stamp names the JSX the `.map()` callback returns — one literal the
 * document drew once per entry. This walks out to that call, names what it
 * runs over, and answers with the array: written here, or imported, in which
 * case the entry lives in a third file and only the caller can read it.
 */
export type MappedArray =
	/** the stamp is not inside a `.map()`: it is one element, and it goes on its own */
	| { kind: "plain" }
	/** the array is a `const` in this very file */
	| { kind: "here"; name: string; callee: string }
	/** the array is imported: follow the specifier, and take the entry there */
	| { kind: "imported"; name: string; callee: string; specifier: string }
	| { kind: "refusal"; refusal: PatchRefusal };

export function mappedArrayAt(source: string, at: { line: number; column: number }, rel = ""): MappedArray {
	let program: Node;
	try {
		program = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as Node;
	} catch {
		return { kind: "refusal", refusal: { code: "unparsable", says: "the file does not parse" } };
	}
	const element = elementAt(program, at.line, at.column, rel);
	if (element === undefined) return { kind: "refusal", refusal: STALE_STAMP };
	const rows = mapCallOver(element.ancestors);
	if (rows === undefined) return { kind: "plain" };
	const name = rows.name;
	if (name === undefined) return { kind: "refusal", refusal: fromExpression(rows.callee) };
	const bound = bindingOf(program, name);
	if (bound?.kind === "array") return { kind: "here", name, callee: rows.callee };
	if (bound?.kind === "import") {
		return { kind: "imported", name: bound.imported, callee: rows.callee, specifier: bound.specifier };
	}
	return { kind: "refusal", refusal: fromExpression(rows.callee) };
}

function fromExpression(callee: string): PatchRefusal {
	return {
		code: "mapped-expression",
		says: `these rows come from \`${callee}\`, an expression; ask the agent`,
		expression: callee,
	};
}

/** What a top-level name in this module is: an array literal, an import, or neither. */
function bindingOf(
	program: Node,
	name: string,
): { kind: "array" } | { kind: "import"; imported: string; specifier: string } | undefined {
	let found: { kind: "array" } | { kind: "import"; imported: string; specifier: string } | undefined;
	walkNodes(program, [], (node) => {
		if (found !== undefined) return;
		if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.id.name === name) {
			if (node.init?.type === "ArrayExpression") found = { kind: "array" };
			return;
		}
		if (node.type !== "ImportDeclaration") return;
		for (const held of node.specifiers) {
			if (held.local.name !== name) continue;
			if (held.type === "ImportSpecifier") {
				const imported = held.imported.type === "Identifier" ? held.imported.name : held.imported.value;
				found = { kind: "import", imported, specifier: node.source.value };
				return;
			}
			if (held.type === "ImportDefaultSpecifier") {
				found = { kind: "import", imported: "default", specifier: node.source.value };
				return;
			}
		}
	});
	return found;
}

/**
 * One entry out of an array literal (#324).
 *
 * The entry's own characters and the comma that held it to the list, plus its
 * line when it stands alone on one — the same promise `cutOut` makes for an
 * element, for the same reason: an author who gave a row a line of its own did
 * not ask for a blank one in its place. Every other byte of the file stands.
 */
export function planItemRemoval(source: string, name: string, index: number): OnePlan {
	let program: Node;
	try {
		program = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as Node;
	} catch {
		return { refusal: { code: "unparsable", says: "the file does not parse" } };
	}
	let literal: Node | undefined;
	walkNodes(program, [], (node) => {
		if (literal !== undefined) return;
		if (node.type !== "VariableDeclarator" || node.id.type !== "Identifier" || node.id.name !== name) return;
		if (node.init?.type === "ArrayExpression") literal = node.init;
	});
	if (literal === undefined || literal.type !== "ArrayExpression") {
		return { refusal: fromExpression(name) };
	}
	const entry = literal.elements[index];
	if (entry === undefined || entry === null) return { refusal: STALE_STAMP };
	return { patches: [cutEntry(source, nodeStart(entry), nodeEnd(entry))] };
}

/**
 * One entry of an array literal moved before or after another (#340): the
 * list-row half of a move. The entries in the run between them change places
 * and the commas, breaks and comments between two entries stay put, so the
 * array keeps its own spelling. A spread or a hole in the run has no place a
 * hand could name, so it refuses.
 */
export function planItemMove(source: string, name: string, index: number, target: number, place: Place): OnePlan {
	let program: Node;
	try {
		program = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as Node;
	} catch {
		return { refusal: { code: "unparsable", says: "the file does not parse" } };
	}
	let literal: Node | undefined;
	walkNodes(program, [], (node) => {
		if (literal !== undefined) return;
		if (node.type !== "VariableDeclarator" || node.id.type !== "Identifier" || node.id.name !== name) return;
		if (node.init?.type === "ArrayExpression") literal = node.init;
	});
	if (literal === undefined || literal.type !== "ArrayExpression") return { refusal: fromExpression(name) };
	const entries = literal.elements;
	const moved = entries[index];
	const beside = entries[target];
	if (moved == null || beside == null) return { refusal: STALE_STAMP };
	const run = entries.slice(Math.min(index, target), Math.max(index, target) + 1);
	const slots: Node[] = [];
	for (const entry of run) {
		if (entry === null || entry.type === "SpreadElement") {
			return {
				refusal: { code: "sibling-expression", says: `\`${name}\` spreads or skips an entry here; ask the agent` },
			};
		}
		slots.push(entry);
	}
	return rotated(source, slots, moved, beside, place);
}

/** The characters one array entry takes with it: its own, its comma, and its line when it has one. */
function cutEntry(source: string, start: number, end: number): SpanPatch {
	const space = (at: number): boolean => source[at] === " " || source[at] === "\t";
	let from = start;
	let after = end;
	while (after < source.length && space(after)) after += 1;
	if (source[after] === ",") {
		after += 1;
		while (after < source.length && space(after)) after += 1;
	} else {
		// the last entry carries no comma of its own, so it takes the one that
		// held it to the entry before it
		let back = start;
		while (back > 0 && /\s/.test(source[back - 1] ?? "")) back -= 1;
		if (source[back - 1] === ",") from = back - 1;
	}
	const lineStart = source.lastIndexOf("\n", from - 1) + 1;
	const alone = /^[ \t]*$/.test(source.slice(lineStart, from)) && (after >= source.length || source[after] === "\n");
	if (!alone) return { start: from, end: after, text: "" };
	if (after >= source.length) return { start: lineStart === 0 ? 0 : lineStart - 1, end: after, text: "" };
	return { start: lineStart, end: after + 1, text: "" };
}

/** A tag name as one string, member expressions and namespaces flattened. */
function nameOf(name: JSXElement["openingElement"]["name"]): string {
	if (name.type === "JSXIdentifier") return name.name;
	if (name.type === "JSXNamespacedName") return `${name.namespace.name}:${name.name.name}`;
	return `${nameOf(name.object)}.${name.property.name}`;
}

function attributeNamed(element: Element, name: string): JSXAttribute | undefined {
	return element.attributes.find(
		(attribute): attribute is JSXAttribute => attribute.type === "JSXAttribute" && attribute.name.name === name,
	);
}

/**
 * The characters between an attribute string's quotes, and where they start:
 * the span supplied words are written into. Nothing where the attribute is no
 * string written in the file.
 */
function literalSlotOf(source: string, attribute: JSXAttribute): { raw: string; start: number } | undefined {
	const value = attribute.value;
	if (value?.type !== "StringLiteral") return undefined;
	const start = nodeStart(value) + 1;
	return { raw: source.slice(start, nodeEnd(value) - 1), start };
}

function rawOf(source: string, node: Node): string {
	return source.slice(nodeStart(node), nodeEnd(node));
}

/** A parsed node always carries its range; the fallbacks are the types', not ours. */
function nodeStart(node: Node): number {
	return node.start ?? 0;
}

function nodeEnd(node: Node): number {
	return node.end ?? 0;
}
