import { join } from "node:path";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * Play in a real tab (#227). Three things only a real browser can show: that
 * the press really opens a tab, that the played page is a document the browser
 * lays out and scrolls rather than a picture spool placed, and that the edge
 * bar answers a dwell that has to cross an iframe boundary on its way in.
 */

const tall = `export default function Frame() {
	return (
		<main style={{ padding: 24 }}>
			<div id="measure">{typeof window === "undefined" ? 0 : window.innerWidth}</div>
			<button type="button" id="walk" data-go="two">to two</button>
			<div id="long" style={{ height: 4000 }} />
		</main>
	);
}
`;

const plain = (label: string) => `export default function Frame() {
	return <div>${label}</div>;
}
`;

/** A canvas with two frames of different widths, served and built, ready to be played. */
async function canvasWithFrames() {
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "one", tall);
	writeDesignFile(project.root, "frames/one/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 700 }\n');
	writeFrame(project.root, "two", plain("two"));
	writeDesignFile(project.root, "frames/two/frame.json", '{ "x": 900, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	return project;
}

it("opens a tab whose page is a real document, and walks the URL with it", { timeout: 180_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await canvasWithFrames();
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const canvas = await context.newPage();
	await canvas.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	await canvas.locator('[role="application"]').click({ position: { x: 300, y: 300 } });
	const opened = context.waitForEvent("page");
	await canvas.keyboard.press("p");
	const played = await opened;
	await played.waitForLoadState();

	expect(new URL(played.url()).pathname).toBe(`/play/${project.name}`);
	expect(new URL(played.url()).searchParams.get("frame")).toBe("one");
	// the canvas is untouched behind it: no player over it, no flight
	expect(await canvas.locator(".spool-page").count()).toBe(0);

	const screen = played.locator(".spool-screen");
	await expect.poll(() => screen.count(), { timeout: 30_000 }).toBe(1);
	// the authored width is a cap, never a scale: 800 of a 1280 window, centred
	await expect.poll(async () => (await screen.boundingBox())?.width, { timeout: 30_000 }).toBe(800);
	expect(await screen.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
	await expect.poll(() => played.title(), { timeout: 10_000 }).toBe(`one · ${project.name}`);

	// and the frame's own CSS is in charge inside it, because that box really is
	// the viewport it lays out against
	const inner = played.frameLocator("iframe");
	await expect.poll(() => inner.locator("#measure").textContent(), { timeout: 30_000 }).toBe("800");

	// the page is as tall as its content, and the browser scrolls it
	await expect
		.poll(() => inner.locator("#long").evaluate(() => document.documentElement.scrollHeight > window.innerHeight))
		.toBe(true);

	// a walk renames the tab and re-caps the page at the frame it lands on
	await inner.locator("#walk").click();
	await expect.poll(() => new URL(played.url()).searchParams.get("frame"), { timeout: 30_000 }).toBe("two");
	await expect.poll(async () => (await screen.boundingBox())?.width, { timeout: 30_000 }).toBe(390);
	await expect.poll(() => played.title(), { timeout: 10_000 }).toBe(`two · ${project.name}`);

	// and the browser's own back button walks the session back
	await played.goBack();
	await expect.poll(() => new URL(played.url()).searchParams.get("frame"), { timeout: 30_000 }).toBe("one");
	await expect.poll(async () => (await screen.boundingBox())?.width, { timeout: 30_000 }).toBe(800);

	// close really closes: the tab spool opened stays closable after a walk has
	// given it a history of its own
	await played.locator("#spool-close").click();
	await expect.poll(() => played.isClosed(), { timeout: 10_000 }).toBe(true);
});

it("wears the bar, puts it away on the eye, and peeks it back on a rest against the top edge", {
	timeout: 180_000,
}, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await canvasWithFrames();
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const played = await context.newPage();
	await played.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=one`);
	await expect.poll(() => played.locator(".spool-screen").count(), { timeout: 30_000 }).toBe(1);

	const away = () => played.locator(".spool-top.is-away").count();
	// worn by default: the name is readable without asking, and the page sits under it
	expect(await played.locator(".spool-top").count()).toBe(1);
	expect(await away()).toBe(0);
	await expect.poll(() => played.locator("#spool-switcher").innerText()).toContain("one");
	expect(await played.locator(".spool-page.has-bar").count()).toBe(1);
	expect(await played.locator(".spool-nub").count()).toBe(0);

	// the eye puts it away: the page gets the whole window, the nub is the trace
	await played.locator("#spool-bar-eye").click();
	await expect.poll(away, { timeout: 5_000 }).toBe(1);
	expect(await played.locator(".spool-page.has-bar").count()).toBe(0);
	expect(await played.locator(".spool-nub").count()).toBe(1);

	// the pointer is over the frame's own document, and nothing there peeks the bar
	await played.mouse.move(640, 450);
	await played.mouse.move(640, 600);
	await played.waitForTimeout(400);
	expect(await away()).toBe(1);

	// resting against the top edge peeks it in over the page
	await played.mouse.move(640, 2);
	await expect.poll(away, { timeout: 5_000 }).toBe(0);
	expect(await played.locator(".spool-page.has-bar").count()).toBe(0);

	// and moving back down into the page takes it away
	await played.mouse.move(640, 500);
	await expect.poll(away, { timeout: 5_000 }).toBe(1);

	// pressing the nub puts it back on, and a fresh tab remembers either way
	await played.mouse.move(640, 2);
	await expect.poll(away, { timeout: 5_000 }).toBe(0);
	await played.locator("#spool-bar-eye").click();
	await expect.poll(() => played.locator(".spool-page.has-bar").count(), { timeout: 5_000 }).toBe(1);
	await played.locator("#spool-bar-eye").click();
	await expect.poll(away, { timeout: 5_000 }).toBe(1);
	const again = await context.newPage();
	await again.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=one`);
	await expect.poll(() => again.locator(".spool-top.is-away").count(), { timeout: 30_000 }).toBe(1);
});
