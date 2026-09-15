import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CloudVault } from "./cloud-auth";
import {
	CloudPublicationFailure,
	listPublications,
	mutatePublicationGrant,
	publicationOperations,
	publicationStatus,
	publishWebsite,
} from "./cloud-publication";
import { associationIdentity, readAssociation } from "./publication/associations";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "./test-helpers";

const vault: CloudVault = { read: async () => "t".repeat(43), write: async () => {}, delete: async () => {} };

function service(
	options: {
		loseActivation?: boolean;
		loseSealBeforeCommit?: boolean;
		onActivate?: () => void;
		scenario?: string;
		rejectUpdate?: boolean;
		productionHost?: boolean;
	} = {},
) {
	let manifest: { contentIdentity: string; entry: string; scenario: string; objects: unknown[] } | undefined;
	let state: "uploading" | "sealed" | "succeeded" | "failed" = "uploading";
	let missing: number[] = [];
	let lost = options.loseActivation === true;
	let lostSeal = options.loseSealBeforeCommit === true;
	let operationId = "operation";
	let kind: "create" | "update" = "create";
	let projectId = "00000000-0000-4000-8000-000000000001";
	let revision = 0;
	let invitedEmails = ["alex@example.com"];
	const calls: string[] = [];
	const hostname = options.productionHost
		? "paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onspool.page"
		: "paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-beta.onspool.page";
	const publication = () => ({
		id: "publication",
		projectId,
		ownerId: "publisher",
		title: "start",
		hostname,
		url: `https://${hostname}`,
		entry: manifest?.entry ?? "start",
		scenario: manifest?.scenario ?? options.scenario ?? "default",
		state: state === "succeeded" ? "active" : "staging",
		revision,
		accessGeneration: 1,
		currentVersion:
			state === "succeeded" ? { id: "version", contentIdentity: manifest?.contentIdentity ?? "" } : null,
		invitedEmails,
		createdAt: 1,
		updatedAt: 1,
	});
	const response = () => ({
		publication: publication(),
		operation: {
			id: operationId,
			publicationId: "publication",
			kind,
			state,
			contentIdentity: manifest?.contentIdentity ?? "",
			expectedRevision: 0,
			expectedAccessGeneration: 1,
			createdAt: 1,
			expiresAt: 2_000_000_000,
			missingObjectIndices: missing,
			result: state === "succeeded" ? { publication: publication(), versionId: "version" } : null,
			error: null,
		},
	});
	return {
		calls,
		fail: () => {
			state = "failed";
		},
		fetch: async (input: string | URL | Request, init?: RequestInit) => {
			const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
			calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
			expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${"t".repeat(43)}`);
			if (url.pathname === "/auth/publisher/session")
				return Response.json({ authenticated: true, publisherId: "publisher", sessionId: "session" });
			if (url.pathname === "/api/publications" && init?.method === "POST") {
				kind = "create";
				operationId = new Headers(init.headers).get("idempotency-key") ?? "operation";
				const body = JSON.parse(String(init.body)) as {
					manifest: typeof manifest;
					projectId: string;
					invitedEmails: string[];
				};
				projectId = body.projectId;
				invitedEmails = body.invitedEmails;
				manifest = body.manifest;
				missing = manifest?.objects.map((_, index) => index) ?? [];
				return Response.json(response(), { status: 201 });
			}
			if (url.pathname === "/api/publications/publication/operations" && init?.method === "POST") {
				kind = "update";
				operationId = new Headers(init.headers).get("idempotency-key") ?? "operation";
				if (options.rejectUpdate)
					return Response.json(
						{ error: "revision_conflict", message: "stale", retryable: false, operationId },
						{ status: 409 },
					);
				const body = JSON.parse(String(init.body)) as { manifest: typeof manifest };
				manifest = body.manifest;
				state = "uploading";
				missing = manifest?.objects.map((_, index) => index) ?? [];
				return Response.json(response(), { status: 201 });
			}
			if (/\/objects\/\d+$/.test(url.pathname)) {
				const index = Number(url.pathname.split("/").at(-1));
				missing = missing.filter((value) => value !== index);
				return Response.json({ operationId, objectIndex: index, state: "verified" });
			}
			if (url.pathname.endsWith("/seal")) {
				if (lostSeal) {
					lostSeal = false;
					throw new Error("lost before seal");
				}
				state = "sealed";
				return Response.json(response());
			}
			if (url.pathname.endsWith("/activate")) {
				state = "succeeded";
				revision++;
				options.onActivate?.();
				if (lost) {
					lost = false;
					throw new Error("lost response with a secret");
				}
				return Response.json(response());
			}
			if (url.pathname === `/api/publication-operations/${operationId}`) {
				if (options.rejectUpdate)
					return Response.json({ error: "not_found", message: "not found", retryable: false }, { status: 404 });
				return Response.json(response());
			}
			if (url.pathname === "/api/publications")
				return Response.json({ publications: [publication()], operationSummaries: [], nextCursor: null });
			if (url.pathname === "/api/publications/publication") return Response.json({ publication: publication() });
			if (url.pathname === "/api/publications/publication/operations")
				return Response.json({ operations: [], nextCursor: null });
			return Response.json({ error: "not_found", message: "not found", retryable: false }, { status: 404 });
		},
	};
}

describe("Cloud publication client", () => {
	it.each([false, true])(
		"recovers lost success and persists the binding before returning (explicit=%s)",
		async (explicit) => {
			const spoolDir = makeTempDir();
			const { root } = makeProject(spoolDir);
			writeFrame(root, "start", "export default () => <h1>Shared</h1>");
			const cloud = service();
			let unavailable = false;
			const fetch = async (input: string | URL | Request, init?: RequestInit) => {
				const path = new URL(typeof input === "string" || input instanceof URL ? input : input.url).pathname;
				if (unavailable && path.startsWith("/api/publication-operations/")) throw new Error("offline");
				const response = await cloud.fetch(input, init);
				if (path.endsWith("/activate")) {
					unavailable = true;
					throw new Error("lost success");
				}
				return response;
			};
			const options = {
				spoolDir,
				root,
				entry: "start",
				version: "test",
				origin: "https://cloud.test",
				vault,
				fetch,
				...(explicit ? { publicationId: "publication" } : { invitedEmails: ["alex@example.com"] }),
			};
			await expect(publishWebsite(options)).rejects.toMatchObject({
				detail: { code: "transport_interrupted", operationId: expect.any(String) },
			});
			unavailable = false;
			const recovered = await publishWebsite(options);
			expect(recovered.operation.state).toBe("succeeded");
			expect(cloud.calls.filter((call) => call.endsWith("/activate"))).toHaveLength(1);
			expect(cloud.calls.filter((call) => call === "POST /api/publications/publication/operations")).toHaveLength(
				explicit ? 1 : 0,
			);
			const status = await publicationStatus(spoolDir, "publication", { origin: options.origin, vault, fetch });
			expect(status.localSource).toBe("current");
		},
	);
	it("keeps the previous binding on failed rebind, then marks it superseded only after success", async () => {
		const spoolDir = makeTempDir();
		const { root } = makeProject(spoolDir);
		writeFrame(root, "start", "export default () => <h1>First</h1>");
		writeFrame(root, "other", "export default () => <h1>Other</h1>");
		const cloud = service();
		const options = {
			spoolDir,
			root,
			entry: "start",
			version: "test",
			origin: "https://cloud.test",
			vault,
			fetch: cloud.fetch,
			invitedEmails: ["alex@example.com"],
		};
		await publishWebsite(options);
		const previous = associationIdentity(spoolDir, options.origin, "publisher", root, "start", "default");
		const saved = readAssociation(spoolDir, previous);
		await expect(
			publishWebsite({ ...options, entry: "missing", publicationId: "publication" }),
		).rejects.toMatchObject({ detail: { code: "capture_failed" } });
		expect(readAssociation(spoolDir, previous)).toEqual(saved);
		await publishWebsite({ ...options, entry: "other", publicationId: "publication" });
		expect(readAssociation(spoolDir, previous)?.supersededBy).toEqual(expect.any(String));
		expect((await publicationStatus(spoolDir, "publication", options)).localSource).toBe("current");
		const admitted = cloud.calls.filter((call) => call.startsWith("POST ")).length;
		await expect(publishWebsite(options)).rejects.toThrow("rebound elsewhere");
		expect(cloud.calls.filter((call) => call.startsWith("POST "))).toHaveLength(admitted);
		rmSync(join(root, "design/frames/start/frame.tsx"));
		await expect(publishWebsite({ ...options, publicationId: "publication" })).rejects.toMatchObject({
			detail: { code: "capture_failed" },
		});
		expect(readAssociation(spoolDir, previous)?.supersededBy).toEqual(expect.any(String));
		expect((await publicationStatus(spoolDir, "publication", options)).localSource).toBe("current");
	});
	it("refuses changed recipients while recovering an admitted upload", async () => {
		const spoolDir = makeTempDir();
		const { root } = makeProject(spoolDir);
		writeFrame(root, "start", "export default () => <h1>Shared</h1>");
		const cloud = service();
		let offline = false;
		const fetch = async (input: string | URL | Request, init?: RequestInit) => {
			if (init?.method === "PUT") offline = true;
			if (offline) throw new Error("offline");
			return cloud.fetch(input, init);
		};
		const options = {
			spoolDir,
			root,
			entry: "start",
			version: "test",
			origin: "https://cloud.test",
			vault,
			fetch,
			invitedEmails: ["alex@example.com"],
		};
		await expect(publishWebsite(options)).rejects.toMatchObject({ detail: { operationId: expect.any(String) } });
		offline = false;
		await expect(publishWebsite({ ...options, invitedEmails: ["new@example.com"] })).rejects.toThrow(
			"recipient arguments changed",
		);
		expect(cloud.calls.filter((call) => call === "POST /api/publications")).toHaveLength(1);
	});
	it("rejects a queued job for a different publisher before capture or intent admission", async () => {
		const spoolDir = makeTempDir();
		const { root } = makeProject(spoolDir);
		const cloud = service();
		await expect(
			publishWebsite({
				spoolDir,
				root,
				entry: "missing",
				version: "test",
				origin: "https://cloud.test",
				vault,
				fetch: cloud.fetch,
				expectedPublisherId: "previous-publisher",
			}),
		).rejects.toMatchObject({ code: "account_changed" });
		expect(cloud.calls).toEqual(["GET /auth/publisher/session"]);
	});
	it.each([false, true])(
		"stops after an upload account switch and preserves its intent (interrupted=%s)",
		async (interrupted) => {
			const spoolDir = makeTempDir();
			const { root } = makeProject(spoolDir);
			writeFrame(root, "start", "export default () => <h1>Shared</h1>");
			const cloud = service();
			let token = "t".repeat(43);
			const fetch = async (input: string | URL | Request, init?: RequestInit) => {
				const response = await cloud.fetch(input, init);
				if (init?.method === "PUT") {
					token = "s".repeat(43);
					if (interrupted) throw new Error("disconnected");
				}
				return response;
			};
			await expect(
				publishWebsite({
					spoolDir,
					root,
					entry: "start",
					version: "test",
					origin: "https://cloud.test",
					vault: { read: async () => token },
					fetch,
					invitedEmails: ["alex@example.com"],
				}),
			).rejects.toMatchObject({
				detail: { code: "account_changed", retryable: false, operationId: expect.any(String) },
			});
			expect(cloud.calls.some((call) => call.endsWith("/activate"))).toBe(false);
			expect(cloud.calls.filter((call) => call.startsWith("PUT "))).toHaveLength(1);
		},
	);
	it("binds every publication request to the starting vault identity", async () => {
		const spoolDir = makeTempDir();
		const { root } = makeProject(spoolDir);
		writeFrame(root, "start", "export default () => <h1>Shared</h1>");
		let held = "t".repeat(43);
		const mutableVault: CloudVault = {
			read: async () => held,
			write: async () => {},
			delete: async () => {},
		};
		const cloud = service();
		await expect(
			publishWebsite({
				spoolDir,
				root,
				entry: "start",
				invitedEmails: ["viewer@example.com"],
				version: "test",
				origin: "https://cloud.test",
				vault: mutableVault,
				fetch: cloud.fetch,
				progress: (message) => {
					if (message === "capturing website") held = "u".repeat(43);
				},
			}),
		).rejects.toThrow(/account changed/u);
		expect(cloud.calls.some((call) => call.startsWith("POST"))).toBe(false);
		expect(held).toBe("u".repeat(43));
	});
	it("pages bounded operation history without conflating it with current publication state", async () => {
		let requested = "";
		const fetch = async (input: string | URL | Request) => {
			const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
			if (url.pathname === "/auth/publisher/session")
				return Response.json({ authenticated: true, publisherId: "publisher", sessionId: "session" });
			requested = `${url.pathname}${url.search}`;
			return Response.json({
				operations: [
					{
						id: "00000000-0000-4000-8000-000000000002",
						publicationId: "publication",
						kind: "update",
						state: "conflict",
						contentIdentity: "a".repeat(64),
						expectedRevision: 2,
						expectedAccessGeneration: 1,
						createdAt: 10,
						expiresAt: 20,
						result: null,
						error: { code: "revision_conflict", message: "stale" },
					},
				],
				nextCursor: "next",
			});
		};
		await expect(
			publicationOperations(makeTempDir(), "publication", {
				cursor: "held",
				limit: 1,
				origin: "https://cloud.test",
				vault,
				fetch,
			}),
		).resolves.toMatchObject({ operations: [{ state: "conflict" }], nextCursor: "next" });
		expect(requested).toBe("/api/publications/publication/operations?cursor=held&limit=1");
	});
	it("uses the remote scenario for an explicit rebind and binds only after success", async () => {
		const spoolDir = makeTempDir();
		const { root } = makeProject(spoolDir);
		writeFrame(root, "start", "export default () => <h1>Shared</h1>");
		writeDesignFile(root, "shared/scenarios/review.json", '{"state":{"mode":"review"}}');
		const cloud = service({ scenario: "review" });
		const result = await publishWebsite({
			spoolDir,
			root,
			entry: "start",
			publicationId: "publication",
			version: "test",
			origin: "https://cloud.test",
			vault,
			fetch: cloud.fetch,
		});
		expect(result).toMatchObject({ publication: { scenario: "review" }, operation: { kind: "update" } });
		const identity = associationIdentity(spoolDir, "https://cloud.test", "publisher", root, "start", "review");
		expect(readAssociation(spoolDir, identity)?.publicationId).toBe("publication");

		const otherSpoolDir = makeTempDir();
		const rejected = service({ scenario: "review", rejectUpdate: true });
		await expect(
			publishWebsite({
				spoolDir: otherSpoolDir,
				root,
				entry: "start",
				publicationId: "publication",
				version: "test",
				origin: "https://cloud.test",
				vault,
				fetch: rejected.fetch,
			}),
		).rejects.toBeInstanceOf(CloudPublicationFailure);
		const rejectedIdentity = associationIdentity(
			otherSpoolDir,
			"https://cloud.test",
			"publisher",
			root,
			"start",
			"review",
		);
		expect(readAssociation(otherSpoolDir, rejectedIdentity)).toBeUndefined();
	});
	it("mutates an exact mailbox with a stable operation identity", async () => {
		const calls: { path: string; body: string; operation: string }[] = [];
		const fetch = async (input: string | URL | Request, init?: RequestInit) => {
			const path = new URL(typeof input === "string" || input instanceof URL ? input : input.url).pathname;
			if (path === "/auth/publisher/session")
				return Response.json({ authenticated: true, publisherId: "publisher", sessionId: "session" });
			const operation = new Headers(init?.headers).get("idempotency-key") ?? "";
			calls.push({ path, body: String(init?.body), operation });
			return Response.json({
				operation: {
					id: operation,
					kind: "invite",
					state: "succeeded",
					result: {
						publicationId: "publication",
						grant: { email: "Alex+demo@example.com", active: true, generation: 2 },
						changed: true,
					},
				},
				currentGrant: { email: "Alex+demo@example.com", active: true, generation: 2 },
			});
		};
		await expect(
			mutatePublicationGrant(makeTempDir(), "publication", "  Alex+demo@Example.COM ", "invite", {
				origin: "https://cloud.test",
				vault,
				fetch,
			}),
		).resolves.toMatchObject({ operation: { kind: "invite", result: { changed: true } } });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.path).toBe("/api/publications/publication/invite");
		expect(calls[0]?.body).toBe('{"email":"Alex+demo@example.com"}');
		expect(calls[0]?.operation).toMatch(/^[0-9a-f-]{36}$/u);
	});

	it("retries interrupted grant transport with the same operation id", async () => {
		let attempts = 0;
		const ids: string[] = [];
		const fetch = async (input: string | URL | Request, init?: RequestInit) => {
			const path = new URL(typeof input === "string" || input instanceof URL ? input : input.url).pathname;
			if (path === "/auth/publisher/session")
				return Response.json({ authenticated: true, publisherId: "publisher", sessionId: "session" });
			attempts++;
			const id = new Headers(init?.headers).get("idempotency-key") ?? "";
			ids.push(id);
			if (attempts === 1)
				return Response.json(
					{ error: "service_unavailable", message: "try later", retryable: true },
					{ status: 503 },
				);
			if (attempts === 2) throw new Error("socket contained a secret");
			const grant = { email: "viewer@example.com", active: false, generation: 1 };
			return Response.json({
				operation: {
					id,
					kind: "revoke",
					state: "succeeded",
					result: { publicationId: "publication", grant, changed: false },
				},
				currentGrant: grant,
			});
		};
		await expect(
			mutatePublicationGrant(makeTempDir(), "publication", "viewer@example.com", "revoke", {
				origin: "https://cloud.test",
				vault,
				fetch,
			}),
		).resolves.toMatchObject({ operation: { result: { changed: false } } });
		expect(ids).toHaveLength(3);
		expect(new Set(ids).size).toBe(1);
	});
	it("uploads the exact captured inventory and recovers a lost activation response", async () => {
		const spoolDir = makeTempDir();
		const { root } = makeProject(spoolDir);
		writeFrame(root, "start", "export default () => <h1>Shared</h1>");
		const cloud = service({ loseActivation: true });
		const result = await publishWebsite({
			spoolDir,
			root,
			entry: "start",
			invitedEmails: ["Alex@Example.com"],
			version: "test",
			origin: "https://cloud.test",
			vault,
			fetch: cloud.fetch,
		});
		expect(result.operation.state).toBe("succeeded");
		expect(result.publication.url).toBe("https://paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-beta.onspool.page");
		expect(result.publication.invitedEmails).toEqual(["Alex@example.com"]);
		expect(result.localSource).toBe("current");
		expect(cloud.calls.filter((call) => call.includes("/objects/")).length).toBeGreaterThan(5);
		expect(cloud.calls.at(-1)).toMatch(/^GET \/api\/publication-operations\//u);
	});

	it("recovers then repeats the same seal when an uncertain request did not commit", async () => {
		const spoolDir = makeTempDir();
		const { root } = makeProject(spoolDir);
		writeFrame(root, "start", "export default () => <h1>Shared</h1>");
		const cloud = service({ loseSealBeforeCommit: true });
		await expect(
			publishWebsite({
				spoolDir,
				root,
				entry: "start",
				invitedEmails: ["Alex@example.com"],
				version: "test",
				origin: "https://cloud.test",
				vault,
				fetch: cloud.fetch,
			}),
		).resolves.toMatchObject({ operation: { state: "succeeded" } });
		expect(cloud.calls.filter((call) => call.endsWith("/seal"))).toHaveLength(2);
	});

	it("does not call source current when it changes during upload", async () => {
		const spoolDir = makeTempDir();
		const { root } = makeProject(spoolDir);
		writeFrame(root, "start", "export default () => <h1>Before</h1>");
		const cloud = service({ onActivate: () => writeFrame(root, "start", "export default () => <h1>After</h1>") });
		await expect(
			publishWebsite({
				spoolDir,
				root,
				entry: "start",
				invitedEmails: ["Alex@example.com"],
				version: "test",
				origin: "https://cloud.test",
				vault,
				fetch: cloud.fetch,
			}),
		).resolves.toMatchObject({ operation: { state: "succeeded" }, localSource: "changed" });
	});

	it("reads status before explicitly updating changed source on the same publication", async () => {
		const spoolDir = makeTempDir();
		const { root } = makeProject(spoolDir);
		writeFrame(root, "start", "export default () => <h1>First</h1>");
		const cloud = service();
		await publishWebsite({
			spoolDir,
			root,
			entry: "start",
			invitedEmails: ["alex@example.com"],
			version: "test",
			origin: "https://cloud.test",
			vault,
			fetch: cloud.fetch,
		});
		cloud.calls.length = 0;
		writeFrame(root, "start", "export default () => <h1>Changed</h1>");
		await expect(
			publishWebsite({
				spoolDir,
				root,
				entry: "start",
				invitedEmails: ["alex@example.com"],
				version: "test",
				origin: "https://cloud.test",
				vault,
				fetch: cloud.fetch,
			}),
		).resolves.toMatchObject({ operation: { kind: "update", state: "succeeded" }, localSource: "current" });
		expect(cloud.calls[1]).toBe("GET /api/publications/publication");
		expect(cloud.calls[2]).toMatch(/^GET \/api\/publication-operations\//u);
		expect(cloud.calls.some((call) => call === "POST /api/publications/publication/operations")).toBe(true);
		rmSync(join(root, "design", "frames", "start"), { recursive: true });
		await expect(
			publishWebsite({
				spoolDir,
				root,
				entry: "start",
				version: "test",
				origin: "https://cloud.test",
				vault,
				fetch: cloud.fetch,
			}),
		).rejects.toMatchObject({ detail: { code: "capture_failed", operation: { state: "succeeded" } } });
	});

	it("lists and reads status through the authenticated client", async () => {
		const cloud = service();
		await expect(
			listPublications(makeTempDir(), { origin: "https://cloud.test", vault, fetch: cloud.fetch }),
		).resolves.toMatchObject({ publications: [{ id: "publication" }] });
		await expect(
			publicationStatus(makeTempDir(), "publication", { origin: "https://cloud.test", vault, fetch: cloud.fetch }),
		).resolves.toMatchObject({ publication: { id: "publication" } });
	});

	it("rejects publication hosts from the opposite cloud environment", async () => {
		await expect(
			listPublications(makeTempDir(), {
				origin: "https://spool.page",
				vault,
				fetch: service().fetch,
			}),
		).rejects.toBeDefined();
		await expect(
			listPublications(makeTempDir(), {
				origin: "https://beta.spool.page",
				vault,
				fetch: service({ productionHost: true }).fetch,
			}),
		).rejects.toBeDefined();
	});

	it("reports unchanged, edited, and missing local source beside the stable operation", async () => {
		const spoolDir = makeTempDir();
		const { root } = makeProject(spoolDir);
		writeFrame(root, "start", "export default () => <h1>First</h1>");
		const cloud = service();
		const created = await publishWebsite({
			spoolDir,
			root,
			entry: "start",
			invitedEmails: ["alex@example.com"],
			version: "test",
			origin: "https://cloud.test",
			vault,
			fetch: cloud.fetch,
		});
		await expect(
			publicationStatus(spoolDir, "publication", { origin: "https://cloud.test", vault, fetch: cloud.fetch }),
		).resolves.toMatchObject({ operation: { id: created.operation.id }, localSource: "current" });
		writeFrame(root, "start", "export default () => <h1>Edited</h1>");
		await expect(
			publicationStatus(spoolDir, "publication", { origin: "https://cloud.test", vault, fetch: cloud.fetch }),
		).resolves.toMatchObject({ localSource: "changed" });
		rmSync(join(root, "design", "frames", "start"), { recursive: true });
		await expect(
			publicationStatus(spoolDir, "publication", { origin: "https://cloud.test", vault, fetch: cloud.fetch }),
		).resolves.toMatchObject({ localSource: "unavailable" });
	});

	it("starts a fresh explicit update after a recovered terminal failure", async () => {
		const spoolDir = makeTempDir();
		const { root } = makeProject(spoolDir);
		writeFrame(root, "start", "export default () => <h1>First</h1>");
		const cloud = service();
		const first = await publishWebsite({
			spoolDir,
			root,
			entry: "start",
			invitedEmails: ["alex@example.com"],
			version: "test",
			origin: "https://cloud.test",
			vault,
			fetch: cloud.fetch,
		});
		cloud.fail();
		const result = await publishWebsite({
			spoolDir,
			root,
			entry: "start",
			version: "test",
			origin: "https://cloud.test",
			vault,
			fetch: cloud.fetch,
		});
		expect(result).toMatchObject({ operation: { kind: "update", state: "succeeded" }, localSource: "current" });
		expect(result.operation.id).not.toBe(first.operation.id);
	});

	it("returns a long HTTP-date retry delay without shortening it", async () => {
		let requests = 0;
		const retryAt = new Date(Date.now() + 60_000).toUTCString();
		const request = async (input: string | URL | Request) => {
			const path = new URL(typeof input === "string" || input instanceof URL ? input : input.url).pathname;
			if (path === "/auth/publisher/session")
				return Response.json({ authenticated: true, publisherId: "publisher", sessionId: "session" });
			requests += 1;
			return Response.json(
				{ error: "service_unavailable", message: "try later", retryable: true },
				{ status: 503, headers: { "retry-after": retryAt } },
			);
		};
		const failure = await listPublications(makeTempDir(), {
			origin: "https://cloud.test",
			vault,
			fetch: request,
		}).catch((error: unknown) => error);
		expect(requests).toBe(1);
		expect(failure).toBeInstanceOf(CloudPublicationFailure);
		if (!(failure instanceof CloudPublicationFailure)) throw new Error("expected structured failure");
		expect(failure.detail).toMatchObject({ code: "service_unavailable", retryable: true });
		expect(failure.detail.retryAfter).toBeGreaterThan(10);
	});
});
