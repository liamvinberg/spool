import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { join } from "node:path";
import { expect, it } from "vitest";
import { spoolAsync } from "./cli-test-helpers";
import { makeProject, makeTempDir, writeFrame } from "./test-helpers";

it("publishes through the actual CLI and resumes without putting credentials or paths on the wire", {
	timeout: 30_000,
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
	let wire = "";
	const publication = () => ({
		id: "publication",
		projectId,
		ownerId: "publisher",
		title: "start",
		hostname: "beta-site.onspool.page",
		url: "https://beta-site.onspool.page",
		entry: "start",
		scenario: "default",
		state: state === "succeeded" ? "active" : "staging",
		revision: state === "succeeded" ? 1 : 0,
		accessGeneration: 1,
		currentVersion: state === "succeeded" ? { id: "version", contentIdentity } : null,
		invitedEmails: ["Alex@example.com"],
		createdAt: 1,
		updatedAt: 1,
	});
	const result = () => ({
		publication: publication(),
		operation: {
			id: operationId,
			publicationId: "publication",
			kind: "create",
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
				return response.end(JSON.stringify(result()));
			}
			if (request.url === `/api/publication-operations/${operationId}`)
				return response.end(JSON.stringify(result()));
			if (request.url === "/api/publications")
				return response.end(JSON.stringify({ publications: [publication()], nextCursor: null }));
			if (request.url === "/api/publications/publication")
				return response.end(JSON.stringify({ publication: publication() }));
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
		const first = await spoolAsync(["cloud", "publish", "start", "--invite", "Alex@Example.COM"], home, root, env);
		expect(first.status, first.stderr).toBe(0);
		expect(JSON.parse(first.stdout)).toMatchObject({
			publication: { url: "https://beta-site.onspool.page", invitedEmails: ["Alex@example.com"] },
			operation: { id: operationId, state: "succeeded" },
			localSource: "current",
		});
		expect(first.stderr).toContain("capturing website");
		expect(first.stderr).toContain("activating website");
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
