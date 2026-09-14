import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { authorizedCloudRequest, cloudOrigin, keychainVault, login, logout, session } from "./cloud-auth";
import { makeTempDir } from "./test-helpers";

const originalPath = process.env.PATH;
afterEach(() => {
	process.env.PATH = originalPath;
});

function memoryVault() {
	let token: string | undefined;
	return {
		read: async () => token,
		write: async (value: string) => {
			token = value;
		},
		delete: async () => {
			token = undefined;
		},
	};
}

async function authServer() {
	let exchange: Record<string, unknown> | undefined;
	let revoked = false;
	const server = createServer(async (request, response) => {
		if (request.url === "/auth/publisher/exchange") {
			let raw = "";
			for await (const chunk of request) raw += chunk;
			exchange = JSON.parse(raw) as Record<string, unknown>;
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify({ token: "t".repeat(43), expiresAt: 2_000_000_000 }));
			return;
		}
		if (request.url === "/auth/publisher/session") {
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify({ authenticated: true, publisherId: "publisher", sessionId: "device" }));
			return;
		}
		if (request.url === "/auth/publisher/logout") {
			revoked = true;
			response.statusCode = 204;
			response.end();
			return;
		}
		response.statusCode = 404;
		response.end();
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("missing address");
	return {
		origin: `http://127.0.0.1:${address.port}`,
		exchange: () => exchange,
		revoked: () => revoked,
		close: () => new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done()))),
	};
}

describe("Cloud publisher authentication", () => {
	it("binds a one-use loopback to state and verifier, stores the token, and returns a live session", async () => {
		const cloud = await authServer();
		const vault = memoryVault();
		let opened = "";
		try {
			const authenticated = await login("/tmp/spool-one", {
				origin: cloud.origin,
				vault,
				open: (url) => {
					opened = url;
					const start = new URL(url);
					const callback = new URL(start.searchParams.get("return_url") ?? "");
					callback.searchParams.set("code", "c".repeat(43));
					void fetch(callback);
				},
			});
			expect(authenticated).toEqual({ publisherId: "publisher", sessionId: "device" });
			const start = new URL(opened);
			expect(start.pathname).toBe("/auth/google/start");
			expect(start.searchParams.get("handoff_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/u);
			const body = cloud.exchange();
			expect(body?.returnUrl).toBe(start.searchParams.get("return_url"));
			expect(body?.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/u);
			expect(await vault.read()).toBe("t".repeat(43));
		} finally {
			await cloud.close();
		}
	});

	it("times out without exchanging or storing authority", async () => {
		const vault = memoryVault();
		await expect(
			login("/tmp/spool-one", { origin: "http://127.0.0.1:9", vault, open: () => {}, timeoutMs: 5 }),
		).rejects.toThrow(/expired/u);
		expect(await vault.read()).toBeUndefined();
	});

	it("closes the handoff and redacts a browser-launch failure", async () => {
		await expect(
			login("/tmp/spool-one", {
				origin: "http://127.0.0.1:9",
				vault: memoryVault(),
				open: () => {
					throw new Error("secret launcher detail");
				},
			}),
		).rejects.toThrow("could not open the system browser");
	});

	it("accepts only a canonical HTTPS authority from machine configuration", () => {
		expect(cloudOrigin({})).toBe("https://spool.page");
		expect(cloudOrigin({ SPOOL_CLOUD_ORIGIN: "https://beta.spool.page" })).toBe("https://beta.spool.page");
		for (const origin of ["http://spool.page", "https://spool.page/path", "https://user@spool.page"])
			expect(() => cloudOrigin({ SPOOL_CLOUD_ORIGIN: origin })).toThrow(/HTTPS origin/u);
	});

	it("clears the local credential even when remote logout is unavailable", async () => {
		const vault = memoryVault();
		await vault.write("t".repeat(43));
		await expect(
			logout("/tmp/spool-one", { vault, fetch: async () => Promise.reject(new Error("offline")) }),
		).resolves.toEqual({ remote: "unavailable" });
		expect(await vault.read()).toBeUndefined();
	});

	it("keeps Keychain entries separate by authority and local instance without putting the token in argv", async () => {
		const root = makeTempDir();
		const bin = join(root, "bin");
		const store = join(root, "store");
		const calls = join(root, "calls");
		mkdirSync(bin);
		mkdirSync(store);
		writeFileSync(
			join(bin, "security"),
			`#!/bin/sh
set -eu
printf '%s\\n' "$*" >> ${JSON.stringify(calls)}
op="$1"; shift
if [ "$op" = "-i" ]; then IFS= read -r line; set -- $line; op="$1"; shift; fi
account=""; service=""; password=""
while [ "$#" -gt 0 ]; do
  case "$1" in -a) account="$2"; shift 2;; -s) service="$2"; shift 2;; -w) if [ "$#" -gt 1 ]; then password="$2"; shift 2; else shift; fi;; -U) shift;; *) shift;; esac
done
file="${store}/$(printf '%s\\0%s' "$service" "$account" | shasum -a 256 | cut -d' ' -f1)"
case "$op" in
  add-generic-password) printf '%s' "$password" > "$file";;
  find-generic-password) [ -f "$file" ] || exit 44; cat "$file";;
  delete-generic-password) [ -f "$file" ] || exit 44; rm "$file";;
esac
`,
		);
		chmodSync(join(bin, "security"), 0o755);
		process.env.PATH = `${bin}:${originalPath ?? ""}`;
		const one = keychainVault("/tmp/checkout-one", "https://spool.page");
		const two = keychainVault("/tmp/checkout-two", "https://spool.page");
		await one.write("a".repeat(43));
		await two.write("b".repeat(43));
		expect(await one.read()).toBe("a".repeat(43));
		expect(await two.read()).toBe("b".repeat(43));
		await one.delete();
		expect(await one.read()).toBeUndefined();
		expect(await two.read()).toBe("b".repeat(43));
		const argv = readFileSync(calls, "utf8");
		expect(argv).not.toContain("a".repeat(43));
		expect(argv).not.toContain("b".repeat(43));
	});

	it("reports revoked sessions without disturbing local work", async () => {
		const vault = memoryVault();
		await vault.write("t".repeat(43));
		await expect(
			session("/tmp/spool-one", {
				vault,
				fetch: async () => new Response('{"error":"publisher_session_required"}', { status: 401 }),
			}),
		).rejects.toThrow(/expired or was revoked/u);
	});

	it("does not expose fetch failures from a session probe", async () => {
		const vault = memoryVault();
		await vault.write("t".repeat(43));
		await expect(
			session("/tmp/spool-one", {
				vault,
				fetch: async () => Promise.reject(new Error("token ttt secret host detail")),
			}),
		).rejects.toThrow("spool.page could not be reached; local spool is still available");
	});

	it("pins authenticated API requests against redirects and bounds caller signals", async () => {
		const held = new AbortController();
		await authorizedCloudRequest("/tmp/spool-one", "/api/publications", { signal: held.signal }, {
			origin: "https://cloud.test",
			vault: { read: async () => "t".repeat(43), write: async () => {}, delete: async () => {} },
			fetch: async (input, init) => {
				expect(String(input)).toBe("https://cloud.test/api/publications");
				expect(init?.redirect).toBe("error");
				expect(init?.signal).not.toBe(held.signal);
				expect(init?.signal).toBeInstanceOf(AbortSignal);
				return Response.json({});
			},
		});
	});
});
