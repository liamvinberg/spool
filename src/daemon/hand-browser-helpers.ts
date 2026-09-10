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
