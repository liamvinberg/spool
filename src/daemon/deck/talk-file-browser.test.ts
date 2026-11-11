import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { testBrowser } from "../../test-browser";
import { COVER_PNG, makeApp, makeProject, makeTempDir, writeDesignFile } from "../../test-helpers";
import { writeCover } from "../thumbs";
import { HARD_TALK, writeHardTalk } from "./stage-browser.test-helpers";
import { TALK_HINT } from "./talk-file";

/**
 * A deck's talk exported as one HTML file (spool#275), opened the way whoever it was sent to opens it: from disk, with
 * the network off. It is the hard talk (spool#269), its pictures and face made the project's own so the file can carry
 * them, and its first two slides sharing an element that carries between them.
 */

const require = createRequire(import.meta.url);

/** The hard talk, with what it fetches from `/fixture/` moved into the project, as a file can only carry that. */
function talkProject() {
	const spoolDir = join(makeTempDir(), ".spool");
	mkdirSync(spoolDir, { recursive: true });
	writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ experimental: { deck: true } }));
	const { root, name } = makeProject(spoolDir);
	writeHardTalk(root);
	const face = readFileSync(
		require.resolve("@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2"),
	).toString("base64");
	writeDesignFile(
		root,
		"shared/fonts.css",
		`@font-face { font-family: "Hard Display"; src: url("data:font/woff2;base64,${face}") format("woff2"); font-weight: 100 900; }\n`,
	);
	writeFileSync(join(root, "design", "shared", "picture.png"), COVER_PNG);
	for (const slide of ["photo", "end"]) {
		const file = join(root, "design", "frames", "talk", slide, "frame.tsx");
		const source = readFileSync(file, "utf8").replace(/src="\/fixture\/[a-z]+\.png"/, "src={picture}");
		writeFileSync(file, `import picture from "../../../shared/picture.png";\n${source}`);
	}
	// the title's words carry over into the photo's picture, as one element
	appendFileSync(
		join(root, "design", "frames", "talk", "title", "slide.css"),
		".words { view-transition-name: hero; }\n",
	);
	appendFileSync(
		join(root, "design", "frames", "talk", "photo", "slide.css"),
		".photo { view-transition-name: hero; }\n",
	);
	writeCover(root, "talk/title", Buffer.from(COVER_PNG));
	return { root, name, app: makeApp(spoolDir) };
}

it("plays the talk from disk with the network off: every key, beats, carry, a live slide, and no error ever shown", async () => {
	const { root, name, app } = talkProject();

	// a slide that does not compile stops the file, named
	const refused = await app.request(`/api/p/${name}/deck-export?page=talk`);
	expect(refused.status).toBe(422);
	expect(await refused.text()).toContain("talk/no-compile");

	writeDesignFile(
		root,
		"frames/talk/deck.json",
		JSON.stringify({ version: 1, w: 1280, h: 720, slides: HARD_TALK.filter((slide) => slide !== "no-compile") }),
	);
	const res = await app.request(`/api/p/${name}/deck-export?page=talk`);
	expect(res.status, await res.clone().text()).toBe(200);
	expect(res.headers.get("content-disposition")).toBe(`attachment; filename="talk.html"`);
	const html = await res.text();
	const file = join(makeTempDir(), `${name}-talk.html`);
	writeFileSync(file, html);

	const browser = await testBrowser();
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const asked: string[] = [];
	await context.route("**/*", (route) => {
		const url = route.request().url();
		if (url === pathToFileURL(file).href) return route.continue();
		asked.push(url);
		return route.abort();
	});
	const page = await context.newPage();
	await page.goto(pathToFileURL(file).href);

	/** the slide on screen, by its frame, and the words it shows */
	const onScreen = () =>
		page.evaluate(() => {
			const shown = document.querySelector<HTMLElement>("[data-spool-stage-shown]");
			return shown === null ? null : `${shown.dataset.spoolStageSlide}: ${shown.innerText}`.trim();
		});
	const press = async (key: string, now: string) => {
		await page.keyboard.press(key);
		await expect.poll(onScreen, { timeout: 15_000 }).toBe(now);
	};

	// the first slide's first beat, with the quiet line under it until the first key
	await expect.poll(onScreen, { timeout: 30_000 }).toBe("talk/title: The hard talk");
	expect(await page.locator(".spool-talk-hint").textContent()).toBe(TALK_HINT);
	expect(await page.locator(".spool-talk-still").count()).toBe(1);
	expect(await page.locator(".spool-talk-still").isVisible()).toBe(false);

	// the title's words carry into the photo's picture as one element
	const carried = page.evaluate(
		() =>
			new Promise<boolean>((resolve) => {
				const look = () => {
					const groups = document
						.getAnimations()
						.map((animation) => (animation.effect as KeyframeEffect).pseudoElement);
					if (groups.includes("::view-transition-group(hero)")) resolve(true);
					else requestAnimationFrame(look);
				};
				look();
				setTimeout(() => resolve(false), 10_000);
			}),
	);
	await press("ArrowRight", "talk/photo:");
	expect(await carried).toBe(true);
	await expect.poll(() => page.locator(".spool-talk-hint").count()).toBe(0);

	// beats play, and back steps them
	await press("Space", "talk/words: Beat one");
	await press("ArrowDown", "talk/words: Beat two");
	await press("n", "talk/words: Beat three");
	await press("ArrowLeft", "talk/words: Beat two");
	// skip passes the beats by; restart puts the slide back to its first
	await press("r", "talk/words: Beat one");
	await press("Shift+ArrowRight", "talk/gl:");

	// the live slide takes clicks, and Tab hands it the keys until Esc takes them back
	await press("Enter", "talk/live: count 0");
	await page.locator("#more").click();
	await expect.poll(onScreen).toBe("talk/live: count 1");
	await page.keyboard.press("Tab");
	await page.keyboard.press("ArrowRight");
	await page.waitForTimeout(300);
	expect(await onScreen()).toBe("talk/live: count 1");
	await page.keyboard.press("Escape");
	await press("ArrowRight", "talk/tall:");

	// a slide that throws as it mounts never shows: the picture stays, and the next key moves on
	await page.keyboard.press("ArrowRight");
	await page.waitForTimeout(600);
	expect(await onScreen()).toBe("talk/tall:");
	expect(await page.locator("body").innerText()).not.toContain("throw");
	await press("ArrowRight", "talk/beat-throws:");
	// one that throws on its next beat keeps its last picture
	await page.keyboard.press("ArrowRight");
	await page.waitForTimeout(600);
	expect(await onScreen()).toBe("talk/beat-throws:");
	expect(await page.locator("canvas").count()).toBeGreaterThan(0);
	expect(await page.locator("body").innerText()).not.toContain("throw");
	await press("PageDown", "talk/end:");
	expect(
		await page.locator("[data-spool-stage-shown] img").evaluate((img: HTMLImageElement) => img.naturalWidth),
	).toBe(1);

	// the jumps
	await press("Home", "talk/title: The hard talk");
	await press("End", "talk/end:");
	await page.keyboard.press("3");
	await press("Enter", "talk/words: Beat one");
	await press("PageUp", "talk/photo:");
	await press("Backspace", "talk/title: The hard talk");

	// B blacks the screen, and any key brings it back without moving
	await page.keyboard.press("b");
	await page.locator(".spool-stage-black").waitFor();
	await page.keyboard.press("ArrowRight");
	await page.locator(".spool-stage-black").waitFor({ state: "detached" });
	expect(await onScreen()).toBe("talk/title: The hard talk");

	// F is full screen, and Esc leaves it
	await page.keyboard.press("f");
	await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
	await page.keyboard.press("f");
	await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
	await page.keyboard.press("f");
	await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
	await page.keyboard.press("Escape");
	await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
	expect(await onScreen()).toBe("talk/title: The hard talk");

	expect(asked).toEqual([]);
	expect(html).not.toContain("this never compiles");
	await context.close();
}, 180_000);
