import { createHash } from "node:crypto";
import { parse } from "@babel/parser";
import type { JSXAttribute, JSXElement, JSXSpreadAttribute, Node } from "@babel/types";
import { type ClassEdit, type ClassTheme, screenConflict, writeClass } from "./class-write";
import { isLayoutOnly, textCore, writeJsxText } from "./jsx-text";
import { walkNodes } from "./jsx-walk";

/**
 * The write lane (#253): a typed op in, the exact characters out.
 *
 * Everything a hand changes about frame source comes through here. An op names
 * the stamp it acted on; this parses the file fresh — never a mirror of it —
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
	| { kind: "set-text"; source: string; text: string }
	| { kind: "delete"; source: string }
	| { kind: "set-class"; source: string; token: string; scope: string; remove?: boolean }
	| { kind: "set-attribute"; source: string; name: string; value: string };

export type RefusalCode =
	| "computed-class"
	| "inline-style"
	| "spread-props"
	| "variant-conflict"
	| "stale-stamp"
	| "mapped-text"
	| "expression-text"
	| "no-text"
	| "not-a-child"
	| "expression-attribute"
	| "class-attribute"
	| "unparsable"
	| "overlapping-ops"
	// the two the caller answers, because only it can: the element is defined
	// somewhere this project's other frames render too, and the file moved
	// under the read the op was formed against
	| "shared-definition"
	| "stale-file";

export interface PatchRefusal {
	code: RefusalCode;
	/** the sentence the surface shows on the greyed control */
	says: string;
	/** what the file says instead, when naming it is the whole of the answer */
	expression?: string;
}

export type Planned =
	| {
			ok: true;
			/** the file after the ops, byte-identical outside what they touched */
			text: string;
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
 * The patch a canvas holds on to: the span, the file it lands in, and the hash
 * that file must still have. It is what an undo, a redo and a rollback after a
 * measurement all run, and running it answers with the next one.
 */
export interface HeldPatch extends SpanPatch {
	path: string;
	fingerprint: string;
}

/** A token is one word; a scope is a chain of variant prefixes or nothing. */
const TOKEN = /^-?[A-Za-z0-9][^\s]*$/;
const SCOPE = /^([a-z0-9][a-z0-9-]*:)*$/;
const ATTRIBUTE = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const STAMP = /^[^\s:]+:\d+:\d+$/;
const TEXT_CAP = 4096;

/**
 * The ops off the wire, or nothing. Strict: an op the daemon cannot read is a
 * 400 rather than a guess, because every one of them writes to a file.
 *
 * The cap is a bound on one gesture rather than a budget: a corner drag is two
 * ops and dropping a whole scope is one op per token under it (#256), which is
 * as many as an element has. Thirty-two is the same ceiling the rail's read
 * takes, and every one of them folds into a single patch on one literal.
 */
export function parseHandOps(value: unknown): HandOp[] | undefined {
	if (!Array.isArray(value) || value.length === 0 || value.length > 32) return undefined;
	const ops: HandOp[] = [];
	for (const raw of value) {
		if (typeof raw !== "object" || raw === null) return undefined;
		const { kind, source, text, token, scope, remove, name, value: attribute } = raw as Record<string, unknown>;
		if (typeof source !== "string" || !STAMP.test(source)) return undefined;
		if (kind === "delete") {
			ops.push({ kind, source });
			continue;
		}
		if (kind === "set-text") {
			if (typeof text !== "string" || text.length > TEXT_CAP) return undefined;
			ops.push({ kind, source, text });
			continue;
		}
		if (kind === "set-class") {
			if (typeof token !== "string" || !TOKEN.test(token)) return undefined;
			if (typeof scope !== "string" || !SCOPE.test(scope)) return undefined;
			if (remove !== undefined && typeof remove !== "boolean") return undefined;
			ops.push({ kind, source, token, scope, ...(remove === true ? { remove: true } : {}) });
			continue;
		}
		if (kind === "set-attribute") {
			if (typeof name !== "string" || !ATTRIBUTE.test(name)) return undefined;
			if (typeof attribute !== "string" || attribute.length > TEXT_CAP) return undefined;
			ops.push({ kind, source, name, value: attribute });
			continue;
		}
		return undefined;
	}
	return ops;
}

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
	return { start, end: after.length - tail, text: before.slice(start, before.length - tail) };
}

/**
 * The ops against one file's text, all of them or none.
 *
 * Every stamp is resolved against the text as the canvas read it and the
 * splices are applied from the back, so an op never lands on offsets an
 * earlier op moved. Class edits on one element fold together into a single
 * write of that literal, which is how a corner drag writes width and height
 * as one patch.
 */
export function planOps(source: string, ops: readonly HandOp[], theme?: ClassTheme): Planned {
	let program: Node;
	try {
		program = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as Node;
	} catch {
		return { ok: false, refusal: { code: "unparsable", says: "the file does not parse" } };
	}

	const patches: SpanPatch[] = [];
	let mapped = false;
	const classEdits = new Map<Node, { element: Element; edits: ClassEdit[] }>();

	for (const op of ops) {
		const stamp = stampOf(op.source);
		const element = stamp === undefined ? undefined : elementAt(program, stamp.line, stamp.column);
		if (element === undefined) return { ok: false, refusal: STALE_STAMP };
		if (element.mapped) mapped = true;
		if (op.kind === "set-class") {
			const held = classEdits.get(element.node);
			if (held !== undefined) {
				held.edits.push(op);
				continue;
			}
			classEdits.set(element.node, { element, edits: [op] });
			continue;
		}
		const planned = planOne(source, element, op);
		if ("refusal" in planned) return { ok: false, refusal: planned.refusal };
		patches.push(planned.patch);
	}

	for (const { element, edits } of classEdits.values()) {
		const planned = planClass(source, element, edits, theme);
		if ("refusal" in planned) return { ok: false, refusal: planned.refusal };
		patches.push(planned.patch);
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
	return { ok: true, text, mapped };
}

/** The stamp names a position the file no longer has anything at. */
export const STALE_STAMP: PatchRefusal = { code: "stale-stamp", says: "the stamp hits nothing" };

/**
 * What the file says about one element, for a surface that has to draw it
 * before anybody touches it (#256).
 *
 * The properties rail reads rather than writes: the crumbs want the name the
 * author wrote, the scope bar wants the variant chains the literal carries,
 * and the source line wants the literal itself. All three are facts about the
 * file, so they are parsed out of it the same way an op is — fresh, never from
 * a mirror — and a literal no hand may write comes back as the refusal a write
 * would have given rather than as an absence.
 */
export interface ElementRead {
	/** what the source calls it: `CartRow` for a component, `li` for a tag */
	name: string;
	/** the literal className, empty when the element carries none */
	className: string;
	/** why no hand may write that literal, when none may */
	refusal?: PatchRefusal;
	/** the element sits inside a `map`: one literal, every rendered row */
	mapped: boolean;
}

/** One read per position asked about, in order; nothing where the stamp hits nothing. */
export function readElements(
	source: string,
	at: readonly { line: number; column: number }[],
): (ElementRead | undefined)[] {
	let program: Node;
	try {
		program = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as Node;
	} catch {
		return at.map(() => undefined);
	}
	return at.map(({ line, column }) => {
		const element = elementAt(program, line, column);
		if (element === undefined) return undefined;
		const name = rawOf(source, element.node.openingElement.name);
		const literal = literalOf(source, element);
		if ("refusal" in literal) {
			return { name, className: "", refusal: literal.refusal, mapped: element.mapped };
		}
		return { name, className: literal.className, mapped: element.mapped };
	});
}

type OnePlan = { patch: SpanPatch } | { refusal: PatchRefusal };

function planOne(source: string, element: Element, op: HandOp): OnePlan {
	switch (op.kind) {
		case "set-text":
			return planText(source, element, op.text);
		case "delete":
			return planDelete(source, element);
		case "set-attribute":
			return planAttribute(source, element, op.name, op.value);
		case "set-class":
			return planClass(source, element, [op]);
	}
}

/* ---------- the ops ---------- */

/**
 * The className the file holds for this element, or the reason it holds none
 * that a hand may touch.
 *
 * Both the write and the rail's read come through here, which is what keeps
 * them from drifting: the rail greys a row for exactly the reason the write
 * would have refused, and the literal it prints on the source line is the one
 * a splice would land in.
 */
function literalOf(
	source: string,
	element: Element,
): { slot: Slot | undefined; className: string } | { refusal: PatchRefusal } {
	if (attributeNamed(element, "style") !== undefined) {
		return { refusal: { code: "inline-style", says: "inline style pins it" } };
	}
	const held = attributeNamed(element, "className");
	const slot = held === undefined ? undefined : slotOf(source, held);
	if (held !== undefined && slot === undefined) {
		const value = held.value == null ? "" : source.slice(nodeStart(held.value), nodeEnd(held.value));
		return { refusal: { code: "computed-class", says: "className is an expression", expression: value } };
	}
	if (held === undefined && element.spread) {
		return { refusal: { code: "spread-props", says: "spread props with no literal" } };
	}
	return { slot, className: slot?.kind === "literal" ? slot.value : "" };
}

function planClass(source: string, element: Element, edits: readonly ClassEdit[], theme?: ClassTheme): OnePlan {
	const literal = literalOf(source, element);
	if ("refusal" in literal) return literal;
	const { slot } = literal;
	let className = literal.className;
	for (const edit of edits) {
		const conflict = screenConflict(className === "" ? null : className, edit, theme);
		if (conflict !== undefined) {
			return { refusal: { code: "variant-conflict", says: "variant-prefixed conflict", expression: conflict } };
		}
		className = writeClass(className === "" ? null : className, edit, theme);
	}
	return { patch: fill(element, "className", className, slot) };
}

function planText(source: string, element: Element, text: string): OnePlan {
	if (element.mapped) return { refusal: { code: "mapped-text", says: "the words are data, not design" } };
	// layout whitespace and a JSX comment are both things the frame does not
	// show, so neither one is any part of the element's words
	const children = element.children.filter((child) =>
		child.type === "JSXText"
			? !isLayoutOnly(rawOf(source, child))
			: !(child.type === "JSXExpressionContainer" && child.expression.type === "JSXEmptyExpression"),
	);
	const spoken = children.find((child) => child.type !== "JSXText");
	if (spoken !== undefined) {
		const says = source.slice(nodeStart(spoken), nodeEnd(spoken));
		if (spoken.type === "JSXExpressionContainer") {
			return { refusal: { code: "expression-text", says: "the text is an expression", expression: says } };
		}
		return { refusal: { code: "no-text", says: "no text of its own", expression: says } };
	}
	const own = children[0];
	if (own !== undefined) return { patch: coreOf(source, own, text) };
	// nothing but layout between the tags: the words go where they would have
	// been written, inside whatever indentation is already there
	const layout = element.children.find((child) => child.type === "JSXText");
	if (layout !== undefined) return { patch: coreOf(source, layout, text) };
	// a self-closing element has no inside to write into, and giving it one
	// would be authoring rather than adjusting
	if (element.selfClosing) return { refusal: { code: "no-text", says: "no text of its own" } };
	return { patch: { start: element.openEnd, end: element.openEnd, text: writeJsxText(text) } };
}

function coreOf(source: string, child: Node, text: string): SpanPatch {
	const raw = rawOf(source, child);
	const core = textCore(raw);
	return { start: nodeStart(child) + core.start, end: nodeStart(child) + core.end, text: writeJsxText(text) };
}

function planDelete(source: string, element: Element): OnePlan {
	if (element.parent?.type !== "JSXElement" && element.parent?.type !== "JSXFragment") {
		return { refusal: { code: "not-a-child", says: "not a whole child of its parent" } };
	}
	let start = nodeStart(element.node);
	let end = nodeEnd(element.node);
	// the element's own lines go with it: the indentation in front of it, and
	// the line break behind it, so no blank line is left where it stood
	while (start > 0 && (source[start - 1] === " " || source[start - 1] === "\t")) start -= 1;
	if (start > 0 && source[start - 1] === "\n") {
		while (end < source.length && (source[end] === " " || source[end] === "\t")) end += 1;
		if (source[end] === "\n") {
			start -= 1;
		} else {
			end = nodeEnd(element.node);
		}
	}
	return { patch: { start, end, text: "" } };
}

function planAttribute(source: string, element: Element, name: string, value: string): OnePlan {
	if (name === "style") return { refusal: { code: "inline-style", says: "inline style pins it" } };
	// className is a list of tokens with a fold behind it, never one string to
	// overwrite: `set-class` is the op that writes it, one token at a time
	if (name === "className") {
		return { refusal: { code: "class-attribute", says: "className is written one token at a time" } };
	}
	const held = attributeNamed(element, name);
	const slot = held === undefined ? undefined : slotOf(source, held);
	if (held !== undefined && slot === undefined) {
		const says = held.value == null ? "" : source.slice(nodeStart(held.value), nodeEnd(held.value));
		return { refusal: { code: "expression-attribute", says: `${name} is an expression`, expression: says } };
	}
	if (held === undefined && element.spread) {
		return { refusal: { code: "spread-props", says: "spread props with no literal" } };
	}
	return { patch: fill(element, name, value, slot) };
}

/**
 * Where the value goes: inside the quotes it already has, after the bare name
 * that has none, or in a whole new attribute straight after the tag name,
 * which is where a hand would have written it.
 */
function fill(element: Element, name: string, value: string, slot: Slot | undefined): SpanPatch {
	if (slot?.kind === "literal") return narrowed(slot.start, slot.raw, escapeAttribute(value));
	if (slot?.kind === "bare") return { start: slot.at, end: slot.at, text: `="${escapeAttribute(value)}"` };
	return { start: element.nameEnd, end: element.nameEnd, text: ` ${name}="${escapeAttribute(value)}"` };
}

/**
 * The same replacement, trimmed to the characters that differ.
 *
 * A class write rewrites a whole literal, and most of what it writes is what
 * was already there. Narrowing to the run between the common ends keeps the
 * promise the lane is built on: the file comes back byte-identical outside the
 * characters the edit touched, so a literal an author spread over three lines
 * keeps its shape when one token in it changes.
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
	attributes: readonly (JSXAttribute | JSXSpreadAttribute)[];
	children: readonly JSXElement["children"][number][];
	parent: Node | undefined;
	/** an ancestor is a `map` call: one literal here, every rendered row moved */
	mapped: boolean;
	/** the element takes props it cannot see, so an absent attribute may exist */
	spread: boolean;
	selfClosing: boolean;
	/** just past the opening tag's name, where a new attribute goes */
	nameEnd: number;
	/** just past the opening tag's `>`, where an element's own words begin */
	openEnd: number;
}

/** "frames/cart/frame.tsx:14:3" as the position it names. */
function stampOf(source: string): { line: number; column: number } | undefined {
	const match = /:(\d+):(\d+)$/.exec(source);
	if (match?.[1] === undefined || match[2] === undefined) return undefined;
	return { line: Number(match[1]), column: Number(match[2]) };
}

/**
 * The element whose opening tag starts exactly where the stamp points.
 *
 * The stamp convention is the compiler's: 1-based line, 1-based column, minted
 * at serve time by the same triple esbuild hands `jsxDEV`. Anything else is a
 * stamp the file has moved on from.
 */
function elementAt(program: Node, line: number, column: number): Element | undefined {
	let found: Element | undefined;
	walkNodes(program, [], (node, ancestors) => {
		if (node.type !== "JSXElement") return;
		if (node.loc?.start.line !== line || node.loc.start.column + 1 !== column) return;
		const opening = node.openingElement;
		found = {
			node,
			attributes: opening.attributes,
			children: node.children,
			parent: ancestors[ancestors.length - 1],
			mapped: ancestors.some(isMapCall),
			spread: opening.attributes.some((attribute) => attribute.type === "JSXSpreadAttribute"),
			selfClosing: opening.selfClosing,
			nameEnd: nodeEnd(opening.name),
			openEnd: nodeEnd(opening),
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

function attributeNamed(element: Element, name: string): JSXAttribute | undefined {
	return element.attributes.find(
		(attribute): attribute is JSXAttribute => attribute.type === "JSXAttribute" && attribute.name.name === name,
	);
}

/** Where an attribute's value is written, when it is written literally at all. */
type Slot =
	/** the characters between the quotes, as the file spells them */
	{ kind: "literal"; value: string; raw: string; start: number; end: number } | { kind: "bare"; at: number };

/**
 * The string a literal attribute holds, and where its characters sit. A
 * literal in braces counts: `className={"a b"}` is still typed in the file,
 * and the splice lands inside the quotes either way. A bare attribute has no
 * value yet and so has a place for one rather than a span.
 */
function slotOf(source: string, attribute: JSXAttribute): Slot | undefined {
	const value = attribute.value;
	if (value == null) return { kind: "bare", at: nodeEnd(attribute) };
	const held = value.type === "JSXExpressionContainer" ? value.expression : value;
	if (held.type !== "StringLiteral") return undefined;
	const start = nodeStart(held) + 1;
	const end = nodeEnd(held) - 1;
	return { kind: "literal", value: held.value, raw: source.slice(start, end), start, end };
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
