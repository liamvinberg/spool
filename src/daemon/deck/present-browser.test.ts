import type { BrowserContext, Page } from "playwright-core";
import { expect, it } from "vitest";
import { type At, roomPicture, type StageSession } from "../../deck/stage-session";
import type { StageShown } from "../../deck/stage-wire";
import { testBrowser } from "../../test-browser";
import { builtUi, serveProject, writeDesignFile } from "../../test-helpers";
import { RENDER_HOST, ROOM_HOST } from "../security";
import {
	blackedOut,
	explainFrame,
	HARD_TALK,
	onGround,
	picturesOf,
	pixelsOf,
	readScreen,
	recordScreen,
	SCREEN_POINTS,
	serveHardTalkFiles,
	slideLooks,
	stretched,
	watchPictures,
	writeHardTalk,
} from "./stage-browser.test-helpers";

/**
 * Presenting the hard talk (spool#265, spool#270): spool's window as the presenter view, the one authority, and the room
 * as a second window that follows it. Read off what each window's stage says to its host: the presenter's own stage
 * says each session, the room's which slide and beat it put on its screen.
 */

/** What every stage document in every window of the context says to its host, document by document. */
async function tapStages(context: BrowserContext): Promise<void> {
	await context.addInitScript(() => {
		const heard: unknown[][] = [];
		(window as unknown as { __stage: unknown[][] }).__stage = heard;
		addEventListener(
			"message",
			(event) => {
				if ((event.data as { spool?: unknown } | null)?.spool !== "stage-connect") return;
				const said: unknown[] = [];
				heard.push(said);
				// when, by the clock every window shares
				event.ports[0]?.addEventListener("message", (message) => said.push({ ...message.data, when: Date.now() }));
			},
			true,
		);
	});
}

type Said = ({ spool: "stage-shown"; shown: StageShown } | { spool: "stage-session"; session: StageSession }) & {
	when: number;
};

const said = (page: Page) =>
	page.evaluate(() => ((window as unknown as { __stage?: unknown[][] }).__stage ?? []) as Said[][]);

/** The newest session the presenter view's own stage said: the talk as it is. */
async function presenter(page: Page): Promise<StageSession | undefined> {
	const sessions = (await said(page)).flat().flatMap((one) => (one.spool === "stage-session" ? [one.session] : []));
	return sessions.reduce<StageSession | undefined>(
		(newest, one) => (newest === undefined || one.revision >= newest.revision ? one : newest),
		undefined,
	);
}

/** What the room's newest document last put on its screen. */
async function room(page: Page): Promise<StageShown | undefined> {
	const documents = await said(page);
	return (documents.at(-1) ?? []).flatMap((one) => (one.spool === "stage-shown" ? [one.shown] : [])).at(-1);
}

const same = (a: At | undefined, b: At | undefined) => a !== undefined && b?.slide === a.slide && b.beat === a.beat;

/** When the newest document of each stage last put a picture on its screen: the presenter's slide, the next pane, the room. */
async function lastShown(view: Page, audience: Page): Promise<{ slide: number; next: number; room: number }> {
	const shownWhen = (document: Said[] | undefined) =>
		(document ?? []).flatMap((one) => (one.spool === "stage-shown" ? [one.when] : [])).at(-1) ?? 0;
	const own = await said(view);
	const owns = (document: Said[]) => document.some((one) => one.spool === "stage-session");
	return {
		slide: shownWhen(own.filter(owns).at(-1)),
		next: shownWhen(own.filter((document) => !owns(document)).at(-1)),
		room: shownWhen((await said(audience)).at(-1)),
	};
}

/** Both windows on the slide and beat the room should show, and still there a moment later. */
async function together(view: Page, audience: Page): Promise<At> {
	let at: At | undefined;
	const check = async () => {
		const session = await presenter(view);
		at = session === undefined ? undefined : roomPicture(session).at;
		return same(at, (await room(audience))?.at);
	};
	for (let settled = 0; settled < 2; ) {
		await expect.poll(check, { timeout: 20_000 }).toBe(true);
		await view.waitForTimeout(80);
		settled = (await check()) ? settled + 1 : 0;
	}
	if (at === undefined) throw new Error("no session");
	return at;
}

/** The hosts a window's stage documents play on. */
const stageHosts = (page: Page) =>
	page
		.frames()
		.filter((frame) => frame !== page.mainFrame())
		.map((frame) => new URL(frame.url()).hostname);

/** A small seeded generator, so a walk that fails can be walked again. */
function walker(seed: number) {
	let state = seed >>> 0;
	return (below: number) => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state % below;
	};
}

/** The talk's slides as the presenter view names them on its foot, with their beats. */
const BEATS: Record<string, number> = { words: 3, "beat-throws": 2 };

it("presents the hard talk: the room follows the presenter through a long walk, a reload, a freeze, black and a live slide, and shows only slides; closed, it is offered again, and goes with spool's window", {
	timeout: 300_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir, experiments: { deck: true } });
	writeHardTalk(project.root);
	writeDesignFile(
		project.root,
		".spool/state.json",
		JSON.stringify({ activePage: "talk", pageCameras: { talk: { x: 40, y: 120, k: 0.08 } } }),
	);
	const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
	await serveHardTalkFiles(context, async () => {});
	await tapStages(context);
	const view = await context.newPage();
	await view.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await view.locator("[data-deck-band]").waitFor({ timeout: 30_000 });

	// the caret's Presenter view presents from the first slide, nothing being held: spool's window becomes the presenter
	// view, and the room opens beside it; on one display it is the way Present takes from now on
	const opened = context.waitForEvent("page");
	await view.getByRole("button", { name: "Ways to present" }).click();
	await view.getByRole("menuitemradio", { name: /Presenter view/ }).click();
	const audience = await opened;
	await audience.setViewportSize({ width: 1280, height: 720 });
	await view.locator("[data-deck-presenter]").waitFor();
	expect(await together(view, audience)).toEqual({ slide: 0, beat: 0 });
	// the room's stage plays on a host of its own, a site the browser gives a process of its own (spool#320)
	expect(stageHosts(audience)).toEqual([ROOM_HOST]);
	const screen = await recordScreen(audience);

	// a long walk of the talk's own keys and the foot's segments, the room reloaded half way
	const next = walker(265);
	const keys = [
		"ArrowRight",
		"ArrowRight",
		"ArrowRight",
		"ArrowLeft",
		"ArrowLeft",
		"Shift+ArrowRight",
		"Shift+ArrowLeft",
		"Home",
		"End",
	];
	const segments = HARD_TALK.flatMap((name) =>
		Array.from({ length: BEATS[name] ?? 1 }, (_, beat) => ({ name, beat })),
	);
	const seen = new Set<string>();
	let reloaded = 0;
	for (let step = 0; step < 40; step++) {
		if (step === 20) {
			reloaded = screen.mark();
			await audience.reload();
			await together(view, audience);
		}
		const pick = next(keys.length + 2);
		if (pick < keys.length) await view.keyboard.press(keys[pick] ?? "");
		else if (pick === keys.length) {
			await view.keyboard.type(String(next(HARD_TALK.length) + 1));
			await view.keyboard.press("Enter");
		} else {
			const segment = segments[next(segments.length)];
			const all = await view.locator(`[aria-label^="${segment?.name}, "]`).all();
			await all[segment?.beat ?? 0]?.click();
		}
		const at = await together(view, audience);
		seen.add(`${at.slide}.${at.beat}`);
	}
	// the walk went through the beats of a slide, and onto the slide that throws on its second
	expect(seen).toContain("2.1");
	expect(seen).toContain("7.1");

	// the next pane moves only once the step is on the presenter's slide and the room's screen: nothing it starts lands
	// on the key
	await view.keyboard.press("Home");
	await together(view, audience);
	for (let step = 0; step < 3; step++) {
		const before = (await lastShown(view, audience)).next;
		await view.keyboard.press("ArrowRight");
		await together(view, audience);
		await expect
			.poll(async () => (await lastShown(view, audience)).next, { timeout: 10_000 })
			.toBeGreaterThan(before);
		const when = await lastShown(view, audience);
		expect(when.next).toBeGreaterThanOrEqual(Math.max(when.slide, when.room));
	}

	// a segment clicked takes the talk there and leaves the keys with the view: the next key draws no ring on it
	await view.locator('[aria-label^="words, "]').first().click();
	await view.keyboard.press("ArrowRight");
	await together(view, audience);
	expect(await view.evaluate(() => document.querySelector("button:focus-visible")?.ariaLabel ?? null)).toBeNull();

	// F holds the room on its picture while the presenter looks ahead, and catches it up when let go
	await view.keyboard.press("Home");
	await together(view, audience);
	await view.keyboard.press("f");
	await view.keyboard.press("ArrowRight");
	await view.keyboard.press("ArrowRight");
	await expect.poll(async () => (await presenter(view))?.at).toEqual({ slide: 2, beat: 0 });
	expect(await together(view, audience)).toEqual({ slide: 0, beat: 0 });
	await view.keyboard.press("f");
	expect(await together(view, audience)).toEqual({ slide: 2, beat: 0 });

	// what the live slide writes to `ui.state` is the talk's, and shows in the room's copy of it
	await view.keyboard.press("5");
	await view.keyboard.press("Enter");
	expect(await together(view, audience)).toEqual({ slide: 4, beat: 0 });
	await view.frameLocator("[data-deck-slide] iframe >> nth=-1").locator("[data-spool-stage-shown] #more").click();
	await view.mouse.move(4, 4);
	const counted = audience.frameLocator("iframe >> nth=-1").locator("[data-spool-stage-shown] #more");
	await expect.poll(() => counted.textContent()).toBe("count 1");
	// ? from the slide that has the focus lists the keys over the view, and esc closes the list and does nothing else
	await view.keyboard.press("?");
	const keyList = view.getByRole("dialog", { name: "Presenting keys" });
	await keyList.waitFor();
	await view.keyboard.press("Escape");
	await keyList.waitFor({ state: "detached" });
	expect(await together(view, audience)).toEqual({ slide: 4, beat: 0 });
	// the pointer over the live slide is a soft dot in the room; L, pressed in the slide, takes it away there and says
	// so, and the room's menu brings it back, its esc leaving the talk on
	const dot = audience.locator("[data-spool-room-dot]");
	const over = async (x: number) => {
		const box = await view.locator("[data-deck-slide]").boundingBox();
		if (box === null) throw new Error("no slide");
		await view.mouse.move(box.x + box.width * x, box.y + box.height / 2, { steps: 4 });
	};
	await over(0.4);
	await expect.poll(() => dot.evaluate((el) => (el as HTMLElement).style.opacity)).toBe("1");
	await view.keyboard.press("l");
	await view.getByText("The room doesn't see your pointer").waitFor();
	await expect.poll(() => dot.evaluate((el) => (el as HTMLElement).style.opacity)).toBe("0");
	await over(0.6);
	await view.waitForTimeout(300);
	expect(await dot.evaluate((el) => (el as HTMLElement).style.opacity)).toBe("0");
	await view.getByRole("button", { name: /window/ }).click();
	const pointerSwitch = view.getByRole("switch", { name: "Show pointer" });
	expect(await pointerSwitch.isChecked()).toBe(false);
	await view.locator("[data-room-pointer]").click();
	await expect.poll(() => pointerSwitch.isChecked()).toBe(true);
	await view.keyboard.press("Escape");
	await expect.poll(() => view.getByRole("dialog", { name: "The room" }).count()).toBe(0);
	await over(0.5);
	await expect.poll(() => dot.evaluate((el) => (el as HTMLElement).style.opacity)).toBe("1");
	expect(await together(view, audience)).toEqual({ slide: 4, beat: 0 });
	// ⇥ hands it the keys, and esc takes them back without ending the talk
	await view.keyboard.press("Tab");
	await expect.poll(async () => (await presenter(view))?.keys).toBe(true);
	await view.getByText("live has the keys").waitFor();
	await view.keyboard.press("Escape");
	await expect.poll(async () => (await presenter(view))?.keys).toBe(false);
	await view.getByText("keys to live").waitFor();

	// a slide that throws as it mounts is named in the presenter view, while the room keeps the picture it had
	await view.keyboard.press("ArrowRight");
	expect(await together(view, audience)).toEqual({ slide: 5, beat: 0 });
	await view.keyboard.press("ArrowRight");
	expect(await together(view, audience)).toEqual({ slide: 6, beat: 0 });
	expect(await room(audience)).toMatchObject({ held: true });
	await expect
		.poll(() => view.locator('[data-deck-broken="talk/mount-throws"]').textContent())
		.toContain("mount-throws");
	const kept = explainFrame(pixelsOf(await audience.screenshot(), SCREEN_POINTS), slideLooks());
	expect(kept === undefined ? undefined : kept.mix < 0.5 ? kept.from : kept.to).toBe("tall");

	// every frame the room's window composited was a slide whole or two dissolving, the bare ground only while it opened
	// again: nothing of spool's, ever
	const frames = await screen.stop();
	const gone = reloaded + frames.slice(reloaded).findIndex((png) => onGround(pixelsOf(png, SCREEN_POINTS)));
	expect(gone).toBeGreaterThanOrEqual(reloaded);
	expect(readScreen(frames.slice(0, gone)).length).toBeGreaterThan(0);
	expect(readScreen(frames.slice(gone)).length).toBeGreaterThan(0);

	// B blacks the room's screen, pure black where the ground is not, and the next key brings it back and does nothing
	// else
	await view.keyboard.press("b");
	await expect.poll(async () => (await presenter(view))?.black).toBe(true);
	await expect.poll(async () => blackedOut(pixelsOf(await audience.screenshot(), SCREEN_POINTS))).toBe(true);
	await view.keyboard.press("ArrowRight");
	await expect.poll(async () => (await presenter(view))?.black).toBe(false);
	expect(await together(view, audience)).toEqual({ slide: 6, beat: 0 });

	// the room's window closed mid-talk is said in the presenter view and offered again, and opens on where the talk is
	await audience.close();
	await view.getByText("The room's window is closed").waitFor();
	const again = context.waitForEvent("page");
	await view.getByRole("button", { name: /open it again/ }).click();
	const reopened = await again;
	await reopened.setViewportSize({ width: 1280, height: 720 });
	expect(await together(view, reopened)).toEqual({ slide: 6, beat: 0 });

	// esc ends the talk: the room's window closes and the canvas comes back with the slide the talk ended on selected
	const closed = reopened.waitForEvent("close");
	await view.keyboard.press("Escape");
	await closed;
	await view.locator("[data-deck-presenter]").waitFor({ state: "detached" });
	await expect
		.poll(async () => {
			const response = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/selection`, {
				headers: { "X-Spool-Control": project.controlToken },
			});
			const body = (await response.json()) as { selection?: { frame: string }[] };
			return body.selection?.map((one) => one.frame);
		})
		.toEqual(["talk/mount-throws"]);

	// in the Mac app the presenter view names the room's display as the app reports it, X asks the app to swap, and a
	// display unplugged under the room is said (the app's half is desktop/src/room-window.test.ts); the room's window,
	// which the app holds hidden till then, is told once that its slide is drawn and can be shown
	// (a popup keeps the window of the blank page it opens on, so the script cannot ask its address)
	await context.addInitScript(() => {
		if (window !== window.top) return;
		const drawn: boolean[] = [];
		Object.assign(window, {
			roomDrawn: drawn,
			spoolRoomWindow: {
				windowed: true,
				onWindowed: () => () => {},
				// the slide is revealed, and the page has painted content of its own: Chromium holds back a new page's
				// frames till it does or half a second passes, and the slide's own frame does not count
				drawn: () =>
					drawn.push(
						document.querySelector('[data-spool-stage] iframe[style*="opacity: 1"]') !== null &&
							performance.getEntriesByName("first-contentful-paint").length === 1,
					),
			},
		});
	});
	await view.evaluate(() => {
		type Report = { talk: string; screen: string | null; swaps: boolean; unplugged?: string };
		const app = {
			swaps: [] as string[],
			tell: (_report: Report) => {},
			onCommand: () => () => {},
			setCanvasActive: () => {},
			onRoom(listener: (report: Report) => void) {
				app.tell = listener;
				return () => {};
			},
			roomReport: async (talk: string): Promise<Report> => ({ talk, screen: "Studio Display", swaps: true }),
			swapRoom: (talk: string) => app.swaps.push(talk),
		};
		(window as unknown as { spoolCanvasWindow: unknown }).spoolCanvasWindow = app;
	});
	await expect.poll(() => view.evaluate(() => document.documentElement.hasAttribute("data-deck-moving"))).toBe(false);
	// ⇧⌘↵ presents from the first slide the way remembered
	const last = context.waitForEvent("page");
	await view.keyboard.press("ControlOrMeta+Shift+Enter");
	const left = await last;
	await view.locator("[data-deck-presenter]").waitFor();
	await view.getByRole("button", { name: /Studio Display/ }).waitFor();
	await expect
		.poll(() => left.evaluate(() => (window as unknown as { roomDrawn: boolean[] }).roomDrawn))
		.toEqual([true]);
	await view.keyboard.press("x");
	const swapped = () =>
		view.evaluate(() => (window as unknown as { spoolCanvasWindow: { swaps: string[] } }).spoolCanvasWindow.swaps);
	await expect.poll(swapped).toHaveLength(1);
	// the room's menu lists both screens, the other by name only once the room has been there, and a press swaps as X
	await view.getByRole("button", { name: /Studio Display/ }).click();
	await view.getByRole("menuitemradio", { name: "other screen" }).click();
	await expect.poll(swapped).toHaveLength(2);
	await view.evaluate(() => {
		const app = (
			window as unknown as {
				spoolCanvasWindow: { swaps: string[]; tell: (report: object) => void };
			}
		).spoolCanvasWindow;
		app.tell({ talk: app.swaps[0], screen: null, swaps: false, unplugged: "Studio Display" });
	});
	await view.getByText("Studio Display was unplugged · the room is a window").waitFor();

	// reloading spool's window ends a talk, and its room closes itself, on the slide it showed rather than its black
	// ground, as it does in the Mac app, where spool's window holds no handle on it
	const ended = left.waitForEvent("close");
	const closedOn = new Promise<string>((done) =>
		left.on("console", (message) => {
			if (message.text().startsWith("closes on ")) done(message.text());
		}),
	);
	await left.evaluate(() => {
		const close = window.close.bind(window);
		window.close = () => {
			const slide = document.querySelector('[data-spool-stage] iframe[style*="opacity: 1"]') !== null;
			console.log(`closes on ${slide ? "the slide" : "black"}`);
			close();
		};
	});
	await view.reload();
	await ended;
	expect(await closedOn).toBe("closes on the slide");
	await view.locator("[data-deck-band]").waitFor({ timeout: 30_000 });
	expect(await view.locator("[data-deck-presenter]").count()).toBe(0);
});

it("opens the presenter view on its slide drawn sharp: the picture it travelled as goes as it lands on a slide the stage has drawn, and the next pane names the next slide from its first frame", {
	timeout: 180_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir, experiments: { deck: true } });
	const json = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`;
	writeDesignFile(
		project.root,
		"frames/talk/deck.json",
		json({ version: 1, w: 1280, h: 720, slides: ["one", "two"] }),
	);
	for (const [index, name] of ["one", "two"].entries()) {
		writeDesignFile(
			project.root,
			`frames/talk/${name}/frame.tsx`,
			`export default function Slide() {
	return <div style={{ position: "absolute", inset: 0, background: "#1d3557", color: "white", fontSize: 96 }}>${name}</div>;
}
`,
		);
		writeDesignFile(project.root, `frames/talk/${name}/frame.json`, json({ x: index * 1440, y: 0, w: 1280, h: 720 }));
	}
	writeDesignFile(
		project.root,
		".spool/state.json",
		JSON.stringify({ activePage: "talk", pageCameras: { talk: { x: 40, y: 120, k: 0.2 } } }),
	);
	// the canvas's picture of the slide, made for a card, is what travels to the presenter view
	const covered = async () => {
		const res = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/frames`, {
			headers: { "X-Spool-Control": project.controlToken },
		});
		const { frames } = (await res.json()) as { frames: { name: string; cover?: unknown }[] };
		return frames.find((frame) => frame.name === "talk/one")?.cover !== undefined;
	};
	await expect.poll(covered, { timeout: 60_000 }).toBe(true);
	// a 2x screen, as the Mac's: the card's picture is far smaller than the presenter view draws the slide
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
	await watchPictures(context);
	// a browser where the room's host never answers: the room plays its stage on the render host, as it did before it
	// had one (spool#320)
	await tapStages(context);
	await context.route(/^http:\/\/room-spool\.localhost/, (route) => route.abort());
	const view = await context.newPage();
	await view.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await view.locator("[data-deck-band]").waitFor({ timeout: 30_000 });

	const opened = context.waitForEvent("page");
	await view.getByRole("button", { name: "Ways to present" }).click();
	await view.getByRole("menuitemradio", { name: /Presenter view/ }).click();
	const audience = await opened;
	await view.locator("[data-deck-presenter]").waitFor();
	await expect.poll(async () => (await picturesOf(view)).drawn, { timeout: 30_000 }).not.toBeNull();
	await expect.poll(async () => (await picturesOf(view)).frames.at(-1)?.landed, { timeout: 30_000 }).toBe(true);
	await view.waitForTimeout(500);
	const read = await picturesOf(view);
	expect(read.frames.some((frame) => frame.pictures.length > 0)).toBe(true);
	expect(stretched(read)).toEqual([]);
	// on the first of two slides, what comes next is the second, in every frame the view has been there
	const words = read.frames.flatMap((frame) => (frame.presenter === null ? [] : [frame.presenter]));
	expect(words.length).toBeGreaterThan(0);
	expect(words.filter((said) => said.includes("end of the talk"))).toEqual([]);
	await expect.poll(async () => (await room(audience))?.at, { timeout: 30_000 }).toEqual({ slide: 0, beat: 0 });
	expect(stageHosts(audience)).toEqual([RENDER_HOST]);
	await audience.close();
});
