import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, type FSWatcher, realpathSync, type Stats, statSync, watch } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";

/**
 * The git guard: how a local copy tells what git wrote into `design/` from what a person or an agent saved.
 *
 * A team project's `design/` is out of git, but git still writes there: checking out an old branch that tracks
 * `design/` lays its files over the team's, and leaving that branch or pulling the commit that untracked `design/`
 * deletes them. None of that is anybody's save, so none of it may reach the team. The guard says which changes are
 * git's, and the local copy puts the team's version back over them.
 *
 * Git says so itself. While it works it holds the index lock, and when it is done the index records exactly what
 * it wrote: a file whose bytes are the blob the index holds for its path is git's, and so is a path git tracks, or
 * just stopped tracking, that is missing from disk. The index is read again only when it changes.
 */
export interface GitGuard {
	/** Git holds the index lock: it is writing now, and what it writes can't be told apart until it is done. */
	busy(): boolean;
	/** Whether git put this design-relative path in the state it is in now: the bytes on disk, or none. */
	wrote(path: string, bytes: Uint8Array | undefined): boolean;
	close(): void;
}

/** How long a path git stopped tracking still counts as git's when it goes missing. */
const UNTRACKED_GRACE_MS = 30_000;
/** How long the index is let settle after it changes before it is read. */
const SETTLE_MS = 50;

/** No repository around the local copy: nothing there is ever git's. */
const NO_GIT: GitGuard = { busy: () => false, wrote: () => false, close: () => {} };

/**
 * Guard a local copy's `design/` against git. `onIndex` is handed the design-relative paths whose entries in the
 * index changed, as soon as git lets go of it, so the copy can look at them even where the folder watcher missed
 * something (a deleted `design/` takes its watcher with it).
 */
export function guardAgainstGit(designDir: string, onIndex: (paths: string[]) => void): GitGuard {
	const repo = locate(designDir);
	if (repo === undefined) return NO_GIT;
	const { top, index, scope, format } = repo;

	let seen: string | undefined;
	let tracked = new Map<string, string>();
	/** Paths git stopped tracking, with the blob it had and when it let go of them. */
	const untracked = new Map<string, { blob: string; at: number }>();
	let settle: NodeJS.Timeout | undefined;
	let closed = false;

	const busy = () => existsSync(`${index}.lock`);

	/** Read the index again if it changed since the last read, and say which design paths moved in it. */
	const refresh = (): string[] => {
		if (busy()) return [];
		const signature = stamp(statSync(index, { throwIfNoEntry: false }));
		if (signature === seen) return [];
		const now = trackedUnder(top, scope);
		if (now === undefined) return [];
		seen = signature;
		const moved: string[] = [];
		const at = Date.now();
		for (const [path, blob] of tracked) {
			if (now.get(path) === blob) continue;
			moved.push(path);
			if (!now.has(path)) untracked.set(path, { blob, at });
		}
		for (const path of now.keys()) if (!tracked.has(path)) moved.push(path);
		for (const path of now.keys()) untracked.delete(path);
		tracked = now;
		return moved;
	};
	refresh();

	const changed = () => {
		settle = undefined;
		if (closed) return;
		if (busy()) {
			settle = setTimeout(changed, SETTLE_MS);
			return;
		}
		const moved = refresh();
		if (moved.length > 0) onIndex(moved);
	};
	let watcher: FSWatcher | undefined;
	try {
		watcher = watch(dirname(index), (_type, name) => {
			if (name !== null && !name.startsWith(basename(index))) return;
			settle ??= setTimeout(changed, SETTLE_MS);
		});
		watcher.on("error", () => watcher?.close());
	} catch {
		// an index folder that can't be watched is still read at every check
	}

	return {
		busy,
		wrote(path, bytes) {
			refresh();
			const gone = untracked.get(path);
			const recent = gone !== undefined && Date.now() - gone.at < UNTRACKED_GRACE_MS ? gone.blob : undefined;
			if (bytes === undefined) return tracked.has(path) || recent !== undefined;
			const blob = blobId(bytes, format);
			return tracked.get(path) === blob || recent === blob;
		},
		close() {
			closed = true;
			if (settle !== undefined) clearTimeout(settle);
			watcher?.close();
		},
	};
}

interface Repository {
	/** The work tree's top. */
	top: string;
	/** This work tree's index file: a linked worktree has its own. */
	index: string;
	/** `design/` as git spells it from the top. */
	scope: string;
	format: "sha1" | "sha256";
}

function locate(designDir: string): Repository | undefined {
	const said = git(designDir, ["rev-parse", "--show-toplevel", "--git-path", "index", "--show-object-format"]);
	if (said === undefined) return undefined;
	const [top, index, format] = said.split("\n");
	if (top === undefined || index === undefined) return undefined;
	const real = realpathSync(top);
	const scope = relative(real, realpathSync(designDir)).split(sep).join("/");
	if (scope === "" || scope.startsWith("..")) return undefined;
	return { top: real, index: resolve(designDir, index), scope, format: format === "sha256" ? "sha256" : "sha1" };
}

/** What the index tracks under `design/`: each design-relative path and its blob. */
function trackedUnder(top: string, scope: string): Map<string, string> | undefined {
	const listed = git(top, ["ls-files", "--stage", "-z", "--", scope]);
	if (listed === undefined) return undefined;
	const tracked = new Map<string, string>();
	for (const entry of listed.split("\0")) {
		const match = /^\d+ ([0-9a-f]+) \d\t(.+)$/su.exec(entry);
		if (match?.[1] === undefined || match[2] === undefined) continue;
		tracked.set(match[2].slice(scope.length + 1), match[1]);
	}
	return tracked;
}

/** The id git gives these bytes as a blob. */
function blobId(bytes: Uint8Array, format: "sha1" | "sha256"): string {
	return createHash(format).update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

function stamp(stats: Stats | undefined): string {
	return stats === undefined ? "" : `${stats.ino}:${stats.size}:${stats.mtimeMs}`;
}

/** One git read, with the daemon's own git environment taken off it, as history does. */
function git(cwd: string, args: readonly string[]): string | undefined {
	try {
		return execFileSync("git", [...args], {
			cwd,
			encoding: "utf8",
			env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined },
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 15_000,
			windowsHide: true,
		}).trimEnd();
	} catch {
		return undefined;
	}
}
