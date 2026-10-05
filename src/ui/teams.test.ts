// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { CloudTeam, TeamPeople } from "./api";
import { NewTeamDialog, TeamPeoplePage, TeamProjects } from "./teams";

function mount(element: React.ReactNode) {
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

const PEOPLE: TeamPeople = {
	members: [
		{ accountId: "ada", email: "ada@tidemark.app", role: "admin", you: true },
		{ accountId: "sam", email: "sam@tidemark.app", role: "editor", you: false },
		{ accountId: "lena", email: "lena@client.example", role: "viewer", you: false },
	],
	invites: [
		{
			id: "i1",
			email: "noor@tidemark.app",
			role: "editor",
			invitedBy: "ada@tidemark.app",
			sentAt: 0,
			expiresAt: 0,
			expired: true,
		},
	],
};

const team = (role: CloudTeam["role"]): CloudTeam => ({
	id: "t",
	address: "tidemark",
	name: "Tidemark",
	role,
	logo: null,
	people: 3,
});

/** The daemon, as far as People asks it: the list, and one answer for every change. */
function daemon(people: TeamPeople, change: () => Response = () => Response.json({})) {
	const asked: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			const method = init?.method ?? "GET";
			asked.push(`${method} ${url}${init?.body ? ` ${init.body}` : ""}`);
			return method === "GET" ? Response.json(people) : change();
		}),
	);
	return asked;
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

function button(host: ParentNode, label: string): HTMLButtonElement {
	const found = Array.from(host.querySelectorAll("button")).find((node) => node.textContent === label);
	if (!found) throw new Error(`Missing button: ${label}`);
	return found;
}

it("gives an admin a role menu on every row, and asks before making an editor a viewer", async () => {
	const asked = daemon(PEOPLE);
	const host = mount(createElement(TeamPeoplePage, { team: team("admin"), onChanged: vi.fn() }));
	await settle();
	expect(host.textContent).toContain("3 people");
	act(() => host.querySelector<HTMLButtonElement>('[aria-label="Role of sam@tidemark.app"]')?.click());
	const menu = host.querySelector('[role="menu"]');
	expect(Array.from(menu?.querySelectorAll("button") ?? []).map((item) => item.textContent)).toEqual([
		"Admin",
		"Editor",
		"Viewer",
		"Remove from Tidemark",
	]);
	act(() => button(menu ?? host, "Viewer").click());
	expect(document.body.textContent).toContain("Make sam@tidemark.app a viewer?");
	expect(document.body.textContent).toContain("Their Mac stops syncing Tidemark. The folders stay on it.");
	expect(asked.filter((line) => line.startsWith("PATCH"))).toEqual([]);
	await act(async () => button(document.body, "Make viewer").click());
	await settle();
	expect(asked).toContain('PATCH /api/cloud/teams/tidemark/members/sam {"role":"viewer"}');

	act(() => host.querySelector<HTMLButtonElement>('[aria-label="Role of ada@tidemark.app"]')?.click());
	expect(host.querySelector('[role="menu"]')?.textContent).toContain("Leave Tidemark");
	expect(host.textContent).toContain("noor@tidemark.app");
	expect(host.textContent).toContain("editor · expired");
});

it("says what spool.page refused, such as the last admin stepping down", async () => {
	daemon(PEOPLE, () => Response.json({ error: "last_admin" }, { status: 409 }));
	const host = mount(createElement(TeamPeoplePage, { team: team("admin"), onChanged: vi.fn() }));
	await settle();
	act(() => host.querySelector<HTMLButtonElement>('[aria-label="Role of ada@tidemark.app"]')?.click());
	await act(async () => button(host.querySelector('[role="menu"]') ?? host, "Editor").click());
	await settle();
	expect(host.querySelector('[role="status"]')?.textContent).toBe(
		"You’re the only admin. Make someone else an admin first.",
	);
});

it("shows roles as words to everyone else, with Leave on their own row and viewer invites only", async () => {
	daemon({
		...PEOPLE,
		members: PEOPLE.members.map((person) => ({ ...person, you: person.accountId === "lena" })),
	});
	const host = mount(createElement(TeamPeoplePage, { team: team("viewer"), onChanged: vi.fn() }));
	await settle();
	expect(host.querySelector('[aria-label^="Role of"]')).toBeNull();
	expect(Array.from(host.querySelectorAll("button")).filter((node) => node.textContent === "Leave")).toHaveLength(1);
	expect(
		Array.from(host.querySelectorAll('select[aria-label="Role"] option')).map((node) => node.textContent),
	).toEqual(["as Viewer"]);
	expect(host.textContent).not.toContain("Resend");
	act(() => button(host, "Leave").click());
	expect(document.body.textContent).toContain("Leave Tidemark?");
	expect(document.body.textContent).toContain("The folders stay on this Mac as ordinary projects.");
});

it("tells someone not yet approved that creating a team isn't open", () => {
	mount(createElement(NewTeamDialog, { allowed: false, onCreate: vi.fn(), onClose: vi.fn() }));
	expect(document.body.textContent).toContain("Creating a team isn’t open yet.");
	expect(document.body.querySelector("input")).toBeNull();
});

it("lists the team's projects on this Mac and starts a new one in the team", () => {
	const devosurf: CloudTeam = {
		id: "t",
		address: "devosurf",
		name: "Devosurf",
		role: "editor",
		logo: null,
		people: 3,
	};
	const onNewProject = vi.fn();
	const empty = mount(createElement(TeamProjects, { team: devosurf, onNewProject }));
	expect(empty.textContent).toContain("Devosurf has no projects on this Mac yet");
	act(() =>
		Array.from(empty.querySelectorAll("button"))
			.find((button) => button.textContent === "New project…")
			?.click(),
	);
	expect(onNewProject).toHaveBeenCalledOnce();
	const covers = mount(
		createElement(TeamProjects, { team: devosurf, covers: createElement("p", null, "the covers"), onNewProject }),
	);
	expect(covers.textContent).toContain("the covers");
	expect(covers.textContent).not.toContain("no projects");
});
