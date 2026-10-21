// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { CloudTeam, ProjectCard } from "./api";
import { App } from "./app";

const TEAMS: CloudTeam[] = [
	{ id: "h", address: "harbour-bank", name: "Harbour Bank", role: "viewer", logo: null, people: 6 },
	{ id: "n", address: "northlight", name: "Northlight", role: "editor", logo: null, people: 2 },
	{ id: "t", address: "tidemark", name: "Tidemark", role: "admin", logo: null, people: 5 },
];

const OWN: ProjectCard = {
	root: "/w/kaffe",
	name: "kaffe",
	openedAt: "2026-09-03T00:00:00.000Z",
	frameCount: 0,
	covers: [],
};

/**
 * The Mac app signed in to an account in three teams, against a daemon that answers Home's reads. `path` is the
 * address the window loads, as a launch or a reload does.
 */
async function launch(path: string, teams: CloudTeam[] = TEAMS) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	window.history.replaceState(null, "", path);
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request =
				input instanceof Request ? input : new Request(new URL(String(input), window.location.href), init);
			const { pathname } = new URL(request.url);
			if (pathname.endsWith("/events"))
				return new Response(new ReadableStream<Uint8Array>({ start: () => {} }), {
					headers: { "content-type": "text/event-stream" },
				});
			if (pathname === "/api/session") return Response.json({ open: [] });
			if (pathname === "/api/projects") return Response.json({ projects: [OWN] });
			if (pathname === "/api/settings") return Response.json({ project: null, entries: [] });
			if (pathname === "/api/cloud/account")
				return Response.json({
					state: "signed-in",
					email: "ada@tidemark.app",
					accountUrl: "https://spool.page/account",
				});
			if (pathname === "/api/cloud/teams")
				return Response.json({ teams, invites: [], mayCreateTeam: true, origin: "https://spool.page" });
			if (/^\/api\/cloud\/teams\/[^/]+\/people$/u.test(pathname))
				return Response.json({
					members: [{ accountId: "a", email: "ada@tidemark.app", role: "admin", you: true }],
					invites: [],
				});
			if (/^\/api\/cloud\/teams\/[^/]+\/projects$/u.test(pathname)) return Response.json({ projects: [] });
			return new Response(null, { status: 404 });
		}),
	);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	let mounted = true;
	const unmount = () => {
		if (!mounted) return;
		mounted = false;
		act(() => root.unmount());
		host.remove();
	};
	onTestFinished(() => {
		unmount();
		window.history.replaceState(null, "", "/");
		vi.unstubAllGlobals();
	});
	await act(async () => root.render(createElement(App)));
	await settle();
	const press = async (label: string, within = "aside, main") => {
		const target = [...host.querySelectorAll<HTMLElement>(`:is(${within}) :is(button, [role=tab], a)`)].find(
			(element) =>
				element.closest("[aria-hidden=true]") === null &&
				(element.getAttribute("aria-label") === label ||
					element.getAttribute("title") === label ||
					element.textContent?.trim() === label),
		);
		if (target === undefined) throw new Error(`no ${label} to press`);
		await act(async () => target.click());
		await settle();
	};
	/** The sidebar's places, and the pages shown under the team you're in, as they read. */
	const places = () =>
		[...host.querySelectorAll<HTMLElement>(".pj-places button, .pj-places a")]
			.filter((element) => element.closest("[aria-hidden=true]") === null)
			.map((element) => element.getAttribute("title"));
	const heading = () => host.querySelector("main h1")?.textContent;
	return { host, press, places, heading, unmount };
}

async function settle() {
	for (let i = 0; i < 5; i++) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

/** The window's back or forward button. */
async function travel(to: "back" | "forward") {
	await act(async () => {
		window.history[to]();
		await new Promise((resolve) => setTimeout(resolve, 20));
	});
	await settle();
}

beforeEach(() => localStorage.clear());

describe("Home's sidebar of places", () => {
	it("lists every team in spool.page's order, then Your projects below a rule, and New team… last", async () => {
		const app = await launch("/");
		expect(app.places()).toEqual(["Harbour Bank", "Northlight", "Tidemark", "Your projects", "New team…"]);
		expect(app.host.querySelectorAll(".pj-places hr")).toHaveLength(1);
		expect(app.host.querySelector("[aria-haspopup=menu].pj-team-switch, .pj-team-switch")).toBeNull();
	});

	it("opens the team you're in to its pages, Settings for admins only, and titles the page with its name", async () => {
		const app = await launch("/");
		await app.press("Tidemark");
		expect(app.places()).toEqual([
			"Harbour Bank",
			"Northlight",
			"Tidemark",
			"Projects",
			"People",
			"Settings",
			"Your projects",
			"New team…",
		]);
		expect(app.heading()).toBe("Tidemark");
		await app.press("Northlight");
		expect(app.places()).toEqual([
			"Harbour Bank",
			"Northlight",
			"Projects",
			"People",
			"Tidemark",
			"Your projects",
			"New team…",
		]);
		expect(app.heading()).toBe("Northlight");
	});

	it("sends a team you only watch to its page at spool.page", async () => {
		const app = await launch("/");
		const watched = app.host.querySelector<HTMLAnchorElement>(".pj-places a[title='Harbour Bank']");
		expect(watched?.getAttribute("href")).toBe("https://spool.page/harbour-bank");
		expect(watched?.getAttribute("target")).toBe("_blank");
	});

	it("titles Your projects so, with Open… beside New project and where they live", async () => {
		const app = await launch("/");
		await app.press("Your projects");
		expect(app.heading()).toBe("Your projects");
		const head = app.host.querySelector("main header");
		expect([...(head?.querySelectorAll("button") ?? [])].map((button) => button.textContent)).toEqual(
			expect.arrayContaining(["Open…", "New project…"]),
		);
		expect(app.host.querySelector("main")?.textContent).toContain(
			"On this Mac only. Move one to a team from its menu.",
		);
	});
});

describe("Home's places at their own addresses", () => {
	it("says each place in the address as you go", async () => {
		const app = await launch("/");
		expect(window.location.pathname).toBe("/recent");
		expect(app.heading()).toBe("Recent");
		await app.press("Tidemark");
		expect(window.location.pathname).toBe("/tidemark");
		await app.press("People");
		expect(window.location.pathname).toBe("/tidemark/people");
		await app.press("Settings");
		expect(window.location.pathname).toBe("/tidemark/settings");
		await app.press("Billing");
		expect(window.location.pathname).toBe("/tidemark/settings/billing");
		await app.press("Your projects");
		expect(window.location.pathname).toBe("/");
		await app.press("Recent");
		expect(window.location.pathname).toBe("/recent");
	});

	it("lands on the same place after a reload, Settings › Billing included", async () => {
		const first = await launch("/tidemark/settings/billing");
		expect(first.host.querySelector("[role=tab][aria-selected=true]")?.textContent).toBe("Billing");
		first.unmount();
		const again = await launch("/northlight/people");
		expect(again.heading()).toBe("People");
		expect(window.location.pathname).toBe("/northlight/people");
	});

	it("moves between the places visited with back and forward", async () => {
		const app = await launch("/");
		await app.press("Tidemark");
		await app.press("People");
		await travel("back");
		expect(window.location.pathname).toBe("/tidemark");
		expect(app.heading()).toBe("Tidemark");
		await travel("back");
		expect(window.location.pathname).toBe("/recent");
		expect(app.heading()).toBe("Recent");
		await travel("forward");
		expect(app.heading()).toBe("Tidemark");
	});

	it("opens a fresh launch where you last were, Recent the first time", async () => {
		const first = await launch("/");
		expect(first.heading()).toBe("Recent");
		await first.press("Northlight");
		await first.press("People");
		first.unmount();
		const next = await launch("/");
		expect(window.location.pathname).toBe("/northlight/people");
		expect(next.heading()).toBe("People");
	});

	it("opens a team handed over from spool.page whatever was open last", async () => {
		const first = await launch("/");
		await first.press("Your projects");
		first.unmount();
		const handed = await launch("/?open=northlight");
		expect(handed.heading()).toBe("Northlight");
		expect(window.location.pathname).toBe("/northlight");
		expect(window.location.search).toBe("");
	});

	it("falls back to Recent from a team you've since left", async () => {
		const first = await launch("/");
		await first.press("Tidemark");
		first.unmount();
		const after = await launch(
			"/",
			TEAMS.filter((team) => team.address !== "tidemark"),
		);
		expect(window.location.pathname).toBe("/recent");
		expect(after.heading()).toBe("Recent");
	});

	it("leaves a solo Mac's Home as it was, at /", async () => {
		const app = await launch("/", []);
		expect(window.location.pathname).toBe("/");
		expect(app.heading()).toBe("Projects");
		expect(app.places()).toEqual([]);
	});
});
