// @vitest-environment happy-dom
import { setTimeout as sleep } from "node:timers/promises";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { ProjectCard } from "./api";
import { App } from "./app";

const card = (name: string, openedAt: string): ProjectCard => ({
	root: `/w/${name}`,
	name,
	openedAt,
	frameCount: 0,
	covers: [],
});

/**
 * The app against a daemon that knows three projects, all open as tabs, and
 * answers each tab the page reports active with the time it was opened.
 */
async function launch(path: string) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	window.history.replaceState(null, "", path);
	const projects = [
		card("gamma", "2026-09-03T00:00:00.000Z"),
		card("beta", "2026-09-02T00:00:00.000Z"),
		card("alpha", "2026-09-01T00:00:00.000Z"),
	];
	const active: string[] = [];
	let listed: () => void = () => {};
	const cardsRead = new Promise<void>((resolve) => {
		listed = resolve;
	});
	let minute = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request =
				input instanceof Request ? input : new Request(new URL(String(input), window.location.href), init);
			const { pathname } = new URL(request.url);
			if (pathname.endsWith("/events")) {
				return new Response(new ReadableStream<Uint8Array>({ start: () => {} }), {
					headers: { "content-type": "text/event-stream" },
				});
			}
			if (pathname === "/api/session/active" && request.method === "PUT") {
				const { root } = (await request.json()) as { root: string };
				active.push(root.slice("/w/".length));
				minute += 1;
				return Response.json({ openedAt: `2026-10-01T00:${String(minute).padStart(2, "0")}:00.000Z` });
			}
			if (pathname === "/api/session") return Response.json({ open: projects.map((p) => p.root).reverse() });
			// every card is a walk of a project's design folder: the list lands after
			// the active tab's answer, and was read before it
			if (pathname === "/api/projects") {
				const answer = Response.json({ projects });
				await sleep(20);
				listed();
				return answer;
			}
			const canvas = pathname.match(/^\/api\/p\/([^/]+)\/frames$/);
			if (canvas !== null) return Response.json({ root: `/w/${canvas[1]}`, pages: [], places: {}, frames: [] });
			if (pathname === "/api/settings") return Response.json({ project: null, entries: [] });
			// the canvas of a tab asks for a great deal more, and is told there is nothing
			return new Response(null, { status: 404 });
		}),
	);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		window.history.replaceState(null, "", "/");
		vi.unstubAllGlobals();
	});
	await act(async () => root.render(createElement(App)));
	await act(async () => cardsRead);
	const press = async (label: string) => {
		const target = [...host.querySelectorAll<HTMLElement>("button, [role=tab]")].find(
			(element) => element.getAttribute("aria-label") === label || element.textContent?.trim() === label,
		);
		if (target === undefined) throw new Error(`no ${label} to press`);
		await act(async () => target.click());
	};
	const switchTo = async (name: string) => {
		const tab = host.querySelector<HTMLElement>(`[data-tab="/w/${name}"] .project-tab-label`);
		if (tab === null) throw new Error(`no ${name} tab`);
		await act(async () => tab.click());
	};
	const recent = () =>
		[...host.querySelectorAll<HTMLButtonElement>("button[aria-label^='Open ']")].map((button) =>
			button.getAttribute("aria-label")?.slice("Open ".length),
		);
	return { active, press, switchTo, recent };
}

it("counts only the tab it lands on among the tabs it restores", async () => {
	const app = await launch("/p/beta");

	expect(app.active).toEqual(["beta"]);
});

it("puts the tab it landed on first in Recent once you go Home", async () => {
	const app = await launch("/p/beta");

	await app.press("Home");

	expect(app.recent()).toEqual(["beta", "gamma", "alpha"]);
});

it("brings a tab you switch to to the top of Recent", async () => {
	const app = await launch("/p/beta");

	await app.switchTo("alpha");
	expect(app.active).toEqual(["beta", "alpha"]);
	await app.press("Home");

	expect(app.recent()).toEqual(["alpha", "beta", "gamma"]);
});

it("restores tabs onto Home without making any of them recent", async () => {
	const app = await launch("/");

	expect(app.active).toEqual([]);
	expect(app.recent()).toEqual(["gamma", "beta", "alpha"]);
});

it("brings the project opened from Home to the top of Recent when you come back", async () => {
	const app = await launch("/");

	await app.press("Open alpha");
	expect(app.active).toEqual(["alpha"]);
	await app.press("Home");

	expect(app.recent()).toEqual(["alpha", "gamma", "beta"]);
});
