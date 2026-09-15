import { execFileSync, spawn } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cliPath, spoolAsync, tsxBin } from "./cli-test-helpers";
import { makeProject, makeTempDir, writeFrame } from "./test-helpers";

it("publishes through the actual CLI and resumes without putting credentials or paths on the wire", {
	timeout: 60_000,
}, async () => {
	const home = makeTempDir();
	const spoolDir = join(home, "state");
	const bin = join(home, "bin");
	const key = join(home, "key.pem");
	const certificate = join(home, "cert.pem");
	const calls = join(home, "security-calls");
	mkdirSync(spoolDir);
	mkdirSync(bin);
	execFileSync(
		"openssl",
		[
			"req",
			"-x509",
			"-newkey",
			"rsa:2048",
			"-nodes",
			"-days",
			"1",
			"-subj",
			"/CN=127.0.0.1",
			"-keyout",
			key,
			"-out",
			certificate,
		],
		{ stdio: "ignore" },
	);
	writeFileSync(
		join(bin, "security"),
		`#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(calls)}\n[ "$1" = "find-generic-password" ] || exit 44\nprintf '%s' '${"t".repeat(43)}'\n`,
	);
	chmodSync(join(bin, "security"), 0o755);
	const { root } = makeProject(spoolDir);
	writeFrame(root, "start", "export default () => <h1>Published</h1>");
	let operationId = "";
	let projectId = "";
	let contentIdentity = "";
	let missing: number[] = [];
	let state: "uploading" | "sealed" | "succeeded" = "uploading";
	let operationKind: "create" | "update" | "stop" = "create";
	let revision = 0;
	let publicationState: "staging" | "active" | "stopped" = "staging";
	let accessGeneration = 1;
	let loseNextStop = false;
	let stopChanged = false;
	let wire = "";
	let invitedEmails = ["Alex@example.com"];
	let pauseUpload = true;
	let pauseReady: () => void = () => {};
	const paused = new Promise<void>((resolve) => {
		pauseReady = resolve;
	});
	let abandonUpload: () => void = () => {};
	const grantOperations: string[] = [];
	let failGrantTransport = false;
	let failedGrantRequests = 0;
	const publication = () => ({
		id: "publication",
		projectId,
		ownerId: "publisher",
		title: "start",
		hostname: "paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-beta.onspool.page",
		url: "https://paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-beta.onspool.page",
		entry: "start",
		scenario: "default",
		state: publicationState,
		revision,
		accessGeneration,
		currentVersion: state === "succeeded" ? { id: "version", contentIdentity } : null,
		invitedEmails,
		createdAt: 1,
		updatedAt: 1,
	});
	const result = () => ({
		publication: publication(),
		operation: {
			id: operationId,
			publicationId: "publication",
			kind: operationKind,
			state,
			contentIdentity,
			expectedRevision: 0,
			expectedAccessGeneration: 1,
			createdAt: 1,
			expiresAt: 2_000_000_000,
			missingObjectIndices: missing,
			result: state === "succeeded" ? { publication: publication(), versionId: "version" } : null,
			error: null,
		},
	});
	const stopResult = (changed: boolean) => {
		const stopped = publication();
		return {
			publication: stopped,
			operation: {
				id: operationId,
				publicationId: "publication",
				kind: "stop" as const,
				state: "succeeded" as const,
				createdAt: 1,
				result: { publication: stopped, changed },
				error: null,
			},
		};
	};
	const server = createServer(
		{ key: readFileSync(key), cert: readFileSync(certificate) },
		async (request, response) => {
			let raw = Buffer.alloc(0);
			for await (const chunk of request) raw = Buffer.concat([raw, Buffer.from(chunk)]);
			wire += `${request.method} ${request.url}\n${raw.byteLength < 5_000_000 ? raw.toString("utf8") : "<object>"}\n`;
			response.setHeader("content-type", "application/json");
			if (request.url === "/auth/publisher/session")
				return response.end(
					JSON.stringify({ authenticated: true, publisherId: "publisher", sessionId: "session" }),
				);
			if (request.url === "/api/publications" && request.method === "POST") {
				operationKind = "create";
				const body = JSON.parse(raw.toString("utf8")) as {
					projectId: string;
					manifest: { contentIdentity: string; objects: unknown[] };
				};
				projectId = body.projectId;
				contentIdentity = body.manifest.contentIdentity;
				operationId = String(request.headers["idempotency-key"]);
				missing = body.manifest.objects.map((_, index) => index);
				response.statusCode = 201;
				return response.end(JSON.stringify(result()));
			}
			if (request.method === "PUT" && request.url?.includes("/objects/") && pauseUpload) {
				pauseUpload = false;
				abandonUpload = () => response.destroy();
				pauseReady();
				return;
			}
			if (request.url === "/api/publications/publication/operations" && request.method === "POST") {
				operationKind = "update";
				const body = JSON.parse(raw.toString("utf8")) as {
					manifest: { contentIdentity: string; objects: unknown[] };
					invitedEmails?: string[];
				};
				invitedEmails = [...new Set([...invitedEmails, ...(body.invitedEmails ?? [])])];
				contentIdentity = body.manifest.contentIdentity;
				operationId = String(request.headers["idempotency-key"]);
				missing = body.manifest.objects.map((_, index) => index);
				state = "uploading";
				response.statusCode = 201;
				return response.end(JSON.stringify(result()));
			}
			if (/\/objects\/\d+$/.test(request.url ?? "")) {
				const index = Number(request.url?.split("/").at(-1));
				missing = missing.filter((value) => value !== index);
				return response.end(JSON.stringify({ operationId, objectIndex: index, state: "verified" }));
			}
			if (request.url?.endsWith("/seal")) {
				state = "sealed";
				return response.end(JSON.stringify(result()));
			}
			if (request.url?.endsWith("/activate")) {
				state = "succeeded";
				publicationState = "active";
				revision++;
				return response.end(JSON.stringify(result()));
			}
			if (request.url === "/api/publications/publication/stop" && request.method === "POST") {
				operationKind = "stop";
				operationId = String(request.headers["idempotency-key"]);
				const changed = publicationState !== "stopped";
				stopChanged = changed;
				publicationState = "stopped";
				accessGeneration++;
				const stopped = stopResult(changed);
				if (loseNextStop) {
					loseNextStop = false;
					request.socket.destroy();
					return;
				}
				return response.end(JSON.stringify(stopped));
			}
			if (request.url === `/api/publication-operations/${operationId}`)
				return response.end(JSON.stringify(operationKind === "stop" ? stopResult(stopChanged) : result()));
			if (request.url === "/api/publications")
				return response.end(
					JSON.stringify({ publications: [publication()], operationSummaries: [], nextCursor: null }),
				);
			if (request.url === "/api/publications/publication")
				return response.end(JSON.stringify({ publication: publication() }));
			if (request.url?.startsWith("/api/publications/publication/operations"))
				return response.end(JSON.stringify({ operations: [], nextCursor: null }));
			if (
				/^\/api\/publications\/publication\/(invite|revoke)$/u.test(request.url ?? "") &&
				request.method === "POST"
			) {
				const id = String(request.headers["idempotency-key"]);
				grantOperations.push(id);
				if (failGrantTransport) {
					failedGrantRequests++;
					request.socket.destroy();
					return;
				}
				const kind = request.url?.endsWith("/invite") ? "invite" : "revoke";
				const grant = {
					email: "Alex+viewer@example.com",
					active: kind === "invite",
					generation: kind === "invite" ? 2 : 3,
				};
				return response.end(
					JSON.stringify({
						operation: {
							id,
							kind,
							state: "succeeded",
							result: { publicationId: "publication", grant, changed: true },
						},
						currentGrant: grant,
					}),
				);
			}
			response.statusCode = 404;
			response.end(JSON.stringify({ error: "not_found", message: "not found", retryable: false }));
		},
	);
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("missing address");
	const env = {
		PATH: `${bin}:${process.env.PATH ?? ""}`,
		SPOOL_DIR: spoolDir,
		SPOOL_CLOUD_ORIGIN: `https://127.0.0.1:${address.port}`,
		NODE_TLS_REJECT_UNAUTHORIZED: "0",
	};
	try {
		const dying = spawn(tsxBin, [cliPath, "cloud", "publish", "start", "--invite", "Alex@Example.COM"], {
			cwd: root,
			detached: true,
			env: { ...process.env, HOME: home, ...env },
			stdio: ["ignore", "ignore", "pipe"],
		});
		dying.stderr.resume();
		const died = new Promise<void>((done, fail) => {
			dying.on("error", fail);
			dying.on("close", () => done());
		});
		await paused;
		if (dying.pid === undefined) throw Error("missing child pid");
		process.kill(-dying.pid, "SIGKILL");
		await died;
		abandonUpload();
		const heldOperation = operationId;
		const [first, peer] = await Promise.all([
			spoolAsync(["cloud", "publish", "start"], home, root, env),
			spoolAsync(["cloud", "publish", "start"], home, root, env),
		]);
		expect(peer.status, peer.stderr).toBe(0);
		expect(JSON.parse(peer.stdout).operation.id).toBe(heldOperation);
		expect(JSON.parse(first.stdout).operation.id).toBe(heldOperation);
		expect(first.status, first.stderr).toBe(0);
		expect(JSON.parse(first.stdout)).toMatchObject({
			publication: {
				url: "https://paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-beta.onspool.page",
				invitedEmails: ["Alex@example.com"],
			},
			operation: { id: operationId, state: "succeeded" },
			localSource: "current",
		});
		expect(first.stderr).toContain("capturing website");
		expect(first.stderr + peer.stderr).toContain("activating website");
		const resumed = await spoolAsync(["cloud", "publish", "start"], home, root, env);
		expect(resumed.status, resumed.stderr).toBe(0);
		expect(JSON.parse(resumed.stdout)).toMatchObject({ operation: { id: operationId, state: "succeeded" } });
		const status = await spoolAsync(["cloud", "status", "publication"], home, root, env);
		expect(status.status, status.stderr).toBe(0);
		expect(JSON.parse(status.stdout)).toMatchObject({
			publication: { id: "publication" },
			operation: { id: operationId, state: "succeeded" },
			localSource: "current",
		});
		writeFrame(root, "start", "export default () => <h1>Updated</h1>");
		const [updated, updatePeer] = await Promise.all([
			spoolAsync(["cloud", "publish", "start", "--invite", "New@Example.COM"], home, root, env),
			spoolAsync(["cloud", "publish", "start", "--invite", "New@Example.COM"], home, root, env),
		]);
		expect(updatePeer.status, updatePeer.stderr).toBe(0);
		expect(JSON.parse(updatePeer.stdout).operation.id).toBe(JSON.parse(updated.stdout).operation.id);
		expect(updated.status, updated.stderr).toBe(0);
		expect(JSON.parse(updated.stdout)).toMatchObject({
			publication: { id: "publication", revision: 2 },
			operation: { kind: "update", state: "succeeded" },
			localSource: "current",
		});
		expect(wire).toContain('"invitedEmails":["New@example.com"]');
		const stopped = await spoolAsync(["cloud", "stop", "publication"], home, root, env);
		expect(stopped.status, stopped.stderr).toBe(0);
		expect(JSON.parse(stopped.stdout)).toMatchObject({
			publication: { id: "publication", state: "stopped" },
			operation: { kind: "stop", state: "succeeded", result: { changed: true } },
		});
		loseNextStop = true;
		const recoveredStop = await spoolAsync(["cloud", "stop", "publication"], home, root, env);
		expect(recoveredStop.status, recoveredStop.stderr).toBe(0);
		expect(JSON.parse(recoveredStop.stdout)).toMatchObject({
			publication: { state: "stopped", accessGeneration: 3 },
			operation: { kind: "stop", result: { changed: false } },
		});
		const parallelStops = await Promise.all([
			spoolAsync(["cloud", "stop", "publication"], home, root, env),
			spoolAsync(["cloud", "stop", "publication"], home, root, env),
		]);
		for (const stopped of parallelStops) expect(stopped.status, stopped.stderr).toBe(0);
		const stopOutcomes = parallelStops.map((stopped) => JSON.parse(stopped.stdout));
		expect(new Set(stopOutcomes.map((outcome) => outcome.operation.id)).size).toBe(2);
		expect(stopOutcomes.map((outcome) => outcome.publication.accessGeneration).sort()).toEqual([4, 5]);
		const invited = await spoolAsync(
			["cloud", "invite", "publication", " Alex+viewer@Example.COM "],
			home,
			root,
			env,
		);
		expect(invited.status, invited.stderr).toBe(0);
		expect(JSON.parse(invited.stdout)).toMatchObject({
			operation: { id: grantOperations[0], kind: "invite", result: { changed: true } },
			currentGrant: { email: "Alex+viewer@example.com", active: true },
		});
		const revoked = await spoolAsync(["cloud", "revoke", "publication", "Alex+viewer@example.com"], home, root, env);
		expect(revoked.status, revoked.stderr).toBe(0);
		expect(JSON.parse(revoked.stdout)).toMatchObject({
			operation: { id: grantOperations[1], kind: "revoke", result: { changed: true } },
			currentGrant: { active: false, generation: 3 },
		});
		failGrantTransport = true;
		const interrupted = await spoolAsync(["cloud", "invite", "publication", "other@example.com"], home, root, env);
		expect(interrupted.status).toBe(1);
		expect(JSON.parse(interrupted.stdout)).toMatchObject({
			error: {
				code: "transport_interrupted",
				retryable: true,
				operationId: grantOperations[2],
			},
		});
		expect(failedGrantRequests).toBe(3);
		expect(new Set(grantOperations.slice(2)).size).toBe(1);
		expect(wire).not.toContain(root);
		expect(wire).not.toContain(spoolDir);
		expect(wire).not.toContain("t".repeat(43));
		expect(readFileSync(calls, "utf8")).not.toContain("t".repeat(43));
		writeFrame(root, "other", "export default () => <h1>Other</h1>");
		const refused = await spoolAsync(["cloud", "publish", "other"], home, root, env);
		expect(refused.status).toBe(1);
		expect(JSON.parse(refused.stdout)).toEqual({
			error: {
				code: "client_error",
				message: "add between 1 and 100 valid recipient email addresses with --invite",
				retryable: false,
			},
		});
	} finally {
		await new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done())));
	}
});
