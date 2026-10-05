import { posix } from "node:path";

/** What one path is, as an lstat says: a final symlink is a symlink, not what it points at. */
export type DesignFileKind = "file" | "directory" | "symlink" | "other";

/** One name in a folder, and what it is. */
export interface DesignEntry {
	name: string;
	kind: DesignFileKind;
}

/**
 * The one way a compile reads a project: every file, folder and symlink it
 * looks at, it looks at through this. The daemon hands it the disk; Spool
 * Cloud hands it the project's files held in memory. Paths are absolute.
 *
 * Every method answers undefined for a path with nothing behind it, where a
 * file system would throw.
 */
export interface DesignFiles {
	/** A file's bytes, through any symlinks; undefined when there is no file to read. */
	read(path: string): Uint8Array | undefined;
	/** A folder's names, each with what it is; undefined when there is no folder. */
	list(path: string): readonly DesignEntry[] | undefined;
	/** What is at the path itself. */
	kind(path: string): DesignFileKind | undefined;
	/** The path with every symlink along it followed; undefined when it leads nowhere. */
	realpath(path: string): string | undefined;
}

/**
 * Files held in memory, by absolute path: what a Worker compiles from. Folders
 * are every folder above a file, and there are no symlinks.
 */
export function memoryDesignFiles(files: Iterable<readonly [string, Uint8Array | string]>): DesignFiles {
	const encoder = new TextEncoder();
	const contents = new Map<string, Uint8Array>();
	const folders = new Map<string, Map<string, DesignFileKind>>();
	const folder = (path: string): Map<string, DesignFileKind> => {
		let names = folders.get(path);
		if (names === undefined) {
			names = new Map();
			folders.set(path, names);
		}
		return names;
	};
	for (const [path, bytes] of files) {
		const file = posix.resolve(path);
		contents.set(file, typeof bytes === "string" ? encoder.encode(bytes) : bytes);
		let child = file;
		let kind: DesignFileKind = "file";
		for (let parent = posix.dirname(child); parent !== child; child = parent, parent = posix.dirname(child)) {
			folder(parent).set(posix.basename(child), kind);
			kind = "directory";
		}
	}
	const kind = (path: string): DesignFileKind | undefined => {
		const at = posix.resolve(path);
		return contents.has(at) ? "file" : folders.has(at) ? "directory" : undefined;
	};
	return {
		read: (path) => contents.get(posix.resolve(path)),
		list: (path) => {
			const names = folders.get(posix.resolve(path));
			return names === undefined ? undefined : [...names].map(([name, kind]) => ({ name, kind }));
		},
		kind,
		realpath: (path) => (kind(path) === undefined ? undefined : posix.resolve(path)),
	};
}
