/**
 * Whether this is a Spool Beta build (spool#282): main, built by `.github/workflows/beta.yml` and installed beside
 * Spool as a Mac app of its own, with its own state (`~/.spool-beta`) and port (7768).
 *
 * A beta's version carries `-beta.N` and no released version ever does, so the version is the whole of the mark:
 * the build reads it once (`tsup.config.ts`, `vite.config.ts`) and bakes the answer in here. A checkout, a test and
 * every released build read false.
 */
declare const __SPOOL_BETA__: boolean | undefined;

export const BETA: boolean = typeof __SPOOL_BETA__ === "boolean" && __SPOOL_BETA__;

/** A beta's version: a release's next patch with `-beta.N`, as `0.55.1-beta.12`. */
export function isBetaVersion(version: string): boolean {
	return /^\d+\.\d+\.\d+-beta\.\d+$/.test(version);
}

/** What the build defines `__SPOOL_BETA__` as, for the package version it builds. */
export function channelDefine(version: string): Record<string, string> {
	return { __SPOOL_BETA__: JSON.stringify(isBetaVersion(version)) };
}
