// A release number, which is three plain numbers and nothing else.
//
// Spool has one version for everything: the npm package, the git tag, the
// daemon's /api/health, the `spool.page` inside this bundle, and the app's
// CFBundleShortVersionString. Changesets picks it, so nothing here ever writes
// one; this only compares them.

export interface Version {
	major: number;
	minor: number;
	patch: number;
}

/**
 * Accepts `1.2.3` and `v1.2.3`. Anything else is refused rather than guessed at:
 * a tag carrying a suffix, a word or a fourth field is not something this app can
 * rank, and ranking it wrong points somebody at a downgrade.
 */
export function parseVersion(text: string): Version | undefined {
	const body = text.startsWith("v") ? text.slice(1) : text;
	const parts = body.split(".");
	if (parts.length !== 3) return undefined;
	const numbers: number[] = [];
	for (const part of parts) {
		if (!/^[0-9]+$/.test(part)) return undefined;
		numbers.push(Number(part));
	}
	const [major, minor, patch] = numbers as [number, number, number];
	return { major, minor, patch };
}

export function formatVersion(version: Version): string {
	return `${version.major}.${version.minor}.${version.patch}`;
}

/** Negative when a is older, zero when they are the same, positive when newer. */
export function compareVersions(a: Version, b: Version): number {
	if (a.major !== b.major) return a.major - b.major;
	if (a.minor !== b.minor) return a.minor - b.minor;
	return a.patch - b.patch;
}
