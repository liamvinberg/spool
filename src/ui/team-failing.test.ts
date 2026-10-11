// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { BillingState, BillingSummary, CloudTeam, TeamPeople } from "../cloud-teams";
import { fakeTeamsSource } from "./fake-teams-source";
import { TeamProjects, TeamsSourceContext } from "./teams";

/** A failing team's Home over a team source held in memory: the line its admins get, and nobody else. */

const at = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day, 12) / 1000;

const PEOPLE: TeamPeople = {
	members: [
		{ accountId: "ada", email: "ada@tidemark.app", role: "admin", you: true },
		{ accountId: "mira", email: "mira@tidemark.app", role: "editor", you: false },
		{ accountId: "lena", email: "lena@harbourbank.se", role: "viewer", you: false },
	],
	invites: [],
};

const FAILING: BillingSummary = {
	state: "failing",
	trialEndsAt: null,
	hadTime: true,
	paidBefore: true,
	prices: { currency: "usd", monthly: 2000, yearly: 19200 },
	plan: { seats: 2, cycle: "monthly", amount: 4000 },
	nextCharge: null,
	card: { brand: "visa", last4: "4242" },
	billingEmail: "ada@tidemark.app",
	periodEnd: at(2026, 7, 17),
	cancelAt: null,
	failingSince: at(2026, 6, 17),
	lapsesAt: at(2026, 7, 1),
};

const team = (role: CloudTeam["role"], state: BillingState = "failing"): CloudTeam => ({
	id: "t",
	address: "tidemark",
	name: "Tidemark",
	role,
	logo: null,
	people: 3,
	billing: { state },
});

function home(fake: ReturnType<typeof fakeTeamsSource>, shown: CloudTeam) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const opened: string[] = [];
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const render = (team: CloudTeam) =>
		act(() =>
			root.render(
				createElement(
					TeamsSourceContext.Provider,
					{ value: fake.source },
					createElement(TeamProjects, { team, onOpen: (url) => opened.push(url) }),
				),
			),
		);
	render(shown);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	return { host, opened, render };
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

const line = (host: ParentNode) => host.querySelector(".pj-billing-failing");

it("tells an admin the last payment failed and until when, and Manage billing opens Stripe's portal", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")], people: PEOPLE, billing: FAILING });
	const { host, opened } = home(fake, team("admin"));
	await settle();
	expect(line(host)?.getAttribute("role")).toBe("status");
	expect(line(host)?.textContent).toBe(
		"Tidemark’s last payment failed. Update the card before July 1 to keep it syncing.Manage billing",
	);
	await act(async () => line(host)?.querySelector("button")?.click());
	await settle();
	expect(fake.asked).toEqual(["billing tidemark", "portal tidemark"]);
	expect(opened).toEqual(["https://billing.stripe.test/tidemark"]);
	// Home itself carries on: a failing team keeps working
	expect(host.querySelector("dialog")).toBeNull();
	expect(host.textContent).toContain("Tidemark has no projects on this Mac yet");
});

it("says what spool.page refused when the portal can't open", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")], people: PEOPLE, billing: FAILING });
	fake.source.portal = async () => {
		throw new (await import("./team-source")).TeamActionRefused("no_subscription");
	};
	const { host, opened } = home(fake, team("admin"));
	await settle();
	await act(async () => line(host)?.querySelector("button")?.click());
	await settle();
	expect(line(host)?.textContent).toBe(
		"Tidemark’s last payment failed. Update the card before July 1 to keep it syncing. This team hasn’t paid yet, so there’s no billing to manage.Manage billing",
	);
	expect(opened).toEqual([]);
});

it("goes once the team pays again", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")], people: PEOPLE, billing: FAILING });
	const { host, render } = home(fake, team("admin"));
	await settle();
	expect(line(host)).not.toBeNull();
	// the card was fixed in the portal; the team list read on coming back says paying
	fake.set({ billing: { ...FAILING, state: "paying", failingSince: null, lapsesAt: null } });
	render(team("admin", "paying"));
	await settle();
	expect(line(host)).toBeNull();
});

it("shows no line on a team that isn't failing, and reads no billing for it", async () => {
	for (const state of ["free", "trial", "paying", "ending"] as const) {
		const fake = fakeTeamsSource({ teams: [team("admin", state)], people: PEOPLE, billing: { ...FAILING, state } });
		const { host } = home(fake, team("admin", state));
		await settle();
		expect(line(host)).toBeNull();
		expect(fake.asked).toEqual([]);
	}
});

it("tells editors and viewers nothing of it, and never reads billing for them", async () => {
	for (const role of ["editor", "viewer"] as const) {
		const fake = fakeTeamsSource({ teams: [team(role)], people: PEOPLE, billing: FAILING });
		const { host } = home(fake, team(role));
		await settle();
		expect(line(host)).toBeNull();
		expect(host.textContent).not.toMatch(/payment|card|Manage billing/u);
		expect(fake.asked).toEqual([]);
	}
});
