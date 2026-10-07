import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	account,
	authorizedCloudRequest,
	CloudSignedOut,
	cloudOrigin,
	fileVault,
	keychainVault,
	login,
	logout,
	pastedCode,
	session,
} from "./cloud-auth";
import { makeTempDir } from "./test-helpers";

const originalPath = process.env.PATH;
const originalCloudOrigin = process.env.SPOOL_CLOUD_ORIGIN;
afterEach(() => {
	process.env.PATH = originalPath;
	if (originalCloudOrigin === undefined) delete process.env.SPOOL_CLOUD_ORIGIN;
	else process.env.SPOOL_CLOUD_ORIGIN = originalCloudOrigin;
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

const ACCOUNT = { accountId: "account", email: "ada@tidemark.app", sessionId: "device", expiresAt: 2_000_000_000 };

async function authServer() {
	let exchange: Record<string, unknown> | undefined;
	let revoked = false;
	const server = createServer(async (request, response) => {
		if (request.url === "/auth/account/exchange") {
			let raw = "";
			for await (const chunk of request) raw += chunk;
			exchange = JSON.parse(raw) as Record<string, unknown>;
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify({ token: "t".repeat(43), expiresAt: 2_000_000_000 }));
			return;
		}
		if (request.url === "/auth/account/session") {
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify({ ...ACCOUNT, kind: "device" }));
			return;
		}
		if (request.url === "/auth/account/logout") {
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

describe("Cloud account sign-in", () => {
	it("binds a one-use loopback to state and verifier, stores the device session, and returns the account", async () => {
		const cloud = await authServer();
		const vault = memoryVault();
		let opened = "";
		let landed: Response | undefined;
		try {
			const authenticated = await login("/tmp/spool-one", {
				origin: cloud.origin,
				vault,
				device: "Ada’s MacBook Pro",
				open: (url) => {
					opened = url;
					const start = new URL(url);
					const callback = new URL(start.searchParams.get("return_url") ?? "");
					callback.searchParams.set("code", "c".repeat(43));
					void fetch(callback, { redirect: "manual" }).then((response) => {
						landed = response;
					});
				},
			});
			expect(authenticated).toEqual(ACCOUNT);
			const start = new URL(opened);
			expect(start.pathname).toBe("/sign-in");
			expect(start.searchParams.get("device")).toBe("Ada’s MacBook Pro");
			expect(start.searchParams.get("handoff_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/u);
			expect(landed?.status).toBe(303);
			expect(landed?.headers.get("location")).toBe(`${cloud.origin}/sign-in/done?device=Ada%E2%80%99s+MacBook+Pro`);
			const body = cloud.exchange();
			expect(body?.returnUrl).toBe(start.searchParams.get("return_url"));
			expect(body?.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/u);
			expect(await vault.read()).toBe("t".repeat(43));
		} finally {
			await cloud.close();
		}
	});

	it("finishes the same handoff from the address a browser on another machine pasted back", async () => {
		const cloud = await authServer();
		const vault = memoryVault();
		let callback: URL | undefined;
		const asked: boolean[] = [];
		try {
			const authenticated = await login("/tmp/spool-one", {
				origin: cloud.origin,
				vault,
				device: "devobee",
				open: (url) => {
					callback = new URL(new URL(url).searchParams.get("return_url") ?? "");
				},
				paste: async (again) => {
					asked.push(again);
					if (!callback) throw new Error("asked before the link was shown");
					if (asked.length === 1) return "not an address";
					const other = new URL(callback);
					other.searchParams.set("state", "s".repeat(32));
					other.searchParams.set("code", "x".repeat(43));
					if (asked.length === 2) return other.toString();
					// what a phone's address bar shows: no scheme, the code on the end
					const landed = new URL(callback);
					landed.searchParams.set("code", "c".repeat(43));
					return `  ${landed.toString().replace(/^http:\/\//u, "")}\n`;
				},
			});
			expect(authenticated).toEqual(ACCOUNT);
			expect(asked).toEqual([false, true, true]);
			expect(cloud.exchange()?.returnUrl).toBe(callback?.toString());
			expect(cloud.exchange()?.code).toBe("c".repeat(43));
			expect(await vault.read()).toBe("t".repeat(43));
		} finally {
			await cloud.close();
		}
	});

	it("stops asking for an address once the browser's redirect arrives", async () => {
		const cloud = await authServer();
		let stopped: AbortSignal | undefined;
		try {
			await login("/tmp/spool-one", {
				origin: cloud.origin,
				vault: memoryVault(),
				device: "devobee",
				open: (url) => {
					const callback = new URL(new URL(url).searchParams.get("return_url") ?? "");
					callback.searchParams.set("code", "c".repeat(43));
					setTimeout(() => void fetch(callback, { redirect: "manual" }), 10);
				},
				paste: (_again, signal) => {
					stopped = signal;
					return new Promise((done) => signal.addEventListener("abort", () => done(undefined)));
				},
			});
			expect(stopped?.aborted).toBe(true);
		} finally {
			await cloud.close();
		}
	});

	it("reads a pasted code only from an address carrying this sign-in's state", () => {
		const state = "s".repeat(32);
		const code = "c".repeat(43);
		expect(pastedCode(`http://127.0.0.1:5000/callback?state=${state}&code=${code}`, state)).toBe(code);
		expect(pastedCode(`127.0.0.1:5000/callback?state=${state}&code=${code}`, state)).toBe(code);
		expect(pastedCode(`http://127.0.0.1:5000/callback?state=${"o".repeat(32)}&code=${code}`, state)).toBeUndefined();
		expect(pastedCode(`http://127.0.0.1:5000/callback?state=${state}&code=short`, state)).toBeUndefined();
		expect(pastedCode(code, state)).toBeUndefined();
	});

	it("uses the beta for login and its account probe by default", async () => {
		delete process.env.SPOOL_CLOUD_ORIGIN;
		const vault = memoryVault();
		const requested: string[] = [];
		let opened = "";
		const authenticated = await login("/tmp/spool-one", {
			vault,
			device: "Mac",
			open: (url) => {
				opened = url;
				const callback = new URL(new URL(url).searchParams.get("return_url") ?? "");
				callback.searchParams.set("code", "c".repeat(43));
				void fetch(callback, { redirect: "manual" });
			},
			fetch: async (input) => {
				const url = String(input);
				requested.push(url);
				if (url.endsWith("/auth/account/exchange"))
					return Response.json({ token: "t".repeat(43), expiresAt: 2_000_000_000 });
				return Response.json(ACCOUNT);
			},
		});

		expect(authenticated).toEqual(ACCOUNT);
		expect(new URL(opened).origin).toBe("https://spool.page");
		expect(requested).toEqual([
			"https://spool.page/auth/account/exchange",
			"https://spool.page/auth/account/session",
		]);
	});

	it("times out without exchanging or storing authority", async () => {
		const vault = memoryVault();
		await expect(
			login("/tmp/spool-one", { origin: "http://127.0.0.1:9", vault, device: "Mac", open: () => {}, timeoutMs: 5 }),
		).rejects.toThrow(/expired/u);
		expect(await vault.read()).toBeUndefined();
	});

	it("stops waiting on the browser when the sign-in is cancelled", async () => {
		const vault = memoryVault();
		const cancel = new AbortController();
		const waiting = login("/tmp/spool-one", {
			origin: "http://127.0.0.1:9",
			vault,
			device: "Mac",
			open: () => cancel.abort(),
			signal: cancel.signal,
		});
		await expect(waiting).rejects.toThrow("sign-in was cancelled");
		expect(await vault.read()).toBeUndefined();
	});

	it("asks spool.page who this machine is signed in as, and says when it is signed out", async () => {
		const vault = memoryVault();
		await expect(account("/tmp/spool-one", { vault, fetch: async () => Response.json(ACCOUNT) })).rejects.toThrow(
			CloudSignedOut,
		);
		await vault.write("t".repeat(43));
		await expect(
			account("/tmp/spool-one", {
				vault,
				fetch: async (input) => {
					expect(String(input)).toBe("https://cloud.test/auth/account/session");
					return Response.json({ ...ACCOUNT, kind: "device" });
				},
				origin: "https://cloud.test",
			}),
		).resolves.toEqual(ACCOUNT);
		await expect(
			account("/tmp/spool-one", {
				vault,
				fetch: async () => new Response('{"error":"account_session_required"}', { status: 401 }),
			}),
		).rejects.toThrow(CloudSignedOut);
	});

	it("closes the handoff and redacts a browser-launch failure", async () => {
		await expect(
			login("/tmp/spool-one", {
				origin: "http://127.0.0.1:9",
				vault: memoryVault(),
				device: "Mac",
				open: () => {
					throw new Error("secret launcher detail");
				},
			}),
		).rejects.toThrow("could not open the system browser");
	});

	it("accepts only a canonical HTTPS authority from machine configuration", () => {
		expect(cloudOrigin({})).toBe("https://spool.page");
		expect(cloudOrigin({ SPOOL_CLOUD_ORIGIN: "https://beta.spool.page" })).toBe("https://beta.spool.page");
		expect(cloudOrigin({ SPOOL_CLOUD_ORIGIN: "https://spool.page" })).toBe("https://spool.page");
		for (const origin of ["http://spool.page", "https://spool.page/path", "https://user@spool.page"])
			expect(() => cloudOrigin({ SPOOL_CLOUD_ORIGIN: origin })).toThrow(/HTTPS origin/u);
	});

	it("revokes the device session when signing out of this machine", async () => {
		const cloud = await authServer();
		const vault = memoryVault();
		await vault.write("t".repeat(43));
		try {
			await expect(logout("/tmp/spool-one", { origin: cloud.origin, vault })).resolves.toEqual({
				remote: "revoked",
			});
			expect(cloud.revoked()).toBe(true);
			expect(await vault.read()).toBeUndefined();
		} finally {
			await cloud.close();
		}
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

	it("keeps a session file only its owner can read, one per authority, inside the instance's own folder", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const page = fileVault(spoolDir, "https://spool.page");
		const other = fileVault(spoolDir, "https://cloud.test");
		expect(await page.read()).toBeUndefined();
		await page.write("a".repeat(43));
		await other.write("b".repeat(43));
		expect(await page.read()).toBe("a".repeat(43));
		expect(await other.read()).toBe("b".repeat(43));
		const file = join(spoolDir, "cloud", "spool.page.session");
		expect(statSync(file).mode & 0o777).toBe(0o600);
		expect(statSync(join(spoolDir, "cloud")).mode & 0o777).toBe(0o700);
		await page.write("c".repeat(43));
		expect(await page.read()).toBe("c".repeat(43));
		await page.delete();
		await page.delete();
		expect(existsSync(file)).toBe(false);
		expect(await other.read()).toBe("b".repeat(43));
		await expect(page.write("not a session")).rejects.toThrow("spool.page returned an invalid session");
		writeFileSync(file, "garbled");
		await expect(page.read()).rejects.toThrow("Cloud sharing is signed out");
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
		await authorizedCloudRequest(
			"/tmp/spool-one",
			"/api/publications",
			{ signal: held.signal },
			{
				origin: "https://cloud.test",
				vault: { read: async () => "t".repeat(43), write: async () => {}, delete: async () => {} },
				fetch: async (input, init) => {
					expect(String(input)).toBe("https://cloud.test/api/publications");
					expect(init?.redirect).toBe("error");
					expect(init?.signal).not.toBe(held.signal);
					expect(init?.signal).toBeInstanceOf(AbortSignal);
					return Response.json({});
				},
			},
		);
	});
});
