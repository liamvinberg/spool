import { parse } from "@babel/parser";
import type { CallExpression, Node } from "@babel/types";
import { NOTES_FILE } from "../../deck/notes";
import { walkNodes } from "../jsx-walk";
import { unwrapped } from "../knob-literals";

/**
 * What a slide's source says of it as a slide (spool#265), read without running it, as walks and knobs are read: the
 * beats its `ui.beats` call names, whether it calls `ui.live()`, and whether it imports its own notes. The rail, the
 * presenter view and `spool check` all need a slide's beats before it has ever mounted, which is why the list must be
 * written out as a literal.
 */

/** A place in the source, 1-based as an editor counts. */
export interface SourceAt {
	readonly line: number;
	readonly column: number;
}

export interface SlideSource {
	/** The beats the slide names, in order; none when it names none, which plays as one beat. */
	readonly beats: readonly string[];
	readonly live: boolean;
	/** Why its beats cannot be read from the source, and where: the slide then reads here as one beat. */
	readonly unread?: SourceAt & { readonly message: string };
	/** Each import of a `notes.md`, by its specifier: a frame never imports its notes. */
	readonly notesImports: readonly (SourceAt & { readonly specifier: string })[];
}

const NONE: SlideSource = { beats: [], live: false, notesImports: [] };

/** A slide's source read. A source that does not parse names nothing here: the typecheck says why. */
export function readSlideSource(text: string): SlideSource {
	if (!text.includes("beats") && !text.includes("live") && !text.includes(NOTES_FILE)) return NONE;
	let program: Node;
	try {
		program = parse(text, { sourceType: "module", plugins: ["jsx", "typescript"], errorRecovery: false }).program;
	} catch {
		return NONE;
	}
	const uiNames = spoolUiNames(program);
	const beatCalls: CallExpression[] = [];
	let live = false;
	const notesImports: (SourceAt & { specifier: string })[] = [];
	walkNodes(program, [], (node) => {
		const specifier = importedSpecifier(node);
		if (specifier !== undefined && isNotesSpecifier(specifier.value))
			notesImports.push({ ...at(specifier.node), specifier: specifier.value });
		if (node.type !== "CallExpression") return;
		const method = uiMethod(node, uiNames);
		if (method === "beats") beatCalls.push(node);
		else if (method === "live") live = true;
	});
	const read = beatsOf(beatCalls);
	return { ...read, live, notesImports };
}

/** The beats of every `ui.beats` call: one list, written out, the same in each. */
function beatsOf(calls: readonly CallExpression[]): Pick<SlideSource, "beats" | "unread"> {
	let beats: string[] | undefined;
	for (const call of calls) {
		const read = literalBeats(call);
		if ("message" in read) return { beats: [], unread: { ...at(call), message: read.message } };
		if (beats !== undefined && beats.join("\n") !== read.beats.join("\n"))
			return {
				beats: [],
				unread: {
					...at(call),
					message: "ui.beats is called with two different lists: a slide names its beats once",
				},
			};
		beats = read.beats;
	}
	return { beats: beats ?? [] };
}

function literalBeats(call: CallExpression): { beats: string[] } | { message: string } {
	const [list, ...rest] = call.arguments;
	const literal = 'ui.beats takes one list of beat names written out in the call, as ui.beats(["title", "price"])';
	if (list === undefined || rest.length > 0) return { message: literal };
	const held = unwrapped(list);
	if (held.type !== "ArrayExpression") return { message: literal };
	const beats: string[] = [];
	for (const element of held.elements) {
		const name = element === null ? undefined : stringOf(unwrapped(element));
		if (name === undefined) return { message: literal };
		if (beats.includes(name)) return { message: `ui.beats names the beat "${name}" twice: each name is one beat` };
		beats.push(name);
	}
	if (beats.length === 0) return { message: "ui.beats names no beat: a slide that has one beat needs no call" };
	return { beats };
}

function stringOf(node: Node): string | undefined {
	if (node.type === "StringLiteral") return node.value;
	if (node.type === "TemplateLiteral" && node.expressions.length === 0)
		return node.quasis[0]?.value.cooked ?? undefined;
	return undefined;
}

/** The names `ui` from "spool" goes by in a module. */
function spoolUiNames(program: Node): Set<string> {
	const names = new Set<string>();
	if (program.type !== "Program") return names;
	for (const statement of program.body) {
		if (statement.type !== "ImportDeclaration" || statement.source.value !== "spool") continue;
		for (const held of statement.specifiers) {
			if (held.type !== "ImportSpecifier") continue;
			const imported = held.imported.type === "Identifier" ? held.imported.name : held.imported.value;
			if (imported === "ui") names.add(held.local.name);
		}
	}
	return names;
}

function uiMethod(call: CallExpression, uiNames: ReadonlySet<string>): string | undefined {
	const callee = call.callee;
	if (callee.type !== "MemberExpression" || callee.computed || callee.object.type !== "Identifier") return undefined;
	if (!uiNames.has(callee.object.name) || callee.property.type !== "Identifier") return undefined;
	return callee.property.name;
}

/** The module a node imports, by its written specifier: `import`, `export … from`, `import()` and `require()`. */
function importedSpecifier(node: Node): { value: string; node: Node } | undefined {
	if (
		(node.type === "ImportDeclaration" ||
			node.type === "ExportNamedDeclaration" ||
			node.type === "ExportAllDeclaration") &&
		node.source?.type === "StringLiteral"
	)
		return { value: node.source.value, node: node.source };
	if (node.type !== "CallExpression") return undefined;
	const dynamic =
		node.callee.type === "Import" || (node.callee.type === "Identifier" && node.callee.name === "require");
	const [first] = node.arguments;
	if (!dynamic || first === undefined) return undefined;
	const name = stringOf(first);
	return name === undefined ? undefined : { value: name, node: first };
}

/** A relative specifier naming a `notes.md`, with or without a query such as `?raw`. */
function isNotesSpecifier(specifier: string): boolean {
	const path = specifier.split(/[?#]/)[0] ?? "";
	return (
		(path.startsWith("./") || path.startsWith("../")) &&
		(path === `./${NOTES_FILE}` || path.endsWith(`/${NOTES_FILE}`))
	);
}

function at(node: Node): SourceAt {
	return { line: node.loc?.start.line ?? 1, column: (node.loc?.start.column ?? 0) + 1 };
}

/**
 * The beat `spool shot --beat` asks a slide for, by its name or its number from 1, as an index from 0; or why the slide
 * has no such beat. A slide that names no beats has one, its whole self.
 */
export function beatAsked(frame: string, source: SlideSource, asked: string): number | { readonly message: string } {
	if (source.unread !== undefined) {
		return { message: `${frame}'s beats cannot be read from its source: ${source.unread.message}` };
	}
	const { beats } = source;
	const named = beats.indexOf(asked);
	if (named >= 0) return named;
	const number = /^\d+$/.test(asked) ? Number(asked) : Number.NaN;
	if (number >= 1 && number <= Math.max(1, beats.length)) return number - 1;
	if (beats.length === 0) return { message: `${frame} names no beats with ui.beats: it has one beat, its last` };
	const list = beats.map((beat) => `"${beat}"`).join(", ");
	// a number is a person's count, from 1, never beat.index, which counts from 0
	const counted = Number.isNaN(number) ? "" : " counted from 1 (beat.index counts from 0)";
	return { message: `${frame} has no beat "${asked}": its beats are ${list}, or 1 to ${beats.length}${counted}` };
}

/** A beat a shot asks a slide for: its index from 0, and what its files are named after (`beatLabel`). */
export interface ShotBeat {
	readonly index: number;
	readonly label: string;
}

/**
 * What a shot of a slide at one of its beats is named after: the beat's own name, where a file name can carry it and
 * it starts with a letter, else its number from 1. A name never reads as a number, so no two beats share a file.
 */
export function beatLabel(source: SlideSource, index: number): string {
	const name = source.beats[index];
	return name !== undefined && /^[A-Za-z][\w-]*$/.test(name) ? name : String(index + 1);
}
