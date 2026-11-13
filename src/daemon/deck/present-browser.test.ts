import type { BrowserContext, Page } from "playwright-core";
import { expect, it } from "vitest";
import { type At, roomPicture, type StageSession } from "../../deck/stage-session";
import type { StageShown } from "../../deck/stage-wire";
import { testBrowser } from "../../test-browser";
import { builtUi, serveProject, writeDesignFile } from "../../test-helpers";
import { RENDER_HOST, ROOM_HOST } from "../security";
import {
	blackedOut,
	coverOf,
	everStretched,
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

type Said = (
	| { spool: "stage-shown"; shown: StageShown }
	| { spool: "stage-session"; session: StageSession }
	| { spool: "stage-played" }
) & {
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

/**
 * When the newest document of each stage last put a picture on its screen: the presenter's slide, the next pane, the
 * room; and when the presenter's slide last finished playing a step.
 */
async function lastShown(
	view: Page,
	audience: Page,
): Promise<{ slide: number; played: number; next: number; room: number }> {
	const lastWhen = (document: Said[] | undefined, spool: Said["spool"]) =>
		(document ?? []).flatMap((one) => (one.spool === spool ? [one.when] : [])).at(-1) ?? 0;
	const own = await said(view);
	const owns = (document: Said[]) => document.some((one) => one.spool === "stage-session");
	return {
		slide: lastWhen(own.filter(owns).at(-1), "stage-shown"),
		played: lastWhen(own.filter(owns).at(-1), "stage-played"),
		next: lastWhen(own.filter((document) => !owns(document)).at(-1), "stage-shown"),
		room: lastWhen((await said(audience)).at(-1), "stage-shown"),
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
	// a click on Present leaves the room's window with the keys: its first key puts it full screen, and steps as well
	await audience.keyboard.press("ArrowRight");
	expect(await together(view, audience)).toEqual({ slide: 1, beat: 0 });
	expect(await audience.evaluate(() => document.fullscreenElement !== null)).toBe(true);
	await audience.keyboard.press("ArrowLeft");
	expect(await together(view, audience)).toEqual({ slide: 0, beat: 0 });
	await audience.evaluate(() => document.exitFullscreen());
	await audience.setViewportSize({ width: 1280, height: 720 });
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

	// the next pane moves only once the step has played on the presenter's slide, its dissolve over, and is on the room's
	// screen: nothing it starts lands on the key or in the step
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
		expect(when.next).toBeGreaterThanOrEqual(Math.max(when.slide, when.played, when.room));
		expect(when.played).toBeGreaterThanOrEqual(when.slide);
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
	// the pointer over the live slide shows in the room; L, pressed in the slide, takes it away there and says
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
	// a press sinks it there, and the wheel turned with the button held turns its colour rather than scrolling the slide
	const look = () =>
		dot.evaluate((el) => ({ scale: (el as HTMLElement).style.scale, fill: (el as HTMLElement).style.background }));
	const red = (await look()).fill;
	await view.mouse.down();
	await expect.poll(async () => (await look()).scale).toBe("0.78");
	await view.mouse.wheel(0, -40);
	await expect.poll(async () => (await look()).fill).not.toBe(red);
	await view.mouse.up();
	await expect.poll(async () => (await look()).scale).toBe("1");
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

it("opens the presenter view on its slide drawn sharp: it travels as its opening still, never stretched, which goes as it lands on a slide the stage has drawn, the next pane names the next slide from its first frame, and shows a slide drawn with WebGL as its beat stills", {
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
	// slides of two beats drawn with WebGL, which the canvas's covers show at their last
	for (const [index, name] of ["one", "two"].entries()) {
		writeDesignFile(
			project.root,
			`frames/talk/${name}/frame.tsx`,
			`import { useEffect, useRef } from "react";
import { ui } from "spool";

export default function Slide() {
	ui.beats(["said", "shown"]);
	const canvas = useRef(null);
	useEffect(() => {
		canvas.current.getContext("webgl")?.clear(0x4000);
	}, []);
	return <div style={{ position: "absolute", inset: 0, background: "#1d3557", color: "white", fontSize: 96 }}>${name}<canvas ref={canvas} width={64} height={64} /></div>;
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
	// the booth's picture of the slide as the talk opens on it, made bigger than the presenter view draws it, and of each
	// beat, as they draw with WebGL
	await expect.poll(async () => (await coverOf(project, "talk/one"))?.opening, { timeout: 60_000 }).toBeDefined();
	for (const slide of ["talk/one", "talk/two"])
		await expect.poll(async () => (await coverOf(project, slide))?.beats?.length, { timeout: 60_000 }).toBe(2);
	const stills = (await coverOf(project, "talk/two"))?.beats ?? [];
	// a 2x screen, as the Mac's: the card's picture is far smaller than the presenter view draws the slide
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
	await watchPictures(context);
	// every WebGL context a document makes, counted
	await context.addInitScript(() => {
		const getContext = HTMLCanvasElement.prototype.getContext;
		Reflect.set(window, "__webglMade", 0);
		HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, options?: unknown) {
			const made = Reflect.apply(getContext, this, [kind, options]);
			if (made !== null && kind.startsWith("webgl"))
				Reflect.set(window, "__webglMade", Reflect.get(window, "__webglMade") + 1);
			return made;
		} as typeof getContext;
	});
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
	expect(everStretched(read)).toEqual([]);
	expect(stretched(read)).toEqual([]);
	// and it has gone: the slide is the stage's own
	expect(read.frames.at(-1)?.pictures).toEqual([]);
	// on the first of two slides, what comes next is the second, in every frame the view has been there
	const words = read.frames.flatMap((frame) => (frame.presenter === null ? [] : [frame.presenter]));
	expect(words.length).toBeGreaterThan(0);
	expect(words.filter((said) => said.includes("end of the talk"))).toEqual([]);
	await expect.poll(async () => (await room(audience))?.at, { timeout: 30_000 }).toEqual({ slide: 0, beat: 0 });
	expect(stageHosts(audience)).toEqual([RENDER_HOST]);

	// the next pane shows the booth's still of the beat each key plays, and makes no context in the presenter's thread
	// (spool#330)
	const nextStill = () => view.locator("[data-deck-next-still]").getAttribute("src", { timeout: 30_000 });
	await view.keyboard.press("ArrowRight");
	await expect.poll(nextStill, { timeout: 30_000 }).toContain(stills[0]);
	await view.keyboard.press("ArrowRight");
	await expect.poll(nextStill, { timeout: 30_000 }).toContain(stills[1]);
	const made = async (selector: string) => {
		let count = 0;
		for (const frame of await view.locator(`${selector} iframe`).elementHandles())
			count +=
				(await (await frame.contentFrame())?.evaluate(() => Reflect.get(window, "__webglMade") as number)) ?? 0;
		return count;
	};
	expect(await made("[data-deck-next]")).toBe(0);
	// while the presenter's own slide draws it
	expect(await made("[data-deck-presenter]")).toBeGreaterThan(0);
	await audience.close();
});

it("gives the room's copy of a live slide what the presenter does in it: clicks, tabs, hover, the wheel, typing and a drag, while it held its picture too, never its keys; a room reloaded gets where it stands, and a slide waiting out of sight never writes the talk's state", {
	timeout: 180_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir, experiments: { deck: true } });
	const json = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`;
	const slides = ["proto", "second", "waits"];
	writeDesignFile(project.root, "frames/talk/deck.json", json({ version: 1, w: 1280, h: 720, slides }));
	const ground = "position: absolute; inset: 0; background: #f1faee; font: 32px sans-serif;";
	const files: Record<string, { tsx: string; css: string }> = {
		// a prototype written the ordinary way: its state in React, its scroll and its hover the browser's
		proto: {
			tsx: `import "./slide.css";
import { useEffect, useRef, useState } from "react";
import { ui } from "spool";

export default function Slide() {
	ui.live();
	const [count, setCount] = useState(0);
	const [tab, setTab] = useState("one");
	const [text, setText] = useState("");
	const [kept, setKept] = useState("");
	const [near, setNear] = useState(false);
	const [at, setAt] = useState(0);
	const grab = useRef<number | null>(null);
	const field = useRef<HTMLInputElement>(null);
	// a change heard the browser's way, once the field is left
	useEffect(() => {
		const element = field.current;
		const heard = () => setKept(element?.value ?? "");
		element?.addEventListener("change", heard);
		return () => element?.removeEventListener("change", heard);
	}, []);
	return (
		<div className="ground">
			<button type="button" id="count" onClick={() => setCount(count + 1)}>{\`count \${count}\`}</button>
			<button type="button" id="tab" onClick={() => setTab("two")}>{\`tab \${tab}\`}</button>
			<button type="button" id="find" onClick={() => field.current?.focus()}>find</button>
			<button type="button" id="fill" onClick={() => setText("filled")}>fill</button>
			<ul id="list">{Array.from({ length: 60 }, (_, row) => <li key={row}>{\`row \${row}\`}</li>)}</ul>
			<input id="field" ref={field} value={text} onChange={(event) => setText(event.target.value)} />
			<p id="echo">{\`said \${text}\`}</p>
			<p id="kept">{\`kept \${kept}\`}</p>
			<div id="hover" onPointerEnter={() => setNear(true)} onPointerLeave={() => setNear(false)}>{near ? "near" : "far"}</div>
			<div id="card" />
			<div
				id="knob"
				style={{ transform: \`translateX(\${at}px)\` }}
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					grab.current = event.clientX - at;
				}}
				onPointerMove={(event) => {
					if (grab.current !== null) setAt(Math.round(event.clientX - grab.current));
				}}
				onPointerUp={() => {
					grab.current = null;
				}}
			/>
		</div>
	);
}
`,
			css: `.ground { ${ground} }
#count { position: absolute; left: 40px; top: 40px; font-size: 32px; }
#tab { position: absolute; left: 300px; top: 40px; font-size: 32px; }
#find { position: absolute; left: 560px; top: 40px; font-size: 32px; }
#fill { position: absolute; left: 760px; top: 40px; font-size: 32px; }
#kept { position: absolute; left: 400px; top: 250px; margin: 0; }
#list { position: absolute; left: 40px; top: 140px; width: 300px; height: 240px; overflow: auto; margin: 0; }
#field { position: absolute; left: 400px; top: 140px; font-size: 32px; }
#echo { position: absolute; left: 400px; top: 200px; margin: 0; }
#hover { position: absolute; left: 400px; top: 300px; width: 200px; height: 80px; background: #a8dadc; }
#card { position: absolute; left: 640px; top: 300px; width: 200px; height: 80px; background: #e63946; opacity: 0; }
#hover:hover + #card { opacity: 1; }
#hover:not(:hover) + #card { opacity: 0; }
#knob { position: absolute; left: 40px; top: 480px; width: 80px; height: 80px; background: #1d3557; touch-action: none; }
`,
		},
		second: {
			tsx: `import "./slide.css";
import { useState } from "react";
import { ui } from "spool";
import { SHARED } from "shared/sneak";

export default function Slide() {
	ui.live();
	const [count, setCount] = useState(0);
	return (
		<div className="ground" data-shared={SHARED}>
			<button
				type="button"
				id="again"
				onClick={() => {
					setCount(count + 1);
					ui.state.noted = count + 1;
				}}
			>{\`again \${count}\`}</button>
		</div>
	);
}
`,
			css: `.ground { ${ground} }\n#again { position: absolute; left: 40px; top: 40px; font-size: 32px; }\n`,
		},
		// put on ahead out of sight, it writes \`ui.state\` once it has mounted: from a timer of its own, from a timer of code
		// the slide on show shares, and from a promise
		waits: {
			tsx: `import "./slide.css";
import { useEffect } from "react";
import { ui } from "spool";
import { sneakLater } from "shared/sneak";

export default function Slide() {
	useEffect(() => {
		const timer = setTimeout(() => {
			ui.state.sneaked = true;
		}, 200);
		sneakLater();
		void new Promise((done) => setTimeout(done, 300)).then(() => {
			ui.state.sneakedLater = true;
		});
		return () => clearTimeout(timer);
	}, []);
	return <div className="ground">waits</div>;
}
`,
			css: `.ground { ${ground} }\n`,
		},
	};
	writeDesignFile(
		project.root,
		"shared/sneak.ts",
		`import { ui } from "spool";

export const SHARED = "shared";
export function sneakLater(): void {
	setTimeout(() => {
		ui.state.sneakedShared = true;
	}, 250);
}
`,
	);
	for (const [index, name] of slides.entries()) {
		const file = files[name];
		if (file === undefined) continue;
		writeDesignFile(project.root, `frames/talk/${name}/frame.tsx`, file.tsx);
		writeDesignFile(project.root, `frames/talk/${name}/slide.css`, file.css);
		writeDesignFile(project.root, `frames/talk/${name}/frame.json`, json({ x: index * 1440, y: 0, w: 1280, h: 720 }));
	}
	writeDesignFile(
		project.root,
		".spool/state.json",
		JSON.stringify({ activePage: "talk", pageCameras: { talk: { x: 40, y: 120, k: 0.2 } } }),
	);
	const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
	await tapStages(context);
	const view = await context.newPage();
	await view.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await view.locator("[data-deck-band]").waitFor({ timeout: 30_000 });
	const opened = context.waitForEvent("page");
	await view.getByRole("button", { name: "Ways to present" }).click();
	await view.getByRole("menuitemradio", { name: /Presenter view/ }).click();
	const audience = await opened;
	await audience.setViewportSize({ width: 1280, height: 720 });
	await view.locator("[data-deck-presenter]").waitFor();
	expect(await together(view, audience)).toEqual({ slide: 0, beat: 0 });

	const mine = (selector: string) =>
		view.frameLocator("[data-deck-slide] iframe >> nth=-1").locator(`[data-spool-stage-shown] ${selector}`);
	const theirs = (selector: string) =>
		audience.frameLocator("iframe >> nth=-1").locator(`[data-spool-stage-shown] ${selector}`);

	// state in React: a counter and a tab
	for (let click = 0; click < 3; click++) await mine("#count").click();
	await mine("#tab").click();
	await expect.poll(() => theirs("#count").textContent()).toBe("count 3");
	await expect.poll(() => theirs("#tab").textContent()).toBe("tab two");
	// the hand over a card: React hears it come and go, and the card the CSS shows on hover shows
	await mine("#hover").hover();
	await expect.poll(() => theirs("#hover").textContent()).toBe("near");
	await expect.poll(() => theirs("#card").evaluate((card) => getComputedStyle(card).opacity)).toBe("1");
	await mine("#count").hover();
	await expect.poll(() => theirs("#hover").textContent()).toBe("far");
	await expect.poll(() => theirs("#card").evaluate((card) => getComputedStyle(card).opacity)).toBe("0");
	// the wheel over a scrolling list scrolls it in both, to the same place
	const list = await mine("#list").boundingBox();
	if (list === null) throw new Error("no list");
	await view.mouse.move(list.x + list.width / 2, list.y + list.height / 2);
	await view.mouse.wheel(0, 400);
	await expect.poll(() => mine("#list").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
	const scrolled = await mine("#list").evaluate((element) => element.scrollTop);
	await expect.poll(() => theirs("#list").evaluate((element) => element.scrollTop)).toBe(scrolled);
	// typing in a field React holds
	await mine("#field").click();
	await view.keyboard.type("hello");
	await expect.poll(() => theirs("#field").inputValue()).toBe("hello");
	await expect.poll(() => theirs("#echo").textContent()).toBe("said hello");
	await view.keyboard.press("Escape");
	// left, the field says it changed, the browser's way
	await mine("#tab").click();
	await expect.poll(() => theirs("#kept").textContent()).toBe("kept hello");
	// a click whose handler focuses the field: the room's copy shows it focused, and the room's window keeps its keys
	await mine("#find").click();
	await expect.poll(() => theirs("#field").getAttribute("data-spool-focus")).toBe("");
	await view.keyboard.press("Escape");
	await mine("#tab").click();
	expect(await audience.evaluate(() => document.activeElement?.tagName)).not.toBe("IFRAME");
	// a drag that takes the pointer as it presses
	const knob = await mine("#knob").boundingBox();
	if (knob === null) throw new Error("no knob");
	await view.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
	await view.mouse.down();
	await view.mouse.move(knob.x + knob.width / 2 + 60, knob.y + knob.height / 2, { steps: 6 });
	await view.mouse.up();
	const dragged = () => (element: Element) => new DOMMatrix(getComputedStyle(element).transform).m41;
	const moved = await mine("#knob").evaluate(dragged());
	expect(moved).toBeGreaterThan(100);
	await expect.poll(async () => Math.abs((await theirs("#knob").evaluate(dragged())) - moved)).toBeLessThan(2);

	// what is done while the room holds its picture shows there as it lets go
	await view.keyboard.press("f");
	await mine("#count").click();
	await expect.poll(() => mine("#count").textContent()).toBe("count 4");
	await view.waitForTimeout(300);
	expect(await theirs("#count").textContent()).toBe("count 3");
	await view.keyboard.press("f");
	await expect.poll(() => theirs("#count").textContent()).toBe("count 4");

	// a room reloaded on the live slide gets where its scroll and its field stand now, a field the slide filled too; its
	// counter starts again
	await mine("#fill").click();
	await expect.poll(() => theirs("#echo").textContent()).toBe("said filled");
	await audience.reload();
	expect(await together(view, audience)).toEqual({ slide: 0, beat: 0 });
	await expect.poll(() => theirs("#list").evaluate((element) => element.scrollTop)).toBe(scrolled);
	await expect.poll(() => theirs("#echo").textContent()).toBe("said filled");

	// the next live slide is given what is done in it, and the one after it, put on ahead, writes nothing of the talk's
	await view.keyboard.press("ArrowRight");
	expect(await together(view, audience)).toEqual({ slide: 1, beat: 0 });
	await view.waitForTimeout(1000);
	// the slide on show writes, after them: theirs never ride along
	await mine("#again").click();
	await expect.poll(() => theirs("#again").textContent()).toBe("again 1");
	const sessions = (await said(view)).flat().flatMap((one) => (one.spool === "stage-session" ? [one.session] : []));
	expect(sessions.some((session) => session.state.noted === 1)).toBe(true);
	const sneaks = ["sneaked", "sneakedShared", "sneakedLater"];
	expect(sessions.filter((session) => sneaks.some((key) => key in session.state))).toEqual([]);
	await audience.close();
});
