import { isNewer } from "./update-check";

/**
 * What's new (spool#526): the first open on a new version shows what came with
 * it, once. spool.page/changelog.json holds the releases (spool-cloud builds it
 * from CHANGELOG.md, changelog/highlights.json and npm's publish times) and the
 * app ships no copy; this file decides, from that and the version last seen on
 * this Mac, what the window shows and what is remembered.
 */

/** Where the changelog's data is read, unless SPOOL_CHANGELOG_URL says otherwise. */
export const CHANGELOG_JSON_URL = "https://spool.page/changelog.json";
/** Where the card's link goes. */
export const CHANGELOG_PAGE_URL = "https://spool.page/changelog";
/** The most highlights the card steps through before the rest. */
export const MAX_HIGHLIGHTS = 4;
/** How long a release waits for its clips before it shows with whatever it has. */
export const CLIP_WAIT_MS = 48 * 60 * 60 * 1000;

type ChangeKind = "major" | "minor" | "patch";

interface FeedChange {
	kind: ChangeKind;
	/** the first sentence */
	title: string;
	/** the changeset's bold name, or the one highlights.json gave it */
	headline?: string;
	highlight?: boolean;
	clip?: { src: string; poster?: string };
}

interface FeedRelease {
	version: string;
	/** the day it went out, YYYY-MM-DD */
	date: string;
	entries: FeedChange[];
}

/** changelog.json, kept to the parts What's new reads. */
export interface ChangelogFeed {
	/** the release the highlights pass has picked through; clips for a newer one may still be coming */
	through?: string;
	/** when npm published each release */
	published: Record<string, string>;
	/** newest first */
	releases: FeedRelease[];
}

export interface WhatsNewHighlight {
	title: string;
	says: string;
	clip?: { src: string; poster?: string };
}

export interface WhatsNewFeature {
	name: string;
	says?: string;
}

/** One card's worth: what came between the version last seen and this one. */
export interface WhatsNewContent {
	/** the version the card is for, this daemon's */
	version: string;
	highlights: WhatsNewHighlight[];
	features: WhatsNewFeature[];
	fixes: number;
	changelog: string;
}

/** What this Mac remembers: the version it last saw, and the one it saw before that, which the last card began after. */
export interface WhatsNewMemory {
	seen?: string | undefined;
	from?: string | undefined;
}

export interface WhatsNewDecision {
	/** what help's What's new row opens, or nothing for no row */
	content: WhatsNewContent | null;
	/** the card unfolds on its own as the window opens */
	pop: boolean;
	/** remember this now, unasked; nothing means leave the memory as it is */
	remember?: { seen: string; from?: string | undefined };
}

const NOTHING: WhatsNewDecision = { content: null, pop: false };

/**
 * What to show, given what this Mac remembers, the version running and the
 * changelog (undefined when spool.page could not be reached).
 *
 * - Nothing remembered (a fresh install, a test, a clip's fresh lane): this
 *   version is remembered and nothing pops.
 * - A newer version than remembered gathers every release since. Fixes alone
 *   are remembered silently; a minor among them pops the card, which is
 *   remembered once it has been shown (`shown`).
 * - A release whose highlights pass has not run yet waits for its clips, and
 *   remembers nothing, until it is two days old.
 * - spool.page out of reach, or not yet listing this version: nothing shows and
 *   nothing is remembered, so the next open asks again.
 */
export function decideWhatsNew(
	memory: WhatsNewMemory,
	current: string,
	feed: ChangelogFeed | undefined,
	now: number,
): WhatsNewDecision {
	if (memory.seen === undefined) {
		return { ...(feed === undefined ? NOTHING : settled(feed, undefined, current)), remember: { seen: current } };
	}
	if (feed === undefined) return NOTHING;
	if (!isNewer(current, memory.seen)) {
		return settled(feed, memory.seen === current ? memory.from : undefined, current);
	}
	const release = feed.releases.find((candidate) => candidate.version === current);
	if (release === undefined) return NOTHING;
	const content = gather(feed, memory.seen, current);
	if (content === null) return { content: null, pop: false, remember: { seen: current, from: memory.seen } };
	const through = feed.through !== undefined && !isNewer(current, feed.through);
	return { content, pop: through || now - releasedAt(feed, release) > CLIP_WAIT_MS };
}

/** The memory once the card has been shown: this version seen, the last card begun after the one seen before. */
export function shownMemory(memory: WhatsNewMemory, current: string): { seen: string; from?: string | undefined } {
	if (memory.seen === current) return { seen: current, from: memory.from };
	return { seen: current, from: memory.seen };
}

/** Help's row for a version already seen: the releases its last card gathered, or its own release alone. */
function settled(feed: ChangelogFeed, from: string | undefined, current: string): WhatsNewDecision {
	return { content: gather(feed, from, current), pop: false };
}

/** The releases in (after, current], as one card; nothing when they hold no minor. */
function gather(feed: ChangelogFeed, after: string | undefined, current: string): WhatsNewContent | null {
	const releases = feed.releases.filter(
		(release) =>
			!isNewer(release.version, current) &&
			(after === undefined ? release.version === current : isNewer(release.version, after)),
	);
	const changes = releases.flatMap((release) => release.entries);
	const minors = changes.filter((change) => change.kind !== "patch");
	if (minors.length === 0) return null;
	const picked = minors.filter((change) => change.highlight === true).slice(0, MAX_HIGHLIGHTS);
	return {
		version: current,
		highlights: picked.map((change) => ({
			title: change.headline ?? change.title,
			says: change.title,
			...(change.clip === undefined ? {} : { clip: change.clip }),
		})),
		features: minors
			.filter((change) => !picked.includes(change))
			.map((change) =>
				change.headline === undefined ? { name: change.title } : { name: change.headline, says: change.title },
			),
		fixes: changes.length - minors.length,
		changelog: CHANGELOG_PAGE_URL,
	};
}

/** When a release went out: npm's instant, or the end of its day when npm's is missing. */
function releasedAt(feed: ChangelogFeed, release: FeedRelease): number {
	const published = Date.parse(feed.published[release.version] ?? "");
	if (Number.isFinite(published)) return published;
	const day = Date.parse(`${release.date}T00:00:00Z`);
	// the next UTC midnight is past the end of the day in Stockholm, where it was dated
	return Number.isFinite(day) ? day + 24 * 60 * 60 * 1000 : Number.POSITIVE_INFINITY;
}

const string = (value: unknown): value is string => typeof value === "string";
const KINDS = new Set<unknown>(["major", "minor", "patch"]);
/** a clip plays from the web, never from anywhere a hand-made answer might point */
const https = (value: unknown): value is string => string(value) && value.startsWith("https://");

/** changelog.json as fetched, keeping what has the right shape; nothing when it is not the changelog at all. */
export function readChangelogFeed(json: unknown): ChangelogFeed | undefined {
	if (typeof json !== "object" || json === null) return undefined;
	const { through, published, releases } = json as Record<string, unknown>;
	if (!Array.isArray(releases)) return undefined;
	const feed: ChangelogFeed = { published: {}, releases: [] };
	if (string(through)) feed.through = through;
	if (typeof published === "object" && published !== null) {
		for (const [version, at] of Object.entries(published)) if (string(at)) feed.published[version] = at;
	}
	for (const release of releases as unknown[]) {
		if (typeof release !== "object" || release === null) continue;
		const { version, date, entries } = release as Record<string, unknown>;
		if (!string(version) || !Array.isArray(entries)) continue;
		const changes: FeedChange[] = [];
		for (const entry of entries as unknown[]) {
			if (typeof entry !== "object" || entry === null) continue;
			const { kind, title, headline, highlight, clip } = entry as Record<string, unknown>;
			if (!KINDS.has(kind) || !string(title)) continue;
			const change: FeedChange = { kind: kind as ChangeKind, title };
			if (string(headline)) change.headline = headline;
			if (highlight === true) change.highlight = true;
			if (typeof clip === "object" && clip !== null) {
				const { src, poster } = clip as Record<string, unknown>;
				if (https(src)) change.clip = https(poster) ? { src, poster } : { src };
			}
			changes.push(change);
		}
		feed.releases.push({ version, date: string(date) ? date : "", entries: changes });
	}
	return feed;
}
