import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Scanner } from "@tailwindcss/oxide";
import { build } from "esbuild";
import type { Browser, ElementHandle, Page } from "playwright-core";
import { __unstable__loadDesignSystem, compile } from "tailwindcss";
import { anatomyOf } from "../../src/daemon/class-write";
import { buildDesignEntry } from "../../src/daemon/compile";
import { realDesignDir } from "../../src/daemon/design-path";
import { fingerprintOf } from "../../src/daemon/hand-write";
import { designStylesheets, ROOT_CSS } from "../../src/daemon/tailwind";
import { compileClasses } from "../../src/daemon/theme";
import { ROWS } from "../../src/ui/canvas/properties-rows";
import { type Operation, type Revision, type Selection, Sources, sourceRead, witnesses } from "./automatic-source";
import type {} from "./observer";
import { reconciledRenderer } from "./reconciled-renderer";

// The lock identifies the installation; compiler/package bytes and bundled
// CSS defaults also retire a read if replaced without a lockfile update.
function compilerRevision(): string {
	const packageDir = dirname(dirname(fileURLToPath(import.meta.resolve("tailwindcss"))));
	const files = readdirSync(packageDir, { recursive: true })
		.filter((path): path is string => typeof path === "string" && /\.(?:m?js|css|json)$/.test(path))
		.sort();
	return fingerprintOf(
		JSON.stringify([
			readFileSync("pnpm-lock.yaml", "utf8"),
			...files.map((path) => [path, fingerprintOf(readFileSync(join(packageDir, path), "utf8"))]),
		]),
	);
}

export interface ReadLease {
	epoch: string;
	handles: { path: string; handle: string; revision: number }[];
}
export interface ReadAuthority {
	capture(revisions: readonly Revision[]): Promise<ReadLease>;
	valid(lease: ReadLease, revisions: readonly Revision[]): Promise<boolean>;
}

export interface Mounted {
	page: Page;
	sources: Sources;
	generation: string;
	css: string;
	toolchain: string;
	selectedNodes: Map<string, ElementHandle<HTMLElement | SVGElement>>;
	observed: boolean;
	authority: ReadAuthority | undefined;
	lease: ReadLease | undefined;
	themeCss: string;
	themeBindings: { name: string; value: string; from: "default" | "project" }[];
}

export async function mount(
	browser: Browser,
	root: string,
	frame: string,
	instrumented: boolean | "observed" | "reconciled" = true,
	authority?: ReadAuthority,
): Promise<Mounted> {
	const observed = instrumented === "observed" || instrumented === "reconciled";
	const toolchain = compilerRevision();
	const sources = new Sources(root);
	const designDir = realDesignDir(root);
	// Capture inputs before compilation, including imports pruned by the bundle.
	const visit = (path: string): void => {
		const unit = sources.read(path);
		for (const statement of unit.ast.program.body) {
			if (
				!["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(statement.type) ||
				!("source" in statement) ||
				!statement.source ||
				(!statement.source.value.startsWith(".") && !statement.source.value.startsWith("shared/"))
			)
				continue;
			if (/\.(png|jpe?g|gif|webp|svg|avif)$/.test(statement.source.value)) {
				sources.asset(
					statement.source.value.startsWith("shared/")
						? statement.source.value
						: join(dirname(unit.path), statement.source.value),
				);
				continue;
			}
			const count = sources.units.size;
			const dependency = sources.resolve(unit, statement.source.value);
			if (sources.units.size > count) visit(dependency.path);
		}
	};
	visit(`frames/${frame}/frame.tsx`);
	sources.retain("shared/tokens.css");

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
	const system = await __unstable__loadDesignSystem(ROOT_CSS, sheets);
	const themeBindings = [...system.theme.entries()].map(([name, value]) => ({
		name,
		value: value.value,
		from: value.options & 4 ? ("default" as const) : ("project" as const),
	}));
	// Re-run the pinned compiler's lowering on each generated candidate. A raw
	// candidatesToCss answer precedes fallback generation and is not the emitted
	// sheet (shadow colors are an executable counterexample). Only theme entries
	// and compiler-generated candidate CSS enter this isolated compilation.
	const themeCss = `@theme reference {${themeBindings.map((binding) => `${binding.name}:${binding.value};`).join("")}}`;
	// Capture owner revisions before the TSX compile. Stylesheet compilation
	// has only discovered/read dependencies; its snapshots are checked here too.
	const lease = await authority?.capture([...sources.revisions.values(), ...sources.assets.values()]);
	const compiled = await buildDesignEntry({
		designDir,
		resolveDir: join(designDir, "frames", frame),
		sourcefile: "<automatic-read>",
		label: "automatic target probe",
		contents: `import Frame from './frame.tsx'; import {createRoot} from 'react-dom/client'; import {createElement} from 'react'; const root = createRoot(document.getElementById('root')); globalThis.rerender = () => {const entry=createElement(Frame); ${observed ? "globalThis.__handObserver.register(entry, '<entry>', true);" : ""} root.render(entry)}; globalThis.unmount = () => root.unmount(); globalThis.rerender();`,
	});
	const scanner = new Scanner({ sources: [] });
	const candidates = scanner.scanFiles(
		compiled.sourceFiles
			.filter((file) => /\.[jt]sx?$/.test(file))
			.map((file) => ({ content: sources.read(relative(designDir, file)).text, extension: "tsx" })),
	);
	const css = compiler.build(candidates);
	const result = await build({
		stdin: { contents: compiled.bootJs, resolveDir: process.cwd(), loader: "js" },
		bundle: true,
		format: "iife",
		write: false,
		define: { "process.env.NODE_ENV": '"production"' },
		plugins: instrumented === "reconciled" ? [reconciledRenderer()] : [],
		alias: {
			"spool/jsx-dev-runtime": resolve(
				observed
					? "spikes/hand-edit-targets/observed-runtime.tsx"
					: instrumented
						? "spikes/hand-edit-targets/runtime.tsx"
						: "spikes/hand-edit-targets/plain-runtime.tsx",
			),
		},
	});
	if (
		!sources.valid() ||
		toolchain !== compilerRevision() ||
		(authority && lease && !(await authority.valid(lease, [...sources.revisions.values(), ...sources.assets.values()])))
	)
		throw new Error("compile inputs or source-owner lease changed");
	const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
	await page.setContent('<div id="root"></div><div id="portal"></div>');
	const generation = crypto.randomUUID();
	await page.addStyleTag({ content: css });
	if (observed) {
		const hook = await build({
			stdin: {
				contents: `import {installObserver} from './spikes/hand-edit-targets/observer'; installObserver(${instrumented === "reconciled"});`,
				resolveDir: process.cwd(),
			},
			bundle: true,
			write: false,
			format: "iife",
		});
		await page.addScriptTag({ content: hook.outputFiles[0]!.text });
	}
	await page.addScriptTag({ content: result.outputFiles[0]!.text });
	await page.locator("#root > *").first().waitFor();
	return {
		page,
		sources,
		generation,
		css,
		toolchain,
		selectedNodes: new Map(),
		observed,
		authority,
		lease,
		themeCss,
		themeBindings,
	};
}

export async function select(mounted: Mounted, selector: string): Promise<Selection> {
	const node = await mounted.page.locator(selector).elementHandle();
	if (!node) throw new Error("no selected element");
	const observation = mounted.observed
		? await node.evaluate((el) => globalThis.__handObserver.observe(el))
		: await node.evaluate((el) => ({
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
	if (
		mounted.authority &&
		mounted.lease &&
		!(await mounted.authority.valid(mounted.lease, [
			...mounted.sources.revisions.values(),
			...mounted.sources.assets.values(),
		]))
	)
		return false;
	if (mounted.toolchain !== compilerRevision()) return false;
	const node = mounted.selectedNodes.get(selection.occurrence);
	if (!node || !(await node.evaluate((el) => el.isConnected))) return false;
	if (mounted.observed)
		return node.evaluate((el, pick) => {
			try {
				const current = globalThis.__handObserver.observe(el);
				return (
					current.occurrence === pick.occurrence &&
					current.source === pick.source &&
					current.element === pick.element &&
					JSON.stringify(current.chain) === JSON.stringify(pick.chain) &&
					current.refusal === pick.refusal
				);
			} catch {
				return false;
			}
		}, selection);
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

// Bounded same-scope cascade: exact emitted rules, equal selector structure,
// importance then stylesheet order. No rendered-value ownership inference.
async function propertyRead(
	mounted: Mounted,
	selection: Selection,
	operation: Extract<Operation, { kind: "property" }>,
	literal: string | null,
) {
	if (!ROWS.some((row) => row.property === operation.property && row.rule.kind !== "read"))
		throw new Error("property is outside the retained operation inventory");
	const tokens = (literal ?? "").split(/\s+/).filter(Boolean);
	if (new Set(tokens).size !== tokens.length) throw new Error("duplicate source tokens need occurrence attribution");
	const compiled = await compileClasses(mounted.sources.root, tokens);
	const candidates = await Promise.all(
		compiled
			.filter((n) => n.ok)
			.map(async (n) => ({
				token: n.token,
				rawCss: n.css,
				css: (await compile(mounted.themeCss + n.css)).build([]),
				scope: anatomyOf(n.token)
					.variants.map((v) => `${v}:`)
					.join(""),
			})),
	);
	const preflight = (
		await compile(readFileSync(fileURLToPath(import.meta.resolve("tailwindcss/preflight.css")), "utf8"))
	).build([]);
	const result = await mounted.page.evaluate(
		({ pick, property, scope, candidates, expectedCss, expectedClass, preflight, themeBindings }) => {
			const el =
				globalThis.__handObserver?.node(pick.occurrence) ??
				[...document.querySelectorAll("[data-probe-occurrence]")].find(
					(n) => n.getAttribute("data-probe-occurrence") === pick.occurrence,
				);
			if (!el) throw new Error("occurrence disappeared");
			if ((el.getAttribute("class") ?? "") !== (expectedClass ?? ""))
				throw new Error("rendered classes differ from the authored literal");
			if (
				document.adoptedStyleSheets.length ||
				document.styleSheets.length !== 1 ||
				document.styleSheets[0]?.disabled ||
				document.styleSheets[0]?.media.mediaText !== "" ||
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
			if (el.hasAttribute("style") || document.getAnimations().length)
				throw new Error("inline or animated property ownership is unknown");
			const environment = getComputedStyle(el);
			if (!["horizontal-tb", "vertical-rl", "vertical-lr"].includes(environment.writingMode))
				throw new Error("writing mode is outside the demonstrated mapping");
			const inline = environment.writingMode === "horizontal-tb" ? ["left", "right"] : ["top", "bottom"];
			if (environment.direction === "rtl") inline.reverse();
			const block =
				environment.writingMode === "horizontal-tb"
					? ["top", "bottom"]
					: environment.writingMode === "vertical-rl"
						? ["right", "left"]
						: ["left", "right"];
			type Rule = {
				selector: string;
				layer: string;
				conditions: string[];
				active: boolean;
				declaration: string;
				authoredDeclaration: string;
				value: string;
				important: boolean;
				order: number;
			};
			const physical: Record<string, string> = {
				"inline-start": inline[0]!,
				"inline-end": inline[1]!,
				"block-start": block[0]!,
				"block-end": block[1]!,
			};
			const normalize = (name: string) => {
				const corner = /^border-(start|end)-(start|end)-radius$/.exec(name);
				if (corner) {
					const sides = [block[corner[1] === "start" ? 0 : 1], inline[corner[2] === "start" ? 0 : 1]];
					return `border-${sides.find((s) => s === "top" || s === "bottom")}-${sides.find((s) => s === "left" || s === "right")}-radius`;
				}
				for (const [logical, side] of Object.entries(physical)) name = name.replace(logical, side);
				return name.replace(/^inset-(top|right|bottom|left)$/, "$1");
			};
			const componentKeys: Record<string, string[]> = {
				"column-gap, between children": ["margin-left", "margin-right"],
				"row-gap, between children": ["margin-top", "margin-bottom"],
				"border-color, between children": [
					"border-top-color",
					"border-right-color",
					"border-bottom-color",
					"border-left-color",
				],
				"placeholder color": ["color"],
				"width and height": ["width", "height"],
				"width mode": ["width"],
				"height mode": ["height"],
				"scale-x": ["--tw-scale-x"],
				"scale-y": ["--tw-scale-y"],
				"rotate-x": ["--tw-rotate-x"],
				"rotate-y": ["--tw-rotate-y"],
				skew: ["--tw-skew-x", "--tw-skew-y"],
				"skew-x": ["--tw-skew-x"],
				"skew-y": ["--tw-skew-y"],
				"translate-x": ["--tw-translate-x"],
				"translate-y": ["--tw-translate-y"],
				brightness: ["--tw-brightness"],
				contrast: ["--tw-contrast"],
				saturate: ["--tw-saturate"],
				"hue-rotate": ["--tw-hue-rotate"],
				"ring-width": ["--tw-ring-shadow"],
				"ring-offset-width": ["--tw-ring-offset-width"],
				"ring-color": ["--tw-ring-color"],
				"box-shadow color": ["--tw-shadow-color"],
			};
			const nested = property.includes("between children");
			const placeholder = property === "placeholder color";
			const subjects = nested ? [...el.children] : [el];
			if (nested && subjects.length < 2) throw new Error("no observed pair of direct children for the nested effect");
			if (placeholder && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement))
				throw new Error("no observed input placeholder target");
			const probe = document.createElement("div").style;
			probe.setProperty(property, "initial");
			const keys = componentKeys[property] ?? [...probe].map(normalize);
			if (!keys.length) throw new Error("operation has no proven CSS effect identity");
			const affects = (name: string) => name === "all" || keys.includes(normalize(name));
			const serializedNames = (style: CSSStyleDeclaration): string[] => {
				let depth = 0,
					quote = "",
					escaped = false,
					part = "";
				const parts: string[] = [];
				for (const char of style.cssText) {
					if (escaped) escaped = false;
					else if (char === "\\") escaped = true;
					else if (quote) {
						if (char === quote) quote = "";
					} else if (char === '"' || char === "'") quote = char;
					else if (char === "(" || char === "[") depth++;
					else if (char === ")" || char === "]") depth--;
					else if (char === ";" && depth === 0) {
						parts.push(part);
						part = "";
						continue;
					}
					part += char;
				}
				if (part.trim()) parts.push(part);
				return parts.map((part) => part.slice(0, part.indexOf(":")).trim());
			};
			const collect = (
				rules: CSSRuleList,
				parent = "",
				layer = "",
				conditions: string[] = [],
				active = true,
				onlyProperty = true,
				sequence = { value: 0 },
			): Rule[] => {
				const rows: Rule[] = [];
				for (const rule of rules) {
					let selector = parent;
					let nextLayer = layer;
					let nextConditions = conditions;
					let nextActive = active;
					if (rule instanceof CSSStyleRule)
						selector = rule.selectorText.includes("&") ? rule.selectorText.replaceAll("&", parent) : rule.selectorText;
					if (rule instanceof CSSLayerBlockRule) nextLayer = rule.name;
					if (rule instanceof CSSMediaRule) {
						nextConditions = [...conditions, rule.conditionText];
						nextActive = active && matchMedia(rule.conditionText).matches;
					}
					if (rule instanceof CSSSupportsRule) {
						// Browser feature support is fixed for this mounted generation.
						// Unlike media/state, an unsupported feature branch cannot turn
						// active while this read is being used in the same renderer.
						if (!CSS.supports(rule.conditionText)) continue;
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
							const shorthand = serializedNames(style).find((candidate) => {
								const isolated = document.createElement("div").style;
								isolated.setProperty(candidate, style.getPropertyValue(candidate));
								return [...isolated].includes(name);
							});
							const authored = rule.style.getPropertyValue(name) === "" ? (shorthand ?? name) : name;
							if (!onlyProperty || affects(name))
								rows.push({
									selector,
									order: sequence.value++,
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
								sequence,
							),
						);
				}
				return rows;
			};
			const matches = (row: Rule) => {
				try {
					if (placeholder !== row.selector.includes("::placeholder")) return false;
					const selector = (placeholder ? row.selector.replaceAll("::placeholder", "") || "*" : row.selector).replace(
						/:(hover|active|focus-visible|focus-within|focus|checked|disabled|enabled|target)\b/g,
						"",
					);
					return subjects.some((subject) => subject.matches(selector));
				} catch {
					throw new Error("unsupported selector");
				}
			};
			const sheetDeclarations = collect(document.styleSheets[0]!.cssRules, "", "", [], true, false);
			const all = sheetDeclarations.filter(matches);
			if (all.some((row) => !["base", "utilities", "theme"].includes(row.layer)))
				throw new Error(
					`an author CSS declaration competes, including inactive or same-valued rules (${all.find((row) => !["base", "utilities", "theme"].includes(row.layer))?.layer})`,
				);
			const sourceRules = candidates.flatMap((candidate) => {
				const sheet = new CSSStyleSheet();
				sheet.replaceSync(candidate.css);
				return collect(sheet.cssRules, "", "", [], true, false)
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
			const baseline = collect(baseSheet.cssRules, "", "", [], true, false);
			if (
				all.some((row) => row.layer === "theme" || (row.layer === "base" && !baseline.some((base) => same(row, base))))
			)
				throw new Error(
					`author rule in a baseline layer is not the pinned reset: ${JSON.stringify(all.find((row) => row.layer === "theme" || (row.layer === "base" && !baseline.some((base) => same(row, base)))))}`,
				);
			if (all.some((row) => row.layer === "utilities" && !sourceRules.some((source) => same(row, source))))
				throw new Error(
					`utility rule has no verified source candidate: ${JSON.stringify(all.find((row) => row.layer === "utilities" && !sourceRules.some((source) => same(row, source))))}`,
				);
			if (
				sourceRules.some((source) => all.filter((row) => row.layer === "utilities" && same(row, source)).length !== 1)
			)
				throw new Error("missing or duplicated utility declaration");
			const contenders = sourceRules
				.filter((row) => row.scope === scope && affects(row.declaration))
				.map((row) => ({
					...row,
					order: all.find((actual) => actual.layer === "utilities" && same(actual, row))!.order,
					active:
						row.active &&
						subjects.some((subject) =>
							subject.matches(placeholder ? row.selector.replaceAll("::placeholder", "") : row.selector),
						),
				}));
			const winners = keys.flatMap((key) => {
				const effects = contenders.filter((row) => normalize(row.declaration) === key);
				// Replacing the exact escaped class anchor leaves selector structure,
				// and therefore specificity, unchanged. Different structures refuse.
				const shapes = new Set(
					effects.map((row) =>
						JSON.stringify([row.selector.replaceAll(`.${CSS.escape(row.token)}`, ".SOURCE"), row.conditions]),
					),
				);
				if (shapes.size > 1 && new Set(effects.map((row) => row.token)).size > 1)
					throw new Error("overlap needs unequal-selector cascade attribution");
				effects.sort((a, b) => Number(b.important) - Number(a.important) || b.order - a.order);
				return effects[0] ? [{ key, owner: effects[0], shadowed: effects.slice(1) }] : [];
			});
			const owned = [...new Set(winners.map((winner) => winner.owner))];
			const variants = [
				...themeBindings
					.filter((binding) => binding.name.startsWith("--breakpoint-"))
					.map((binding) => binding.name.slice(13)),
				"dark",
				"hover",
				"active",
				"focus",
				"focus-visible",
				"focus-within",
				"checked",
				"disabled",
				"enabled",
				"target",
				"group-hover",
				"group-focus",
				"peer-checked",
			];
			if (
				(scope !== "" && !scope.endsWith(":")) ||
				(scope !== "" &&
					scope
						.slice(0, -1)
						.split(":")
						.some((variant) => !variants.includes(variant)))
			)
				throw new Error("scope needs unproven ancestor, container or custom condition attribution");
			if (/group-|peer-/.test(scope) && !candidates.some((candidate) => candidate.scope === scope))
				throw new Error("ancestor scope needs an existing source candidate");
			if (
				!owned.length &&
				candidates.some((candidate) => {
					if (candidate.scope !== scope) return false;
					const sheet = new CSSStyleSheet();
					sheet.replaceSync(candidate.css);
					return collect(sheet.cssRules, "", "", [], true, false).some((row) => affects(row.declaration));
				})
			)
				throw new Error("source condition has no proven selected-subject attribution; not an absent property");
			const owner = owned[0] ?? null;
			if (owner?.value === "") throw new Error("browser did not expose the authored declaration value");
			const ownerCandidate = candidates.find((candidate) => candidate.token === owner?.token);
			const ownerSheet = new CSSStyleSheet();
			ownerSheet.replaceSync(ownerCandidate?.css ?? "");
			return {
				owner,
				owners: owned,
				winners,
				contenders,
				ownership: "source owner per effect in the explicit write scope; not the cross-scope rendered winner",
				effectKeys: keys,
				writeScope: scope,
				declaration: owner === null ? "absent in chosen scope; add explicit override" : "literal utility",
				reference: ownerCandidate?.rawCss.match(/var\((--[^,)]+)/)?.[1] ?? null,
				bindings: themeBindings.filter(
					(binding) =>
						sourceRules.some((rule) => rule.value.includes(`var(${binding.name}`)) ||
						(ownerCandidate?.rawCss.includes(binding.value) && binding.value.startsWith("var(")),
				),
				computed: getComputedStyle(el).getPropertyValue(property),
				renderedEffects: subjects.map((subject) => ({
					tag: subject.tagName,
					pseudo: placeholder ? "::placeholder" : null,
					values: Object.fromEntries(
						keys.map((key) => [
							key,
							getComputedStyle(subject, placeholder ? "::placeholder" : null).getPropertyValue(key),
						]),
					),
				})),
				context: {
					width: innerWidth,
					hover: el.matches(":hover"),
					rootFont: getComputedStyle(document.documentElement).fontSize,
					direction: environment.direction,
					writingMode: environment.writingMode,
				},
				selectedDeclarations: owned.map((row) => row.declaration),
				ownerCandidateCss: ownerCandidate?.css ?? null,
				allOwnerCandidateCss: candidates.filter((candidate) => owned.some((row) => row.token === candidate.token)),
				ownerCandidateDeclarations: collect(ownerSheet.cssRules, "", "", [], true, false),
				allOwnerCandidateDeclarations: candidates
					.filter((candidate) => owned.some((row) => row.token === candidate.token))
					.flatMap((candidate) => {
						const sheet = new CSSStyleSheet();
						sheet.replaceSync(candidate.css);
						return collect(sheet.cssRules, "", "", [], true, false).map((row) => ({ ...row, token: candidate.token }));
					}),
				readSet: {
					declarations: sourceRules,
					sheetDeclarations,
					stylesheet: expectedCss,
					candidates,
					compilerInputs: { preflight, themeBindings },
					variables: [
						...new Set(
							sourceRules.flatMap((row) => [...row.value.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]!)),
						),
					],
					policy:
						"conservative complete matching-candidate read set; stylesheet revisions include inherited bindings and compiler prerequisites",
				},
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
			themeBindings: mounted.themeBindings,
		},
	);
	return result;
}

// A bounded exact context snapshot, not a semantic rebase or event journal.
async function renderedContext(mounted: Mounted, selection: Selection) {
	const node = mounted.selectedNodes.get(selection.occurrence);
	if (!node) throw new Error("selected node disappeared");
	return node.evaluate((el) => {
		const media: { query: string; matches: boolean }[] = [];
		const visit = (rules: CSSRuleList): void => {
			for (const rule of rules) {
				if (rule instanceof CSSMediaRule)
					media.push({ query: rule.conditionText, matches: matchMedia(rule.conditionText).matches });
				if ("cssRules" in rule && rule.cssRules instanceof CSSRuleList) visit(rule.cssRules);
			}
		};
		for (const sheet of document.styleSheets) visit(sheet.cssRules);
		const ancestors: Element[] = [];
		let parent = el.parentElement;
		while (parent) {
			ancestors.push(parent);
			parent = parent.parentElement;
		}
		return {
			viewport: [innerWidth, innerHeight],
			media,
			rootAttributes: [...document.documentElement.attributes].map((attr) => [attr.name, attr.value]),
			document: [...document.body.children]
				.filter((child) => child.tagName !== "SCRIPT")
				.map((child) => child.outerHTML)
				.join(""),
			states: [...document.querySelectorAll("*")].map((element) => ({
				states: [
					"hover",
					"active",
					"focus",
					"focus-visible",
					"focus-within",
					"checked",
					"disabled",
					"enabled",
					"target",
				].filter((state) => element.matches(`:${state}`)),
				value:
					element instanceof HTMLInputElement ||
					element instanceof HTMLTextAreaElement ||
					element instanceof HTMLSelectElement
						? element.value
						: null,
			})),
			environment: [...new Set([el, ...el.children, ...ancestors])].map((element) => {
				const style = getComputedStyle(element);
				return {
					tag: element.tagName,
					values: Object.fromEntries([...style].map((name) => [name, style.getPropertyValue(name)])),
				};
			}),
		};
	});
}

export async function read(mounted: Mounted, selection: Selection, operation: Operation) {
	try {
		const committedRender = mounted.observed
			? await mounted.page.evaluate(() => globalThis.__handObserver.commits)
			: null;
		if (!(await stillSelected(mounted, selection)))
			throw new Error("stale document, occurrence, relationship, source or toolchain");
		const target = sourceRead(mounted.sources, selection, operation);
		if (operation.kind === "text") {
			const rendered = await mounted.selectedNodes.get(selection.occurrence)!.textContent();
			if (rendered !== target.expected)
				throw new Error("rendered text disagrees with the verified literal; no whitespace or expression inversion");
		}
		if (
			operation.kind === "attribute" &&
			(await mounted.selectedNodes.get(selection.occurrence)!.getAttribute(operation.attribute)) !== target.expected
		)
			throw new Error("rendered attribute differs from authored literal");
		if (operation.kind === "asset" && target.asset) {
			const src = await mounted.selectedNodes.get(selection.occurrence)!.getAttribute("src");
			if (!src?.startsWith("data:")) throw new Error("mounted image is not the compiled local asset");
			const comma = src.indexOf(",");
			const bytes = src.slice(0, comma).endsWith(";base64")
				? Buffer.from(src.slice(comma + 1), "base64")
				: Buffer.from(decodeURIComponent(src.slice(comma + 1)));
			if (fingerprintOf(bytes.toString("base64")) !== target.asset.revision)
				throw new Error("rendered image differs from imported asset bytes");
		}
		const context = operation.kind === "property" ? await renderedContext(mounted, selection) : null;
		const property =
			operation.kind === "property" ? await propertyRead(mounted, selection, operation, target.expected) : null;
		if (!(await stillSelected(mounted, selection))) throw new Error("read invalidated before completion");
		if (context && JSON.stringify(context) !== JSON.stringify(await renderedContext(mounted, selection)))
			throw new Error("rendered context changed during the property read");
		if (
			committedRender !== null &&
			committedRender !== (await mounted.page.evaluate(() => globalThis.__handObserver.commits))
		)
			throw new Error("React committed another render during the read");
		return {
			kind: "supported" as const,
			target,
			property,
			proof: {
				selection,
				operation,
				context,
				committedRender,
				revisions: [...mounted.sources.revisions.values()],
				assets: [...mounted.sources.assets.values()],
				resolutions: [...mounted.sources.resolutions],
				witnesses: witnesses(mounted.sources, target),
				absentResolutionCandidates: [...mounted.sources.missing],
				toolchain: mounted.toolchain,
				owner: mounted.lease ?? null,
				continuity: mounted.lease
					? "owner epoch and complete dependency revisions admitted before compile; no rebasing or outside-write exclusion"
					: "exact compiled snapshot only; no continuity across replacement or source edits",
			},
		};
	} catch (error) {
		return { kind: "refused" as const, reason: error instanceof Error ? error.message : String(error) };
	}
}

// Reuse the same selection, source/owner lease and exact retained dependencies.
// The actual coordinator and commit/undo lifecycle remain separate consumers.
export async function validPropertyRead(
	mounted: Mounted,
	previous: Awaited<ReturnType<typeof read>>,
): Promise<boolean> {
	if (previous.kind !== "supported" || !previous.property || previous.proof.operation.kind !== "property") return false;
	const current = await read(mounted, previous.proof.selection, {
		kind: "property",
		property: previous.proof.operation.property,
		scope: previous.target.scope,
	});
	return (
		current.kind === "supported" &&
		JSON.stringify(current.property) === JSON.stringify(previous.property) &&
		JSON.stringify(current.proof) === JSON.stringify(previous.proof)
	);
}
