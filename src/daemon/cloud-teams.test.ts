import { expect, it, onTestFinished } from "vitest";
import { makeTempDir } from "../test-helpers";
import { createDaemonApp } from "./app";

const TOKEN = "t".repeat(43);

/** A fake spool.page: answers the team API, and remembers what it was asked. */
function harness(options: { token?: string; answer?: (request: Request) => Response | Promise<Response> } = {}) {
	const asked: { method: string; path: string; body: string; authorization: string | null }[] = [];
	let token = options.token;
	const daemon = createDaemonApp({
		spoolDir: makeTempDir(),
		version: "test",
		controlHost: "localhost",
		controlToken: "control-secret",
		cloud: {
			origin: "https://cloud.test",
			vault: {
				read: async () => token,
				write: async (value) => {
					token = value;
				},
				delete: async () => {
					token = undefined;
				},
			},
			fetch: async (input, init) => {
				const request = new Request(input, init);
				asked.push({
					method: request.method,
					path: new URL(request.url).pathname,
					body: Buffer.from(await request.clone().arrayBuffer()).toString("latin1"),
					authorization: request.headers.get("authorization"),
				});
				return options.answer ? options.answer(request) : Response.json({});
			},
		},
	});
	onTestFinished(() => daemon.close());
	const api = async (path: string, method = "GET", json?: unknown) => {
		const response = await daemon.app.request(`http://localhost/api/cloud${path}`, {
			method,
			headers: {
				"x-spool-control": "control-secret",
				origin: "http://localhost",
				...(json === undefined ? {} : { "content-type": "application/json" }),
			},
			...(json === undefined ? {} : { body: JSON.stringify(json) }),
		});
		return { status: response.status, body: await response.json() };
	};
	return { api, asked, daemon };
}

const TEAMS = {
	teams: [{ id: "t1", address: "tidemark", name: "Tidemark", role: "admin", logo: null, people: 4 }],
	invites: [],
	mayCreateTeam: true,
};

it("lists this Mac's teams from spool.page with its device session, or says it is signed out", async () => {
	expect(await harness().api("/teams")).toEqual({ status: 200, body: { state: "signed-out" } });
	const { api, asked } = harness({ token: TOKEN, answer: () => Response.json(TEAMS) });
	expect(await api("/teams")).toEqual({
		status: 200,
		body: { state: "ready", ...TEAMS, origin: "https://cloud.test" },
	});
	expect(asked).toEqual([{ method: "GET", path: "/api/teams", body: "", authorization: `Bearer ${TOKEN}` }]);
	const offline = harness({
		token: TOKEN,
		answer: () => {
			throw new TypeError("fetch failed");
		},
	});
	expect(await offline.api("/teams")).toEqual({ status: 200, body: { state: "unreachable" } });
});

it("carries each team action to spool.page and brings back its refusal as spool.page said it", async () => {
	const { api, asked } = harness({
		token: TOKEN,
		answer: (request) =>
			request.method === "DELETE" && new URL(request.url).pathname.endsWith("/members/me")
				? Response.json({ error: "last_admin" }, { status: 409 })
				: new Response(null, { status: 204 }),
	});
	expect(await api("/teams/tidemark/members/me", "DELETE")).toEqual({ status: 409, body: { error: "last_admin" } });
	expect(await api("/teams/tidemark/members/sam", "PATCH", { role: "viewer" })).toEqual({ status: 200, body: {} });
	expect(await api("/teams/tidemark/members/sam", "PATCH", { role: "owner" })).toEqual({
		status: 400,
		body: { error: "invalid_role" },
	});
	await api("/teams/tidemark/invites", "POST", { email: "noor@tidemark.app", role: "editor" });
	await api("/teams/tidemark", "PATCH", { name: "Tide", address: "tide" });
	await api("/teams/tidemark/logo", "PUT", { data: Buffer.from([0x89, 0x50]).toString("base64") });
	await api("/invites/i1/accept", "POST");
	await api("/teams", "POST", { name: "Devosurf" });
	expect(asked.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
		{ method: "DELETE", path: "/api/teams/tidemark/members/me", body: "" },
		{ method: "PATCH", path: "/api/teams/tidemark/members/sam", body: '{"role":"viewer"}' },
		{
			method: "POST",
			path: "/api/teams/tidemark/invites",
			body: '{"email":"noor@tidemark.app","role":"editor"}',
		},
		{ method: "PATCH", path: "/api/teams/tidemark", body: '{"name":"Tide","address":"tide"}' },
		{ method: "PUT", path: "/api/teams/tidemark/logo", body: "\u0089P" },
		{ method: "POST", path: "/api/invites/i1/accept", body: "" },
		{ method: "POST", path: "/api/teams", body: '{"name":"Devosurf"}' },
	]);
});

it("keeps the teams behind the control token", async () => {
	const { daemon } = harness({ token: TOKEN });
	expect((await daemon.app.request("http://localhost/api/cloud/teams")).status).toBe(401);
});

it("carries billing to spool.page: the summary, Checkout and the portal, each answering with its address", async () => {
	const { api, asked } = harness({
		token: TOKEN,
		answer: (request) => {
			const path = new URL(request.url).pathname;
			if (path.endsWith("/billing")) return Response.json({ state: "trial", trialEndsAt: 1_761_393_600 });
			if (path.endsWith("/checkout")) return Response.json({ url: "https://checkout.stripe.test/c/1" });
			return Response.json({ error: "no_subscription" }, { status: 409 });
		},
	});
	expect(await api("/teams/tidemark/billing")).toEqual({
		status: 200,
		body: { state: "trial", trialEndsAt: 1_761_393_600 },
	});
	expect(await api("/teams/tidemark/billing/checkout", "POST", { editors: ["sam"], cycle: "yearly" })).toEqual({
		status: 200,
		body: { url: "https://checkout.stripe.test/c/1" },
	});
	expect(await api("/teams/tidemark/billing/checkout", "POST", { editors: "sam", cycle: "weekly" })).toEqual({
		status: 400,
		body: { error: "invalid_billing" },
	});
	expect(await api("/teams/tidemark/billing/portal", "POST")).toEqual({
		status: 409,
		body: { error: "no_subscription" },
	});
	expect(asked.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
		{ method: "GET", path: "/api/teams/tidemark/billing", body: "" },
		{ method: "POST", path: "/api/teams/tidemark/billing/checkout", body: '{"editors":["sam"],"cycle":"yearly"}' },
		{ method: "POST", path: "/api/teams/tidemark/billing/portal", body: "" },
	]);
});

it("carries People's seat facts to an admin and the trial's editor cap back from an invite, as spool.page said them", async () => {
	const people = {
		members: [{ accountId: "ada", email: "ada@tidemark.app", role: "admin", you: true }],
		invites: [],
		seats: 1,
		billing: {
			state: "trial",
			cycle: null,
			seatPrice: null,
			charged: null,
			trialEditorCap: 10,
			trialEditors: 10,
		},
	};
	const { api } = harness({
		token: TOKEN,
		answer: (request) =>
			request.method === "GET"
				? Response.json(people)
				: Response.json({ error: "trial_editor_cap" }, { status: 409 }),
	});
	expect(await api("/teams/tidemark/people")).toEqual({ status: 200, body: people });
	expect(await api("/teams/tidemark/invites", "POST", { email: "noor@tidemark.app", role: "editor" })).toEqual({
		status: 409,
		body: { error: "trial_editor_cap" },
	});
});

it("carries the setup list to spool.page: its facts, Skip and done, each answering with the list", async () => {
	const setup = {
		done: false,
		steps: { named: { address: "tidemark" }, pay: null, invited: "skipped", mac: null, moved: null },
	};
	const { api, asked } = harness({
		token: TOKEN,
		answer: (request) =>
			new URL(request.url).pathname.endsWith("/done")
				? Response.json({ error: "admin_required" }, { status: 403 })
				: Response.json(setup),
	});
	expect(await api("/teams/tidemark/setup")).toEqual({ status: 200, body: setup });
	expect(await api("/teams/tidemark/setup/skip-invites", "POST")).toEqual({ status: 200, body: setup });
	expect(await api("/teams/tidemark/setup/skip-projects", "POST")).toEqual({ status: 200, body: setup });
	expect(await api("/teams/tidemark/setup/done", "POST")).toEqual({ status: 403, body: { error: "admin_required" } });
	expect(asked.map(({ method, path }) => `${method} ${path}`)).toEqual([
		"GET /api/teams/tidemark/setup",
		"POST /api/teams/tidemark/setup/skip-invites",
		"POST /api/teams/tidemark/setup/skip-projects",
		"POST /api/teams/tidemark/setup/done",
	]);
});
