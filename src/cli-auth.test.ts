import { execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:https";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cliPath, spool, spoolAsync, tsxBin } from "./cli-test-helpers";
import { makeTempDir } from "./test-helpers";

/** A terminal with a browser in front of it: a desktop session, not one reached over SSH. */
const LOCAL_DESKTOP = { DISPLAY: ":0", SSH_CONNECTION: "", SSH_CLIENT: "", SSH_TTY: "" };

/** spool.page over HTTPS answering the sign-in exchange and the account probe. */
async function signInCloud() {
	const dir = makeTempDir();
	const key = join(dir, "key.pem");
	const certificate = join(dir, "cert.pem");
	execFileSync(
		"openssl",
		["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1"].concat([
			"-keyout",
			key,
			"-out",
			certificate,
		]),
		{ stdio: "ignore" },
	);
	let exchange: Record<string, unknown> | undefined;
	const server = createServer(
		{ key: readFileSync(key), cert: readFileSync(certificate) },
		async (request, response) => {
			response.setHeader("content-type", "application/json");
			if (request.url === "/auth/account/exchange") {
				let raw = "";
				for await (const chunk of request) raw += chunk;
				exchange = JSON.parse(raw) as Record<string, unknown>;
				return response.end(JSON.stringify({ token: "t".repeat(43), expiresAt: 2_000_000_000 }));
			}
			if (request.url === "/auth/account/session")
				return response.end(
					JSON.stringify({
						accountId: "account",
						email: "ada@tidemark.app",
						sessionId: "s",
						expiresAt: 2_000_000_000,
					}),
				);
			response.statusCode = 404;
			response.end();
		},
	);
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("missing address");
	return {
		origin: `https://127.0.0.1:${address.port}`,
		exchange: () => exchange,
		close: () => new Promise<void>((done) => server.close(() => done())),
	};
}

describe("Cloud account CLI", () => {
	it("completes login through the actual CLI without exposing native credentials", { timeout: 20_000 }, async () => {
		const home = makeTempDir();
		const bin = join(home, "bin");
		const key = join(home, "key.pem");
		const certificate = join(home, "cert.pem");
		const stored = join(home, "stored");
		const opened = join(home, "opened");
		const openedBy = join(home, "opened-by");
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
		for (const opener of ["open", "xdg-open", "cmd"]) {
			writeFileSync(
				join(bin, opener),
				`#!/usr/bin/env node
const fs = require("node:fs"); const http = require("node:http");
const start = new URL(process.argv.at(-1)); fs.writeFileSync(${JSON.stringify(opened)}, start.toString());
fs.writeFileSync(${JSON.stringify(openedBy)}, ${JSON.stringify(opener)});
const callback = new URL(start.searchParams.get("return_url")); callback.searchParams.set("code", "c".repeat(43));
http.get(callback);
`,
			);
			chmodSync(join(bin, opener), 0o755);
		}
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
		chmodSync(join(bin, "security"), 0o755);
		let exchange: Record<string, unknown> | undefined;
		const cloud = createServer(
			{ key: readFileSync(key), cert: readFileSync(certificate) },
			async (request, response) => {
				if (request.url === "/auth/account/exchange") {
					let raw = "";
					for await (const chunk of request) raw += chunk;
					exchange = JSON.parse(raw) as Record<string, unknown>;
					expect(request.headers.cookie).toBeUndefined();
					expect(request.headers.origin).toBeUndefined();
					response.setHeader("content-type", "application/json");
					return response.end(JSON.stringify({ token: "t".repeat(43), expiresAt: 2_000_000_000 }));
				}
				if (request.url === "/auth/account/session") {
					response.setHeader("content-type", "application/json");
					return response.end(
						JSON.stringify({
							accountId: "account",
							email: "ada@tidemark.app",
							sessionId: "session",
							expiresAt: 2_000_000_000,
						}),
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
				...LOCAL_DESKTOP,
			});
			expect(result.status).toBe(0);
			expect(result.stdout).toBe("signed in as ada@tidemark.app\n");
			expect(result.stderr).toContain("opening your browser to sign in");
			expect(result.stdout + result.stderr).not.toContain("t".repeat(43));
			const start = new URL(readFileSync(opened, "utf8"));
			expect(readFileSync(openedBy, "utf8")).toBe(
				process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open",
			);
			expect(start.origin).toBe(`https://127.0.0.1:${address.port}`);
			expect(start.pathname).toBe("/sign-in");
			expect(start.searchParams.get("device")).toBeTruthy();
			expect(exchange?.returnUrl).toBe(start.searchParams.get("return_url"));
			expect(exchange?.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/u);
		} finally {
			await new Promise<void>((done, fail) => cloud.close((error) => (error ? fail(error) : done())));
		}
	});

	it("signs in over SSH from the address the browser on another device ends on", { timeout: 20_000 }, async () => {
		const home = makeTempDir();
		const cloud = await signInCloud();
		const openers = fakeOpenersOn(home);
		try {
			const child = spawn(tsxBin, [cliPath, "login"], {
				cwd: home,
				env: {
					...process.env,
					HOME: home,
					SPOOL_DIR: "",
					PATH: `${openers}:${process.env.PATH ?? ""}`,
					SPOOL_CLOUD_ORIGIN: cloud.origin,
					NODE_TLS_REJECT_UNAUTHORIZED: "0",
					NODE_NO_WARNINGS: "1",
					DISPLAY: ":0",
					SSH_CONNECTION: "100.64.0.2 52144 100.64.0.1 22",
				},
			});
			let stdout = "";
			let stderr = "";
			let pasted: URL | undefined;
			child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
			child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
				stderr += chunk;
				const link = /^ {2}(https:\/\/\S+)$/mu.exec(stderr)?.[1];
				if (!link || pasted || !stderr.includes("spool: address: ")) return;
				pasted = new URL(new URL(link).searchParams.get("return_url") ?? "");
				pasted.searchParams.set("code", "c".repeat(43));
				child.stdin.write("this is not it\n");
				child.stdin.write(`${pasted.toString()}\n`);
			});
			const status = await new Promise<number | null>((done) => child.on("close", done));
			expect(stderr).toContain("open this link in a browser on any device and sign in");
			expect(stderr).toContain("that isn't this sign-in's address");
			expect(status).toBe(0);
			expect(stdout).toBe("signed in as ada@tidemark.app\n");
			expect(cloud.exchange()?.code).toBe("c".repeat(43));
			pasted?.searchParams.delete("code");
			expect(cloud.exchange()?.returnUrl).toBe(pasted?.toString());
			expect(existsSync(join(home, "launched"))).toBe(false);
			if (process.platform !== "darwin") {
				const file = join(home, ".spool", "cloud", `${new URL(cloud.origin).host}.session`);
				expect(readFileSync(file, "utf8")).toBe(`${"t".repeat(43)}\n`);
				expect(statSync(file).mode & 0o777).toBe(0o600);
			}
		} finally {
			await cloud.close();
		}
	});

	it.runIf(process.platform !== "darwin")(
		"signs out a machine with no Keychain by forgetting its session file",
		async () => {
			const home = makeTempDir();
			const file = join(home, ".spool", "cloud", "127.0.0.1:9.session");
			mkdirSync(join(home, ".spool", "cloud"), { recursive: true });
			writeFileSync(file, `${"t".repeat(43)}\n`, { mode: 0o600 });
			const result = await spoolAsync(["logout"], home, home, { SPOOL_CLOUD_ORIGIN: "https://127.0.0.1:9" });
			expect(result.stdout).toBe("signed out of this machine\n");
			expect(result.stderr).toContain("remote revocation could not be confirmed");
			expect(existsSync(file)).toBe(false);
		},
	);

	it.runIf(process.platform === "darwin")(
		"signs out outside a project through the instance-specific Keychain entry",
		() => {
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
			expect(result.stdout).toBe("signed out of this machine\n");
			expect(result.stderr).toBe("");
			const invoked = readFileSync(calls, "utf8");
			expect(invoked).toContain("find-generic-password");
			expect(invoked).toContain("delete-generic-password");
			expect(invoked).toContain("spool.device-session.");
			expect(invoked).toContain("spool.publisher-session.");
			expect(invoked).not.toMatch(/token|verifier|code=/u);
		},
	);

	it("tells a running daemon that the account changed", async () => {
		const home = makeTempDir();
		const bin = join(home, "bin");
		mkdirSync(bin);
		writeFileSync(join(bin, "security"), "#!/bin/sh\nexit 44\n");
		chmodSync(join(bin, "security"), 0o755);
		const told: { url: string | undefined; method: string | undefined; token: unknown }[] = [];
		const daemon = createHttpServer((request, response) => {
			told.push({ url: request.url, method: request.method, token: request.headers["x-spool-control"] });
			response.statusCode = 204;
			response.end();
		});
		await new Promise<void>((done) => daemon.listen(0, "127.0.0.1", done));
		const address = daemon.address();
		if (!address || typeof address === "string") throw new Error("missing address");
		mkdirSync(join(home, ".spool"));
		writeFileSync(
			join(home, ".spool", "daemon.json"),
			JSON.stringify({
				pid: process.pid,
				host: "127.0.0.1",
				port: address.port,
				version: "test",
				startedAt: new Date().toISOString(),
				controlToken: "control-secret",
			}),
		);
		try {
			const result = await spoolAsync(["logout"], home, home, { PATH: `${bin}:${process.env.PATH ?? ""}` });
			expect(result.status).toBe(0);
			expect(told).toEqual([{ url: "/api/cloud/account/changed", method: "POST", token: "control-secret" }]);
		} finally {
			await new Promise<void>((done, fail) => daemon.close((error) => (error ? fail(error) : done())));
		}
	});
});

/** Openers that record a launch in `home/launched` instead of opening a browser. */
function fakeOpenersOn(home: string): string {
	const bin = join(home, "openers");
	mkdirSync(bin);
	for (const name of ["open", "xdg-open", "cmd"]) {
		writeFileSync(join(bin, name), `#!/bin/sh\necho "$@" >> ${JSON.stringify(join(home, "launched"))}\n`);
		chmodSync(join(bin, name), 0o755);
	}
	return bin;
}
