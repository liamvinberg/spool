import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, it, vi } from "vitest";
import type { CloudOperation, CloudPublication, PublishResult } from "../cloud-publication";
import { associationIdentity, type PublicationAssociation } from "../publication/associations";
import { canonicalJson } from "../publication/manifest";
import { makeProject, makeTempDir } from "../test-helpers";
import { createPublicationJobs, type PublicationJobServices } from "./publication-jobs";

const ready = { entry: "menu", ok: true, included: ["menu", "cart"], outgoing: [], diagnostics: [] };

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function publication(ownerId: string, state: CloudPublication["state"] = "active"): CloudPublication {
	return {
		id: "publication",
		projectId: "project",
		ownerId,
		title: "Kaffe",
		hostname: "p.test.beta.onspool.page",
		url: "https://p.test.beta.onspool.page",
		entry: "menu",
		scenario: "default",
		state,
		revision: 2,
		accessGeneration: 3,
		currentVersion: { id: "version", contentIdentity: "a".repeat(64) },
		invitedEmails: ["alex@example.com"],
		createdAt: 1,
		updatedAt: 2,
	};
}

function operation(
	value: CloudPublication,
	id: string = randomUUID(),
	state: CloudOperation["state"] = "succeeded",
): CloudOperation {
	return {
		id,
		publicationId: value.id,
		kind: "update",
		state,
		contentIdentity: "a".repeat(64),
		expectedRevision: 1,
		expectedAccessGeneration: 3,
		createdAt: 1,
		expiresAt: 10,
		missingObjectIndices: [],
		result: state === "succeeded" ? { publication: value, versionId: "version" } : null,
		error: state === "failed" ? { code: "upload_failed", message: "The upload failed. Try again." } : null,
	};
}

function result(value: CloudPublication, source: PublishResult["localSource"]): PublishResult {
	const complete = operation(value);
	return { publisherId: value.ownerId, publication: value, operation: complete, localSource: source };
}

function writeAssociation(
	spoolDir: string,
	root: string,
	patch: Partial<PublicationAssociation> = {},
): PublicationAssociation {
	const identity = associationIdentity(spoolDir, "https://cloud.test", "owner", root, "menu", "default");
	const key = createHash("sha256").update(canonicalJson(identity)).digest("hex");
	const association: PublicationAssociation = {
		key,
		identity,
		projectId: "11111111-1111-4111-8111-111111111111",
		title: "Kaffe",
		intent: {
			kind: "create",
			operationId: "22222222-2222-4222-8222-222222222222",
			contentIdentity: "a".repeat(64),
			inputIdentity: "input",
			invitedEmails: ["alex@example.com"],
		},
		binding: {
			operationId: "22222222-2222-4222-8222-222222222222",
			contentIdentity: "a".repeat(64),
			inputIdentity: "input",
		},
		publicationId: "publication",
		hostname: "p.test.beta.onspool.page",
		url: "https://p.test.beta.onspool.page",
		...patch,
	};
	const file = join(spoolDir, "publications", "associations", `${key}.json`);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(association));
	return association;
}

function services(current: CloudPublication): PublicationJobServices {
	let held = current;
	return {
		account: async () => ({ publisherId: "owner" }),
		readiness: async () => ready,
		status: vi.fn(async () => ({
			publication: held,
			operations: [],
			nextCursor: null,
			localSource: "changed" as const,
		})),
		publish: vi.fn(async () => {
			held = { ...held, state: "active", revision: held.revision + 1 };
			return result(held, "changed");
		}),
		grant: vi.fn(async (_spoolDir, _publicationId, email, kind) => {
			held = {
				...held,
				invitedEmails:
					kind === "invite"
						? [...new Set([...held.invitedEmails, email])]
						: held.invitedEmails.filter((person) => person !== email),
			};
		}),
		stop: vi.fn(async () => {
			held = { ...held, state: "stopped", accessGeneration: held.accessGeneration + 1 };
		}),
		origin: () => "https://cloud.test",
	};
}

it("updates only the exact binding and keeps edits made after capture unpublished", async () => {
	const spoolDir = makeTempDir();
	const project = makeProject(spoolDir);
	writeAssociation(spoolDir, project.root);
	const boundary = services(publication("owner"));
	const jobs = createPublicationJobs({ spoolDir, version: "test", services: boundary });
	const request = { root: project.root, project: "Kaffe", entry: "menu", scenario: "default" };

	expect(await jobs.model(request)).toMatchObject({
		association: "current",
		source: "changed",
		publication: { id: "publication", state: "active" },
		recipients: ["alex@example.com"],
	});
	const started = await jobs.start(request);
	expect(started).toMatchObject({ kind: "update", state: "running" });
	await vi.waitFor(async () =>
		expect(await jobs.read(project.root, started.id)).toMatchObject({
			kind: "update",
			state: "succeeded",
			source: "changed",
			publication: { id: "publication" },
		}),
	);
	expect(boundary.publish).toHaveBeenCalledWith(
		expect.objectContaining({
			expectedPublisherId: "owner",
			publicationId: "publication",
			entry: "menu",
			scenario: "default",
		}),
	);
	expect(vi.mocked(boundary.publish).mock.calls[0]?.[0]).not.toHaveProperty("invitedEmails");
});

it("never borrows a superseded binding and projects only a relevant persisted retry", async () => {
	const spoolDir = makeTempDir();
	const project = makeProject(spoolDir);
	const association = writeAssociation(spoolDir, project.root, { supersededBy: "b".repeat(64) });
	const boundary = services(publication("owner"));
	const jobs = createPublicationJobs({ spoolDir, version: "test", services: boundary });
	const request = { root: project.root, project: "Kaffe", entry: "menu", scenario: "default" };

	expect(await jobs.model(request)).toMatchObject({ association: "superseded", source: "unavailable" });
	expect(boundary.status).not.toHaveBeenCalled();
	await expect(jobs.start(request)).rejects.toThrow("rebound elsewhere");

	delete association.supersededBy;
	writeAssociation(spoolDir, project.root, association);
	const pending = {
		...association,
		intent: {
			kind: "update" as const,
			operationId: "33333333-3333-4333-8333-333333333333",
			contentIdentity: "c".repeat(64),
			inputIdentity: "changed",
			invitedEmails: [],
			expectedRevision: 2,
			expectedAccessGeneration: 3,
			targetPublicationId: "publication",
		},
	};
	const intentFile = join(spoolDir, "publications", "intents", `${association.key}.json`);
	mkdirSync(dirname(intentFile), { recursive: true });
	writeFileSync(intentFile, JSON.stringify(pending));
	boundary.status = async () => ({
		publication: publication("owner"),
		operation: operation(publication("owner"), pending.intent.operationId, "uploading"),
		operations: [],
		nextCursor: null,
		localSource: "changed",
	});
	expect(await jobs.model(request)).toMatchObject({
		job: { id: pending.intent.operationId, kind: "update", state: "failed", retryable: true },
	});

	rmSync(intentFile);
	boundary.status = async () => ({
		publication: publication("owner"),
		operations: [
			{
				id: randomUUID(),
				publicationId: "publication",
				kind: "update",
				state: "failed",
				contentIdentity: "c".repeat(64),
				expectedRevision: 1,
				expectedAccessGeneration: 3,
				createdAt: 1,
				expiresAt: 2,
				result: null,
				error: { code: "failed", message: "old failure" },
			},
		],
		nextCursor: null,
		localSource: "current",
	});
	expect(await jobs.model(request)).not.toHaveProperty("job");
});

it("refreshes grants and confirms stop without changing local identity", async () => {
	const spoolDir = makeTempDir();
	const project = makeProject(spoolDir);
	writeAssociation(spoolDir, project.root);
	const boundary = services(publication("owner"));
	const jobs = createPublicationJobs({ spoolDir, version: "test", services: boundary });
	const request = { root: project.root, project: "Kaffe", entry: "menu", scenario: "default" };

	expect(await jobs.grant({ ...request, kind: "invite", email: "sam@example.com" })).toMatchObject({
		invitedEmails: ["alex@example.com", "sam@example.com"],
	});
	expect(await jobs.grant({ ...request, kind: "revoke", email: "alex@example.com" })).toMatchObject({
		invitedEmails: ["sam@example.com"],
	});
	expect(await jobs.stop(request)).toMatchObject({
		id: "publication",
		state: "stopped",
		accessGeneration: 4,
		invitedEmails: ["sam@example.com"],
	});
	expect(boundary.grant).toHaveBeenCalledWith(spoolDir, "publication", "alex@example.com", "revoke", "owner");
	expect(boundary.stop).toHaveBeenCalledWith(spoolDir, "publication", "owner");
});

it("coalesces status reads and drops both responses when approval changes mid-read", async () => {
	const spoolDir = makeTempDir();
	const project = makeProject(spoolDir);
	writeAssociation(spoolDir, project.root);
	let publisher: string | undefined = "owner";
	const held = deferred<{
		publication: CloudPublication;
		operations: [];
		nextCursor: null;
		localSource: "current";
	}>();
	const boundary = services(publication("owner"));
	boundary.account = async () => {
		if (publisher === undefined) throw new Error("signed out");
		return { publisherId: publisher };
	};
	boundary.status = vi.fn(() => held.promise);
	const jobs = createPublicationJobs({ spoolDir, version: "test", services: boundary });
	const request = { root: project.root, project: "Kaffe", entry: "menu", scenario: "default" };

	const first = jobs.model(request);
	const second = jobs.model(request);
	await vi.waitFor(() => expect(boundary.status).toHaveBeenCalledTimes(1));
	publisher = undefined;
	held.resolve({
		publication: publication("owner"),
		operations: [],
		nextCursor: null,
		localSource: "current",
	});
	expect(await first).toMatchObject({ available: false });
	expect(await second).toMatchObject({ available: false });
});

it("does not publish an existing binding while its fresh status is unavailable", async () => {
	const spoolDir = makeTempDir();
	const project = makeProject(spoolDir);
	writeAssociation(spoolDir, project.root);
	const boundary = services(publication("owner"));
	boundary.status = vi.fn(async () => {
		throw new Error("offline");
	});
	const jobs = createPublicationJobs({ spoolDir, version: "test", services: boundary });
	const request = { root: project.root, project: "Kaffe", entry: "menu", scenario: "default" };

	expect(await jobs.model(request)).toMatchObject({
		available: true,
		association: "current",
		source: "unavailable",
		problem: "Sharing could not be checked. Try again.",
	});
	await expect(jobs.start(request)).rejects.toThrow("Sharing could not be checked");
	expect(boundary.publish).not.toHaveBeenCalled();
});
