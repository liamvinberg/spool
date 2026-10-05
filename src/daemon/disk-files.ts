import { type Dirent, lstatSync, readdirSync, readFileSync, realpathSync, type Stats } from "node:fs";
import type { DesignFileKind, DesignFiles } from "./design-files";

function kindOf(found: Dirent | Stats): DesignFileKind {
	if (found.isSymbolicLink()) return "symlink";
	if (found.isFile()) return "file";
	return found.isDirectory() ? "directory" : "other";
}

/** The disk, as the daemon compiles from it. */
export const diskDesignFiles: DesignFiles = {
	read(path) {
		try {
			return readFileSync(path);
		} catch {
			return undefined;
		}
	},
	list(path) {
		try {
			return readdirSync(path, { withFileTypes: true }).map((entry) => ({ name: entry.name, kind: kindOf(entry) }));
		} catch {
			return undefined;
		}
	},
	kind(path) {
		try {
			return kindOf(lstatSync(path));
		} catch {
			return undefined;
		}
	},
	realpath(path) {
		try {
			return realpathSync(path);
		} catch {
			return undefined;
		}
	},
};
