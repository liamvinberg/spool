import { type FSWatcher, readdirSync, statSync, watch } from "node:fs";
import { basename, join, relative, sep } from "node:path";

/**
 * One watch over a folder and everything under it, on every platform.
 *
 * `fs.watch(dir, { recursive: true })` is the whole of this where the OS walks
 * the tree itself — FSEvents on macOS, `ReadDirectoryChangesW` on Windows.
 * Linux has no such call, so Node emulates it in JS by opening a watch on every
 * *file* it finds; an inotify watch belongs to an inode rather than to a name,
 * and `writeAtomic` replaces the inode behind the name every time it writes. So
 * the first edit to a file was announced and no edit after it ever was: the
 * canvas heard a frame change once and then went deaf to it for the life of the
 * daemon.
 *
 * Watching folders is what survives that. A folder's inode outlives whatever
 * happens to the names inside it, so a rename into it keeps reporting for as
 * long as the folder is there — at one handle per directory instead of one per
 * file, which is also fewer handles than the emulation was already taking.
 */
export interface TreeWatch {
	close(): void;
}

/** Whether the OS walks the tree, or we do. */
const NATIVE_RECURSIVE = process.platform === "darwin" || process.platform === "win32";

/**
 * Watch `dir` and everything under it. `onPath` is handed each changed path
 * relative to `dir`, or `null` where the platform named none. `onError` is the
 * watch itself failing, which is the caller's to recover from — a single folder
 * underneath going away is not one.
 */
export function watchTree(dir: string, onPath: (filename: string | null) => void, onError: () => void): TreeWatch {
	return NATIVE_RECURSIVE ? nativeTree(dir, onPath, onError) : watchFolders(dir, onPath, onError);
}

/** The OS's own recursive watch, which is one handle and no bookkeeping. */
function nativeTree(dir: string, onPath: (filename: string | null) => void, onError: () => void): TreeWatch {
	const watcher = watch(dir, { recursive: true }, (_type, filename) => onPath(named(filename)));
	watcher.on("error", onError);
	return { close: () => watcher.close() };
}

/**
 * A handle per folder, kept in step with the folders as they come and go.
 *
 * Exported so the tests can hold it to the same promises everywhere rather than
 * only on the platforms that fall back to it; `watchTree` is what callers want.
 */
export function watchFolders(root: string, onPath: (filename: string | null) => void, onError: () => void): TreeWatch {
	const open = new Map<string, FSWatcher>();
	let closed = false;

	const say = (path: string): void => onPath(path === "" ? null : path);

	const add = (dir: string): void => {
		if (closed || open.has(dir)) return;
		let watcher: FSWatcher;
		try {
			watcher = watch(dir);
		} catch {
			// a folder that went between the read and the watch: its parent is
			// watching, and its going is an event of its own
			return;
		}
		open.set(dir, watcher);
		watcher.on("error", () => {
			watcher.close();
			open.delete(dir);
			// one folder's handle failing is not the tree failing — unless it is
			// the root's, which is the whole watch
			if (dir === root) onError();
		});
		watcher.on("change", (_type, name) => {
			const child = named(name);
			if (child === null) return say(relative(root, dir));
			const path = join(dir, child);
			// kqueue names the folder itself rather than what changed inside it, so
			// a name that matches this folder and is not in it is this folder
			if (child === basename(dir) && !exists(path)) return say(relative(root, dir));
			say(relative(root, path));
			if (isDirectory(path)) enter(path);
			else prune(path);
		});
		for (const child of childFolders(dir)) add(child);
	};

	/**
	 * A folder that has just appeared. Whatever landed in it before the handle
	 * was open is announced by hand, because nothing else will: a `mkdir` and the
	 * writes into it are one burst, and the watch arrives in the middle of it.
	 */
	const enter = (dir: string): void => {
		if (open.has(dir)) return;
		add(dir);
		for (const path of everythingIn(dir)) say(relative(root, path));
	};

	/** A folder that has gone takes its handles, and its descendants', with it. */
	const prune = (path: string): void => {
		if (!open.has(path)) return;
		const under = `${path}${sep}`;
		for (const [dir, watcher] of open) {
			if (dir !== path && !dir.startsWith(under)) continue;
			watcher.close();
			open.delete(dir);
		}
	};

	add(root);
	if (!open.has(root)) throw new Error(`cannot watch ${root}`);
	return {
		close: () => {
			closed = true;
			for (const watcher of open.values()) watcher.close();
			open.clear();
		},
	};
}

/** The name a watch reported, with "no name" and "" as the same answer. */
function named(filename: string | Buffer | null): string | null {
	if (filename === null) return null;
	const name = typeof filename === "string" ? filename : filename.toString();
	return name === "" ? null : name;
}

function isDirectory(path: string): boolean {
	return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
}

function exists(path: string): boolean {
	return statSync(path, { throwIfNoEntry: false }) !== undefined;
}

function childFolders(dir: string): string[] {
	try {
		return readdirSync(dir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => join(dir, entry.name));
	} catch {
		return [];
	}
}

function everythingIn(dir: string): string[] {
	try {
		return readdirSync(dir, { recursive: true }).map((name) => join(dir, name.toString()));
	} catch {
		return [];
	}
}
