// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { CloudTeam, ProjectCard, TeamPeople } from "./api";
import { fakeTeamsSource } from "./fake-teams-source";
import { Home } from "./home";
import type { MoveDone } from "./team-move";
import { TeamProjectsAway, useCoverMoves } from "./team-moves";
import { TeamsSourceContext } from "./teams";

/**
 * Moving a team project to another team, out of its team and into a checkout, from Home's covers on a Mac: Ada is an
 * admin of Tidemark and an editor in Northlight; Mira is an editor in both. spool.page answers through a team source
 * held in memory, and the daemon's own routes through a stubbed fetch.
 */

const team = (address: string, name: string, role: CloudTeam["role"], change: Partial<CloudTeam> = {}): CloudTeam => ({
	id: address,
	address,
	name,
	role,
	logo: null,
	people: 4,
	...change,
});

const ADA = [team("tidemark", "Tidemark", "admin"), team("northlight", "Northlight", "editor")];
const MIRA = [team("tidemark", "Tidemark", "editor"), team("northlight", "Northlight", "editor")];

const PEOPLE: TeamPeople = {
	members: [
		{ accountId: "ada", email: "ada@tidemark.app", role: "admin", you: true },
		{ accountId: "mira", email: "mira@tidemark.app", role: "editor", you: false },
		{ accountId: "sam", email: "sam@tidemark.app", role: "editor", you: false },
		{ accountId: "lena", email: "lena@harbourbank.se", role: "viewer", you: false },
	],
	invites: [],
};

const LOSING = {
	northlight: [
		{ name: "Jonas", email: "jonas@tidemark.app" },
		{ name: "Mira", email: "mira@tidemark.app" },
	],
};

const card = (name: string, root: string, link?: { team: string; project: string; inRepo?: boolean }): ProjectCard => ({
	name,
	root,
	openedAt: new Date().toISOString(),
	frameCount: 1,
	covers: [],
	...(link === undefined ? {} : { team: { ...link, url: `https://spool.page/${link.team}/${link.project}` } }),
});

const SITE = card("tidemark-site", "/Users/ada/code/tidemark-site", {
	team: "tidemark",
	project: "site",
	inRepo: true,
});
const PITCH = card("pitch", "/Users/ada/spool/tidemark/pitch", { team: "tidemark", project: "pitch", inRepo: false });
const KAFFE = card("kaffe", "/Users/ada/code/kaffe");

const listed = (name: string) => ({ name, url: `https://spool.page/tidemark/${name}`, repo: null });

function render(element: ReactNode) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() => root.render(element));
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	return host;
}

/** Home's covers with the moves this account may make, as the app wires them, and what each finished move said. */
function home(
	fake: ReturnType<typeof fakeTeamsSource>,
	teams: CloudTeam[],
	projects: ProjectCard[] = [SITE, PITCH, KAFFE],
) {
	const done: MoveDone[] = [];
	const movedIn: string[] = [];
	function Covers() {
		const moves = useCoverMoves({
			teams,
			onMoveIn: teams.some((each) => each.role !== "viewer") ? (project) => movedIn.push(project.name) : undefined,
			onDone: (said) => done.push(said),
		});
		return createElement(
			TeamsSourceContext.Provider,
			{ value: fake.source },
			createElement(Home, {
				projects,
				onOpenProject: vi.fn(),
				onForgetProject: vi.fn(),
				onTrashProject: vi.fn(),
				onRenameProject: vi.fn(),
				onStart: vi.fn(),
				onFolder: vi.fn(),
				moveItems: moves.moveItems,
			}),
			moves.surface,
		);
	}
	return { host: render(createElement(Covers)), done, movedIn };
}

/** The daemon's own routes, each answered by `answer`, and what was asked of them. */
function daemon(answer: (method: string, url: string) => Response | undefined = () => undefined) {
	const asked: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			const method = init?.method ?? "GET";
			asked.push(`${method} ${url}${init?.body ? ` ${init.body}` : ""}`);
			return answer(method, url) ?? Response.json({});
		}),
	);
	return asked;
}

async function settle(ms = 0) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

async function openMenu(host: HTMLElement, name: string) {
	await act(async () => (host.querySelector(`[aria-label="Manage ${name}"]`) as HTMLButtonElement).click());
}

/** The open menu's items, in order, a destructive one marked with a `!`. */
function items(host: HTMLElement): string[] {
	return Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
		(node) => `${node.dataset.destructive === undefined ? "" : "!"}${node.textContent}`,
	);
}

async function choose(host: HTMLElement, label: string) {
	const found = Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
		(node) => node.textContent === label,
	);
	if (!found) throw new Error(`Missing menu item: ${label}`);
	await act(async () => found.click());
	await settle();
}

function button(host: ParentNode, label: string): HTMLButtonElement {
	const found = Array.from(host.querySelectorAll("button")).find((node) => node.textContent === label);
	if (!found) throw new Error(`Missing button: ${label}`);
	return found;
}

async function click(host: ParentNode, label: string) {
	await act(async () => button(host, label).click());
	await settle();
}

const sheet = (host: ParentNode) => host.querySelector("dialog");

/** The error under a field, by its label. */
function fieldError(host: ParentNode, label: string): string | undefined {
	const field = Array.from(host.querySelectorAll("label")).find((node) => node.textContent === label)?.parentElement;
	return field?.querySelector('[role="alert"]')?.textContent ?? undefined;
}

async function type(input: HTMLInputElement | null | undefined, value: string) {
	if (!input) throw new Error("Missing input");
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	// past the sheet's wait for typing to settle, and its question answered
	await settle(300);
}

it("offers an admin of the copy's team Move to team, and Move out at the foot with Hide and Trash", async () => {
	daemon();
	const { host } = home(fakeTeamsSource({ teams: ADA }), ADA);
	await openMenu(host, "tidemark-site");
	expect(items(host)).toEqual([
		"Open",
		"Export project…",
		"Rename…",
		"Move to team…",
		"Copy path",
		"Hide from Spool",
		"!Move out of Tidemark…",
		"!Move to Trash…",
	]);
});

it("offers Move into a checkout on a team copy in no repo, to anyone with the copy", async () => {
	daemon();
	const ada = home(fakeTeamsSource({ teams: ADA }), ADA);
	await openMenu(ada.host, "pitch");
	expect(items(ada.host)).toContain("Move into a checkout…");
	await openMenu(ada.host, "tidemark-site");
	expect(items(ada.host)).not.toContain("Move into a checkout…");

	const mira = home(fakeTeamsSource({ teams: MIRA }), MIRA);
	await openMenu(mira.host, "pitch");
	expect(items(mira.host)).toContain("Move into a checkout…");
});

it("offers an editor of the copy's team neither Move to team nor Move out", async () => {
	daemon();
	const { host } = home(fakeTeamsSource({ teams: MIRA }), MIRA);
	await openMenu(host, "tidemark-site");
	expect(items(host).filter((item) => item.includes("Move"))).toEqual(["!Move to Trash…"]);
});

it("offers no Move to team to an admin with no other team to edit in, but still Move out", async () => {
	daemon();
	const teams = [team("tidemark", "Tidemark", "admin"), team("northlight", "Northlight", "viewer")];
	const { host } = home(fakeTeamsSource({ teams }), teams);
	await openMenu(host, "tidemark-site");
	expect(items(host)).not.toContain("Move to team…");
	expect(items(host)).toContain("!Move out of Tidemark…");
});

it("keeps today's Move to team sheet on a local project, and none while the account edits in no team", async () => {
	daemon();
	const ada = home(fakeTeamsSource({ teams: ADA }), ADA);
	await openMenu(ada.host, "kaffe");
	await choose(ada.host, "Move to team…");
	expect(ada.movedIn).toEqual(["kaffe"]);

	const viewer = [team("tidemark", "Tidemark", "viewer")];
	const none = home(fakeTeamsSource({ teams: viewer }), viewer);
	await openMenu(none.host, "kaffe");
	expect(items(none.host)).not.toContain("Move to team…");
});

it("moves a team copy to another team: who loses it, the commit it makes, then the toast on the new team", async () => {
	daemon();
	const fake = fakeTeamsSource({
		teams: ADA,
		projects: { tidemark: [listed("site")] },
		losing: LOSING,
		mac: {
			commits: ["/Users/ada/code/tidemark-site"],
			roots: ["/Users/ada/code/tidemark-site"],
			committed: ["/Users/ada/code/tidemark-site"],
		},
	});
	const { host, done } = home(fake, ADA);
	await openMenu(host, "tidemark-site");
	await choose(host, "Move to team…");
	const shown = sheet(host);
	expect(shown?.querySelector("h2")?.textContent).toBe("Move site to another team");
	expect(shown?.textContent).toContain(
		"It keeps its history, its shares and everyone’s open canvases. spool.page/tidemark/site goes on working and leads to the new address.",
	);
	expect(shown?.querySelector("select")?.value).toBe("northlight");
	expect(Array.from(shown?.querySelectorAll("option") ?? []).map((option) => option.textContent)).toEqual([
		"Northlight",
	]);
	expect(shown?.querySelector<HTMLInputElement>("input")?.value).toBe("site");
	expect(shown?.querySelector("[data-move-says]")?.textContent).toBe(
		"Jonas and Mira aren’t in Northlight. Their copies stop syncing and stay on their Macs as local projects." +
			"spool.json changes in ~/code/tidemark-site, in one commit on your current branch. Nothing is pushed.",
	);
	await click(host, "Move to Northlight");
	expect(fake.asked).toContain("move tidemark/site northlight site");
	expect(done).toEqual([
		{ toast: "Moved site to Northlight. spool.json is committed in tidemark-site.", show: "northlight" },
	]);
	expect(sheet(host)).toBeNull();
});

it("says the folder a move takes from under ~/spool, and a commit git didn't take yet in a line kept on Home", async () => {
	daemon();
	const fake = fakeTeamsSource({
		teams: ADA,
		projects: { tidemark: [listed("site")] },
		mac: {
			folder: { from: "/Users/ada/spool/tidemark/site", to: "/Users/ada/spool/northlight/site" },
			commitWaiting: ["/Users/ada/code/tidemark-site"],
		},
	});
	const { host, done } = home(fake, ADA);
	await openMenu(host, "tidemark-site");
	await choose(host, "Move to team…");
	expect(sheet(host)?.querySelector("[data-move-says]")?.textContent).toBe(
		"~/spool/tidemark/site moves to ~/spool/northlight/site.",
	);
	await click(host, "Move to Northlight");
	expect(done).toEqual([
		{
			toast: "Moved site to Northlight.",
			note: "site moved to Northlight. Its commit in ~/code/tidemark-site waits for git, and spool makes it the next time it starts.",
			show: "northlight",
		},
	]);
});

it("refuses a name the new team has beside Name, and moves it under the new name", async () => {
	daemon();
	const fake = fakeTeamsSource({
		teams: ADA,
		projects: {
			tidemark: [listed("site")],
			northlight: [{ ...listed("site"), url: "https://spool.page/northlight/site" }],
		},
		mac: { committed: ["/Users/ada/code/tidemark-site"] },
	});
	const { host, done } = home(fake, ADA);
	await openMenu(host, "tidemark-site");
	await choose(host, "Move to team…");
	expect(fieldError(host, "Name")).toBe("Northlight already has a project called site. Pick another name.");
	expect(fieldError(host, "Team")).toBeUndefined();
	expect(button(host, "Move to Northlight").disabled).toBe(true);
	await type(sheet(host)?.querySelector("input"), "tidemark-site");
	expect(fieldError(host, "Name")).toBeUndefined();
	expect(button(host, "Move to Northlight").disabled).toBe(false);
	await click(host, "Move to Northlight");
	expect(fake.asked).toContain("move tidemark/site northlight tidemark-site");
	expect(done[0]?.toast).toBe("Moved site to Northlight as tidemark-site. spool.json is committed in tidemark-site.");
});

it("says a name taken while the sheet was open beside Name, and keeps the sheet", async () => {
	daemon();
	const fake = fakeTeamsSource({ teams: ADA, projects: { tidemark: [listed("site")] } });
	const { host, done } = home(fake, ADA);
	await openMenu(host, "tidemark-site");
	await choose(host, "Move to team…");
	expect(button(host, "Move to Northlight").disabled).toBe(false);
	fake.set({ projects: { tidemark: [listed("site")], northlight: [listed("site")] } });
	await click(host, "Move to Northlight");
	expect(fieldError(host, "Name")).toBe("Northlight already has a project called site. Pick another name.");
	expect(sheet(host)?.querySelector("p[role=alert]")).toBeNull();
	expect(done).toEqual([]);
});

it("refuses a team with no paid time left under Team", async () => {
	daemon();
	const teams = [
		team("tidemark", "Tidemark", "admin"),
		team("northlight", "Northlight", "editor", { billing: { state: "lapsed" } }),
	];
	const { host } = home(fakeTeamsSource({ teams, projects: { tidemark: [listed("site")] } }), teams);
	await openMenu(host, "tidemark-site");
	await choose(host, "Move to team…");
	expect(fieldError(host, "Team")).toBe(
		"Northlight’s trial has ended. It takes projects again once an admin pays for it.",
	);
	expect(fieldError(host, "Name")).toBeUndefined();
	expect(button(host, "Move to Northlight").disabled).toBe(true);
});

it("moves a copy out of its team, committing design/ back, and Home shows Your projects", async () => {
	const asked = daemon((method, url) =>
		method === "POST" && url.endsWith("/out")
			? Response.json({ root: "/Users/ada/code/tidemark-site", committed: true, commitWaiting: false })
			: undefined,
	);
	const { host, done } = home(fakeTeamsSource({ teams: ADA, people: PEOPLE }), ADA);
	await openMenu(host, "tidemark-site");
	await choose(host, "Move out of Tidemark…");
	const shown = sheet(host);
	expect(shown?.querySelector("h2")?.textContent).toBe("Move site out of Tidemark");
	expect(shown?.textContent).toContain(
		"site becomes a project on this Mac only, and Tidemark no longer has it. spool makes one commit on your current branch that puts design/ back in git and takes spool.json out. Nothing is pushed.",
	);
	expect(shown?.textContent).toContain(
		"mira and sam edit in Tidemark. Any copy they have stops syncing and becomes a local project too, and its design/ comes back into git when they pull.",
	);
	expect(
		button(host, "Move out of Tidemark").dataset.variant ?? button(host, "Move out of Tidemark").className,
	).toMatch(/danger/);
	await click(host, "Move out of Tidemark");
	expect(asked).toContain('POST /api/cloud/teams/tidemark/projects/site/out {"path":"/Users/ada/code/tidemark-site"}');
	expect(done).toEqual([{ toast: "site is out of Tidemark. design/ is committed in tidemark-site.", show: null }]);
});

it("says nothing is committed moving out a copy in no repo", async () => {
	daemon();
	const { host } = home(fakeTeamsSource({ teams: ADA, people: PEOPLE }), ADA);
	await openMenu(host, "pitch");
	await choose(host, "Move out of Tidemark…");
	expect(sheet(host)?.textContent).toContain(
		"pitch becomes a project on this Mac only, and Tidemark no longer has it. It’s in no repo, so nothing is committed.",
	);
});

const CHECKOUTS = (url: string) =>
	url === "/api/cloud/teams/tidemark/projects"
		? Response.json({
				projects: [
					{
						name: "pitch",
						url: "https://spool.page/tidemark/pitch",
						repo: "github.com/tidemark/pitch-deck",
						clone: "git clone https://github.com/tidemark/pitch-deck.git",
						copies: ["/Users/ada/spool/tidemark/pitch"],
						checkouts: ["/Users/ada/code/pitch-deck"],
						home: "/Users/ada/spool/tidemark/pitch",
					},
				],
			})
		: undefined;

it("moves a copy in no repo into the clone of its repo, offered first, and says the old folder goes to the Trash", async () => {
	const asked = daemon((method, url) =>
		method === "POST" && url.endsWith("/into")
			? Response.json({ root: "/Users/ada/code/pitch-deck", committed: true, commitWaiting: false })
			: CHECKOUTS(url),
	);
	const { host, done } = home(fakeTeamsSource({ teams: ADA }), ADA);
	await openMenu(host, "pitch");
	await choose(host, "Move into a checkout…");
	const shown = sheet(host);
	expect(shown?.querySelector("h2")?.textContent).toBe("Move pitch into a checkout");
	expect(shown?.textContent).toContain(
		"Its design/ moves into the repo you choose and stays in step with Tidemark. One commit on your current branch adds spool.json, and a line in AGENTS.md that points agents at the canvas. Nothing is pushed.",
	);
	expect(shown?.querySelector<HTMLInputElement>("input")?.value).toBe("~/code/pitch-deck");
	expect(shown?.textContent).toContain("Your clone of github.com/tidemark/pitch-deck");
	expect(shown?.textContent).toContain(
		"~/spool/tidemark/pitch goes to the Trash once its design/ is in the checkout.",
	);
	expect(button(host, "Choose…")).toBeDefined();
	await click(host, "Move");
	expect(asked).toContain(
		'POST /api/cloud/teams/tidemark/projects/pitch/into {"path":"/Users/ada/spool/tidemark/pitch","checkout":"/Users/ada/code/pitch-deck"}',
	);
	expect(done).toEqual([{ toast: "Moved pitch into ~/code/pitch-deck. spool.json is committed." }]);
});

it("refuses a checkout with its own design/ beside Checkout, and keeps the sheet", async () => {
	daemon((method, url) =>
		method === "POST" && url.endsWith("/into")
			? Response.json(
					{ error: "/Users/ada/code/pitch-deck already has a design/ folder", code: "checkout_has_design" },
					{ status: 409 },
				)
			: CHECKOUTS(url),
	);
	const { host, done } = home(fakeTeamsSource({ teams: ADA }), ADA);
	await openMenu(host, "pitch");
	await choose(host, "Move into a checkout…");
	await click(host, "Move");
	expect(fieldError(host, "Checkout")).toBe(
		"~/code/pitch-deck already has a design/ folder. Choose another checkout.",
	);
	expect(button(host, "Move").disabled).toBe(true);
	expect(sheet(host)?.querySelector("p[role=alert]")).toBeNull();
	expect(done).toEqual([]);
});

it("refuses a checkout that is already a project, or no checkout at all, beside Checkout", async () => {
	for (const [code, says] of [
		["checkout_is_a_project", "~/code/pitch-deck is already a spool project. Choose another checkout."],
		["not_a_checkout", "~/code/pitch-deck isn’t a git checkout. Choose a clone of the repo."],
		["in_a_repo", "pitch is already in a repo, so it can’t move into another."],
	] as const) {
		daemon((method, url) =>
			method === "POST" && url.endsWith("/into")
				? Response.json({ error: "refused", code }, { status: 409 })
				: CHECKOUTS(url),
		);
		const { host } = home(fakeTeamsSource({ teams: ADA }), ADA);
		await openMenu(host, "pitch");
		await choose(host, "Move into a checkout…");
		await click(host, "Move");
		expect(fieldError(host, "Checkout")).toBe(says);
		act(() => host.remove());
	}
});

/** A team's page's dimmed covers, for what spool.page has that this Mac doesn't. */
function away(fake: ReturnType<typeof fakeTeamsSource>, teams: CloudTeam[]) {
	const done: MoveDone[] = [];
	const shown = teams[0] as CloudTeam;
	const host = render(
		createElement(
			TeamsSourceContext.Provider,
			{ value: fake.source },
			createElement(TeamProjectsAway, { team: shown, teams, onGot: vi.fn(), onMoved: (said) => done.push(said) }),
		),
	);
	return { host, done };
}

const ONBOARDING = (url: string) =>
	url === "/api/cloud/teams/tidemark/projects"
		? Response.json({
				projects: [
					{
						name: "onboarding",
						url: "https://spool.page/tidemark/onboarding",
						repo: "github.com/tidemark/app",
						clone: null,
						copies: [],
						checkouts: [],
						home: "/Users/ada/spool/tidemark/onboarding",
					},
				],
			})
		: undefined;

it("gives an admin a menu on a dimmed cover, and an editor none", async () => {
	daemon((_, url) => ONBOARDING(url));
	const ada = away(fakeTeamsSource({ teams: ADA }), ADA);
	await settle();
	await openMenu(ada.host, "onboarding");
	expect(items(ada.host)).toEqual(["Move to team…", "!Move out of Tidemark…"]);

	const mira = away(fakeTeamsSource({ teams: MIRA }), MIRA);
	await settle();
	expect(mira.host.textContent).toContain("onboarding");
	expect(mira.host.querySelector('[aria-label="Manage onboarding"]')).toBeNull();
});

it("moves a project not on this Mac to another team, with no commit to make here", async () => {
	daemon((_, url) => ONBOARDING(url));
	const fake = fakeTeamsSource({ teams: ADA, projects: { tidemark: [listed("onboarding")] }, losing: LOSING });
	const { host, done } = away(fake, ADA);
	await settle();
	await openMenu(host, "onboarding");
	await choose(host, "Move to team…");
	expect(sheet(host)?.querySelector("[data-move-says]")?.textContent).toBe(
		"Jonas and Mira aren’t in Northlight. Their copies stop syncing and stay on their Macs as local projects.",
	);
	await click(host, "Move to Northlight");
	expect(fake.asked).toContain("move tidemark/onboarding northlight onboarding");
	expect(done).toEqual([{ toast: "Moved onboarding to Northlight.", show: "northlight" }]);
});

it("moves a project not on this Mac out of its team, committing nothing here", async () => {
	const asked = daemon((method, url) =>
		method === "POST" && url.endsWith("/out")
			? Response.json({ root: null, committed: false, commitWaiting: false })
			: ONBOARDING(url),
	);
	const { host, done } = away(fakeTeamsSource({ teams: ADA, people: PEOPLE }), ADA);
	await settle();
	await openMenu(host, "onboarding");
	await choose(host, "Move out of Tidemark…");
	expect(sheet(host)?.textContent).toContain(
		"Tidemark no longer has onboarding. No copy of it is on this Mac, so nothing is committed here.",
	);
	await click(host, "Move out of Tidemark");
	expect(asked).toContain("POST /api/cloud/teams/tidemark/projects/onboarding/out {}");
	expect(done).toEqual([{ toast: "onboarding is out of Tidemark." }]);
});

it("says a copy whose project moved out is to pull its repo, and an ended one that it no longer syncs", () => {
	daemon();
	const { host } = home(fakeTeamsSource({ teams: MIRA }), MIRA, [
		{ ...card("tidemark-site", "/Users/mira/code/tidemark-site"), ended: "Tidemark", movedOut: "Tidemark" },
		{ ...card("app", "/Users/mira/code/app"), ended: "Tidemark" },
	]);
	const lines = Array.from(host.querySelectorAll('[data-line="when"]')).map((line) => line.textContent);
	expect(lines).toEqual(["today · out of Tidemark · pull its repo", "today · no longer synced with Tidemark"]);
});
