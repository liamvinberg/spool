// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { CloudTeam, RemovedTeamProject } from "../cloud-teams";
import { fakeTeamsSource } from "./fake-teams-source";
import { TeamProjects, TeamsSourceContext } from "./teams";

/** A team's trash on its Projects page (#197): its admins see what was removed, restore it, or delete it now. */

const DAY = 86_400;
const NOW = Date.UTC(2026, 5, 10, 12) / 1000;

const team = (role: CloudTeam["role"], state: "paying" | "lapsed" = "paying"): CloudTeam => ({
	id: "t",
	address: "tidemark",
	name: "Tidemark",
	role,
	logo: null,
	people: 3,
	billing: { state },
});

const REMOVED: RemovedTeamProject[] = [
	{ name: "tidemark-app", removedBy: "Ana", removedAt: NOW - 7 * DAY, purgeAt: NOW + 23 * DAY, shares: 2 },
	{ name: "old-site", removedBy: null, removedAt: NOW - 29.5 * DAY, purgeAt: NOW + 0.5 * DAY, shares: 0 },
];

function page(fake: ReturnType<typeof fakeTeamsSource>, shown: CloudTeam, onRestored?: () => void) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	vi.useFakeTimers({ toFake: ["Date"], now: NOW * 1000 });
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() =>
		root.render(
			createElement(
				TeamsSourceContext.Provider,
				{ value: fake.source },
				createElement(TeamProjects, { team: shown, onOpen: () => {}, onRestored }),
			),
		),
	);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
	return host;
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

const removed = (host: ParentNode) => host.querySelector("[data-team-removed]");
const row = (host: ParentNode, name: string) =>
	Array.from(host.querySelectorAll("[data-team-removed] li")).find((each) => each.textContent?.includes(name));

function button(within: ParentNode | undefined, label: string): HTMLButtonElement {
	const found = Array.from(within?.querySelectorAll("button") ?? []).find((node) => node.textContent === label);
	if (!found) throw new Error(`Missing button: ${label}`);
	return found;
}

it("lists each removed project to an admin with who removed it and the days it has left", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")], removed: { tidemark: REMOVED } });
	const host = page(fake, team("admin"));
	await settle();
	expect(removed(host)?.textContent).toContain("Removed");
	expect(row(host, "tidemark-app")?.textContent).toContain("Removed by Ana · 23 days left");
	expect(row(host, "old-site")?.textContent).toContain("Removed · 1 day left");
	button(row(host, "tidemark-app"), "Restore");
	button(row(host, "tidemark-app"), "Delete now");
});

it("shows editors and viewers no trash, and never asks for it", async () => {
	for (const role of ["editor", "viewer"] as const) {
		const fake = fakeTeamsSource({ teams: [team(role)], removed: { tidemark: REMOVED } });
		const asked = vi.spyOn(fake.source, "removed");
		const host = page(fake, team(role));
		await settle();
		expect(removed(host)).toBeNull();
		expect(asked).not.toHaveBeenCalled();
	}
});

it("shows nothing while the trash is empty", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")] });
	const host = page(fake, team("admin"));
	await settle();
	expect(removed(host)).toBeNull();
});

it("restores a project, and the team's projects are read again", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")], removed: { tidemark: REMOVED } });
	const restored: string[] = [];
	const host = page(fake, team("admin"), () => restored.push("again"));
	await settle();
	await act(async () => button(row(host, "tidemark-app"), "Restore").click());
	await settle();
	expect(fake.asked).toContain("restore tidemark/tidemark-app");
	expect(row(host, "tidemark-app")).toBeUndefined();
	expect(restored).toEqual(["again"]);
});

it("says a team with no paid time can't restore, and keeps the project in the trash", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin", "lapsed")], removed: { tidemark: REMOVED } });
	const host = page(fake, team("admin", "lapsed"));
	await settle();
	await act(async () => button(row(host, "tidemark-app"), "Restore").click());
	await settle();
	expect(removed(host)?.textContent).toContain(
		"This team has gone local. An admin can pay for it in Settings › Billing to sync again.",
	);
	expect(row(host, "tidemark-app")).toBeDefined();
});

it("deletes a project now only once the admin confirms it", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")], removed: { tidemark: REMOVED } });
	const host = page(fake, team("admin"));
	await settle();
	act(() => button(row(host, "tidemark-app"), "Delete now").click());
	const asking = host.querySelector("dialog");
	expect(asking?.querySelector("h2")?.textContent).toBe("Delete tidemark-app now");
	expect(asking?.textContent).toContain(
		"Its files, history, comments, covers and 2 shares are deleted for good. This can’t be undone.",
	);
	expect(fake.asked.filter((line) => line.startsWith("delete removed"))).toEqual([]);
	await act(async () => button(asking ?? undefined, "Delete now").click());
	await settle();
	expect(fake.asked).toContain("delete removed tidemark/tidemark-app");
	expect(row(host, "tidemark-app")).toBeUndefined();
});
