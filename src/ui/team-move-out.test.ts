// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { CloudTeam } from "../cloud-teams";
import { fakeTeamsSource } from "./fake-teams-source";
import { MoveOutSheet } from "./team-moves";
import { TeamsSourceContext } from "./teams";

/**
 * The sheet that takes a project out of its team says it waits in the team's trash for 30 days (#197), and counts the
 * comments kept with it and the shares that pause.
 */

const TEAM: CloudTeam = {
	id: "t",
	address: "tidemark",
	name: "Tidemark",
	role: "admin",
	logo: null,
	people: 1,
	billing: { state: "paying" },
};

async function sheet(comments: Record<string, number>, shares: Record<string, number> = {}) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const fake = fakeTeamsSource({
		teams: [TEAM],
		people: { members: [{ accountId: "ada", email: "ada@tidemark.app", role: "admin", you: true }], invites: [] },
		comments,
		shares,
	});
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() =>
		root.render(
			createElement(
				TeamsSourceContext.Provider,
				{ value: fake.source },
				createElement(MoveOutSheet, { team: TEAM, project: "checkout", onMoved: () => {}, onClose: () => {} }),
			),
		),
	);
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	return document.body.textContent ?? "";
}

it("says the project waits in the team's trash for 30 days, and an admin can restore it", async () => {
	expect(await sheet({})).toContain(
		"Tidemark keeps checkout in its trash for 30 days: an admin can restore it until then, with its comments and shares.",
	);
});

it("says how many comments are kept with it, and never that they are deleted", async () => {
	const said = await sheet({ "tidemark/checkout": 12 });
	expect(said).toContain("Its 12 comments are kept with it.");
	expect(said).not.toContain("deleted");
});

it("says one comment as one", async () => {
	expect(await sheet({ "tidemark/checkout": 1 })).toContain("Its 1 comment is kept with it.");
});

it("says how many shares pause until it is restored", async () => {
	expect(await sheet({}, { "tidemark/checkout": 2 })).toContain("Its 2 shares pause until it’s restored.");
	expect(await sheet({}, { "tidemark/checkout": 1 })).toContain("Its 1 share pauses until it’s restored.");
});

it("says nothing of comments or shares to count when there are none", async () => {
	const said = await sheet({});
	expect(said).not.toContain("Its ");
});
