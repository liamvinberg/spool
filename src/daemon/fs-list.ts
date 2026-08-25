import { type Dirent, existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { matchName } from "../name-match";
import { readRegistry } from "../registry";
import { summarizeProject } from "./projection";

/**
 * The "+" picker's two reads of the disk (#4/#22/#251): the browser cannot hand
 * spool an absolute path, so the daemon walks its own. Directories only,
 * dotfolders hidden, spool projects marked by their canvas.json — detection by
 * the marker, never by scanning for content.
 *
 * `listDirectory` is one level, the folder you are standing in. `searchDirectories`
 * is the whole tree under home ranked against what you typed, because the folder
 * anybody wants is three levels down and the one folder in that list spool could
 * have recognised on sight.
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

export interface FsHit extends FsEntry {
	parent: string;
	/** indices into `name` the query landed on, ascending */
	matched: readonly number[];
	/** what the registry knows about a project spool has opened before */
	frames?: number;
	openedAt?: string;
}

export interface FsSearch {
	/** every directory the walk indexed: what "12 of 840 folders under ~" counts */
	total: number;
	/** how many of them answered — the wire carries the best `MAX_HITS` of these */
	answered: number;
	hits: FsHit[];
}

/**
 * Folders a walk does not go inside. They are still listed, because a project
 * can be named `build` and browsing shows them anyway — it is what is under them
 * that nobody is searching for.
 */
const NOT_DESCENDED = new Set(["node_modules", "Library", ".git", "target", "dist", "build", "vendor", "Pods"]);

/**
 * Five levels under home. Projects live at two or three (`~/personal/projects/spool`),
 * and past five a walk is reading somebody's dependency tree rather than their work.
 */
const MAX_DEPTH = 5;

/** A ceiling on the index, so a pathological home cannot turn the picker into a disk scan. */
const MAX_DIRS = 20_000;

/** The ranked list is the product; past two hundred rows it is noise the readout still counts. */
const MAX_HITS = 200;

/**
 * How long an index stands. The picker is a door somebody opens for a second,
 * so a folder made ten seconds ago being absent is cheaper than a recursive
 * watcher on a home directory.
 */
const CACHE_TTL_MS = 30_000;

interface Indexed {
	readonly name: string;
	readonly path: string;
	readonly parent: string;
	readonly isProject: boolean;
	readonly depth: number;
	readonly frames?: number;
	readonly openedAt?: string;
}

interface Index {
	readonly home: string;
	readonly spoolDir: string;
	readonly builtAt: number;
	readonly dirs: readonly Indexed[];
}

/** One daemon, one home: a second one replaces the first rather than growing a map. */
let cached: Index | undefined;

export interface SearchOptions {
	home: string;
	spoolDir: string;
	/** the clock, so a test can age an index rather than wait out its TTL */
	now?: () => number;
}

/**
 * Every folder under home the query answers to, best guess first.
 *
 * Ties break on what the picker knows and the frame finder never had to: a spool
 * project before a plain folder, then the shallower path, then alphabetically.
 * Depth stays out of the score — `~/personal/projects/gym-brute` and
 * `~/session-archive/2025/gymlog` are not different quality matches, they are
 * different quality guesses.
 */
export async function searchDirectories(query: string, options: SearchOptions): Promise<FsSearch> {
	const index = await indexOf(options);
	const wanted = query.trim().toLowerCase();
	if (wanted.length === 0) return { total: index.dirs.length, answered: 0, hits: [] };

	const scored: { dir: Indexed; score: number; matched: readonly number[] }[] = [];
	for (const dir of index.dirs) {
		const found = matchName(wanted, dir.name.toLowerCase());
		if (found === null) continue;
		scored.push({ dir, score: found.score, matched: found.matched });
	}
	scored.sort(
		(a, b) =>
			b.score - a.score ||
			Number(b.dir.isProject) - Number(a.dir.isProject) ||
			a.dir.depth - b.dir.depth ||
			a.dir.name.localeCompare(b.dir.name),
	);

	return {
		total: index.dirs.length,
		answered: scored.length,
		hits: scored.slice(0, MAX_HITS).map(({ dir, matched }) => ({
			name: dir.name,
			path: dir.path,
			parent: dir.parent,
			isProject: dir.isProject,
			matched,
			...(dir.frames === undefined ? {} : { frames: dir.frames }),
			...(dir.openedAt === undefined ? {} : { openedAt: dir.openedAt }),
		})),
	};
}

async function indexOf({ home, spoolDir, now = Date.now }: SearchOptions): Promise<Index> {
	const real = realOrSelf(home);
	if (
		cached !== undefined &&
		cached.home === real &&
		cached.spoolDir === spoolDir &&
		now() - cached.builtAt < CACHE_TTL_MS
	) {
		return cached;
	}
	const dirs = await readTree(real, spoolDir);
	cached = { home: real, spoolDir, builtAt: now(), dirs };
	return cached;
}

/**
 * One bounded walk, breadth first. Breadth because both bounds cut the deepest
 * folders first, and the deepest folder is the least likely answer.
 *
 * The walk never leaves home: a directory whose real path is not inside home is
 * neither indexed nor entered, so a symlink pointing out of `~` is a folder the
 * picker cannot see. Real paths are also what dedupes it — a symlink to a folder
 * already indexed is the same folder, and it is listed once, under its own name.
 */
async function readTree(home: string, spoolDir: string): Promise<readonly Indexed[]> {
	const registry = registered(spoolDir);
	const inside = `${home}${sep}`;
	const seen = new Set<string>([home]);
	const out: Indexed[] = [];
	let queue: { path: string; depth: number }[] = [{ path: home, depth: 0 }];

	while (queue.length > 0 && out.length < MAX_DIRS) {
		const next: { path: string; depth: number }[] = [];
		for (const { path, depth } of queue) {
			if (out.length >= MAX_DIRS) break;
			let entries: Dirent[];
			try {
				entries = readdirSync(path, { withFileTypes: true });
			} catch {
				continue;
			}
			for (const entry of entries) {
				if (out.length >= MAX_DIRS) break;
				if (entry.name.startsWith(".")) continue;
				if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
				const full = join(path, entry.name);
				let real: string;
				try {
					real = realpathSync(full);
				} catch {
					continue;
				}
				if (real !== home && !real.startsWith(inside)) continue;
				if (seen.has(real)) continue;
				// a symlink's target decides: `entry.isDirectory()` is false for every one of them
				try {
					if (!statSync(real).isDirectory()) continue;
				} catch {
					continue;
				}
				seen.add(real);
				const known = registry.get(real);
				out.push({
					name: entry.name,
					path: full,
					parent: path,
					isProject: existsSync(join(full, "design", "canvas.json")),
					depth: depth + 1,
					...(known === undefined ? {} : { openedAt: known.openedAt }),
				});
				if (depth + 1 < MAX_DEPTH && !NOT_DESCENDED.has(entry.name)) next.push({ path: full, depth: depth + 1 });
			}
		}
		queue = next;
	}

	return await countFrames(out);
}

/** What the registry already holds about the projects on this machine. */
function registered(spoolDir: string): Map<string, { openedAt: string }> {
	try {
		return new Map(readRegistry(spoolDir).projects.map((project) => [project.root, { openedAt: project.openedAt }]));
	} catch {
		return new Map();
	}
}

/**
 * The frame counts, for the registered projects the walk found and only those:
 * a count is a walk of a whole design folder, and it is the same read the home
 * card already makes.
 */
async function countFrames(dirs: readonly Indexed[]): Promise<readonly Indexed[]> {
	const counted = new Map(
		await Promise.all(
			dirs
				.filter((dir) => dir.openedAt !== undefined)
				.map(async (dir) => [dir.path, (await summarize(dir.path)).frameCount] as const),
		),
	);
	return dirs.map((dir) => {
		const frames = counted.get(dir.path);
		return frames === undefined ? dir : { ...dir, frames };
	});
}

async function summarize(root: string): Promise<{ frameCount: number }> {
	try {
		return await summarizeProject(root);
	} catch {
		return { frameCount: 0 };
	}
}

function realOrSelf(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}
