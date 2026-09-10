import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { apiRequests, handCanvas } from "./hand-browser-helpers";

/**
 * Editing text in the frame, on a real landing page (#314).
 *
 * The fixture is the shaders project's veil page with its shared page parts:
 * an h1 with a line break and an italic span, an h2, an intro paragraph with
 * two breaks, a nav link, a label passed to a shared `Link`, and a footer
 * note supplied as a prop. A person selects an element, clicks its words,
 * types, and leaves; what they see is the frame and what the file says is
 * the file, and nothing in between is asserted.
 */

const UTILS = `export function cn(...inputs: (string | false | null | undefined)[]) {
  return inputs.filter(Boolean).join(" ");
}
`;

const PAGES_CSS = `.landing { font-family: system-ui, sans-serif; color: #1a1a1a; background: #f5f2ee; padding: 24px; }
.nav { display: flex; gap: 16px; align-items: center; font-size: 14px; }
.nav nav { display: flex; gap: 14px; margin-left: auto; }
.nav a { color: inherit; text-decoration: none; }
h1 { font-size: 40px; line-height: 1.05; margin: 28px 0 12px; font-weight: 500; }
h2 { font-size: 28px; line-height: 1.1; margin: 20px 0 8px; font-weight: 500; }
h3 { font-size: 16px; margin: 12px 0 4px; }
p { font-size: 15px; line-height: 1.4; margin: 0 0 10px; }
.serif { font-family: Georgia, serif; }
h2 a { color: #c96a3c; }
.veil-art { height: 90px; background: #c96a3c; margin: 12px 0; }
.action { display: inline-flex; gap: 6px; align-items: center; }
.action svg { width: 14px; height: 14px; }
.page-footer { display: flex; gap: 20px; font-size: 13px; margin-top: 18px; }
`;

/** `shared/ui/page-parts.tsx` as the shaders project writes it. */
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

/** The veil page, its shader stood in for by a plain block, plus the one expression child the ticket names. */
const VEIL = `import { Arrow, Footer, Link } from '../../shared/ui/page-parts';

const title = 'Studio';

export default function Veil() {
  return <main className="landing veil" id="top">
    <header className="nav"><a className="brand" href="#top">veil®</a><nav aria-label="Main"><a className="optional-mobile" href="#work">Selected work</a><a className="optional" href="#details">Our approach</a><Link className="bordered" href="#work">Explore the studio</Link></nav></header>
    <section className="veil-intro"><h1>Make something<br/><span className="serif"><i>worth feeling.</i></span></h1><p>Independent design and digital experiences.<br/>Made with instinct.<br/>Built with intention.</p></section>
    <div className="veil-art w-[990px]"></div>
    <section className="veil-work" id="work"><div id="details"><h2>Ideas that stay<br/>with you. <a className="inline" href="#work">Read on</a></h2><Link className="line" href="#projects">Selected projects</Link></div><h3>{title}</h3></section>
    <Footer name="veil®" note="Independent by nature. Curious by default."/>
  </main>;
}
`;

const FILES = {
	"shared/lib/utils.ts": UTILS,
	"shared/ui/pages.css": PAGES_CSS,
	"shared/ui/page-parts.tsx": PAGE_PARTS,
};

it("edits the veil page's words in place and saves each once", { timeout: 240_000 }, async () => {
	const f = await handCanvas(FILES, VEIL, { w: 900, h: 700 });
	const { page, frame } = f;
	const requests = apiRequests(page, f.project.name);
	const editable = (selector: string) => frame.locator(selector).first().getAttribute("contenteditable");
	const text = (selector: string) => frame.locator(selector).first().textContent();
	const fileHas = (snippet: string) => expect.poll(() => f.bytes().includes(snippet), { timeout: 15_000 }).toBe(true);
	const open = async (selector: string, position?: { x: number; y: number }) => {
		const held = await f.select(selector, position);
		await page.mouse.click(held.at.x, held.at.y);
		await expect.poll(() => editable(selector)).toBe("plaintext-only");
		return held;
	};
	const closed = (selector: string) => expect.poll(() => editable(selector)).toBeNull();
	/**
	 * Enter ends the edit. The save it starts is in the file before the case
	 * moves on, and so is the canvas's own bookkeeping of it, which the fresh
	 * read of the rung a save causes is the last of.
	 */
	const commit = async (selector: string, saves = true) => {
		const answered = page.waitForResponse((response) => response.url().endsWith("/text"));
		const reread = saves ? page.waitForResponse((response) => response.url().endsWith("/rungs")) : undefined;
		await page.keyboard.press("Enter");
		await closed(selector);
		await answered;
		await reread;
	};

	// the h1 with a line break and an italic span: the caret lands within 50 ms
	// of the click, on the words that were clicked
	await page.evaluate(() => {
		addEventListener(
			"pointerup",
			() => Reflect.set(window, "__up", performance.timeOrigin + performance.now()),
			true,
		);
	});
	await frame.locator("h1").evaluate((h1) => {
		new MutationObserver(() => {
			if (h1.getAttribute("contenteditable") === "plaintext-only" && !Reflect.has(window, "__opened")) {
				Reflect.set(window, "__opened", performance.timeOrigin + performance.now());
			}
		}).observe(h1, { attributes: true });
	});
	await open("h1", { x: 12, y: 14 });
	const up = await page.evaluate(() => Reflect.get(window, "__up") as number);
	const opened = await frame.locator("h1").evaluate(() => Reflect.get(window, "__opened") as number);
	expect(opened - up).toBeLessThan(50);
	// typing is the frame's alone: once the click's own selection has settled,
	// no request leaves the canvas until the edit ends
	await requests.quiet();
	await page.keyboard.press("End");
	await page.keyboard.type(" & more");
	await expect.poll(() => text("h1")).toBe("Make something & moreworth feeling.");
	expect(requests.taken()).toEqual([]);
	await commit("h1");
	await fileHas('<h1>Make something &amp; more<br/><span className="serif"><i>worth feeling.</i></span></h1>');
	// the frame was not reloaded for its own save: the words it shows are the ones typed
	expect(await text("h1")).toBe("Make something & moreworth feeling.");

	// the intro paragraph sits after the h1 on the same line of the file, and
	// its stamp has moved with the save; two breaks, three runs of words
	await open("p", { x: 12, y: 8 });
	await page.keyboard.press("End");
	await page.keyboard.type(" Always.");
	await commit("p");
	await fileHas(
		"<p>Independent design and digital experiences. Always.<br/>Made with instinct.<br/>Built with intention.</p>",
	);

	// the h2, and the link standing under its words: a press on that link while
	// the heading is being edited places the caret and never follows it
	const heading = await open("h2", { x: 12, y: 10 });
	const inner = await frame.locator("h2 a").boundingBox();
	if (!inner) throw new Error("no link under the words");
	await page.mouse.click(inner.x + inner.width / 2, inner.y + inner.height / 2);
	expect(await frame.locator("body").evaluate(() => location.hash)).toBe("");
	await expect.poll(() => editable("h2")).toBe("plaintext-only");
	await page.mouse.click(heading.at.x, heading.at.y);
	await page.keyboard.press("End");
	await page.keyboard.type(" here");
	await commit("h2");
	await fileHas('<h2>Ideas that stay here<br/>with you. <a className="inline" href="#work">Read on</a></h2>');

	// the nav link: a press on its words during the edit places the caret and
	// never follows the link
	const link = await open("a.optional");
	await page.mouse.click(link.at.x, link.at.y);
	await page.keyboard.press("End");
	await page.keyboard.type("es");
	await commit("a.optional");
	await fileHas('<a className="optional" href="#details">Our approaches</a>');
	expect(await frame.locator("body").evaluate(() => location.hash)).toBe("");

	// the footer's note is supplied at the call site, and that is where it is written
	await open("footer span");
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.type('Curious & "bold".');
	await commit("footer span");
	await fileHas('<Footer name="veil®" note="Curious &amp; &quot;bold&quot;."/>');
	expect(f.bytes("shared/ui/page-parts.tsx")).toBe(PAGE_PARTS);

	// undo puts the file and the frame back without a reload; redo brings both forward
	await f.history();
	await fileHas('<Footer name="veil®" note="Independent by nature. Curious by default."/>');
	await expect.poll(() => text("footer span")).toBe("Independent by nature. Curious by default.");
	await f.history(true);
	await fileHas('<Footer name="veil®" note="Curious &amp; &quot;bold&quot;."/>');
	await expect.poll(() => text("footer span")).toBe('Curious & "bold".');

	// an expression child refuses by name, the words go back, and the agent
	// composer opens holding the attempt only on the action
	await open("h3");
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.type("Atelier");
	await commit("h3", false);
	const refusal = page.locator('[data-hand-refusal="expression-text"]');
	await expect.poll(() => refusal.count()).toBe(1);
	expect(await refusal.textContent()).toContain("{title} is an expression");
	await expect.poll(() => text("h3")).toBe("Studio");
	expect(f.bytes()).toContain("<h3>{title}</h3>");
	requests.taken();
	await refusal.locator("[data-hand-ask]").click();
	const composer = page.locator("textarea");
	await expect.poll(() => composer.inputValue()).toContain('to "Atelier"');
	expect(requests.taken().filter((sent) => sent.includes("/agent/turn"))).toEqual([]);

	// a step whose file moved underneath is dropped with a note rather than
	// written over the newer content. The field is clicked under the frame,
	// which is what puts the composer down and the one stack back on ⌘Z
	const shell = await page.locator('iframe[title="home"]').boundingBox();
	if (!shell) throw new Error("no frame on the field");
	const field = { x: shell.x + 120, y: shell.y + shell.height + 40 };
	await page.mouse.click(field.x, field.y);
	const outside = `${f.bytes()}// edited outside\n`;
	writeFileSync(f.file("frames/home/frame.tsx"), outside);
	await expect.poll(() => text("h3"), { timeout: 15_000 }).toBe("Studio");
	await page.mouse.click(field.x, field.y);
	await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe("TEXTAREA");
	await f.history();
	await expect
		.poll(() => page.locator('[role="alert"]').textContent())
		.toContain("The file changed since; this step is dropped");
	expect(f.bytes()).toBe(outside);
	requests.stop();
});
