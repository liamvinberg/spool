import { expect, it } from "vitest";
import { apiRequests, handCanvas } from "./hand-browser-helpers";

/**
 * Deleting, on a real landing page (#317).
 *
 * The fixture is the shaders project's still page with its shared page parts
 * and its shader surface. A person selects an element and presses ⌫; what
 * they see is the frame and what the file says is the file, and nothing in
 * between is asserted.
 */

const UTILS = `export function cn(...inputs: (string | false | null | undefined)[]) {
  return inputs.filter(Boolean).join(" ");
}
`;

const PAGES_CSS = `.landing { font-family: system-ui, sans-serif; color: #1a1a1a; background: #f5f2ee; padding: 24px; }
.nav { display: flex; gap: 16px; align-items: center; font-size: 14px; }
.nav nav { display: flex; gap: 14px; }
.nav a { color: inherit; text-decoration: none; }
h1 { font-size: 40px; line-height: 1.05; margin: 24px 0 12px; font-weight: 500; }
h3 { font-size: 16px; margin: 12px 0 4px; }
p { font-size: 15px; line-height: 1.4; margin: 0 0 10px; }
.serif { font-family: Georgia, serif; }
.action { display: inline-flex; gap: 6px; align-items: center; }
.shader-surface { height: 90px; background: #b9a6c9; margin: 12px 0; }
.page-footer { display: flex; gap: 20px; font-size: 13px; margin-top: 18px; }
`;

/** `shared/ui/page-parts.tsx` as the shaders project writes it. */
const PAGE_PARTS = `import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import './pages.css';

export function Link({ children, href = '#details', className }: { children: ReactNode; href?: string; className?: string }) {
  return <a className={cn('action', className)} href={href}>{children}</a>;
}

export function Footer({ name, note }: { name: string; note: string }) {
  return <footer className="page-footer"><a href="#top">{name}</a><span>{note}</span></footer>;
}
`;

/** The shared surface, standing in for the WebGL one: an element that is all of its component. */
const SHADER = `import { cn } from '../lib/utils';

export function Shader({ effect, className, label }: { effect: string; className?: string; label: string }) {
  return <div className={cn('shader-surface', className)} data-effect={effect} aria-label={label} />;
}
`;

/** The still page: the paragraph beside an h3, a `Link` call and a `Shader` call. */
const STILL = `import { Footer, Link } from '../../shared/ui/page-parts';
import { Shader } from '../../shared/ui/shader';

const url = '#practice';

export default function Still() {
  return <main className="landing still" id="top">
    <header className="nav"><a className="brand" href="#top">still.</a><nav aria-label="Main"><a className="optional" href="#details">Our philosophy</a></nav></header>
    <section className="still-copy"><h1 className="serif">A little less<br/>noise.</h1><Link className="solid" href="#practice">Take a moment</Link><Shader className="still-orb" effect="pearl" label="A softly breathing pearl"/></section>
    <section className="still-detail" id="details"><h3>Start with one breath.</h3><p>Let your shoulders fall. Take a slow breath in, then a longer breath out.</p><a className="computed" href={url}>Take a moment</a></section>
    <Footer name="still." note="Room for a slower rhythm."/>
  </main>;
}
`;

const FILES = {
	"shared/lib/utils.ts": UTILS,
	"shared/ui/pages.css": PAGES_CSS,
	"shared/ui/page-parts.tsx": PAGE_PARTS,
	"shared/ui/shader.tsx": SHADER,
};

it("deletes on the still page", { timeout: 240_000 }, async () => {
	const f = await handCanvas(FILES, STILL, { w: 900, h: 700 });
	const { page, frame } = f;
	// File bytes and DOM previews can arrive before the save enters Undo history.
	const write = async (action: () => Promise<unknown>) => {
		const response = page.waitForResponse((answer) => answer.url().endsWith("/element"));
		await action();
		await (await response).finished();
	};
	const requests = apiRequests(page, f.project.name);
	const says = (snippet: string, there = true) =>
		expect.poll(() => f.bytes().includes(snippet), { timeout: 15_000 }).toBe(there);
	const shows = (selector: string, count: number) =>
		expect.poll(() => frame.locator(selector).count(), { timeout: 15_000 }).toBe(count);
	/**
	 * Hold one element the way a person does, then wait for the canvas to go
	 * quiet: the write is measured against the read of this very rung, and that
	 * read is the last thing a selection sends.
	 */
	const hold = async (selector: string) => {
		const held = await f.select(selector);
		await requests.quiet();
		return held;
	};

	// the paragraph beside the h3: an unkeyed sibling, out of the frame and out
	// of the line, and back again on ⌘Z
	await hold("#details p");
	await write(() => page.keyboard.press("Backspace"));
	await says("Let your shoulders fall", false);
	await shows("#details p", 0);
	await says('<h3>Start with one breath.</h3><a className="computed"');
	await f.history();
	await says("Let your shoulders fall");
	await shows("#details p", 1);

	// a `Link` call: the `<a>` it renders is all of a component in another file,
	// so ⌫ refuses, names the file that component is written in, and offers the
	// call instead — which is the delete that can honestly land
	await hold("a.solid");
	await write(() => page.keyboard.press("Backspace"));
	const instead = page.locator("[data-hand-instead]");
	await expect.poll(() => instead.count(), { timeout: 15_000 }).toBe(1);
	expect(await page.locator("[data-hand-refusal] [data-hand-file]").getAttribute("data-hand-file")).toContain(
		"design/shared/ui/page-parts.tsx",
	);
	await says('<Link className="solid"');
	await shows("a.solid", 1);
	await write(() => instead.click());
	await says('<Link className="solid"', false);
	await shows("a.solid", 0);
	expect(f.bytes("shared/ui/page-parts.tsx")).toBe(PAGE_PARTS);

	// the `Shader` call, the same way
	await hold(".shader-surface");
	await write(() => page.keyboard.press("Backspace"));
	await expect.poll(() => instead.count(), { timeout: 15_000 }).toBe(1);
	await write(() => instead.click());
	await says("<Shader", false);
	await shows(".shader-surface", 0);
	expect(f.bytes("shared/ui/shader.tsx")).toBe(SHADER);
	await f.history();
	await says("<Shader");
	await shows(".shader-surface", 1);
	requests.stop();
});
