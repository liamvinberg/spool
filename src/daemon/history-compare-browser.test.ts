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
 * Compare with now in the real canvas (spool#189): in cart's history, hovering Ana's stretch outlines cart; Compare
 * with now stands cart as it was at her stretch's end, labelled with its moment, with today's cart slid aside
 * labelled now, each showing its own version of cart and of the order button it imports; Done puts the canvas back.
 * Under reduced motion nothing moves. Ana's canvas is the one looked at; Ben saves on his own.
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
	await bens.save("shared/ui/order-button.tsx", BUTTON.replace(">Order<", ">Order now<"));
	await until(() => readFileSync(join(root, "design/frames/cart/frame.tsx"), "utf8").includes("Ben's cart"), 15_000);
	await until(() => readFileSync(join(root, "design/shared/ui/order-button.tsx"), "utf8").includes("now"), 15_000);
	now = NINE + 70 * MINUTE;
	return { url: daemon.url };
}

async function cartHistory(url: string, reducedMotion: "reduce" | "no-preference") {
	const page = await (await testBrowser()).newPage({ viewport: { width: 1600, height: 900 }, reducedMotion });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`${url}/p/checkout`);
	await page.locator('[data-frame-label="cart"]').waitFor({ timeout: 30_000 });
	await page.locator('[data-frame-label="cart"]').click({ button: "right" });
	await page.getByRole("menuitem", { name: "History…" }).click();
	const rows = page.locator("[data-history-pane] [data-history-stretch]:not([inert] *)");
	await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(2);
	return { page, errors, anas: rows.nth(1) };
}

it("compares a frame with now on the canvas, each labelled, and puts the canvas back", {
	timeout: 180_000,
}, async () => {
	const { url } = await teamCanvas();
	const { page, errors, anas } = await cartHistory(url, "no-preference");
	expect(await anas.locator("[data-history-who]").textContent()).toBe("ana");

	// her stretch under the pointer outlines the frame it touched, and only that one
	await anas.hover();
	await expect.poll(() => page.locator("[data-history-touched-frame]").count()).toBe(1);
	expect(await page.locator('[data-history-touched-frame="cart"]').count()).toBe(1);

	await anas.locator("button[aria-expanded]").first().click();
	await anas.getByRole("button", { name: "Compare with now" }).click();
	const compare = page.locator('[data-compare][data-compare-shown="true"]');
	await compare.waitFor({ timeout: 15_000 });
	const then = compare.locator('[data-compare-then="cart"]');
	const now = compare.locator('[data-compare-now="cart"]');
	expect(await then.locator("[data-compare-label]").textContent()).toMatch(/^cart\d\d:\d\d \S+/u);
	expect(await now.locator("[data-compare-label]").textContent()).toBe("cartnow");
	// the old cart with the old button, today's with today's
	const old = page.frameLocator('[data-compare-then="cart"] iframe');
	await expect.poll(() => old.locator("h1").textContent(), { timeout: 15_000 }).toBe("Cart");
	expect(await old.locator("button").textContent()).toBe("Order");
	const today = page.frameLocator('[data-compare-now="cart"] iframe');
	await expect.poll(() => today.locator("h1").textContent(), { timeout: 15_000 }).toBe("Ben's cart");
	expect(await today.locator("button").textContent()).toBe("Order now");
	// today's slid aside, past the old one
	await expect
		.poll(async () => {
			const [a, b] = await Promise.all([then.boundingBox(), now.boundingBox()]);
			return a !== null && b !== null && b.x >= a.x + a.width;
		})
		.toBe(true);
	expect(await compare.getByText("Comparing with now").count()).toBe(1);

	await compare.getByRole("button", { name: "Done" }).click();
	await expect.poll(() => page.locator("[data-compare]").count(), { timeout: 5_000 }).toBe(0);
	expect(errors).toEqual([]);
});

it("moves nothing under reduced motion", { timeout: 180_000 }, async () => {
	const { url } = await teamCanvas();
	const { page, anas } = await cartHistory(url, "reduce");
	await anas.locator("button[aria-expanded]").first().click();
	await anas.getByRole("button", { name: "Compare with now" }).click();
	const compare = page.locator('[data-compare][data-compare-shown="true"]');
	await compare.waitFor({ timeout: 15_000 });
	const durations = await compare.evaluate((layer) =>
		[layer, ...layer.querySelectorAll("*")].map((element) => getComputedStyle(element).transitionDuration),
	);
	expect(durations.every((duration) => duration.split(", ").every((one) => one === "0s"))).toBe(true);
});
