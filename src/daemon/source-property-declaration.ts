import type { SourcePropertyEffect, SourcePropertyEnvironment } from "../source-property";
import type { SpanPatch } from "./hand-write";
import { propertyKeys } from "./source-property-effects";

/**
 * The authored CSS declaration as a source role.
 *
 * A project stylesheet reaches the frame through the same compiler the classes
 * do, and its declarations arrive in the certificate with no class owner and
 * their own selector and condition chain. That chain is the whole identity: it
 * is what the browser matches the element against, and it is what finds the
 * declaration again in the file it was written in.
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

/** One authored, unlayered declaration whose condition chain this reader can establish. */
export function admissible(effect: SourcePropertyEffect): boolean {
	if (effect.owner !== null) return false;
	const selectors = effect.path.filter((part) => !part.startsWith("@"));
	return selectors.length === 1 && effect.path.every((part) => !part.startsWith("@") || conditional(part));
}

/** The project's own declarations for these roots, in the compiler's own order. */
export function authoredCandidates(
	certificate: { effects: readonly SourcePropertyEffect[] },
	roots: ReadonlySet<string>,
	environment: SourcePropertyEnvironment,
	matched?: readonly (readonly string[])[],
): SourcePropertyEffect[] {
	return certificate.effects.filter(
		(effect) =>
			admissible(effect) &&
			propertyKeys(effect.property, environment).some((key) => roots.has(key)) &&
			(matched === undefined || applies(effect, matched)),
	);
}

/**
 * True where this element's own document reports the rule as one of its own.
 *
 * A stylesheet declares things about every subject in the project. Only the
 * chains the element actually matched are evidence about this element, and the
 * client cannot name a chain the document did not report.
 */
export function applies(effect: SourcePropertyEffect, matched: readonly (readonly string[])[]): boolean {
	const path = effect.path.map(collapse);
	return matched.some(
		(chain) => chain.length === path.length && chain.every((part, index) => collapse(part) === path[index]),
	);
}

function collapse(value: string): string {
	return value.replace(/\s+/g, " ").trim();
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
	const path = effect.path.map(collapse);
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
 * Which authored source declares the winning effect for every selected root.
 *
 * The order is the cascade this element actually runs under: an important
 * utility, then an important project declaration, then the element's own
 * member, then a project declaration, then an ordinary utility. Within one tier
 * the compiler's own order decides, which is the order the effects arrive in.
 *
 * A competitor whose order this reader cannot establish — a project cascade
 * layer, a container query, a scope — refuses rather than being stepped over.
 */
export function propertySourceOwner(
	roots: ReadonlySet<string>,
	classEffects: readonly SourcePropertyEffect[],
	styleEffects: readonly SourcePropertyEffect[],
	certificate: { effects: readonly SourcePropertyEffect[] },
	environment: SourcePropertyEnvironment,
	matched: readonly (readonly string[])[] = [],
): PropertySource {
	const covers = (effect: SourcePropertyEffect, root: string) =>
		propertyKeys(effect.property, environment).includes(root);
	const winners = new Map<string, SourcePropertyEffect | undefined>();
	for (const root of roots) {
		for (const effect of certificate.effects) {
			if (effect.owner !== null || !covers(effect, root) || admissible(effect)) continue;
			if (!applies(effect, matched)) continue;
			const layers = effect.path.filter((part) => part.startsWith("@layer ")).map((part) => part.slice(7).trim());
			if (layers.length && layers.every((name) => COMPILER_LAYERS.includes(name.split(".")[0]!))) continue;
			throw new Error("this property has a declaration whose cascade order is not established");
		}
		const authored = certificate.effects.filter(
			(effect) => admissible(effect) && covers(effect, root) && applies(effect, matched),
		);
		const tiers = [
			classEffects.filter((effect) => effect.important && covers(effect, root)),
			authored.filter((effect) => effect.important),
			styleEffects.filter((effect) => covers(effect, root)),
			authored.filter((effect) => !effect.important),
			classEffects.filter((effect) => !effect.important && covers(effect, root)),
		];
		winners.set(root, tiers.find((tier) => tier.length > 0)?.at(-1));
	}
	const held = [...winners.values()];
	const inline = held.filter((effect) => effect && styleEffects.includes(effect));
	const declared = held.filter((effect) => effect && effect.owner === null);
	if (inline.length === 0 && declared.length === 0) return { kind: "class" };
	if (inline.length + declared.length !== held.length || (inline.length > 0 && declared.length > 0))
		throw new Error("this property's declarations are owned by different sources");
	return inline.length
		? { kind: "style", members: [...new Set(inline.map((effect) => effect!.owner!))] }
		: { kind: "declaration", effects: [...new Set(declared as SourcePropertyEffect[])] };
}
