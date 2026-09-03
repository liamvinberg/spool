import { type Dirent, existsSync, readdirSync, realpathSync } from "node:fs";
import { access, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { matchName } from "../name-match";
import { readRegistry } from "../registry";
import { summarizeProject } from "./projection";

/**
 * The "+" picker's two reads of the disk (#4/#22/#251/#277): the browser cannot
 * hand spool an absolute path, so the daemon walks its own. Directories only,
 * dotfolders hidden, spool projects marked by their canvas.json — detection by
 * the marker, never by scanning for content.
 *
 * `listDirectory` is one level, the folder you are standing in. `searchDirectories`
 * is the tree under a folder ranked against what you typed, answered from one
 * index of home that stands for the daemon's life: built in the background when
 * the daemon starts, rebuilt behind the picker each time it opens, and never
 * waited on twice.
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
	/** every indexed directory under the searched folder: what "12 of 840 folders" counts */
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

interface Indexed {
	readonly name: string;
	readonly path: string;
	/** the path with every symlink resolved: what scoping and dedupe compare */
	readonly real: string;
	readonly parent: string;
	readonly isProject: boolean;
	readonly depth: number;
	readonly frames?: number;
	readonly openedAt?: string;
}

interface Index {
	readonly key: string;
	readonly home: string;
	readonly dirs: readonly Indexed[];
}

/** One daemon, one home: a second one replaces the first rather than growing a map. */
let cached: Index | undefined;
/** The walk in flight, so two callers in the same second share one rather than start two. */
let building: { readonly key: string; readonly promise: Promise<Index> } | undefined;

export interface IndexOptions {
	home: string;
	spoolDir: string;
}

export interface SearchOptions extends IndexOptions {
	/** the folder to search under — home when absent, and never anywhere outside it */
	under?: string | undefined;
}

/**
 * Walk home again, behind whatever index already stands. The daemon calls it
 * once on start so the first search ever finds an index waiting, and the picker
 * calls it on open so a folder cloned since is in the next one. A search never
 * waits on this unless there is no index at all.
 */
export function refreshIndex({ home, spoolDir }: IndexOptions): Promise<Index> {
	const real = realOrSelf(home);
	const key = `${real}\0${spoolDir}`;
	if (building?.key === key) return building.promise;
	const promise = readTree(real, spoolDir)
		.then((dirs): Index => {
			cached = { key, home: real, dirs };
			return cached;
		})
		.finally(() => {
			if (building?.promise === promise) building = undefined;
		});
	building = { key, promise };
	return promise;
}

/**
 * Every folder under `under` the query answers to, best guess first. `under`
 * outside home is nothing the daemon indexes, and answers undefined.
 *
 * Ties break on what the picker knows and the frame finder never had to: a spool
 * project before a plain folder, then the shallower path, then alphabetically.
 * Depth stays out of the score — `~/personal/projects/gym-brute` and
 * `~/session-archive/2025/gymlog` are not different quality matches, they are
 * different quality guesses.
 */
export async function searchDirectories(query: string, options: SearchOptions): Promise<FsSearch | undefined> {
	const index = await indexOf(options);
	const scope = options.under === undefined ? index.home : realOrSelf(options.under);
	if (scope !== index.home && !scope.startsWith(`${index.home}${sep}`)) return undefined;
	const dirs = scope === index.home ? index.dirs : index.dirs.filter((dir) => dir.real.startsWith(`${scope}${sep}`));

	const wanted = query.trim().toLowerCase();
	if (wanted.length === 0) return { total: dirs.length, answered: 0, hits: [] };

	const scored: { dir: Indexed; score: number; matched: readonly number[] }[] = [];
	for (const dir of dirs) {
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
		total: dirs.length,
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

async function indexOf(options: IndexOptions): Promise<Index> {
	const key = `${realOrSelf(options.home)}\0${options.spoolDir}`;
	if (cached?.key === key) return cached;
	return await refreshIndex(options);
}

interface Level {
	readonly path: string;
	readonly real: string;
	readonly depth: number;
}

/**
 * One bounded walk, breadth first and a level at a time in parallel, so the
 * daemon keeps answering while it runs. Breadth because both bounds cut the
 * deepest folders first, and the deepest folder is the least likely answer.
 *
 * A plain directory is what its dirent says it is; only a symlink is resolved,
 * because only a symlink can point somewhere else. The walk never leaves home:
 * a link whose real path is not inside home is neither indexed nor entered, so
 * a symlink pointing out of `~` is a folder the picker cannot see. Real paths
 * are also what dedupes it — a link to a folder already indexed is the same
 * folder, and it is listed once, under its own name.
 */
async function readTree(home: string, spoolDir: string): Promise<readonly Indexed[]> {
	const registry = registered(spoolDir);
	const inside = `${home}${sep}`;
	const seen = new Set<string>([home]);
	const out: Indexed[] = [];
	let level: Level[] = [{ path: home, real: home, depth: 0 }];

	while (level.length > 0 && out.length < MAX_DIRS) {
		const listed = await Promise.all(level.map(async (dir) => ({ dir, entries: await entriesOf(dir.path) })));
		const found: { dir: Level; name: string; real: string }[] = [];
		for (const { dir, entries } of listed) {
			for (const entry of entries) {
				if (out.length + found.length >= MAX_DIRS) break;
				if (entry.name.startsWith(".")) continue;
				let real: string;
				if (entry.isDirectory()) real = join(dir.real, entry.name);
				else if (entry.isSymbolicLink()) {
					const target = await linkedDirectory(join(dir.path, entry.name), home, inside);
					if (target === undefined) continue;
					real = target;
				} else continue;
				if (seen.has(real)) continue;
				seen.add(real);
				found.push({ dir, name: entry.name, real });
			}
		}
		const projects = await Promise.all(found.map(({ dir, name }) => isProject(join(dir.path, name))));
		const next: Level[] = [];
		found.forEach(({ dir, name, real }, index) => {
			const path = join(dir.path, name);
			const depth = dir.depth + 1;
			const known = registry.get(real);
			out.push({
				name,
				path,
				real,
				parent: dir.path,
				isProject: projects[index] === true,
				depth,
				...(known === undefined ? {} : { openedAt: known.openedAt }),
			});
			if (depth < MAX_DEPTH && !NOT_DESCENDED.has(name)) next.push({ path, real, depth });
		});
		level = next;
	}

	return await countFrames(out);
}

async function entriesOf(path: string): Promise<Dirent[]> {
	try {
		return await readdir(path, { withFileTypes: true });
	} catch {
		return [];
	}
}

/** Where a symlink points, when that is a directory inside home; otherwise nothing. */
async function linkedDirectory(link: string, home: string, inside: string): Promise<string | undefined> {
	try {
		const real = await realpath(link);
		if (real !== home && !real.startsWith(inside)) return undefined;
		return (await stat(real)).isDirectory() ? real : undefined;
	} catch {
		return undefined;
	}
}

async function isProject(path: string): Promise<boolean> {
	try {
		await access(join(path, "design", "canvas.json"));
		return true;
	} catch {
		return false;
	}
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
