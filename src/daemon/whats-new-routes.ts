import { Hono } from "hono";
import { readRegistry } from "../registry";
import type { SettingsStore } from "./settings";
import {
	CHANGELOG_JSON_URL,
	type ChangelogFeed,
	decideWhatsNew,
	readChangelogFeed,
	shownMemory,
	type WhatsNewContent,
	type WhatsNewMemory,
} from "./whats-new";

/** What's new as the daemon runs it; absent, the window never hears of it. */
export interface WhatsNewOptions {
	/** the version the card is for: the daemon's own, or the one SPOOL_WHATS_NEW plays it as */
	version: string;
	/** changelog.json's address, spool.page's unless a test points it elsewhere */
	url?: string | undefined;
	fetch?: typeof globalThis.fetch | undefined;
	now?: (() => number) | undefined;
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * What's new as `spool serve` runs it. A packaged build has it on. A spool run
 * from its TypeScript source is a checkout, where agents work, or a test, and a
 * card unfolding over their canvas on every bump of package.json would be noise,
 * so it stays off there unless SPOOL_WHATS_NEW names a version to play it as (on
 * any build, that version stands in for the daemon's own). SPOOL_CHANGELOG_URL
 * points the read elsewhere.
 */
export function whatsNewServing(
	version: string,
	env: NodeJS.ProcessEnv,
	fromSource: boolean,
): WhatsNewOptions | undefined {
	const played = env.SPOOL_WHATS_NEW?.trim() ?? "";
	if (fromSource && played === "") return undefined;
	const url = env.SPOOL_CHANGELOG_URL?.trim() ?? "";
	return { version: SEMVER.test(played) ? played : version, ...(url === "" ? {} : { url }) };
}

/** What the window is told as it opens. */
export interface WhatsNewAnswer {
	/** what help's What's new row opens; nothing for no row */
	content: WhatsNewContent | null;
	/** the card unfolds by itself */
	pop: boolean;
}

/** One read of spool.page serves every window for this long. */
const FRESH_MS = 10 * 60 * 1000;

/**
 * GET /api/whats-new and POST /api/whats-new/seen. The window asks
 * the daemon, never spool.page: the daemon reads changelog.json, decides with
 * what this Mac remembers (`whatsNew.*` in config.json), and is told when the
 * card has been shown so it is remembered then and not before.
 */
export function whatsNewRoutes({
	settings,
	options,
	spoolDir,
}: {
	settings: SettingsStore;
	options: WhatsNewOptions | undefined;
	spoolDir: string;
}) {
	// read before any window opens a project and moves its time on
	const usedSince = options === undefined ? undefined : earliestOpen(spoolDir);
	let held: { feed: ChangelogFeed; at: number } | undefined;
	let reading: Promise<ChangelogFeed | undefined> | undefined;
	const now = () => options?.now?.() ?? Date.now();

	async function readFeed(): Promise<ChangelogFeed | undefined> {
		const fetcher = options?.fetch ?? globalThis.fetch;
		try {
			const res = await fetcher(options?.url ?? CHANGELOG_JSON_URL, { signal: AbortSignal.timeout(10_000) });
			if (!res.ok) return undefined;
			const feed = readChangelogFeed(await res.json());
			if (feed !== undefined) held = { feed, at: now() };
			return feed;
		} catch {
			// out of reach is an ordinary day: nothing shows, and the next open asks again
			return undefined;
		}
	}

	function feed(): Promise<ChangelogFeed | undefined> {
		if (held !== undefined && now() - held.at < FRESH_MS) return Promise.resolve(held.feed);
		reading ??= readFeed().finally(() => {
			reading = undefined;
		});
		return reading;
	}

	function memory(): WhatsNewMemory {
		const entries = settings.read().entries;
		const value = (key: string) => {
			const found = entries.find((entry) => entry.key === key)?.value;
			return typeof found === "string" && found !== "" ? found : undefined;
		};
		return { seen: value("whatsNew.seen"), from: value("whatsNew.from"), usedSince };
	}

	function remember(next: { seen: string; from?: string | undefined }): void {
		settings.writeMany([
			{ key: "whatsNew.seen", value: next.seen },
			{ key: "whatsNew.from", value: next.from ?? null },
		]);
	}

	return new Hono()
		.get("/whats-new", async (c) => {
			if (options === undefined) return c.json({ content: null, pop: false } satisfies WhatsNewAnswer);
			const decision = decideWhatsNew(memory(), options.version, await feed(), now());
			if (decision.remember !== undefined) remember(decision.remember);
			return c.json({ content: decision.content, pop: decision.pop } satisfies WhatsNewAnswer);
		})
		.post("/whats-new/seen", (c) => {
			if (options !== undefined) remember(shownMemory(memory(), options.version));
			return c.body(null, 204);
		});
}

/** The last open of the project left longest unopened: when this Mac last used spool, at the latest. */
function earliestOpen(spoolDir: string): number | undefined {
	try {
		const times = readRegistry(spoolDir)
			.projects.map((project) => Date.parse(project.openedAt))
			.filter(Number.isFinite);
		return times.length === 0 ? undefined : Math.min(...times);
	} catch {
		return undefined;
	}
}
