import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi } from "../test-helpers";

/**
 * Home with its switcher and invite line in a real Chromium, laid out by the app's own stylesheet.
 * The cloud is the page's own state: the components are Home's, the teams are a fixture.
 */
async function home(): Promise<Page> {
	const bundle = await build({
		stdin: {
			contents: `
				import { createElement, useState } from "react";
				import { createRoot } from "react-dom/client";
				import { Home } from "./src/ui/home";
				import { InviteLine, TeamNav, TeamProjects, TeamSwitcher } from "./src/ui/teams";
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
						onStart() {}, onFolder() {}, onSettings() {},
						switcher: createElement(TeamSwitcher, { teams, current, onSelect: setScope, onNewTeam: () => said("new") }),
						notice,
						team: current ? {
							nav: createElement(TeamNav, { team: current, page: "projects", onPage() {} }),
							main: createElement(TeamProjects, { team: current, notice }),
						} : undefined,
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
	const page = await browser.newPage({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
	await page.setContent(`<div id="root" style="height: 800px"></div>`);
	const assets = join(await builtUi(), "assets");
	for (const file of readdirSync(assets).filter((name) => name.endsWith(".css")))
		await page.addStyleTag({ content: readFileSync(join(assets, file), "utf8") });
	for (const file of bundle.outputFiles) await page.addScriptTag({ content: file.text });
	await page.getByRole("button", { name: "Your projects" }).waitFor();
	return page;
}

it("switches Home between your projects and a team, and sends a team you only watch to the browser", async () => {
	const page = await home();
	await page.getByRole("button", { name: "Your projects" }).click();
	const menu = page.getByRole("menu");
	// each team's letter mark leads its row
	expect(await menu.getByRole("menuitem").allTextContents()).toEqual([
		"HHarbour Bankviewer ↗",
		"NNorthlight2 people",
		"TTidemark5 people",
		"Your projects",
		"New team…",
	]);
	const watched = menu.getByRole("menuitem", { name: /Harbour Bank/u });
	expect(await watched.getAttribute("href")).toBe("https://spool.page/harbour-bank");
	expect(await watched.getAttribute("target")).toBe("_blank");

	await menu.getByRole("menuitem", { name: /Tidemark/u }).click();
	await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();
	expect(await page.getByRole("navigation", { name: "Home sections" }).getByRole("button").allTextContents()).toEqual([
		"Projects",
		"People5",
		"Settings",
	]);
	expect(await page.getByText("Tidemark has no projects on this Mac yet").isVisible()).toBe(true);
	expect(await page.getByRole("button", { name: "Open kaffe" }).count()).toBe(0);

	await page.getByRole("button", { name: "Tidemark" }).click();
	await page.getByRole("menuitem", { name: /Northlight/u }).click();
	expect(await page.getByRole("navigation", { name: "Home sections" }).getByRole("button").allTextContents()).toEqual([
		"Projects",
		"People2",
	]);

	await page.getByRole("button", { name: "Northlight" }).click();
	await page.getByRole("menuitem", { name: "New team…" }).click();
	expect(await page.locator("body").getAttribute("data-said")).toBe("new;");
	await page.getByRole("button", { name: "Northlight" }).click();
	await page.getByRole("menuitem", { name: "Your projects" }).click();
	await page.getByRole("button", { name: "Open kaffe" }).waitFor();
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
