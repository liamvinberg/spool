import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import type { Page } from "playwright-core";
import { describe, expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi } from "../test-helpers";

/**
 * Home with its sidebar of places and invite line in a real Chromium, laid out by the app's own stylesheet.
 * The cloud is the page's own state: the components are Home's, the teams are a fixture.
 */
async function home(
	motion: "reduce" | "no-preference" = "reduce",
	{ width = 1280, everywhere = false }: { width?: number; everywhere?: boolean } = {},
): Promise<Page> {
	const bundle = await build({
		stdin: {
			contents: `
				import { createElement, useState } from "react";
				import { createRoot } from "react-dom/client";
				import { Home } from "./src/ui/home";
				import { HomePlaces, InviteLine, TeamProjects } from "./src/ui/teams";
				const teams = {
					state: "ready",
					origin: "https://spool.page",
					mayCreateTeam: true,
					invites: [],
					teams: [
						{ id: "h", address: "harbour-bank", name: "Harbour Bank", role: "viewer", logo: null, people: 6 },
						{ id: "n", address: "northlight", name: "Northlight", role: "editor", logo: null, people: 2 },
						{ id: "t", address: "tidemark", name: "Tidemark", role: "admin", logo: null, people: 5 },
					],
				};
				const invite = { id: "i", team: { address: "kaffe-co", name: "Kaffe Co", logo: null }, role: "editor", invitedBy: "kim@kaffe.co", expiresAt: 0 };
				const said = (what) => { document.body.dataset.said = (document.body.dataset.said ?? "") + what + ";"; };
				function App() {
					const [scope, setScope] = useState(null);
					const [page, setPage] = useState("projects");
					const [query, setQuery] = useState("");
					const [invites, setInvites] = useState([invite]);
					const current = teams.teams.find((team) => team.address === scope) ?? null;
					const notice = invites.length ? createElement("div", { className: "pj-invites" }, invites.map((one) =>
						createElement(InviteLine, {
							key: one.id,
							invite: one,
							onJoin: async () => { said("join:" + one.id); setInvites([]); },
							onDecline: async () => { said("decline:" + one.id); setInvites([]); },
						}))) : undefined;
					return createElement(Home, {
						projects: [{ root: "/w/kaffe", name: "kaffe", openedAt: new Date().toISOString(), frameCount: 3, covers: [] }],
						onOpenProject() {}, onForgetProject() {}, onTrashProject() {}, onRenameProject() {},
						onStart() {}, onFolder() {},
						places: createElement(HomePlaces, {
							teams: teams.teams,
							current: scope,
							page,
							onTeam: (address) => { setScope(address); setPage("projects"); },
							onPage: setPage,
							own: { current: scope === null, onOwn: () => setScope(null) },
							onNewTeam: () => said("new"),
						}),
						place: scope ?? "/",
						everywhere: ${everywhere} ? {
							recent: false, onRecent() {}, query, onQuery: setQuery, onOwn: () => setScope(null),
							projects: [], teams: [], away: [], drawAway: () => null,
						} : undefined,
						notice,
						team: current ? { main: createElement(TeamProjects, { team: current, notice }) } : undefined,
					});
				}
				createRoot(document.getElementById("root")).render(createElement(App));
			`,
			resolveDir: process.cwd(),
		},
		bundle: true,
		write: false,
		outdir: "out",
		format: "iife",
		jsx: "automatic",
		loader: { ".css": "empty" },
		define: { "process.env.NODE_ENV": '"production"' },
	});
	const browser = await testBrowser();
	const page = await browser.newPage({ reducedMotion: motion, viewport: { width, height: 800 } });
	await page.setContent(`<div id="root" style="height: 800px"></div>`);
	const assets = join(await builtUi(), "assets");
	for (const file of readdirSync(assets).filter((name) => name.endsWith(".css")))
		await page.addStyleTag({ content: readFileSync(join(assets, file), "utf8") });
	for (const file of bundle.outputFiles) await page.addScriptTag({ content: file.text });
	await page.getByRole("button", { name: "Your projects" }).waitFor();
	return page;
}

/** A sidebar place's row, as a person reads it: not the pages folded away under a team they're not in. */
const places = (page: Page) =>
	page
		.locator(".pj-places :is(button, a):not([aria-hidden=true] *)")
		.evaluateAll((rows) => rows.map((row) => row.getAttribute("title")));

it("lists every place in the sidebar, a watched team marked with an eye, and opens the team you're in to its pages", async () => {
	const page = await home();
	expect(await places(page)).toEqual(["Harbour Bank", "Northlight", "Tidemark", "Your projects", "New team…"]);
	expect(await page.locator("[aria-haspopup=menu]", { hasText: "Your projects" }).count()).toBe(0);
	expect(await page.locator("[data-place=harbour-bank] [data-watch]").isVisible()).toBe(true);
	expect(await page.locator("[data-place=tidemark] [data-watch]").count()).toBe(0);

	await page.getByRole("button", { name: "Tidemark" }).click();
	await page.getByRole("heading", { name: "Tidemark", exact: true }).waitFor();
	expect(await places(page)).toEqual([
		"Harbour Bank",
		"Northlight",
		"Tidemark",
		"Projects",
		"People",
		"Settings",
		"Your projects",
		"New team…",
	]);
	// the pages sit under the team's row, set in from it
	const team = await page.getByRole("button", { name: "Tidemark" }).boundingBox();
	const people = await page.getByRole("button", { name: "People" }).boundingBox();
	if (!team || !people) throw new Error("missing layout");
	expect(people.y).toBeGreaterThan(team.y);
	expect(await page.getByText("Tidemark has no projects on this Mac yet").isVisible()).toBe(true);
	expect(await page.getByRole("button", { name: "Open kaffe" }).count()).toBe(0);

	await page.getByRole("button", { name: "Northlight" }).click();
	await expect
		.poll(() => places(page))
		.toEqual(["Harbour Bank", "Northlight", "Projects", "People", "Tidemark", "Your projects", "New team…"]);
	await page.getByRole("button", { name: "New team…" }).click();
	expect(await page.locator("body").getAttribute("data-said")).toBe("new;");
	await page.getByRole("button", { name: "Your projects" }).click();
	await page.getByRole("button", { name: "Open kaffe" }).waitFor();
});

it("moves nothing under reduced motion", async () => {
	const page = await home("reduce");
	await page.getByRole("button", { name: "Tidemark" }).click();
	const pages = page.locator("[data-place=tidemark] .pj-place-pages");
	expect(await pages.evaluate((node) => getComputedStyle(node).transitionDuration)).toMatch(/^0s/u);
	expect(await page.locator(".pj-place-in").evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
	const row = page.getByRole("button", { name: "Northlight" });
	expect(await row.evaluate((node) => getComputedStyle(node).transitionDuration)).toMatch(/^0s/u);
});

it("shows an invite as one line above Home's covers, with Decline and Join", async () => {
	const page = await home();
	const line = page.locator(".pj-invite-line");
	expect(await line.textContent()).toContain("kim@kaffe.co invited you to Kaffe Co.");
	const lineBox = await line.boundingBox();
	const coverBox = await page.getByRole("button", { name: "Open kaffe" }).boundingBox();
	const headingBox = await page.getByRole("heading", { name: "Projects", exact: true }).boundingBox();
	if (!lineBox || !coverBox || !headingBox) throw new Error("missing layout");
	expect(lineBox.y).toBeGreaterThan(headingBox.y + headingBox.height);
	expect(lineBox.y + lineBox.height).toBeLessThan(coverBox.y);
	expect(lineBox.height).toBeLessThan(80);

	await line.getByRole("button", { name: "Join Kaffe Co" }).click();
	await line.waitFor({ state: "detached" });
	expect(await page.locator("body").getAttribute("data-said")).toBe("join:i;");
});

it("declines an invite from the line", async () => {
	const page = await home();
	await page.locator(".pj-invite-line").getByRole("button", { name: "Decline" }).click();
	await page.locator(".pj-invite-line").waitFor({ state: "detached" });
	expect(await page.locator("body").getAttribute("data-said")).toBe("decline:i;");
});

describe("the narrow column, below 720 px", () => {
	it("makes every place its mark, each with its name as a title, the pages as icons under the team", async () => {
		const page = await home("reduce", { width: 719, everywhere: true });
		await page.getByRole("button", { name: "Tidemark" }).click();
		const aside = await page.locator("aside").boundingBox();
		if (!aside) throw new Error("no sidebar");
		expect(aside.width).toBe(64);
		const rows = page.locator(".pj-places :is(button, a):not([aria-hidden=true] *)");
		expect(await rows.evaluateAll((all) => all.map((row) => row.getAttribute("title")))).toEqual([
			"Harbour Bank",
			"Northlight",
			"Tidemark",
			"Projects",
			"People",
			"Settings",
			"Your projects",
			"New team…",
		]);
		for (const row of await rows.all()) {
			expect(await row.isVisible()).toBe(true);
			const box = await row.boundingBox();
			if (!box) throw new Error("no row");
			expect(box.x + box.width).toBeLessThanOrEqual(64);
			// a mark alone: no word shows beside it
			expect(
				await row.evaluate((node) => (node as HTMLElement).innerText.replace(/\s|\d/gu, "").length),
			).toBeLessThanOrEqual(1);
		}
		const team = await page.getByRole("button", { name: "Tidemark" }).boundingBox();
		const people = await page.getByRole("button", { name: "People" }).boundingBox();
		if (!team || !people) throw new Error("missing layout");
		expect(people.y).toBeGreaterThan(team.y);
		expect(await page.getByRole("button", { name: "Recent" }).isVisible()).toBe(true);
	});

	it("keeps the search one click away: its icon opens the field over the page", async () => {
		const page = await home("reduce", { width: 719, everywhere: true });
		const wide = page.locator(".pj-find > :not(.pj-find-over) input[type=search]");
		expect(await wide.isVisible()).toBe(false);
		await page.getByRole("button", { name: "Search", exact: true }).click();
		const field = page.locator(".pj-find-over input[type=search]");
		await field.waitFor();
		expect(await field.evaluate((node) => node === document.activeElement)).toBe(true);
		await field.fill("kaf");
		await page.getByRole("heading", { name: "Search" }).waitFor();
		await field.press("Escape");
		await field.waitFor({ state: "detached" });
		await page.getByRole("heading", { name: "Your projects" }).waitFor();
	});

	it("keeps the field in the sidebar on a wider window", async () => {
		const page = await home("reduce", { width: 721, everywhere: true });
		expect(await page.locator(".pj-find input[type=search]").first().isVisible()).toBe(true);
		expect(await page.getByRole("button", { name: "Search", exact: true }).isVisible()).toBe(false);
	});
});
