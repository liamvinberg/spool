// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { BillingSummary, CloudTeam, TeamPeople, TeamSetup } from "../cloud-teams";
import { DOWNLOAD_URL } from "./desktop-bridge";
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
					createElement(TeamProjects, { team: team(role), onOpen: () => {}, setup: { ...shown, ...next } }),
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

		fake.set({
			setup: steps({
				invited: { editors: 2, viewers: 1 },
				mac: { name: "Ada Lovelace", email: "ada@tidemark.app" },
			}),
		});
		await back();
		expect(said(step(host, "mac"))).toBe("Get spool on your MacSigned in as Ada Lovelace");
		// in a browser step 4 carries on in the app, where this Mac's own projects are
		const moved = step(host, "moved");
		expect(moved.getAttribute("data-state")).toBe("current");
		expect(said(moved)).toContain(
			"Carry on in spool on your Mac: this step lists your own projects there, each with Move to Tidemark…",
		);
		expect(setUp).toEqual([]);
	});

	it("offers the download when Open in spool finds spool isn't open on this Mac", async () => {
		vi.stubGlobal("fetch", async () => {
			throw new TypeError("Failed to fetch");
		});
		const fake = fakeTeamsSource({ teams: [team()], setup: steps({ invited: "skipped" }) });
		const { host, opened } = mount(fake);
		await settle();
		const mac = step(host, "mac");
		await act(async () => button(mac, "Open in spool").click());
		await settle();
		expect(said(mac)).toContain("spool isn’t open on this Mac. Open it, or download it.");
		act(() => button(mac, "download it").click());
		expect(opened).toEqual([DOWNLOAD_URL]);
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

	it("says under each editor's row what one more seat costs, on a team that already pays", async () => {
		const paying: TeamPeople = {
			...PEOPLE,
			seats: 1,
			billing: {
				state: "paying",
				cycle: "yearly",
				seatPrice: 1600,
				charged: "now",
				trialEditorCap: null,
				trialEditors: null,
			},
		};
		const fake = fakeTeamsSource({ teams: [team()], setup: FRESH, people: paying });
		const { host } = mount(fake);
		await settle();
		type(emails(host)[0] as HTMLInputElement, "noor.k@tidemark.app");
		type(emails(host)[1] as HTMLInputElement, "lena@harbourbank.se");
		const costs = () => Array.from(host.querySelectorAll(".pj-seat-cost")).map((line) => line.textContent);
		expect(costs()).toEqual([
			"An editor is one more seat: $16 a month, charged for the days left this billing year once they join.",
			"An editor is one more seat: $16 a month, charged for the days left this billing year once they join.",
		]);
		act(() =>
			host
				.querySelector<HTMLInputElement>(
					'[aria-label="Role of lena@harbourbank.se"] input[type="radio"][value="viewer"]',
				)
				?.click(),
		);
		expect(costs()).toEqual([
			"An editor is one more seat: $16 a month, charged for the days left this billing year once they join.",
		]);
	});

	it("says no cost on a trial, where nothing is charged yet", async () => {
		const trial: TeamPeople = {
			...PEOPLE,
			seats: 1,
			billing: {
				state: "trial",
				cycle: null,
				seatPrice: null,
				charged: null,
				trialEditorCap: 10,
				trialEditors: 1,
			},
		};
		const fake = fakeTeamsSource({ teams: [team()], setup: FRESH, people: trial });
		const { host } = mount(fake);
		await settle();
		type(emails(host)[0] as HTMLInputElement, "noor@tidemark.app");
		expect(host.querySelector(".pj-seat-cost")).toBeNull();
	});

	it("says the trial's cap as spool.page gives it when an editor's invite is refused", async () => {
		const full: TeamPeople = {
			...PEOPLE,
			seats: 1,
			billing: {
				state: "trial",
				cycle: null,
				seatPrice: null,
				charged: null,
				trialEditorCap: 2,
				trialEditors: 2,
			},
		};
		const fake = fakeTeamsSource({ teams: [team()], setup: FRESH, people: full });
		const { host } = mount(fake);
		await settle();
		type(emails(host)[0] as HTMLInputElement, "noor@tidemark.app");
		await act(async () => button(host, "Send invites").click());
		await settle();
		expect(step(host, "invited").querySelector('[role="status"]')?.textContent).toBe(
			"A trial holds up to 2 editors. Pay for the team in Settings › Billing to add more.",
		);
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

	it("completes Move a project in with Skip, and the list ends", async () => {
		const fake = fakeTeamsSource({
			teams: [team()],
			setup: steps({ invited: "skipped", mac: { email: "ada@tidemark.app" } }),
		});
		const { host, setUp } = mount(fake);
		await settle();
		expect(step(host, "moved").getAttribute("data-state")).toBe("current");
		await act(async () => button(host, "Skip").click());
		await settle();
		expect(fake.asked).toContain("skip projects tidemark");
		expect(fake.asked).toContain("setup done tidemark");
		expect(setUp.length).toBe(1);
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
		tickBusiness(pay);
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
		render({ revision: 1 });
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

	it("starts afresh on another team, as the app switches teams on one Projects page", async () => {
		const harbour: CloudTeam = { ...team(), id: "u", address: "harbour", name: "Harbour" };
		const done = steps({ invited: "skipped", mac: { email: "ada@tidemark.app" }, moved: { project: "app" } });
		const fake = fakeTeamsSource({ teams: [team(), harbour] });
		const answers = new Map<string, Promise<TeamSetup>>([["tidemark", Promise.resolve(FRESH)]]);
		let answerHarbour: (setup: TeamSetup) => void = () => {};
		answers.set("harbour", new Promise((resolve) => (answerHarbour = resolve)));
		fake.source.setup = (address) => answers.get(address) ?? Promise.reject(new Error(address));
		fake.source.setupDone = async (address) => {
			fake.asked.push(`setup done ${address}`);
			return { ...done, done: true };
		};
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		const element = document.createElement("div");
		document.body.append(element);
		const root = createRoot(element);
		const setUp: string[] = [];
		const show = (shown: CloudTeam) =>
			act(() =>
				root.render(
					createElement(
						TeamsSourceContext.Provider,
						{ value: fake.source },
						createElement(TeamProjects, {
							team: shown,
							onOpen: () => {},
							setup: {
								on: "mac",
								you: "ada@tidemark.app",
								origin: "https://spool.page",
								onOpen: () => {},
								onSetUp: (finished) => setUp.push(finished.name),
							},
						}),
					),
				),
			);
		onTestFinished(() => {
			act(() => root.unmount());
			element.remove();
			vi.unstubAllGlobals();
		});

		show(team());
		await settle();
		expect(element.querySelector(".pj-team-setup")?.getAttribute("aria-label")).toBe("Set up Tidemark");
		// Harbour's facts aren't in yet: Tidemark's steps never stand under its name
		show(harbour);
		await settle();
		expect(element.querySelector(".pj-team-setup")).toBeNull();

		// Tidemark finishes, then Harbour does too: each is said once
		answers.set("tidemark", Promise.resolve(done));
		show(team());
		await settle();
		expect(setUp).toEqual(["Tidemark"]);
		show(harbour);
		answerHarbour(done);
		await settle();
		expect(fake.asked.filter((line) => line.startsWith("setup done"))).toEqual([
			"setup done tidemark",
			"setup done harbour",
		]);
		expect(setUp).toEqual(["Tidemark", "Harbour"]);
	});
});

/** Ticks that the team is bought for business or work, which paying waits for (spool#209). */
function tickBusiness(host: ParentNode) {
	const label = Array.from(host.querySelectorAll("label")).find(
		(each) => each.textContent === "I’m buying for my business or work",
	);
	const input = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
	if (!input) throw new Error("No business tick");
	if (!input.checked) act(() => input.click());
}
