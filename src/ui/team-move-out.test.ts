// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { CloudTeam } from "../cloud-teams";
import { fakeTeamsSource } from "./fake-teams-source";
import { MoveOutSheet } from "./team-moves";
import { TeamsSourceContext } from "./teams";

/** The sheet that takes a project out of its team says how many comments go with the team's copy (spool#160). */

const TEAM: CloudTeam = {
	id: "t",
	address: "tidemark",
	name: "Tidemark",
	role: "admin",
	logo: null,
	people: 1,
	billing: { state: "paying" },
};

async function sheet(comments: Record<string, number>) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const fake = fakeTeamsSource({
		teams: [TEAM],
		people: { members: [{ accountId: "ada", email: "ada@tidemark.app", role: "admin", you: true }], invites: [] },
		comments,
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

it("says how many comments are deleted when the project goes local", async () => {
	expect(await sheet({ "tidemark/checkout": 12 })).toContain(
		"Its 12 comments go with Tidemark’s copy: they are deleted when the project goes local.",
	);
});

it("says one comment as one", async () => {
	expect(await sheet({ "tidemark/checkout": 1 })).toContain("Its 1 comment goes with Tidemark’s copy: it is deleted");
});

it("says nothing of comments when there are none", async () => {
	expect(await sheet({})).not.toContain("comment");
});
