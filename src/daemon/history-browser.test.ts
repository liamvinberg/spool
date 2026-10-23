import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { initTeamProject } from "../init";
import { fakeTeam, TEAM_ORIGIN, teamWriter } from "../team-sync-test-harness";
import { testBrowser } from "../test-browser";
import { builtUi, closeAfterTest, makeTempDir, until, writeDesignFile, writeFrame } from "../test-helpers";
import { serveDaemon } from "./server";

/**
 * The History pane on a team canvas (spool#187), in the real canvas: a frame's right-click opens its history, which
 * holds its own saves and those that reached it through the shared files it imports; × widens it to the project's;
 * the person pick folds the others away; a picked stretch opens to its files; ⇧⌘H closes it and opens it again.
 * Ana's canvas is the one looked at; Ben saves through a connection of his own.
 */

const NINE = Date.UTC(2026, 9, 21, 9);
const MINUTE = 60_000;
const BUTTON = 'export const OrderButton = () => <button type="button">Order</button>;\n';

async function teamCanvas(options: { moving?: boolean } = {}) {
	const cloud = fakeTeam();
	let now = NINE;
	cloud.clock(() => now);
	const ana = cloud.machine("ana");
	const ben = cloud.machine("ben");
	const spoolDir = join(makeTempDir(), ".spool");
	const checkout = join(makeTempDir(), "checkout");
	mkdirSync(checkout);
	execFileSync("git", ["init", "--quiet", "."], { cwd: checkout });
	// on a moved-in project, Ana's own files wait for her daemon, so the move is the project's first save
	const back = options.moving === true ? cloud.offline("ana") : () => {};
	const { root } = await initTeamProject(realpathSync(checkout), spoolDir, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: ana.request,
		openSocket: ana.openSocket,
	});
	// a project moved in from git: Ben's move made its first saves, before Ana's canvas opened it
	const bens = await teamWriter(cloud, ben, "checkout", { moving: options.moving === true });
	if (options.moving === true) await bens.save("shared/ui/notes.md", "moved in\n");
	back();
	writeDesignFile(root, "shared/ui/order-button.tsx", BUTTON);
	writeFrame(
		root,
		"cart",
		'import { OrderButton } from "shared/ui/order-button";\n\nexport default function Cart() {\n\treturn <main style={{ padding: 40 }}><h1>Cart</h1><OrderButton /></main>;\n}\n',
	);
	writeDesignFile(root, "frames/cart/frame.json", '{ "x": 0, "y": 0, "w": 480, "h": 320 }\n');
	writeFrame(root, "menu", "export default function Menu() {\n\treturn <main><h1>Menu</h1></main>;\n}\n");
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
	// fifty quiet minutes, then Ben changes the order button twice and the menu once
	now = NINE + 50 * MINUTE;
	await bens.save("shared/ui/order-button.tsx", `${BUTTON}// ben\n`);
	now = NINE + 52 * MINUTE;
	await bens.save("shared/ui/order-button.tsx", `${BUTTON}// ben again\n`);
	now = NINE + 53 * MINUTE;
	await bens.save(
		"frames/menu/frame.tsx",
		"export default function Menu() {\n\treturn <main><h1>Menu!</h1></main>;\n}\n",
	);
	await until(() => cloud.file("checkout", "frames/menu/frame.tsx")?.includes("Menu!") === true, 15_000);
	return { url: daemon.url, cloud, ben };
}

it("opens a frame's history from its right-click, widens it to the project's, and filters it by person", {
	timeout: 120_000,
}, async () => {
	const { url } = await teamCanvas();
	const page = await (await testBrowser()).newPage({ viewport: { width: 1600, height: 900 } });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`${url}/p/checkout`);
	await page.locator('[data-frame-label="cart"]').waitFor({ timeout: 30_000 });
	await page.locator('[data-pane-tab="comments"]').waitFor({ timeout: 30_000 });

	await page.locator('[data-frame-label="cart"]').click({ button: "right" });
	await page.getByRole("menuitem", { name: "History…" }).click();
	const pane = page.locator("[data-history-pane]");
	await expect.poll(() => pane.locator("[data-history-scope]").textContent(), { timeout: 15_000 }).toBe("cart");
	// the rows shown: one the person pick folded away is inert
	const rows = pane.locator("[data-history-stretch]:not([inert] *)");
	await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(2);

	// Ben's stretch: the order button reached cart through its import; his menu save isn't cart's
	const bens = rows.nth(0);
	expect(await bens.locator("[data-history-who]").textContent()).toBe("ben");
	expect(await bens.locator("[data-history-chip]").allTextContents()).toEqual(["through order-button.tsx"]);
	expect(await bens.locator("[data-history-saves]").textContent()).toBe("2");
	// Ana's, under fifty quiet minutes
	expect(await rows.nth(1).locator("[data-history-who]").textContent()).toBe("ana");
	expect(await rows.nth(1).locator("[data-history-quiet]").textContent()).toBe("50 min quiet");

	// picked, the canvas shows it; picked again, now
	await bens.locator("button").first().click();
	await page.locator("[data-version-bar]").waitFor({ timeout: 10_000 });
	await bens.locator("button").first().click();
	await expect.poll(() => page.locator("[data-version-bar]").count()).toBe(0);

	// × widens it to the project's, where Ben's menu save shows too
	await pane.getByRole("button", { name: "Show the whole project" }).click();
	await expect.poll(() => pane.locator("[data-history-scope]").textContent()).toBe("checkout");
	await expect
		.poll(() => rows.nth(0).locator("[data-history-touched]").textContent(), { timeout: 15_000 })
		.toBe("3 min · menu, order-button.tsx");
	expect(await rows.nth(0).locator("[data-history-chip]").count()).toBe(0);

	// Ben's alone: Ana's stretch folds away
	await pane.getByRole("button", { name: "Whose saves" }).click();
	await page.locator("[data-history-people]").getByRole("menuitem", { name: /^ben/ }).click();
	await expect.poll(() => rows.count()).toBe(1);
	expect(await pane.locator("[data-history-end]").textContent()).toContain(
		"Saves are kept 90 days. Today's files are always kept.",
	);

	// ⇧⌘H closes its side while it shows, and opens it on History again
	await page
		.locator("main")
		.first()
		.click({ position: { x: 900, y: 600 } });
	await page.keyboard.press("Meta+Shift+KeyH");
	await expect.poll(() => pane.isVisible()).toBe(false);
	await page.keyboard.press("Meta+Shift+KeyH");
	await expect.poll(() => pane.isVisible()).toBe(true);
	expect(errors).toEqual([]);
});

it("opens the project's history from its tab's menu, ending on where it moved in from", {
	timeout: 120_000,
}, async () => {
	// as though Ben had moved it in from git: his saves are the move's, then his daemon reports its commit
	const { url, ben } = await teamCanvas({ moving: true });
	const commit = "4e1c9a2b7d3f00112233445566778899aabbccdd";
	const told = await ben.request.fetch?.(`${TEAM_ORIGIN}/api/teams/devosurf/projects/checkout/history/moved-in`, {
		method: "PUT",
		headers: { authorization: `Bearer ${await ben.cloud.vault.read()}`, "content-type": "application/json" },
		body: JSON.stringify({ commit }),
	});
	expect(told?.status).toBe(204);
	const page = await (await testBrowser()).newPage({ viewport: { width: 1600, height: 900 } });
	await page.goto(`${url}/p/checkout`);
	await page.locator('[data-pane-tab="comments"]').waitFor({ timeout: 30_000 });
	expect(await page.locator('[data-pane-tab="history"]').getAttribute("aria-selected")).toBe("false");

	await page.locator(".project-tab-label").first().click({ button: "right" });
	await page.getByRole("menuitem", { name: "History…" }).click();
	const pane = page.locator("[data-history-pane]");
	await expect.poll(() => pane.isVisible(), { timeout: 15_000 }).toBe(true);
	expect(await pane.locator("[data-history-scope]").textContent()).toBe("checkout");
	// Ben's later stretch, Ana's, and Ben's move under them
	await expect.poll(() => pane.locator("[data-history-stretch]").count(), { timeout: 15_000 }).toBe(3);
	expect(await pane.locator("[data-history-end] span").allTextContents()).toEqual([
		"Saves are kept 90 days. Today's files are always kept.",
		"Moved in from git on Wed 21 Oct by ben, in 4e1c9a2. Older history is in the repo.",
	]);
});
