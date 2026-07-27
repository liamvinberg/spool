import { type Dirent, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Cover } from "../cover";
import { DEFAULT_COLS, DEFAULT_ROWS, pxForCells } from "../term/cells";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import { readGeometry, writeGeometryIfAbsent } from "./geometry";
import { isSafeName } from "./project-files";
import { coverModified, scanCovers } from "./thumbs";

/**
 * The canvas projection of design/frames (#22), one level of grouping deep
 * (#39): a frame is a folder holding a frame entry at the top level (the root
 * page) or exactly one level down (a named page). Identity is the bare leaf
 * name, unique project-wide — a name claimed twice is surfaced as a collision,
 * never resolved by guessing. Geometry is the one thing hands own; a frame
 * born without a sidecar gets one filled in here — placed beside its own
 * page's field, written to disk so placement is durable, never re-rolled per
 * request (#3: "optional frame.json, app fills in").
 *
 * The kind discriminant (#42) is the entry filename — frame.tsx is html,
 * term.tsx is terminal — because a kind must stay knowable by every layer
 * even while source is broken mid-edit; a filename survives a syntax error.
 * Both entries in one folder is a discovery error naming the folder: it
 * projects as html so the canvas can show the error document.
 */

export type FrameKind = "html" | "term";

export type TerminalCoverUnavailable = { kind: "stale"; message: string } | { kind: "never-run"; message: string };

export type TerminalCoverState = { kind: "current" } | TerminalCoverUnavailable;

/**
 * One read of a terminal's persisted screen, answering both things the canvas
 * needs: whether it is current, and what addresses it. The ladder is absent
 * until a screen has been persisted once — a live session that has never saved
 * has nothing a reboot would land in.
 */
export interface TerminalCover {
	state: TerminalCoverState;
	cover?: Cover;
}

export interface ProjectedFrame {
	name: string;
	kind: FrameKind;
	/** The named page holding the frame's folder; absent on the root page. */
	page?: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/**
	 * The frame's cover ladder (#111) — absent when it has none, which is what
	 * the canvas reads as "show the placeholder". Terminal frames are filled in
	 * from their persisted screen, which only the session store can address.
	 */
	cover?: Cover;
	/** Terminal-only cover truth; unavailable states carry the canvas message. */
	terminalCover?: TerminalCoverState;
}

export interface FrameCollision {
	name: string;
	/** Every design-relative folder claiming the name, sorted. */
	paths: string[];
}

export interface Projection {
	root: string;
	/** Named pages, sorted, empty ones included; the root page is implied. */
	pages: string[];
	frames: ProjectedFrame[];
	collisions: FrameCollision[];
}

/** Where a bare frame name lands on disk — or why it cannot. */
export type FrameLookup =
	| { kind: "found"; dir: string; frameKind: FrameKind; page?: string }
	| { kind: "missing" }
	| { kind: "collision"; paths: string[] };

export function frameKind(frameDir: string, designDir: string): FrameKind | "conflict" | undefined {
	let directory: string;
	try {
		directory = resolveDesignPath(designDir, frameDir);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
	return entryKind(directory);
}

/**
 * The kind marker inside a folder already known to sit in design/. Callers that
 * built the path from a resolved parent and a `readdirSync` entry that reports
 * itself a directory — a symlink never does — have nothing left to resolve, and
 * resolving anyway costs two `realpath` calls per frame on every discovery.
 */
function entryKind(directory: string): FrameKind | "conflict" | undefined {
	const present = (entry: string): boolean => {
		try {
			// Kind is a lexical source marker. Following its symlink here would
			// hide an escaped entry as a missing frame before the compiler or
			// terminal launcher can report the boundary violation.
			lstatSync(join(directory, entry));
			return true;
		} catch {
			return false;
		}
	};
	const html = present("frame.tsx");
	const term = present("term.tsx");
	if (html && term) return "conflict";
	if (term) return "term";
	if (html) return "html";
	return undefined;
}

/** A frame's kind for root + name; conflicted folders count as html so their error shows. */
export function projectedKind(root: string, frame: string): FrameKind | undefined {
	const found = lookupFrame(root, frame);
	return found.kind === "found" ? found.frameKind : undefined;
}

interface DiscoveredFrame {
	name: string;
	page: string | undefined;
	dir: string;
	kind: FrameKind;
}

interface Discovery {
	designDir: string;
	/** Collision-free frames, sorted by name. */
	frames: DiscoveredFrame[];
	pages: string[];
	collisions: FrameCollision[];
}

const DEFAULT_W = 390;
const DEFAULT_H = 844;
const GUTTER = 80;

/** New terminal frames start at the conventional floor, in exact cell pixels. */
const TERM_DEFAULT = pxForCells(DEFAULT_COLS, DEFAULT_ROWS);

function defaultFootprint(kind: FrameKind): { w: number; h: number } {
	return kind === "term" ? TERM_DEFAULT : { w: DEFAULT_W, h: DEFAULT_H };
}

/**
 * One walk of design/frames: top-level folders with a frame entry are
 * root-page frames; safe-named folders without one are pages, their frame
 * folders one level down. Deeper nesting is a frame's own business, never
 * discovery's.
 */
function discover(root: string): Discovery | undefined {
	let designDir: string;
	let framesDir: string;
	try {
		designDir = realDesignDir(root);
		framesDir = resolveDesignPath(designDir, join(designDir, "frames"));
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
	let entries: Dirent[];
	try {
		entries = readdirSync(framesDir, { withFileTypes: true });
	} catch {
		return undefined;
	}
	const claims = new Map<string, { page: string | undefined; dir: string; kind: FrameKind }[]>();
	const claim = (name: string, page: string | undefined, dir: string, kind: FrameKind | "conflict") => {
		// a both-entries folder projects as html so the error document shows (#42)
		const entry = { page, dir, kind: kind === "conflict" ? ("html" as const) : kind };
		const list = claims.get(name);
		if (list === undefined) claims.set(name, [entry]);
		else list.push(entry);
	};
	const pages: string[] = [];
	// framesDir is resolved, and a directory entry is never a symlink, so every
	// path built from here down is inside design/ without asking again
	for (const entry of entries) {
		if (!entry.isDirectory() || !isSafeName(entry.name)) continue;
		const dir = join(framesDir, entry.name);
		const kind = entryKind(dir);
		if (kind !== undefined) {
			claim(entry.name, undefined, dir, kind);
			continue;
		}
		pages.push(entry.name);
		let inner: Dirent[];
		try {
			inner = readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const sub of inner) {
			if (!sub.isDirectory() || !isSafeName(sub.name)) continue;
			const subDir = join(dir, sub.name);
			const subKind = entryKind(subDir);
			if (subKind !== undefined) claim(sub.name, entry.name, subDir, subKind);
		}
	}

	const frames: DiscoveredFrame[] = [];
	const collisions: FrameCollision[] = [];
	for (const [name, list] of claims) {
		const first = list[0];
		if (list.length === 1 && first !== undefined) {
			frames.push({ name, page: first.page, dir: first.dir, kind: first.kind });
		} else {
			collisions.push({ name, paths: list.map((entry) => frameFolder(name, entry.page)).sort() });
		}
	}
	frames.sort((a, b) => a.name.localeCompare(b.name));
	collisions.sort((a, b) => a.name.localeCompare(b.name));
	pages.sort((a, b) => a.localeCompare(b));
	return { designDir, frames, pages, collisions };
}

/** The design-relative folder a frame name resolves to, wire-format slashes —
 * the one spelling of "where pages put a frame" every daemon surface shares. */
export function frameFolder(name: string, page: string | undefined): string {
	return page === undefined ? `frames/${name}` : `frames/${page}/${name}`;
}

/** Resolve a bare frame name to its folder — ambiguity is an answer, not a guess. */
export function lookupFrame(root: string, frame: string): FrameLookup {
	const discovery = discover(root);
	if (discovery === undefined) return { kind: "missing" };
	const collision = discovery.collisions.find((entry) => entry.name === frame);
	if (collision !== undefined) return { kind: "collision", paths: collision.paths };
	const found = discovery.frames.find((entry) => entry.name === frame);
	if (found === undefined) return { kind: "missing" };
	return {
		kind: "found",
		dir: found.dir,
		frameKind: found.kind,
		...(found.page === undefined ? {} : { page: found.page }),
	};
}

/** The collision told straight: both locations named, the law restated. */
export function describeCollision(name: string, paths: string[]): string {
	return `two frames named "${name}" — ${paths.join(" and ")} — frame names are identity and must be unique across the project`;
}

export function listProjectFrames(root: string): Projection {
	const discovery = discover(root);
	if (discovery === undefined) return { root, pages: [], frames: [], collisions: [] };

	// one sweep of the cover store answers every frame: the rung filenames are the
	// manifest, so this costs a readdir per frame folder and opens no image
	const covers = readCovers(root);

	const placed: ProjectedFrame[] = [];
	const unplaced: DiscoveredFrame[] = [];
	for (const frame of discovery.frames) {
		const geometry = readGeometry(join(frame.dir, "frame.json"), discovery.designDir);
		if (geometry === undefined) unplaced.push(frame);
		else placed.push(projected(frame, geometry, covers.get(frame.name)));
	}

	// a new frame lands beside its own page's field, on its top line, never on
	// top of it — and never beside another page's (#39)
	for (const frame of unplaced) {
		const field = placed.filter((candidate) => candidate.page === frame.page);
		const footprint = defaultFootprint(frame.kind);
		const cursor = field.length === 0 ? GUTTER : Math.max(...field.map((f) => f.x + f.w)) + GUTTER;
		const baseline = field.length === 0 ? GUTTER : Math.min(...field.map((f) => f.y));
		const geometry = { x: cursor, y: baseline, ...footprint };
		try {
			const persisted = writeGeometryIfAbsent(join(frame.dir, "frame.json"), geometry, discovery.designDir);
			if (persisted !== undefined) {
				placed.push(projected(frame, persisted, covers.get(frame.name)));
				continue;
			}
		} catch (error) {
			if (error instanceof DesignBoundaryError) throw error;
			// read-only checkout: placement stays deterministic within this daemon run
		}
		placed.push(projected(frame, geometry, covers.get(frame.name)));
	}

	placed.sort((a, b) => a.name.localeCompare(b.name));
	return { root, pages: discovery.pages, frames: placed, collisions: discovery.collisions };
}

function projected(
	frame: DiscoveredFrame,
	geometry: { x: number; y: number; w: number; h: number },
	cover: Cover | undefined,
): ProjectedFrame {
	return {
		name: frame.name,
		kind: frame.kind,
		...(frame.page === undefined ? {} : { page: frame.page }),
		...geometry,
		// a terminal's cover is its persisted screen, which only the session store
		// can hash and size — the frames read fills those in (#42)
		...(frame.kind === "term" || cover === undefined ? {} : { cover }),
	};
}

/** Every unambiguous frame name, sorted; undefined when frames/ is unreadable. */
export function frameNames(root: string): string[] | undefined {
	const discovery = discover(root);
	if (discovery === undefined) return undefined;
	return discovery.frames.map((frame) => frame.name);
}

/**
 * Every unambiguous frame's folder, keyed by name, in name order — one
 * discovery for a whole project-wide read. Asking `lookupFrame` per frame
 * re-walks design/frames once per frame, which a 145-frame read pays 145 times.
 */
export function frameDirectories(root: string): Map<string, string> {
	const discovery = discover(root);
	if (discovery === undefined) return new Map();
	return new Map(discovery.frames.map((frame) => [frame.name, frame.dir]));
}

function readCovers(root: string): Map<string, Cover> {
	try {
		return scanCovers(root);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return new Map();
	}
}

/** One frame's geometry: its sidecar if sound, the default footprint otherwise. Never writes. */
export function frameGeometry(root: string, frame: string): { w: number; h: number } {
	const geometry = readFrameGeometry(root, frame);
	return { w: geometry.w, h: geometry.h };
}

/** A pure sidecar read for consumers that must not materialize the canvas. */
export function readFrameGeometry(root: string, frame: string): { w: number; h: number; persisted: boolean } {
	const found = lookupFrame(root, frame);
	if (found.kind !== "found") return { w: DEFAULT_W, h: DEFAULT_H, persisted: false };
	let designDir: string;
	try {
		designDir = realDesignDir(root);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return { w: DEFAULT_W, h: DEFAULT_H, persisted: false };
	}
	const geometry = readGeometry(join(found.dir, "frame.json"), designDir);
	if (geometry !== undefined) return { w: geometry.w, h: geometry.h, persisted: true };
	return { ...defaultFootprint(found.frameKind), persisted: false };
}

/** One card slot: the frame, and the ladder its picture comes off. */
export interface CoveredFrame {
	frame: string;
	cover: Cover;
}

export interface ProjectSummary {
	frameCount: number;
	/** Up to three covered frames, freshest capture first. */
	covers: CoveredFrame[];
}

/** One home card (#13): registry identity plus the summary scan. */
export interface ProjectCard extends ProjectSummary {
	name: string;
	root: string;
	openedAt: string;
}

/** The home card's read: a pure scan, never fills sidecars, tolerates a vanished disk. */
export function summarizeProject(root: string): ProjectSummary {
	const names = frameNames(root);
	if (names === undefined) return { frameCount: 0, covers: [] };
	const held = readCovers(root);
	const covers = names
		.flatMap((frame) => {
			const cover = held.get(frame);
			return cover === undefined ? [] : [{ frame, cover, shotAt: coverMtime(root, frame) ?? 0 }];
		})
		.sort((a, b) => b.shotAt - a.shotAt)
		.slice(0, 3)
		.map(({ frame, cover }) => ({ frame, cover }));
	return { frameCount: names.length, covers };
}

function coverMtime(root: string, frame: string): number | undefined {
	try {
		return coverModified(root, frame);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
}
