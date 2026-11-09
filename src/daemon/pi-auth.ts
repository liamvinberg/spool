import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PiKeyProvider } from "./agent-setup";

/**
 * pi's `auth.json`, as the first run writes a pasted key into it (spool#250).
 *
 * pi reads a stored key as more than text: a key starting with `!` is a shell command pi
 * runs for the key, and `$NAME` or `${NAME}` is filled from the environment (pi's
 * `resolveConfigValue`; older pis took a key that was a variable's whole name as that
 * variable). A key a person pastes is the key itself, so spool stores only one pi can't
 * read as anything else, on every pi: no `!` at its start and no `$` anywhere.
 */

/** Why spool won't store this as a key, or undefined when pi can only read it as the key it is. */
export function literalKeyRefusal(key: string): string | undefined {
	// printable ASCII, no spaces: every provider's keys are, and a pasted line break is not part of one
	if (!/^[\x21-\x7e]+$/.test(key)) return "That isn’t a key: a key has no spaces or line breaks.";
	if (key.startsWith("!") || key.includes("$"))
		return "That isn’t a key: pi would run a leading ! or fill in a $ rather than send it.";
	return undefined;
}

/**
 * How a key is asked of its provider: the cheapest call that needs a good key, at the
 * address pi itself sends that provider's requests to (pi-ai's `baseUrl`), so a key the
 * provider takes here is one pi can use. Most list their models; OpenRouter's model list
 * is open to anybody, so it is asked about the key itself.
 */
const KEY_PROBES: Record<PiKeyProvider, (key: string) => { url: string; headers: Record<string, string> }> = {
	anthropic: anthropicStyle("https://api.anthropic.com/v1/models"),
	openai: bearer("https://api.openai.com/v1/models"),
	google: (key) => ({
		url: "https://generativelanguage.googleapis.com/v1beta/models",
		headers: { "x-goog-api-key": key },
	}),
	openrouter: bearer("https://openrouter.ai/api/v1/key"),
	deepseek: bearer("https://api.deepseek.com/models"),
	xai: bearer("https://api.x.ai/v1/models"),
	mistral: bearer("https://api.mistral.ai/v1/models"),
	groq: bearer("https://api.groq.com/openai/v1/models"),
	"kimi-coding": bearer("https://api.kimi.com/coding/v1/models"),
	minimax: anthropicStyle("https://api.minimax.io/anthropic/v1/models"),
	zai: bearer("https://api.z.ai/api/coding/paas/v4/models"),
};

function bearer(url: string) {
	return (key: string) => ({ url, headers: { authorization: `Bearer ${key}` } });
}

function anthropicStyle(url: string) {
	return (key: string) => ({ url, headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
}

/** Google and xAI answer a bad key with 400, not 401 (asked of both for spool#250). */
const BAD_KEY_400: ReadonlySet<PiKeyProvider> = new Set(["google", "xai"]);

/** What the provider said of a key: it took it, it refused it, or spool couldn't ask (offline, slow, a 5xx). */
export type KeyCheck = "valid" | "refused" | "unchecked";

export async function checkProviderKey(
	provider: PiKeyProvider,
	key: string,
	fetcher: typeof fetch = fetch,
	timeoutMs = 8000,
): Promise<KeyCheck> {
	const probe = KEY_PROBES[provider](key);
	try {
		const response = await fetcher(probe.url, { headers: probe.headers, signal: AbortSignal.timeout(timeoutMs) });
		await response.body?.cancel().catch(() => {});
		if (response.ok) return "valid";
		if (response.status === 401 || response.status === 403) return "refused";
		if (response.status === 400 && BAD_KEY_400.has(provider)) return "refused";
		return "unchecked";
	} catch {
		return "unchecked";
	}
}

export type PiAuthFile =
	| { readonly kind: "read"; readonly entries: Readonly<Record<string, unknown>> }
	| { readonly kind: "unreadable" };

/** auth.json as pi keeps it: one entry per provider; no file is no entries, and one spool can't read it won't write. */
export function readPiAuth(file: string): PiAuthFile {
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { kind: "unreadable" };
		return { kind: "read", entries: parsed as Record<string, unknown> };
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "ENOENT"
			? { kind: "read", entries: {} }
			: { kind: "unreadable" };
	}
}

/** The whole file at once, private to its owner, as pi writes it. */
export function writePiAuth(file: string, entries: Readonly<Record<string, unknown>>): void {
	mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
	const temp = `${file}.spool-${process.pid}-${randomUUID()}`;
	writeFileSync(temp, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 });
	renameSync(temp, file);
}

/** how long pi's lock on auth.json may sit untouched before it was left by a pi that died (proper-lockfile's own) */
const STALE_LOCK_MS = 10_000;
const LOCK_TRIES = 50;
const LOCK_WAIT_MS = 100;

/** spool's own changes to each auth.json, one after another */
const turns = new Map<string, Promise<unknown>>();

/**
 * One change to auth.json at a time, read and written while it is held, so it starts
 * from the file as it is then, other changes included. spool's own changes wait their
 * turn; pi's are kept out by pi's own lock, the `auth.json.lock` folder its
 * proper-lockfile makes, which spool takes the same way. Busy when pi holds it longer
 * than spool waits.
 */
export async function withPiAuthLock<T>(
	file: string,
	change: () => T,
): Promise<{ held: true; value: T } | { held: false }> {
	const before = turns.get(file) ?? Promise.resolve();
	const mine = before.then(() => locked(file, change));
	const settled = mine.catch(() => {});
	turns.set(file, settled);
	void settled.then(() => {
		if (turns.get(file) === settled) turns.delete(file);
	});
	return mine;
}

async function locked<T>(file: string, change: () => T): Promise<{ held: true; value: T } | { held: false }> {
	const lock = `${file}.lock`;
	mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
	for (let tries = 0; ; tries++) {
		try {
			mkdirSync(lock);
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
		try {
			if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) {
				rmSync(lock, { recursive: true, force: true });
				continue;
			}
		} catch {
			// let go between the two looks: take it on the next
			continue;
		}
		if (tries >= LOCK_TRIES) return { held: false };
		await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_MS));
	}
	try {
		return { held: true, value: change() };
	} finally {
		rmSync(lock, { recursive: true, force: true });
	}
}
