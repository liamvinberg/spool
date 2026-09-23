import { expect, it, onTestFinished } from "vitest";
import { sseReader } from "../test-helpers";
import { apiRequests, handCanvas } from "./hand-browser-helpers";

/**
 * Shared components, edited from one frame and shown in every frame (#318).
 *
 * The fixture is the shaders project's shape: one surface component in
 * `shared/ui/`, rendered by three frames, two of them on screen and one far
 * off it, plus a button that takes its label from the call. A person selects
 * the surface in one frame, reads how far an edit reaches, changes its radius
 * and its own words, edits a label, and undoes. What they see is the frames
 * and what the file says is the file.
 */

const UTILS = `export function cn(...inputs: (string | false | null | undefined)[]) {
  return inputs.filter(Boolean).join(" ");
}
`;

const PAGES_CSS = `.landing { font-family: system-ui, sans-serif; color: #1a1a1a; background: #f5f2ee; padding: 24px; }
.surface { height: 160px; background: #c96a3c; color: #fff; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.surface-label { font-size: 15px; }
.surface-note { font-size: 12px; opacity: 0.8; }
.action { margin-top: 16px; font: inherit; padding: 8px 14px; border: 1px solid currentColor; background: none; }
`;

/** `shared/ui/surface.tsx`: the shader's surface, and a button whose label the call supplies. */
const SURFACE = `import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import './pages.css';

export function Surface({ effect, className, label }: { effect: string; className?: string; label: string }) {
  return <div className={cn('surface rounded-md', className)} data-effect={effect}>
    <span className="surface-label">{label}</span>
    <em className="surface-note">Rendered live</em>
  </div>;
}

export function Button({ children, className }: { children: ReactNode; className?: string }) {
  return <button type="button" className={cn('action', className)}>{children}</button>;
}
`;

const page = (
	name: string,
	effect: string,
	label: string,
	action: string,
) => `import { Button, Surface } from '../../shared/ui/surface';

export default function ${name}() {
  return <main className="landing">
    <Surface effect="${effect}" label="${label}" />
    <Button className="bordered">${action}</Button>
  </main>;
}
`;

const HOME = page("Veil", "silk", "Slow folds of copper silk", "Explore the studio");
const SECOND = page("Still", "pearl", "A softly breathing pearl", "Take a moment");
const FAR = page("Phase", "haze", "Dust drifting through a beam", "See the work");

const SIZE = { w: 500, h: 420 };

const FILES = {
	"shared/lib/utils.ts": UTILS,
	"shared/ui/pages.css": PAGES_CSS,
	"shared/ui/surface.tsx": SURFACE,
	"frames/second/frame.tsx": SECOND,
	"frames/second/frame.json": JSON.stringify({ x: 540, y: 0, ...SIZE }),
	"frames/far/frame.tsx": FAR,
	"frames/far/frame.json": JSON.stringify({ x: 5000, y: 0, ...SIZE }),
};

it("edits a shared component from one frame and every frame follows", { timeout: 240_000 }, async () => {
	const f = await handCanvas(FILES, HOME, SIZE);
	const { page, frame } = f;
	const second = page.frameLocator('iframe[title="second"]');
	await expect.poll(() => second.locator("div.surface").count(), { timeout: 30_000 }).toBe(1);
	const requests = apiRequests(page, f.project.name);
	const rail = page.locator("[data-properties-rail]");
	const row = (name: string) => page.locator(`[data-properties-row="${name}"]`);
	const field = (name: string) => row(name).locator("input").first();
	const radius = (where: typeof frame) =>
		where
			.locator("div.surface")
			.first()
			.evaluate((el) => getComputedStyle(el).borderRadius);
	const note = (where: typeof frame) => where.locator("em.surface-note").first().textContent();
	const marked = (where: typeof frame, name: string) =>
		where
			.locator("body")
			.evaluate((body, key) => Reflect.get(body.ownerDocument.defaultView ?? {}, key) === true, name);
	const mark = (where: typeof frame, name: string) =>
		where.locator("body").evaluate((body, key) => {
			const view = body.ownerDocument.defaultView;
			if (view !== null) Reflect.set(view, key, true);
		}, name);
	const fileHas = (path: string, snippet: string) =>
		expect.poll(() => f.bytes(path).includes(snippet), { timeout: 15_000 }).toBe(true);
	const selected = async () => {
		const response = await fetch(`${f.project.url}/api/p/${f.project.name}/selection`, {
			headers: { "X-Spool-Control": f.project.controlToken },
		});
		return ((await response.json()) as { selection?: unknown[] }).selection?.length ?? 0;
	};
	/** Let go, on the empty field below both frames. */
	const deselect = async () => {
		await page.mouse.click(300, 700);
		await expect.poll(selected, { timeout: 30_000 }).toBe(0);
	};
	/** Enter ends the field; the write is in the file before this returns. */
	const commit = async (route: string) => {
		const answered = page.waitForResponse((response) => response.url().endsWith(route));
		const reread = page.waitForResponse((response) => response.url().endsWith("/rungs"));
		await page.keyboard.press("Enter");
		await answered;
		await reread;
	};
	/**
	 * The change stream the canvas reads, so the case waits on the watcher's
	 * echo the canvas is being told about rather than on a guess at its pace.
	 */
	const controller = new AbortController();
	onTestFinished(() => controller.abort());
	const events = sseReader(
		await fetch(`${f.project.url}/api/p/${encodeURIComponent(f.project.name)}/events`, {
			headers: { "X-Spool-Control": f.project.controlToken },
			signal: controller.signal,
		}),
	);
	const sharedEcho = () =>
		expect
			.poll(
				async () => {
					const event = await events.next(15_000);
					return event.event === "change" && (event.data as { kind?: string }).kind === "shared";
				},
				{ timeout: 30_000 },
			)
			.toBe(true);
	/**
	 * How the second frame's document was swapped: at the moment the new one
	 * appears the old one has to still be on screen in front of it, and no
	 * cover may stand in at any point — that is the blank paint the hold
	 * exists to prevent.
	 */
	const watchSwaps = () =>
		page.evaluate(() => {
			const live = document.querySelector('iframe[title="second"]');
			const shell = live?.parentElement?.parentElement;
			if (!(live instanceof HTMLIFrameElement) || !shell) throw new Error("no second frame on the field");
			const log = { swaps: 0, heldAtSwap: 0, covered: false, blank: false };
			Reflect.set(window, "__swaps", log);
			let src = live.src;
			new MutationObserver(() => {
				const now = shell.querySelector('iframe[title="second"]');
				const held = shell.querySelector('iframe[title="second (held)"]');
				if (shell.querySelector('[data-frame-cover="second"]') !== null) log.covered = true;
				if (now === null && held === null) log.blank = true;
				if (now instanceof HTMLIFrameElement && now.src !== src) {
					src = now.src;
					log.swaps += 1;
					if (held !== null) log.heldAtSwap += 1;
				}
			}).observe(shell, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "title"] });
		});
	const swaps = () =>
		page.evaluate(
			() =>
				Reflect.get(window, "__swaps") as { swaps: number; heldAtSwap: number; covered: boolean; blank: boolean },
		);
	const settledSwap = async (expected: number) => {
		await expect.poll(async () => (await swaps()).swaps, { timeout: 30_000 }).toBe(expected);
		// the held document lets go onto the arrived one
		await expect.poll(() => page.locator('iframe[title="second (held)"]').count(), { timeout: 15_000 }).toBe(0);
		expect(await swaps()).toEqual({ swaps: expected, heldAtSwap: expected, covered: false, blank: false });
	};

	// selecting the surface names its file and how far an edit reaches
	await f.select("div.surface");
	const shared = rail.locator("[data-properties-shared]");
	await expect.poll(() => shared.textContent(), { timeout: 15_000 }).toContain("used in 3 frames");
	expect(await shared.textContent()).toContain("surface.tsx");
	await expect.poll(() => field("border-radius").count()).toBe(1);

	// the radius from this frame: one write, to the shared file
	await mark(frame, "sameDocument");
	await mark(second, "otherDocument");
	await watchSwaps();
	await requests.quiet();
	await field("border-radius").fill("12px");
	await expect.poll(() => radius(frame)).toBe("12px");
	await commit("/class");
	expect(f.bytes("shared/ui/surface.tsx")).toContain("cn('surface rounded-[12px]', className)");
	expect(f.bytes()).toBe(HOME);
	expect(f.bytes("frames/second/frame.tsx")).toBe(SECOND);
	const written = requests.taken().filter((sent) => sent.startsWith("POST") && !sent.endsWith("/selection"));
	expect(written.filter((sent) => sent.endsWith("/class"))).toHaveLength(1);
	expect(written.filter((sent) => sent.endsWith("/text") || sent.endsWith("/revert"))).toEqual([]);

	// the other mounted frame reloads behind its held paint, and shows the change
	await sharedEcho();
	await settledSwap(1);
	await expect.poll(() => radius(second), { timeout: 15_000 }).toBe("12px");
	expect(await marked(second, "otherDocument")).toBe(false);
	// the edited frame is the same document, showing the change it already made
	expect(await marked(frame, "sameDocument")).toBe(true);
	expect(await radius(frame)).toBe("12px");

	// the far frame, off screen, comes up showing the change when it mounts
	await page.mouse.move(300, 300);
	await page.mouse.wheel(4900, 0);
	const far = page.frameLocator('iframe[title="far"]');
	await expect.poll(() => far.locator("div.surface").count(), { timeout: 30_000 }).toBe(1);
	await expect.poll(() => radius(far), { timeout: 15_000 }).toBe("12px");
	await page.mouse.wheel(-4900, 0);
	await expect.poll(() => frame.locator("div.surface").count(), { timeout: 30_000 }).toBe(1);

	// letting go is when the edited frame reloads, behind its own paint
	await deselect();
	await expect.poll(() => marked(frame, "sameDocument"), { timeout: 15_000 }).toBe(false);
	await expect.poll(() => radius(frame), { timeout: 15_000 }).toBe("12px");

	// a label supplied at the call edits that call alone: the frame's own file,
	// the definition untouched, the other frames' labels their own
	await mark(frame, "labelDocument");
	const button = await f.select("button.action");
	await page.mouse.click(button.at.x, button.at.y);
	await expect.poll(() => frame.locator("button.action").getAttribute("contenteditable")).toBe("plaintext-only");
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.type("Explore the work");
	await commit("/text");
	await fileHas("frames/home/frame.tsx", '<Button className="bordered">Explore the work</Button>');
	expect(f.bytes("shared/ui/surface.tsx")).toContain("cn('surface rounded-[12px]', className)");
	expect(f.bytes("frames/second/frame.tsx")).toBe(SECOND);
	expect(await second.locator("button.action").textContent()).toBe("Take a moment");
	await deselect();
	await expect.poll(() => marked(frame, "labelDocument"), { timeout: 15_000 }).toBe(false);

	// the definition's own words edit every frame
	await mark(frame, "sameDocument");
	await watchSwaps();
	const words = await f.select("em.surface-note");
	await page.mouse.click(words.at.x, words.at.y);
	await expect.poll(() => frame.locator("em.surface-note").getAttribute("contenteditable")).toBe("plaintext-only");
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.type("Rendered together");
	await commit("/text");
	await fileHas("shared/ui/surface.tsx", '<em className="surface-note">Rendered together</em>');
	expect(f.bytes()).toContain("Explore the work");
	await sharedEcho();
	await settledSwap(1);
	await expect.poll(() => note(second), { timeout: 15_000 }).toBe("Rendered together");
	expect(await marked(frame, "sameDocument")).toBe(true);
	expect(await note(frame)).toBe("Rendered together");

	// undo puts the shared file back, and every frame that renders it
	await f.history();
	await fileHas("shared/ui/surface.tsx", '<em className="surface-note">Rendered live</em>');
	await expect.poll(() => note(frame), { timeout: 15_000 }).toBe("Rendered live");
	await sharedEcho();
	await settledSwap(2);
	await expect.poll(() => note(second), { timeout: 15_000 }).toBe("Rendered live");
	// the label, then the radius: the shared file is byte for byte what it was
	await f.history();
	await fileHas("frames/home/frame.tsx", "Explore the studio");
	await f.history();
	await expect.poll(() => f.bytes("shared/ui/surface.tsx"), { timeout: 15_000 }).toBe(SURFACE);
	expect(f.bytes()).toBe(HOME);
	await sharedEcho();
	await settledSwap(3);
	await expect.poll(() => radius(second), { timeout: 15_000 }).toBe("6px");
	await expect.poll(() => radius(frame), { timeout: 15_000 }).toBe("6px");
	requests.stop();
});
