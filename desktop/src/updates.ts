import { parseVersion, type Version } from "./version";

// Is there a newer release than this one?
//
// The whole mechanism, and it is deliberately small: ask GitHub what the latest
// release is and hand back the number. Nothing downloads itself and nothing
// replaces itself. The app has no updater, it has a question it can ask.
//
// It is asked only when somebody clicks the menu item. The daemon runs its own
// daily check for the npm package and says so in the canvas; a second timer in
// the app would be the same news twice from two places.

/**
 * `releases/latest` and not the tag list, because it already skips drafts and
 * prereleases. Whatever it names is something a person is meant to install.
 */
const ENDPOINT = "https://api.github.com/repos/liamvinberg/spool/releases/latest";

export const RELEASES_PAGE = "https://github.com/liamvinberg/spool/releases/latest";

export interface Release {
	version: Version;
	/**
	 * The release's own page, notes and checksum included, rather than the dmg
	 * itself. What to install is worth a look before it downloads.
	 */
	page: string;
}

export class UpdateCheckError extends Error {}

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

// MARK: - Installing one

/**
 * The self-update, on top of the check above. electron-updater downloads the
 * release's zip, checks it against `latest-mac.yml`'s hash, and hands it to
 * Squirrel.Mac, which verifies the new bundle's code signature against this
 * one's and swaps it on quit. The feed is the GitHub release itself:
 * `app-update.yml`, baked into the bundle by electron-builder, names this repo,
 * and `latest-mac.yml` beside the dmg names the zip. No server of ours is
 * involved.
 *
 * Two things about the mac path are worth knowing before changing anything here,
 * because both are load-bearing and neither is obvious from the API.
 *
 *   - Squirrel.Mac cannot be handed a file. electron-updater downloads the zip
 *     itself, then stands up a loopback HTTP server and points Squirrel's own
 *     updater at it. So "downloaded" is two downloads, and only the second one
 *     leaves anything installable behind. `autoInstallOnAppQuit` is what starts
 *     that second one: with it off, `downloadUpdate()` resolves having stood up
 *     a server nobody ever asked for the file, and the relaunch that follows has
 *     nothing to relaunch into. It stays on.
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
		const { join } = require("node:path") as typeof import("node:path");
		const { app } = require("electron") as typeof import("electron");
		return app.isPackaged && existsSync(join(process.resourcesPath, "app-update.yml"));
	} catch {
		return false;
	}
}

type Updater = import("electron-updater").AppUpdater;

let configured: Updater | undefined;
/** The last thing the updater said went wrong, for the message a person reads. */
let lastError: string | undefined;

/**
 * The one updater, wired once. Listeners are attached here rather than per call
 * so that a second Check for Updates does not stack a second copy of each, and
 * so that the `error` listener exists before anything can emit one.
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
 * Download the newer release and stage it with Squirrel, resolving when the
 * bundle is ready to be swapped in.
 *
 * `progress` is called with a whole percent, and only when it changes, so a
 * caller can put it on screen without filtering.
 */
export async function installUpdate(
	report: (line: string) => void,
	progress: (percent: number) => void,
): Promise<void> {
	lastError = undefined;
	const instance = await updater(report);

	let shown = -1;
	const onProgress = (info: { percent: number }): void => {
		const percent = Math.min(100, Math.max(0, Math.round(info.percent)));
		if (percent === shown) return;
		shown = percent;
		progress(percent);
	};
	instance.on("download-progress", onProgress);
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
		report("staged");
	} catch (error) {
		// The message on the rejection is often `Error: net::ERR_…` with nothing
		// in it; the one the updater emitted usually says which step failed.
		const detail = error instanceof UpdateCheckError ? error.message : (lastError ?? String(error));
		throw new UpdateCheckError(detail);
	} finally {
		instance.removeListener("download-progress", onProgress);
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
