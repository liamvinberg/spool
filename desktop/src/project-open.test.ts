import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importProjectFile, ProjectOpenQueue } from "./project-open";

test("Finder documents wait for startup, import serially, and continue after a bad file", async () => {
	const seen: string[] = [];
	let release: (() => void) | undefined;
	const blocked = new Promise<void>((resolve) => {
		release = resolve;
	});
	let done: (() => void) | undefined;
	const finished = new Promise<void>((resolve) => {
		done = resolve;
	});
	const queue = new ProjectOpenQueue(
		async (path) => {
			seen.push(path);
			if (path === "cold.spool") await blocked;
			if (path === "bad.spool") throw new Error("invalid archive");
			if (path === "warm.spool") done?.();
		},
		async (path, error) => {
			assert.equal(path, "bad.spool");
			assert.match(String(error), /invalid archive/);
			seen.push("error shown");
		},
	);
	queue.add("cold.spool");
	queue.add("bad.spool");
	assert.deepEqual(seen, []);
	queue.start();
	queue.add("warm.spool");
	assert.deepEqual(seen, ["cold.spool"]);
	release?.();
	await finished;
	assert.deepEqual(seen, ["cold.spool", "bad.spool", "error shown", "warm.spool"]);
});

test("native opening uploads archive bytes with authentication and opens the imported session", async () => {
	const directory = mkdtempSync(join(tmpdir(), "spool-project-open-"));
	const path = join(directory, "Example.SPOOL");
	writeFileSync(path, "archive bytes");
	const requests: { path: string; body: string; token: string | string[] | undefined }[] = [];
	let invalid = false;
	const server = createServer(async (request, response) => {
		const chunks: Buffer[] = [];
		for await (const chunk of request) chunks.push(Buffer.from(chunk));
		requests.push({
			path: request.url ?? "",
			body: Buffer.concat(chunks).toString(),
			token: request.headers["x-spool-control"],
		});
		if (request.url?.startsWith("/api/projects/import?transfer=")) {
			assert.equal(request.method, "POST");
			assert.equal(request.headers["content-type"], "application/zip");
			response.writeHead(invalid ? 400 : 200, { "Content-Type": "application/json" });
			response.end(
				JSON.stringify(
					invalid ? { error: "The archive is corrupt." } : { root: "/projects/example 2", name: "example 2" },
				),
			);
		} else {
			assert.equal(request.method, "PUT");
			response.writeHead(204);
			response.end();
		}
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const address = server.address();
		assert(address !== null && typeof address !== "string");
		const origin = `http://127.0.0.1:${address.port}`;
		assert.equal(await importProjectFile(path, origin, "credential"), `${origin}/p/example%202`);
		assert.equal(requests.length, 2);
		assert.equal(requests[0]?.body, "archive bytes");
		assert.equal(requests[1]?.path, "/api/session");
		assert.deepEqual(JSON.parse(requests[1]?.body ?? ""), { root: "/projects/example 2", open: true });
		assert(requests.every((request) => request.token === "credential"));
		invalid = true;
		await assert.rejects(importProjectFile(path, origin, "credential"), /The archive is corrupt/);
		assert.equal(requests.length, 3);
		await assert.rejects(importProjectFile(directory, origin, "credential"), /Choose a .spool/);
		await assert.rejects(importProjectFile(join(directory, "missing.spool"), origin, "credential"), /ENOENT/);
		assert.equal(requests.length, 3);
	} finally {
		server.close();
		rmSync(directory, { recursive: true, force: true });
	}
});
