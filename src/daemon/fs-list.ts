import { existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * The "+" picker's directory listing (#4/#22): the browser cannot hand spool
 * an absolute path, so the daemon walks its own disk. Directories only,
 * dotfolders hidden, spool projects marked by their canvas.json — detection
 * by the marker, never by scanning for content.
 */

export interface FsEntry {
	name: string;
	path: string;
	isProject: boolean;
}

export interface FsListing {
	path: string;
	parent: string | null;
	dirs: FsEntry[];
}

export function listDirectory(requested: string | undefined): FsListing | undefined {
	let path: string;
	try {
		path = realpathSync(requested === undefined || requested === "" ? homedir() : requested);
	} catch {
		return undefined;
	}
	let dirs: FsEntry[];
	try {
		dirs = readdirSync(path, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
			.map((entry) => {
				const full = join(path, entry.name);
				return { name: entry.name, path: full, isProject: existsSync(join(full, "design", "canvas.json")) };
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return undefined;
	}
	const parent = dirname(path);
	return { path, parent: parent === path ? null : parent, dirs };
}
