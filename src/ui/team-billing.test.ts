// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { BillingSummary, CloudTeam, TeamPeople } from "../cloud-teams";
import { fakeTeamsSource } from "./fake-teams-source";
import { TeamBilling } from "./team-billing";
import { TeamSettingsPage, TeamsSourceContext } from "./teams";

/** Settings › Billing over a team source held in memory, in each state a team's billing can be in. */

const at = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day, 12) / 1000;

const PEOPLE: TeamPeople = {
	members: [
		{ accountId: "ada", email: "ada@tidemark.app", role: "admin", you: true },
		{ accountId: "mira", email: "mira@tidemark.app", role: "editor", you: false },
		{ accountId: "sam", email: "sam@tidemark.app", role: "editor", you: false },
		{ accountId: "lena", email: "lena@harbourbank.se", role: "viewer", you: false },
	],
	invites: [],
};

const NONE: Omit<BillingSummary, "state"> = {
	trialEndsAt: null,
	hadTime: false,
	prices: { currency: "usd", monthly: 2000, yearly: 19200 },
	plan: null,
	nextCharge: null,
	card: null,
	billingEmail: null,
	periodEnd: null,
	cancelAt: null,
	failingSince: null,
	lapsesAt: null,
};

const TRIAL: BillingSummary = { ...NONE, state: "trial", trialEndsAt: at(2026, 10, 25), hadTime: true };
const PAYING: BillingSummary = {
	...NONE,
	state: "paying",
	trialEndsAt: at(2026, 10, 25),
	hadTime: true,
	plan: { seats: 3, cycle: "yearly", amount: 57_600 },
	nextCharge: { at: at(2027, 10, 25), amount: 57_600 },
	card: { brand: "visa", last4: "4242" },
	billingEmail: "ada@tidemark.app",
	periodEnd: at(2027, 10, 25),
};

const team = (role: CloudTeam["role"] = "admin"): CloudTeam => ({
	id: "t",
	address: "tidemark",
	name: "Tidemark",
	role,
	logo: null,
	people: 4,
	billing: { state: "trial" },
});

function mount(fake: ReturnType<typeof fakeTeamsSource>, element: React.ReactNode) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() => root.render(createElement(TeamsSourceContext.Provider, { value: fake.source }, element)));
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		sessionStorage.clear();
		vi.unstubAllGlobals();
	});
	return host;
}

function settings(fake: ReturnType<typeof fakeTeamsSource>, role: CloudTeam["role"] = "admin") {
	const opened: string[] = [];
	const tabs: string[] = [];
	const host = mount(
		fake,
		createElement(TeamSettingsPage, {
			team: team(role),
			origin: "https://spool.page",
			tab: "billing",
			onTab: (tab) => tabs.push(tab),
			onOpen: (url) => opened.push(url),
			onChanged: vi.fn(),
			onMoved: vi.fn(),
			onDeleted: vi.fn(),
		}),
	);
	return { host, opened, tabs };
}

async function settle(ms = 0) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

function button(host: ParentNode, label: string): HTMLButtonElement {
	const found = Array.from(host.querySelectorAll("button")).find((node) => node.textContent === label);
	if (!found) throw new Error(`Missing button: ${label}`);
	return found;
}

/** Each row of who to pay for, as it reads. */
function rows(host: ParentNode): string[] {
	return Array.from(host.querySelectorAll(".pj-team-billing li")).map((row) => row.textContent ?? "");
}

function box(host: ParentNode, email: string): HTMLInputElement {
	const row = Array.from(host.querySelectorAll(".pj-team-billing li")).find((each) =>
		each.textContent?.includes(email),
	);
	const input = row?.querySelector<HTMLInputElement>('input[type="checkbox"]');
	if (!input) throw new Error(`No box for ${email}`);
	return input;
}

it("on a trial says when it ends and offers the payment choice: every member, the cycle and the total", async () => {
	const fake = fakeTeamsSource({ teams: [team()], people: PEOPLE, billing: TRIAL });
	const { host, opened } = settings(fake);
	await settle();
	expect(Array.from(host.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent)).toEqual([
		"General",
		"Billing",
	]);
	expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Billing");
	expect(host.textContent).toContain("On trial until October 25.");
	expect(host.textContent).toContain("Who you pay for");
	expect(rows(host)).toEqual([
		"ada@tidemark.app (you)admin",
		"mira@tidemark.appeditor",
		"sam@tidemark.appeditor",
		"lena@harbourbank.seviewer · free",
	]);
	expect(box(host, "ada@").disabled).toBe(true);
	expect(box(host, "ada@").checked).toBe(true);
	expect(host.textContent).toContain("monthly · $20");
	expect(host.textContent).toContain("yearly · $16");
	expect(host.querySelector("[data-billing-total]")?.textContent).toBe("$576 a year");
	expect(host.textContent).toContain("3 editors × $16 a month");
	expect(host.textContent).toContain(
		"Stripe takes the card. Add a company name and VAT number there if you have them.",
	);

	// leaving sam out: sam becomes a viewer once Stripe takes the payment, and the total follows
	act(() => box(host, "sam@").click());
	expect(rows(host)[2]).toBe("sam@tidemark.appbecomes a viewer");
	expect(host.querySelector("[data-billing-total]")?.textContent).toBe("$384 a year");
	act(() => host.querySelector<HTMLInputElement>('input[type="radio"][value="monthly"]')?.click());
	expect(host.querySelector("[data-billing-total]")?.textContent).toBe("$40 a month");
	expect(host.textContent).toContain("2 editors × $20 a month");

	await act(async () => button(host, "Continue to payment").click());
	await settle();
	expect(fake.asked).toContain("checkout tidemark monthly mira");
	expect(opened).toEqual(["https://checkout.stripe.test/tidemark"]);
});

it("once paid shows the plan, the next charge and the card, and Manage billing opens Stripe's portal", async () => {
	const fake = fakeTeamsSource({ teams: [team()], people: PEOPLE, billing: PAYING });
	const { host, opened } = settings(fake);
	await settle();
	const text = host.textContent ?? "";
	expect(text).toContain("Plan3 seats, billed yearly$576 a year");
	expect(text).toContain("Next chargeOctober 25, 2027 · $576Seats added before then are charged for the days left");
	expect(text).toContain("CardVisa ending 4242Invoices go to ada@tidemark.app");
	expect(text).not.toContain("On trial");
	expect(text).not.toContain("Continue to payment");
	await act(async () => button(host, "Manage billing").click());
	await settle();
	expect(opened).toEqual(["https://billing.stripe.test/tidemark"]);
});

it("says a failing team's card is being tried again until it goes local, above the plan", async () => {
	const fake = fakeTeamsSource({
		teams: [team()],
		people: PEOPLE,
		billing: { ...PAYING, state: "failing", failingSince: at(2026, 6, 17), lapsesAt: at(2026, 7, 1) },
	});
	const { host, opened } = settings(fake);
	await settle();
	const text = host.querySelector(".pj-team-billing")?.textContent ?? "";
	expect(text).toMatch(
		/^The last payment failed\. Stripe tries the card again until July 1, then Tidemark goes local\. Update the card in Manage billing\.Plan3 seats/u,
	);
	expect(text).not.toContain("Continue to payment");
	await act(async () => button(host, "Manage billing").click());
	await settle();
	expect(opened).toEqual(["https://billing.stripe.test/tidemark"]);
});

it("says when a cancelled team ends, and that undoing it is in Manage billing", async () => {
	const fake = fakeTeamsSource({
		teams: [team()],
		people: PEOPLE,
		billing: { ...PAYING, state: "ending", nextCharge: null, cancelAt: at(2026, 11, 30) },
	});
	const { host } = settings(fake);
	await settle();
	const text = host.querySelector(".pj-team-billing")?.textContent ?? "";
	expect(text).toMatch(/^Ends on November 30\. Undo it in Manage billing to keep Tidemark\.Plan3 seats/u);
	expect(text).not.toContain("Next charge");
	button(host, "Manage billing");
});

it("says a lapsed team's trial has ended, or that it has gone local once it had paid, over the payment choice", async () => {
	const lapsed: BillingSummary = { ...NONE, state: "lapsed", hadTime: true, trialEndsAt: at(2026, 10, 25) };
	const ended = settings(fakeTeamsSource({ teams: [team()], people: PEOPLE, billing: lapsed }));
	await settle();
	expect(ended.host.querySelector(".pj-team-billing p")?.textContent).toBe(
		"Tidemark’s trial has ended. Choose who stays an editor and pay to keep syncing. Anyone left out becomes a viewer.",
	);
	expect(rows(ended.host)).toHaveLength(4);
	button(ended.host, "Continue to payment");
	expect(ended.host.textContent).not.toContain("Manage billing");

	const local = settings(
		fakeTeamsSource({ teams: [team()], people: PEOPLE, billing: { ...lapsed, paidBefore: true } }),
	);
	await settle();
	expect(local.host.querySelector(".pj-team-billing p")?.textContent).toBe(
		"Tidemark has gone local. Choose who stays an editor and pay to keep syncing. Anyone left out becomes a viewer.",
	);
	button(local.host, "Continue to payment");
});

it("says a free team is free and never asks Stripe for anything", async () => {
	const fake = fakeTeamsSource({ teams: [team()], people: PEOPLE, billing: { ...NONE, state: "free" } });
	const { host } = settings(fake);
	await settle();
	expect(host.querySelector(".pj-team-billing")?.textContent).toBe("Free team");
	expect(host.textContent).not.toContain("Continue to payment");
	expect(host.textContent).not.toContain("Manage billing");
	expect(fake.asked.filter((line) => /^(checkout|portal)/u.test(line))).toEqual([]);
});

it("asks a team that never had time to pay for itself", async () => {
	const fake = fakeTeamsSource({ teams: [team()], people: PEOPLE, billing: { ...NONE, state: "lapsed" } });
	const { host } = settings(fake);
	await settle();
	expect(host.textContent).toContain("Pay for Tidemark");
	expect(host.textContent).not.toContain("On trial");
	expect(rows(host)).toHaveLength(4);
	button(host, "Continue to payment");
});

it("says what spool.page refused when Checkout can't start", async () => {
	const fake = fakeTeamsSource({ teams: [team()], people: PEOPLE, billing: TRIAL });
	fake.source.checkout = async () => {
		throw new (await import("./team-source")).TeamActionRefused("already_paying");
	};
	const { host, opened } = settings(fake);
	await settle();
	await act(async () => button(host, "Continue to payment").click());
	await settle();
	expect(host.querySelector('[role="status"]')?.textContent).toBe("This team is already paid for.");
	expect(opened).toEqual([]);
});

it("gives editors and viewers no Billing tab, and never reads billing for them", async () => {
	for (const role of ["editor", "viewer"] as const)
		for (const state of ["paying", "failing", "ending", "lapsed"] as const) {
			const fake = fakeTeamsSource({ teams: [team(role)], people: PEOPLE, billing: { ...PAYING, state } });
			const { host } = settings(fake, role);
			await settle();
			expect(host.querySelector('[role="tab"]')).toBeNull();
			expect(host.textContent).not.toContain("Billing");
			expect(host.textContent).not.toMatch(/seat|\$/u);
			expect(host.textContent).toContain("Delete team");
			expect(fake.asked.filter((line) => line.startsWith("billing"))).toEqual([]);
		}
});

it("switches between General and Billing through its tabs", async () => {
	const fake = fakeTeamsSource({ teams: [team()], people: PEOPLE, billing: TRIAL });
	const { host, tabs } = settings(fake);
	await settle();
	act(() => button(host, "General").click());
	expect(tabs).toEqual(["general"]);
});

it("after Checkout, reads again on coming back and keeps reading until Stripe says it paid", async () => {
	const fake = fakeTeamsSource({ teams: [team()], people: PEOPLE, billing: TRIAL });
	const opened: string[] = [];
	const host = mount(
		fake,
		createElement(TeamBilling, { team: team(), onOpen: (url) => opened.push(url), pollMs: 20 }),
	);
	await settle();
	await act(async () => button(host, "Continue to payment").click());
	await settle();
	expect(opened).toHaveLength(1);
	// back from Stripe, before its webhook came: still the trial, so Billing keeps asking
	const before = fake.asked.filter((line) => line.startsWith("billing")).length;
	act(() => {
		window.dispatchEvent(new Event("focus"));
	});
	await settle(70);
	expect(fake.asked.filter((line) => line.startsWith("billing")).length).toBeGreaterThan(before + 1);
	expect(host.textContent).toContain("On trial until October 25.");
	fake.set({ billing: PAYING });
	await settle(70);
	expect(host.textContent).toContain("Visa ending 4242");
	// paid: it stops asking
	const paid = fake.asked.filter((line) => line.startsWith("billing")).length;
	await settle(70);
	expect(fake.asked.filter((line) => line.startsWith("billing")).length).toBe(paid);
});

it("reads billing again when the window comes back, without a Checkout of its own", async () => {
	const fake = fakeTeamsSource({ teams: [team()], people: PEOPLE, billing: TRIAL });
	const host = mount(fake, createElement(TeamBilling, { team: team(), onOpen: vi.fn(), pollMs: 20 }));
	await settle();
	fake.set({ billing: PAYING });
	act(() => {
		window.dispatchEvent(new Event("focus"));
	});
	await settle();
	expect(host.textContent).toContain("3 seats, billed yearly");
});
