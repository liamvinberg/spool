import { describe, expect, it } from "vitest";
import type { CloudVault } from "./cloud-auth";
import { listPublications, publicationStatus, publishWebsite } from "./cloud-publication";
import { makeProject, makeTempDir, writeFrame } from "./test-helpers";

const vault: CloudVault = { read: async () => "t".repeat(43), write: async () => {}, delete: async () => {} };

function service(options: { loseActivation?: boolean } = {}) {
	let manifest: { contentIdentity: string; entry: string; scenario: string; objects: unknown[] } | undefined;
	let state: "uploading" | "sealed" | "succeeded" = "uploading";
	let missing: number[] = [];
	let lost = options.loseActivation === true;
	let operationId = "operation";
	let projectId = "project";
	const calls: string[] = [];
	const publication = () => ({
		id: "publication",
		projectId,
		ownerId: "publisher",
		title: "start",
		hostname: "beta-site.onspool.page",
		url: "https://beta-site.onspool.page",
		entry: manifest?.entry ?? "start",
		scenario: manifest?.scenario ?? "default",
		state: state === "succeeded" ? "active" : "staging",
		revision: state === "succeeded" ? 1 : 0,
		accessGeneration: 1,
		currentVersion:
			state === "succeeded" ? { id: "version", contentIdentity: manifest?.contentIdentity ?? "" } : null,
		invitedEmails: ["alex@example.com"],
		createdAt: 1,
		updatedAt: 1,
	});
	const response = () => ({
		publication: publication(),
		operation: {
			id: operationId,
			publicationId: "publication",
			kind: "create",
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
		fetch: async (input: string | URL | Request, init?: RequestInit) => {
			const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
			calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
			expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${"t".repeat(43)}`);
			if (url.pathname === "/auth/publisher/session")
				return Response.json({ authenticated: true, publisherId: "publisher", sessionId: "session" });
			if (url.pathname === "/api/publications" && init?.method === "POST") {
				operationId = new Headers(init.headers).get("idempotency-key") ?? "operation";
				const body = JSON.parse(String(init.body)) as { manifest: typeof manifest; projectId: string };
				projectId = body.projectId;
				manifest = body.manifest;
				missing = manifest?.objects.map((_, index) => index) ?? [];
				return Response.json(response(), { status: 201 });
			}
			if (/\/objects\/\d+$/.test(url.pathname)) {
				const index = Number(url.pathname.split("/").at(-1));
				missing = missing.filter((value) => value !== index);
				return Response.json({ operationId, objectIndex: index, state: "verified" });
			}
			if (url.pathname.endsWith("/seal")) {
				state = "sealed";
				return Response.json(response());
			}
			if (url.pathname.endsWith("/activate")) {
				state = "succeeded";
				if (lost) {
					lost = false;
					throw new Error("lost response with a secret");
				}
				return Response.json(response());
			}
			if (url.pathname === `/api/publication-operations/${operationId}`) return Response.json(response());
			if (url.pathname === "/api/publications")
				return Response.json({ publications: [publication()], nextCursor: null });
			if (url.pathname === "/api/publications/publication") return Response.json({ publication: publication() });
			return Response.json({ error: "not_found", message: "not found", retryable: false }, { status: 404 });
		},
	};
}

describe("Cloud publication client", () => {
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
		expect(result.publication.url).toBe("https://beta-site.onspool.page");
		expect(cloud.calls.filter((call) => call.includes("/objects/")).length).toBeGreaterThan(5);
		expect(cloud.calls.at(-1)).toMatch(/^GET \/api\/publication-operations\//u);
	});

	it("recovers status before detecting changed source and never creates a replacement", async () => {
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
		).rejects.toThrow(/updating an existing link/u);
		expect(cloud.calls[1]).toMatch(/^GET \/api\/publication-operations\//u);
		expect(cloud.calls.some((call) => call === "POST /api/publications")).toBe(false);
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
});
