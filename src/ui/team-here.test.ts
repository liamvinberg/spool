// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { CloudTeam, HerePerson, ProjectCard } from "./api";
import { coversOf, ProjectGrid } from "./home";
import { TeamProjectsAway } from "./team-moves";
import { HERE_MS, useTeamHere } from "./teams";

/**
 * Home's covers of a team's projects saying who is inside right now (DEV-197): read from spool.page through the
 * daemon when the team is shown, and again while it stays shown, on the covers of this Mac's copies and of the
 * projects it doesn't hold.
 */

const DEVOSURF: CloudTeam = { id: "t", address: "devosurf", name: "Devosurf", role: "editor", logo: null, people: 4 };
const SAM: HerePerson = { name: "sam", color: "#7aa7ff" };
const ANA: HerePerson = { name: "ana", color: "#eaa94a" };

const copy = (name: string): ProjectCard => ({
	name,
	root: `/Users/ben/${name}`,
	openedAt: new Date().toISOString(),
	frameCount: 2,
	covers: [],
	team: { url: `https://spool.page/devosurf/${name}`, team: "devosurf", project: name },
});

function Home() {
	const here = useTeamHere("devosurf");
	const noop = () => {};
	return createElement(
		"div",
		null,
		createElement(ProjectGrid, {
			projects: coversOf([copy("app"), copy("site")]),
			menu: null,
			onMenu: noop,
			onOpenProject: noop,
			onForgetProject: noop,
			onTrashProject: noop,
			onRenameProject: noop,
			here,
		}),
		createElement(TeamProjectsAway, { team: DEVOSURF, here, onGot: noop }),
	);
}

it("shows who is inside each team project on its cover, and keeps it current while Home is shown", async () => {
	vi.useFakeTimers();
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	let inside: Record<string, HerePerson[]> = { app: [SAM], site: [], docs: [ANA] };
	const asked: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			asked.push(url);
			if (url.endsWith("/here"))
				return Response.json({
					projects: Object.entries(inside).map(([name, people]) => ({ name, url: "", people })),
				});
			return Response.json({
				projects: ["app", "site", "docs"].map((name) => ({
					name,
					url: `https://spool.page/devosurf/${name}`,
					repo: null,
					clone: null,
					copies: name === "docs" ? [] : [`/Users/ben/${name}`],
					checkouts: [],
					home: "",
				})),
			});
		}),
	);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});
	const said = () =>
		Object.fromEntries(
			[...host.querySelectorAll("article")].map((cover) => [
				cover.querySelector("strong")?.textContent,
				cover.querySelector("[data-here]")?.textContent ?? null,
			]),
		);

	await act(async () => {
		root.render(createElement(Home));
		await vi.advanceTimersByTimeAsync(0);
	});
	expect(asked).toContain("/api/cloud/teams/devosurf/here");
	// one person by name, nobody as nothing, and a project not on this Mac too
	expect(said()).toEqual({ app: "ssam is here", site: null, docs: "aana is here" });

	inside = { app: [SAM, ANA], site: [ANA], docs: [] };
	await act(async () => {
		await vi.advanceTimersByTimeAsync(HERE_MS);
	});
	expect(said()).toEqual({ app: "sa2 here", site: "aana is here", docs: null });
	expect(host.querySelector('[data-here="sam ana"]')).not.toBeNull();
});
