import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { apiRequests, handCanvas } from "./hand-browser-helpers";

/**
 * Rail properties, DOM first, on a real landing page (#315).
 *
 * The fixture is the shaders project's veil page with its shared page parts,
 * plus two elements copied from spool's own design/: the voice frame's
 * `cn("…", cond && "…")` block and the primitives frame's `className={MONO}`
 * span. A person selects an element, types a value into the rail and leaves;
 * what they see is the frame and what the file says is the file.
 */

const UTILS = `export function cn(...inputs: (string | false | null | undefined)[]) {
  return inputs.filter(Boolean).join(" ");
}
`;

const PAGES_CSS = `.landing { font-family: system-ui, sans-serif; color: #1a1a1a; background: #f5f2ee; padding: 24px; }
.nav { display: flex; gap: 16px; align-items: center; font-size: 14px; }
.nav nav { display: flex; gap: 14px; margin-left: auto; }
.nav a { color: inherit; text-decoration: none; }
h1 { line-height: 1.05; margin: 28px 0 12px; font-weight: 500; }
h2 { font-size: 28px; line-height: 1.1; margin: 20px 0 8px; font-weight: 500; }
p { font-size: 15px; line-height: 1.4; margin: 0 0 10px; }
.serif { font-family: Georgia, serif; }
.veil-art { height: 90px; background: #c96a3c; margin: 12px 0; }
.action { display: inline-flex; gap: 6px; align-items: center; }
.action svg { width: 14px; height: 14px; }
.page-footer { display: flex; gap: 20px; font-size: 13px; margin-top: 18px; }
`;

const PAGE_PARTS = `import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import './pages.css';

export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h16m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function Link({ children, href = '#details', className, arrow = true }: { children: ReactNode; href?: string; className?: string; arrow?: boolean }) {
  return <a className={cn('action', className)} href={href}>{children}{arrow && <Arrow />}</a>;
}

export function Footer({ name, note }: { name: string; note: string }) {
  return <footer className="page-footer"><a href="#top">{name}</a><span>{note}</span><a href="#top">Back to top ↑</a></footer>;
}
`;

/**
 * The veil page: the h1 wears its size as a class, the art block the width a
 * drag wrote, the action its colour and radius; the voice block and the mono
 * span are design/'s own.
 */
const VEIL = `import { cn } from '../../shared/lib/utils';
import { Arrow, Footer, Link } from '../../shared/ui/page-parts';

const MONO = "font-mono text-xs";
const tone = "right";

export default function Veil() {
  return <main className="landing veil" id="top">
    <header className="nav"><a className="brand" href="#top">veil®</a><nav aria-label="Main"><a className="optional" href="#details">Our approach</a><Link className="bordered" href="#work">Explore the studio</Link></nav></header>
    <section className="veil-intro"><h1 className="text-[40px]">Make something<br/><span className="serif"><i>worth feeling.</i></span></h1><p>Independent design and digital experiences.<br/>Made with instinct.<br/>Built with intention.</p></section>
    <div className="veil-art w-[990px]"></div>
    <div id="voice" className={cn("flex flex-col gap-3 px-5 py-4", tone === "right" && "border-border border-l")}>Voice</div>
    <span id="mono" className={MONO}>canvas-chrome.tsx</span>
    <a id="cta" className="rounded-md bg-[#c96a3c] p-3 text-white" href="#work">Explore</a>
    <Footer name="veil®" note="Independent by nature. Curious by default."/>
  </main>;
}
`;

const FILES = {
	"shared/lib/utils.ts": UTILS,
	"shared/ui/pages.css": PAGES_CSS,
	"shared/ui/page-parts.tsx": PAGE_PARTS,
};

it("previews a rail value in the frame and saves one class change", { timeout: 240_000 }, async () => {
	const f = await handCanvas(FILES, VEIL, { w: 1100, h: 700 });
	const { page, frame } = f;
	const requests = apiRequests(page, f.project.name);
	const row = (name: string) => page.locator(`[data-properties-row="${name}"]`);
	const field = (name: string) => row(name).locator("input").first();
	const fileHas = (snippet: string) => expect.poll(() => f.bytes().includes(snippet), { timeout: 15_000 }).toBe(true);
	const style = (selector: string, property: string) =>
		frame
			.locator(selector)
			.first()
			.evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property);
	const inline = (selector: string, property: string) =>
		frame
			.locator(selector)
			.first()
			.evaluate((el, name) => el.style.getPropertyValue(name), property);
	const classOf = (selector: string) => frame.locator(selector).first().getAttribute("class");
	/** the moment the frame's element took the preview, against the moment the key went down out here */
	const stamped = async (selector: string) => {
		await page.evaluate(() => {
			addEventListener(
				"input",
				() => Reflect.set(window, "__typed", performance.timeOrigin + performance.now()),
				true,
			);
		});
		await frame
			.locator(selector)
			.first()
			.evaluate((el) => {
				Reflect.set(window, "__styled", 0);
				new MutationObserver(() => {
					if (!Reflect.get(window, "__styled"))
						Reflect.set(window, "__styled", performance.timeOrigin + performance.now());
				}).observe(el, { attributes: true, attributeFilter: ["style"] });
			});
	};
	const previewLag = async (selector: string) => {
		const typed = await page.evaluate(() => Reflect.get(window, "__typed") as number);
		const styled = await frame
			.locator(selector)
			.first()
			.evaluate(() => Reflect.get(window, "__styled") as number);
		return styled - typed;
	};
	/** Enter ends the field; the write is in the file before this returns, and so is the rung's fresh read. */
	const commit = async (saves = true) => {
		const answered = page.waitForResponse((response) => response.url().endsWith("/class"));
		const reread = saves ? page.waitForResponse((response) => response.url().endsWith("/rungs")) : undefined;
		const started = Date.now();
		await page.keyboard.press("Enter");
		await answered;
		const took = Date.now() - started;
		await reread;
		return took;
	};
	/** the rail has read the rung: its rows offer a gesture */
	const selectRow = async (selector: string, name: string) => {
		await f.select(selector);
		await expect.poll(() => field(name).count(), { timeout: 15_000 }).toBe(1);
	};

	// the frame is the one document throughout: nothing here reloads it
	await frame.locator("body").evaluate(() => Reflect.set(window, "sameDocument", true));
	const sameDocument = () => frame.locator("body").evaluate(() => Reflect.get(window, "sameDocument"));

	// width on the art block: `700` typed is 700px on the element before the
	// next paint, and `w-[700px]` in the file within 300 ms of Enter
	await selectRow("div.veil-art", "width");
	await stamped("div.veil-art");
	await requests.quiet();
	await field("width").fill("700");
	await expect.poll(() => style("div.veil-art", "width")).toBe("700px");
	expect(await previewLag("div.veil-art")).toBeLessThan(16);
	expect(requests.taken()).toEqual([]);
	const wrote = await commit();
	expect(wrote).toBeLessThan(300);
	expect(f.bytes()).toContain('<div className="veil-art w-[700px]"></div>');
	// the frame set the attribute, took the sheet and lifted the preview, with no reload
	await expect.poll(() => classOf("div.veil-art")).toBe("veil-art w-[700px]");
	expect(await inline("div.veil-art", "width")).toBe("");
	expect(await style("div.veil-art", "width")).toBe("700px");
	expect(await sameDocument()).toBe(true);
	// the row wears its saved mark once the file has the value, and never a "Saving…"
	await expect.poll(() => row("width").getAttribute("data-properties-saved")).toBe("");
	expect(await page.locator("[data-properties-rail]").textContent()).not.toContain("Saving");

	// undo puts the file and the element back without a reload; redo brings both forward
	await f.history();
	await fileHas('<div className="veil-art w-[990px]"></div>');
	await expect.poll(() => style("div.veil-art", "width")).toBe("990px");
	await f.history(true);
	await fileHas('<div className="veil-art w-[700px]"></div>');
	await expect.poll(() => style("div.veil-art", "width")).toBe("700px");
	expect(await sameDocument()).toBe(true);

	// padding on design/'s cn() block: the literal is edited and the condition survives
	await selectRow("#voice", "padding-inline");
	await stamped("#voice");
	await field("padding-inline").fill("32");
	await expect.poll(() => style("#voice", "padding-left")).toBe("32px");
	expect(await previewLag("#voice")).toBeLessThan(16);
	expect(await commit()).toBeLessThan(300);
	expect(f.bytes()).toContain('tone === "right" && "border-border border-l"');
	expect(f.bytes()).toMatch(/cn\("flex flex-col gap-3 (py-4 px-\[32px\]|px-\[32px\] py-4)", tone/);
	await expect.poll(() => classOf("#voice")).toContain("px-[32px]");
	expect(await classOf("#voice")).toContain("border-l");
	expect(await inline("#voice", "padding-left")).toBe("");

	// font size on the h1: a number-token row previews the raw value and spells it as a token
	await selectRow("h1", "font-size");
	await stamped("h1");
	await field("font-size").fill("44");
	await expect.poll(() => style("h1", "font-size")).toBe("44px");
	expect(await previewLag("h1")).toBeLessThan(16);
	expect(await commit()).toBeLessThan(300);
	expect(f.bytes()).toContain('<h1 className="text-[44px]">');
	await expect.poll(() => style("h1", "font-size")).toBe("44px");
	expect(await inline("h1", "font-size")).toBe("");

	// radius and colour on the action
	await selectRow("#cta", "border-radius");
	await stamped("#cta");
	// the row reads `rounded-md` in rem, so a bare number would keep that unit; pixels are typed
	await field("border-radius").fill("12px");
	await expect.poll(() => style("#cta", "border-radius")).toBe("12px");
	expect(await previewLag("#cta")).toBeLessThan(16);
	expect(await commit()).toBeLessThan(300);
	expect(f.bytes()).toMatch(/<a id="cta" className="[^"]*rounded-\[12px\][^"]*"/);
	await expect.poll(() => style("#cta", "border-radius")).toBe("12px");
	// the colour is a theme reference: unlinking it writes the value it resolves
	// to as a custom token at once, and the custom field is then the row's own
	await row("color").locator('[aria-label="Choose color"]').click();
	const unlinked = page.waitForResponse((response) => response.url().endsWith("/class"));
	const rereadColour = page.waitForResponse((response) => response.url().endsWith("/rungs"));
	await page.locator(".ep-unlink").click();
	await unlinked;
	await rereadColour;
	expect(f.bytes()).not.toContain("text-white");
	await frame
		.locator("#cta")
		.first()
		.evaluate(() => Reflect.set(window, "__styled", 0));
	await row("color").locator('[aria-label="Choose color"]').click();
	const colour = page.locator('input[aria-label="color"]');
	await colour.fill("#123456");
	await expect.poll(() => style("#cta", "color")).toBe("rgb(18, 52, 86)");
	expect(await previewLag("#cta")).toBeLessThan(16);
	expect(await commit()).toBeLessThan(300);
	expect(f.bytes()).toMatch(/<a id="cta" className="[^"]*text-\[#123456\][^"]*"/);
	expect(f.bytes()).not.toContain("text-white");
	await expect.poll(() => inline("#cta", "color")).toBe("");
	expect(await style("#cta", "color")).toBe("rgb(18, 52, 86)");
	expect(await sameDocument()).toBe(true);

	// the mono span's class is computed: the rows refuse, and the refusal
	// names the file and line with a link that hands the path out
	await f.select("#mono");
	await expect.poll(() => page.locator("[data-properties-rail]").textContent()).toContain("class is computed here");
	const link = page.locator("[data-properties-rail] [data-hand-file]");
	await expect.poll(() => link.count()).toBe(1);
	expect(await link.getAttribute("data-hand-file")).toBe("design/frames/home/frame.tsx:13");
	expect(await field("width").count()).toBe(0);
	await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	await link.click();
	await expect
		.poll(() => page.locator('[role="alert"], [role="status"]').last().textContent())
		.toContain("design/frames/home/frame.tsx:13");
	expect(await page.locator("[data-properties-rail]").textContent()).not.toContain("checking source");

	// a file that moved underneath: the write refuses, the preview comes off
	// the element, and the rung is read again
	await selectRow("div.veil-art", "width");
	const outside = `${f.bytes()}// edited outside\n`;
	writeFileSync(f.file("frames/home/frame.tsx"), outside);
	await new Promise((resolve) => setTimeout(resolve, 1500));
	await field("width").fill("500");
	await expect.poll(() => style("div.veil-art", "width")).toBe("500px");
	const refused = page.locator('[data-hand-refusal="stale-file"]');
	const reread = page.waitForResponse((response) => response.url().endsWith("/rungs"));
	await page.keyboard.press("Enter");
	await expect.poll(() => refused.count(), { timeout: 15_000 }).toBe(1);
	await reread;
	await expect.poll(() => inline("div.veil-art", "width")).toBe("");
	expect(await style("div.veil-art", "width")).toBe("700px");
	expect(f.bytes()).toBe(outside);
	expect(await sameDocument()).toBe(true);
	requests.stop();
});
