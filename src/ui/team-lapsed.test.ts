// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { BillingSummary, CloudTeam, TeamPeople } from "../cloud-teams";
import { fakeTeamsSource } from "./fake-teams-source";
import { attachHotkeyLayer, runMenuHotkey } from "./hotkey-dispatch";
import { TeamProjects, TeamsSourceContext } from "./teams";

/** A lapsed team's Home over a team source held in memory: the dialog its admins get, the line everyone else gets. */

const PEOPLE: TeamPeople = {
	members: [
		{ accountId: "ada", email: "ada@tidemark.app", role: "admin", you: true },
		{ accountId: "mira", email: "mira@tidemark.app", role: "editor", you: false },
		{ accountId: "sam", email: "sam@tidemark.app", role: "editor", you: false },
		{ accountId: "lena", email: "lena@harbourbank.se", role: "viewer", you: false },
	],
	invites: [],
};

const LAPSED: BillingSummary = {
	state: "lapsed",
	trialEndsAt: Date.UTC(2026, 9, 25, 12) / 1000,
	hadTime: true,
	paidBefore: false,
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

const team = (
	role: CloudTeam["role"],
	state: NonNullable<CloudTeam["billing"]>["state"] = "lapsed",
	hadTime?: boolean,
): CloudTeam => ({
	id: "t",
	address: "tidemark",
	name: "Tidemark",
	role,
	logo: null,
	people: 4,
	billing: { state, ...(hadTime === undefined ? {} : { hadTime }) },
});

function home(fake: ReturnType<typeof fakeTeamsSource>, shown: CloudTeam) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const opened: string[] = [];
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const render = () =>
		act(() =>
			root.render(
				createElement(
					TeamsSourceContext.Provider,
					{ value: fake.source },
					createElement(TeamProjects, { team: shown, onOpen: (url) => opened.push(url) }),
				),
			),
		);
	render();
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	return {
		host,
		opened,
		/** Home drawn again where it stands, as a team list read on focus does. */
		rerender: render,
		/** Home's Projects page opened again in this window, as going to People and back does. */
		again: () => {
			act(() => root.render(null));
			render();
		},
	};
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

const dialog = (host: ParentNode) => host.querySelector<HTMLDialogElement>("dialog");

function button(host: ParentNode, label: string): HTMLButtonElement {
	const found = Array.from(host.querySelectorAll("button")).find((node) => node.textContent === label);
	if (!found) throw new Error(`Missing button: ${label}`);
	return found;
}

it("asks an admin, once the trial ended unpaid, who stays an editor and to pay, and goes to Checkout", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")], people: PEOPLE, billing: LAPSED });
	const { host, opened } = home(fake, team("admin"));
	await settle();
	const shown = dialog(host);
	expect(shown?.open).toBe(true);
	expect(shown?.querySelector("h2")?.textContent).toBe("Tidemark’s trial has ended");
	expect(shown?.textContent).toContain(
		"Choose who stays an editor and pay to keep syncing. Anyone left out becomes a viewer.",
	);
	// Billing's payment choice: every member, the cycle and the total
	expect(shown?.textContent).toContain("Who you pay for");
	expect(shown?.querySelector("[data-billing-total]")?.textContent).toBe("$576 a year");
	expect(host.querySelector(".pj-gone-local")).toBeNull();

	act(() => {
		const sam = Array.from(shown?.querySelectorAll("li") ?? []).find((row) => row.textContent?.includes("sam@"));
		sam?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
	});
	await act(async () => button(host, "Continue to payment").click());
	await settle();
	expect(fake.asked).toContain("checkout tidemark yearly mira");
	expect(opened).toEqual(["https://checkout.stripe.test/tidemark"]);
	expect(dialog(host)).toBeNull();
});

it("starts its payment choice on the cycle the landing showed", async () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const fake = fakeTeamsSource({ teams: [team("admin")], people: PEOPLE, billing: LAPSED });
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() =>
		root.render(
			createElement(
				TeamsSourceContext.Provider,
				{ value: fake.source },
				createElement(TeamProjects, { team: team("admin"), onOpen: () => {}, cycle: "monthly" }),
			),
		),
	);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	await settle();
	expect(dialog(host)?.querySelector("[data-billing-total]")?.textContent).toBe("$60 a month");
});

it("says a team that had paid has gone local", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")], people: PEOPLE, billing: { ...LAPSED, paidBefore: true } });
	const { host } = home(fake, team("admin"));
	await settle();
	expect(dialog(host)?.querySelector("h2")?.textContent).toBe("Tidemark has gone local");
});

it("keeps the app's keys behind it while it is open", async () => {
	const ran: string[] = [];
	const detach = attachHotkeyLayer({ scope: "app", handlers: { "app.new-project": () => ran.push("new project") } });
	onTestFinished(detach);
	const fake = fakeTeamsSource({ teams: [team("admin")], people: PEOPLE, billing: LAPSED });
	const { host } = home(fake, team("admin"));
	await settle();
	expect(dialog(host)?.open).toBe(true);
	expect(runMenuHotkey("app.new-project")).toBe(false);
	act(() => button(host, "Not now").click());
	expect(runMenuHotkey("app.new-project")).toBe(true);
	expect(ran).toEqual(["new project"]);
});

it("can be closed, and comes back on the next visit", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")], people: PEOPLE, billing: LAPSED });
	const { host, again, rerender } = home(fake, team("admin"));
	await settle();
	act(() => button(host, "Not now").click());
	expect(dialog(host)).toBeNull();
	// a team list read again on focus keeps Home's Projects page up: still closed
	rerender();
	await settle();
	expect(dialog(host)).toBeNull();
	// the next visit to the team's Projects page opens it again, in the same window too
	again();
	await settle();
	expect(dialog(host)?.open).toBe(true);
	expect(fake.asked.filter((line) => line.startsWith("checkout"))).toEqual([]);
});

it("says what spool.page refused, and stays open", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")], people: PEOPLE, billing: LAPSED });
	fake.source.checkout = async () => {
		throw new (await import("./team-source")).TeamActionRefused("already_paying");
	};
	const { host, opened } = home(fake, team("admin"));
	await settle();
	await act(async () => button(host, "Continue to payment").click());
	await settle();
	expect(dialog(host)?.querySelector('[role="alert"]')?.textContent).toBe("This team is already paid for.");
	expect(opened).toEqual([]);
});

it("tells an admin in a line when billing can't be read, saying why the dialog can't open", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")], people: PEOPLE });
	fake.source.billing = async () => {
		throw new Error("offline");
	};
	const { host } = home(fake, team("admin"));
	await settle();
	expect(dialog(host)).toBeNull();
	expect(host.querySelector(".pj-gone-local")?.textContent).toBe(
		"Tidemark has gone local. spool.page can’t be reached just now. Try again.",
	);
});

it("asks nothing of an admin whose team never had time: it is paid for from Billing", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")], people: PEOPLE, billing: { ...LAPSED, hadTime: false } });
	const { host } = home(fake, team("admin"));
	await settle();
	expect(dialog(host)).toBeNull();
	expect(host.querySelector(".pj-gone-local")).toBeNull();
	// the team list says so too: then billing isn't even read
	const listed = fakeTeamsSource({ teams: [team("admin", "lapsed", false)], people: PEOPLE, billing: LAPSED });
	const again = home(listed, team("admin", "lapsed", false));
	await settle();
	expect(dialog(again.host)).toBeNull();
	expect(listed.asked).toEqual([]);
});

it("tells editors and viewers of a team that never had time that it isn't paid for yet", async () => {
	for (const role of ["editor", "viewer"] as const) {
		const fake = fakeTeamsSource({ teams: [team(role, "lapsed", false)], people: PEOPLE });
		const { host } = home(fake, team(role, "lapsed", false));
		await settle();
		expect(host.querySelector(".pj-gone-local")?.textContent).toBe(
			"Tidemark isn’t paid for yet. Ask an admin to pay for it to sync.",
		);
		expect(fake.asked).toEqual([]);
	}
});

it("tells editors and viewers in one line, and never reads billing for them", async () => {
	for (const role of ["editor", "viewer"] as const) {
		const fake = fakeTeamsSource({ teams: [team(role)], people: PEOPLE, billing: LAPSED });
		const { host } = home(fake, team(role));
		await settle();
		expect(host.querySelector(".pj-gone-local")?.textContent).toBe(
			"Tidemark has gone local. Ask an admin to pay for it to sync again.",
		);
		expect(dialog(host)).toBeNull();
		expect(host.textContent).not.toMatch(/seat|\$/u);
		expect(fake.asked.filter((line) => line.startsWith("billing"))).toEqual([]);
	}
});

it("says nothing on a team with paid time", async () => {
	for (const state of ["free", "trial", "paying", "failing", "ending"] as const)
		for (const role of ["admin", "editor"] as const) {
			const fake = fakeTeamsSource({ teams: [team(role, state)], people: PEOPLE, billing: { ...LAPSED, state } });
			const { host } = home(fake, team(role, state));
			await settle();
			expect(dialog(host)).toBeNull();
			expect(host.querySelector(".pj-gone-local")).toBeNull();
			// only a failing team's admins read billing, for the failing line
			expect(fake.asked).toEqual(state === "failing" && role === "admin" ? ["billing tidemark"] : []);
		}
});

/** Home's Projects page with New project, and Billing when the host can go there. */
function withNewProject(fake: ReturnType<typeof fakeTeamsSource>, shown: CloudTeam, billing: boolean) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const started: string[] = [];
	const went: string[] = [];
	act(() =>
		root.render(
			createElement(
				TeamsSourceContext.Provider,
				{ value: fake.source },
				createElement(TeamProjects, {
					team: shown,
					onOpen: vi.fn(),
					onNewProject: () => started.push(shown.address),
					onBilling: billing ? () => went.push("billing") : undefined,
				}),
			),
		),
	);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	/** The New project dialog, once asked for. */
	const refusal = () =>
		Array.from(host.querySelectorAll("dialog")).find(
			(each) => each.querySelector("h2")?.textContent === "New project",
		);
	return { host, started, went, refusal };
}

it("says up front that a lapsed team takes no new project, and sends an admin to Billing when the host can", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")], people: PEOPLE, billing: LAPSED });
	const admin = withNewProject(fake, team("admin"), true);
	await settle();
	act(() => button(admin.host, "New project…").click());
	expect(admin.started).toEqual([]);
	expect(admin.refusal()?.textContent).toContain(
		"Tidemark has gone local. Pay for it in Settings › Billing to add projects.",
	);
	await act(async () => button(admin.refusal() as HTMLElement, "Go to Billing").click());
	await settle();
	expect(admin.went).toEqual(["billing"]);
	expect(admin.refusal()).toBeUndefined();
});

it("gives an admin the sentence alone where the host can't go to Billing, and tells others an admin can pay", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")], people: PEOPLE, billing: LAPSED });
	const admin = withNewProject(fake, team("admin"), false);
	await settle();
	act(() => button(admin.host, "New project…").click());
	expect(admin.refusal()?.textContent).toContain(
		"Tidemark has gone local. Pay for it in Settings › Billing to add projects.",
	);
	expect(() => button(admin.refusal() as HTMLElement, "Go to Billing")).toThrow();

	const editor = withNewProject(fake, team("editor"), true);
	await settle();
	act(() => button(editor.host, "New project…").click());
	expect(editor.started).toEqual([]);
	expect(editor.refusal()?.textContent).toContain("Tidemark has gone local. An admin can pay for it to add projects.");
	expect(() => button(editor.refusal() as HTMLElement, "Go to Billing")).toThrow();
	act(() => button(editor.refusal() as HTMLElement, "OK").click());
	await settle();
	expect(editor.refusal()).toBeUndefined();
});

it("starts a new project in a team with time as ever", async () => {
	const fake = fakeTeamsSource({ teams: [team("editor", "paying")], people: PEOPLE, billing: LAPSED });
	const editor = withNewProject(fake, team("editor", "paying"), true);
	await settle();
	act(() => button(editor.host, "New project…").click());
	expect(editor.started).toEqual(["tidemark"]);
	expect(editor.refusal()).toBeUndefined();
});
