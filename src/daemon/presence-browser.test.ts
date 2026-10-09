import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import { initTeamProject } from "../init";
import { decodeFrame, encodeFrame, PROTOCOL_VERSION, type PresenceState } from "../team-sync-protocol";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { testBrowser } from "../test-browser";
import { builtUi, closeAfterTest, makeTempDir, pagePointOf, writeDesignFile, writeFrame } from "../test-helpers";
import { serveDaemon } from "./server";
import { syncUrl } from "./team-sync";

/**
 * What one person sees of their teammates on a team canvas (DEV-196), drawn by the real canvas from presence
 * the team sends: a named pointer whose name holds and fades, idle and gone, the pill docked on a frame's
 * name, the grabbing hand and the outline, what their pointer does inside a live frame, the faces and their
 * crowd, and following a view. Ana's canvas is
 * the one looked at; the teammates are fixtures the fake team says, and Ben's connection hears Ana.
 */

const BEN = { accountId: "ben", name: "ben", color: "#eaa94a" };
const CLEO = { accountId: "cleo", name: "cleo", color: "#4cc495" };
const HOME = { x: 0, y: 0, w: 640, h: 400 };
const MENU = { x: 800, y: 0, w: 640, h: 400 };

const at = (x: number, y: number, more: Partial<PresenceState> = {}): PresenceState => ({
	page: "",
	pointer: { x, y },
	pressed: false,
	dragging: [],
	inside: null,
	view: { x: -100, y: -100, w: 1600, h: 900 },
	...more,
});

async function teamCanvas() {
	const cloud = fakeTeam();
	const ana = cloud.machine("ana");
	const ben = cloud.machine("ben");
	const spoolDir = join(makeTempDir(), ".spool");
	const checkout = join(makeTempDir(), "checkout");
	mkdirSync(checkout);
	execFileSync("git", ["init", "--quiet", "."], { cwd: checkout });
	const { root, link } = await initTeamProject(realpathSync(checkout), spoolDir, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: ana.request,
		openSocket: ana.openSocket,
	});
	for (const [name, box] of [
		["home", HOME],
		["menu", MENU],
	] as const) {
		// a list that scrolls inside the frame, the way a phone screen's does
		writeFrame(
			root,
			name,
			`export default function Frame() { return <main style={{ height: "100vh", overflow: "auto" }}><h1>${name}</h1><div style={{ height: 2000 }} /></main>; }\n`,
		);
		writeDesignFile(root, `frames/${name}/frame.json`, `${JSON.stringify(box)}\n`);
	}
	writeDesignFile(root, ".spool/state.json", `${JSON.stringify({ camera: { x: 100, y: 200, k: 0.75 } })}\n`);
	const daemon = await serveDaemon({
		spoolDir,
		version: "0.0.0-test",
		host: "127.0.0.1",
		port: 0,
		uiDir: await builtUi(),
		cloud: ana.cloud,
		teamNotice: () => {},
	});
	closeAfterTest(daemon);

	// Ben's own connection, which hears where Ana is
	const heard: PresenceState[] = [];
	const token = await ben.cloud.vault.read();
	const socket = ben.openSocket(syncUrl(link), token, {
		open: () => socket.send(encodeFrame({ type: "hello", protocol: PROTOCOL_VERSION, format: 2, since: 0 })),
		message: (data) => {
			const message = decodeFrame(data)?.message;
			if (message?.type === "presence" && message.state !== null) heard.push(message.state as PresenceState);
		},
		close: () => {},
	});

	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	await page.goto(`${daemon.url}/p/checkout`);
	await page.locator('[data-frame-label="home"]').waitFor({ timeout: 30_000 });
	await expect.poll(() => cloud.paths("checkout").includes("frames/menu/frame.json"), { timeout: 10_000 }).toBe(true);

	return {
		page,
		heard,
		/** The team says where somebody is, as the sync object relays it. */
		say: (person: typeof BEN, state: PresenceState | null, still = 0) =>
			cloud.forge("checkout", { type: "presence", person, state, still }),
	};
}

const box = async (page: Page, selector: string) => {
	const found = await page.locator(selector).boundingBox();
	if (found === null) throw new Error(`no ${selector}`);
	return found;
};

/** The screen point of the tip of someone's pointer. */
const tip = async (page: Page, accountId: string) =>
	page
		.locator(`[data-presence-cursor="${accountId}"] > div`)
		.first()
		.evaluate((element) => {
			const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec((element as HTMLElement).style.transform);
			const field = element.closest("[data-presence-layer]")?.getBoundingClientRect();
			return { x: Number(match?.[1]) + 1 + (field?.left ?? 0), y: Number(match?.[2]) + 1 + (field?.top ?? 0) };
		});

it("draws a teammate's named pointer, holds the name after they stop, and dims and fades them", {
	timeout: 120_000,
}, async () => {
	const { page, say } = await teamCanvas();
	say(BEN, at(320, 200));
	const cursor = page.locator('[data-presence-cursor="ben"]');
	await cursor.waitFor({ state: "attached" });
	await expect.poll(() => page.locator('[data-presence-pill="ben"]').textContent()).toBe("ben");
	const goal = await pagePointOf(page, { x: 320, y: 200 });
	await expect
		.poll(async () => Math.hypot((await tip(page, "ben")).x - goal.x, (await tip(page, "ben")).y - goal.y))
		.toBeLessThan(1);

	// moving: the pointer eases toward each new place, never past it, and the name is said. The page notes
	// every redraw of Ben as it lands, by the wall clock it shares with this test: reading the tip and the pill
	// from here is too slow and too late on a loaded machine to see the easing or time the hold.
	await page.evaluate(() => {
		const cursor = document.querySelector('[data-presence-cursor="ben"]');
		if (cursor === null) throw new Error("no pointer for ben");
		const note = () => {
			const pointer = cursor.querySelector<HTMLElement>(":scope > div");
			const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(pointer?.style.transform ?? "");
			const field = cursor.closest("[data-presence-layer]")?.getBoundingClientRect();
			return {
				at: Date.now(),
				x: Number(match?.[1]) + 1 + (field?.left ?? 0),
				y: Number(match?.[2]) + 1 + (field?.top ?? 0),
				said: cursor.querySelector('[data-presence-pill="ben"][data-presence-said]') !== null,
			};
		};
		const drawn = [note()];
		(window as unknown as { __benDrawn: typeof drawn }).__benDrawn = drawn;
		new MutationObserver(() => drawn.push(note())).observe(cursor, {
			subtree: true,
			attributes: true,
			attributeFilter: ["style", "data-presence-said"],
		});
	});
	const drawn = () =>
		page.evaluate(
			() => (window as unknown as { __benDrawn: { at: number; x: number; y: number; said: boolean }[] }).__benDrawn,
		);
	const stopped = Date.now();
	say(BEN, at(420, 260));
	const there = await pagePointOf(page, { x: 420, y: 260 });
	// still: the name holds about 1.4s, then goes
	const since = async () => {
		const [before, ...after] = await drawn();
		const moving = after.findIndex((draw) => draw.x !== before?.x || draw.y !== before?.y);
		return moving < 0 ? [] : after.slice(moving);
	};
	await expect.poll(async () => (await since()).some((draw) => !draw.said)).toBe(true);
	const path = await since();
	expect(path.every((point) => point.x <= there.x + 0.5 && point.y <= there.y + 0.5)).toBe(true);
	expect(new Set(path.map((point) => point.x)).size).toBeGreaterThan(1);
	// said from the moment the pointer set off, without a break, until it went quiet once
	const quiet = path.findIndex((draw) => !draw.said);
	expect(quiet).toBeGreaterThan(0);
	expect(path.slice(quiet).every((draw) => !draw.said)).toBe(true);
	// the team heard Ben after `stopped` and the pointer set off after that, so these bound the hold both ways
	const [setOff, wentQuiet] = [path[0], path[quiet]];
	if (setOff === undefined || wentQuiet === undefined) throw new Error("ben never went quiet");
	expect(wentQuiet.at - stopped).toBeGreaterThanOrEqual(1_350);
	expect(wentQuiet.at - setOff.at).toBeLessThan(2_200);
	// a press says it again
	say(BEN, at(420, 260, { pressed: true }));
	await expect.poll(() => page.locator('[data-presence-pill="ben"][data-presence-said]').count()).toBe(1);

	// idle: the pointer sinks to a third of its ink, and the list says for how long
	say(BEN, at(420, 260), 5 * 60_000);
	await expect.poll(() => cursor.getAttribute("data-presence-idle")).toBe("");
	await expect
		.poll(async () =>
			Number(
				await cursor
					.locator("> div")
					.first()
					.evaluate((element) => getComputedStyle(element).opacity),
			),
		)
		.toBeCloseTo(1 / 3, 2);
	await page.locator("[data-presence-count]").click();
	await expect.poll(() => page.locator('[data-presence-row="ben"]').textContent()).toContain("idle · 5m");
	await page.keyboard.press("Escape");

	// leaving fades them out
	say(BEN, null);
	await expect.poll(() => cursor.getAttribute("data-presence-gone")).toBe("");
	await expect.poll(() => cursor.count()).toBe(0);
	await expect.poll(() => page.locator("[data-presence-faces]").count()).toBe(0);
});

it("docks the name on a frame's label while they're inside it, lines several up, and flies it back", {
	timeout: 120_000,
}, async () => {
	const { page, say } = await teamCanvas();
	say(BEN, at(300, 200, { inside: "home" }));
	const pill = page.locator('[data-presence-pill="ben"]');
	await expect.poll(() => pill.getAttribute("data-presence-docked")).toBe("home");
	const label = await box(page, '[data-frame-label="home"]');
	const frameRight = (await pagePointOf(page, { x: HOME.x + HOME.w, y: 0 })).x;
	await expect
		.poll(
			async () =>
				Math.abs(
					(await box(page, '[data-presence-pill="ben"]')).x +
						(await box(page, '[data-presence-pill="ben"]')).width -
						frameRight,
				),
			{ timeout: 5_000 },
		)
		.toBeLessThan(3);
	const docked = await box(page, '[data-presence-pill="ben"]');
	expect(docked.y + docked.height / 2).toBeGreaterThan(label.y - 4);
	expect(docked.y + docked.height / 2).toBeLessThan(label.y + label.height + 4);
	// the pointer itself stays bare where it is, away from the name
	const pointer = await tip(page, "ben");
	expect(Math.hypot(pointer.x - docked.x, pointer.y - docked.y)).toBeGreaterThan(40);

	// a second person inside lines up to the left of the first; an idle one dims
	say(CLEO, at(200, 100, { inside: "home" }));
	await expect
		.poll(() => page.locator('[data-presence-pill="cleo"]').getAttribute("data-presence-docked"))
		.toBe("home");
	await page.waitForTimeout(800);
	const ben = await box(page, '[data-presence-pill="ben"]');
	const cleo = await box(page, '[data-presence-pill="cleo"]');
	expect(cleo.x + cleo.width).toBeLessThanOrEqual(ben.x);
	expect(Math.abs(cleo.y - ben.y)).toBeLessThan(1);
	say(CLEO, at(200, 100, { inside: "home" }), 5 * 60_000);
	await page.waitForTimeout(400);
	expect(
		Number(
			await page.locator('[data-presence-pill="cleo"]').evaluate((element) => getComputedStyle(element).opacity),
		),
	).toBeLessThan(0.6);

	// the docked names keep their size at any zoom
	const before = ben.height;
	await page.mouse.move(700, 600);
	await page.keyboard.down("Control");
	await page.mouse.wheel(0, 300);
	await page.keyboard.up("Control");
	await page.waitForTimeout(600);
	expect((await box(page, '[data-presence-pill="ben"]')).height).toBeCloseTo(before, 0);

	// stepping out flies the pill home to the pointer
	say(BEN, at(300, 500));
	await expect.poll(() => pill.getAttribute("data-presence-docked")).toBe(null);
	const home = await pagePointOf(page, { x: 300, y: 500 });
	await expect
		.poll(
			async () => {
				const now = await box(page, '[data-presence-pill="ben"]');
				return Math.hypot(now.x - (home.x + 13), now.y - (home.y + 17));
			},
			{ timeout: 5_000 },
		)
		.toBeLessThan(2);
});

it("closes a dragging teammate's pointer into a hand, and outlines what they move in their colour", {
	timeout: 120_000,
}, async () => {
	const { page, say } = await teamCanvas();
	say(BEN, at(300, 200));
	await page.locator('[data-presence-cursor="ben"]').waitFor({ state: "attached" });
	expect(await page.locator("[data-presence-hand]").count()).toBe(0);
	say(BEN, at(320, 210, { pressed: true, dragging: ["home"] }));
	await expect.poll(() => page.locator("[data-presence-hand]").count()).toBe(1);
	const outline = page.locator('[data-presence-outline="home"]');
	await outline.waitFor();
	expect(await outline.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe("rgb(234, 169, 74)");
	const framed = await box(page, '[data-presence-outline="home"]');
	const corner = await pagePointOf(page, { x: HOME.x, y: HOME.y });
	expect(Math.abs(framed.x - (corner.x - 3))).toBeLessThan(1.5);
	say(BEN, at(320, 210));
	await expect.poll(() => page.locator("[data-presence-hand]").count()).toBe(0);
	await expect.poll(() => outline.count()).toBe(0);
});

it("shows a teammate's clicks, drags and scrolls inside a live frame on their pointer", {
	timeout: 120_000,
}, async () => {
	const { page, say } = await teamCanvas();
	const ben = page.locator('[data-presence-cursor="ben"]');
	say(BEN, at(300, 200, { inside: "home", clicks: 2, scrolled: { x: 0, y: 0 } }));
	await ben.waitFor({ state: "attached" });
	// what they did before they were seen plays nothing
	await page.waitForTimeout(300);
	expect(await ben.locator("[data-presence-click]").count()).toBe(0);

	// the pointer goes on moving inside the frame, and a click bursts from it and is gone
	say(BEN, at(340, 220, { inside: "home", clicks: 3, scrolled: { x: 0, y: 0 } }));
	await expect.poll(() => ben.locator("[data-presence-click]").count()).toBe(1);
	const goal = await pagePointOf(page, { x: 340, y: 220 });
	await expect
		.poll(async () => Math.hypot((await tip(page, "ben")).x - goal.x, (await tip(page, "ben")).y - goal.y))
		.toBeLessThan(1);
	await expect.poll(() => ben.locator("[data-presence-click]").count(), { timeout: 3_000 }).toBe(0);

	// a press that moves is a drag: a hand, with a line behind it that fades once they let go
	say(BEN, at(340, 220, { inside: "home", pressed: true, clicks: 4, scrolled: { x: 0, y: 0 } }));
	for (let x = 350; x <= 420; x += 10) {
		say(BEN, at(x, 220, { inside: "home", pressed: true, clicks: 4, scrolled: { x: 0, y: 0 } }));
		await page.waitForTimeout(30);
	}
	await expect.poll(() => ben.locator("[data-presence-hand]").count()).toBe(1);
	await expect.poll(() => page.locator('[data-presence-trail="ben"] line').count()).toBeGreaterThan(1);
	say(BEN, at(420, 220, { inside: "home", clicks: 4, scrolled: { x: 0, y: 0 } }));
	await expect.poll(() => ben.locator("[data-presence-hand]").count()).toBe(0);
	await expect.poll(() => page.locator('[data-presence-trail="ben"]').count(), { timeout: 3_000 }).toBe(0);

	// scrolling turns the pointer into a mouse that says which way, and it turns back once they rest
	say(BEN, at(420, 220, { inside: "home", clicks: 4, scrolled: { x: 0, y: 120 } }));
	await expect.poll(() => ben.locator("[data-presence-scroll]").getAttribute("data-presence-scroll")).toBe("down");
	say(BEN, at(420, 220, { inside: "home", clicks: 4, scrolled: { x: 0, y: 60 } }));
	await expect.poll(() => ben.locator("[data-presence-scroll]").getAttribute("data-presence-scroll")).toBe("up");
	await expect.poll(() => ben.locator("[data-presence-scroll]").count(), { timeout: 3_000 }).toBe(0);
});

it("shows the faces of who's here, collapses a crowd into a count, and follows a face's view", {
	timeout: 120_000,
}, async () => {
	const { page, say } = await teamCanvas();
	say(BEN, at(300, 200, { view: { x: 800, y: 0, w: 640, h: 400 } }));
	const face = page.locator('[data-presence-face="ben"]');
	await face.waitFor();
	expect(await page.locator("[data-presence-count]").textContent()).toBe("1");

	await face.click();
	await page.locator('[data-presence-following="ben"]').waitFor();
	expect(await page.locator('[data-presence-following="ben"]').textContent()).toBe("following ben · esc");
	// the camera shows what Ben's does: the menu frame, whole
	const menuOnScreen = async () => {
		const left = await pagePointOf(page, { x: MENU.x, y: MENU.y });
		const right = await pagePointOf(page, { x: MENU.x + MENU.w, y: MENU.y + MENU.h });
		const viewport = await box(page, '[role="application"]');
		return { left, right, viewport };
	};
	await expect
		.poll(
			async () => {
				const { left, right, viewport } = await menuOnScreen();
				return Math.round(Math.abs(left.x + right.x - 2 * viewport.x - viewport.width));
			},
			{ timeout: 5_000 },
		)
		.toBeLessThan(3);
	// it tracks them as they look elsewhere
	say(BEN, at(300, 200, { view: { x: 0, y: 0, w: 640, h: 400 } }));
	await expect
		.poll(
			async () => {
				const viewport = await box(page, '[role="application"]');
				const middle = await pagePointOf(page, { x: 320, y: 200 });
				return Math.round(Math.abs(middle.x - viewport.x - viewport.width / 2));
			},
			{ timeout: 5_000 },
		)
		.toBeLessThan(3);

	// esc stops, and the camera stays where it was
	await page.keyboard.press("Escape");
	await expect.poll(() => page.locator("[data-presence-following]").count()).toBe(0);
	say(BEN, at(300, 200, { view: { x: 800, y: 0, w: 640, h: 400 } }));
	await page.waitForTimeout(500);
	const stayed = await pagePointOf(page, { x: 320, y: 200 });
	const viewport = await box(page, '[role="application"]');
	expect(Math.abs(stayed.x - viewport.x - viewport.width / 2)).toBeLessThan(3);

	// following again, a camera moved by hand stops it too
	await face.click();
	await page.locator('[data-presence-following="ben"]').waitFor();
	await page.mouse.move(700, 500);
	await page.mouse.wheel(200, 0);
	await expect.poll(() => page.locator("[data-presence-following]").count()).toBe(0);

	// someone on another page has a face and no pointer here
	say(CLEO, at(10, 10, { page: "elsewhere" }));
	await page.locator('[data-presence-face="cleo"]').waitFor();
	expect(await page.locator('[data-presence-cursor="cleo"]').count()).toBe(0);

	// a crowd collapses into a count past the faces that fit
	for (const name of ["dag", "eva", "finn", "gus"]) say({ accountId: name, name, color: "#58c6dc" }, at(10, 10));
	await expect.poll(() => page.locator("[data-presence-count]").textContent()).toBe("6");
	expect(await page.locator("[data-presence-face]").count()).toBe(3);
	expect(await page.locator("[data-presence-faces]").textContent()).toContain("+3");
	await page.locator("[data-presence-count]").click();
	expect(await page.locator("[data-presence-row]").count()).toBe(6);
});

it("tells the team where this canvas's person is, and what they drag", { timeout: 120_000 }, async () => {
	const { page, heard } = await teamCanvas();
	const point = await pagePointOf(page, { x: 200, y: 150 });
	await page.mouse.move(point.x, point.y);
	await expect.poll(() => heard.at(-1)?.pointer, { timeout: 5_000 }).toEqual({ x: 200, y: 150 });
	expect(heard.at(-1)).toMatchObject({ page: "", pressed: false, dragging: [], inside: null });
	expect(heard.at(-1)?.view).not.toBeNull();

	await page.mouse.down();
	await page.mouse.move(point.x + 40, point.y + 30, { steps: 6 });
	await expect.poll(() => heard.at(-1)).toMatchObject({ pressed: true, dragging: ["home"] });
	await page.mouse.up();
	await expect.poll(() => heard.at(-1)).toMatchObject({ pressed: false, dragging: [] });
	// never more often than the throttle lets it
	const count = heard.length;
	for (let step = 0; step < 20; step += 1) await page.mouse.move(point.x + step, point.y + 60);
	await page.waitForTimeout(300);
	expect(heard.length - count).toBeLessThan(15);
});

it("tells the team where this canvas's person is inside a live frame, each click, and their scrolling", {
	timeout: 120_000,
}, async () => {
	const { page, heard } = await teamCanvas();
	const inside = await pagePointOf(page, { x: 200, y: 150 });
	await page.mouse.dblclick(inside.x, inside.y);
	await expect.poll(() => heard.at(-1)?.inside, { timeout: 10_000 }).toBe("home");

	// the frame's own pointer, which the canvas never sees, is said in world units, once the camera has
	// finished bringing the frame in
	let there = await pagePointOf(page, { x: 260, y: 190 });
	await expect
		.poll(async () => {
			const was = there;
			await page.waitForTimeout(150);
			there = await pagePointOf(page, { x: 260, y: 190 });
			return Math.hypot(there.x - was.x, there.y - was.y);
		})
		.toBeLessThan(0.5);
	await page.mouse.move(there.x, there.y, { steps: 4 });
	await expect
		.poll(() => {
			const pointer = heard.at(-1)?.pointer;
			return pointer == null ? Number.POSITIVE_INFINITY : Math.hypot(pointer.x - 260, pointer.y - 190);
		})
		.toBeLessThan(2);
	const before = heard.at(-1)?.clicks ?? 0;
	await page.mouse.click(there.x, there.y);
	await page.mouse.click(there.x, there.y);
	await expect.poll(() => heard.at(-1)?.clicks).toBe(before + 2);
	// a press that moves before it's let go is a drag, not a click
	await page.mouse.down();
	await expect.poll(() => heard.at(-1)?.pressed).toBe(true);
	await page.mouse.move(there.x + 60, there.y + 20, { steps: 5 });
	await page.mouse.up();
	await expect.poll(() => heard.at(-1)?.pressed).toBe(false);
	expect(heard.at(-1)?.clicks).toBe(before + 2);

	// the list inside it scrolls, and that is said; the frame's scroll position never leaves it as such
	await page.mouse.wheel(0, 200);
	await expect.poll(() => heard.at(-1)?.scrolled?.y ?? 0).toBeGreaterThan(0);
	const down = heard.at(-1)?.scrolled?.y ?? 0;
	await page.mouse.wheel(0, -120);
	await expect.poll(() => heard.at(-1)?.scrolled?.y ?? 0).toBeLessThan(down);

	await page.keyboard.press("Escape");
	await expect.poll(() => heard.at(-1)?.inside).toBeNull();
	expect(heard.at(-1)?.scrolled).toBeNull();
});
