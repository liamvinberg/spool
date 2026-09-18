import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WindowRect } from "./play-window";
import { compareVersions, parseVersion } from "./version";

// ShipIt keeps working after this process exits. A Dock launch in that gap
// must exit before opening a window or starting the old bundled daemon.
const FILE = "app-update-restart.json";
export const RESTART_WINDOW_MS = 5 * 60_000;

export interface UpdateWorkspace {
	path?: string;
	rect?: WindowRect;
	maximized?: boolean;
	fullscreen?: boolean;
}

export function beginUpdateRestart(
	directory: string,
	target: string,
	now = Date.now(),
	workspace: UpdateWorkspace = {},
): void {
	const file = join(directory, FILE);
	writeFileSync(`${file}.tmp`, JSON.stringify({ target, startedAt: now, ...workspace }), { mode: 0o600 });
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

export function updateRestartWorkspace(directory: string): UpdateWorkspace {
	try {
		const value: unknown = JSON.parse(readFileSync(join(directory, FILE), "utf8"));
		if (typeof value !== "object" || value === null) return {};
		const workspace: UpdateWorkspace = {};
		if ("path" in value && validUpdatePath(value.path)) workspace.path = value.path;
		if ("rect" in value && validRect(value.rect)) workspace.rect = value.rect;
		if ("maximized" in value && typeof value.maximized === "boolean") workspace.maximized = value.maximized;
		if ("fullscreen" in value && typeof value.fullscreen === "boolean") workspace.fullscreen = value.fullscreen;
		return workspace;
	} catch {
		return {};
	}
}

function validRect(value: unknown): value is WindowRect {
	return (
		typeof value === "object" &&
		value !== null &&
		"x" in value &&
		typeof value.x === "number" &&
		Number.isFinite(value.x) &&
		"y" in value &&
		typeof value.y === "number" &&
		Number.isFinite(value.y) &&
		"w" in value &&
		typeof value.w === "number" &&
		value.w >= 720 &&
		value.w <= 32768 &&
		"h" in value &&
		typeof value.h === "number" &&
		value.h >= 480 &&
		value.h <= 32768
	);
}
