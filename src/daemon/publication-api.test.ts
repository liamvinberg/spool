import { expect, it, onTestFinished, vi } from "vitest";
import type { PublishResult } from "../cloud-publication";
import { makeProject, makeTempDir, writeFrame } from "../test-helpers";
import { createDaemonApp } from "./app";
import type { PublicationJobServices } from "./publication-jobs";
import { RENDER_HOST } from "./security";

function publicationResult(ownerId: string): PublishResult {
	const publication = {
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
	return {
		publisherId: ownerId,
		publication,
		operation: {
			id: "operation",
			publicationId: publication.id,
			kind: "create",
			state: "succeeded",
			contentIdentity: "identity",
			expectedRevision: 0,
			expectedAccessGeneration: 1,
			createdAt: 1,
			expiresAt: 2,
			missingObjectIndices: [],
			result: { publication, versionId: "version" },
			error: null,
		},
		localSource: "current",
	};
}

it("keeps publication status and jobs behind control origin and current Cloud ownership", async () => {
	const spoolDir = makeTempDir();
	const project = makeProject(spoolDir);
	writeFrame(project.root, "menu", "export default function Menu() { return <main>menu</main> }");
	let publisher: string | undefined = "owner-a";
	const pending: (() => void)[] = [];
	const services: PublicationJobServices = {
		account: async () => {
			if (publisher === undefined) throw new Error("signed out");
			return { publisherId: publisher };
		},
		readiness: async (_root, entry) => ({ entry, ok: true, included: [entry], outgoing: [], diagnostics: [] }),
		status: async () => {
			throw new Error("no publication");
		},
		publish: vi.fn(() => {
			const owner = publisher ?? "none";
			return new Promise<PublishResult>((resolve) => pending.push(() => resolve(publicationResult(owner))));
		}),
		grant: async () => {},
		stop: async () => {},
		origin: () => "https://cloud.test",
	};
	const daemon = createDaemonApp({
		spoolDir,
		version: "test",
		controlHost: "localhost",
		controlToken: "control-secret",
		publicationServices: services,
	});
	onTestFinished(() => daemon.close());
	const path = `/api/p/${encodeURIComponent(project.name)}/publication`;
	const query = "?entry=menu&scenario=default";
	const control = { "x-spool-control": "control-secret", origin: "http://localhost" };
	const mutations = [
		{
			path: `${path}/grants`,
			body: { entry: "menu", scenario: "default", email: "alex@example.com", kind: "revoke" },
		},
		{ path: `${path}/stop`, body: { entry: "menu", scenario: "default" } },
	];

	expect((await daemon.app.request(`http://localhost${path}${query}`)).status).toBe(401);
	for (const mutation of mutations) {
		expect(
			(
				await daemon.app.request(`http://localhost${mutation.path}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(mutation.body),
				})
			).status,
		).toBe(401);
	}
	expect(
		(
			await daemon.app.request(`http://localhost${path}${query}`, {
				headers: { "x-spool-project": daemon.projectCapability(project.root) },
			})
		).status,
	).toBe(401);
	for (const mutation of mutations) {
		expect(
			(
				await daemon.app.request(`http://localhost${mutation.path}`, {
					method: "POST",
					headers: {
						"x-spool-project": daemon.projectCapability(project.root),
						"content-type": "application/json",
					},
					body: JSON.stringify(mutation.body),
				})
			).status,
		).toBe(401);
	}
	expect(
		(
			await daemon.app.request(`http://${RENDER_HOST}${path}${query}`, {
				headers: { "x-spool-control": "control-secret" },
			})
		).status,
	).toBe(404);
	for (const origin of ["null", "http://sibling.localhost", "https://attacker.example"]) {
		expect(
			(
				await daemon.app.request(`http://localhost${path}${query}`, {
					headers: { "x-spool-control": "control-secret", origin },
				})
			).status,
		).toBe(403);
		for (const mutation of mutations) {
			expect(
				(
					await daemon.app.request(`http://localhost${mutation.path}`, {
						method: "POST",
						headers: { "x-spool-control": "control-secret", origin, "content-type": "application/json" },
						body: JSON.stringify(mutation.body),
					})
				).status,
			).toBe(403);
		}
	}
	const model = await daemon.app.request(`http://localhost${path}${query}`, { headers: control });
	expect(await model.json()).toMatchObject({ available: true, entry: "menu", included: ["menu"] });

	const create = () =>
		daemon.app.request(`http://localhost${path}/jobs`, {
			method: "POST",
			headers: { ...control, "content-type": "application/json" },
			body: JSON.stringify({ entry: "menu", scenario: "default", email: "alex@example.com" }),
		});
	expect(
		(
			await daemon.app.request(`http://localhost${path}/jobs`, {
				method: "POST",
				headers: { ...control, "content-type": "application/json" },
				body: JSON.stringify({ entry: "menu", scenario: "default", email: "not-an-email" }),
			})
		).status,
	).toBe(400);
	const first = (await (await create()).json()) as { id: string };
	expect((await (await create()).json()).id).toBe(first.id);

	publisher = "owner-b";
	expect((await daemon.app.request(`http://localhost${path}/jobs/${first.id}`, { headers: control })).status).toBe(
		404,
	);
	expect(
		await (await daemon.app.request(`http://localhost${path}${query}`, { headers: control })).json(),
	).not.toHaveProperty("job");
	expect(((await (await create()).json()) as { id: string }).id).not.toBe(first.id);

	publisher = undefined;
	expect(
		await (await daemon.app.request(`http://localhost${path}${query}`, { headers: control })).json(),
	).toMatchObject({
		available: false,
	});
	expect((await daemon.app.request(`http://localhost${path}/jobs/${first.id}`, { headers: control })).status).toBe(
		404,
	);
	for (const finish of pending) finish();
});
