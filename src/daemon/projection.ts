import { type Dirent, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readGeometry, writeGeometry } from "./geometry";
import { isSafeName } from "./project-files";
import { thumbFile } from "./thumbs";

/**
 * The canvas projection of design/frames (#22), one level of grouping deep
 * (#39): a frame is a folder holding frame.tsx at the top level (the root
 * page) or exactly one level down (a named page). Identity is the bare leaf
 * name, unique project-wide — a name claimed twice is surfaced as a collision,
 * never resolved by guessing. Geometry is the one thing hands own; a frame
 * born without a sidecar gets one filled in here — placed beside its own
 * page's field, written to disk so placement is durable, never re-rolled per
 * request (#3: "optional frame.json, app fills in").
 */

export interface ProjectedFrame {
	name: string;
	/** The named page holding the frame's folder; absent on the root page. */
	page?: string;
	x: number;
	y: number;
	w: number;
	h: number;
	hasThumb: boolean;
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
	| { kind: "found"; dir: string; page?: string }
	| { kind: "missing" }
	| { kind: "collision"; paths: string[] };

interface DiscoveredFrame {
	name: string;
	page: string | undefined;
	dir: string;
}

interface Discovery {
	/** Collision-free frames, sorted by name. */
	frames: DiscoveredFrame[];
	pages: string[];
	collisions: FrameCollision[];
}

const DEFAULT_W = 390;
const DEFAULT_H = 844;
const GUTTER = 80;

/**
 * One walk of design/frames: top-level folders with frame.tsx are root-page
 * frames; safe-named folders without one are pages, their frame folders one
 * level down. Deeper nesting is a frame's own business, never discovery's.
 */
function discover(root: string): Discovery | undefined {
	const framesDir = join(root, "design", "frames");
	let entries: Dirent[];
	try {
		entries = readdirSync(framesDir, { withFileTypes: true });
	} catch {
		return undefined;
	}
	const claims = new Map<string, { page: string | undefined; dir: string }[]>();
	const claim = (name: string, page: string | undefined, dir: string) => {
		const list = claims.get(name);
		if (list === undefined) claims.set(name, [{ page, dir }]);
		else list.push({ page, dir });
	};
	const pages: string[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || !isSafeName(entry.name)) continue;
		const dir = join(framesDir, entry.name);
		if (existsSync(join(dir, "frame.tsx"))) {
			claim(entry.name, undefined, dir);
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
			if (existsSync(join(subDir, "frame.tsx"))) claim(sub.name, entry.name, subDir);
		}
	}

	const frames: DiscoveredFrame[] = [];
	const collisions: FrameCollision[] = [];
	for (const [name, list] of claims) {
		const first = list[0];
		if (list.length === 1 && first !== undefined) frames.push({ name, page: first.page, dir: first.dir });
		else collisions.push({ name, paths: list.map((entry) => relFrameDir(name, entry.page)).sort() });
	}
	frames.sort((a, b) => a.name.localeCompare(b.name));
	collisions.sort((a, b) => a.name.localeCompare(b.name));
	pages.sort((a, b) => a.localeCompare(b));
	return { frames, pages, collisions };
}

/** The design-relative folder a frame name resolves to, wire-format slashes. */
function relFrameDir(name: string, page: string | undefined): string {
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
	return { kind: "found", dir: found.dir, ...(found.page === undefined ? {} : { page: found.page }) };
}

/** The collision told straight: both locations named, the law restated. */
export function describeCollision(name: string, paths: string[]): string {
	return `two frames named "${name}" — ${paths.join(" and ")} — frame names are identity and must be unique across the project`;
}

export function listProjectFrames(root: string): Projection {
	const discovery = discover(root);
	if (discovery === undefined) return { root, pages: [], frames: [], collisions: [] };

	const placed: ProjectedFrame[] = [];
	const unplaced: DiscoveredFrame[] = [];
	for (const frame of discovery.frames) {
		const geometry = readGeometry(join(frame.dir, "frame.json"));
		if (geometry === undefined) unplaced.push(frame);
		else placed.push(projected(root, frame, geometry));
	}

	// a new frame lands beside its own page's field, on its top line, never on
	// top of it — and never beside another page's (#39)
	for (const frame of unplaced) {
		const field = placed.filter((candidate) => candidate.page === frame.page);
		const cursor = field.length === 0 ? GUTTER : Math.max(...field.map((f) => f.x + f.w)) + GUTTER;
		const baseline = field.length === 0 ? GUTTER : Math.min(...field.map((f) => f.y));
		const geometry = { x: cursor, y: baseline, w: DEFAULT_W, h: DEFAULT_H };
		try {
			writeGeometry(join(frame.dir, "frame.json"), geometry);
		} catch {
			// read-only checkout: placement stays deterministic within this daemon run
		}
		placed.push(projected(root, frame, geometry));
	}

	placed.sort((a, b) => a.name.localeCompare(b.name));
	return { root, pages: discovery.pages, frames: placed, collisions: discovery.collisions };
}

function projected(
	root: string,
	frame: DiscoveredFrame,
	geometry: { x: number; y: number; w: number; h: number },
): ProjectedFrame {
	return {
		name: frame.name,
		...(frame.page === undefined ? {} : { page: frame.page }),
		...geometry,
		hasThumb: hasThumb(root, frame.name),
	};
}

/** Every unambiguous frame name, sorted; undefined when frames/ is unreadable. */
export function frameNames(root: string): string[] | undefined {
	const discovery = discover(root);
	if (discovery === undefined) return undefined;
	return discovery.frames.map((frame) => frame.name);
}

function hasThumb(root: string, frame: string): boolean {
	return existsSync(thumbFile(root, frame));
}

/** One frame's geometry: its sidecar if sound, the default footprint otherwise. Never writes. */
export function frameGeometry(root: string, frame: string): { w: number; h: number } {
	const found = lookupFrame(root, frame);
	const geometry = found.kind === "found" ? readGeometry(join(found.dir, "frame.json")) : undefined;
	return geometry === undefined ? { w: DEFAULT_W, h: DEFAULT_H } : { w: geometry.w, h: geometry.h };
}

export interface ProjectSummary {
	frameCount: number;
	/** Up to three thumbnail-backed frame names, freshest capture first. */
	covers: string[];
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
	const covers = names
		.map((name) => ({ name, shotAt: thumbMtime(root, name) }))
		.filter((cover) => cover.shotAt !== undefined)
		.sort((a, b) => (b.shotAt as number) - (a.shotAt as number))
		.slice(0, 3)
		.map((cover) => cover.name);
	return { frameCount: names.length, covers };
}

function thumbMtime(root: string, frame: string): number | undefined {
	try {
		return statSync(thumbFile(root, frame)).mtimeMs;
	} catch {
		return undefined;
	}
}
