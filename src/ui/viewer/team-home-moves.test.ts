// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { CloudTeam } from "../api";
import { fakeTeamsSource } from "../fake-teams-source";
import { teamsAt } from "../team-source";
import type { AccountSource } from "./account-source";
import { BrowserHome } from "./team-home";

/** Moving a project to another team at spool.page/<team>, in a browser: no Mac, so only the team move is offered. */

const team = (address: string, name: string, role: CloudTeam["role"]): CloudTeam => ({
	id: address,
	address,
	name,
	role,
	logo: null,
	people: 3,
});

const ACCOUNT = {} as AccountSource;

function browser(teams: CloudTeam[]) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	// covers ask spool.page for their stills, which a test has none of
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(null, { status: 404 })),
	);
	history.replaceState(null, "", "/tidemark");
	const fake = fakeTeamsSource({
		teams,
		projects: { tidemark: [{ name: "site", url: "https://spool.page/tidemark/site", repo: null }] },
		losing: { northlight: [{ name: "Jonas", email: "jonas@tidemark.app" }] },
	});
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() =>
		root.render(
			createElement(BrowserHome, { config: { account: "ada@tidemark.app" }, source: fake.source, account: ACCOUNT }),
		),
	);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	return { host, fake };
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

function menuItems(host: HTMLElement): string[] {
	return Array.from(host.querySelectorAll('[role="menuitem"]')).map((node) => node.textContent ?? "");
}

it("offers an admin Move to team on a cover, and moves it with no commit or folder to say", async () => {
	const { host, fake } = browser([team("tidemark", "Tidemark", "admin"), team("northlight", "Northlight", "editor")]);
	await settle();
	await act(async () => (host.querySelector('[aria-label="Manage site"]') as HTMLButtonElement).click());
	expect(menuItems(host)).toEqual(["Open", "Copy link", "Move to team…", "Export…"]);
	const item = Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
		(node) => node.textContent === "Move to team…",
	);
	await act(async () => item?.click());
	await settle();
	expect(host.querySelector("dialog h2")?.textContent).toBe("Move site to another team");
	expect(host.querySelector("[data-move-says]")?.textContent).toBe(
		"Jonas isn’t in Northlight. Their copies stop syncing and stay on their Macs as local projects.",
	);
	const move = Array.from(host.querySelectorAll("button")).find((node) => node.textContent === "Move to Northlight");
	await act(async () => move?.click());
	await settle();
	expect(fake.asked).toContain("move tidemark/site northlight site");
	expect(host.querySelector("[data-moved-toast]")?.textContent).toContain("Moved site to Northlight.");
	expect(location.pathname).toBe("/northlight");
});

it("offers an editor no Move to team and no Export", async () => {
	const { host } = browser([team("tidemark", "Tidemark", "editor"), team("northlight", "Northlight", "editor")]);
	await settle();
	await act(async () => (host.querySelector('[aria-label="Manage site"]') as HTMLButtonElement).click());
	expect(menuItems(host)).toEqual(["Open", "Copy link"]);
});

it("asks spool.page and the daemon for a move at the same path, and reads either's refusal", async () => {
	const asked: string[] = [];
	const answers: Response[] = [];
	const fetch = vi.fn(async (url: string, init?: RequestInit) => {
		asked.push(`${init?.method ?? "GET"} ${url}${init?.body ? ` ${init.body}` : ""}`);
		return answers.shift() ?? Response.json({});
	});
	const page = teamsAt("/api", { fetch, logo: async () => ({ headers: {}, body: "" }) });
	const daemon = teamsAt("/api/cloud", { fetch, logo: async () => ({ headers: {}, body: "" }) });

	answers.push(Response.json({ losing: [], refusal: "unpaid" }));
	expect(await page.movePreview("tidemark", "site", "northlight", "tidemark-site")).toEqual({
		losing: [],
		refusal: "unpaid",
		commits: [],
		folder: null,
	});
	answers.push(
		Response.json({
			losing: [],
			refusal: null,
			commits: ["/Users/ada/code/site"],
			folder: { from: "/a", to: "/b" },
		}),
	);
	expect((await daemon.movePreview("tidemark", "site", "northlight"))?.commits).toEqual(["/Users/ada/code/site"]);
	expect(asked).toEqual([
		"GET /api/teams/tidemark/projects/site/move?to=northlight&name=tidemark-site",
		"GET /api/cloud/teams/tidemark/projects/site/move?to=northlight",
	]);

	answers.push(Response.json({ error: "name_taken" }, { status: 409 }));
	await expect(page.move("tidemark", "site", "northlight")).rejects.toMatchObject({ code: "name_taken" });
	answers.push(
		Response.json({ error: "Northlight already has a project called site.", code: "name_taken" }, { status: 409 }),
	);
	await expect(daemon.move("tidemark", "site", "northlight", "site")).rejects.toMatchObject({
		code: "name_taken",
		said: "Northlight already has a project called site.",
	});
	expect(asked.slice(2)).toEqual([
		'POST /api/teams/tidemark/projects/site/move {"to":"northlight"}',
		'POST /api/cloud/teams/tidemark/projects/site/move {"to":"northlight","name":"site"}',
	]);
});

it("searches every team from the sidebar, a tab per team, and puts the search away on going to a place", async () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(null, { status: 404 })),
	);
	history.replaceState(null, "", "/tidemark");
	const fake = fakeTeamsSource({
		teams: [team("tidemark", "Tidemark", "admin"), team("northlight", "Northlight", "viewer")],
		projects: {
			tidemark: [
				{ name: "site", url: "https://spool.page/tidemark/site", repo: null },
				{ name: "app", url: "https://spool.page/tidemark/app", repo: null },
			],
			northlight: [{ name: "careers-site", url: "https://spool.page/northlight/careers-site", repo: null }],
		},
	});
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() =>
		root.render(
			createElement(BrowserHome, { config: { account: "ada@tidemark.app" }, source: fake.source, account: ACCOUNT }),
		),
	);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	await settle();
	expect(host.querySelector('[aria-label="2 projects"]')).not.toBeNull();
	const input = host.querySelector<HTMLInputElement>('.pj-find input[type="search"]');
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "site");
		input?.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await settle();
	expect(host.querySelector("main h1")?.textContent).toBe("Search");
	expect(Array.from(host.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent)).toEqual([
		"All 2",
		"Tidemark 1",
		"Northlight 1",
	]);
	expect(Array.from(host.querySelectorAll("a[aria-label^='Open ']")).map((link) => link.getAttribute("href"))).toEqual(
		["/northlight/careers-site", "/tidemark/site"],
	);
	const people = Array.from(host.querySelectorAll("nav button")).find((node) =>
		node.textContent?.startsWith("People"),
	);
	await act(async () => (people as HTMLButtonElement).click());
	expect(host.querySelector<HTMLInputElement>('.pj-find input[type="search"]')?.value).toBe("");
});
