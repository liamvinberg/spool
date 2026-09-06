import { readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTempDir, markProject, writeDesignFile } from "../../src/test-helpers";
import { mount, read, select, stillSelected } from "./automatic-browser";
import { reach, Sources } from "./automatic-source";
import { button, first, nested, second, tokens, unused } from "./fixtures";

const evidence: Record<string, unknown> = {};
const roots: string[] = [];
function project() {
	const root = makeTempDir();
	markProject(root);
	roots.push(root);
	for (const [path, source] of Object.entries({
		"shared/ui/button.tsx": button,
		"shared/ui/shell.tsx": nested,
		"custom/other.tsx":
			'export function Button({ label }: {label:string}) { return <button className="p-8">{label}</button>; }',
		"frames/first/frame.tsx": first
			.replace("import { useState }", 'import { Button as Other } from "../../custom/other";\nimport { useState }')
			.replace('label="Download Windows"', 'label="Download Mac"')
			.replace("<Pair />", '<Other label="Download Mac" /><Pair />'),
		"frames/second/frame.tsx": second,
		"frames/unused/frame.tsx": unused,
		"shared/tokens.css": tokens,
	}))
		writeDesignFile(root, path, source);
	return root;
}
const supported = (result: Awaited<ReturnType<typeof read>>) => {
	if (result.kind !== "supported") throw new Error(result.reason);
	return result;
};

describe("automatic mounted selection to source", () => {
	let browser: Browser;
	beforeAll(async () => {
		browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	});
	afterAll(async () => {
		await browser?.close();
		if (process.env.AUTO_TARGET_EVIDENCE)
			writeFileSync(
				process.env.AUTO_TARGET_EVIDENCE,
				`${JSON.stringify(evidence, (_key, value: unknown) => (typeof value === "string" ? roots.reduce((text, root) => text.replaceAll(root, "<project>"), value) : value), 2)}\n`,
			);
	});

	it("automatically resolves identical labels, nested forwarding, definition literals and authored children", async () => {
		const mounted = await mount(browser, project(), "first");
		const a = supported(
			await read(mounted, await select(mounted, "main > button:nth-of-type(1) span"), { kind: "text" }),
		);
		const b = supported(
			await read(mounted, await select(mounted, "main > button:nth-of-type(2) span"), { kind: "text" }),
		);
		expect(a.target.expected).toBe(b.target.expected);
		expect(a.target.address).not.toEqual(b.target.address);
		expect(a.target.attribute).toBe("label");
		const forwarded = supported(await read(mounted, await select(mounted, "section span"), { kind: "text" }));
		expect(forwarded.target.expected).toBe("Nested");
		expect(forwarded.target.source).toContain("frames/first/frame.tsx");
		const inner = supported(
			await read(mounted, await select(mounted, "main > button:first-of-type i"), { kind: "text" }),
		);
		expect(inner.target.role).toBe("definition");
		expect(inner.target.source).toContain("shared/ui/button.tsx");
		const child = supported(await read(mounted, await select(mounted, "strong"), { kind: "text" }));
		expect(child.target.expected).toBe("Literal child");
		const deletion = supported(
			await read(mounted, await select(mounted, "main > button:first-of-type"), { kind: "delete" }),
		);
		expect(deletion.target.expected).toBe('<Button label="Download Mac" />');
		const other = supported(
			await read(mounted, await select(mounted, "main > button:nth-of-type(3)"), { kind: "text" }),
		);
		expect(other.target.expected).toBe("Download Mac");
		expect(other.proof.revisions.some((r) => r.path === "custom/other.tsx")).toBe(true);
		const reorder = supported(await read(mounted, await select(mounted, "b:first-of-type"), { kind: "reorder" }));
		expect(reorder.target.slot).toBe("child");
		expect(reorder.target.role).toBe("definition");
		evidence.join = { a, b, forwarded, inner, child, deletion, other, reorder };
		await mounted.page.close();
	});

	it("refuses transformed/data text and generated-root deletion without falling back to equal text", async () => {
		const mounted = await mount(browser, project(), "first");
		const upper = await read(mounted, await select(mounted, "main > span"), { kind: "text" });
		const row = await read(mounted, await select(mounted, "#rows button:first-child span"), { kind: "text" });
		const deletion = await read(mounted, await select(mounted, "#rows button:first-child"), { kind: "delete" });
		expect(upper.kind).toBe("refused");
		expect(row.kind).toBe("refused");
		expect(deletion.kind).toBe("refused");
		const inner = supported(
			await read(mounted, await select(mounted, "#rows button:first-child i"), { kind: "delete" }),
		);
		expect(inner.target.role).toBe("definition");
		expect(inner.target.repeated).toBe(true);
		evidence.refusals = { upper, row, deletion, inner };
		await mounted.page.close();
	});

	it("keeps keyed and ordinary rerender identity, and invalidates remount and changed call ancestry", async () => {
		const mounted = await mount(browser, project(), "first");
		const keyed = await select(mounted, "#rows button:first-child");
		const unkeyed = await select(mounted, "#unkeyed button:first-child");
		await mounted.page.evaluate("rerender()");
		expect(await stillSelected(mounted, keyed)).toBe(true);
		await mounted.page.locator("#reverse").click();
		expect(await select(mounted, "#rows button:last-child")).toEqual(keyed);
		expect(await select(mounted, "#unkeyed button:first-child")).toEqual(unkeyed);
		expect(await mounted.page.locator("#unkeyed button:first-child").textContent()).toContain("Beta");
		await mounted.page.locator("#toggle").click();
		const conditional = await select(mounted, 'button:has-text("Conditional")');
		await mounted.page.locator("#toggle").click();
		expect(await stillSelected(mounted, conditional)).toBe(false);
		await mounted.page.locator("#toggle").click();
		expect(await stillSelected(mounted, conditional)).toBe(false);
		const pairA = await select(mounted, "b:first-of-type");
		const pairB = await select(mounted, "b:last-of-type");
		expect(pairA.chain).toEqual(pairB.chain);
		expect(pairA.occurrence).not.toBe(pairB.occurrence);
		expect(await mounted.page.locator("aside").count()).toBe(0);
		// React reconciles the same component type at the same position while its
		// authored call changes. The relationship must invalidate despite a kept ID.
		const root = project();
		writeDesignFile(
			root,
			"frames/first/frame.tsx",
			`import {useState} from 'react'; import {Button} from 'shared/ui/button'; export default function Frame() { const [flip,setFlip]=useState(false); return <main>{flip ? <Button label="Same" /> : <Button label="Same" />}<a id="flip" onClick={()=>setFlip(!flip)}>Flip</a></main>; }`,
		);
		const changing = await mount(browser, root, "first");
		const before = await select(changing, "button");
		await changing.page.locator("#flip").click();
		const after = await select(changing, "button");
		expect(after.occurrence).toBe(before.occurrence);
		expect(after.chain).not.toEqual(before.chain);
		expect(await stillSelected(changing, before)).toBe(false);
		await changing.page.locator("button").evaluate((el) => el.replaceWith(el.cloneNode(true)));
		expect(await stillSelected(changing, after)).toBe(false);
		evidence.lifetime = {
			keyedReorder: true,
			unkeyedReusesData: true,
			remountInvalidates: true,
			copiedDOMStampInvalidates: true,
			pairRoots: 2,
			nullRoots: 0,
			changedRelationship: { before, after },
		};
		await mounted.page.close();
		await changing.page.close();
	});

	it("retains all caller, callee, stylesheet, missing import candidates and canonical source revisions", async () => {
		const invalidations: string[] = [];
		for (const path of [
			"frames/first/frame.tsx",
			"shared/ui/shell.tsx",
			"shared/ui/button.tsx",
			"shared/tokens.css",
		]) {
			const root = project();
			const mounted = await mount(browser, root, "first");
			const selection = await select(mounted, "section span");
			const result = supported(await read(mounted, selection, { kind: "text" }));
			expect(result.proof.revisions.some((r) => r.path === path)).toBe(true);
			const file = join(root, "design", path);
			writeFileSync(file, `${readFileSync(file, "utf8")}\n`);
			expect((await read(mounted, selection, { kind: "text" })).kind).toBe("refused");
			invalidations.push(path);
			await mounted.page.close();
		}
		const root = project();
		const mounted = await mount(browser, root, "first");
		const pick = await select(mounted, "section span");
		const rebuilt = await mount(browser, root, "first");
		expect(await stillSelected(rebuilt, pick)).toBe(false);
		writeDesignFile(root, "frames/first/alias.tsx", "export default function Frame(){return <p>Alias</p>}");
		const sources = new Sources(root);
		sources.read("frames/first/alias.tsx");
		unlinkSync(join(root, "design/frames/first/alias.tsx"));
		writeDesignFile(root, ".spool/hidden.tsx", "export default function Frame(){return <p>Alias</p>}");
		symlinkSync(join(root, "design/.spool/hidden.tsx"), join(root, "design/frames/first/alias.tsx"));
		expect(sources.valid()).toBe(false);
		expect(() => new Sources(root).read("frames/first/alias.tsx")).toThrow();
		evidence.revisions = {
			invalidations,
			unchangedCallerDefinitionChangeRefused: true,
			recompileInvalidates: true,
			canonicalRoleRechecked: true,
		};
		await mounted.page.close();
		await rebuilt.page.close();
	});

	it("rejects a locally shadowed import and distinguishes same-named exports and unused imports in reach", async () => {
		const root = project();
		const mounted = await mount(browser, root, "first");
		const shared = supported(
			await read(mounted, await select(mounted, "main > button:first-of-type i"), { kind: "text" }),
		);
		const found = reach(
			mounted.sources,
			["frames/first/frame.tsx", "frames/second/frame.tsx", "frames/unused/frame.tsx"],
			shared.target.address,
		);
		expect(found.potential).toHaveLength(3);
		expect(found.references.filter((r) => r.source.startsWith("frames/unused"))).toHaveLength(0);
		expect(found.references).toHaveLength(7); // five first-frame sites, Shell, second frame
		expect(found.unknown).toHaveLength(0);
		const secondFrame = await mount(browser, root, "second");
		const count = async (m: typeof mounted) =>
			await m.page
				.locator("button")
				.evaluateAll(
					(nodes) =>
						nodes.filter((n) => n.getAttribute("data-spool-source")?.startsWith("shared/ui/button.tsx")).length,
				);
		expect(await count(mounted)).toBe(7);
		expect(await count(secondFrame)).toBe(1);
		writeDesignFile(
			root,
			"frames/first/frame.tsx",
			`import {Button} from 'shared/ui/button'; export default function Frame() { function Button({label}: {label:string}) { return <button>{label}</button>; } return <main><Button label="shadow" /></main>; }`,
		);
		const shadow = await mount(browser, root, "first");
		const refused = await read(shadow, await select(shadow, "button"), { kind: "text" });
		expect(refused.kind).toBe("refused");
		evidence.reach = {
			...found,
			observations: [
				{ frame: "first", generation: mounted.generation, hosts: 7 },
				{ frame: "second", generation: secondFrame.generation, hosts: 1 },
			],
			unopenedUnusedFrame: "unknown, not zero",
			shadow: refused,
		};
		await mounted.page.close();
		await secondFrame.page.close();
		await shadow.page.close();
	});

	it("reads an owning utility, explicit scope, token reference, computed value and absent override separately", async () => {
		const root = project();
		writeDesignFile(
			root,
			"frames/first/frame.tsx",
			`import {Button} from 'shared/ui/button'; export default function Frame() { return <main className="text-brand"><Button label="Shared" /><p id="inherit">Inherited</p><p id="override" className="text-brand">Explicit</p><p id="scoped" className="p-4 wide:p-8 hover:p-12 gap-x-4 wide:gap-x-rhythm">Scope</p><p id="equal" className="p-4 pt-4">Same values</p><p id="inline" className="p-4" style={{padding:16}}>Inline</p><p id="absent">Absent</p></main>; }`,
		);
		const mounted = await mount(browser, root, "first");
		const property = async (selector: string, property: string, scope = "") =>
			read(mounted, await select(mounted, selector), { kind: "property", property, scope });
		const shared = supported(await property("button", "padding-left"));
		expect(shared.target.role).toBe("definition");
		expect(shared.property?.owner?.token).toBe("px-4");
		expect(shared.property?.ownerCandidateDeclarations.map((declaration) => declaration.declaration)).toEqual([
			"padding-inline-start",
			"padding-inline-end",
		]);
		const inherit = supported(await property("#inherit", "color"));
		expect(inherit.property?.owner).toBeNull();
		expect(inherit.property?.computed).toBe("rgb(18, 52, 86)");
		const override = supported(await property("#override", "color"));
		expect(override.property?.owner?.token).toBe("text-brand");
		expect(override.property?.reference).toBe("--brand");
		const absent = supported(await property("#absent", "border-top-width"));
		expect(absent.property?.owner).toBeNull();
		const base = supported(await property("#scoped", "padding-top"));
		const wide = supported(await property("#scoped", "padding-top", "wide:"));
		const hover = supported(await property("#scoped", "padding-top", "hover:"));
		expect(base.property?.owner?.token).toBe("p-4");
		expect(wide.property?.owner?.token).toBe("wide:p-8");
		expect(hover.property?.owner?.token).toBe("hover:p-12");
		expect(wide.property?.computed).toBe("16px"); // inactive write scope remains explicit
		await mounted.page.setViewportSize({ width: 1200, height: 700 });
		const wideActive = supported(await property("#scoped", "padding-top", "wide:"));
		expect(wideActive.property?.computed).toBe("32px");
		await mounted.page.locator("#scoped").hover();
		const hoverActive = supported(await property("#scoped", "padding-top", "hover:"));
		expect(hoverActive.property?.computed).toBe("48px");
		const gap = supported(await property("#scoped", "column-gap", "wide:"));
		expect(gap.property?.reference).toBe("--space-step");
		const equal = await property("#equal", "padding-top");
		const inline = await property("#inline", "padding-top");
		expect(equal.kind).toBe("refused");
		expect(inline.kind).toBe("refused");
		evidence.properties = {
			shared,
			inherit,
			override,
			absent,
			base,
			wide,
			hover,
			wideActive,
			hoverActive,
			gap,
			equal,
			inline,
		};
		await mounted.page.close();
	});

	it("refuses competing author CSS even when it produces equal pixels, and stylesheet mutation", async () => {
		const findings: unknown[] = [];
		for (const rule of [
			".compete { padding: 16px }",
			".compete:active { padding: 16px }",
			"@media (width >= 900px) { .compete { padding: 16px } }",
			"@layer utilities { .compete { padding: 16px } }",
			"@layer base { .compete { padding: 16px } }",
			"@layer utilities { .p-4 { padding: calc(var(--spacing) * 4) } }",
		]) {
			const root = project();
			writeDesignFile(root, "shared/tokens.css", `${tokens}\n${rule}`);
			writeDesignFile(
				root,
				"frames/first/frame.tsx",
				'export default function Frame(){return <p className="p-4 compete">Same pixels</p>}',
			);
			const mounted = await mount(browser, root, "first");
			const result = await read(mounted, await select(mounted, "p"), {
				kind: "property",
				property: "padding-top",
				scope: "",
			});
			expect(result.kind).toBe("refused");
			findings.push({ rule, result });
			await mounted.page.close();
		}
		const mounted = await mount(browser, project(), "first");
		const pick = await select(mounted, "h1");
		await mounted.page.addStyleTag({ content: "h1 { padding:16px }" });
		expect((await read(mounted, pick, { kind: "property", property: "padding-top", scope: "" })).kind).toBe(
			"refused",
		);
		evidence.cssCompetition = findings;
		await mounted.page.close();
	});

	it("retains imported stylesheet bytes and refuses CSSOM edits or changed import resolution", async () => {
		const root = project();
		writeDesignFile(root, "shared/tokens.css", `@import './palette.css';\n${tokens}`);
		writeDesignFile(root, "shared/palette.css", ":root { --extra: red }");
		const mounted = await mount(browser, root, "first");
		const pick = await select(mounted, "h1");
		const before = supported(await read(mounted, pick, { kind: "property", property: "padding-top", scope: "" }));
		expect(before.proof.revisions.some((r) => r.path === "shared/palette.css")).toBe(true);
		await mounted.page.evaluate(() => document.styleSheets[0]!.insertRule("h1 { padding: 16px }"));
		const cssom = await read(mounted, pick, { kind: "property", property: "padding-top", scope: "" });
		expect(cssom.kind).toBe("refused");
		writeDesignFile(root, "shared/palette.css", ":root { --extra: blue }");
		expect(await stillSelected(mounted, pick)).toBe(false);
		const candidateRoot = project();
		writeDesignFile(
			candidateRoot,
			"frames/first/frame.tsx",
			'import { Button } from "../../custom/fallback"; export default function Frame() { return <main><Button label="Index" /></main>; }',
		);
		writeDesignFile(candidateRoot, "custom/fallback/index.tsx", button);
		const fallback = await mount(browser, candidateRoot, "first");
		const label = await select(fallback, "span");
		supported(await read(fallback, label, { kind: "text" }));
		writeDesignFile(candidateRoot, "custom/fallback.tsx", button);
		expect(await stillSelected(fallback, label)).toBe(false);
		evidence.importedDependencies = {
			cssom,
			stylesheet: "shared/palette.css",
			newHigherPriorityImportInvalidates: true,
		};
		await mounted.page.close();
		await fallback.page.close();
	});

	it("preserves class expressions, spreads and token definitions and refuses arbitrary property names", async () => {
		const root = project();
		writeDesignFile(
			root,
			"frames/first/frame.tsx",
			'export default function Frame(){ const value="p-4"; const attrs={className:"p-4"}; return <main><p id="expression" className={value}>Expression</p><p id="spread" {...attrs}>Spread</p><p id="literal" className="text-brand">Literal</p></main> }',
		);
		const mounted = await mount(browser, root, "first");
		const before = readFileSync(join(root, "design/shared/tokens.css"), "utf8");
		for (const selector of ["#expression", "#spread"])
			expect(
				(
					await read(mounted, await select(mounted, selector), {
						kind: "property",
						property: "padding-top",
						scope: "",
					})
				).kind,
			).toBe("refused");
		expect(
			(await read(mounted, await select(mounted, "#literal"), { kind: "property", property: "invented", scope: "" }))
				.kind,
		).toBe("refused");
		const token = supported(
			await read(mounted, await select(mounted, "#literal"), { kind: "property", property: "color", scope: "" }),
		);
		expect(token.property?.reference).toBe("--brand");
		expect(readFileSync(join(root, "design/shared/tokens.css"), "utf8")).toBe(before);
		evidence.preservation = { expressions: "refused without mutation", tokenDefinitionUnchanged: true, token };
		await mounted.page.close();
	});

	it("measures wrapper composition compatibility and refuses unproven mounted ancestry", async () => {
		const root = project();
		writeDesignFile(
			root,
			"frames/first/frame.tsx",
			`import {useRef, useEffect, memo, forwardRef, cloneElement} from 'react'; import {createPortal} from 'react-dom';
function Plain({label,ref}) { return <button ref={ref}>{label}</button>; }
const Memo = memo(Plain); const Forward = forwardRef(function Forward({label},ref){return <button ref={ref}>{label}</button>});
function Slot({children}) { return cloneElement(children,{label:'Cloned'}); }
export default function Frame(){ const ref=useRef(null); useEffect(()=>{document.body.dataset.ref=ref.current?.tagName},[]); return <main><Plain ref={ref} label="Ref"/><Memo label="Memo"/><Forward label="Forward"/><Slot><Plain label="Original"/></Slot>{createPortal(<Plain label="Portal"/>,document.getElementById('portal'))}</main>; }`,
		);
		const plain = await mount(browser, root, "first", false);
		const instrumented = await mount(browser, root, "first");
		expect(await instrumented.page.locator("body").getAttribute("data-ref")).toBe("BUTTON");
		const normalLabels = await plain.page.locator("button").allTextContents();
		const probeLabels = await instrumented.page.locator("button").allTextContents();
		expect(normalLabels).toContain("Cloned");
		expect(probeLabels).toContain("Original");
		const memo = await read(instrumented, await select(instrumented, "main > button:nth-of-type(2)"), {
			kind: "text",
		});
		const forward = await read(instrumented, await select(instrumented, "main > button:nth-of-type(3)"), {
			kind: "text",
		});
		expect(memo.kind).toBe("refused");
		expect(forward.kind).toBe("refused");
		evidence.instrumentation = {
			ref: "BUTTON",
			normalLabels,
			probeLabels,
			cloneElement: "counterexample: wrapper changes element props/type semantics; cannot ship as-is",
			memo,
			forward,
			classLazySuspenseTransitions: "not executed; unsupported pending instrumentation proof",
		};
		await plain.page.close();
		await instrumented.page.close();
	});
});
