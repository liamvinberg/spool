import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { initTeamProject } from "../init";
import { fakeTeam, TEAM_ORIGIN, teamWriter } from "../team-sync-test-harness";
import { testBrowser } from "../test-browser";
import { builtUi, closeAfterTest, makeTempDir, until, writeDesignFile, writeFrame } from "../test-helpers";
import { serveDaemon } from "./server";

/**
 * History as versions (spool#214), in the real canvas: picking a version in the History pane draws the page as it
 * stood then, with what it did marked; Restore this version… lists each frame that differs from now, ticked, and
 * restores only those left ticked, as one restore with Undo and ⌘Z; a frame a version deleted comes back with Bring
 * back. Ana's canvas is the one looked at; Ben saves on his own.
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
	// an hour on, Ben changes cart, menu and the order button they import
	const bens = await teamWriter(cloud, ben, "checkout");
	now = NINE + 60 * MINUTE;
	await bens.save("frames/cart/frame.tsx", using("Ben's cart"));
	now = NINE + 61 * MINUTE;
	await bens.save("frames/menu/frame.tsx", using("Ben's menu"));
	now = NINE + 62 * MINUTE;
	await bens.save("shared/ui/order-button.tsx", `${BUTTON}// ben\n`);
	const text = (path: string) => readFileSync(join(root, "design", path), "utf8");
	await until(() => text("frames/cart/frame.tsx").includes("Ben's cart"), 15_000);
	await until(() => text("frames/menu/frame.tsx").includes("Ben's menu"), 15_000);
	await until(() => text("shared/ui/order-button.tsx").includes("ben"), 15_000);
	now = NINE + 70 * MINUTE;
	return { url: daemon.url, cloud, root, text, later: (minutes: number) => (now = NINE + minutes * MINUTE) };
}

async function projectHistory(url: string) {
	const page = await (await testBrowser()).newPage({ viewport: { width: 1600, height: 900 } });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`${url}/p/checkout`);
	await page.locator('[data-frame-label="cart"]').waitFor({ timeout: 30_000 });
	await page.locator('[data-pane-tab="comments"]').waitFor({ timeout: 30_000 });
	await page.locator(".project-tab-label").first().click({ button: "right" });
	await page.getByRole("menuitem", { name: "History…" }).click();
	const pane = page.locator("[data-history-pane]");
	const rows = pane.locator("[data-history-stretch]:not([inert] *)");
	return { page, errors, pane, rows };
}

it("shows a version on the canvas, restores one of its two frames, and undoes it from ⌘Z and the toast", {
	timeout: 180_000,
}, async () => {
	const { url, cloud, text } = await teamCanvas();
	const { page, errors, pane, rows } = await projectHistory(url);
	await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(2);
	// Current version is the top row, picked while no version shows
	const current = pane.locator("[data-history-now]");
	expect(await current.getAttribute("aria-pressed")).toBe("true");

	// Ana's version: the page as she left it, both frames added in it and marked so
	const anas = rows.nth(1);
	expect(await anas.locator("[data-history-who]").textContent()).toBe("ana");
	await anas.locator("button").first().click();
	const version = page.locator("[data-version]");
	await version.waitFor({ timeout: 15_000 });
	const cart = page.locator('[data-version-frame="cart"]');
	await expect.poll(() => cart.getAttribute("data-version-did"), { timeout: 15_000 }).toBe("added");
	expect(await page.locator('[data-version-frame="menu"] [data-version-chip]').textContent()).toBe("added");
	expect(await cart.locator("iframe").getAttribute("src")).toMatch(/\/history\/\d+\/frames\/cart$/u);
	expect(await current.getAttribute("aria-pressed")).toBe("false");
	await expect
		.poll(() => anas.locator("[data-history-touched]").textContent())
		.toMatch(/ · cart added · menu added$/u);
	const bar = page.locator("[data-version-bar]");
	expect(await bar.textContent()).toContain("2 of 2");

	// its restore lists both frames that differ, ticked, and the shared button, off; unticking menu restores cart alone
	await bar.getByRole("button", { name: "Restore this version…" }).click();
	const question = page.getByRole("dialog");
	await expect.poll(() => question.locator("h2").textContent()).toMatch(/^Restore \d\d:\d\d \S+.*\?$/u);
	const ticks = question.locator("[data-version-tick]");
	expect(await ticks.evaluateAll((all) => all.map((one) => one.getAttribute("data-version-tick")))).toEqual([
		"cart",
		"menu",
		"shared/ui/order-button.tsx",
	]);
	expect(await question.getByRole("checkbox", { name: /shared\/ui\/order-button\.tsx/u }).isChecked()).toBe(false);
	await question.getByText("menu", { exact: true }).click();
	await question.getByRole("button", { name: "Restore 1 of 2" }).click();

	await until(() => text("frames/cart/frame.tsx") === using("Cart"), 15_000);
	await until(() => cloud.file("checkout", "frames/cart/frame.tsx") === using("Cart"), 15_000);
	// unticked, menu and the shared file stay as Ben left them
	expect(text("frames/menu/frame.tsx")).toBe(using("Ben's menu"));
	expect(text("shared/ui/order-button.tsx")).toContain("// ben");
	// back to now, the toast says it, and cart rings once
	await expect.poll(() => version.count()).toBe(0);
	const toast = page.locator("[data-restored]");
	await expect.poll(() => toast.textContent(), { timeout: 10_000 }).toMatch(/^Restored cart to \d\d:\d\d/u);
	expect(await page.locator('[data-version-rang="cart"]').count()).toBe(1);

	// one restore, one row at the top: ↺, what went back to when
	await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(3);
	expect(await rows.nth(0).locator("[data-history-restore-mark]").count()).toBe(1);
	expect(await rows.nth(0).locator("[data-history-who]").textContent()).toMatch(/^ana restored cart to \d\d:\d\d/u);

	// ⌘Z while the toast stands undoes it: Ben's cart is back
	await page
		.locator("main")
		.first()
		.click({ position: { x: 900, y: 700 } });
	await page.keyboard.press("ControlOrMeta+z");
	await until(() => text("frames/cart/frame.tsx") === using("Ben's cart"), 15_000);
	await until(() => cloud.file("checkout", "frames/cart/frame.tsx") === using("Ben's cart"), 15_000);

	// once more, everything ticked, and Undo from the toast puts both back
	await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(4);
	await rows.last().locator("button").first().click();
	await bar.getByRole("button", { name: "Restore this version…" }).click();
	await question.getByRole("button", { name: "Restore", exact: true }).click();
	await until(() => text("frames/menu/frame.tsx") === using("Menu"), 15_000);
	expect(text("frames/cart/frame.tsx")).toBe(using("Cart"));
	await toast.getByRole("button", { name: "Undo" }).click();
	await until(() => text("frames/menu/frame.tsx") === using("Ben's menu"), 15_000);
	await until(() => text("frames/cart/frame.tsx") === using("Ben's cart"), 15_000);
	expect(errors).toEqual([]);
});

it("steps through versions with the keys, goes back to now with Esc, and says Same as now when nothing differs", {
	timeout: 180_000,
}, async () => {
	const { url } = await teamCanvas();
	const { page, pane, rows } = await projectHistory(url);
	await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(2);
	const current = pane.locator("[data-history-now]");
	const bar = page.locator("[data-version-bar]");
	// ↓ from Current version shows the newest: Ben's, which is how everything stands now
	await current.focus();
	await page.keyboard.press("ArrowDown");
	await expect.poll(() => rows.nth(0).locator("button").first().getAttribute("aria-pressed")).toBe("true");
	const same = bar.getByRole("button", { name: "Same as now" });
	await expect.poll(() => same.isDisabled(), { timeout: 15_000 }).toBe(true);
	await page.keyboard.press("ArrowDown");
	await expect.poll(() => rows.nth(1).locator("button").first().getAttribute("aria-pressed")).toBe("true");
	await expect.poll(() => bar.textContent(), { timeout: 15_000 }).toContain("Restore this version…");
	await page.keyboard.press("ArrowUp");
	await expect.poll(() => rows.nth(0).locator("button").first().getAttribute("aria-pressed")).toBe("true");
	await page.keyboard.press("Escape");
	await expect.poll(() => page.locator("[data-version]").count()).toBe(0);
	expect(await current.getAttribute("aria-pressed")).toBe("true");
});

it("brings back a frame a version deleted, as it stood just before", { timeout: 180_000 }, async () => {
	const { url, cloud, root, later } = await teamCanvas();
	// Ana deletes menu
	later(90);
	rmSync(join(root, "design/frames/menu"), { recursive: true });
	await until(() => cloud.file("checkout", "frames/menu/frame.tsx") === null, 15_000);
	const { page, rows } = await projectHistory(url);
	await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(3);
	await rows.nth(0).locator("button").first().click();
	const ghost = page.locator('[data-version-frame="menu"]');
	await expect.poll(() => ghost.getAttribute("data-version-did"), { timeout: 15_000 }).toBe("deleted");
	expect(await ghost.locator("[data-version-chip]").textContent()).toBe("deleted here");
	await ghost.getByRole("button", { name: "Bring back" }).click();
	const question = page.getByRole("dialog");
	expect(await question.locator("h2").textContent()).toBe("Bring back menu?");
	await question.getByRole("button", { name: "Bring back" }).click();
	await until(() => existsSync(join(root, "design/frames/menu/frame.tsx")), 15_000);
	expect(readFileSync(join(root, "design/frames/menu/frame.tsx"), "utf8")).toBe(using("Ben's menu"));
	await until(() => cloud.file("checkout", "frames/menu/frame.tsx") === using("Ben's menu"), 15_000);
	// nothing else went back
	expect(readFileSync(join(root, "design/frames/cart/frame.tsx"), "utf8")).toBe(using("Ben's cart"));
});
