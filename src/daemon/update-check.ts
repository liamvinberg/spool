import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";

/**
 * The phone-home half of the update loop (#30): the daemon alone asks the
 * npm registry — after listen, then daily, the update-notifier cadence —
 * whether a newer spool.page exists. The answer is cached in
 * ~/.spool/update.json so a restart inside the same day never re-asks, and
 * every failure is silent: the check can only ever add a toast, never
 * subtract from a working spool. `spool upgrade` depends on none of this.
 */

export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const REGISTRY_LATEST_URL = "https://registry.npmjs.org/spool.page/latest";
const UPDATE_FILE = "update.json";

export interface UpdateCache {
	latest: string;
	checkedAt: string;
}

/** Machine-written ephemera: corrupt or unreadable cache reads as absent. */
export function readUpdateCache(spoolDir: string): UpdateCache | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(join(spoolDir, UPDATE_FILE), "utf8"));
	} catch {
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null) return undefined;
	const cache = parsed as Record<string, unknown>;
	if (typeof cache.latest !== "string" || typeof cache.checkedAt !== "string") return undefined;
	return { latest: cache.latest, checkedAt: cache.checkedAt };
}

export function writeUpdateCache(spoolDir: string, cache: UpdateCache): void {
	writeAtomic(join(spoolDir, UPDATE_FILE), `${JSON.stringify(cache, null, "\t")}\n`);
}

interface ParsedVersion {
	nums: [number, number, number];
	pre: string | undefined;
}

function parseVersion(version: string): ParsedVersion | undefined {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
	if (match === null) return undefined;
	const [, major, minor, patch, pre] = match;
	if (major === undefined || minor === undefined || patch === undefined) return undefined;
	return { nums: [Number(major), Number(minor), Number(patch)], pre };
}

/** Strictly newer by semver order — a stale cache must never toast a fresh daemon. */
export function isNewer(candidate: string, current: string): boolean {
	const a = parseVersion(candidate);
	const b = parseVersion(current);
	if (a === undefined || b === undefined) return false;
	for (const i of [0, 1, 2] as const) {
		if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i];
	}
	// same triple: a release outranks its prereleases; prereleases order lexically
	if (a.pre === undefined) return b.pre !== undefined;
	if (b.pre === undefined) return false;
	return a.pre > b.pre;
}

/** The registry's dist-tag answer, or undefined — offline is a normal day. */
export async function fetchLatestVersion(fetchImpl: typeof fetch = fetch): Promise<string | undefined> {
	let body: unknown;
	try {
		const res = await fetchImpl(REGISTRY_LATEST_URL, { signal: AbortSignal.timeout(10_000) });
		if (!res.ok) return undefined;
		body = await res.json();
	} catch {
		return undefined;
	}
	if (typeof body !== "object" || body === null) return undefined;
	const version = (body as Record<string, unknown>).version;
	return typeof version === "string" ? version : undefined;
}

export interface UpdateCheckerOptions {
	spoolDir: string;
	/** the running daemon's version — what "newer" is measured against */
	version: string;
	/** a newer latest became known; fires at most once per distinct version */
	onUpdate: (latest: string) => void;
	fetchLatest?: () => Promise<string | undefined>;
	intervalMs?: number;
}

export interface UpdateChecker {
	/** the newest version worth offering, or undefined while current */
	available(): string | undefined;
	/** begin asking: immediately when the cache is stale, on the interval after */
	start(): void;
	stop(): void;
}

export function createUpdateChecker({
	spoolDir,
	version,
	onUpdate,
	fetchLatest = fetchLatestVersion,
	intervalMs = UPDATE_CHECK_INTERVAL_MS,
}: UpdateCheckerOptions): UpdateChecker {
	let known = readUpdateCache(spoolDir)?.latest;
	let announced: string | undefined;
	let timer: NodeJS.Timeout | undefined;

	async function check(): Promise<void> {
		const latest = await fetchLatest();
		if (latest === undefined) return;
		known = latest;
		writeUpdateCache(spoolDir, { latest, checkedAt: new Date().toISOString() });
		if (latest !== announced && isNewer(latest, version)) {
			announced = latest;
			onUpdate(latest);
		}
	}

	return {
		available: () => (known !== undefined && isNewer(known, version) ? known : undefined),
		start: () => {
			if (timer !== undefined) return;
			timer = setInterval(() => void check(), intervalMs);
			timer.unref();
			const cache = readUpdateCache(spoolDir);
			const fresh = cache !== undefined && Date.now() - Date.parse(cache.checkedAt) < intervalMs;
			if (!fresh) void check();
		},
		stop: () => {
			if (timer !== undefined) clearInterval(timer);
			timer = undefined;
		},
	};
}
