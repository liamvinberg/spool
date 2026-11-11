// A release number, which is three plain numbers, or a Spool Beta build's.
//
// Spool has one version for everything: the npm package, the git tag, the
// daemon's /api/health, the `spool.page` inside this bundle, and the app's
// CFBundleShortVersionString. Changesets picks it, so nothing here ever writes
// one; this only compares them.
//
// Spool Beta (spool#282) is main, built on every push: the next patch with
// `-beta.N`, N the build's run number, as `0.55.1-beta.12`. No release ever
// carries a suffix, so the suffix is the whole of what makes a build a beta.

export interface Version {
	major: number;
	minor: number;
	patch: number;
	/** The N of `-beta.N`: a Spool Beta build's. */
	beta?: number;
}

/**
 * Accepts `1.2.3`, `v1.2.3` and a beta's `1.2.3-beta.4`. Anything else is
 * refused rather than guessed at: a tag carrying another suffix, a word or a
 * fourth field is not something this app can rank, and ranking it wrong points
 * somebody at a downgrade.
 */
export function parseVersion(text: string): Version | undefined {
	const match = /^v?([0-9]+)\.([0-9]+)\.([0-9]+)(?:-beta\.([0-9]+))?$/.exec(text);
	if (match === null) return undefined;
	const [, major, minor, patch, beta] = match as unknown as [string, string, string, string, string | undefined];
	const version: Version = { major: Number(major), minor: Number(minor), patch: Number(patch) };
	if (beta !== undefined) version.beta = Number(beta);
	return version;
}

export function formatVersion(version: Version): string {
	const release = `${version.major}.${version.minor}.${version.patch}`;
	return version.beta === undefined ? release : `${release}-beta.${version.beta}`;
}

/** Whether a version is a Spool Beta build's. */
export function isBeta(text: string): boolean {
	return parseVersion(text)?.beta !== undefined;
}

/**
 * Negative when a is older, zero when they are the same, positive when newer.
 * A beta ranks below the release of its own three numbers, as semver has it,
 * and betas of one release rank by their N.
 */
export function compareVersions(a: Version, b: Version): number {
	if (a.major !== b.major) return a.major - b.major;
	if (a.minor !== b.minor) return a.minor - b.minor;
	if (a.patch !== b.patch) return a.patch - b.patch;
	if (a.beta === undefined || b.beta === undefined)
		return (a.beta === undefined ? 1 : 0) - (b.beta === undefined ? 1 : 0);
	return a.beta - b.beta;
}
