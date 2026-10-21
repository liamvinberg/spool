import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { initTeamProject } from "../init";
import { fakeTeam, TEAM_ORIGIN, teamWriter } from "../team-sync-test-harness";
import { testBrowser } from "../test-browser";
import { builtUi, closeAfterTest, makeTempDir, until, writeDesignFile, writeFrame } from "../test-helpers";
import { serveDaemon } from "./server";

/**
 * Restore in the History pane (spool#188), in the real canvas: from an open stretch in a frame's history, Restore cart…
 * asks once, offering the shared file cart imports that changed since, off, naming the other frame using it; the
 * restore lands on disk and at the team, says so with Undo and ⌘Z, and shows as a ↺ row of its own whose Undo this
 * restore puts it back again. In the project's history Restore… offers each frame and page with its file count and
 * the whole project, and a file restores from its line. Ana's canvas is the one looked at; Ben saves on his own.
 */

const NINE = Date.UTC(2026, 9, 21, 9);
const MINUTE = 60_000;
const BUTTON = 'export const OrderButton = () => <button type="button">Order</button>;\n';
const using = (name: string) =>
	`import { OrderButton } from "shared/ui/order-button";\n\nexport default function F() {\n\treturn <main style={{ padding: 40 }}><h1>${name}</h1><OrderButton /></main>;\n}\n`;

async function teamCanvas() {
	const cloud = fakeTeam();
	let now = NINE;
	cloud.clock(() => now);
	const ana = cloud.machine("ana");
	const ben = cloud.machine("ben");
	const spoolDir = join(makeTempDir(), ".spool");
	const checkout = join(makeTempDir(), "checkout");
	mkdirSync(checkout);
	execFileSync("git", ["init", "--quiet", "."], { cwd: checkout });
	const { root } = await initTeamProject(realpathSync(checkout), spoolDir, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: ana.request,
		openSocket: ana.openSocket,
	});
	writeDesignFile(root, "shared/ui/order-button.tsx", BUTTON);
	writeFrame(root, "cart", using("Cart"));
	writeDesignFile(root, "frames/cart/frame.json", '{ "x": 0, "y": 0, "w": 480, "h": 320 }\n');
	writeFrame(root, "menu", using("Menu"));
	writeDesignFile(root, "frames/menu/frame.json", '{ "x": 600, "y": 0, "w": 480, "h": 320 }\n');
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
	await until(() => cloud.file("checkout", "frames/menu/frame.json") !== undefined, 15_000);
	// an hour on, Ben changes cart and the order button it imports
	const bens = await teamWriter(cloud, ben, "checkout");
	now = NINE + 60 * MINUTE;
	await bens.save("frames/cart/frame.tsx", using("Ben's cart"));
	now = NINE + 61 * MINUTE;
	await bens.save("shared/ui/order-button.tsx", `${BUTTON}// ben\n`);
	await until(() => readFileSync(join(root, "design/frames/cart/frame.tsx"), "utf8").includes("Ben's cart"), 15_000);
	await until(() => readFileSync(join(root, "design/shared/ui/order-button.tsx"), "utf8").includes("ben"), 15_000);
	now = NINE + 70 * MINUTE;
	return { url: daemon.url, cloud, root };
}

it("restores a frame from its history, asking once, and undoes it from the toast, ⌘Z and its row", {
	timeout: 180_000,
}, async () => {
	const { url, cloud, root } = await teamCanvas();
	const cart = () => readFileSync(join(root, "design/frames/cart/frame.tsx"), "utf8");
	const page = await (await testBrowser()).newPage({ viewport: { width: 1600, height: 900 } });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`${url}/p/checkout`);
	await page.locator('[data-frame-label="cart"]').waitFor({ timeout: 30_000 });
	await page.locator('[data-frame-label="cart"]').click({ button: "right" });
	await page.getByRole("menuitem", { name: "History…" }).click();
	const pane = page.locator("[data-history-pane]");
	const rows = pane.locator("[data-history-stretch]:not([inert] *)");
	await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(2);

	// Ana's stretch, before Ben's: Restore cart… puts cart back to its end
	const anas = rows.nth(1);
	expect(await anas.locator("[data-history-who]").textContent()).toBe("ana");
	await anas.locator("button[aria-expanded]").first().click();
	await anas.getByRole("button", { name: "Restore cart…" }).click();
	const question = page.getByRole("dialog");
	await expect.poll(() => question.locator("h2").textContent()).toMatch(/^Restore cart to \d\d:\d\d \S+.*\?$/u);
	await expect
		.poll(() => question.locator("p").first().textContent(), { timeout: 15_000 })
		.toMatch(/^1 file goes back to how it stood after ana's saves ended\. It reaches the team as new saves/u);
	// the shared button cart imports changed since: offered, off, naming the other frame that uses it
	const shared = question.getByRole("checkbox", { name: /Also restore shared\/ui\/order-button\.tsx/u });
	expect(await shared.isChecked()).toBe(false);
	expect(await question.locator("[data-history-restore-shared]").textContent()).toContain(
		"cart imports it and it changed since. menu uses it too.",
	);
	await question.getByRole("button", { name: "Restore" }).click();

	await until(() => cart() === using("Cart"), 15_000);
	await until(() => cloud.file("checkout", "frames/cart/frame.tsx") === using("Cart"), 15_000);
	// unticked, the shared file stays as Ben left it
	expect(readFileSync(join(root, "design/shared/ui/order-button.tsx"), "utf8")).toContain("// ben");
	const toast = page.locator("[data-restored]");
	await expect.poll(() => toast.textContent(), { timeout: 10_000 }).toMatch(/^Restored cart to \d\d:\d\d/u);

	// the restore is a row of its own at the top: ↺, what went back to when
	await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(3);
	const restoreRow = rows.nth(0);
	expect(await restoreRow.locator("[data-history-restore-mark]").count()).toBe(1);
	expect(await restoreRow.locator("[data-history-who]").textContent()).toMatch(/^ana restored cart to \d\d:\d\d/u);
	expect(await restoreRow.locator("[data-history-chip]").allTextContents()).toEqual(["restore"]);

	// ⌘Z while the toast stands undoes it: Ben's cart is back
	await page
		.locator("main")
		.first()
		.click({ position: { x: 900, y: 700 } });
	await page.keyboard.press("ControlOrMeta+z");
	await until(() => cart() === using("Ben's cart"), 15_000);
	await until(() => cloud.file("checkout", "frames/cart/frame.tsx") === using("Ben's cart"), 15_000);

	// once more, ticking the shared file this time, and Undo from the toast
	await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(4);
	const anasAgain = rows.last();
	if ((await anasAgain.locator("button[aria-expanded]").first().getAttribute("aria-expanded")) !== "true")
		await anasAgain.locator("button[aria-expanded]").first().click();
	await anasAgain.getByRole("button", { name: "Restore cart…" }).click();
	await question.getByText(/^Also restore/u).click();
	await expect
		.poll(() => question.locator("p").first().textContent(), { timeout: 15_000 })
		.toMatch(/^2 files go back/u);
	await question.getByRole("button", { name: "Restore" }).click();
	await until(() => cart() === using("Cart"), 15_000);
	await until(() => readFileSync(join(root, "design/shared/ui/order-button.tsx"), "utf8") === BUTTON, 15_000);
	await toast.getByRole("button", { name: "Undo" }).click();
	await until(() => cart() === using("Ben's cart"), 15_000);
	await until(() => readFileSync(join(root, "design/shared/ui/order-button.tsx"), "utf8").includes("ben"), 15_000);

	// and a restore's own row undoes it
	await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(6);
	await anasAgain.getByRole("button", { name: "Restore cart…" }).click();
	await question.getByRole("button", { name: "Restore" }).click();
	await until(() => cart() === using("Cart"), 15_000);
	await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(7);
	await rows.nth(0).locator("button[aria-expanded]").first().click();
	await rows.nth(0).getByRole("button", { name: "Undo this restore" }).click();
	await until(() => cart() === using("Ben's cart"), 15_000);
	expect(errors).toEqual([]);
});

it("offers each frame and page a stretch touched and the whole project, with file counts, and a file from its line", {
	timeout: 180_000,
}, async () => {
	const { url, cloud, root } = await teamCanvas();
	const page = await (await testBrowser()).newPage({ viewport: { width: 1600, height: 900 } });
	await page.goto(`${url}/p/checkout`);
	await page.locator('[data-pane-tab="comments"]').waitFor({ timeout: 30_000 });
	await page.locator(".project-tab-label").first().click({ button: "right" });
	await page.getByRole("menuitem", { name: "History…" }).click();
	const pane = page.locator("[data-history-pane]");
	const rows = pane.locator("[data-history-stretch]:not([inert] *)");
	await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(2);
	const anas = rows.nth(1);
	await anas.locator("button[aria-expanded]").first().click();
	await anas.getByRole("button", { name: "Restore…" }).click();
	const menu = page.locator("[data-history-restore-menu]");
	const items = menu.getByRole("menuitem");
	await expect
		.poll(async () => (await items.allTextContents()).join(" | "), { timeout: 15_000 })
		.toMatch(/^cart1 file \| menu0 files \| root page1 file \| Whole project2 files$/u);
	await page.keyboard.press("Escape");

	// a file restores from its line, the line's Restore shown under the pointer
	const line = anas.locator('[data-history-file="shared/ui/order-button.tsx"]');
	await line.hover();
	await line.getByRole("button", { name: "Restore" }).click();
	const question = page.getByRole("dialog");
	await expect.poll(() => question.locator("h2").textContent()).toMatch(/^Restore order-button\.tsx to /u);
	await question.getByRole("button", { name: "Restore" }).click();
	await until(() => readFileSync(join(root, "design/shared/ui/order-button.tsx"), "utf8") === BUTTON, 15_000);
	await until(() => cloud.file("checkout", "shared/ui/order-button.tsx") === BUTTON, 15_000);
	expect(readFileSync(join(root, "design/frames/cart/frame.tsx"), "utf8")).toBe(using("Ben's cart"));
});
