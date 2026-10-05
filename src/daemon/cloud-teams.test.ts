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
