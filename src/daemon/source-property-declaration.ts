import type { MatchedRuleChain } from "../source-edit";
import type { SourcePropertyEffect, SourcePropertyEnvironment, SourcePropertyValue } from "../source-property";
import type { SpanPatch } from "./hand-write";
import { propertyKeys } from "./source-property-effects";

/*
 * The authored CSS declaration as a source role.
 *
 * A project stylesheet reaches the frame through the same compiler the classes
 * do, and its declarations arrive in the certificate with their own selector and
 * condition chain. That chain is the whole identity: it is what the browser
 * matches the element against, and it is what finds the declaration again in the
 * file it was written in.
 *
 * Support is bounded by what that chain can prove. A cascade layer, a container
 * query or a scope carries an order this reader cannot establish, so those
 * declarations stay readable and refuse to be written.
 */

/** The at-rules a declaration's own condition may be spelled with. */
const CONDITIONS = ["@media ", "@supports "];

function conditional(part: string): boolean {
	return CONDITIONS.some((name) => part.startsWith(name));
}

/**
 * The selector chain a declaration was written with.
 *
 * The compiler names a rule after the class it selects when the element wears
 * that class, and writes the class back as `$`. That subject is the selector
 * the stylesheet actually spells, so it goes back in before anything looks for
 * the rule in a file or asks the document whether it matched.
 */
export function declarationPath(effect: SourcePropertyEffect): readonly string[] {
	if (effect.owner === null) return effect.path;
	if (!/^[a-zA-Z_][\w-]*$/.test(effect.owner))
		throw new Error("this declaration's own subject has no plain authored spelling");
	return effect.path.map((part) => (part.startsWith("@") ? part : part.replaceAll("$", `.${effect.owner}`)));
}

/** One authored, unlayered declaration whose condition chain this reader can establish. */
export function admissible(effect: SourcePropertyEffect): boolean {
	// Everything the compiler generates for itself sits in a layer. A rule with
	// no layer is the project's own, whether or not a class names it.
	if (effect.path.some((part) => part.startsWith("@layer "))) return false;
	if (effect.owner !== null && !/^[a-zA-Z_][\w-]*$/.test(effect.owner)) return false;
	const selectors = effect.path.filter((part) => !part.startsWith("@"));
	return selectors.length === 1 && effect.path.every((part) => !part.startsWith("@") || conditional(part));
}

function collapse(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

/**
 * True where this element's own document reports the rule as one of its own.
 *
 * A stylesheet declares things about every subject in the project. Only the
 * chains the element actually matched are evidence about this element, and the
 * client cannot name a chain the document did not report.
 */
export function applies(
	effect: SourcePropertyEffect,
	matched: readonly MatchedRuleChain[],
): MatchedRuleChain | undefined {
	const path = declarationPath(effect).map(collapse);
	return matched.find(
		(chain) => chain.path.length === path.length && chain.path.every((part, index) => collapse(part) === path[index]),
	);
}

/** The state pseudo-classes a rule may name and an element may not be in right now. */
const DYNAMIC =
	/:(?:hover|focus|focus-visible|focus-within|active|disabled|enabled|checked|indeterminate|valid|invalid|required|optional|read-only|read-write|placeholder-shown|target|visited|link|any-link)\b/;

/**
 * The condition a declaration is written under, in the order it was written.
 *
 * A media or supports group is one; so is a state the selector names. A row at
 * the base scope is about what applies unconditionally, so a declaration with a
 * condition of its own belongs to that condition's scope and not to this row.
 */
export function declarationScope(effect: SourcePropertyEffect): readonly string[] {
	const path = declarationPath(effect);
	const selector = path.find((part) => !part.startsWith("@")) ?? "";
	return [...path.filter((part) => part.startsWith("@")), ...(DYNAMIC.test(selector) ? [selector] : [])];
}

interface Declaration {
	path: readonly string[];
	property: string;
	value: string;
	important: boolean;
	start: number;
	end: number;
}

/**
 * Every declaration in an authored stylesheet, with the block chain it sits in.
 *
 * This is a reader, not a parser: it walks braces and takes each block's own
 * prelude as written. A file it cannot walk cleanly finds nothing, which is a
 * refusal rather than a guess.
 */
function declarations(text: string): Declaration[] {
	// Comments become spaces so every offset still names the same byte while no
	// block prelude or value can pick one up.
	const source = text.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
	const found: Declaration[] = [];
	const stack: string[] = [];
	let at = 0;
	let start = 0;
	const flush = (end: number) => {
		const text = source.slice(start, end);
		const colon = text.indexOf(":");
		if (colon > 0 && !text.trimStart().startsWith("@")) {
			const property = collapse(text.slice(0, colon));
			const raw = text.slice(colon + 1);
			const marker = /!\s*important\s*$/i.exec(raw);
			const body = (marker ? raw.slice(0, marker.index) : raw).replace(/\s+$/, "");
			const lead = body.length - body.trimStart().length;
			if (/^[-\w]+$/.test(property) && body.trim())
				found.push({
					path: [...stack],
					property,
					value: collapse(body),
					important: marker !== null,
					start: start + colon + 1 + lead,
					end: start + colon + 1 + body.length,
				});
		}
		start = end + 1;
	};
	while (at < source.length) {
		const character = source[at]!;
		if (character === '"' || character === "'") {
			at++;
			while (at < source.length && source[at] !== character) at += source[at] === "\\" ? 2 : 1;
			at++;
			continue;
		}
		if (character === "{") {
			stack.push(collapse(source.slice(start, at)));
			start = at + 1;
		} else if (character === "}") {
			flush(at);
			stack.pop();
			start = at + 1;
		} else if (character === ";") flush(at);
		at++;
	}
	return found;
}

/** The exact value span an authored declaration owns, or a refusal naming why not. */
export function locateDeclaration(
	source: string,
	effect: SourcePropertyEffect,
): { start: number; end: number; important: boolean } {
	if (!admissible(effect)) throw new Error("this declaration's cascade order is not established in its own file");
	const path = declarationPath(effect).map(collapse);
	const wanted = collapse(effect.value);
	const found = declarations(source).filter(
		(declaration) =>
			declaration.property === effect.property &&
			declaration.important === effect.important &&
			declaration.value === wanted &&
			declaration.path.length === path.length &&
			declaration.path.every((part, index) => part === path[index]),
	);
	if (found.length !== 1)
		throw new Error(
			found.length === 0
				? "this declaration is not the one its own stylesheet carries"
				: "this stylesheet spells this declaration more than once, so it has no single source range",
		);
	return { start: found[0]!.start, end: found[0]!.end, important: found[0]!.important };
}

/** Only the value changes: the selector, the condition, the priority and the order stay. */
export function planDeclarationLiteral(source: string, effect: SourcePropertyEffect, value: string): SpanPatch[] {
	const held = locateDeclaration(source, effect);
	const text = value.trim();
	if (!text || /[;{}]/.test(text) || /!\s*important/i.test(text))
		throw new Error("this value is not one authored declaration value");
	return [{ start: held.start, end: held.end, text }];
}

/** The layers the compiler declares for itself; a project's own layer is not one of them. */
const COMPILER_LAYERS = ["theme", "base", "components", "utilities", "properties"];

export type PropertySource =
	| { kind: "class" }
	| { kind: "style"; members: readonly string[] }
	| { kind: "declaration"; effects: readonly SourcePropertyEffect[] };

/**
 * The declaration a request spells, for a source that holds CSS and not classes.
 *
 * A binding names utilities, and neither a member nor an authored declaration
 * can hold one. What they can hold is the declaration that binding compiles to,
 * which is where its theme reference lives. `null` is a removal.
 */
export async function requestedDeclaration(
	property: string,
	value: SourcePropertyValue,
	compile: (tokens: readonly string[]) => Promise<{ effects: readonly SourcePropertyEffect[] }>,
): Promise<string | null> {
	if (value.kind === "remove") return null;
	if (value.kind === "custom") return value.value;
	const spelled = await compile(value.tokens);
	const values = [
		...new Set(
			spelled.effects.filter((effect) => effect.owner !== null && effect.property === property).map((e) => e.value),
		),
	];
	if (values.length !== 1) throw new Error("this binding does not spell one declaration for this property");
	return values[0]!;
}

/**
 * A grouped change writes classes, so every selection in it must be the class's.
 *
 * Where a member or a project rule wins one of them, the class it wrote would
 * never apply, so the whole change refuses here rather than saving a declaration
 * nothing uses.
 */
export function guardGroupedSources(
	selections: readonly { roots: Iterable<string> }[],
	certificate: { effects: readonly SourcePropertyEffect[] },
	inline: readonly SourcePropertyEffect[],
	environment: SourcePropertyEnvironment,
	matched: readonly MatchedRuleChain[] = [],
): void {
	for (const selection of selections) {
		const roots = new Set(selection.roots);
		const owner = propertySourceOwner(
			roots,
			certificate.effects.filter(
				(effect) =>
					effect.owner !== null && propertyKeys(effect.property, environment).some((key) => roots.has(key)),
			),
			inline,
			certificate,
			environment,
			matched,
		);
		if (owner.kind !== "class") throw new Error("this grouped change includes a property another source owns");
	}
}

/** The one stylesheet that carries this declaration, or a refusal naming why not. */
export function declarationFile(effect: SourcePropertyEffect, inputs: Iterable<[string, { bytes: Buffer }]>): string {
	const files = [...inputs].filter(([file, input]) => {
		if (!file.endsWith(".css")) return false;
		try {
			locateDeclaration(input.bytes.toString("utf8"), effect);
			return true;
		} catch {
			return false;
		}
	});
	if (files.length !== 1) throw new Error("this declaration has no single authored stylesheet range");
	return files[0]![0];
}

/**
 * Which authored source declares the winning effect for every selected root.
 *
 * The order is the cascade this element actually runs under: an important
 * utility, then an important project declaration, then the element's own
 * member, then a project declaration, then an ordinary utility. Within one tier
 * the compiler's own order decides, which is the order the effects arrive in.
 *
 * A competitor whose order this reader cannot establish refuses rather than
 * being stepped over: a project cascade layer, a container query, a scope.
 */
export function propertySourceOwner(
	roots: ReadonlySet<string>,
	classEffects: readonly SourcePropertyEffect[],
	styleEffects: readonly SourcePropertyEffect[],
	certificate: { effects: readonly SourcePropertyEffect[] },
	environment: SourcePropertyEnvironment,
	matched: readonly MatchedRuleChain[] = [],
): PropertySource {
	// A declaration owns an unconditional row only while it is the one applying:
	// a rule written for a viewport this document is not at, or for a state, is
	// written for its own scope and is not what this row edits.
	const owns = (effect: SourcePropertyEffect) =>
		admissible(effect) && declarationScope(effect).length === 0 && applies(effect, matched)?.active === true;
	const covers = (effect: SourcePropertyEffect, root: string) =>
		propertyKeys(effect.property, environment).includes(root);
	const winners = new Map<string, SourcePropertyEffect | undefined>();
	for (const root of roots) {
		for (const effect of certificate.effects) {
			if (!covers(effect, root) || admissible(effect)) continue;
			const layers = effect.path.filter((part) => part.startsWith("@layer ")).map((part) => part.slice(7).trim());
			if (layers.length && layers.every((name) => COMPILER_LAYERS.includes(name.split(".")[0]!))) continue;
			// Only a rule this element really matched can constrain what it can be
			// told about its own property; the rest of the project is not evidence.
			if (effect.owner === null && applies(effect, matched) === undefined) continue;
			throw new Error("this property has a declaration whose cascade order is not established");
		}
		const authored = certificate.effects.filter((effect) => covers(effect, root) && owns(effect));
		const utilities = classEffects.filter((effect) => !admissible(effect));
		const tiers = [
			utilities.filter((effect) => effect.important && covers(effect, root)),
			authored.filter((effect) => effect.important),
			styleEffects.filter((effect) => covers(effect, root)),
			authored.filter((effect) => !effect.important),
			utilities.filter((effect) => !effect.important && covers(effect, root)),
		];
		winners.set(root, tiers.find((tier) => tier.length > 0)?.at(-1));
	}
	const held = [...winners.values()];
	const inline = held.filter((effect) => effect && styleEffects.includes(effect));
	const declared = held.filter((effect) => effect && !styleEffects.includes(effect) && admissible(effect));
	if (inline.length === 0 && declared.length === 0) return { kind: "class" };
	if (inline.length + declared.length !== held.length || (inline.length > 0 && declared.length > 0))
		throw new Error("this property's declarations are owned by different sources");
	return inline.length
		? { kind: "style", members: [...new Set(inline.map((effect) => effect!.owner!))] }
		: { kind: "declaration", effects: [...new Set(declared as SourcePropertyEffect[])] };
}
