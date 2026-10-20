import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync, rmSync } from "node:fs";
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
		root,
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
		/** Ben changes a comment: resolves, reopens, edits or deletes it. */
		benDoes: (change: Record<string, unknown>) => socket.send(encodeFrame({ ref: `b${++refs}`, ...change })),
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

/** The ids of the rows the Comments tab lists, in order. */
const rowsIn = (page: Page) =>
	page.locator("[data-comment-row]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-comment-row")));

it("lists every comment in the Comments tab, filters them, and flies to a pin, reading it", {
	timeout: 120_000,
}, async () => {
	const { cloud, page, benSays, benDoes } = await teamCanvas();
	benSays({ frame: "menu", at: { x: 40, y: 40 }, body: "Is this the menu?" });
	benSays({ frame: null, at: { x: 1600, y: 1200 }, body: "@ana where does it start?", mentions: ["ana"] });
	await expect.poll(() => cloud.comments("checkout").length, { timeout: 10_000 }).toBe(2);
	const [menu, field] = cloud.comments("checkout").map((comment) => comment.id);

	// the tab stands beside Properties and Agent, and says there is news while it is out of sight
	const tab = page.locator('[data-pane-tab="comments"]');
	await expect.poll(() => tab.getAttribute("aria-label"), { timeout: 10_000 }).toBe("Comments, unread comments");
	await tab.click();
	await expect.poll(() => rowsIn(page)).toEqual([field, menu]);
	expect(await page.locator("[data-comment-row][data-unread]").count()).toBe(2);
	expect(await tab.getAttribute("aria-label")).toBe("Comments");

	// for you: what mentions Ana; unread: both
	await page.locator("[data-comments-pane]").getByText("for you", { exact: false }).click();
	await expect.poll(() => rowsIn(page)).toEqual([field]);
	await page.locator("[data-comments-pane]").getByText("all", { exact: false }).first().click();

	// a row flies to the pin, opens it, and opening reads it, at the team too
	await page.locator(`[data-comment-row="${field}"]`).click();
	await page.locator(`[data-comment-card="${field}"]`).waitFor();
	const pin = await page.locator(`[data-comment-pin="${field}"]`).boundingBox();
	const view = page.viewportSize();
	expect(pin).not.toBeNull();
	expect(pin?.x ?? -1).toBeGreaterThan(0);
	expect(pin?.x ?? 1e9).toBeLessThan(view?.width ?? 0);
	expect(await page.locator(`[data-comment-card="${field}"] [data-comment-mention]`).textContent()).toBe("@ana");
	await expect.poll(() => cloud.reads("checkout", "ana").has(field ?? ""), { timeout: 10_000 }).toBe(true);
	await expect.poll(() => page.locator(`[data-comment-row="${field}"][data-unread]`).count()).toBe(0);

	// resolved by a teammate, it leaves the list and the canvas until the Resolved switch is on
	benDoes({ type: "comment-resolve", comment: menu });
	await expect.poll(() => rowsIn(page)).toEqual([field]);
	expect(await page.locator(`[data-comment-pin="${menu}"]`).count()).toBe(0);
	await page.getByRole("switch", { name: "Show resolved" }).check({ force: true });
	await expect.poll(() => rowsIn(page)).toEqual([field, menu]);
	expect(await page.locator(`[data-comment-row="${menu}"]`).textContent()).toContain("resolved");
	await page.locator(`[data-comment-pin="${menu}"][data-resolved]`).waitFor();
});

it("merges pins closer than 32px into a count that fans out, and Shift+C hides them all", {
	timeout: 120_000,
}, async () => {
	const { cloud, page, benSays } = await teamCanvas();
	benSays({ frame: null, at: { x: 700, y: 500 }, body: "one" });
	benSays({ frame: null, at: { x: 712, y: 510 }, body: "two" });
	benSays({ frame: "menu", at: { x: 300, y: 300 }, body: "far off" });
	await expect.poll(() => cloud.comments("checkout").length, { timeout: 10_000 }).toBe(3);
	const count = page.locator('[data-comment-cluster="2"]');
	await count.waitFor({ timeout: 10_000 });
	expect(await page.locator("[data-comment-pin]").count()).toBe(1);

	await count.click();
	await expect.poll(() => page.locator("[data-comment-pin]").count()).toBe(3);
	const [one] = cloud.comments("checkout").map((comment) => comment.id);
	await page.locator(`[data-comment-pin="${one}"]`).click();
	await page.locator(`[data-comment-card="${one}"]`).waitFor();
	await page.keyboard.press("Escape");

	await page.keyboard.press("Shift+C");
	await expect.poll(() => page.locator("[data-comment-pin], [data-comment-cluster]").count()).toBe(0);
	await page.keyboard.press("Shift+C");
	await expect.poll(() => page.locator("[data-comment-pin], [data-comment-cluster]").count()).toBe(2);
});

it("edits and deletes your own from its menu, marks a teammate's unread, and resolves from the card", {
	timeout: 120_000,
}, async () => {
	const { cloud, page, benSays } = await teamCanvas();
	await page.keyboard.press("c");
	const on = await pagePointOf(page, { x: 100, y: 60 });
	await page.mouse.click(on.x, on.y);
	const composer = page.locator("[data-comment-composer]");
	await composer.locator("textarea").fill("@be");
	// an @ lists the members to name; Enter picks the lit one
	await page.locator("[data-comment-mentions]").getByText("ben").waitFor();
	await composer.locator("textarea").press("Enter");
	expect(await composer.locator("textarea").inputValue()).toBe("@ben ");
	await composer.locator("textarea").pressSequentially("is this loud?");
	await composer.locator("textarea").press("Enter");
	await expect.poll(() => cloud.comments("checkout").length, { timeout: 10_000 }).toBe(1);
	const mine = cloud.comments("checkout")[0];
	expect(mine?.mentions).toMatchObject([{ accountId: "ben" }]);
	const id = mine?.id ?? "";

	// your own: Edit, Copy link, Delete
	const card = page.locator(`[data-comment-card="${id}"]`);
	await card.waitFor();
	await card.locator("[data-comment-message]").first().hover();
	await card.getByRole("button", { name: "Comment options" }).click();
	const menu = page.locator("[data-comment-menu]");
	expect(await menu.getByRole("menuitem").allTextContents()).toEqual(["Edit", "Copy link", "Delete comment"]);
	await menu.getByRole("menuitem", { name: "Edit" }).click();
	await card.locator('textarea[aria-label="Edit"]').fill("@ben is this too loud?");
	await card.locator('textarea[aria-label="Edit"]').press("Enter");
	await expect.poll(() => cloud.comments("checkout")[0]?.body).toBe("@ben is this too loud?");
	await expect.poll(() => card.locator("[data-comment-message]").first().textContent()).toContain("edited");

	// resolve from the card's head, and reopen from its line
	await card.getByRole("button", { name: "Resolve" }).click();
	await expect.poll(() => cloud.comments("checkout")[0]?.resolved?.by.accountId).toBe("ana");
	await card.locator("[data-comment-resolved]").getByText("Reopen").click();
	await expect.poll(() => cloud.comments("checkout")[0]?.resolved).toBeNull();

	// a teammate's: Copy link, Mark as unread, and Delete, which an editor may
	benSays({ frame: "menu", at: { x: 40, y: 40 }, body: "Bigger?" });
	await expect.poll(() => cloud.comments("checkout").length, { timeout: 10_000 }).toBe(2);
	const bens = cloud.comments("checkout")[1]?.id ?? "";
	await page.keyboard.press("Escape");
	await page.locator(`[data-comment-pin="${bens}"]`).click();
	const theirs = page.locator(`[data-comment-card="${bens}"]`);
	await theirs.waitFor();
	await expect.poll(() => cloud.reads("checkout", "ana").has(bens), { timeout: 10_000 }).toBe(true);
	await theirs.locator("[data-comment-message]").first().hover();
	await theirs.getByRole("button", { name: "Comment options" }).click();
	expect(await page.locator("[data-comment-menu]").getByRole("menuitem").allTextContents()).toEqual([
		"Copy link",
		"Mark as unread",
		"Delete comment",
	]);
	await page.getByRole("menuitem", { name: "Mark as unread" }).click();
	await theirs.waitFor({ state: "detached" });
	await expect.poll(() => cloud.reads("checkout", "ana").has(bens)).toBe(false);
	await page.locator(`[data-comment-pin="${bens}"][data-unread]`).waitFor();

	// deleting your own takes it off every canvas
	await page.locator(`[data-comment-pin="${id}"]`).click();
	await card.locator("[data-comment-message]").first().hover();
	await card.getByRole("button", { name: "Comment options" }).click();
	await page.getByRole("menuitem", { name: "Delete comment" }).click();
	await expect.poll(() => cloud.comments("checkout").map((comment) => comment.id)).toEqual([bens]);
	await expect.poll(() => page.locator(`[data-comment-pin="${id}"]`).count()).toBe(0);
});

it("says a comment's frame was edited since, compares, and keeps one whose frame was deleted on the field, dashed", {
	timeout: 120_000,
}, async () => {
	const { cloud, page, root, benSays } = await teamCanvas();
	// Ana's comment on home, made at its revision now
	await page.keyboard.press("c");
	const on = await pagePointOf(page, { x: 100, y: 60 });
	await page.mouse.click(on.x, on.y);
	const composer = page.locator("[data-comment-composer]");
	await composer.locator("textarea").fill("Two coffees reads like a heading.");
	await composer.locator("textarea").press("Enter");
	await expect.poll(() => cloud.comments("checkout").length, { timeout: 10_000 }).toBe(1);
	const id = cloud.comments("checkout")[0]?.id ?? "";
	const card = page.locator(`[data-comment-card="${id}"]`);
	await card.waitFor();
	expect(await card.locator("[data-comment-edited]").count()).toBe(0);

	// the frame is edited: the open card says so, and Compare shows the still it kept beside the frame now
	writeFrame(root, "home", "export default function Frame() { return <main><h1>One coffee</h1></main>; }\n");
	await card.locator("[data-comment-edited]").waitFor({ timeout: 20_000 });
	expect(await card.locator("[data-comment-edited]").textContent()).toContain("home edited since");
	await card.getByRole("button", { name: "Compare" }).click();
	expect(
		await card
			.locator("[data-comment-still]")
			.evaluateAll((all) => all.map((one) => one.getAttribute("data-comment-still"))),
	).toEqual(["then", "now"]);
	await card.getByRole("button", { name: "Hide" }).click();
	expect(await card.locator("[data-comment-still]").count()).toBe(0);
	await page.keyboard.press("Escape");
	// and its row in the Comments tab is marked so
	await page.locator('[data-pane-tab="comments"]').click();
	await page.locator(`[data-comment-row="${id}"] [data-comment-edited-since]`).waitFor();

	// Ben's comment on menu stays on the field where it stood once menu is deleted: dashed, marked, and said in its card
	benSays({ frame: "menu", at: { x: 40, y: 40 }, body: "Before it went." });
	await expect.poll(() => page.locator("[data-comment-pin]").count(), { timeout: 10_000 }).toBe(2);
	const ben = cloud.comments("checkout")[1]?.id ?? "";
	// measured once it has popped up: a pin grows from its tip as it comes
	const arrived = page.locator(`[data-comment-pin="${ben}"]`);
	await arrived.evaluate((one) =>
		Promise.all(one.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
	);
	const before = await arrived.boundingBox();
	rmSync(join(root, "design", "frames", "menu"), { recursive: true });
	const pin = page.locator(`[data-comment-pin="${ben}"][data-comment-dropped="menu"]`);
	await pin.waitFor({ timeout: 20_000 });
	await pin.evaluate((one) =>
		Promise.all(one.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
	);
	const after = await pin.boundingBox();
	expect(after?.x).toBeCloseTo(before?.x ?? 0, 0);
	expect(after?.y).toBeCloseTo(before?.y ?? 0, 0);
	await pin.click();
	expect(await page.locator(`[data-comment-card="${ben}"] [data-comment-dropped]`).textContent()).toContain(
		"menu was deleted today. The comment stays on the field, where its pin stood.",
	);
});
