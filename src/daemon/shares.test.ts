import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
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
	writeFrame,
	writePageFrame,
} from "../test-helpers";
import type { AgentEngine } from "./agent-engine";
import type { AgentEvent } from "./agent-events";
import { realDesignDir } from "./design-path";
import { createProjectShares, SOLO_QUIET_MS, sharedFiles } from "./shares";

/**
 * Sharing pages from the Mac: a team project's shares are spool.page's, changed through this Mac's session; a solo
 * project's daemon starts it at spool.page and uploads only what its shared pages are made of. Every assertion is
 * on what reached the (fake) spool.page or what the canvas reads.
 */

const ORIGIN = "https://cloud.test";
const THREAD = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";

/** spool.page as a solo project meets it: its own project, its shares, and the files it is handed by hash. */
function fakeCloud(limit = Number.POSITIVE_INFINITY) {
	const token = "sam-token".padEnd(43, "x");
	let signedIn = true;
	const blobs = new Map<string, Buffer>();
	const sent: string[] = [];
	const sources: Record<string, string>[] = [];
	const covers = new Map<string, string>();
	const projects: { id: string; name: string }[] = [];
	const shares: ShareView[] = [];
	const asked: unknown[] = [];
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
			const body = (await request.json()) as {
				kind: "people" | "link";
				pages?: string[];
				whole?: true;
				people?: string[];
				ends?: string;
			};
			asked.push(body);
			const share: ShareView = {
				id: `share-${shares.length + 1}`,
				kind: body.kind,
				pages: body.pages ?? [],
				...(body.whole ? { whole: true as const } : {}),
				people: body.people ?? [],
				by: "sam@example.test",
				at: 1,
				opens: 0,
				link: `https://s${String(shares.length + 1).repeat(32)}.onspool.test/`,
				...(body.ends === "7d" ? { endsAt: 1 + 7 * 86_400 } : {}),
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
			// a solo project holds no more than a team project may (fair use)
			const size = [...new Set(Object.values(files))].reduce((sum, hash) => sum + (blobs.get(hash)?.length ?? 0), 0);
			if (size > limit) return Response.json({ error: "too_large" }, { status: 413 });
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
		/** What each new share asked spool.page for. */
		asked,
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
		id: "pi",
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
		body: JSON.stringify({ thread: THREAD, turn: "one", engine: "pi", said: [{ prompt: "go" }] }),
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
	it("asks spool.page for when it ends and says when it does, as spool.page answers (spool#183)", async () => {
		const cloud = fakeCloud();
		const spoolDir = makeTempDir();
		const { root, name } = makeProject(spoolDir);
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
			body: JSON.stringify({ kind: "link", pages: ["menu"], ends: "7d" }),
		});
		expect(cloud.asked).toEqual([{ kind: "link", pages: ["menu"], ends: "7d" }]);
		expect(await made.json()).toMatchObject({ endsAt: 604_801 });
		const listed = await shares.routes.request(`/${name}/shares`);
		expect(await listed.json()).toMatchObject({ shares: [{ endsAt: 604_801 }] });
		shares.close();
	});

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
			cloud: cloud.request,
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

	it("shares the root page's own frames as a page, and none of the pages under it", async () => {
		const { root } = makeProject(makeTempDir());
		writeFrame(root, "home", frame("Welcome in"));
		writePageFrame(root, "checkout", "pay", frame("Pay 640 kr"));
		const { files, frames } = await sharedFiles(root, realDesignDir(root), [""], "0.0.0-test");
		expect(frames).toEqual(["home"]);
		expect([...files.keys()]).toContain("frames/home/frame.tsx");
		expect([...files.keys()].some((path) => path.startsWith("frames/checkout/"))).toBe(false);
	});

	it("shares a page whose navigation the flow map can't read or that leads nowhere", async () => {
		const cloud = fakeCloud();
		const spoolDir = makeTempDir();
		const { root, name } = makeProject(spoolDir);
		writePageFrame(
			root,
			"checkout",
			"pay",
			[
				'import { ui } from "spool";',
				"export default function Frame() {",
				"\treturn (",
				"\t\t<main>",
				"\t\t\t<a data-go={String(ui.state.next)}>next</a>",
				'\t\t\t<a data-go="checkout/nowhere">gone</a>',
				"\t\t</main>",
				"\t);",
				"}",
				"",
			].join("\n"),
		);
		const daemon = makeApp(spoolDir, { cloud: cloud.request });
		const flows = (await (await daemon.request(`/api/p/${name}/flows`)).json()) as {
			edges: { to: string; missing?: true }[];
			unreadable: unknown[];
		};
		expect(flows.unreadable).toHaveLength(1);
		expect(flows.edges.some((edge) => edge.to === "checkout/nowhere" && edge.missing === true)).toBe(true);

		const made = await daemon.request(`/api/p/${name}/shares`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ kind: "link", pages: ["checkout"] }),
		});
		expect(made.status, await made.clone().text()).toBe(200);
		expect(cloud.shares.map((share) => share.pages)).toEqual([["checkout"]]);
		expect(cloud.copy()["frames/checkout/pay/frame.tsx"]).toContain("checkout/nowhere");
	});

	it("offers nothing to share while nobody is signed in to spool.page", async () => {
		const cloud = fakeCloud();
		cloud.signOut();
		const spoolDir = makeTempDir();
		const { root, name } = makeProject(spoolDir);
		const daemon = makeApp(spoolDir, { cloud: cloud.request });
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

describe("a solo project's whole-project share (spool#185)", () => {
	const share = (shares: ReturnType<typeof createProjectShares>, name: string, body: object) =>
		shares.routes.request(`/${name}/shares`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});

	it("uploads what every page is made of and their covers, and nothing outside design/'s travelling layout", async () => {
		const cloud = fakeCloud();
		const spoolDir = makeTempDir();
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "home", frame("Welcome in"));
		writePageFrame(root, "checkout", "pay", frame("<Price /> to pay", PRICED));
		writePageFrame(root, "menu", "list", frame("<Draft />", `import { Draft } from "../../../drafts/draft";\n`));
		writeDesignFile(root, "shared/ui/price.tsx", "export function Price() {\n\treturn <b>640 kr</b>;\n}\n");
		writeDesignFile(root, "drafts/draft.tsx", "export function Draft() {\n\treturn <i>not travelling</i>;\n}\n");
		const shares = createProjectShares({
			spoolDir,
			request: cloud.request,
			version: "0.0.0-test",
			resolve: () => ({ root }),
			watch: () => () => {},
		});
		const made = await share(shares, name, { kind: "link", whole: true });
		expect(made.status, await made.clone().text()).toBe(200);
		expect(cloud.shares.map((each) => each.whole)).toEqual([true]);
		expect(Object.keys(cloud.copy()).sort()).toEqual([
			"canvas.json",
			"frames/checkout/pay/frame.tsx",
			"frames/home/frame.tsx",
			"frames/menu/list/frame.tsx",
			"shared/fonts.css",
			"shared/importmap.json",
			"shared/scenarios/default.json",
			"shared/tokens.css",
			"shared/ui/price.tsx",
		]);
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
		const { sources } = await sharedFiles(root, realDesignDir(root), ["", "checkout", "menu"], "0.0.0-test");
		for (const frame of ["home", "checkout/pay", "menu/list"])
			shares.covered(root, frame, sources.get(frame) ?? "", png);
		await shares.settled();
		expect([...cloud.covers.values()].sort()).toEqual(["checkout/pay", "home", "menu/list"]);
		shares.close();
	});

	it("takes a page added later up after a quiet spell", async () => {
		const cloud = fakeCloud();
		const spoolDir = makeTempDir();
		const { root, name } = makeProject(spoolDir);
		writePageFrame(root, "checkout", "pay", frame("Pay 640 kr"));
		let saved = () => {};
		const shares = createProjectShares({
			spoolDir,
			request: cloud.request,
			version: "0.0.0-test",
			resolve: () => ({ root }),
			watch: (_root, onSave) => {
				saved = onSave;
				return () => {};
			},
		});
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			expect((await share(shares, name, { kind: "link", whole: true })).status).toBe(200);
			writePageFrame(root, "menu", "list", frame("Tonight's menu"));
			saved();
			vi.advanceTimersByTime(SOLO_QUIET_MS);
			await shares.settled();
		} finally {
			vi.useRealTimers();
		}
		expect(cloud.copy()["frames/menu/list/frame.tsx"]).toContain("Tonight's menu");
		shares.close();
	});

	it("takes a page added later up after its agent's turn, and stopping it leaves what other shares show", async () => {
		const cloud = fakeCloud();
		const spoolDir = makeTempDir();
		const { root, name } = makeProject(spoolDir);
		writePageFrame(root, "checkout", "pay", frame("Pay 640 kr"));
		let done = false;
		const daemon = makeApp(spoolDir, {
			cloud: cloud.request,
			agentEngines: [
				endingEngine(() => {
					writePageFrame(root, "menu", "list", frame("Tonight's menu"));
					done = true;
				}),
			],
		});
		const base = `/api/p/${name}/shares`;
		const post = (body: object) =>
			daemon.request(base, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
		expect((await post({ kind: "link", pages: ["checkout"] })).status).toBe(200);
		const whole = (await (await post({ kind: "link", whole: true })).json()) as ShareView;
		const uploads = cloud.sources.length;
		await turn(daemon, name);
		await until(() => done && cloud.sources.length > uploads, 15_000);
		expect(cloud.copy()["frames/menu/list/frame.tsx"]).toContain("Tonight's menu");

		const before = cloud.sources.length;
		expect((await daemon.request(`${base}/${whole.id}`, { method: "DELETE" })).status).toBe(200);
		await until(() => cloud.sources.length > before, 15_000);
		expect(Object.keys(cloud.copy())).toContain("frames/checkout/pay/frame.tsx");
		expect(Object.keys(cloud.copy()).some((path) => path.startsWith("frames/menu/"))).toBe(false);
	});

	it("is refused with the too-large reason when the project is over the fair-use size", async () => {
		const cloud = fakeCloud(1_000);
		const spoolDir = makeTempDir();
		const { root, name } = makeProject(spoolDir);
		writePageFrame(root, "checkout", "pay", frame("Pay 640 kr"));
		writePageFrame(root, "menu", "list", frame("x".repeat(2_000)));
		const shares = createProjectShares({
			spoolDir,
			request: cloud.request,
			version: "0.0.0-test",
			resolve: () => ({ root }),
			watch: () => () => {},
		});
		const refused = await share(shares, name, { kind: "link", whole: true });
		expect(refused.status).toBe(413);
		expect(await refused.json()).toEqual({ error: "too_large" });
		expect(cloud.shares).toEqual([]);
		shares.close();
	});
});

describe("a team project's share", () => {
	it("asks spool.page for the whole project as it was asked, naming no pages (spool#182)", async () => {
		const token = "sam-token".padEnd(43, "x");
		const asked: unknown[] = [];
		const fetch: typeof globalThis.fetch = async (input, init) => {
			const request = new Request(input, init);
			const path = new URL(request.url).pathname;
			if (path === "/auth/account/session")
				return Response.json({ accountId: "sam", email: "sam@example.test", sessionId: "s", expiresAt: 4e9 });
			if (path === "/api/teams/kaffe/projects/checkout/shares" && request.method === "POST") {
				asked.push(await request.json());
				const share: ShareView = {
					id: "share-1",
					kind: "link",
					pages: ["", "menu"],
					whole: true,
					people: [],
					by: "sam@example.test",
					at: 1,
					opens: 0,
					link: "https://s1.onspool.test/",
				};
				return Response.json(share, { status: 201 });
			}
			return Response.json({ error: "not_found" }, { status: 404 });
		};
		const spoolDir = makeTempDir();
		const { root, name } = makeProject(spoolDir);
		writeFileSync(join(root, "spool.json"), JSON.stringify({ project: `${ORIGIN}/kaffe/checkout` }));
		const shares = createProjectShares({
			spoolDir,
			request: { origin: ORIGIN, vault: { read: async () => token }, fetch },
			version: "0.0.0-test",
			resolve: () => ({ root }),
			watch: () => () => {},
		});
		const made = await shares.routes.request(`/${name}/shares`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ kind: "link", whole: true, start: "menu/list" }),
		});
		expect(made.status).toBe(200);
		expect(asked).toEqual([{ kind: "link", whole: true, start: "menu/list" }]);
		expect(await made.json()).toMatchObject({ id: "share-1", whole: true, pages: ["", "menu"] });
		shares.close();
	});

	it("asks spool.page for when it ends and says when it does, as spool.page answers (spool#183)", async () => {
		const token = "sam-token".padEnd(43, "x");
		const asked: unknown[] = [];
		const share: ShareView = {
			id: "share-1",
			kind: "link",
			pages: ["menu"],
			people: [],
			by: "sam@example.test",
			at: 1,
			opens: 0,
			link: "https://s1.onspool.test/",
			endsAt: 1 + 7 * 86_400,
		};
		const fetch: typeof globalThis.fetch = async (input, init) => {
			const request = new Request(input, init);
			const path = new URL(request.url).pathname;
			if (path === "/auth/account/session")
				return Response.json({ accountId: "sam", email: "sam@example.test", sessionId: "s", expiresAt: 4e9 });
			if (path === "/api/teams/kaffe/projects/checkout/shares" && request.method === "POST") {
				asked.push(await request.json());
				return Response.json(share, { status: 201 });
			}
			if (path === "/api/teams/kaffe/projects/checkout/shares") return Response.json({ shares: [share] });
			return Response.json({ error: "not_found" }, { status: 404 });
		};
		const spoolDir = makeTempDir();
		const { root, name } = makeProject(spoolDir);
		writeFileSync(join(root, "spool.json"), JSON.stringify({ project: `${ORIGIN}/kaffe/checkout` }));
		const shares = createProjectShares({
			spoolDir,
			request: { origin: ORIGIN, vault: { read: async () => token }, fetch },
			version: "0.0.0-test",
			resolve: () => ({ root }),
			watch: () => () => {},
		});
		const made = await shares.routes.request(`/${name}/shares`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ kind: "link", pages: ["menu"], ends: "7d" }),
		});
		expect(asked).toEqual([{ kind: "link", pages: ["menu"], ends: "7d" }]);
		expect(await made.json()).toMatchObject({ endsAt: 604_801 });
		const listed = await shares.routes.request(`/${name}/shares`);
		expect(await listed.json()).toMatchObject({ state: "ready", shares: [{ id: "share-1", endsAt: 604_801 }] });
		shares.close();
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
			cloud: ana.cloud,
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
