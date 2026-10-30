import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

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
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "one", tall);
	writeDesignFile(project.root, "frames/one/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 700 }\n');
	writeFrame(project.root, "two", plain("two"));
	writeDesignFile(project.root, "frames/two/frame.json", '{ "x": 900, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);
	return project;
}

it("opens a tab whose page is a real document, and walks the URL with it", { timeout: 180_000 }, async () => {
	const browser = await testBrowser();
	const project = await canvasWithFrames();
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const canvas = await context.newPage();
	await canvas.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	await canvas.locator('[role="application"]').click({ position: { x: 300, y: 300 } });
	const opened = context.waitForEvent("page");
	await canvas.keyboard.press("p");
	const played = await opened;
	// a noopener tab has no opener for Playwright to wait on, so it can hand the
	// page over still on about:blank: the address is waited on, not read once
	await expect.poll(() => new URL(played.url()).pathname, { timeout: 30_000 }).toBe(`/play/${project.name}`);
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
	const closed = played.waitForEvent("close", { timeout: 10_000 });
	// Closing this tab is the action's completion; it cannot wait for a
	// navigation epilogue in the document that the real click destroys.
	await Promise.all([played.locator("#spool-close").click({ noWaitAfter: true }), closed]);
	expect(played.isClosed()).toBe(true);
	expect(context.pages()).toEqual([canvas]);
	expect(await canvas.locator('[role="application"]').count()).toBe(1);
	expect(await canvas.evaluate(() => location.pathname)).toBe(`/p/${project.name}`);
});

it("wears the bar for good, and says the window's size only while it is resized", {
	timeout: 180_000,
}, async () => {
	const browser = await testBrowser();
	const project = await canvasWithFrames();
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const played = await context.newPage();
	await played.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=one`);
	await expect.poll(() => played.locator(".spool-screen").count(), { timeout: 30_000 }).toBe(1);

	// worn: the name is readable without asking, and the page sits under it
	await expect.poll(() => played.locator(".spool-bar-name").innerText()).toBe("one");
	expect(await played.locator(".spool-page.has-bar").count()).toBe(1);
	// and there is nothing on it that puts it away, or a trace left to find it by
	for (const gone of ["#spool-bar-eye", "#spool-switcher", ".spool-nub"]) {
		expect(await played.locator(gone).count(), gone).toBe(0);
	}

	// a still window says nothing about its size
	const size = played.locator(".spool-bar-size");
	expect(await size.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
	// a resize says it, at the new size, and it goes once the window settles
	await played.setViewportSize({ width: 1100, height: 800 });
	await expect.poll(() => size.evaluate((el) => el.classList.contains("is-on")), { timeout: 5_000 }).toBe(true);
	expect(await size.innerText()).toBe("1100 × 800");
	await expect.poll(() => size.evaluate((el) => el.classList.contains("is-on")), { timeout: 5_000 }).toBe(false);

	// close names its key in a tooltip rather than on the bar
	await played.locator("#spool-close").hover();
	const tip = played.locator("#spool-close + .spool-bar-tip");
	await expect.poll(() => tip.evaluate((el) => getComputedStyle(el).opacity), { timeout: 5_000 }).toBe("1");
	expect(await tip.locator("kbd").innerText()).toMatch(/w$/);
});

it("opens on the page's dark, winds the mark through a long wait, and dissolves into the frame", {
	timeout: 180_000,
}, async () => {
	const browser = await testBrowser();
	const project = await canvasWithFrames();
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	// the player document held back, as a cold compile holds it
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await context.route(
		(url) => url.pathname === `/play/${project.name}` && url.searchParams.get("shell") === "1",
		async (route) => {
			await held;
			await route.continue();
		},
	);
	const played = await context.newPage();
	await played.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=one`);

	const arrival = played.locator(".spool-arrival");
	await expect.poll(() => arrival.count(), { timeout: 30_000 }).toBe(1);
	// the screen is white for the frame's sake, and none of it shows while waiting
	expect(await arrival.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(14, 14, 14)");
	expect(await arrival.evaluate((el) => getComputedStyle(el).visibility)).toBe("visible");
	expect(await arrival.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
	// a wait that long says so
	await expect
		.poll(() => played.locator(".spool-arrival-mark").evaluate((el) => Number(getComputedStyle(el).opacity)), {
			timeout: 5_000,
		})
		.toBe(1);

	release();
	await played.waitForFunction(
		() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1",
		undefined,
		{ timeout: 30_000 },
	);
	await expect
		.poll(() => arrival.evaluate((el) => getComputedStyle(el).visibility), { timeout: 5_000 })
		.toBe("hidden");
});
