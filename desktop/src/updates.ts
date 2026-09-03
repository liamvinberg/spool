import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseVersion, type Version } from "./version";

// Is there a newer release than this one, and getting onto it.
//
// One source for a packaged app: electron-updater reads `latest-mac.yml` off
// the newest GitHub release, which is the same file it later installs from, so
// a version it names is always one it can hand to Squirrel. The GitHub API is
// asked only by a copy that has no feed — a checkout build — and that copy can
// only ever be pointed at the download.
//
// The daemon runs its own daily check for the npm package and says so in the
// canvas. That check is off for the copy this app bundles, because npm does not
// own it, which is why the app has a clock of its own (`checkCadence`).

/**
 * `releases/latest` and not the tag list, because it already skips drafts and
 * prereleases. Whatever it names is something a person is meant to install.
 */
const ENDPOINT = "https://api.github.com/repos/liamvinberg/spool/releases/latest";

export const RELEASES_PAGE = "https://github.com/liamvinberg/spool/releases/latest";

/**
 * The dmg itself, under the name that never moves. What a person is handed when
 * the app cannot update itself: a download that starts, not a page to read.
 */
export const DOWNLOAD_URL = "https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg";

export interface Release {
	version: Version;
	/** The release's own page, notes and checksum included. */
	page: string;
}

export class UpdateCheckError extends Error {}

/** The GitHub API's answer, for a copy with no feed to read. */
export async function latestRelease(timeoutMs = 10_000): Promise<Release> {
	let response: Response;
	try {
		response = await fetch(ENDPOINT, {
			headers: { accept: "application/vnd.github+json" },
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (error) {
		throw new UpdateCheckError(`Spool could not reach GitHub: ${(error as Error).message}`);
	}
	if (!response.ok) {
		throw new UpdateCheckError(`GitHub answered ${response.status} instead of naming the latest release.`);
	}
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw new UpdateCheckError("GitHub named a release this app cannot read.");
	}
	const payload = body as { tag_name?: unknown; html_url?: unknown };
	const version = typeof payload.tag_name === "string" ? parseVersion(payload.tag_name) : undefined;
	if (version === undefined || typeof payload.html_url !== "string") {
		throw new UpdateCheckError("GitHub named a release this app cannot compare against its own version.");
	}
	return { version, page: payload.html_url };
}

// MARK: - The cadence

/** The update-notifier cadence, the same one the daemon keeps for npm. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Long enough after launch that the window is up and the daemon has answered. */
export const FIRST_CHECK_DELAY_MS = 10_000;

export interface CheckCache {
	latest: string;
	checkedAt: string;
}

const CACHE_FILE = "app-update.json";

/** Machine-written ephemera: corrupt or unreadable reads as absent. */
export function readCheckCache(directory: string): CheckCache | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(join(directory, CACHE_FILE), "utf8"));
	} catch {
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null) return undefined;
	const cache = parsed as Record<string, unknown>;
	if (typeof cache.latest !== "string" || typeof cache.checkedAt !== "string") return undefined;
	return { latest: cache.latest, checkedAt: cache.checkedAt };
}

export function checkCachePath(directory: string): string {
	return join(directory, CACHE_FILE);
}

/**
 * When the next automatic check is due, given what the cache says. A launch
 * inside the day the last check happened in never re-asks; one after it asks
 * on the first-check delay.
 */
export function nextCheckDelay(cache: CheckCache | undefined, now = Date.now()): number {
	const checkedAt = cache === undefined ? Number.NaN : Date.parse(cache.checkedAt);
	if (!Number.isFinite(checkedAt)) return FIRST_CHECK_DELAY_MS;
	const age = Math.max(0, now - checkedAt);
	return Math.max(FIRST_CHECK_DELAY_MS, CHECK_INTERVAL_MS - age);
}

// MARK: - The updater

/**
 * The self-update. electron-updater downloads the release's zip, checks it
 * against `latest-mac.yml`'s hash, and hands it to Squirrel.Mac, which verifies
 * the new bundle's code signature against this one's and swaps it on quit. The
 * feed is the GitHub release itself: `app-update.yml`, baked into the bundle by
 * electron-builder, names this repo, and `latest-mac.yml` beside the dmg names
 * the zip. No server of ours is involved.
 *
 * Three things about the mac path are worth knowing before changing anything
 * here, because all three are load-bearing and none is obvious from the API.
 *
 *   - Squirrel.Mac cannot be handed a file. electron-updater downloads the zip
 *     itself, then stands up a loopback HTTP server and points Squirrel's own
 *     updater at it. So "downloaded" is two downloads, and only the second one
 *     leaves anything installable behind. `autoInstallOnAppQuit` is what starts
 *     that second one: with it off, `downloadUpdate()` resolves having stood up
 *     a server nobody ever asked for the file, and the relaunch that follows has
 *     nothing to relaunch into. It stays on.
 *   - `downloadUpdate()` resolves when Squirrel has *fetched* the zip from that
 *     loopback server, not when it has unpacked and verified it. Squirrel says
 *     it is ready, or that it refuses, on Electron's own `autoUpdater` a moment
 *     later: `update-downloaded` or `error`. Until one of those arrives nothing
 *     is installable, so `installUpdate` waits for them. It used not to, and
 *     what that looked like was a daemon stopped and a window blanked for an
 *     update macOS had already refused.
 *   - Every failure arrives as an `error` event on the updater, and an
 *     EventEmitter with no `error` listener throws out of whatever emitted it.
 *     On this path that is the main process. The listener below is not
 *     housekeeping; it is the difference between a message and a crash.
 */

export function updaterAvailable(): boolean {
	// The baked feed file is what separates a packaged release from a checkout
	// build; without it electron-updater has nowhere to look. Lazily required so
	// a dev run without node_modules for it still boots.
	try {
		const { existsSync } = require("node:fs") as typeof import("node:fs");
		const { app } = require("electron") as typeof import("electron");
		return app.isPackaged && existsSync(join(process.resourcesPath, "app-update.yml"));
	} catch {
		return false;
	}
}

type Updater = import("electron-updater").AppUpdater;

/** What this needs of Electron's own autoUpdater: the two events Squirrel speaks in. */
export interface Squirrel {
	on(event: "update-downloaded", listener: () => void): unknown;
	on(event: "error", listener: (error: Error) => void): unknown;
	removeListener(event: "update-downloaded", listener: () => void): unknown;
	removeListener(event: "error", listener: (error: Error) => void): unknown;
}

let configured: Updater | undefined;
/** The last thing the updater said went wrong, for the message a person reads. */
let lastError: string | undefined;

/**
 * The one updater, wired once. Listeners are attached here rather than per call
 * so that a second check does not stack a second copy of each, and so that the
 * `error` listener exists before anything can emit one.
 */
async function updater(report: (line: string) => void): Promise<Updater> {
	if (configured !== undefined) return configured;
	const module = await import("electron-updater");
	const instance = (module.default ?? module).autoUpdater;

	// Everything electron-updater and Squirrel have to say, in app.log. A silent
	// failed update is the whole reason this is here: the interesting line is
	// always one this app did not write.
	instance.logger = {
		info: (message) => report(`updater ${String(message)}`),
		warn: (message) => report(`updater WARN ${String(message)}`),
		error: (message) => report(`updater FAIL ${String(message)}`),
	};
	instance.on("error", (error) => {
		lastError = error.message;
		report(`updater FAIL ${error.message}`);
	});

	// Downloading is a thing somebody consented to, not a thing that happens
	// while they read the dialog.
	instance.autoDownload = false;
	// Load-bearing, see above: this is what makes Squirrel fetch the zip.
	instance.autoInstallOnAppQuit = true;
	instance.autoRunAppAfterInstall = true;

	configured = instance;
	return instance;
}

/**
 * Ask the feed what the newest release is. Resolves the version it names and
 * whether that is newer than this copy; throws when the feed cannot be read.
 */
export async function checkForUpdate(report: (line: string) => void): Promise<{ latest: string; newer: boolean }> {
	lastError = undefined;
	const instance = await updater(report);
	let found: Awaited<ReturnType<Updater["checkForUpdates"]>>;
	try {
		found = await instance.checkForUpdates();
	} catch (error) {
		throw new UpdateCheckError(lastError ?? String(error));
	}
	if (found === null) {
		throw new UpdateCheckError("This copy of Spool cannot update itself: it was not packaged as a release.");
	}
	return { latest: found.updateInfo.version, newer: found.isUpdateAvailable };
}

export interface InstallOptions {
	/** Electron's own autoUpdater, which is where Squirrel speaks. Tests hand in a stand-in. */
	squirrel?: () => Squirrel;
	/** How long Squirrel gets to unpack and verify before this gives up on it. */
	readyTimeoutMs?: number;
}

/** Long enough for Squirrel to unpack and verify a bundle on a slow disk. */
const READY_TIMEOUT_MS = 90_000;

function electronSquirrel(): Squirrel {
	const { autoUpdater } = require("electron") as typeof import("electron");
	return autoUpdater;
}

/**
 * Download the newer release and stage it with Squirrel, resolving only once
 * Squirrel has said the bundle is verified and ready to be swapped in. Nothing
 * a caller does before that point is safe to do: a refusal arrives here as the
 * rejection, with the daemon and the window untouched.
 *
 * `progress` is called with a whole percent, and only when it changes, so a
 * caller can put it on screen without filtering.
 */
export async function installUpdate(
	report: (line: string) => void,
	progress: (percent: number) => void,
	options: InstallOptions = {},
): Promise<void> {
	lastError = undefined;
	const instance = await updater(report);
	const squirrel = (options.squirrel ?? electronSquirrel)();

	let shown = -1;
	const onProgress = (info: { percent: number }): void => {
		const percent = Math.min(100, Math.max(0, Math.round(info.percent)));
		if (percent === shown) return;
		shown = percent;
		progress(percent);
	};
	instance.on("download-progress", onProgress);

	// Listened for before the download starts, not after it resolves: Squirrel's
	// verdict follows its fetch, and a listener attached late is a verdict missed.
	let onReady: () => void = () => {};
	let onRefused: (error: Error) => void = () => {};
	let clock: NodeJS.Timeout | undefined;
	const ready = new Promise<void>((resolve, reject) => {
		onReady = () => resolve();
		onRefused = (error) => reject(new UpdateCheckError(error.message));
		squirrel.on("update-downloaded", onReady);
		squirrel.on("error", onRefused);
	});
	// A verdict that arrives during the download is still awaited below; this
	// only keeps an early one from being an unhandled rejection meanwhile.
	ready.catch(() => {});

	try {
		const found = await instance.checkForUpdates();
		if (found === null) {
			throw new UpdateCheckError("This copy of Spool cannot update itself: it was not packaged as a release.");
		}
		if (!found.isUpdateAvailable) {
			throw new UpdateCheckError(
				`The release feed still names ${found.updateInfo.version}, which is not newer than this copy.`,
			);
		}
		report(`downloading ${found.updateInfo.version}`);
		await instance.downloadUpdate();
		report("fetched by squirrel, waiting for it to verify");
		await Promise.race([
			ready,
			new Promise<never>((_, reject) => {
				clock = setTimeout(
					() =>
						reject(
							new UpdateCheckError(
								"macOS took the download but never said whether it accepts it. This usually means Spool is not in Applications, or the copy running is not the one installed there.",
							),
						),
					options.readyTimeoutMs ?? READY_TIMEOUT_MS,
				);
			}),
		]);
		report("staged");
	} catch (error) {
		// The message on the rejection is often `Error: net::ERR_…` with nothing
		// in it; the one the updater emitted usually says which step failed.
		const detail = error instanceof UpdateCheckError ? error.message : (lastError ?? String(error));
		throw new UpdateCheckError(detail);
	} finally {
		if (clock !== undefined) clearTimeout(clock);
		instance.removeListener("download-progress", onProgress);
		squirrel.removeListener("update-downloaded", onReady);
		squirrel.removeListener("error", onRefused);
	}
}

/**
 * Hand the exit to Squirrel: the bundle is swapped and the app comes back.
 *
 * Never resolves on the happy path, because the process it is asking to end is
 * this one. A caller that wants to notice a Squirrel that quietly did nothing
 * has to race this against a clock.
 */
export function relaunchIntoUpdate(): void {
	if (configured === undefined) throw new Error("relaunchIntoUpdate before installUpdate");
	configured.quitAndInstall();
}

/** For the message shown when the relaunch does not happen. */
export function lastUpdaterError(): string | undefined {
	return lastError;
}
