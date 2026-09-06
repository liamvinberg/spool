import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Scanner } from "@tailwindcss/oxide";
import { build } from "esbuild";
import type { Browser, ElementHandle, Page } from "playwright-core";
import { compile } from "tailwindcss";
import { anatomyOf } from "../../src/daemon/class-write";
import { buildDesignEntry } from "../../src/daemon/compile";
import { realDesignDir } from "../../src/daemon/design-path";
import { fingerprintOf } from "../../src/daemon/hand-write";
import { designStylesheets, ROOT_CSS } from "../../src/daemon/tailwind";
import { compileClasses } from "../../src/daemon/theme";
import { type Operation, type Selection, Sources, sourceRead, witnesses } from "./automatic-source";

export interface Mounted {
	page: Page;
	sources: Sources;
	generation: string;
	css: string;
	toolchain: string;
	selectedNodes: Map<string, ElementHandle<HTMLElement | SVGElement>>;
}

export async function mount(browser: Browser, root: string, frame: string, instrumented = true): Promise<Mounted> {
	const sources = new Sources(root);
	const designDir = realDesignDir(root);
	// Capture inputs before compilation, including imports pruned by the bundle.
	const visit = (path: string): void => {
		const unit = sources.read(path);
		for (const statement of unit.ast.program.body) {
			if (
				statement.type !== "ImportDeclaration" ||
				(!statement.source.value.startsWith(".") && !statement.source.value.startsWith("shared/"))
			)
				continue;
			const count = sources.units.size;
			const dependency = sources.resolve(unit, statement.source.value);
			if (sources.units.size > count) visit(dependency.path);
		}
	};
	visit(`frames/${frame}/frame.tsx`);
	sources.retain("shared/tokens.css");
	const compiled = await buildDesignEntry({
		designDir,
		resolveDir: join(designDir, "frames", frame),
		sourcefile: "<automatic-read>",
		label: "automatic target probe",
		contents: `import Frame from './frame.tsx'; import {createRoot} from 'react-dom/client'; import {createElement} from 'react'; const root = createRoot(document.getElementById('root')); globalThis.rerender = () => root.render(createElement(Frame)); globalThis.rerender();`,
	});
	const sheets = designStylesheets(designDir);
	const compiler = await compile(ROOT_CSS, {
		base: sheets.base,
		loadModule: sheets.loadModule,
		loadStylesheet: async (id, base) => {
			const loaded = await sheets.loadStylesheet(id, base);
			if (sheets.stylesheets.has(loaded.path)) {
				const authoredPath = id.startsWith(".")
					? relative(designDir, resolve(base, id))
					: relative(designDir, loaded.path);
				const held = sources.retain(authoredPath);
				if (held.file !== loaded.path || held.revision !== fingerprintOf(loaded.content))
					throw new Error("stylesheet changed while compilation read it");
			}
			return loaded;
		},
	});
	const scanner = new Scanner({ sources: [] });
	const candidates = scanner.scanFiles(
		compiled.sourceFiles.map((file) => ({ content: sources.read(relative(designDir, file)).text, extension: "tsx" })),
	);
	const css = compiler.build(candidates);
	const result = await build({
		stdin: { contents: compiled.bootJs, resolveDir: process.cwd(), loader: "js" },
		bundle: true,
		format: "iife",
		write: false,
		define: { "process.env.NODE_ENV": '"production"' },
		alias: {
			"spool/jsx-dev-runtime": resolve(
				instrumented ? "spikes/hand-edit-targets/runtime.tsx" : "src/runtime/jsx-dev-runtime.ts",
			),
		},
	});
	if (!sources.valid()) throw new Error("compile inputs changed");
	const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
	await page.setContent('<div id="root"></div><div id="portal"></div>');
	const generation = crypto.randomUUID();
	await page.addStyleTag({ content: css });
	await page.addScriptTag({ content: result.outputFiles[0]!.text });
	await page.locator("#root > *").first().waitFor();
	return {
		page,
		sources,
		generation,
		css,
		toolchain: fingerprintOf(readFileSync("pnpm-lock.yaml", "utf8")),
		selectedNodes: new Map(),
	};
}

export async function select(mounted: Mounted, selector: string): Promise<Selection> {
	const node = await mounted.page.locator(selector).elementHandle();
	if (!node) throw new Error("no selected element");
	const observation = await node.evaluate((el) => ({
		occurrence: el.getAttribute("data-probe-occurrence") ?? "",
		source: el.getAttribute("data-spool-source") ?? "",
		chain: JSON.parse(el.getAttribute("data-probe-chain") ?? "[]") as Selection["chain"],
	}));
	const held = mounted.selectedNodes.get(observation.occurrence);
	if (held && !(await held.evaluate((old, current) => old === current, node)))
		throw new Error("occurrence stamp was copied to another DOM node");
	mounted.selectedNodes.set(observation.occurrence, node);
	return { generation: mounted.generation, ...observation };
}

export async function stillSelected(mounted: Mounted, selection: Selection): Promise<boolean> {
	if (selection.generation !== mounted.generation || selection.occurrence === "" || !mounted.sources.valid())
		return false;
	if (mounted.toolchain !== fingerprintOf(readFileSync("pnpm-lock.yaml", "utf8"))) return false;
	const node = mounted.selectedNodes.get(selection.occurrence);
	if (!node || !(await node.evaluate((el) => el.isConnected))) return false;
	return mounted.page.evaluate((pick) => {
		const all = [...document.querySelectorAll("[data-probe-occurrence]")].filter(
			(el) => el.getAttribute("data-probe-occurrence") === pick.occurrence,
		);
		return (
			all.length === 1 &&
			all[0]!.getAttribute("data-spool-source") === pick.source &&
			all[0]!.getAttribute("data-probe-chain") === JSON.stringify(pick.chain)
		);
	}, selection);
}

// CSS ownership is proved only for one literal utility declaration in a chosen
// scope. The browser inventories declarations; it never chooses by pixel value.
async function propertyRead(
	mounted: Mounted,
	selection: Selection,
	operation: Extract<Operation, { kind: "property" }>,
	literal: string | null,
) {
	if (
		![
			"padding-top",
			"padding-left",
			"padding-right",
			"padding-bottom",
			"color",
			"background-color",
			"column-gap",
			"row-gap",
			"border-top-width",
		].includes(operation.property)
	)
		throw new Error("property is outside this read probe's demonstrated effect set");
	const tokens = (literal ?? "").split(/\s+/).filter(Boolean);
	const compiled = await compileClasses(mounted.sources.root, tokens);
	const candidates = compiled
		.filter((n) => n.ok)
		.map((n) => ({
			token: n.token,
			css: n.css,
			scope: anatomyOf(n.token)
				.variants.map((v) => `${v}:`)
				.join(""),
		}));
	const preflight = readFileSync(fileURLToPath(import.meta.resolve("tailwindcss/preflight.css")), "utf8");
	const result = await mounted.page.evaluate(
		({ pick, property, scope, candidates, expectedCss, expectedClass, preflight }) => {
			const el = [...document.querySelectorAll("[data-probe-occurrence]")].find(
				(n) => n.getAttribute("data-probe-occurrence") === pick.occurrence,
			);
			if (!el) throw new Error("occurrence disappeared");
			if ((el.getAttribute("class") ?? "") !== (expectedClass ?? ""))
				throw new Error("rendered classes differ from the authored literal");
			if (
				document.adoptedStyleSheets.length ||
				document.styleSheets.length !== 1 ||
				document.styleSheets[0]?.ownerNode?.textContent !== expectedCss
			)
				throw new Error("stylesheet observation changed or is incomplete");
			const expectedSheet = new CSSStyleSheet();
			expectedSheet.replaceSync(expectedCss);
			if (
				[...document.styleSheets[0]!.cssRules].map((rule) => rule.cssText).join("\n") !==
				[...expectedSheet.cssRules].map((rule) => rule.cssText).join("\n")
			)
				throw new Error("stylesheet CSSOM changed");
			if (el.hasAttribute("style") || el.getAnimations().length)
				throw new Error("inline or animated property ownership is unknown");
			if (getComputedStyle(el).writingMode !== "horizontal-tb" || getComputedStyle(el).direction !== "ltr")
				throw new Error("logical/physical mapping needs another proof");
			type Rule = {
				selector: string;
				layer: string;
				conditions: string[];
				active: boolean;
				declaration: string;
				authoredDeclaration: string;
				value: string;
				important: boolean;
			};
			const physical: Record<string, string> = {
				"inline-start": "left",
				"inline-end": "right",
				"block-start": "top",
				"block-end": "bottom",
			};
			const affects = (name: string) =>
				name === property ||
				name === "all" ||
				Object.entries(physical).some(([logical, physical]) => name.replace(logical, physical) === property) ||
				["padding", "margin", "border", "gap", "border-radius", "font", "background"].some(
					(prefix) => property.startsWith(`${prefix}-`) && name === prefix,
				) ||
				((property.startsWith("padding-") || property.startsWith("margin-")) &&
					["inline", "block"].some((axis) => name === `${property.split("-")[0]}-${axis}`)) ||
				(property.endsWith("-gap") && name === "gap");
			const collect = (
				rules: CSSRuleList,
				parent = "",
				layer = "",
				conditions: string[] = [],
				active = true,
				onlyProperty = true,
			): Rule[] => {
				const rows: Rule[] = [];
				for (const rule of rules) {
					let selector = parent;
					let nextLayer = layer;
					let nextConditions = conditions;
					let nextActive = active;
					if (rule instanceof CSSStyleRule)
						selector = rule.selectorText.includes("&")
							? rule.selectorText.replaceAll("&", parent)
							: rule.selectorText;
					if (rule instanceof CSSLayerBlockRule) nextLayer = rule.name;
					if (rule instanceof CSSMediaRule) {
						nextConditions = [...conditions, rule.conditionText];
						nextActive = active && matchMedia(rule.conditionText).matches;
					}
					if (rule instanceof CSSSupportsRule) {
						nextConditions = [...conditions, rule.conditionText];
						nextActive = active && CSS.supports(rule.conditionText);
					}
					if (
						"cssRules" in rule &&
						!(
							rule instanceof CSSStyleRule ||
							rule instanceof CSSLayerBlockRule ||
							rule instanceof CSSMediaRule ||
							rule instanceof CSSSupportsRule
						)
					)
						throw new Error("unproved CSS grouping/condition");
					if ("style" in rule && rule.style instanceof CSSStyleDeclaration) {
						const style = rule.style;
						for (const name of style) {
							const shorthand = [
								"padding-inline",
								"padding-block",
								"padding",
								"margin-inline",
								"margin-block",
								"margin",
								"gap",
								"border-top",
								"border-width",
								"border",
								"border-radius",
								"font",
								"background",
							].find(
								(candidate) =>
									(name.startsWith(`${candidate}-`) || (name.endsWith("-gap") && candidate === "gap")) &&
									style.getPropertyValue(candidate) !== "",
							);
							const authored = rule.style.getPropertyValue(name) === "" ? (shorthand ?? name) : name;
							if (!onlyProperty || affects(name))
								rows.push({
									selector,
									layer: nextLayer,
									conditions: nextConditions,
									active: nextActive,
									declaration: name,
									authoredDeclaration: authored,
									value: rule.style.getPropertyValue(authored),
									important: rule.style.getPropertyPriority(name) === "important",
								});
						}
					}
					if ("cssRules" in rule)
						rows.push(
							...collect(
								(rule as CSSGroupingRule).cssRules,
								selector,
								nextLayer,
								nextConditions,
								nextActive,
								onlyProperty,
							),
						);
				}
				return rows;
			};
			const matches = (row: Rule) => {
				try {
					return el.matches(
						row.selector.replace(
							/:(hover|active|focus-visible|focus-within|focus|checked|disabled|enabled|target)\b/g,
							"",
						),
					);
				} catch {
					throw new Error("unsupported selector");
				}
			};
			const all = collect(document.styleSheets[0]!.cssRules).filter(matches);
			if (all.some((row) => !["base", "utilities", "theme"].includes(row.layer)))
				throw new Error("an author CSS declaration competes, including inactive or same-valued rules");
			const sourceRules = candidates.flatMap((candidate) => {
				const sheet = new CSSStyleSheet();
				sheet.replaceSync(candidate.css);
				return collect(sheet.cssRules)
					.filter(matches)
					.map((row) => ({ ...row, token: candidate.token, scope: candidate.scope }));
			});
			// A full utility rule must map to a source candidate with the same selector,
			// conditions and raw declaration. An arbitrary .foo in @layer utilities is
			// not trusted merely because its author chose that layer's name.
			const same = (a: Rule, b: Rule) =>
				a.selector === b.selector &&
				a.declaration === b.declaration &&
				a.authoredDeclaration === b.authoredDeclaration &&
				a.value === b.value &&
				JSON.stringify(a.conditions) === JSON.stringify(b.conditions) &&
				a.important === b.important;
			const baseSheet = new CSSStyleSheet();
			baseSheet.replaceSync(preflight);
			const baseline = collect(baseSheet.cssRules);
			if (
				all.some(
					(row) => row.layer === "theme" || (row.layer === "base" && !baseline.some((base) => same(row, base))),
				)
			)
				throw new Error("author rule in a baseline layer is not the pinned reset");
			if (all.some((row) => row.layer === "utilities" && !sourceRules.some((source) => same(row, source))))
				throw new Error("utility rule has no verified source candidate");
			if (
				sourceRules.some(
					(source) => all.filter((row) => row.layer === "utilities" && same(row, source)).length !== 1,
				)
			)
				throw new Error("missing or duplicated utility declaration");
			if (all.some((row) => row.important)) throw new Error("important cascade is outside the bounded owner proof");
			const owned = sourceRules.filter((row) => row.scope === scope);
			if (owned.length > 1) throw new Error("competing declarations in the chosen scope; equality is not ownership");
			if (!/^(?:wide:)?(?:hover:)?$/.test(scope))
				throw new Error("scope is outside the demonstrated base/wide/hover forms");
			const owner = owned[0] ?? null;
			if (owner?.value === "") throw new Error("browser did not expose the authored declaration value");
			const ownerCandidate = candidates.find((candidate) => candidate.token === owner?.token);
			const ownerSheet = new CSSStyleSheet();
			ownerSheet.replaceSync(ownerCandidate?.css ?? "");
			return {
				owner,
				writeScope: scope,
				declaration: owner === null ? "absent in chosen scope; add explicit override" : "literal utility",
				reference: owner?.value.match(/var\((--[^,)]+)/)?.[1] ?? null,
				computed: getComputedStyle(el).getPropertyValue(property),
				context: {
					width: innerWidth,
					hover: el.matches(":hover"),
					rootFont: getComputedStyle(document.documentElement).fontSize,
				},
				selectedDeclarations: owner === null ? [] : [owner.declaration],
				ownerCandidateCss: ownerCandidate?.css ?? null,
				ownerCandidateDeclarations: collect(ownerSheet.cssRules, "", "", [], true, false),
				otherScopes: sourceRules.filter((row) => row.scope !== scope),
			};
		},
		{
			pick: selection,
			property: operation.property,
			scope: operation.scope,
			candidates,
			expectedCss: mounted.css,
			expectedClass: literal,
			preflight,
		},
	);
	return result;
}

export async function read(mounted: Mounted, selection: Selection, operation: Operation) {
	try {
		if (!(await stillSelected(mounted, selection)))
			throw new Error("stale document, occurrence, relationship, source or toolchain");
		const target = sourceRead(mounted.sources, selection, operation);
		if (operation.kind === "text") {
			const rendered = await mounted.selectedNodes.get(selection.occurrence)!.textContent();
			if (rendered !== target.expected)
				throw new Error("rendered text disagrees with the verified literal; no whitespace or expression inversion");
		}
		const property =
			operation.kind === "property" ? await propertyRead(mounted, selection, operation, target.expected) : null;
		if (!(await stillSelected(mounted, selection))) throw new Error("read invalidated before completion");
		return {
			kind: "supported" as const,
			target,
			property,
			proof: {
				selection,
				revisions: [...mounted.sources.revisions.values()],
				resolutions: [...mounted.sources.resolutions],
				witnesses: witnesses(mounted.sources, target),
				absentResolutionCandidates: [...mounted.sources.missing],
				toolchain: mounted.toolchain,
				continuity: "exact compiled snapshot only; no continuity across replacement or source edits",
			},
		};
	} catch (error) {
		return { kind: "refused" as const, reason: error instanceof Error ? error.message : String(error) };
	}
}
