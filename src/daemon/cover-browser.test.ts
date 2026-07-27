import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { coverRungWidth, coverSizes } from "../cover";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * Which rung a real browser takes, and which one the canvas asks it for (#111).
 * The canvas is the only realm that can see the camera — the zoom is a CSS
 * transform, and `srcset` resolves against layout size — so it computes `sizes`
 * itself and quantizes it to the rung boundaries. This needs a browser because
 * the sharp-at-100% bar is met or missed inside an engine, not inside the
 * arithmetic: a frame covers itself, and Chromium resolves what it is handed.
 */

const FRAME_W = 390;
const FRAME_H = 844;
const DPR = 2;

/** A real 1×1 JPEG: the store identifies a rung by its magic bytes. */
const JPEG_1X1 = Uint8Array.from(
	Buffer.from(
		"/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
		"base64",
	),
);

const frameTsx = `export default function Frame() {
	return <main style={{ background: "#f5391a", width: "100%", height: "100vh" }}>cover me</main>;
}
`;

async function launchBrowser(): Promise<Browser | undefined> {
	try {
		return await chromium.launch({ channel: "chromium", headless: true });
	} catch {
		try {
			return await chromium.launch({ headless: true });
		} catch {
			// no playwright-managed build on this machine (#25 fetches it)
			return undefined;
		}
	}
}

it("takes the rung the zoom asks for, at the ratio the display has", { timeout: 120_000 }, async () => {
	const browser = await launchBrowser();
	if (browser === undefined) return;
	onTestFinished(() => browser.close());

	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "covered", frameTsx);
	writeDesignFile(
		project.root,
		"frames/covered/frame.json",
		`${JSON.stringify({ x: 0, y: 0, w: FRAME_W, h: FRAME_H })}\n`,
	);
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const control = { "content-type": "application/json", "X-Spool-Control": project.controlToken };
	const opened = await fetch(`${project.url}/api/session`, {
		method: "PUT",
		headers: control,
		body: JSON.stringify({ root: project.root, open: true }),
	});
	expect(opened.status).toBe(204);

	const canvas = `${project.url}/p/${encodeURIComponent(project.name)}`;
	const camera = async (k: number): Promise<void> => {
		const res = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/state`, {
			method: "PUT",
			headers: control,
			body: JSON.stringify({ camera: { x: 40, y: 40, k } }),
		});
		expect(res.status).toBe(204);
	};

	/**
	 * Give the frame its ladder outright. Which rung a browser resolves turns on
	 * the declared width in `srcset`, never on the bytes behind it, so a 1×1 per
	 * rung is the whole of what this test needs — what a self-capture actually
	 * rasterizes is `capture-browser.test.ts`'s claim, and what a heal writes is
	 * `thumbs.test.ts`'s. Keeping them apart is what makes this one deterministic:
	 * it never waits on a capture racing a hundred other test files for a core.
	 */
	const store = async (widths: readonly number[]): Promise<void> => {
		const body = new FormData();
		for (const width of widths) body.append(`w${width}`, new Blob([JPEG_1X1], { type: "image/jpeg" }));
		const res = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/thumbs/covered`, {
			method: "PUT",
			headers: { "X-Spool-Control": project.controlToken },
			body,
		});
		expect(res.status).toBe(200);
	};

	/**
	 * The frame's own cover on the canvas: the still that stands in for the
	 * document, and with #112 the only thing on the canvas that ever draws this
	 * frame. Named by the shell's own cover layer because the shell shows home for
	 * a moment on the way here, and a home card's cover of the same frame carries
	 * the same alt text and a slot width of its own.
	 */
	const cover = (page: Page) => page.locator('[data-frame-cover="covered"] img');
	const resolved = (page: Page) =>
		cover(page).evaluate((element) => Number((element as HTMLImageElement).currentSrc.split("/").pop()));

	// dpr 2 is the bar's own condition: a cover's top rung is the frame's long
	// edge doubled, so 100% zoom on a retina canvas is exactly where it is spent
	const open = async (): Promise<{ page: Page; close: () => Promise<void> }> => {
		const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: DPR });
		onTestFinished(() => context.close());
		const page = await context.newPage();
		await page.goto(canvas);
		await cover(page).waitFor({ state: "attached", timeout: 30_000 });
		return { page, close: () => context.close() };
	};

	const rungs = [0, 1, 2].map((index) => coverRungWidth(FRAME_W, FRAME_H, index));
	await store(rungs);
	await camera(1);
	const { page: full, close: closeFull } = await open();

	// At 100% on a 2× display the canvas asks for the top rung and the browser
	// resolves it: the sharpest a cover is ever asked to be, because past 100%
	// you go inside.
	await expect
		.poll(() => cover(full).getAttribute("sizes"), { timeout: 20_000 })
		.toBe(coverSizes(rungs, FRAME_W, 1, DPR));
	await expect.poll(() => resolved(full), { timeout: 20_000 }).toBe(rungs[0]);

	// Pulled back to a quarter, the same ladder is asked for at a quarter of the
	// width — which is the whole of the overview's bitmap saving. What a browser
	// does with that is its own business: one already holding a sharper rung is
	// entitled to keep it rather than fetch down, and that upgrade in place is
	// half of why the ladder is handed over as `srcset` rather than picked here.
	// an open canvas persists its own camera, so this one goes before the next is
	// set — or the zoom under test loses to the one that was just being looked at
	await closeFull();
	await camera(0.25);
	const { page: overview } = await open();
	await expect
		.poll(() => cover(overview).getAttribute("sizes"), { timeout: 20_000 })
		.toBe(coverSizes(rungs, FRAME_W, 0.25, DPR));
});
