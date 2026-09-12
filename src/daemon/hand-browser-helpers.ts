import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { expect } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * The one seam the hand's browser cases test through (spool-cloud#149): a
 * real project served by a real daemon, the canvas opened on it, one frame
 * mounted live, and the file bytes read back off disk. A case performs the
 * gesture a person performs and asserts what they see and what the file says.
 */
export async function handCanvas(
	files: Record<string, string>,
	frameSource: string,
	size: { w: number; h: number } = { w: 650, h: 500 },
	/** the camera when this canvas opens: a frame under `LIVE_MIN_CSS_PX` on screen is a picture, not a document */
	camera: { x: number; y: number; k: number } = { x: 60, y: 60, k: 1 },
) {
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });
	for (const [path, source] of Object.entries(files)) writeDesignFile(project.root, path, source);
	writeFrame(project.root, "home", frameSource);
	writeDesignFile(project.root, "frames/home/frame.json", JSON.stringify({ x: 0, y: 0, ...size }));
	writeDesignFile(project.root, ".spool/state.json", JSON.stringify({ camera }));
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await page.goto(`${project.url}/p/${project.name}`);
	const frame = page.frameLocator('iframe[title="home"]');
	await expect.poll(() => frame.locator("#root > *").count(), { timeout: 30_000 }).toBeGreaterThan(0);
	const file = (path: string) => join(project.root, "design", path);
	const bytes = (path = "frames/home/frame.tsx") => readFileSync(file(path), "utf8");
	/**
	 * Select one element the way a person does: the accel-click that lands on
	 * the deepest element under the pointer. The canvas has to own the frame's
	 * pointer first, and the selection is real once the daemon holds it.
	 */
	const select = async (selector: string, position?: { x: number; y: number }) => {
		const target = frame.locator(selector).first();
		await expect
			.poll(
				() => page.locator('iframe[title="home"]').evaluate((element) => getComputedStyle(element).pointerEvents),
				{ timeout: 15_000 },
			)
			.toBe("none");
		const box = await target.boundingBox();
		if (!box) throw new Error(`${selector} has no box`);
		const viewport = page.viewportSize();
		expect(
			viewport === null ||
				(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height),
			`${selector} is outside the viewport: ${JSON.stringify({ box, viewport })}`,
		).toBe(true);
		const at = position ?? { x: box.width / 2, y: box.height / 2 };
		const tag = await target.evaluate((element) => element.tagName.toLowerCase());
		const held = async () => {
			const response = await fetch(`${project.url}/api/p/${project.name}/selection`, {
				headers: { "X-Spool-Control": project.controlToken },
			});
			const body = (await response.json()) as { selection?: { selector?: string; name?: string }[] };
			return body.selection?.length === 1 ? body.selection[0] : undefined;
		};
		const before = await held();
		await target.click({ position: at, modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
		// the selection is real once the daemon holds it, and it is this one
		// rather than the last: the same tag as the element clicked, or a
		// different element than was held before the click
		await expect
			.poll(
				async () => {
					const now = await held();
					return now !== undefined && (now.name === tag || now.selector !== before?.selector);
				},
				{ timeout: 15_000 },
			)
			.toBe(true);
		return { target, box, at: { x: box.x + at.x, y: box.y + at.y } };
	};
	/** ⌘Z or ⇧⌘Z out on the canvas, which is where the one stack listens. */
	const history = async (redo = false) => {
		await page.keyboard.press(redo ? "ControlOrMeta+Shift+z" : "ControlOrMeta+z");
	};
	return { project, browser, page, frame, file, bytes, select, history };
}

/** Every request the canvas sends the daemon's API from now on, until asked. */
export function apiRequests(page: Page, project: string): { taken(): string[]; quiet(): Promise<void>; stop(): void } {
	const seen: string[] = [];
	const listener = (request: { url(): string; method(): string }) => {
		const url = request.url();
		if (url.includes(`/api/p/${project}/`)) seen.push(`${request.method()} ${new URL(url).pathname}`);
	};
	page.on("request", listener);
	const taken = () => seen.splice(0);
	return {
		taken,
		/** resolves once a whole window has passed with nothing sent, and takes what came before it */
		quiet: async () => {
			for (let tries = 0; tries < 40; tries += 1) {
				taken();
				await new Promise((resolve) => setTimeout(resolve, 250));
				if (seen.length === 0) return;
			}
			throw new Error(`the canvas never went quiet: ${seen.join(", ")}`);
		},
		stop: () => page.off("request", listener),
	};
}

/**
 * The fixture the hand's cases work on (spool-cloud#149): the shaders
 * project's veil page with its shared page parts, plus two elements copied
 * from spool's own design/ — the voice frame's `cn("…", cond && "…")` block
 * and the primitives frame's `className={MONO}` span.
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
.mark { padding: 10px 14px; background: #e6ded4; font-size: 13px; }
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
 * drag wrote, the marks row the gap a band stands over, the action its colour
 * and radius; the voice block and the mono span are design/'s own. The work
 * section is the one block with a rung between the section and its words: a
 * container holding a heading, which is what a descent has to stop on (#322).
 */
export const VEIL_PAGE = `import { cn } from '../../shared/lib/utils';
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
    <div id="marks" className="flex gap-4"><span className="mark">01</span><span className="mark">02</span></div>
    <a id="cta" className="rounded-md bg-[#c96a3c] p-3 text-white" href="#work">Explore</a>
    <section className="veil-work" id="work"><div id="details"><h2>Ideas stay<br/>with you.</h2><Link className="line" href="#projects">Selected projects</Link></div></section>
    <Footer name="veil®" note="Independent by nature. Curious by default."/>
  </main>;
}
`;

export const VEIL_FILES = {
	"shared/lib/utils.ts": UTILS,
	"shared/ui/pages.css": PAGES_CSS,
	"shared/ui/page-parts.tsx": PAGE_PARTS,
};

/**
 * The plain-CSS fixture (#323): the shape of every project whose frames are
 * styled by class rules in a `.css` file rather than by utilities.
 *
 * `olmestudios` is the one the third hand test ran on, and nothing in the veil
 * page or in spool's own design/ had this shape: a stylesheet with no `@layer`
 * in it, setting the very properties the rail draws rows for. Unlayered
 * declarations outrank every layered one, and a row reading only the class
 * literal has nothing to say about any of them.
 */
const PLAIN_CSS = `.byline { font-size: 14px; line-height: 26px; color: #333333; border-radius: 6px; padding: 12px; opacity: 0.5; }
.art { height: 60px; background: #c96a3c; margin: 0 24px; }
.intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; padding: 20px; }
.intro h1 { font-size: 48px; max-width: 420px; margin: 0; }
.intro p { max-width: 220px; font-size: 14px; padding-bottom: 10px; color: #aaa6a1; margin: 0; }
`;

/** A stylesheet that writes layers of its own, which wrapping must not disturb. */
const LAYERED_CSS = `@layer parts;
@layer parts { .note { font-size: 12px; } }
`;

export const PLAIN_FILES = { "shared/ui/plain.css": PLAIN_CSS, "shared/ui/layered.css": LAYERED_CSS };

export const PLAIN_PAGE = `import '../../shared/ui/plain.css';
import '../../shared/ui/layered.css';

export default function Page() {
  return <main id="top">
    <p className="byline">Brand & marketing.</p>
    <div className="art"></div>
    <section className="intro"><h1>Make something<br/>worth feeling.</h1><p>Independent design and digital experiences.<br/>Made with instinct.<br/>Built with intention.</p></section>
    <p className="note">A layer of its own.</p>
  </main>;
}
`;
