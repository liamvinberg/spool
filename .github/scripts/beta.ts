import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Spool Beta's feed and announcement (spool#282), for .github/workflows/beta.yml.
//
// The feed is everything under `beta/` in the spool-releases bucket, beside the
// released app's files at the bucket's root. Nothing here may name a key outside
// `beta/`: a released Spool reads `latest-mac.yml` and `Spool.dmg` at the root.

export const PREFIX = "beta/";

/** The builds the feed keeps; older ones are deleted, so the bucket does not grow by a build a push. */
export const KEEP = 5;

/**
 * A beta's version: the next patch after the released one in package.json, and the workflow's run number, as
 * `0.55.1-beta.12`. The run number only grows and package.json's version only grows, so every beta ranks above every
 * earlier one; the suffix keeps it off every released version. The next patch rather than the version changesets
 * would cut next, because a pending changeset can be lowered on the release PR, which would rank a later beta lower.
 */
export function betaVersion(released: string, run: number): string {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(released);
	if (match === null) throw new Error(`package.json says ${released}, which is not a released X.Y.Z.`);
	if (!Number.isSafeInteger(run) || run < 1) throw new Error(`Expected a run number, got ${run}.`);
	const [, major, minor, patch] = match;
	return `${major}.${minor}.${Number(patch) + 1}-beta.${run}`;
}

/** Refuses any key outside the beta's prefix, so neither a write nor a delete can reach the released app's files. */
export function betaKey(key: string): string {
	if (!key.startsWith(PREFIX) || key.includes("..") || key.length === PREFIX.length)
		throw new Error(`Refusing ${key}: Spool Beta writes and deletes only under ${PREFIX}.`);
	return key;
}

/** A build's own file, `beta/Spool-Beta-<version>…`, and the version it belongs to. */
const BUILD_FILE = /^beta\/Spool-Beta-(\d+\.\d+\.\d+-beta\.(\d+))(?:\.dmg|-arm64-mac\.zip(?:\.blockmap)?)$/;

/**
 * The keys to delete: every versioned file of a build older than the newest `keep`. The feed's own files
 * (`latest-mac.yml`, `Spool-Beta.dmg`, `build.json`) and anything this does not recognise are never named.
 */
export function prunable(keys: readonly string[], keep = KEEP): string[] {
	const builds = new Map<string, number>();
	for (const key of keys) {
		const match = BUILD_FILE.exec(key);
		if (match !== null) builds.set(match[1] as string, Number(match[2]));
	}
	const kept = new Set(
		[...builds]
			.sort(([, a], [, b]) => b - a)
			.slice(0, keep)
			.map(([version]) => version),
	);
	return keys
		.filter((key) => {
			const version = BUILD_FILE.exec(key)?.[1];
			return version !== undefined && !kept.has(version);
		})
		.map(betaKey);
}

/** Discord refuses a message over 2000 characters. */
const LIMIT = 2000;

/**
 * The one message a finished build posts in the spool category's `beta` channel: the version, the commits since the
 * last beta, and the download link, which never moves.
 */
export function announcement(version: string, commit: string, subjects: readonly string[], download: string): string {
	const head = `**Spool Beta ${version}** from \`${commit.slice(0, 7)}\``;
	const foot = `[Download Spool Beta](<${download}>)`;
	const lines: string[] = [];
	let length = head.length + foot.length + 4;
	for (const [index, subject] of subjects.entries()) {
		const line = `- ${subject.replace(/\s+/g, " ").trim()}`;
		const rest = subjects.length - index;
		const more = `- and ${rest} more`;
		if (length + line.length + 1 + (rest > 1 ? more.length + 1 : 0) > LIMIT) {
			lines.push(more);
			break;
		}
		lines.push(line);
		length += line.length + 1;
	}
	if (subjects.length === 0) lines.push("- the same commits as the last beta, built again");
	return [head, ...lines, "", foot].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	const [verb, ...args] = process.argv.slice(2);
	const input = () => readFileSync(0, "utf8").split("\n").filter(Boolean);
	if (verb === "version") console.log(betaVersion(args[0] ?? "", Number(args[1])));
	else if (verb === "key") console.log(betaKey(args[0] ?? ""));
	else if (verb === "prune") for (const key of prunable(input())) console.log(key);
	else if (verb === "announce")
		console.log(JSON.stringify({ content: announcement(args[0] ?? "", args[1] ?? "", input(), args[2] ?? "") }));
	else
		throw new Error(
			"Usage: beta.ts version <released> <run> | key <key> | prune < keys | announce <version> <commit> <download> < subjects",
		);
}
