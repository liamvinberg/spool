import { __unstable__loadDesignSystem, compile, compileAst } from "tailwindcss";
import type { SourcePropertyEffect } from "../source-property";
import { splitClass } from "./class-write";
import { realDesignDir } from "./design-path";
import type { SourceInput } from "./retained-compile";
import { designStylesheets, ROOT_CSS } from "./tailwind";

type CssNode = Parameters<typeof compileAst>[0][number];

export interface PropertyCertificate {
	literal: string;
	effects: SourcePropertyEffect[];
	registrations: Record<string, readonly SourcePropertyEffect[]>;
	theme: Readonly<Record<string, { value: string; options: number }>>;
	css: string;
	stylesheets: readonly string[];
}

/** CSS identifier escaping, including leading digits and hexadecimal escape terminators. */
function identifier(value: string): string {
	return [...value]
		.map((char, index) => {
			const code = char.codePointAt(0)!;
			if (code === 0) return "\uFFFD";
			if (
				code <= 31 ||
				code === 127 ||
				(index === 0 && /[0-9]/.test(char)) ||
				(index === 1 && value[0] === "-" && /[0-9]/.test(char))
			)
				return `\\${code.toString(16)} `;
			if (index === 0 && char === "-" && value.length === 1) return "\\-";
			return code >= 128 || /[\w-]/.test(char) ? char : `\\${char}`;
		})
		.join("");
}

/** Fresh compiler instances prevent a prior candidate set from authorizing today's operation. */
export async function compilePropertySource(
	root: string,
	inputs: ReadonlyMap<string, SourceInput>,
	literal: string,
): Promise<PropertyCertificate> {
	const tokens = splitClass(literal);
	const sheets = designStylesheets(realDesignDir(root), (file) => {
		const input = inputs.get(file);
		if (!input) throw new Error("property stylesheet is outside the original captured compiler inputs");
		return input.bytes.toString("utf8");
	});
	const imports: CssNode[] = [
		{ kind: "at-rule", name: "@import", params: '"tailwindcss"', nodes: [] },
		{ kind: "at-rule", name: "@import", params: '"./tokens.css"', nodes: [] },
	];
	const compiler = await compileAst(imports, sheets);
	const ast = compiler.build(tokens);
	const effects: SourcePropertyEffect[] = [];
	const registrations: PropertyCertificate["registrations"] = {};
	const selectors = tokens.map((token) => ({ token, selector: `.${identifier(token)}` }));
	function walk(nodes: readonly CssNode[], owner: string | null, path: readonly string[], into = effects): void {
		for (const node of nodes) {
			if (node.kind === "declaration") {
				if (node.value !== undefined)
					into.push({ owner, path, property: node.property, value: node.value, important: node.important });
			} else if (node.kind === "rule") {
				const found = selectors.find(
					({ selector }) =>
						node.selector === selector ||
						(node.selector.startsWith(selector) && /^[[:]/.test(node.selector.slice(selector.length))) ||
						node.selector === `:where(${selector} > :not(:last-child))`,
				);
				walk(
					node.nodes,
					found?.token ?? owner,
					[...path, found ? node.selector.replace(found.selector, "$") : node.selector],
					into,
				);
			} else if (node.kind === "at-rule") {
				if (node.name === "@property") {
					const declarations: SourcePropertyEffect[] = [];
					walk(node.nodes, null, [], declarations);
					registrations[node.params] = declarations;
				} else walk(node.nodes, owner, [...path, `${node.name} ${node.params}`.trim()], into);
			} else if (node.kind === "at-root") walk(node.nodes, owner, [], into);
			else if (node.kind === "context") walk(node.nodes, owner, path, into);
		}
	}
	walk(ast, null, []);
	const cssCompiler = await compile(ROOT_CSS, sheets);
	const system = await __unstable__loadDesignSystem(ROOT_CSS, sheets);
	const theme = Object.fromEntries(system.theme.entries());
	return {
		literal,
		effects,
		registrations,
		theme,
		css: cssCompiler.build(tokens),
		stylesheets: [...sheets.stylesheets],
	};
}
