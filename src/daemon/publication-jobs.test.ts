import { describe, expect, it, vi } from "vitest";
import type { PublishResult } from "../cloud-publication";
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
		hostname: "p.test.beta.onspool.page",
		url: "https://p.test.beta.onspool.page",
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
});
