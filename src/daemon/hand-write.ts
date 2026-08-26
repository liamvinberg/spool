import { createHash } from "node:crypto";
import { parse } from "@babel/parser";
import type { ImportDeclaration, JSXAttribute, JSXElement, JSXSpreadAttribute, Node } from "@babel/types";
import { ASSET_FILTER } from "./assets";
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
	| { kind: "set-attribute"; source: string; name: string; value: string }
	| { kind: "set-asset"; source: string; specifier: string; hint: string };

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
	| "walk-target"
	| "not-an-image"
	| "image-budget"
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

/** The one attribute this lane never writes: its value is a walk target (#260). */
export const WALK_TARGET = "data-go";

/** A token is one word; a scope is a chain of variant prefixes or nothing. */
const TOKEN = /^-?[A-Za-z0-9][^\s]*$/;
const SCOPE = /^([a-z0-9][a-z0-9-]*:)*$/;
const ATTRIBUTE = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const STAMP = /^[^\s:]+:\d+:\d+$/;
const TEXT_CAP = 4096;
/**
 * A relative import of a project asset, which is the only thing a `src` may be
 * pointed at. Composed from the one asset list rather than spelled again: a
 * kind added there and not here is a picture the swap would refuse to write.
 */
const SPECIFIER = new RegExp(`^\\.{1,2}/[^"'\\\\\\s]*${ASSET_FILTER.source}`, "i");
/** The stem a fresh import's identifier is minted from. */
const HINT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

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
	// `set-asset` is deliberately not among them: it is formed by the lane's own
	// asset door, which is the only place that knows where the picture is, what
	// it weighs and whether the document can carry it (#260)
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

/**
 * The one op no client may send: the asset swap, formed by the lane itself.
 *
 * It carries a path rather than a value, and the answers a path needs — where
 * the picture is, what it weighs, whether one document can carry it — are the
 * asset door's. So the door mints it and this is where its shape is checked,
 * which keeps the check in the same file as the splice that trusts it.
 */
export function assetOp(source: string, specifier: string, hint: string): HandOp | undefined {
	if (specifier.length > 512 || !SPECIFIER.test(specifier)) return undefined;
	if (hint.length > 64 || !HINT.test(hint)) return undefined;
	return { kind: "set-asset", source, specifier, hint };
}

/** The image files this source imports, as the specifiers it spells them with. */
export function imageImports(source: string): string[] {
	let program: Node;
	try {
		program = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as Node;
	} catch {
		return [];
	}
	return importsIn(program)
		.map((held) => held.specifier)
		.filter((specifier) => ASSET_FILTER.test(specifier));
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
		const planned = planOne(source, program, element, op);
		if ("refusal" in planned) return { ok: false, refusal: planned.refusal };
		patches.push(...planned.patches);
	}

	for (const { element, edits } of classEdits.values()) {
		const planned = planClass(source, element, edits, theme);
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
	/** every other attribute the tag carries, as the file writes it (#260) */
	attributes: AttributeRead[];
}

/**
 * One attribute as the file has it (#260).
 *
 * The rail's source section turns string attributes into fields, so it needs
 * the same answer the write lane would give: the characters between the quotes
 * where they are typed literally, and what the file says instead where they
 * are not. A name with neither is a bare attribute — `<input disabled />` —
 * which has a place for a value rather than a value.
 */
export interface AttributeRead {
	name: string;
	/** the string it holds, when it holds one literally */
	value?: string;
	/** what the file says instead, when the value is no literal a hand may write */
	expression?: string;
	/**
	 * The image this attribute imports, when it is one.
	 *
	 * `src={hero}` is an expression to every other reader and a picture to
	 * this one: the identifier is bound to an image import in the same file,
	 * which is exactly what a swap writes and exactly what it may replace. The
	 * specifier is what the rail shows, because that is the file the frame
	 * draws.
	 */
	asset?: string;
}

/** The two the rail has surfaces of their own for, so neither is a string field. */
const NOT_A_FIELD: ReadonlySet<string> = new Set(["className", "style"]);
/** How many attributes one element reports, and how much of an expression is named. */
const ATTRIBUTE_CAP = 32;
const EXPRESSION_CAP = 240;

function attributesOf(source: string, element: Element, assets: ReadonlyMap<string, string>): AttributeRead[] {
	const reads: AttributeRead[] = [];
	for (const attribute of element.attributes) {
		if (reads.length >= ATTRIBUTE_CAP) break;
		if (attribute.type !== "JSXAttribute") continue;
		const name = attribute.name.type === "JSXIdentifier" ? attribute.name.name : undefined;
		if (name === undefined || NOT_A_FIELD.has(name)) continue;
		const slot = slotOf(source, attribute);
		if (slot?.kind === "literal") {
			reads.push({ name, value: slot.value });
			continue;
		}
		if (slot?.kind === "bare") {
			reads.push({ name, value: "" });
			continue;
		}
		const held = attribute.value;
		const identifier =
			held?.type === "JSXExpressionContainer" && held.expression.type === "Identifier"
				? assets.get(held.expression.name)
				: undefined;
		if (identifier !== undefined) {
			reads.push({ name, asset: identifier });
			continue;
		}
		const said = held == null ? "" : source.slice(nodeStart(held), nodeEnd(held));
		reads.push({ name, expression: said.slice(0, EXPRESSION_CAP) });
	}
	return reads;
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
	// the file's own image imports, so a `src={hero}` reads as the picture it is
	// rather than as an expression nobody may touch
	const assets = new Map(
		importsIn(program)
			.filter((held) => held.local !== undefined && ASSET_FILTER.test(held.specifier))
			.map((held) => [held.local ?? "", held.specifier]),
	);
	return at.map(({ line, column }) => {
		const element = elementAt(program, line, column);
		if (element === undefined) return undefined;
		const name = rawOf(source, element.node.openingElement.name);
		const attributes = attributesOf(source, element, assets);
		const literal = literalOf(source, element);
		if ("refusal" in literal) {
			return { name, className: "", refusal: literal.refusal, mapped: element.mapped, attributes };
		}
		return { name, className: literal.className, mapped: element.mapped, attributes };
	});
}

/**
 * One op's characters, or the reason it has none.
 *
 * Several patches rather than one, because an asset swap is three edits that
 * are one act: the import it writes, the `src` it points, and the import the
 * swap orphaned. They still land as one undo step — the stack holds the span
 * between the file before and after, not the ops that made it.
 */
type OnePlan = { patches: SpanPatch[] } | { refusal: PatchRefusal };

function planOne(source: string, program: Node, element: Element, op: HandOp): OnePlan {
	switch (op.kind) {
		case "set-text":
			return planText(source, element, op.text);
		case "delete":
			return planDelete(source, element);
		case "set-attribute":
			return planAttribute(source, element, op.name, op.value);
		case "set-asset":
			return planAsset(source, program, element, op.specifier, op.hint);
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
	return { patches: [fill(element, "className", className, slot)] };
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
	if (own !== undefined) return { patches: [coreOf(source, own, text)] };
	// nothing but layout between the tags: the words go where they would have
	// been written, inside whatever indentation is already there
	const layout = element.children.find((child) => child.type === "JSXText");
	if (layout !== undefined) return { patches: [coreOf(source, layout, text)] };
	// a self-closing element has no inside to write into, and giving it one
	// would be authoring rather than adjusting
	if (element.selfClosing) return { refusal: { code: "no-text", says: "no text of its own" } };
	return { patches: [{ start: element.openEnd, end: element.openEnd, text: writeJsxText(text) }] };
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
	return { patches: [{ start, end, text: "" }] };
}

function planAttribute(source: string, element: Element, name: string, value: string): OnePlan {
	if (name === "style") return { refusal: { code: "inline-style", says: "inline style pins it" } };
	// className is a list of tokens with a fold behind it, never one string to
	// overwrite: `set-class` is the op that writes it, one token at a time
	if (name === "className") {
		return { refusal: { code: "class-attribute", says: "className is written one token at a time" } };
	}
	// a walk target is an arrow on the flows surface rather than a string on an
	// element, so it is read wherever elements are read and written only there
	if (name === WALK_TARGET) {
		return { refusal: { code: "walk-target", says: "walk target, edit in flows" } };
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
	return { patches: [fill(element, name, value, slot)] };
}

/**
 * The asset swap (#260): the one op that writes an import.
 *
 * An image in a frame is an import and never a URL — that is the asset rule,
 * and it is why pointing a `src` somewhere new cannot be a string splice. So
 * the op is three edits that are one act: the import the file did not have,
 * the `src` pointed at its identifier, and the import the swap left with no
 * reader. They fold into one span between the file before and after, so it is
 * still one press of undo.
 *
 * The bytes are the caller's business. This is only the characters.
 */
function planAsset(source: string, program: Node, element: Element, specifier: string, hint: string): OnePlan {
	if (element.tag !== "img") {
		return { refusal: { code: "not-an-image", says: `an import points at an image, and ${element.tag} is not one` } };
	}
	const held = attributeNamed(element, "src");
	const imports = importsIn(program);
	const named = held === undefined ? undefined : boundName(held);
	/*
	 * What the `src` says now, and whether a swap may honestly replace it.
	 *
	 * A string, an absent attribute and an identifier this file imports an
	 * image under are all things a picture can be put in the place of. Any
	 * other identifier is a value from somewhere else — a prop, a piece of
	 * state, a row of data — and pointing it at an import would be rewriting
	 * what the frame is rather than which picture it draws.
	 */
	const was =
		typeof named === "string" && imports.some((one) => one.local === named && ASSET_FILTER.test(one.specifier))
			? named
			: named === null
				? null
				: undefined;
	if (held !== undefined && was === undefined) {
		const says = held.value == null ? "" : source.slice(nodeStart(held.value), nodeEnd(held.value));
		return { refusal: { code: "expression-attribute", says: "src is an expression", expression: says } };
	}
	if (held === undefined && element.spread) {
		return { refusal: { code: "spread-props", says: "spread props with no literal" } };
	}
	const standing = imports.find((one) => one.specifier === specifier);
	const name = standing?.local ?? freeName(program, hint);
	/*
	 * The image the swap replaced, when nothing else in the file reads it.
	 *
	 * Its import is dead weight and dead weight is not free here: the compiler
	 * bakes every image import into the document as base64 and charges it
	 * against the same 512 KB budget, so an unswept one would make the next
	 * swap refuse for a picture nobody can see. Two mentions is what a file
	 * that imports it and draws it once has — the binding, and the `src` this
	 * op is about to point somewhere else.
	 */
	const orphan =
		typeof was !== "string" || was === standing?.local
			? undefined
			: imports.find((one) => one.local === was && reads(program, was) === 2);
	const patches: SpanPatch[] = [point(element, held, name)];
	if (standing !== undefined) {
		if (orphan !== undefined) patches.push(dropLine(source, orphan.start, orphan.end));
	} else if (orphan !== undefined) {
		// the fresh import takes the dead one's place, so the file keeps the
		// shape its author gave it rather than growing a line and losing another
		patches.push({ start: orphan.start, end: importEnd(source, orphan.end), text: importLine(name, specifier) });
	} else {
		patches.push(writeImport(source, imports, name, specifier));
	}
	return { patches };
}

/** The identifier a `src` reads, or nothing when it is not one a swap may replace. */
function boundName(attribute: JSXAttribute): string | null | undefined {
	const value = attribute.value;
	// `<img src />` and `src="/a.png"` both have somewhere for an import to go
	if (value == null || value.type === "StringLiteral") return null;
	if (value.type !== "JSXExpressionContainer") return undefined;
	const held = value.expression;
	if (held.type === "StringLiteral") return null;
	return held.type === "Identifier" ? held.name : undefined;
}

interface ImportRead {
	specifier: string;
	/** the default import's local name, when the declaration has one */
	local: string | undefined;
	start: number;
	end: number;
}

function importsIn(program: Node): ImportRead[] {
	const body = program.type === "Program" ? program.body : [];
	return body
		.filter((node): node is ImportDeclaration => node.type === "ImportDeclaration")
		.map((node) => ({
			specifier: node.source.value,
			local: node.specifiers.find((one) => one.type === "ImportDefaultSpecifier")?.local.name,
			start: nodeStart(node),
			end: nodeEnd(node),
		}));
}

/** Every mention of a name in the file, the import's own binding included. */
function reads(program: Node, name: string): number {
	let seen = 0;
	walkNodes(program, [], (node) => {
		if (node.type === "Identifier" && node.name === name) seen += 1;
	});
	return seen;
}

/** What an import cannot be called, however the file it came from is spelled. */
const RESERVED: ReadonlySet<string> = new Set([
	"await",
	"break",
	"case",
	"catch",
	"class",
	"const",
	"continue",
	"debugger",
	"default",
	"delete",
	"do",
	"else",
	"enum",
	"export",
	"extends",
	"false",
	"finally",
	"for",
	"function",
	"if",
	"import",
	"in",
	"instanceof",
	"new",
	"null",
	"return",
	"super",
	"switch",
	"this",
	"throw",
	"true",
	"try",
	"typeof",
	"var",
	"void",
	"while",
	"with",
	"yield",
]);

/**
 * A name nothing in the file already says, and nothing the language has taken.
 *
 * Every mention counts, not only the bindings: a swap that shadowed a local
 * would compile and draw the wrong picture, and one that reads oddly is a
 * smaller cost than one that is wrong. A file called `default.png` is the
 * other half of it — `import default from` does not parse at all.
 */
function freeName(program: Node, hint: string): string {
	if (!RESERVED.has(hint) && reads(program, hint) === 0) return hint;
	for (let at = 2; at < 1000; at += 1) {
		const tried = `${hint}${at}`;
		if (reads(program, tried) === 0) return tried;
	}
	return `${hint}${Date.now()}`;
}

const importLine = (name: string, specifier: string): string => `import ${name} from ${JSON.stringify(specifier)};`;

/** Past the semicolon, which babel may or may not have taken with the declaration. */
function importEnd(source: string, end: number): number {
	return source[end] === ";" ? end + 1 : end;
}

/** The import goes under the ones already there, or at the top of a file with none. */
function writeImport(source: string, imports: readonly ImportRead[], name: string, specifier: string): SpanPatch {
	const line = importLine(name, specifier);
	const last = imports.at(-1);
	if (last === undefined) return { start: 0, end: 0, text: `${line}\n` };
	const at = importEnd(source, last.end);
	return { start: at, end: at, text: `\n${line}` };
}

/** The `src`, pointed at the identifier — in braces, because an import is a value. */
function point(element: Element, held: JSXAttribute | undefined, name: string): SpanPatch {
	if (held === undefined) return { start: element.nameEnd, end: element.nameEnd, text: ` src={${name}}` };
	if (held.value == null) return { start: nodeEnd(held), end: nodeEnd(held), text: `={${name}}` };
	return { start: nodeStart(held.value), end: nodeEnd(held.value), text: `{${name}}` };
}

/** A whole line taken out, indentation and line break included. */
function dropLine(source: string, from: number, to: number): SpanPatch {
	let start = from;
	let end = importEnd(source, to);
	while (start > 0 && (source[start - 1] === " " || source[start - 1] === "\t")) start -= 1;
	while (end < source.length && (source[end] === " " || source[end] === "\t")) end += 1;
	if (source[end] === "\n") end += 1;
	else if (start > 0 && source[start - 1] === "\n") start -= 1;
	return { start, end, text: "" };
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
	/** the opening tag as the file spells it: `img`, `CartRow` */
	tag: string;
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
			tag: nameOf(opening.name),
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
