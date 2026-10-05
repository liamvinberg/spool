import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CloudRequestOptions } from "../cloud-auth";
import { initTeamProject } from "../init";
import type { ShareView } from "../share-view";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import {
	agentReader,
	makeApp,
	makeProject,
	makeTempDir,
	until,
	writeDesignFile,
	writePageFrame,
} from "../test-helpers";
import type { AgentEngine } from "./agent-engine";
import type { AgentEvent } from "./agent-events";
import { realDesignDir } from "./design-path";
import { createProjectShares, sharedFiles } from "./shares";

/**
 * Sharing pages from the Mac: a team project's shares are spool.page's, changed through this Mac's session; a solo
 * project's daemon starts it at spool.page and uploads only what its shared pages are made of. Every assertion is
 * on what reached the (fake) spool.page or what the canvas reads.
 */

const ORIGIN = "https://cloud.test";
const THREAD = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";

/** spool.page as a solo project meets it: its own project, its shares, and the files it is handed by hash. */
function fakeCloud() {
	const token = "sam-token".padEnd(43, "x");
	let signedIn = true;
	const blobs = new Map<string, Buffer>();
	const sent: string[] = [];
	const sources: Record<string, string>[] = [];
	const covers = new Map<string, string>();
	const projects: { id: string; name: string }[] = [];
	const shares: ShareView[] = [];
	const fetch: typeof globalThis.fetch = async (input, init) => {
		const request = new Request(input, init);
		if (!signedIn || request.headers.get("authorization") !== `Bearer ${token}`)
			return Response.json({ error: "account_session_required" }, { status: 401 });
		const path = new URL(request.url).pathname;
		if (path === "/auth/account/session")
			return Response.json({ accountId: "sam", email: "sam@example.test", sessionId: "s", expiresAt: 4e9 });
		if (path === "/api/solo/projects" && request.method === "POST") {
			const { name } = (await request.json()) as { name: string };
			const project = { id: "a".repeat(32), name };
			projects.push(project);
			return Response.json(project, { status: 201 });
		}
		const solo = /^\/api\/solo\/projects\/([^/]+)\/(.+)$/u.exec(path);
		if (solo === null || !projects.some((project) => project.id === solo[1]))
			return Response.json({ error: "project_not_found" }, { status: 404 });
		const rest = solo[2] ?? "";
		if (rest === "shares" && request.method === "GET") return Response.json({ shares });
		if (rest === "shares" && request.method === "POST") {
			const body = (await request.json()) as { kind: "people" | "link"; pages: string[]; people?: string[] };
			const share: ShareView = {
				id: `share-${shares.length + 1}`,
				kind: body.kind,
				pages: body.pages,
				people: body.people ?? [],
				by: "sam@example.test",
				at: 1,
				opens: 0,
				link: `https://s${String(shares.length + 1).repeat(32)}.onspool.test/`,
			};
			shares.push(share);
			return Response.json(share, { status: 201 });
		}
		const stop = /^shares\/([^/]+)$/u.exec(rest);
		if (stop !== null && request.method === "DELETE") {
			shares.splice(
				shares.findIndex((share) => share.id === stop[1]),
				1,
			);
			return new Response(null, { status: 204 });
		}
		if (rest === "source/lacking") {
			const { hashes } = (await request.json()) as { hashes: string[] };
			return Response.json({ missing: hashes.filter((hash) => !blobs.has(hash)) });
		}
		const blob = /^blobs\/([0-9a-f]{64})$/u.exec(rest);
		if (blob !== null) {
			const bytes = Buffer.from(await request.arrayBuffer());
			if (sha256(bytes) !== blob[1]) return Response.json({ error: "hash_mismatch" }, { status: 400 });
			blobs.set(blob[1] ?? "", bytes);
			sent.push(blob[1] ?? "");
			return new Response(null, { status: 204 });
		}
		if (rest === "source") {
			const { files } = (await request.json()) as { files: Record<string, string> };
			const missing = Object.values(files).filter((hash) => !blobs.has(hash));
			if (missing.length > 0) return Response.json({ error: "blobs_missing", missing }, { status: 409 });
			sources.push(files);
			return Response.json({ head: sources.length });
		}
		const cover = /^covers\/([0-9a-f]{64})$/u.exec(rest);
		if (cover !== null && request.method === "HEAD")
			return new Response(null, { status: covers.has(cover[1] ?? "") ? 200 : 404 });
		if (cover !== null && request.method === "PUT") {
			covers.set(cover[1] ?? "", new URL(request.url).searchParams.get("frame") ?? "");
			return new Response(null, { status: 201 });
		}
		return Response.json({ error: "not_found" }, { status: 404 });
	};
	const request: CloudRequestOptions = { origin: ORIGIN, vault: { read: async () => token }, fetch };
	return {
		request,
		blobs,
		sent,
		sources,
		covers,
		shares,
		/** The files the cloud's copy is now, by path, as text. */
		copy: () =>
			Object.fromEntries(
				Object.entries(sources.at(-1) ?? {}).map(([path, hash]) => [path, blobs.get(hash)?.toString("utf8")]),
			),
		signOut: () => {
			signedIn = false;
		},
	};
}

/** An agent whose turn does one thing to the project and ends. */
function endingEngine(work: () => void): AgentEngine {
	return {
		id: "spool",
		authentication: { kind: "external", command: "fixture login" },
		installed: () => true,
		account: async () => ({ signedIn: true, account: "agent@example.test" }),
		offer: async () => ({
			models: [{ value: "spool", resolvedModel: "spool", displayName: "spool", description: "fixture" }],
			current: { value: "spool", resolved: "spool", name: "spool", effort: null, pin: null },
		}),
		choice: () => ({ value: "spool" }),
		continuable: async () => true,
		start: () => ({
			events: (async function* (): AsyncGenerator<AgentEvent> {
				work();
				yield { kind: "say", block: 0, text: "done", parent: null };
				yield { kind: "closed", code: 0, parent: null };
			})(),
			answer: () => false,
			interrupt: () => true,
			abandon: () => {},
		}),
	};
}

async function turn(daemon: ReturnType<typeof makeApp>, project: string): Promise<void> {
	const response = await daemon.request(`/api/p/${project}/agent/turn`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ thread: THREAD, turn: "one", engine: "spool", said: [{ prompt: "go" }] }),
	});
	expect(response.status).toBe(200);
	const reader = agentReader(response);
	await reader.next();
	await reader.cancel();
}

const frame = (text: string, imports = "") =>
	`${imports}export default function Frame() {\n\treturn <main>${text}</main>;\n}\n`;
const PRICED = `import { Price } from "../../../shared/ui/price";\n`;

describe("a solo project's share", () => {
	it("uploads only what its shared pages are made of, and the bytes spool.page lacks", async () => {
		const cloud = fakeCloud();
		const spoolDir = makeTempDir();
		const { root, name } = makeProject(spoolDir);
		writePageFrame(root, "checkout", "pay", frame("<Price /> to pay", PRICED));
		writePageFrame(root, "menu", "list", frame("Tonight's menu"));
		writeDesignFile(root, "shared/ui/price.tsx", "export function Price() {\n\treturn <b>640 kr</b>;\n}\n");
		writeDesignFile(root, "shared/ui/secret.tsx", "export const plan = 'not for clients';\n");
		writeDesignFile(root, "shared/scenarios/default.json", '{ "state": { "guests": 2 } }\n');
		let done = false;
		const daemon = makeApp(spoolDir, {
			cloudTeamsRequest: cloud.request,
			agentEngines: [
				endingEngine(() => {
					writePageFrame(root, "checkout", "pay", frame("<Price /> to pay now", PRICED));
					done = true;
				}),
			],
		});
		const base = `/api/p/${name}/shares`;
		expect(await (await daemon.request(base)).json()).toEqual({ state: "ready", shares: [], manage: true });

		const made = await daemon.request(base, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ kind: "link", pages: ["checkout"] }),
		});
		expect(made.status, await made.clone().text()).toBe(200);
		expect(((await made.json()) as ShareView).link).toMatch(/onspool/u);
		const copy = cloud.copy();
		expect(Object.keys(copy).sort()).toEqual([
			"canvas.json",
			"frames/checkout/pay/frame.tsx",
			"shared/fonts.css",
			"shared/importmap.json",
			"shared/scenarios/default.json",
			"shared/tokens.css",
			"shared/ui/price.tsx",
		]);
		expect(JSON.stringify(copy)).not.toContain("Tonight");
		expect(JSON.stringify(copy)).not.toContain("not for clients");
		const state = JSON.parse(readFileSync(join(root, "design/.spool/share.json"), "utf8")) as { origin: string };
		expect(state.origin).toBe(ORIGIN);
		const listed = (await (await daemon.request(base)).json()) as { shares: ShareView[] };
		expect(listed.shares).toHaveLength(1);

		// its agent's turn ends: the page goes up again, only the bytes that changed
		const before = cloud.sent.length;
		await turn(daemon, name);
		await until(() => done && cloud.sources.length === 2, 15_000);
		expect(cloud.copy()["frames/checkout/pay/frame.tsx"]).toContain("to pay now");
		expect(cloud.sent.length - before).toBe(1);

		// stopped: what only it showed leaves spool.page
		const id = listed.shares[0]?.id ?? "";
		expect((await daemon.request(`${base}/${id}`, { method: "DELETE" })).status).toBe(200);
		await until(() => cloud.sources.length === 3, 15_000);
		expect(cloud.copy()).toEqual({});
	});

	it("offers nothing to share while nobody is signed in to spool.page", async () => {
		const cloud = fakeCloud();
		cloud.signOut();
		const spoolDir = makeTempDir();
		const { root, name } = makeProject(spoolDir);
		const daemon = makeApp(spoolDir, { cloudTeamsRequest: cloud.request });
		expect(await (await daemon.request(`/api/p/${name}/shares`)).json()).toEqual({ state: "signed-out" });
		const refused = await daemon.request(`/api/p/${name}/shares`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ kind: "link", pages: ["checkout"] }),
		});
		expect(refused.status).toBe(401);
		expect(existsSync(join(root, "design/.spool/share.json"))).toBe(false);
	});
});

describe("a solo project's covers", () => {
	it("go up for the frames it shares, under the version each is of, and never for the rest", async () => {
		const cloud = fakeCloud();
		const spoolDir = makeTempDir();
		const { root, name } = makeProject(spoolDir);
		writePageFrame(root, "checkout", "pay", frame("Pay 640 kr"));
		writePageFrame(root, "menu", "list", frame("Tonight's menu"));
		const shares = createProjectShares({
			spoolDir,
			request: cloud.request,
			version: "0.0.0-test",
			resolve: () => ({ root }),
			watch: () => () => {},
		});
		const made = await shares.routes.request(`/${name}/shares`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ kind: "link", pages: ["checkout"] }),
		});
		expect(made.status).toBe(200);
		const { sources } = await sharedFiles(root, realDesignDir(root), ["checkout"], "0.0.0-test");
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
		shares.covered(root, "checkout/pay", sources.get("checkout/pay") ?? "", png);
		shares.covered(root, "menu/list", "b".repeat(64), png);
		await shares.settled();
		expect([...cloud.covers]).toEqual([[sources.get("checkout/pay"), "checkout/pay"]]);
		shares.close();
	});
});

describe("a team project's agent finishing its turn", () => {
	it("is said to the team after the turn's saves, so the pages they touched settle", async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const state = join(makeTempDir(), ".spool");
		const folder = join(makeTempDir(), "booking");
		mkdirSync(folder);
		execFileSync("git", ["init", "--quiet", folder]);
		const { root } = await initTeamProject(folder, state, {
			team: "devosurf",
			origin: TEAM_ORIGIN,
			request: ana.request,
			openSocket: ana.openSocket,
		});
		const project = "booking";
		const daemon = makeApp(state, {
			teamSyncServices: ana.services,
			cloudTeamsRequest: ana.request,
			agentEngines: [endingEngine(() => writePageFrame(root, "checkout", "pay", frame("Pay 640 kr")))],
		});
		await until(() => cloud.paths(project).includes("canvas.json"));
		await turn(daemon, project);
		await until(() => cloud.turns(project).length === 1, 15_000);
		// the turn's own save reached the team before its end did
		expect(cloud.file(project, "frames/checkout/pay/frame.tsx")).toContain("Pay 640 kr");
		const [said] = cloud.turns(project);
		expect(said?.by).toBe("ana");
		expect(
			cloud
				.saves(project)
				.slice(0, said?.saves)
				.map((save) => save.path),
		).toContain("frames/checkout/pay/frame.tsx");
	});
});

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}
