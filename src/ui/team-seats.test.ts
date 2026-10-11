// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { CloudTeam, PeopleBilling, TeamPeople } from "../cloud-teams";
import { fakeTeamsSource } from "./fake-teams-source";
import { TeamPeoplePage, TeamsSourceContext } from "./teams";

/** People's seat line and the cost of one more seat, over a team source held in memory. */

const MEMBERS: TeamPeople["members"] = [
	{ accountId: "ada", email: "ada@tidemark.app", role: "admin", you: true },
	{ accountId: "mira", email: "mira@tidemark.app", role: "editor", you: false },
	{ accountId: "sam", email: "sam@tidemark.app", role: "editor", you: false },
	{ accountId: "lena", email: "lena@harbourbank.se", role: "viewer", you: false },
];

const YEARLY: PeopleBilling = {
	state: "paying",
	cycle: "yearly",
	seatPrice: 1600,
	charged: "now",
	trialEditorCap: null,
	trialEditors: null,
};
const MONTHLY: PeopleBilling = { ...YEARLY, cycle: "monthly", seatPrice: 2000, charged: "next_invoice" };
const TRIAL: PeopleBilling = {
	state: "trial",
	cycle: null,
	seatPrice: null,
	charged: null,
	trialEditorCap: 10,
	trialEditors: 3,
};

const people = (billing: PeopleBilling): TeamPeople => ({ members: MEMBERS, invites: [], seats: 3, billing });

const team = (role: CloudTeam["role"], state: PeopleBilling["state"] = "paying"): CloudTeam => ({
	id: "t",
	address: "tidemark",
	name: "Tidemark",
	role,
	logo: null,
	people: 4,
	billing: { state },
});

function mount(fake: ReturnType<typeof fakeTeamsSource>, role: CloudTeam["role"]) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() =>
		root.render(
			createElement(
				TeamsSourceContext.Provider,
				{ value: fake.source },
				createElement(TeamPeoplePage, { team: team(role), onChanged: vi.fn() }),
			),
		),
	);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	return host;
}

function source(role: CloudTeam["role"], billing: PeopleBilling) {
	return fakeTeamsSource({ teams: [team(role, billing.state)], people: people(billing) });
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

function type(host: ParentNode, value: string) {
	const input = host.querySelector<HTMLInputElement>('input[type="email"]');
	if (!input) throw new Error("Missing email field");
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

function choose(host: ParentNode, role: CloudTeam["role"]) {
	const select = host.querySelector<HTMLSelectElement>('select[aria-label="Role"]');
	if (!select) throw new Error("Missing role");
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, role);
		select.dispatchEvent(new Event("change", { bubbles: true }));
	});
}

const costLine = (host: ParentNode) => host.querySelector(".pj-seat-cost")?.textContent ?? null;

it("tells an admin of a yearly team how many seats it pays for and what an editor adds, once they join", async () => {
	const host = mount(source("admin", YEARLY), "admin");
	await settle();
	expect(host.textContent).toContain("4 people · 3 seats");
	type(host, "noor@tidemark.app");
	expect(costLine(host)).toBe(
		"An editor is one more seat: $16 a month, charged for the days left this year once Noor joins.",
	);
	choose(host, "viewer");
	expect(costLine(host)).toBeNull();
	choose(host, "admin");
	expect(costLine(host)).toBe(
		"An admin is one more seat: $16 a month, charged for the days left this year once Noor joins.",
	);
});

it("names the invitee by their address's first name, up to a dot, underscore or plus", async () => {
	const host = mount(source("admin", MONTHLY), "admin");
	await settle();
	for (const [email, name] of [
		["noor.k@tidemark.app", "Noor"],
		["sam_li@tidemark.app", "Sam"],
		["mira+work@tidemark.app", "Mira"],
	] as const) {
		type(host, email);
		expect(costLine(host)).toBe(
			`An editor is one more seat: $20 a month, added to the next invoice once ${name} joins.`,
		);
	}
});

it("says a monthly team's editor goes on the next invoice", async () => {
	const host = mount(source("admin", MONTHLY), "admin");
	await settle();
	type(host, "noor@tidemark.app");
	expect(costLine(host)).toBe("An editor is one more seat: $20 a month, added to the next invoice once Noor joins.");
});

it("says the seat count on a trial but no cost, as nothing is charged yet", async () => {
	const host = mount(source("admin", TRIAL), "admin");
	await settle();
	expect(host.textContent).toContain("4 people · 3 seats");
	type(host, "noor@tidemark.app");
	expect(costLine(host)).toBeNull();
});

it("never shows seats or prices to editors and viewers", async () => {
	for (const role of ["editor", "viewer"] as const) {
		const host = mount(source(role, YEARLY), role);
		await settle();
		expect(host.textContent).toContain("4 people");
		expect(host.textContent).not.toContain("seat");
		expect(host.textContent).not.toContain("$");
		type(host, "noor@tidemark.app");
		expect(costLine(host)).toBeNull();
		host.remove();
	}
});

it("refuses an eleventh editor on a trial with a sentence pointing to Billing, and still invites viewers", async () => {
	const fake = source("admin", { ...TRIAL, trialEditors: 10 });
	const host = mount(fake, "admin");
	await settle();
	type(host, "noor@tidemark.app");
	await act(async () => host.querySelector("form")?.requestSubmit());
	await settle();
	expect(host.querySelector('[role="status"]')?.textContent).toBe(
		"A trial holds up to 10 editors. Pay for the team in Settings › Billing to add more.",
	);
	type(host, "lena@tidemark.app");
	choose(host, "viewer");
	await act(async () => host.querySelector("form")?.requestSubmit());
	await settle();
	expect(host.querySelector('[role="status"]')?.textContent).toBe("Invite sent.");
	expect(fake.asked).toEqual(["invite tidemark noor@tidemark.app editor", "invite tidemark lena@tidemark.app viewer"]);
});

it("says the trial's cap as spool.page gives it", async () => {
	const fake = source("admin", { ...TRIAL, trialEditorCap: 5, trialEditors: 5 });
	const host = mount(fake, "admin");
	await settle();
	type(host, "noor@tidemark.app");
	await act(async () => host.querySelector("form")?.requestSubmit());
	await settle();
	expect(host.querySelector('[role="status"]')?.textContent).toBe(
		"A trial holds up to 5 editors. Pay for the team in Settings › Billing to add more.",
	);
});
