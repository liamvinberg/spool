import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import { initTeamProject } from "../init";
import { encodeFrame, PROTOCOL_VERSION } from "../team-sync-protocol";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { testBrowser } from "../test-browser";
import { builtUi, closeAfterTest, makeTempDir, pagePointOf, writeDesignFile, writeFrame } from "../test-helpers";
import { serveDaemon } from "./server";
import { syncUrl } from "./team-sync";

/**
 * The Comment tool on a team canvas (spool#169), driven in the real canvas: C takes it and a held C borrows it, V
 * and Esc leave it, a press places a pin on a frame or on the field and opens the composer there, Enter sends it to
 * the team, and a pin opens its card, where a teammate's reply arrives live. Ana's canvas is the one looked at; Ben
 * is a connection of his own to the same fake team.
 */

const HOME = { x: 0, y: 0, w: 640, h: 400 };
const MENU = { x: 800, y: 0, w: 640, h: 400 };

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
		writeFrame(
			root,
			name,
			`export default function Frame() { return <main style={{ padding: 40 }}><h1>${name}</h1><p>Two coffees</p></main>; }\n`,
		);
		writeDesignFile(root, `frames/${name}/frame.json`, `${JSON.stringify(box)}\n`);
	}
	// a page standing on the field, which the Comment tool still goes inside
	writeFrame(root, "shop/cart", "export default function Cart() { return <main>cart</main>; }\n");
	writeDesignFile(root, "canvas.json", `${JSON.stringify({ places: { shop: { x: 0, y: 600 } } })}\n`);
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

	// Ben's own connection to the team, which writes as Ben
	const token = await ben.cloud.vault.read();
	let refs = 0;
	const socket = ben.openSocket(syncUrl(link), token, {
		open: () => socket.send(encodeFrame({ type: "hello", protocol: PROTOCOL_VERSION, format: 2, since: 0 })),
		message: () => {},
		close: () => {},
	});

	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	await page.goto(`${daemon.url}/p/checkout`);
	await page.locator('[data-frame-label="home"]').waitFor({ timeout: 30_000 });
	await page.locator('[aria-label="comment"]').waitFor({ timeout: 10_000 });

	return {
		cloud,
		page,
		offline: () => cloud.offline("ana"),
		/** Ben comments, from his own Mac. */
		benSays: (comment: Record<string, unknown>) =>
			socket.send(
				encodeFrame({
					type: "comment-post",
					ref: `b${++refs}`,
					page: "",
					frame: null,
					at: { x: 0, y: 0 },
					element: null,
					revision: null,
					...comment,
				}),
			),
		/** Ben replies under a comment. */
		benReplies: (comment: string, body: string) =>
			socket.send(encodeFrame({ type: "comment-reply", ref: `b${++refs}`, comment, body })),
	};
}

/** The tool whose button is pressed. */
const toolIn = (page: Page) =>
	page.locator('[aria-label="canvas tools"] [aria-pressed="true"]').getAttribute("aria-label");

it("takes the Comment tool with C, borrows it while C is held, and leaves it on V and Esc", {
	timeout: 120_000,
}, async () => {
	const { page } = await teamCanvas();
	expect(await toolIn(page)).toBe("select");

	await page.keyboard.press("c");
	expect(await toolIn(page)).toBe("comment");
	await page.keyboard.press("v");
	expect(await toolIn(page)).toBe("select");
	await page.keyboard.press("c");
	await page.keyboard.press("Escape");
	expect(await toolIn(page)).toBe("select");

	// held, it is borrowed from the tool you had and handed back when let go
	await page.keyboard.press("e");
	expect(await toolIn(page)).toBe("edit");
	await page.keyboard.down("c");
	expect(await toolIn(page)).toBe("comment");
	await page.waitForTimeout(450);
	await page.keyboard.up("c");
	expect(await toolIn(page)).toBe("edit");

	// placing under a held C hands back the pointer, and letting go the tool C took over from
	await page.keyboard.down("c");
	const field = await pagePointOf(page, { x: 700, y: 500 });
	await page.mouse.click(field.x, field.y);
	await page.locator("[data-comment-composer]").waitFor();
	expect(await page.locator("[data-comment-composer]").textContent()).toContain("on the field");
	expect(await toolIn(page)).toBe("select");
	await page.waitForTimeout(350);
	await page.keyboard.up("c");
	expect(await toolIn(page)).toBe("edit");
	// Esc in the composer puts it down, unsent
	await page.locator("[data-comment-composer] textarea").press("Escape");
	await page.locator("[data-comment-composer]").waitFor({ state: "detached" });
});

it("places a pin on a frame at the frame's own point, sends it on Enter, and shows a teammate's live", {
	timeout: 120_000,
}, async () => {
	const { cloud, page, benSays, benReplies } = await teamCanvas();
	await page.keyboard.press("c");
	const on = await pagePointOf(page, { x: 100, y: 60 });
	await page.mouse.click(on.x, on.y);
	const composer = page.locator("[data-comment-composer]");
	await composer.waitFor();
	expect(await composer.textContent()).toContain("on home");
	// placing hands back the pointer
	expect(await toolIn(page)).toBe("select");
	await composer.locator("textarea").fill("Two coffees reads like a heading.");
	await composer.locator("textarea").press("Enter");

	await expect.poll(() => cloud.comments("checkout").length, { timeout: 10_000 }).toBe(1);
	const [sent] = cloud.comments("checkout");
	expect(sent).toMatchObject({ page: "", frame: "home", body: "Two coffees reads like a heading." });
	expect(sent?.at.x).toBeCloseTo(100, 0);
	expect(sent?.at.y).toBeCloseTo(60, 0);
	expect(sent?.revision).toMatch(/^[0-9a-f]{64}$/u);
	expect(sent?.element).toMatchObject({ path: "design/frames/home/frame.tsx" });

	// the card opens on the comment just made, at its pin
	const id = sent?.id ?? "";
	const card = page.locator(`[data-comment-card="${id}"]`);
	await card.waitFor();
	expect(await card.locator("[data-comment-body]").first().textContent()).toBe("Two coffees reads like a heading.");
	const pin = await page.locator(`[data-comment-pin="${id}"]`).boundingBox();
	expect(pin?.x).toBeCloseTo(on.x, 0);
	expect((pin?.y ?? 0) + (pin?.height ?? 0)).toBeCloseTo(on.y, 0);

	// a teammate's reply arrives in the open card, in order
	benReplies(id, "Agreed, make it smaller.");
	await expect
		.poll(() => card.locator("[data-comment-body]").allTextContents())
		.toEqual(["Two coffees reads like a heading.", "Agreed, make it smaller."]);
	// and a reply of one's own goes after it
	await card.locator('textarea[aria-label="Reply"]').fill("On it.");
	await card.locator('textarea[aria-label="Reply"]').press("Enter");
	await expect
		.poll(() => card.locator("[data-comment-body]").allTextContents())
		.toEqual(["Two coffees reads like a heading.", "Agreed, make it smaller.", "On it."]);

	// a teammate's comment on the field arrives as a pin, which opens its card under any tool
	benSays({ frame: null, at: { x: 700, y: 500 }, body: "Where does the flow start?" });
	await expect.poll(() => page.locator("[data-comment-pin]").count()).toBe(2);
	await page.keyboard.press("Escape");
	await card.waitFor({ state: "detached" });
	const ben = cloud.comments("checkout")[1]?.id ?? "";
	await page.locator(`[data-comment-pin="${ben}"]`).click();
	await page.locator(`[data-comment-card="${ben}"]`).waitFor();
	expect(await page.locator(`[data-comment-card="${ben}"]`).textContent()).toContain("on the field");
});

it("goes inside a page standing on the field rather than commenting on it", { timeout: 120_000 }, async () => {
	const { page } = await teamCanvas();
	const shop = page.locator('[data-page-object="shop"]');
	await shop.waitFor({ timeout: 20_000 });
	await page.keyboard.press("c");
	const box = await shop.boundingBox();
	if (box === null) throw new Error("no page object");
	await page.mouse.click(box.x + box.width / 2, box.y + 40);
	await page.locator('[data-frame-label="shop/cart"]').waitFor({ timeout: 10_000 });
	expect(await page.locator("[data-comment-composer]").count()).toBe(0);
});

it("shows the comments it had offline, and says it's offline rather than sending", { timeout: 120_000 }, async () => {
	const { cloud, page, benSays, offline } = await teamCanvas();
	benSays({ frame: "menu", at: { x: 40, y: 40 }, body: "Before the train." });
	await expect.poll(() => page.locator("[data-comment-pin]").count(), { timeout: 10_000 }).toBe(1);

	offline();
	await page.keyboard.press("c");
	const on = await pagePointOf(page, { x: 200, y: 100 });
	await page.mouse.click(on.x, on.y);
	const composer = page.locator("[data-comment-composer]");
	await composer.waitFor();
	await composer.locator("[data-comment-offline]").waitFor({ timeout: 10_000 });
	await composer.locator("textarea").fill("In the tunnel.");
	expect(await composer.getByRole("button", { name: "Comment" }).isDisabled()).toBe(true);
	await composer.locator("textarea").press("Enter");
	await page.waitForTimeout(300);
	expect(cloud.comments("checkout")).toHaveLength(1);
	// the words stay where they were written
	expect(await composer.locator("textarea").inputValue()).toBe("In the tunnel.");
	expect(await page.locator("[data-comment-pin]").count()).toBe(1);
});
