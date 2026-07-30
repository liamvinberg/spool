import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";

/**
 * The phone-home half of the update loop (#30): the daemon alone asks the
 * npm registry — after listen, then daily, the update-notifier cadence —
 * whether a newer spool.page exists. The answer is cached in
 * ~/.spool/update.json so a restart inside the same day never re-asks, and
 * every failure is silent: the check can only ever add a toast, never
 * subtract from a working spool. `spool upgrade` shares the two primitives
 * below — it asks the registry live rather than off this cache, because a
 * cache minutes stale is what talks it into installing an older release.
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
	pre: string[] | undefined;
}

function parseVersion(version: string): ParsedVersion | undefined {
	const numeric = "(?:0|[1-9]\\d*)";
	const identifier = "[0-9A-Za-z-]+";
	const match = new RegExp(
		`^(${numeric})\\.(${numeric})\\.(${numeric})(?:-(${identifier}(?:\\.${identifier})*))?(?:\\+${identifier}(?:\\.${identifier})*)?$`,
	).exec(version);
	if (match === null) return undefined;
	const [, major, minor, patch, pre] = match;
	if (major === undefined || minor === undefined || patch === undefined) return undefined;
	const parts = pre?.split(".");
	if (parts?.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) return undefined;
	return { nums: [Number(major), Number(minor), Number(patch)], pre: parts };
}

function comparePrerelease(a: string[], b: string[]): number {
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const left = a[i];
		const right = b[i];
		if (left === undefined) return -1;
		if (right === undefined) return 1;
		if (left === right) continue;
		const leftNumeric = /^\d+$/.test(left);
		const rightNumeric = /^\d+$/.test(right);
		if (leftNumeric && rightNumeric) return BigInt(left) > BigInt(right) ? 1 : -1;
		if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
		return left > right ? 1 : -1;
	}
	return 0;
}

/** Strictly newer by semver order — a stale cache must never toast a fresh daemon. */
export function isNewer(candidate: string, current: string): boolean {
	const a = parseVersion(candidate);
	const b = parseVersion(current);
	if (a === undefined || b === undefined) return false;
	for (const i of [0, 1, 2] as const) {
		if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i];
	}
	// Same triple: a release outranks its prereleases; prerelease identifiers
	// follow semver precedence (numeric order, numerics below non-numerics).
	if (a.pre === undefined) return b.pre !== undefined;
	if (b.pre === undefined) return false;
	return comparePrerelease(a.pre, b.pre) > 0;
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
	let running = false;

	async function check(): Promise<void> {
		try {
			const latest = await fetchLatest();
			if (latest === undefined) return;
			writeUpdateCache(spoolDir, { latest, checkedAt: new Date().toISOString() });
			known = latest;
			if (latest !== announced && isNewer(latest, version)) {
				announced = latest;
				onUpdate(latest);
			}
		} catch {
			// A phone-home can only add an update hint. Network, disk, and callback
			// failures stay silent and never disturb a working daemon.
		}
	}

	function schedule(delay: number): void {
		if (!running) return;
		timer = setTimeout(async () => {
			await check();
			schedule(intervalMs);
		}, delay);
		timer.unref();
	}

	return {
		available: () => (known !== undefined && isNewer(known, version) ? known : undefined),
		start: () => {
			if (running) return;
			running = true;
			const cache = readUpdateCache(spoolDir);
			const checkedAt = cache === undefined ? Number.NaN : Date.parse(cache.checkedAt);
			const age = Number.isFinite(checkedAt) ? Math.max(0, Date.now() - checkedAt) : intervalMs;
			schedule(Math.max(0, intervalMs - age));
		},
		stop: () => {
			running = false;
			if (timer !== undefined) clearTimeout(timer);
			timer = undefined;
		},
	};
}
