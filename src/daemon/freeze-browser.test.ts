import { join } from "node:path";
import { type Browser, chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * The freeze, in a real engine (#112). A held frame — the frozen selection
 * target, or the frame an open rail reads — keeps real DOM so the Select tool
 * and the rail have something to read, and stops running so it costs nothing
 * while it waits. Both halves are Chromium's, not spool's: the canvas writes
 * `content-visibility: hidden` on the frame's wrapper and the engine suspends
 * the nested document's rendering lifecycle, script and all its own frames,
 * with no cross-origin condition (#84).
 *
 * This is the test that says the shim may stay out of it. Nothing else in the
 * suite can: happy-dom implements neither the lock nor the throttling it
 * causes, and a claim about an engine has to be made against one.
 *
 * It runs in `chromium-headless-shell`, which puts the frames in the page's own
 * renderer rather than out of process — so read it as "the lock works", not as
 * a measurement. The size of what it buys was taken headed, by
 * `bench/frame-cost.ts` on 24 real frames: 41.4% idle cpu live, 37.6% under the
 * shim's cooperative freeze, and 4.1% under this lock against a 4.2% floor.
 */

const ticker = `import { useEffect } from "react";

export default function Ticker() {
	useEffect(() => {
		const probe = window as unknown as { __ticks: number };
		probe.__ticks = 0;
		const tick = () => {
			probe.__ticks++;
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}, []);
	return (
		<main id="probe">
			<button id="pick-me">pick me</button>
		</main>
	);
}
`;

async function launchBrowser(): Promise<Browser | undefined> {
	try {
		return await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	} catch {
		return undefined;
	}
}

it("stops a held frame's own time without taking its DOM away", { timeout: 180_000 }, async () => {
	const browser = await launchBrowser();
	if (browser === undefined) return;
	onTestFinished(() => browser.close());

	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "ticker", ticker);
	writeDesignFile(project.root, "frames/ticker/frame.json", '{ "x": 0, "y": 0, "w": 400, "h": 300 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 200, y: 200, k: 1 } })}\n`);
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const session = await fetch(`${project.url}/api/session`, {
		method: "PUT",
		headers: { "content-type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({ root: project.root, open: true }),
	});
	expect(session.status).toBe(204);

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	const page = await context.newPage();
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	// Select freezes what you point at, so one click is the whole of "held".
	const box = await page.locator('[data-frame-cover="ticker"]').boundingBox();
	if (box === null) throw new Error("the frame's own still is not on the canvas");
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

	await page.waitForSelector('iframe[title="ticker"]', { state: "attached", timeout: 60_000 });
	await page.frameLocator('iframe[title="ticker"]').locator("#probe").waitFor({ state: "attached", timeout: 60_000 });

	const ticks = () =>
		page
			.frameLocator('iframe[title="ticker"]')
			.locator("#probe")
			.evaluate(() => (window as unknown as { __ticks?: number }).__ticks ?? -1);
	const locked = () =>
		page
			.locator('iframe[title="ticker"]')
			.evaluate((el) => (el.parentElement as HTMLElement).style.contentVisibility === "hidden");

	// the lock waits for the boot: a document locked before it ever laid out has
	// no size to lay out into
	await expect.poll(locked, { timeout: 30_000 }).toBe(true);

	// Chromium allows exactly one frame after the lock, to unpaint what was
	// painted — after that the document's own time does not advance at all.
	const settled = await ticks();
	await page.waitForTimeout(1500);
	expect(await ticks()).toBe(settled);

	// and it is still real DOM: the Select tool's pick reaches it, with the
	// geometry the rail and the outline overlay draw from
	const picked = await page.evaluate(async () => {
		const el = document.querySelector<HTMLIFrameElement>('iframe[title="ticker"]');
		const reply = new Promise<unknown>((resolve) => {
			const on = (event: MessageEvent) => {
				const data = event.data as { spool?: string } | null;
				if (data === null || typeof data !== "object" || data.spool !== "picked") return;
				window.removeEventListener("message", on);
				resolve(data);
			};
			window.addEventListener("message", on);
			setTimeout(() => resolve(null), 10_000);
		});
		el?.contentWindow?.postMessage({ spool: "pick", x: 20, y: 20, id: 99 }, "*");
		return (await reply) as { chain?: { selector: string; rect: { w: number } }[] } | null;
	});
	expect(picked?.chain?.[0]?.selector).toBe("#probe");
	expect(picked?.chain?.[0]?.rect.w).toBeGreaterThan(0);
});
