import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { openInBrowser } from "./browser";
import { SpoolError } from "./errors";

export const CLOUD_ORIGIN = "https://spool.page";
/** A sign-in at spool.page lasts ten minutes, from the page to its last step. */
const HANDOFF_MS = 10 * 60_000;
/** The macOS Keychain service holding this instance's device session. */
const SERVICE = "spool.device-session";
/** Before accounts, the beta kept a publisher session here; signing out clears it too. */
const LEGACY_SERVICE = "spool.publisher-session";

/** The spool.page a request goes to: the one it names, or this machine's. */
export function originOf(options: Pick<CloudRequestOptions, "origin"> = {}): string {
	return options.origin ?? cloudOrigin(process.env);
}

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

/** The account this machine is signed in to, through its own device session. */
export interface CloudAccount {
	accountId: string;
	email: string;
	sessionId: string;
	expiresAt: number;
}

/** No device session, or one spool.page no longer accepts: the person signs in again. */
export class CloudSignedOut extends SpoolError {
	readonly code = "signed_out";
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
	/**
	 * For a browser on another machine, whose redirect to this one's loopback never arrives: asks for the address
	 * that browser ended on, and asks `again` after a paste that isn't it. Undefined when there is nothing more to read.
	 */
	paste?: (again: boolean, signal: AbortSignal) => Promise<string | undefined>;
	vault?: CloudVault;
	timeoutMs?: number;
	/** Ends a sign-in still waiting on the browser. */
	signal?: AbortSignal;
	/** How spool.page lists this machine; the machine's own name when omitted. */
	device?: string;
}

export type CloudRequestOptions = Omit<AuthOptions, "vault"> & { vault?: CloudVault | Pick<CloudVault, "read"> };
export class CloudAccountChanged extends SpoolError {
	readonly code = "account_changed";
	readonly retryable = false;
	constructor() {
		super(
			"Cloud account changed during this operation; its recorded outcome can be recovered after signing in again",
		);
	}
}

function base64url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64url");
}

function challenge(verifier: string): string {
	return createHash("sha256").update(verifier).digest("base64url");
}

function keychainIdentity(spoolDir: string, origin: string, service: string): { account: string; service: string } {
	const authority = new URL(origin).origin;
	return {
		service: `${service}.${createHash("sha256").update(authority).digest("base64url")}`,
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

export function keychainVault(spoolDir: string, origin = CLOUD_ORIGIN, entry = SERVICE): CloudVault {
	const { account, service } = keychainIdentity(spoolDir, origin, entry);
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

/** Where this machine keeps its device session: the Keychain on a Mac, a file only its owner can read elsewhere. */
export function sessionVault(spoolDir: string, origin = CLOUD_ORIGIN): CloudVault {
	return process.platform === "darwin" ? keychainVault(spoolDir, origin) : fileVault(spoolDir, origin);
}

/**
 * The device session as a file in the instance's state folder, for a machine with no Keychain: a Linux box reached
 * over SSH has no unlocked keyring to ask, and the daemon outlives the session that signed in. Owner-only, the way
 * gh and the cloud CLIs keep theirs.
 */
export function fileVault(spoolDir: string, origin = CLOUD_ORIGIN): CloudVault {
	const dir = join(spoolDir, "cloud");
	const file = join(dir, `${new URL(origin).host}.session`);
	const unavailable = () =>
		new SpoolError(`${file} can't be read or written; local spool still works, but Cloud sharing is signed out`);
	return {
		async read() {
			let text: string;
			try {
				text = await readFile(file, "utf8");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
				throw unavailable();
			}
			const token = text.trim();
			if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) throw unavailable();
			return token;
		},
		async write(token) {
			if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) throw new SpoolError("spool.page returned an invalid session");
			const staged = `${file}.${base64url(randomBytes(9))}.tmp`;
			try {
				await mkdir(dir, { recursive: true, mode: 0o700 });
				await chmod(dir, 0o700);
				// wx never follows a planted symlink, and the mode is the file's from its first byte.
				await writeFile(staged, `${token}\n`, { flag: "wx", mode: 0o600 });
				await rename(staged, file);
			} catch {
				await rm(staged, { force: true }).catch(() => {});
				throw unavailable();
			}
		},
		async delete() {
			try {
				await rm(file, { force: true });
			} catch {
				throw unavailable();
			}
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

/** What spool.page calls this machine on the account page: a Mac's own name, or the host name elsewhere. */
export async function deviceName(): Promise<string> {
	const fallback = hostname().replace(/\.local$/u, "");
	const named =
		process.platform === "darwin"
			? await new Promise<string>((done) =>
					execFile("scutil", ["--get", "ComputerName"], { timeout: 2_000 }, (error, stdout) =>
						done(error ? "" : stdout.trim()),
					),
				)
			: "";
	return (named || fallback || (process.platform === "darwin" ? "Mac" : "this machine"))
		.replace(/\p{C}/gu, "")
		.slice(0, 64);
}

/**
 * The one-use code in an address someone pasted: the loopback callback their browser couldn't load, whole or with
 * its scheme left off, and only when it carries this sign-in's state.
 */
export function pastedCode(text: string, state: string): string | undefined {
	const trimmed = text.trim();
	let url: URL;
	try {
		url = new URL(/^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed) ? trimmed : `http://${trimmed}`);
	} catch {
		return undefined;
	}
	const code = url.searchParams.get("code");
	if (url.searchParams.get("state") !== state || !code || !/^[A-Za-z0-9_-]{43}$/u.test(code)) return undefined;
	return code;
}

/**
 * Signs this machine in through a browser: spool.page's sign-in page hands a one-use code back to a loopback
 * listener, and the code and its PKCE verifier buy a device session kept in this machine's vault. A browser on
 * another machine, the phone or laptop someone reached this one from over SSH, can't reach that listener: the
 * address it ends on carries the same code, and pasting it here finishes the same handoff.
 */
export async function login(spoolDir: string, options: AuthOptions = {}): Promise<CloudAccount> {
	const origin = originOf(options);
	const request = options.fetch ?? fetch;
	const vault = options.vault ?? sessionVault(spoolDir, origin);
	const device = options.device ?? (await deviceName());
	const verifier = base64url(randomBytes(32));
	const state = base64url(randomBytes(24));
	let callback = "";
	let timer: NodeJS.Timeout | undefined;
	const code = await new Promise<string>((accept, reject) => {
		let settled = false;
		const pasting = new AbortController();
		const finish = (action: () => void) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			options.signal?.removeEventListener("abort", cancel);
			pasting.abort();
			server.close();
			action();
		};
		const readPasted = async (paste: NonNullable<AuthOptions["paste"]>) => {
			for (let again = false; !settled; again = true) {
				const text = await paste(again, pasting.signal).catch(() => undefined);
				if (text === undefined || settled) return;
				const handoff = pastedCode(text, state);
				if (handoff) return finish(() => accept(handoff));
			}
		};
		const cancel = () => finish(() => reject(new SpoolError("sign-in was cancelled")));
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
			// The browser's last page is spool.page's own: signed in, as whom, and that the tab can close.
			const done = new URL("/sign-in/done", origin);
			done.searchParams.set("device", device);
			outgoing.writeHead(303, { location: done.toString(), "cache-control": "no-store" });
			outgoing.end();
			finish(() => accept(handoff));
		});
		server.on("error", () => finish(() => reject(new SpoolError("could not start the sign-in handoff"))));
		if (options.signal?.aborted) return cancel();
		options.signal?.addEventListener("abort", cancel, { once: true });
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string")
				return finish(() => reject(new SpoolError("could not start the sign-in handoff")));
			callback = `http://127.0.0.1:${address.port}/callback?state=${state}`;
			const start = new URL("/sign-in", origin);
			start.searchParams.set("return_url", callback);
			start.searchParams.set("handoff_challenge", challenge(verifier));
			start.searchParams.set("device", device);
			try {
				(options.open ?? openInBrowser)(start.toString());
			} catch {
				return finish(() => reject(new SpoolError("could not open the system browser")));
			}
			if (options.paste) void readPasted(options.paste);
		});
		timer = setTimeout(() => {
			finish(() => reject(new SpoolError("sign-in expired; run `spool login` to try again")));
		}, options.timeoutMs ?? HANDOFF_MS);
	});
	let response: Response;
	try {
		response = await request(new URL("/auth/account/exchange", origin), {
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
		throw new SpoolError("sign-in could not be completed; run `spool login` to try again");
	await vault.write(body.token);
	try {
		return await account(spoolDir, { origin, fetch: request, vault });
	} catch (error) {
		await vault.delete();
		throw error;
	}
}

/** Who this machine is signed in as. Asking is using: spool.page renews the device session. */
export async function account(spoolDir: string, options: CloudRequestOptions = {}): Promise<CloudAccount> {
	const response = await authorizedCloudRequest(spoolDir, "/auth/account/session", {}, options);
	const body = await responseJson(response);
	if (
		!response.ok ||
		typeof body.accountId !== "string" ||
		typeof body.email !== "string" ||
		typeof body.sessionId !== "string" ||
		typeof body.expiresAt !== "number"
	)
		throw new SpoolError("spool.page returned an invalid account");
	return { accountId: body.accountId, email: body.email, sessionId: body.sessionId, expiresAt: body.expiresAt };
}

export async function session(spoolDir: string, options: CloudRequestOptions = {}): Promise<CloudSession> {
	const response = await authorizedCloudRequest(spoolDir, "/auth/publisher/session", {}, options);
	const body = await responseJson(response);
	if (response.status === 403) throw new SpoolError("this account is not approved to publish");
	if (!response.ok || typeof body.publisherId !== "string" || typeof body.sessionId !== "string")
		throw new SpoolError("Cloud sign-in expired or was revoked; run `spool login` again");
	return { publisherId: body.publisherId, sessionId: body.sessionId };
}

const SESSION_PATHS = ["/auth/account/session", "/auth/publisher/session"];

export async function authorizedCloudRequest(
	spoolDir: string,
	path: string,
	init: RequestInit = {},
	options: CloudRequestOptions = {},
): Promise<Response> {
	if ((!path.startsWith("/api/") && !SESSION_PATHS.includes(path)) || path.startsWith("//"))
		throw new SpoolError("invalid Cloud API path");
	const origin = originOf(options);
	const vault = options.vault ?? sessionVault(spoolDir, origin);
	const token = await vault.read();
	if (!token) throw new CloudSignedOut("not signed in; run `spool login`");
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
		if ((await vault.read()) !== token) throw new CloudAccountChanged();
		if (SESSION_PATHS.includes(path))
			throw new SpoolError("spool.page could not be reached; local spool is still available");
		throw new CloudRequestFailure("spool.page could not be reached; publishing can be resumed safely");
	}
	if ((await vault.read()) !== token) throw new CloudAccountChanged();
	if (response.status === 401)
		throw new CloudSignedOut("Cloud sign-in expired or was revoked; run `spool login` again");
	return response;
}

/** Signs this machine out: spool.page revokes its device session, and this machine's vault forgets it. */
export async function logout(
	spoolDir: string,
	options: AuthOptions = {},
): Promise<{ remote: "absent" | "revoked" | "unavailable" }> {
	const origin = options.origin ?? CLOUD_ORIGIN;
	const vault = options.vault ?? sessionVault(spoolDir, origin);
	const revoke = async (path: string, token: string) => {
		const response = await (options.fetch ?? fetch)(new URL(path, origin), {
			method: "POST",
			headers: { authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(10_000),
		});
		return response.ok;
	};
	const token = await vault.read();
	let remote: "absent" | "revoked" | "unavailable" = token ? "unavailable" : "absent";
	try {
		if (token && (await revoke("/auth/account/logout", token))) remote = "revoked";
	} catch {
		remote = "unavailable";
	} finally {
		await vault.delete();
	}
	// Only a Mac ever kept the beta's publisher session.
	if (options.vault === undefined && process.platform === "darwin") {
		const legacy = keychainVault(spoolDir, origin, LEGACY_SERVICE);
		const old = await legacy.read().catch(() => undefined);
		if (old) {
			await revoke("/auth/publisher/logout", old).catch(() => false);
			await legacy.delete();
		}
	}
	return { remote };
}
