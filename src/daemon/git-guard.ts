import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, type FSWatcher, realpathSync, type Stats, statSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { watchFolder } from "./watch-tree";

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
	/** The copy has looked at everything once: what git did while nobody watched no longer counts as git's. */
	watching(): void;
	close(): void;
}

/** How long a path git stopped tracking still counts as git's when it goes missing. */
const UNTRACKED_GRACE_MS = 30_000;
/** How long the index is let settle after it changes before it is read. */
const SETTLE_MS = 50;
/** The most reflog entries looked through for what git did while nobody watched: the newest are what matter. */
const REFLOG_ENTRIES = 100;

const run = promisify(execFile);

/**
 * Guard a local copy's `design/` against git. `onIndex` is handed the design-relative paths whose entries in the
 * index changed, as soon as git lets go of it, so the copy can look at them even where the folder watcher missed
 * something (a deleted `design/` takes its watcher with it).
 *
 * `since` is when the copy last watched `design/` (ms), if it ever did. Git may have written there in between,
 * with no guard running: an old branch checked out and left while the daemon was down, or while the copy wasn't
 * followed. Until `watching()`, what any commit HEAD stood on since then held under `design/` counts as git's too.
 *
 * Git runs off the daemon's event loop. Until the guard has read the repository, and whenever the index changed
 * since it last read it, it is `busy()`: what changed meanwhile waits to be looked at against the index as it is.
 */
export function guardAgainstGit(designDir: string, onIndex: (paths: string[]) => void, since?: number): GitGuard {
	/** The repository, once looked for: none means nothing here is ever git's. */
	let repo: Repository | undefined;
	let ready = false;
	let away = new Map<string, Set<string>>();
	let seen: string | undefined;
	let tracked = new Map<string, string>();
	/** Paths git stopped tracking, with the blob it had and when it let go of them. */
	const untracked = new Map<string, { blob: string; at: number }>();
	let reading: Promise<void> | undefined;
	let settle: NodeJS.Timeout | undefined;
	let closed = false;
	let watcher: FSWatcher | undefined;

	const indexStamp = () => (repo === undefined ? "" : stamp(statSync(repo.index, { throwIfNoEntry: false })));
	const locked = () => repo !== undefined && existsSync(`${repo.index}.lock`);

	/** Read the index again, for as long as it keeps changing under the read, and say which design paths moved. */
	const refresh = (): Promise<void> =>
		(reading ??= (async () => {
			while (repo !== undefined && !closed && !locked()) {
				const signature = indexStamp();
				if (signature === seen) return;
				const now = await trackedUnder(repo.top, repo.scope);
				if (now === undefined || closed) return;
				if (indexStamp() !== signature) continue;
				const first = seen === undefined;
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
				if (!first && moved.length > 0) onIndex(moved);
			}
		})().finally(() => {
			reading = undefined;
		}));

	const changed = () => {
		settle = undefined;
		if (closed) return;
		if (locked()) {
			settle = setTimeout(changed, SETTLE_MS);
			return;
		}
		void refresh();
	};

	void (async () => {
		repo = await locate(designDir);
		if (repo === undefined || closed) {
			ready = true;
			return;
		}
		if (since !== undefined) away = await visitedSince(repo.top, repo.scope, since);
		await refresh();
		ready = true;
		if (closed) return;
		try {
			const { index } = repo;
			watcher = watchFolder(dirname(index), {}, (_type, name) => {
				if (name !== null && !name.startsWith(basename(index))) return;
				settle ??= setTimeout(changed, SETTLE_MS);
			});
			watcher.on("error", () => watcher?.close());
		} catch {
			// an index folder that can't be watched is still read at every check
		}
	})();

	return {
		busy() {
			if (!ready) return true;
			if (repo === undefined) return false;
			if (locked()) return true;
			// the index moved since it was read: it is read now, and what changed waits for it
			if (indexStamp() === seen) return false;
			void refresh();
			return true;
		},
		wrote(path, bytes) {
			if (repo === undefined) return false;
			const gone = untracked.get(path);
			const recent = gone !== undefined && Date.now() - gone.at < UNTRACKED_GRACE_MS ? gone.blob : undefined;
			const visited = away.get(path);
			if (bytes === undefined) return tracked.has(path) || recent !== undefined || visited !== undefined;
			const blob = blobId(bytes, repo.format);
			return tracked.get(path) === blob || recent === blob || visited?.has(blob) === true;
		},
		watching() {
			away = new Map();
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

async function locate(designDir: string): Promise<Repository | undefined> {
	const said = await git(designDir, ["rev-parse", "--show-toplevel", "--git-path", "index", "--show-object-format"]);
	if (said === undefined) return undefined;
	const [top, index, format] = said.split("\n");
	if (top === undefined || index === undefined) return undefined;
	const real = realpathSync(top);
	const scope = relative(real, realpathSync(designDir)).split(sep).join("/");
	if (scope === "" || scope.startsWith("..")) return undefined;
	return { top: real, index: resolve(designDir, index), scope, format: format === "sha256" ? "sha256" : "sha1" };
}

/** What the index tracks under `design/`: each design-relative path and its blob. */
async function trackedUnder(top: string, scope: string): Promise<Map<string, string> | undefined> {
	const listed = await git(top, ["ls-files", "--stage", "-z", "--", scope]);
	if (listed === undefined) return undefined;
	const tracked = new Map<string, string>();
	for (const entry of listed.split("\0")) {
		const match = /^\d+ ([0-9a-f]+) \d\t(.+)$/su.exec(entry);
		if (match?.[1] === undefined || match[2] === undefined) continue;
		tracked.set(match[2].slice(scope.length + 1), match[1]);
	}
	return tracked;
}

/**
 * Every path under `design/`, with its blobs, in the commits HEAD stood on since `since` (ms): each one the reflog
 * moved it to from then on, and the one it was already on. Leaving that last one is what takes its files away.
 */
async function visitedSince(top: string, scope: string, since: number): Promise<Map<string, Set<string>>> {
	const visited = new Map<string, Set<string>>();
	const reflog = await git(top, [
		"log",
		"--walk-reflogs",
		`--max-count=${REFLOG_ENTRIES}`,
		"--date=unix",
		"--format=%H %gd",
		"HEAD",
	]);
	if (reflog === undefined) return visited;
	const commits = new Set<string>();
	for (const line of reflog.split("\n")) {
		const match = /^([0-9a-f]+) .*@\{(\d+)\}$/u.exec(line);
		if (match?.[1] === undefined || match[2] === undefined) continue;
		commits.add(match[1]);
		// the reflog counts in seconds: stop at the first entry wholly before `since`, having kept it
		if ((Number(match[2]) + 1) * 1_000 <= since) break;
	}
	for (const commit of commits) {
		const listed = await git(top, ["ls-tree", "-r", "-z", commit, "--", scope]);
		for (const entry of listed?.split("\0") ?? []) {
			const match = /^\d+ blob ([0-9a-f]+)\t(.+)$/su.exec(entry);
			if (match?.[1] === undefined || match[2] === undefined) continue;
			const path = match[2].slice(scope.length + 1);
			visited.set(path, (visited.get(path) ?? new Set()).add(match[1]));
		}
	}
	return visited;
}

/** The id git gives these bytes as a blob. */
function blobId(bytes: Uint8Array, format: "sha1" | "sha256"): string {
	return createHash(format).update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

function stamp(stats: Stats | undefined): string {
	return stats === undefined ? "" : `${stats.ino}:${stats.size}:${stats.mtimeMs}`;
}

/** One git read, off the event loop, with the daemon's own git environment taken off it, as history does. */
async function git(cwd: string, args: readonly string[]): Promise<string | undefined> {
	try {
		const { stdout } = await run("git", [...args], {
			cwd,
			encoding: "utf8",
			env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined },
			maxBuffer: 256 * 1024 * 1024,
			timeout: 15_000,
			windowsHide: true,
		});
		return stdout.trimEnd();
	} catch {
		return undefined;
	}
}
