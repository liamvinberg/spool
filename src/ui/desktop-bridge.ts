/**
 * The Mac app's bridge onto the canvas window, when this page is in one.
 *
 * The app carries its own update, separate from the npm package the daemon
 * runs: it is the app that finds, downloads and relaunches into a new release,
 * and this is how the page hears about it and draws it in the update pill it
 * already has. A browser tab has no bridge, and so hears only the daemon.
 *
 * The shape is the app's (`desktop/src/canvas-preload.ts`), written twice
 * because the two programs share no module. Anything on it that does not fit
 * the shape reads as no bridge at all.
 */

export type AppUpdate =
	| { kind: "offer"; version: string }
	| { kind: "checking"; version: string }
	| { kind: "downloading"; version: string; percent: number }
	| { kind: "preparing"; version: string }
	| { kind: "restarting"; version: string }
	| { kind: "failed"; version: string; message: string; retryable: boolean };

export interface DesktopBridge {
	version: string;
	update: AppUpdate | null;
	onUpdate(listener: (update: AppUpdate | null) => void): () => void;
	install(): void;
	dismiss(): void;
}

/** The dmg under the name that never moves, for the pill's way out when the app cannot update itself. */
export const DOWNLOAD_URL = "https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg";

export function isAppUpdate(value: unknown): value is AppUpdate | null {
	if (value === null) return true;
	if (typeof value !== "object") return false;
	const update = value as Record<string, unknown>;
	if (typeof update.version !== "string") return false;
	switch (update.kind) {
		case "offer":
		case "checking":
		case "preparing":
		case "restarting":
			return true;
		case "downloading":
			return (
				typeof update.percent === "number" &&
				Number.isFinite(update.percent) &&
				update.percent >= 0 &&
				update.percent <= 100
			);
		case "failed":
			return typeof update.message === "string" && typeof update.retryable === "boolean";
		default:
			return false;
	}
}

export function desktopBridge(
	host: unknown = typeof window === "undefined" ? undefined : window,
): DesktopBridge | undefined {
	if (typeof host !== "object" || host === null) return undefined;
	const candidate = (host as { spoolApp?: unknown }).spoolApp;
	if (typeof candidate !== "object" || candidate === null) return undefined;
	const bridge = candidate as Record<string, unknown>;
	if (
		typeof bridge.version !== "string" ||
		typeof bridge.onUpdate !== "function" ||
		typeof bridge.install !== "function" ||
		typeof bridge.dismiss !== "function" ||
		!isAppUpdate(bridge.update)
	) {
		return undefined;
	}
	return bridge as unknown as DesktopBridge;
}
