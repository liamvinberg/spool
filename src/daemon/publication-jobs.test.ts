import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PublishResult } from "../cloud-publication";
import { associationIdentity } from "../publication/associations";
import { canonicalJson } from "../publication/manifest";
import { makeProject, makeTempDir } from "../test-helpers";
import { createPublicationJobs, type PublicationJobServices } from "./publication-jobs";

const ready = {
	entry: "menu",
	ok: true,
	included: ["menu", "cart"],
	outgoing: [],
	diagnostics: [],
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

function publication(ownerId: string) {
	return {
		id: `publication-${ownerId}`,
		projectId: "project",
		ownerId,
		title: "Kaffe",
		hostname: "paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-beta.onspool.page",
		url: "https://paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-beta.onspool.page",
		entry: "menu",
		scenario: "default",
		state: "active" as const,
		revision: 1,
		accessGeneration: 1,
		currentVersion: { id: "version", contentIdentity: "identity" },
		invitedEmails: ["alex@example.com"],
		createdAt: 1,
		updatedAt: 1,
	};
}

function publishResult(ownerId: string): PublishResult {
	const value = publication(ownerId);
	return {
		publisherId: ownerId,
		publication: value,
		operation: {
			id: `operation-${ownerId}`,
			publicationId: value.id,
			kind: "create",
			state: "succeeded",
			contentIdentity: "identity",
			expectedRevision: 0,
			expectedAccessGeneration: 1,
			createdAt: 1,
			expiresAt: 2,
			missingObjectIndices: [],
			result: { publication: value, versionId: "version" },
			error: null,
		},
		localSource: "current",
	};
}

describe("daemon publication jobs", () => {
	it("drops a model when the approved publisher changes during its source read", async () => {
		const spoolDir = makeTempDir();
		const project = makeProject(spoolDir);
		let publisher: string | undefined = "owner-a";
		const source = deferred<typeof ready>();
		const services: PublicationJobServices = {
			account: async () => {
				if (publisher === undefined) throw new Error("signed out");
				return { publisherId: publisher };
			},
			readiness: () => source.promise,
			status: async () => {
				throw new Error("not reached");
			},
			publish: async () => publishResult("owner-a"),
			grant: async () => {},
			stop: async () => {},
			origin: () => "https://cloud.test",
		};
		const jobs = createPublicationJobs({ spoolDir, version: "test", services });
		const reading = jobs.model({
			root: project.root,
			project: "Kaffe",
			entry: "menu",
			scenario: "default",
		});
		publisher = undefined;
		source.resolve(ready);
		expect(await reading).toMatchObject({ available: false, included: [], ready: false });

		publisher = "owner-b";
		const nextSource = deferred<typeof ready>();
		services.readiness = () => nextSource.promise;
		const switched = jobs.model({ root: project.root, project: "Kaffe", entry: "menu", scenario: "default" });
		publisher = "owner-a";
		nextSource.resolve(ready);
		expect(await switched).toMatchObject({ available: false, included: [], ready: false });
	});

	it("serializes one publisher's create while isolating account switches and logout", async () => {
		const spoolDir = makeTempDir();
		const project = makeProject(spoolDir);
		let publisher: string | undefined = "owner-a";
		type PublishOutcome = Awaited<ReturnType<PublicationJobServices["publish"]>>;
		const publishes = new Map<string, { promise: Promise<PublishOutcome>; resolve(value: PublishOutcome): void }>();
		const services: PublicationJobServices = {
			account: async () => {
				if (publisher === undefined) throw new Error("signed out");
				return { publisherId: publisher };
			},
			readiness: async () => ready,
			status: async () => {
				throw new Error("no publication");
			},
			publish: vi.fn(async (options) => {
				const owner = options.expectedPublisherId;
				const pending = deferred<PublishOutcome>();
				publishes.set(owner, pending);
				return pending.promise;
			}),
			grant: async () => {},
			stop: async () => {},
			origin: () => "https://cloud.test",
		};
		const jobs = createPublicationJobs({ spoolDir, version: "test", services });
		const request = {
			root: project.root,
			project: "Kaffe",
			entry: "menu",
			scenario: "default",
			email: "alex@example.com",
		};

		const first = await jobs.start(request);
		expect((await jobs.start(request)).id).toBe(first.id);
		expect(await jobs.read(project.root, first.id)).toEqual(first);

		publisher = "owner-b";
		expect(await jobs.read(project.root, first.id)).toBeUndefined();
		expect((await jobs.model(request)).job).toBeUndefined();
		const second = await jobs.start(request);
		expect(second.id).not.toBe(first.id);

		publisher = undefined;
		expect(await jobs.read(project.root, first.id)).toBeUndefined();
		expect(await jobs.model(request)).toMatchObject({ available: false });
		expect(await jobs.model(request)).not.toHaveProperty("job");

		publishes.get("owner-a")?.resolve(publishResult("owner-a"));
		publishes.get("owner-b")?.resolve(publishResult("owner-b"));
		await vi.waitFor(() => expect(services.publish).toHaveBeenCalledTimes(2));
		expect(vi.mocked(services.publish).mock.calls.map(([options]) => options.expectedPublisherId)).toEqual([
			"owner-a",
			"owner-b",
		]);
	});

	it("drops terminal results after the bounded retention window", async () => {
		const spoolDir = makeTempDir();
		const project = makeProject(spoolDir);
		let now = 0;
		const services: PublicationJobServices = {
			account: async () => ({ publisherId: "owner" }),
			readiness: async () => ready,
			status: async () => {
				throw new Error("no publication");
			},
			publish: async () => publishResult("owner"),
			grant: async () => {},
			stop: async () => {},
			origin: () => "https://cloud.test",
		};
		const jobs = createPublicationJobs({ spoolDir, version: "test", services, now: () => now });
		const request = {
			root: project.root,
			project: "Kaffe",
			entry: "menu",
			scenario: "default",
			email: "alex@example.com",
		};
		const started = await jobs.start(request);
		await vi.waitFor(async () => expect((await jobs.read(project.root, started.id))?.state).toBe("succeeded"));
		now = 31 * 60_000;
		expect(await jobs.read(project.root, started.id)).toBeUndefined();
	});
	it("hands out the link's address as soon as the publication exists, before the upload ends", async () => {
		const spoolDir = makeTempDir();
		const project = makeProject(spoolDir);
		const upload = deferred<PublishResult>();
		const capture = deferred<void>();
		const created = deferred<void>();
		const services: PublicationJobServices = {
			account: async () => ({ publisherId: "owner" }),
			readiness: async () => ready,
			status: async () => {
				throw new Error("no publication");
			},
			publish: async (options) => {
				options.progress("capturing website");
				await capture.promise;
				options.published?.(publication("owner"));
				options.progress("uploading 1/4", {
					completedBytes: 1,
					totalBytes: 4,
					completedObjects: 1,
					totalObjects: 4,
				});
				created.resolve();
				return upload.promise;
			},
			grant: async () => {},
			stop: async () => {},
			origin: () => "https://cloud.test",
		};
		const jobs = createPublicationJobs({ spoolDir, version: "test", services });
		const started = await jobs.start({
			root: project.root,
			project: "Kaffe",
			entry: "menu",
			scenario: "default",
			emails: ["alex@example.com"],
		});
		expect(await jobs.read(project.root, started.id)).not.toHaveProperty("url");
		capture.resolve();
		await created.promise;
		expect(await jobs.read(project.root, started.id)).toMatchObject({
			state: "running",
			phase: "uploading",
			url: "https://paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-beta.onspool.page",
		});
		upload.resolve(publishResult("owner"));
	});

	it("lists the entries of a root that have a link, for this publisher only", async () => {
		const spoolDir = makeTempDir();
		const project = makeProject(spoolDir);
		let publisher: string | undefined = "owner";
		const services: PublicationJobServices = {
			account: async () => {
				if (publisher === undefined) throw new Error("signed out");
				return { publisherId: publisher };
			},
			readiness: async () => ready,
			status: async () => {
				throw new Error("no publication");
			},
			publish: async () => publishResult("owner"),
			grant: async () => {},
			stop: async () => {},
			origin: () => "https://cloud.test",
		};
		const remember = (entry: string, publisherId: string, publicationId?: string) => {
			const identity = associationIdentity(
				spoolDir,
				"https://cloud.test",
				publisherId,
				project.root,
				entry,
				"default",
			);
			const key = createHash("sha256").update(canonicalJson(identity)).digest("hex");
			const directory = join(spoolDir, "publications", "associations");
			mkdirSync(directory, { recursive: true });
			writeFileSync(
				join(directory, `${key}.json`),
				JSON.stringify({
					key,
					identity,
					projectId: "11111111-1111-4111-8111-111111111111",
					title: "Kaffe",
					...(publicationId === undefined ? {} : { publicationId }),
					intent: {
						kind: "create",
						operationId: "22222222-2222-4222-8222-222222222222",
						contentIdentity: "a".repeat(64),
						inputIdentity: "input",
						invitedEmails: ["alex@example.com"],
					},
				}),
			);
		};
		remember("menu", "owner", "publication");
		remember("cart", "owner", "publication-cart");
		remember("draft", "owner");
		remember("rewards", "someone-else", "publication-rewards");
		const jobs = createPublicationJobs({ spoolDir, version: "test", services });
		expect(await jobs.published(project.root, "default")).toEqual(["cart", "menu"]);
		expect(await jobs.published(project.root, "rainy")).toEqual([]);
		publisher = undefined;
		expect(await jobs.published(project.root, "default")).toEqual([]);
	});
});
