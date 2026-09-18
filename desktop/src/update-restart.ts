import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareVersions, parseVersion } from "./version";

// ShipIt keeps working after this process exits. A Dock launch in that gap
// must exit before opening a window or starting the old bundled daemon.
const FILE = "app-update-restart.json";
export const RESTART_WINDOW_MS = 5 * 60_000;

export function beginUpdateRestart(directory: string, target: string, now = Date.now(), path?: string): void {
	const file = join(directory, FILE);
	writeFileSync(
		`${file}.tmp`,
		JSON.stringify({ target, startedAt: now, ...(validUpdatePath(path) ? { path } : {}) }),
		{ mode: 0o600 },
	);
	renameSync(`${file}.tmp`, file);
}

export function clearUpdateRestart(directory: string): void {
	rmSync(join(directory, FILE), { force: true });
}

export function updateRestartState(
	directory: string,
	installed: string,
	now = Date.now(),
): "none" | "waiting" | "completed" | "expired" {
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(join(directory, FILE), "utf8"));
	} catch {
		return "none";
	}
	if (typeof value !== "object" || value === null || !("target" in value) || !("startedAt" in value)) return "none";
	const target = typeof value.target === "string" ? parseVersion(value.target) : undefined;
	const current = parseVersion(installed);
	if (target === undefined || current === undefined || typeof value.startedAt !== "number") return "none";
	if (!Number.isFinite(value.startedAt)) return "none";
	if (compareVersions(current, target) >= 0) return "completed";
	const age = now - value.startedAt;
	return age >= 0 && age < RESTART_WINDOW_MS ? "waiting" : "expired";
}

function validUpdatePath(path: unknown): path is string {
	return typeof path === "string" && (path === "/" || /^\/p\/[^/?#]+$/.test(path)) && path.length < 4096;
}

export function updateRestartPath(directory: string): string | undefined {
	try {
		const value: unknown = JSON.parse(readFileSync(join(directory, FILE), "utf8"));
		if (typeof value === "object" && value !== null && "path" in value && validUpdatePath(value.path))
			return value.path;
	} catch {
		/* A damaged handoff opens Home. */
	}
	return undefined;
}
