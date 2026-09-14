import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spool, spoolAsync } from "./cli-test-helpers";
import { makeTempDir } from "./test-helpers";

describe("Cloud account CLI", () => {
	it("completes login through the actual CLI without exposing native credentials", async () => {
		const home = makeTempDir();
		const bin = join(home, "bin");
		const key = join(home, "key.pem");
		const certificate = join(home, "cert.pem");
		const stored = join(home, "stored");
		const opened = join(home, "opened");
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
			join(bin, "open"),
			`#!/usr/bin/env node
const fs = require("node:fs"); const http = require("node:http");
const start = new URL(process.argv[2]); fs.writeFileSync(${JSON.stringify(opened)}, start.toString());
const callback = new URL(start.searchParams.get("return_url")); callback.searchParams.set("code", "c".repeat(43));
http.get(callback);
`,
		);
		writeFileSync(
			join(bin, "security"),
			`#!/bin/sh
set -eu
op="$1"; shift
if [ "$op" = "-i" ]; then IFS= read -r line; set -- $line; op="$1"; shift; fi
password=""
while [ "$#" -gt 0 ]; do case "$1" in -w) if [ "$#" -gt 1 ]; then password="$2"; shift 2; else shift; fi;; -a|-s) shift 2;; -U) shift;; *) shift;; esac; done
case "$op" in add-generic-password) printf '%s' "$password" > ${JSON.stringify(stored)};; find-generic-password) [ -f ${JSON.stringify(stored)} ] || exit 44; cat ${JSON.stringify(stored)};; delete-generic-password) rm -f ${JSON.stringify(stored)};; esac
`,
		);
		chmodSync(join(bin, "open"), 0o755);
		chmodSync(join(bin, "security"), 0o755);
		let exchange: Record<string, unknown> | undefined;
		const cloud = createServer(
			{ key: readFileSync(key), cert: readFileSync(certificate) },
			async (request, response) => {
				if (request.url === "/auth/publisher/exchange") {
					let raw = "";
					for await (const chunk of request) raw += chunk;
					exchange = JSON.parse(raw) as Record<string, unknown>;
					expect(request.headers.cookie).toBeUndefined();
					expect(request.headers.origin).toBeUndefined();
					response.setHeader("content-type", "application/json");
					return response.end(JSON.stringify({ token: "t".repeat(43), expiresAt: 2_000_000_000 }));
				}
				if (request.url === "/auth/publisher/session") {
					response.setHeader("content-type", "application/json");
					return response.end(
						JSON.stringify({ authenticated: true, publisherId: "publisher", sessionId: "session" }),
					);
				}
				response.statusCode = 404;
				response.end();
			},
		);
		await new Promise<void>((done) => cloud.listen(0, "127.0.0.1", done));
		const address = cloud.address();
		if (!address || typeof address === "string") throw new Error("missing address");
		try {
			const result = await spoolAsync(["login"], home, home, {
				PATH: `${bin}:${process.env.PATH ?? ""}`,
				SPOOL_CLOUD_ORIGIN: `https://127.0.0.1:${address.port}`,
				NODE_TLS_REJECT_UNAUTHORIZED: "0",
			});
			expect(result.status).toBe(0);
			expect(result.stdout).toBe("signed in to spool Cloud\n");
			expect(result.stderr).toContain("opening your browser to sign in");
			expect(result.stdout + result.stderr).not.toContain("t".repeat(43));
			const start = new URL(readFileSync(opened, "utf8"));
			expect(start.origin).toBe(`https://127.0.0.1:${address.port}`);
			expect(exchange?.returnUrl).toBe(start.searchParams.get("return_url"));
			expect(exchange?.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/u);
		} finally {
			await new Promise<void>((done, fail) => cloud.close((error) => (error ? fail(error) : done())));
		}
	});

	it("signs out outside a project through the instance-specific Keychain entry", () => {
		const home = makeTempDir();
		const bin = join(home, "bin");
		const calls = join(home, "security-calls");
		mkdirSync(bin);
		writeFileSync(
			join(bin, "security"),
			`#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(calls)}
case "$1" in find-generic-password|delete-generic-password) exit 44;; esac
`,
		);
		chmodSync(join(bin, "security"), 0o755);
		const result = spool(["logout"], home, home, { PATH: `${bin}:${process.env.PATH ?? ""}` });
		expect(result.status).toBe(0);
		expect(result.stdout).toBe("signed out of spool Cloud\n");
		expect(result.stderr).toBe("");
		const invoked = readFileSync(calls, "utf8");
		expect(invoked).toContain("find-generic-password");
		expect(invoked).toContain("delete-generic-password");
		expect(invoked).toContain("spool.publisher-session.");
		expect(invoked).not.toMatch(/token|verifier|code=/u);
	});
});
