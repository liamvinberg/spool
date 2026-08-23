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
 * release's zip, checks it against `latest-mac.yml`'s hash and the app's own
 * code signature, and Squirrel.Mac swaps the bundle on quit. The feed is the
 * GitHub release itself: `app-update.yml`, baked into the bundle by
 * electron-builder, names this repo, and `latest-mac.yml` beside the dmg names
 * the zip. No server of ours is involved.
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

/** Download the newer release, resolving when it is ready to swap in. */
export async function installUpdate(progress: (state: string) => void): Promise<void> {
	const { autoUpdater } = (await import("electron-updater")).default ?? (await import("electron-updater"));
	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = false;
	autoUpdater.on("download-progress", (p) => progress(`download ${Math.round(p.percent)}%`));
	const found = await autoUpdater.checkForUpdates();
	if (found === null) throw new UpdateCheckError("electron-updater found no release to compare against.");
	progress(`downloading ${found.updateInfo.version}`);
	await autoUpdater.downloadUpdate();
	progress("downloaded");
}

/** Hand the exit to Squirrel: the bundle is swapped and the app comes back. */
export function relaunchIntoUpdate(): void {
	// Required lazily for the same reason as above; by the time this runs,
	// installUpdate has already imported the module.
	void import("electron-updater").then((mod) => {
		const updater = (mod.default ?? mod).autoUpdater;
		updater.quitAndInstall();
	});
}
