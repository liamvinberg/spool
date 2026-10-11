// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { BillingSummary, CloudTeam, TeamPeople, TeamSetup } from "../cloud-teams";
import { fakeTeamsSource } from "./fake-teams-source";
import type { SetupHost } from "./team-setup";
import { TeamProjects, TeamsSourceContext } from "./teams";

/** A new team's setup list on its Projects page, over a team source held in memory, as each fact comes true. */

const team = (role: CloudTeam["role"] = "admin"): CloudTeam => ({
	id: "t",
	address: "tidemark",
	name: "Tidemark",
	role,
	logo: null,
	people: 1,
	billing: { state: "trial" },
});

const FRESH: TeamSetup = {
	done: false,
	steps: { named: { address: "tidemark" }, pay: null, invited: null, mac: null, moved: null },
};

const steps = (change: Partial<TeamSetup["steps"]>, done = false): TeamSetup => ({
	done,
	steps: { ...FRESH.steps, ...change },
});

const PEOPLE: TeamPeople = {
	members: [{ accountId: "ada", email: "ada@tidemark.app", role: "admin", you: true }],
	invites: [],
};

const LAPSED: BillingSummary = {
	state: "lapsed",
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

function mount(
	fake: ReturnType<typeof fakeTeamsSource>,
	host: Partial<SetupHost> = {},
	role: CloudTeam["role"] = "admin",
) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const element = document.createElement("div");
	document.body.append(element);
	const root = createRoot(element);
	const opened: string[] = [];
	const setUp: string[] = [];
	const moved: string[] = [];
	const shown: SetupHost = {
		on: "browser",
		you: "ada@tidemark.app",
		origin: "https://spool.page",
		onOpen: (url) => opened.push(url),
		onSetUp: (done) => setUp.push(done.name),
		onMove: (project) => moved.push(project.name),
		...host,
	};
	const render = (next: Partial<SetupHost> = {}) =>
		act(() =>
			root.render(
				createElement(
					TeamsSourceContext.Provider,
					{ value: fake.source },
					createElement(TeamProjects, { team: team(role), setup: { ...shown, ...next } }),
				),
			),
		);
	render();
	onTestFinished(() => {
		act(() => root.unmount());
		element.remove();
		sessionStorage.clear();
		vi.unstubAllGlobals();
	});
	return { host: element, opened, setUp, moved, render };
}

async function settle(ms = 0) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

/** Coming back to the window, as from the Mac or from Stripe. */
async function back() {
	await act(async () => {
		window.dispatchEvent(new Event("focus"));
	});
	await settle();
}

function button(host: ParentNode, label: string): HTMLButtonElement {
	const found = Array.from(host.querySelectorAll("button")).find((node) => node.textContent === label);
	if (!found) throw new Error(`Missing button: ${label}`);
	return found;
}

/** Each step as it reads: its state, then its title and what came of it or what it asks. */
function read(host: ParentNode): string[] {
	return Array.from(host.querySelectorAll(".pj-team-setup li[data-step]")).map(
		(step) => `${step.getAttribute("data-state")}: ${said(step as HTMLElement)}`,
	);
}

/** What a step says, past its number or check. */
function said(step: HTMLElement): string {
	return step.querySelector(":scope > div")?.textContent ?? "";
}

function step(host: ParentNode, id: string): HTMLElement {
	const found = host.querySelector<HTMLElement>(`.pj-team-setup li[data-step="${id}"]`);
	if (!found) throw new Error(`Missing step: ${id}`);
	return found;
}

function type(input: HTMLInputElement, value: string) {
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

const emails = (host: ParentNode) =>
	Array.from(host.querySelectorAll<HTMLInputElement>('.pj-team-setup input[type="email"]'));

describe("a new team's setup list", () => {
	it("opens on Invite people with the team named, and says nothing of empty projects beneath it", async () => {
		const fake = fakeTeamsSource({ teams: [team()], setup: FRESH });
		const { host } = mount(fake);
		await settle();
		expect(host.querySelector(".pj-team-setup h2")?.textContent).toBe("Set up Tidemark");
		expect(host.textContent).toContain("Once these are done, this list goes away.");
		const [named, invited, mac, moved] = read(host);
		expect(named).toBe("done: Name the teamspool.page/tidemark");
		expect(invited).toMatch(/^current: Invite people/u);
		expect(mac).toBe("later: Get spool on your Mac");
		expect(moved).toBe("later: Move a project in");
		expect(host.textContent).not.toContain("has no projects");
	});

	it("completes each step from its fact, each done step saying what came of it", async () => {
		const fake = fakeTeamsSource({ teams: [team()], setup: FRESH });
		const { host, setUp } = mount(fake);
		await settle();
		fake.set({ setup: steps({ invited: { editors: 2, viewers: 1 } }) });
		await back();
		expect(said(step(host, "invited"))).toBe("Invite people2 editors and 1 viewer invited");
		const mac = step(host, "mac");
		expect(mac.getAttribute("data-state")).toBe("current");
		expect(button(mac, "Download for Mac")).toBeTruthy();
		expect(button(mac, "Open in spool")).toBeTruthy();
		expect(said(mac)).toContain("Sign in there as ada@tidemark.app and spool carries on with step 4.");

		fake.set({ setup: steps({ invited: { editors: 2, viewers: 1 }, mac: { email: "ada@tidemark.app" } }) });
		await back();
		expect(said(step(host, "mac"))).toBe("Get spool on your MacSigned in as ada@tidemark.app");
		// in a browser step 4 carries on in the app, where this Mac's own projects are
		const moved = step(host, "moved");
		expect(moved.getAttribute("data-state")).toBe("current");
		expect(said(moved)).toContain(
			"Carry on in spool on your Mac: this step lists your own projects there, each with Move to Tidemark…",
		);
		expect(setUp).toEqual([]);
	});

	it("sends one invite per email row, each an editor or a viewer", async () => {
		const fake = fakeTeamsSource({ teams: [team()], setup: FRESH, people: PEOPLE });
		const { host } = mount(fake);
		await settle();
		expect(button(host, "Send invites").disabled).toBe(true);
		type(emails(host)[0] as HTMLInputElement, "mira@tidemark.app");
		// a filled row brings another, and wears its own editor or viewer
		expect(emails(host).map((input) => input.placeholder)).toEqual(["Email address", "Another email address"]);
		type(emails(host)[1] as HTMLInputElement, "lena@harbourbank.se");
		const lena = host.querySelector<HTMLInputElement>(
			'[aria-label="Role of lena@harbourbank.se"] input[type="radio"][value="viewer"]',
		);
		act(() => lena?.click());
		await act(async () => button(host, "Send invites").click());
		await settle();
		expect(fake.asked).toContain("invite tidemark mira@tidemark.app editor");
		expect(fake.asked).toContain("invite tidemark lena@harbourbank.se viewer");
		expect(said(step(host, "invited"))).toBe("Invite people1 editor and 1 viewer invited");
	});

	it("completes Invite people with Skip", async () => {
		const fake = fakeTeamsSource({ teams: [team()], setup: FRESH });
		const { host } = mount(fake);
		await settle();
		await act(async () => button(host, "Skip").click());
		await settle();
		expect(fake.asked).toContain("skip invites tidemark");
		expect(said(step(host, "invited"))).toBe("Invite peopleSkipped");
		expect(step(host, "mac").getAttribute("data-state")).toBe("current");
	});

	it("puts Pay for the team second when its creator's trial was used, and completes it once paid", async () => {
		const fake = fakeTeamsSource({
			teams: [team()],
			setup: steps({ pay: { paid: false } }),
			people: PEOPLE,
			billing: LAPSED,
		});
		const { host, opened } = mount(fake, { cycle: "monthly" });
		await settle();
		expect(read(host).map((line) => line.split(":")[0])).toEqual(["done", "current", "later", "later", "later"]);
		const pay = step(host, "pay");
		expect(said(pay)).toMatch(/^Pay for Tidemark/u);
		expect(said(pay)).toContain("This account has had its trial, so Tidemark starts paid.");
		// the payment choice starts on the cycle the landing showed
		expect(pay.querySelector<HTMLInputElement>('input[type="radio"][value="monthly"]')?.checked).toBe(true);
		await act(async () => button(pay, "Continue to payment").click());
		expect(fake.asked).toContain("checkout tidemark monthly ");
		expect(opened).toEqual(["https://checkout.stripe.test/tidemark"]);

		fake.set({ setup: steps({ pay: { paid: true } }) });
		await back();
		expect(said(step(host, "pay"))).toBe("Pay for TidemarkPaid");
		expect(step(host, "invited").getAttribute("data-state")).toBe("current");
		// with Pay second, Move a project in is step 5
		fake.set({ setup: steps({ pay: { paid: true }, invited: "skipped" }) });
		await back();
		expect(said(step(host, "mac"))).toContain("Sign in there as ada@tidemark.app and spool carries on with step 5.");
	});

	it("lists this Mac's own projects in the app, each moving in through Move to the team", async () => {
		const fake = fakeTeamsSource({
			teams: [team()],
			setup: steps({ invited: "skipped", mac: { email: "ada@tidemark.app" } }),
		});
		const { host, moved } = mount(fake, {
			on: "mac",
			own: [
				{ root: "/Users/ada/code/tidemark-app", name: "tidemark-app" },
				{ root: "/Users/ada/code/notes", name: "notes" },
			],
		});
		await settle();
		expect(said(step(host, "mac"))).toBe("Get spool on your MacSigned in on this Mac");
		const step4 = step(host, "moved");
		expect(step4.getAttribute("data-state")).toBe("current");
		expect(said(step4)).toContain("/Users/ada/code/tidemark-app");
		act(() => (step4.querySelectorAll("button")[0] as HTMLButtonElement).click());
		expect(button(step4, "Move to Tidemark…")).toBeTruthy();
		expect(moved).toEqual(["tidemark-app"]);
	});

	it("is gone for good once the last step is done, said once", async () => {
		const fake = fakeTeamsSource({
			teams: [team()],
			setup: steps({ invited: "skipped", mac: { email: "ada@tidemark.app" } }),
		});
		const { host, setUp, render } = mount(fake, { on: "mac", own: [] });
		await settle();
		expect(read(host)).toHaveLength(4);
		fake.set({
			setup: steps({ invited: "skipped", mac: { email: "ada@tidemark.app" }, moved: { project: "tidemark-app" } }),
		});
		render({ revision: "/Users/ada/code/tidemark-app" });
		await settle();
		expect(host.querySelector(".pj-team-setup")).toBeNull();
		expect(fake.asked.filter((line) => line === "setup done tidemark")).toHaveLength(1);
		expect(setUp).toEqual(["Tidemark"]);
		// coming back reads it as done, and says nothing again
		await back();
		await back();
		expect(host.querySelector(".pj-team-setup")).toBeNull();
		expect(fake.asked.filter((line) => line === "setup done tidemark")).toHaveLength(1);
		expect(setUp).toEqual(["Tidemark"]);
	});

	it("never shows again where spool.page says setup is done", async () => {
		const fake = fakeTeamsSource({ teams: [team()], setup: { ...FRESH, done: true } });
		const { host, setUp } = mount(fake);
		await settle();
		expect(host.querySelector(".pj-team-setup")).toBeNull();
		expect(host.textContent).toContain("has no projects");
		expect(fake.asked).not.toContain("setup done tidemark");
		expect(setUp).toEqual([]);
	});

	it.each(["editor", "viewer"] as const)("shows nothing to an %s and never asks for it", async (role) => {
		const fake = fakeTeamsSource({ teams: [team(role)], setup: FRESH });
		const { host } = mount(fake, {}, role);
		await settle();
		await back();
		expect(host.querySelector(".pj-team-setup")).toBeNull();
		expect(fake.asked.filter((line) => line.startsWith("setup"))).toEqual([]);
	});
});
