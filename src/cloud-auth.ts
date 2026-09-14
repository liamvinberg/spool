import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { openInBrowser } from "./browser";
import { SpoolError } from "./errors";

export const CLOUD_ORIGIN = "https://spool.page";
const HANDOFF_MS = 5 * 60_000;
const SERVICE = "spool.publisher-session";

export function cloudOrigin(env: Record<string, string | undefined>): string {
	const raw = env.SPOOL_CLOUD_ORIGIN || CLOUD_ORIGIN;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new SpoolError("SPOOL_CLOUD_ORIGIN must be an HTTPS origin");
	}
	if (url.protocol !== "https:" || url.origin !== raw || url.username || url.password)
		throw new SpoolError("SPOOL_CLOUD_ORIGIN must be an HTTPS origin");
	return url.origin;
}

export interface CloudSession {
	publisherId: string;
	sessionId: string;
}

export class CloudRequestFailure extends SpoolError {
	readonly code = "transport_interrupted";
	readonly retryable = true;
}

export interface CloudVault {
	read(): Promise<string | undefined>;
	write(token: string): Promise<void>;
	delete(): Promise<void>;
}

export interface AuthOptions {
	origin?: string;
	fetch?: typeof fetch;
	open?: (url: string) => void;
	vault?: CloudVault;
	timeoutMs?: number;
}

function base64url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64url");
}

function challenge(verifier: string): string {
	return createHash("sha256").update(verifier).digest("base64url");
}

function keychainIdentity(spoolDir: string, origin: string): { account: string; service: string } {
	const authority = new URL(origin).origin;
	return {
		service: `${SERVICE}.${createHash("sha256").update(authority).digest("base64url")}`,
		account: createHash("sha256")
			.update(`${authority}\0${resolve(spoolDir)}`)
			.digest("base64url"),
	};
}

async function security(
	args: readonly string[],
	input?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((done, fail) => {
		const child = spawn("security", args, { stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
		if (child.stdout === null || child.stderr === null || (input !== undefined && child.stdin === null)) {
			child.kill();
			fail(new Error("security streams unavailable"));
			return;
		}
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (part: string) => (stdout += part));
		child.stderr.on("data", (part: string) => (stderr += part));
		child.on("error", fail);
		child.on("close", (code) => done({ code: code ?? 1, stdout, stderr }));
		if (input !== undefined) child.stdin?.end(input);
	});
}

export function keychainVault(spoolDir: string, origin = CLOUD_ORIGIN): CloudVault {
	const { account, service } = keychainIdentity(spoolDir, origin);
	const unavailable = () =>
		new SpoolError("macOS Keychain is unavailable; local spool still works, but Cloud sharing is signed out");
	return {
		async read() {
			let result: Awaited<ReturnType<typeof security>>;
			try {
				result = await security(["find-generic-password", "-a", account, "-s", service, "-w"]);
			} catch {
				throw unavailable();
			}
			if (result.code === 44) return undefined;
			if (result.code !== 0) throw unavailable();
			const token = result.stdout.trim();
			if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) throw unavailable();
			return token;
		},
		async write(token) {
			if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) throw new SpoolError("spool.page returned an invalid session");
			let result: Awaited<ReturnType<typeof security>>;
			try {
				// Apple's SecurityTool parses interactive commands from stdin. The secret is
				// base64url, so it is one inert argument there and never process-visible argv.
				result = await security(["-i"], `add-generic-password -U -a ${account} -s ${service} -w ${token}\n`);
			} catch {
				throw unavailable();
			}
			if (result.code !== 0) throw unavailable();
			const stored = await security(["find-generic-password", "-a", account, "-s", service, "-w"]);
			if (stored.code !== 0 || stored.stdout.trim() !== token) throw unavailable();
		},
		async delete() {
			let result: Awaited<ReturnType<typeof security>>;
			try {
				result = await security(["delete-generic-password", "-a", account, "-s", service]);
			} catch {
				throw unavailable();
			}
			if (result.code !== 0 && result.code !== 44) throw unavailable();
		},
	};
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
	try {
		const value: unknown = await response.json();
		return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

export async function login(spoolDir: string, options: AuthOptions = {}): Promise<CloudSession> {
	const origin = options.origin ?? cloudOrigin(process.env);
	const request = options.fetch ?? fetch;
	const vault = options.vault ?? keychainVault(spoolDir, origin);
	const verifier = base64url(randomBytes(32));
	const state = base64url(randomBytes(24));
	let callback = "";
	let timer: NodeJS.Timeout | undefined;
	const code = await new Promise<string>((accept, reject) => {
		let settled = false;
		const finish = (action: () => void) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			server.close();
			action();
		};
		const server = createServer((incoming, outgoing) => {
			const fail = () => {
				outgoing.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
				outgoing.end("This sign-in request does not match spool. You can close this tab.");
			};
			if (incoming.method !== "GET" || incoming.headers.host !== new URL(callback).host) return fail();
			const received = new URL(incoming.url ?? "", callback);
			const expected = new URL(callback);
			if (
				received.origin !== expected.origin ||
				received.pathname !== expected.pathname ||
				received.searchParams.get("state") !== state
			)
				return fail();
			const handoff = received.searchParams.get("code");
			if (!handoff || !/^[A-Za-z0-9_-]{43}$/u.test(handoff) || received.searchParams.size !== 2) return fail();
			outgoing.writeHead(200, { "content-type": "text/html; charset=utf-8" });
			outgoing.end(
				"<!doctype html><title>Signed in to spool</title><p>You can close this tab and return to spool.</p>",
			);
			finish(() => accept(handoff));
		});
		server.on("error", () => finish(() => reject(new SpoolError("could not start the sign-in handoff"))));
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string")
				return finish(() => reject(new SpoolError("could not start the sign-in handoff")));
			callback = `http://127.0.0.1:${address.port}/callback?state=${state}`;
			const start = new URL("/auth/google/start", origin);
			start.searchParams.set("return_url", callback);
			start.searchParams.set("handoff_challenge", challenge(verifier));
			try {
				(options.open ?? openInBrowser)(start.toString());
			} catch {
				finish(() => reject(new SpoolError("could not open the system browser")));
			}
		});
		timer = setTimeout(() => {
			finish(() => reject(new SpoolError("sign-in expired; run `spool login` to try again")));
		}, options.timeoutMs ?? HANDOFF_MS);
	});
	let response: Response;
	try {
		response = await request(new URL("/auth/publisher/exchange", origin), {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ code, verifier, returnUrl: callback }),
			signal: AbortSignal.timeout(60_000),
		});
	} catch {
		throw new SpoolError("spool.page could not be reached; sign-in was not stored");
	}
	const body = await responseJson(response);
	if (!response.ok || typeof body.token !== "string")
		throw new SpoolError(
			response.status === 403 ? "this Google account is not approved to publish" : "sign-in could not be completed",
		);
	await vault.write(body.token);
	try {
		return await session(spoolDir, { origin, fetch: request, vault });
	} catch (error) {
		await vault.delete();
		throw error;
	}
}

export async function session(spoolDir: string, options: AuthOptions = {}): Promise<CloudSession> {
	const response = await authorizedCloudRequest(spoolDir, "/auth/publisher/session", {}, options);
	const body = await responseJson(response);
	if (!response.ok || typeof body.publisherId !== "string" || typeof body.sessionId !== "string")
		throw new SpoolError("Cloud sign-in expired or was revoked; run `spool login` again");
	return { publisherId: body.publisherId, sessionId: body.sessionId };
}

export async function authorizedCloudRequest(
	spoolDir: string,
	path: string,
	init: RequestInit = {},
	options: AuthOptions = {},
): Promise<Response> {
	if ((!path.startsWith("/api/") && path !== "/auth/publisher/session") || path.startsWith("//"))
		throw new SpoolError("invalid Cloud API path");
	const origin = options.origin ?? cloudOrigin(process.env);
	const vault = options.vault ?? keychainVault(spoolDir, origin);
	const token = await vault.read();
	if (!token) throw new SpoolError("not signed in; run `spool login`");
	const headers = new Headers(init.headers);
	headers.set("authorization", `Bearer ${token}`);
	headers.delete("cookie");
	headers.delete("origin");
	let response: Response;
	try {
		const timeout = AbortSignal.timeout(options.timeoutMs ?? 10_000);
		response = await (options.fetch ?? fetch)(new URL(path, origin), {
			...init,
			headers,
			redirect: "error",
			signal: init.signal == null ? timeout : AbortSignal.any([init.signal, timeout]),
		});
	} catch {
		if (path === "/auth/publisher/session")
			throw new SpoolError("spool.page could not be reached; local spool is still available");
		throw new CloudRequestFailure("spool.page could not be reached; publishing can be resumed safely");
	}
	if (response.status === 401) throw new SpoolError("Cloud sign-in expired or was revoked; run `spool login` again");
	return response;
}

export async function logout(
	spoolDir: string,
	options: AuthOptions = {},
): Promise<{ remote: "absent" | "revoked" | "unavailable" }> {
	const origin = options.origin ?? CLOUD_ORIGIN;
	const vault = options.vault ?? keychainVault(spoolDir, origin);
	const token = await vault.read();
	let remote: "absent" | "revoked" | "unavailable" = token ? "unavailable" : "absent";
	try {
		if (token) {
			const response = await (options.fetch ?? fetch)(new URL("/auth/publisher/logout", origin), {
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(10_000),
			});
			if (response.ok) remote = "revoked";
		}
	} catch {
		remote = "unavailable";
	} finally {
		await vault.delete();
	}
	return { remote };
}
