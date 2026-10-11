import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CloudTeam, TeamPeople } from "../../cloud-teams";
import { testBrowser } from "../../test-browser";
import { buildEntry } from "./build-entry";

/**
 * Home as spool.page serves it at /<team>: the package's own build, a page that says who is signed in, and the team
 * API on the same origin. It is the Mac app's Home with no tabs above it, and every change goes to spool.page.
 */

const APP = "https://cloud.test";

const TEAMS: CloudTeam[] = [
	{ id: "t1", address: "devosurf", name: "Devosurf", role: "admin", logo: null, people: 3 },
	{ id: "t2", address: "client", name: "Client Co", role: "viewer", logo: null, people: 8 },
];

const PEOPLE: TeamPeople = {
	members: [
		{ accountId: "a1", email: "vic@devosurf.com", role: "admin", you: true },
		{ accountId: "a2", email: "sam@devosurf.com", role: "editor", you: false },
	],
	invites: [],
};

let built: string;
let entry: { file: string; css: string[] };

beforeAll(async () => {
	built = mkdtempSync(join(tmpdir(), "spool-home-"));
	const { build } = await import("vite");
	await build({
		configFile: join(process.cwd(), "vite.viewer.config.ts"),
		logLevel: "silent",
		build: { outDir: built, emptyOutDir: true },
	});
	entry = buildEntry(JSON.parse(readFileSync(join(built, "manifest.json"), "utf8")), "home.html");
}, 120_000);

afterAll(() => rmSync(built, { recursive: true, force: true }));

async function open(path: string): Promise<{ page: Page; asked: string[] }> {
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
	const asked: string[] = [];
	await page.route("**/*", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (url.origin !== APP) return route.abort();
		if (url.pathname.startsWith("/_viewer/")) {
			const file = join(built, url.pathname.slice("/_viewer/".length));
			const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "font/woff2";
			return route.fulfill({ body: readFileSync(file), contentType: type });
		}
		if (url.pathname.startsWith("/api/")) {
			asked.push(`${request.method()} ${url.pathname}`);
			if (request.method() !== "GET") return route.fulfill({ json: {} });
			if (url.pathname === "/api/teams")
				return route.fulfill({ json: { teams: TEAMS, invites: [], mayCreateTeam: false } });
			if (url.pathname === "/api/teams/devosurf/projects")
				return route.fulfill({
					json: {
						projects: [
							{ name: "checkout", url: `${APP}/devosurf/checkout`, repo: "github.com/devosurf/checkout" },
							{ name: "onboarding", url: `${APP}/devosurf/onboarding`, repo: null },
						],
					},
				});
			if (url.pathname === "/api/teams/devosurf/here")
				return route.fulfill({
					json: { projects: [{ name: "checkout", url: "", people: [{ name: "sam", color: "#7fd1b9" }] }] },
				});
			if (url.pathname === "/api/teams/devosurf/people") return route.fulfill({ json: PEOPLE });
			if (url.pathname === "/api/teams/devosurf/projects/checkout/cover")
				return route.fulfill({
					body: readFileSync(join(process.cwd(), "src/ui/agent-app-assets/claude.png")),
					contentType: "image/png",
				});
			return route.fulfill({ status: 404, json: { error: "not_found" } });
		}
		return route.fulfill({
			contentType: "text/html",
			body: `<!doctype html><html><head>${entry.css.map((css) => `<link rel="stylesheet" href="/_viewer/${css}">`).join("")}
<script type="module" src="/_viewer/${entry.file}"></script></head><body>
<script id="spool-home" type="application/json">${JSON.stringify({ account: "vic@devosurf.com" })}</script>
<div id="root"></div></body></html>`,
		});
	});
	await page.goto(`${APP}${path}`);
	return { page, asked };
}

describe("Home in a browser", () => {
	it("draws the app's Home for the team: switcher, nav, covers and who is inside", { timeout: 60_000 }, async () => {
		const { page } = await open("/devosurf");
		const checkout = page.getByRole("link", { name: "Open checkout" });
		await checkout.waitFor();
		expect(await checkout.getAttribute("href")).toBe("/devosurf/checkout");
		await page.getByRole("link", { name: "Open onboarding" }).waitFor();
		expect(await page.locator("aside").textContent()).toContain("Devosurf");
		expect(await page.getByRole("navigation", { name: "Home sections" }).textContent()).toMatch(
			/Projects.*People.*Settings/u,
		);
		expect(await page.locator("[data-here]").getAttribute("data-here")).toBe("sam");
		expect(await page.locator("main").textContent()).toContain("github.com/devosurf/checkout");
		// the tab strip is the Mac window's: a browser has its own
		expect(await page.locator("[data-tab-strip], [role=tablist]").count()).toBe(0);
		expect(await page.title()).toBe("Devosurf · spool");
		if (process.env.SPOOL_HOME_SHOT) await page.screenshot({ path: process.env.SPOOL_HOME_SHOT });
	});

	it("moves between its pages and teams at their own addresses", { timeout: 60_000 }, async () => {
		const { page, asked } = await open("/devosurf");
		await page.getByRole("button", { name: "People" }).click();
		await page.getByText("sam@devosurf.com").waitFor();
		expect(new URL(page.url()).pathname).toBe("/devosurf/people");
		await page.goBack();
		await page.getByRole("link", { name: "Open checkout" }).waitFor();
		expect(new URL(page.url()).pathname).toBe("/devosurf");
		// a viewer's team is a place in a browser, not a link away
		await page.getByRole("button", { name: /Devosurf/u }).click();
		await page.getByRole("menuitem", { name: /Client Co/u }).click();
		await expect.poll(() => new URL(page.url()).pathname).toBe("/client");
		await page.getByText("Client Co has no projects yet").waitFor();
		expect(await page.getByRole("navigation", { name: "Home sections" }).textContent()).not.toContain("Settings");
		expect(asked).toContain("GET /api/teams/devosurf/people");
	});

	it("changes a member's role at spool.page", { timeout: 60_000 }, async () => {
		const { page, asked } = await open("/devosurf/people");
		await page.getByRole("button", { name: "Role of sam@devosurf.com" }).click();
		await page.getByRole("menuitemcheckbox", { name: "Admin" }).click();
		await expect.poll(() => asked).toContain("PATCH /api/teams/devosurf/members/a2");
	});
});
