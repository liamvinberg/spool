import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BillingSummary, CloudTeam, TeamPeople, TeamSetup } from "../../cloud-teams";
import { testBrowser } from "../../test-browser";
import { buildEntry } from "./build-entry";

/**
 * Home as spool.page serves it at /<team>: the package's own build, a page that says who is signed in, and the team
 * API on the same origin. It is the Mac app's Home with no tabs above it, and every change goes to spool.page.
 */

const APP = "https://cloud.test";
const NOW = Math.floor(Date.now() / 1000);

const TEAMS: CloudTeam[] = [
	{ id: "t1", address: "devosurf", name: "Devosurf", role: "admin", logo: null, people: 3 },
	{ id: "t2", address: "client", name: "Client Co", role: "viewer", logo: null, people: 8 },
];

const PEOPLE: TeamPeople = {
	members: [
		{ accountId: "a1", email: "vic@devosurf.com", role: "admin", you: true },
		{ accountId: "a2", email: "sam@devosurf.com", role: "editor", you: false },
	],
	invites: [],
};

const BILLING: BillingSummary = {
	state: "trial",
	trialEndsAt: Date.UTC(2026, 9, 25, 12) / 1000,
	hadTime: true,
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

let built: string;
let entry: { file: string; css: string[] };

beforeAll(async () => {
	built = mkdtempSync(join(tmpdir(), "spool-home-"));
	const { build } = await import("vite");
	await build({
		configFile: join(process.cwd(), "vite.viewer.config.ts"),
		logLevel: "silent",
		build: { outDir: built, emptyOutDir: true },
	});
	entry = buildEntry(JSON.parse(readFileSync(join(built, "manifest.json"), "utf8")), "home.html");
}, 120_000);

afterAll(() => rmSync(built, { recursive: true, force: true }));

async function open(
	path: string,
	given: { teams?: CloudTeam[]; billing?: BillingSummary; setup?: TeamSetup } = {},
): Promise<{ page: Page; asked: string[]; left: string[] }> {
	const { teams = TEAMS, billing = BILLING } = given;
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
	const asked: string[] = [];
	const left: string[] = [];
	let name: string | null = null;
	let commentEmails = "for-you";
	const macs = [
		{ id: "d1", name: "Vic’s MacBook Pro", signedInAt: NOW - 4 * 86400, usedAt: NOW },
		{ id: "d2", name: "Studio", signedInAt: NOW - 40 * 86400, usedAt: NOW - 30 * 86400 },
	];
	await page.route("**/*", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (url.origin !== APP) {
			if (url.hostname === "checkout.stripe.test" || url.hostname === "billing.stripe.test")
				left.push(url.toString());
			return route.abort();
		}
		if (url.pathname.startsWith("/_viewer/")) {
			const file = join(built, url.pathname.slice("/_viewer/".length));
			const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "font/woff2";
			return route.fulfill({ body: readFileSync(file), contentType: type });
		}
		if (url.pathname === "/account/name") {
			asked.push(`${request.method()} ${url.pathname} ${request.postData()}`);
			const given = (request.postDataJSON() as { name: string }).name;
			// spool.page's rule: 1 to 64 characters
			if (given === "" || [...given].length > 64)
				return route.fulfill({ status: 400, json: { error: "invalid_name" } });
			name = given;
			return route.fulfill({ json: { name } });
		}
		if (url.pathname === "/account/comment-emails") {
			asked.push(`${request.method()} ${url.pathname} ${request.postData()}`);
			commentEmails = (request.postDataJSON() as { emails: string }).emails;
			return route.fulfill({ json: { commentEmails } });
		}
		if (url.pathname === "/account/summary" || /^\/account\/devices\/[^/]+\/revoke$/u.test(url.pathname)) {
			asked.push(`${request.method()} ${url.pathname}`);
			const revoked = url.pathname.match(/devices\/([^/]+)\/revoke/u)?.[1];
			if (revoked)
				macs.splice(
					macs.findIndex((mac) => mac.id === revoked),
					1,
				);
			return route.fulfill({
				json: revoked
					? { revoked: true }
					: { email: "vic@devosurf.com", name, commentEmails, devices: macs, passkeys: [] },
			});
		}
		if (url.pathname.startsWith("/api/")) {
			asked.push(`${request.method()} ${url.pathname}${request.postData() ? ` ${request.postData()}` : ""}`);
			if (url.pathname === "/api/teams/devosurf/billing/checkout")
				return route.fulfill({ json: { url: "https://checkout.stripe.test/c/1" } });
			if (url.pathname === "/api/teams/devosurf/billing/portal")
				return route.fulfill({ json: { url: "https://billing.stripe.test/p/1" } });
			if (url.pathname === "/api/teams/devosurf/setup" && given.setup) return route.fulfill({ json: given.setup });
			if (url.pathname === "/api/teams/devosurf/setup/done" && given.setup)
				return route.fulfill({ json: { ...given.setup, done: true } });
			if (request.method() !== "GET") return route.fulfill({ json: {} });
			if (url.pathname === "/api/teams/devosurf/billing") return route.fulfill({ json: billing });
			if (url.pathname === "/api/teams")
				return route.fulfill({ json: { teams, invites: [], mayCreateTeam: false } });
			if (url.pathname === "/api/teams/devosurf/projects")
				return route.fulfill({
					json: {
						projects: [
							{ name: "checkout", url: `${APP}/devosurf/checkout`, repo: "github.com/devosurf/checkout" },
							{ name: "onboarding", url: `${APP}/devosurf/onboarding`, repo: null },
						],
					},
				});
			if (url.pathname === "/api/teams/devosurf/here")
				return route.fulfill({
					json: { projects: [{ name: "checkout", url: "", people: [{ name: "sam", color: "#7fd1b9" }] }] },
				});
			if (url.pathname === "/api/teams/devosurf/people") return route.fulfill({ json: PEOPLE });
			if (url.pathname === "/api/teams/devosurf/projects/checkout/cover")
				return route.fulfill({
					body: readFileSync(join(process.cwd(), "src/ui/agent-app-assets/claude.png")),
					contentType: "image/png",
				});
			return route.fulfill({ status: 404, json: { error: "not_found" } });
		}
		return route.fulfill({
			contentType: "text/html",
			body: `<!doctype html><html><head>${entry.css.map((css) => `<link rel="stylesheet" href="/_viewer/${css}">`).join("")}
<script type="module" src="/_viewer/${entry.file}"></script></head><body>
<script id="spool-home" type="application/json">${JSON.stringify({ account: "vic@devosurf.com" })}</script>
<div id="root"></div></body></html>`,
		});
	});
	await page.goto(`${APP}${path}`);
	return { page, asked, left };
}

/** A picture of the page in `SPOOL_TEST_SHOTS`, when it names a folder. */
async function shoot(page: Page, name: string) {
	const shots = process.env.SPOOL_TEST_SHOTS;
	if (shots) await page.screenshot({ path: join(shots, name) });
}

describe("Home in a browser", () => {
	it("draws the app's Home for the team: switcher, nav, covers and who is inside", { timeout: 60_000 }, async () => {
		const { page } = await open("/devosurf");
		const checkout = page.getByRole("link", { name: "Open checkout" });
		await checkout.waitFor();
		expect(await checkout.getAttribute("href")).toBe("/devosurf/checkout");
		await page.getByRole("link", { name: "Open onboarding" }).waitFor();
		expect(await page.locator("aside").textContent()).toContain("Devosurf");
		expect(await page.getByRole("navigation", { name: "Home sections" }).textContent()).toMatch(
			/Projects.*People.*Settings/u,
		);
		expect(await page.locator("[data-here]").getAttribute("data-here")).toBe("sam");
		expect(await page.locator("main").textContent()).toContain("github.com/devosurf/checkout");
		// the tab strip is the Mac window's: a browser has its own
		expect(await page.locator("[data-tab-strip], [role=tablist]").count()).toBe(0);
		expect(await page.title()).toBe("Devosurf · spool");
		if (process.env.SPOOL_HOME_SHOT) await page.screenshot({ path: process.env.SPOOL_HOME_SHOT });
	});

	it("moves between its pages and teams at their own addresses", { timeout: 60_000 }, async () => {
		const { page, asked } = await open("/devosurf");
		await page.getByRole("button", { name: "People" }).click();
		await page.getByText("sam@devosurf.com").waitFor();
		expect(new URL(page.url()).pathname).toBe("/devosurf/people");
		await page.goBack();
		await page.getByRole("link", { name: "Open checkout" }).waitFor();
		expect(new URL(page.url()).pathname).toBe("/devosurf");
		// a viewer's team is a place in a browser, not a link away
		await page.getByRole("button", { name: /Devosurf/u }).click();
		await page.getByRole("menuitem", { name: /Client Co/u }).click();
		await expect.poll(() => new URL(page.url()).pathname).toBe("/client");
		await page.getByText("Client Co has no projects yet").waitFor();
		expect(await page.getByRole("navigation", { name: "Home sections" }).textContent()).not.toContain("Settings");
		expect(asked).toContain("GET /api/teams/devosurf/people");
	});

	it("opens Account from the foot's menu beside the team it came from, and revokes a Mac there", {
		timeout: 60_000,
	}, async () => {
		const { page, asked } = await open("/devosurf/people");
		await page.getByText("sam@devosurf.com").waitFor();
		await page.getByRole("button", { name: "Signed in as vic@devosurf.com" }).click();
		await page.getByRole("menuitem", { name: "Account" }).click();
		await page.getByRole("heading", { name: "Account" }).waitFor();
		expect(new URL(page.url()).pathname).toBe("/account");
		expect(await page.title()).toBe("Account · spool");
		// the team stays in the sidebar, with none of its pages current
		expect(await page.locator("aside").textContent()).toContain("Devosurf");
		expect(await page.locator("nav[aria-label='Home sections'] [aria-current=page]").count()).toBe(0);
		const main = page.locator("main");
		await main.getByText("In Devosurf and Client Co.").waitFor();
		expect(await main.textContent()).toContain("used today");
		await shoot(page, "account.png");
		await page.getByRole("button", { name: "Revoke Studio" }).click();
		await expect.poll(() => asked).toContain("POST /account/devices/d2/revoke");
		await expect.poll(async () => (await main.textContent())?.includes("Studio")).toBe(false);
		await page.getByRole("button", { name: "People" }).click();
		await expect.poll(() => new URL(page.url()).pathname).toBe("/devosurf/people");
		await page.goBack();
		await page.getByRole("heading", { name: "Account" }).waitFor();
	});

	it("names the account on its page, everywhere at once, and says the rule when spool.page refuses a name", {
		timeout: 60_000,
	}, async () => {
		const { page, asked } = await open("/devosurf", { teams: [] });
		const main = page.locator("main");
		await main.getByText("Not in a team yet.", { exact: true }).waitFor();
		// no name yet: everyone sees the address before the @, which the field offers as its placeholder
		const field = main.getByRole("textbox", { name: "Name" });
		expect(await field.inputValue()).toBe("");
		expect(await field.getAttribute("placeholder")).toBe("vic");
		const save = main.getByRole("button", { name: "Save" });
		expect(await save.isDisabled()).toBe(true);

		await field.fill("Vic Berg");
		await save.click();
		await expect.poll(() => asked).toContain('POST /account/name {"name":"Vic Berg"}');
		await main.getByText("Vic Berg", { exact: true }).waitFor();
		expect(await field.inputValue()).toBe("Vic Berg");
		expect(await save.isDisabled()).toBe(true);

		await field.fill("x".repeat(65));
		await save.click();
		await main.getByRole("alert").getByText("A name is 1 to 64 characters, with no hidden ones.").waitFor();
		expect(await field.inputValue()).toBe("x".repeat(65));
		await main.getByText("Vic Berg", { exact: true }).waitFor();
	});

	it("turns comment emails off and on again on the account page", { timeout: 60_000 }, async () => {
		const { page, asked } = await open("/account");
		const emails = page.locator("main").getByRole("radiogroup", { name: "Comment emails" });
		await emails.waitFor();
		expect(await emails.getByRole("radio", { name: "For you" }).isChecked()).toBe(true);
		await emails.getByText("Off", { exact: true }).click();
		await expect.poll(() => asked).toContain('POST /account/comment-emails {"emails":"off"}');
		await expect.poll(() => emails.getByRole("radio", { name: "Off" }).isChecked()).toBe(true);
		await emails.getByText("For you", { exact: true }).click();
		await expect.poll(() => asked).toContain('POST /account/comment-emails {"emails":"for-you"}');
		await expect.poll(() => emails.getByRole("radio", { name: "For you" }).isChecked()).toBe(true);
	});

	it("takes an account in no team to Account, with the way to start one", { timeout: 60_000 }, async () => {
		const { page } = await open("/devosurf", { teams: [] });
		await page.locator("main").getByText("Not in a team yet.", { exact: true }).waitFor();
		expect(new URL(page.url()).pathname).toBe("/account");
		expect(await page.locator("aside").textContent()).toContain("You’re not in a team yet.");
		await page.getByRole("button", { name: "Start a team…" }).waitFor();
	});

	it("changes a member's role at spool.page", { timeout: 60_000 }, async () => {
		const { page, asked } = await open("/devosurf/people");
		await page.getByRole("button", { name: "Role of sam@devosurf.com" }).click();
		await page.getByRole("menuitemcheckbox", { name: "Admin" }).click();
		await expect.poll(() => asked).toContain('PATCH /api/teams/devosurf/members/a2 {"role":"admin"}');
	});

	it("opens Settings on Billing at /<team>/settings/billing, and goes to Checkout in the same tab", {
		timeout: 60_000,
	}, async () => {
		const { page, asked, left } = await open("/devosurf/settings/billing");
		await page.getByText("On trial until October 25.").waitFor();
		expect(await page.getByRole("tab", { name: "Billing" }).getAttribute("aria-selected")).toBe("true");
		expect(await page.getByRole("tab", { name: "General" }).getAttribute("aria-selected")).toBe("false");
		await page.getByText("sam@devosurf.com").waitFor();
		expect(await page.locator("[data-billing-total]").textContent()).toBe("$384 a year");
		await shoot(page, "billing.png");
		await page.getByRole("button", { name: "Continue to payment" }).click();
		await expect.poll(() => left).toEqual(["https://checkout.stripe.test/c/1"]);
		expect(asked).toContain('POST /api/teams/devosurf/billing/checkout {"editors":["a2"],"cycle":"yearly"}');
	});

	it("moves between Settings' tabs at their own addresses", { timeout: 60_000 }, async () => {
		const { page } = await open("/devosurf/settings");
		await page.getByText("Delete team").waitFor();
		await page.getByRole("tab", { name: "Billing" }).click();
		await page.getByText("On trial until October 25.").waitFor();
		expect(new URL(page.url()).pathname).toBe("/devosurf/settings/billing");
		await page.goBack();
		await page.getByText("Delete team").waitFor();
		expect(new URL(page.url()).pathname).toBe("/devosurf/settings");
	});

	it("shows a new team's setup list, starting its payment choice on the cycle spool.page/start passed on", {
		timeout: 60_000,
	}, async () => {
		const { page, asked, left } = await open("/devosurf?cycle=monthly", {
			setup: {
				done: false,
				steps: { named: { address: "devosurf" }, pay: { paid: false }, invited: null, mac: null, moved: null },
			},
			billing: { ...BILLING, state: "lapsed", trialEndsAt: null, hadTime: false },
		});
		await page.getByRole("heading", { name: "Set up Devosurf" }).waitFor();
		expect(await page.locator("[data-step=named]").textContent()).toContain("cloud.test/devosurf");
		const pay = page.locator("[data-step=pay]");
		expect(await pay.getAttribute("data-state")).toBe("current");
		await pay.getByText("This account has had its trial, so Devosurf starts paid.").waitFor();
		await pay.getByText("sam@devosurf.com").waitFor();
		expect(await pay.getByRole("radio", { name: "monthly · $20" }).isChecked()).toBe(true);
		await shoot(page, "setup-list.png");
		await pay.getByRole("button", { name: "Continue to payment" }).click();
		await expect.poll(() => left).toEqual(["https://checkout.stripe.test/c/1"]);
		expect(asked).toContain('POST /api/teams/devosurf/billing/checkout {"editors":["a2"],"cycle":"monthly"}');
	});

	it("says the team is set up once its last step is done, and the list is gone", { timeout: 60_000 }, async () => {
		const { page, asked } = await open("/devosurf", {
			setup: {
				done: false,
				steps: {
					named: { address: "devosurf" },
					pay: null,
					invited: { editors: 1, viewers: 0 },
					mac: { email: "vic@devosurf.com" },
					moved: { project: "checkout" },
				},
			},
		});
		await page.getByRole("status").getByText("Devosurf is set up").waitFor();
		expect(asked.filter((line) => line === "POST /api/teams/devosurf/setup/done")).toHaveLength(1);
		expect(await page.locator(".pj-team-setup").count()).toBe(0);
		await page.getByRole("button", { name: "Invite more" }).click();
		await expect.poll(() => new URL(page.url()).pathname).toBe("/devosurf/people");
	});

	it("asks a lapsed team's admins to pay in one dialog, and tells everyone else in one line", {
		timeout: 60_000,
	}, async () => {
		const lapsed = TEAMS.map((team) => ({ ...team, billing: { state: "lapsed" as const } }));
		const { page, asked, left } = await open("/devosurf", {
			teams: lapsed,
			billing: { ...BILLING, state: "lapsed", paidBefore: true },
		});
		const dialog = page.getByRole("dialog", { name: "Devosurf has gone local" });
		await dialog.waitFor();
		expect(await dialog.textContent()).toContain("Anyone left out becomes a viewer.");
		await dialog.getByRole("button", { name: "Continue to payment" }).click();
		// Checkout leaves in this tab, as Billing's does
		await expect.poll(() => left).toEqual(["https://checkout.stripe.test/c/1"]);
		expect(asked).toContain('POST /api/teams/devosurf/billing/checkout {"editors":["a2"],"cycle":"yearly"}');

		// a viewer of a lapsed team reaches its Home, and is told why nothing moves
		const viewer = await open("/client", { teams: lapsed });
		await viewer.page.getByText("Client Co has gone local. Ask an admin to pay for it to sync again.").waitFor();
		expect(await viewer.page.getByRole("dialog").count()).toBe(0);
		expect(viewer.asked.filter((line) => line.includes("/billing"))).toEqual([]);
	});
	it("tells a failing team's admins on Home, and Manage billing opens Stripe's portal in the same tab", {
		timeout: 60_000,
	}, async () => {
		const failing = TEAMS.map((team) => ({ ...team, billing: { state: "failing" as const } }));
		const { page, asked, left } = await open("/devosurf", {
			teams: failing,
			billing: {
				...BILLING,
				state: "failing",
				plan: { seats: 2, cycle: "monthly", amount: 4000 },
				failingSince: Date.UTC(2026, 5, 17, 12) / 1000,
				lapsesAt: Date.UTC(2026, 6, 1, 12) / 1000,
			},
		});
		const line = page.locator(".pj-billing-failing");
		await line
			.getByText("Devosurf’s last payment failed. Update the card before July 1 to keep it syncing.")
			.waitFor();
		// the team keeps working: its covers are still there beneath
		await page.getByRole("link", { name: "Open checkout" }).waitFor();
		await shoot(page, "billing-failing.png");
		await line.getByRole("button", { name: "Manage billing" }).click();
		await expect.poll(() => left).toEqual(["https://billing.stripe.test/p/1"]);
		expect(asked).toContain("POST /api/teams/devosurf/billing/portal");

		// a viewer of the same team hears nothing of it, and never reads billing
		const viewer = await open("/client", { teams: failing });
		await viewer.page.getByText("Client Co has no projects yet").waitFor();
		expect(await viewer.page.locator(".pj-billing-failing").count()).toBe(0);
		expect(viewer.asked.filter((line) => line.includes("/billing"))).toEqual([]);
	});
});
