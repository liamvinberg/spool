import { type Dirent, lstatSync, readdirSync } from "node:fs";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { Cover } from "../cover";
import type { Rect } from "../page-box";
import { isFramePath, isSafeName, pageParent, pageUnder, ROOT_PAGE } from "../page-path";
import { flatPages, mergePageTree } from "../ui/canvas/order";
import { type CanvasOrder, readOrder } from "./canvas-order";
import { type CanvasPlaces, type Place, readPlaces, writePlaces } from "./canvas-places";
import { isWithin } from "./design-boundary";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import { type Footprint, parseSidecar, readSidecar, type Sidecar, writePlacement } from "./geometry";
import { besideField, DEFAULT_FOOTPRINT, DEFAULT_H, DEFAULT_W, pageObjectsOn, placePages } from "./placement";
import type { ProjectIcon } from "./project-icon";
import type { ProjectThumbnail } from "./project-thumbnail";
import { type Unseen, unseenNow } from "./seen";
import { readCoverAwaited, scanCovers } from "./thumbs";

export { frameFolder } from "../page-path";
export { pageObjectBox, placePages } from "./placement";

/**
 * The canvas projection of design/frames (#22), grouped to any depth (#39,
 * #231): a frame is a folder holding a frame entry, and every safe-named folder
 * above it without one is a page. Pages and frames are both named by their path
 * under frames/ (#336): `explorations/chat` is a page, `explorations/chat/intro`
 * a frame on it, and a frame on the root page is named by its folder alone. A
 * name only has to be free among its siblings, so the disk alone keeps two
 * frames from ever sharing one. Geometry is the one thing hands own; a frame
 * born without a sidecar gets one filled in here — placed beside its own page's
 * field, written to disk so placement is durable, never re-rolled per request
 * (#3: "optional frame.json, app fills in").
 *
 * What makes a folder a frame is its entry filename, frame.tsx, because that
 * must stay knowable by every layer even while source is broken mid-edit; a
 * filename survives a syntax error.
 */

export interface ProjectedFrame {
	/** The frame's path under frames/, which is its identity (#336). */
	name: string;
	/** The path of the page holding the frame's folder; absent on the root page. */
	page?: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/**
	 * When the frame's folder appeared on disk, ms epoch — the finder's
	 * newest-first order. Absent when the filesystem cannot say.
	 */
	born?: number;
	/**
	 * The frame's cover image. It is absent when it has none, which is what
	 * the canvas reads as "show the placeholder".
	 */
	cover?: Cover;
	/**
	 * Nobody has looked at this frame yet, or nobody has looked at it since its
	 * folder last moved. Only the canvas asks for it — `listProjectFrames` leaves
	 * it out unless a caller wants seen-state, so a shot or a play never seeds a
	 * record for a person who is not looking at anything.
	 */
	unseen?: Unseen;
}

export interface Projection {
	root: string;
	/** Every named page's path, sorted, empty ones included; the root page is implied. */
	pages: string[];
	/**
	 * Where each page stands on the field holding it (#265), keyed by page path.
	 *
	 * A sibling of `pages` rather than a change to it: too much code reads that
	 * list of paths, and a page's place is an arrangement rather than part of
	 * its identity. Every page has one by the time this is answered — a page
	 * without a stored place is given one here, the way a frame without a
	 * sidecar is.
	 */
	places: Record<string, Place>;
	frames: ProjectedFrame[];
}

/** Where a frame name lands on disk, or that it lands nowhere. */
export type FrameLookup = { kind: "found"; dir: string; page?: string } | { kind: "missing" };

export function hasFrameEntry(frameDir: string, designDir: string): boolean {
	let directory: string;
	try {
		directory = resolveDesignPath(designDir, frameDir);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return false;
	}
	return hasEntry(directory);
}

/**
 * The entry marker inside a folder already known to sit in design/. Callers that
 * built the path from a resolved parent and a `readdirSync` entry that reports
 * itself a directory — a symlink never does — have nothing left to resolve, and
 * resolving anyway costs a `realpath` call per frame on every discovery.
 */
function hasEntry(directory: string): boolean {
	try {
		// The entry is a lexical source marker. Following its symlink here would
		// hide an escaped entry as a missing frame before the compiler can report
		// the boundary violation.
		lstatSync(join(directory, "frame.tsx"));
		return true;
	} catch {
		return false;
	}
}

/**
 * Discovery's own page test, asked of one folder: it is there, it is a folder,
 * and it holds no frame entry. A path a delete has already taken answers no,
 * which is what keeps a reader naming the frame that vanished rather than
 * walking on into what used to be inside it.
 */
export function isPageFolder(directory: string): boolean {
	try {
		if (!lstatSync(directory).isDirectory()) return false;
	} catch {
		return false;
	}
	return !hasEntry(directory);
}

/** Whether root + name resolves to one frame folder. */
export function frameExists(root: string, frame: string): boolean {
	return lookupFrame(root, frame).kind === "found";
}

interface DiscoveredFrame {
	name: string;
	page: string | undefined;
	dir: string;
}

interface Discovery {
	designDir: string;
	/** Every frame, sorted by name. */
	frames: DiscoveredFrame[];
	pages: string[];
}

/** Where a project's frames live, or nothing when design/ cannot be read. */
function framesDirOf(root: string): { designDir: string; framesDir: string } | undefined {
	try {
		const designDir = realDesignDir(root);
		return { designDir, framesDir: resolveDesignPath(designDir, join(designDir, "frames")) };
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
}

/** What a walk collected, sorted: both walks below share this, so the two can
 * never disagree about what a project holds. */
function assemble(designDir: string, frames: DiscoveredFrame[], pages: string[]): Discovery {
	frames.sort((a, b) => a.name.localeCompare(b.name));
	pages.sort((a, b) => a.localeCompare(b));
	return { designDir, frames, pages };
}

/** A frame folder found on a page, named by its path. */
function discovered(page: string, folder: string, dir: string): DiscoveredFrame {
	return { name: pageUnder(page, folder), page: page === ROOT_PAGE ? undefined : page, dir };
}

/**
 * One walk of design/frames: a safe-named folder holding a frame entry is a
 * frame, and one without a frame entry is a page, whose own folders this asks
 * the same question of. A page is a page at any depth (#231) — nothing here
 * counts levels — and the page a frame carries is the path of the folder chain
 * above it, the root page's frames carrying none.
 */
function discover(root: string): Discovery | undefined {
	const dirs = framesDirOf(root);
	if (dirs === undefined) return undefined;
	const frames: DiscoveredFrame[] = [];
	const pages: string[] = [];
	// framesDir is resolved, and a directory entry is never a symlink, so every
	// path built from here down is inside design/ without asking again
	const walk = (dir: string, page: string): void => {
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || !isSafeName(entry.name)) continue;
			const child = join(dir, entry.name);
			if (hasEntry(child)) {
				frames.push(discovered(page, entry.name, child));
				continue;
			}
			const inner = pageUnder(page, entry.name);
			pages.push(inner);
			walk(child, inner);
		}
	};
	walk(dirs.framesDir, ROOT_PAGE);
	return assemble(dirs.designDir, frames, pages);
}

/**
 * The same walk, off the event loop and with every folder read at once. The
 * home list walks each registered project before the app can show anything, and
 * a serial pass through one project's pages is enough to hold every other
 * request behind it.
 */
async function discoverAwaited(root: string): Promise<Discovery | undefined> {
	const dirs = framesDirOf(root);
	if (dirs === undefined) return undefined;
	const walk = async (dir: string, page: string): Promise<{ pages: string[]; frames: DiscoveredFrame[] }> => {
		let entries: Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return { pages: [], frames: [] };
		}
		const walked = await Promise.all(
			entries
				.filter((entry) => entry.isDirectory() && isSafeName(entry.name))
				.map(async (entry): Promise<{ pages: string[]; frames: DiscoveredFrame[] }> => {
					const child = join(dir, entry.name);
					if (await hasEntryAwaited(child)) return { pages: [], frames: [discovered(page, entry.name, child)] };
					const inner = pageUnder(page, entry.name);
					const below = await walk(child, inner);
					return { pages: [inner, ...below.pages], frames: below.frames };
				}),
		);
		return { pages: walked.flatMap((each) => each.pages), frames: walked.flatMap((each) => each.frames) };
	};
	const walked = await walk(dirs.framesDir, ROOT_PAGE);
	return assemble(dirs.designDir, walked.frames, walked.pages);
}

/** `hasEntry` without the blocking stat; the same lexical marker either way. */
async function hasEntryAwaited(directory: string): Promise<boolean> {
	try {
		await lstat(join(directory, "frame.tsx"));
		return true;
	} catch {
		return false;
	}
}

/**
 * Resolve a frame name to its folder (#336). The name is the path, so this
 * reads the disk along it rather than walking the project, and asks each folder
 * what discovery would: every folder above the frame is a page, and the last
 * one holds the entry. Discovery reads directory entries, which never follow a
 * symlink, so neither does this.
 */
export function lookupFrame(root: string, frame: string): FrameLookup {
	if (!isFramePath(frame)) return { kind: "missing" };
	const dirs = framesDirOf(root);
	if (dirs === undefined) return { kind: "missing" };
	const segments = frame.split("/");
	let dir = dirs.framesDir;
	for (const [at, segment] of segments.entries()) {
		dir = join(dir, segment);
		try {
			if (!lstatSync(dir).isDirectory()) return { kind: "missing" };
		} catch {
			return { kind: "missing" };
		}
		if (hasEntry(dir) !== (at === segments.length - 1)) return { kind: "missing" };
	}
	const page = pageParent(frame);
	return { kind: "found", dir, ...(page === ROOT_PAGE ? {} : { page }) };
}

/**
 * Where a frame comes from, for every refusal that has no folder to name (#156).
 * A name nothing claims could have lived on any page, so `frames/<name>/frame.tsx`
 * names the one location a paged project never uses: say where frames come from
 * rather than invent where this one would have been.
 */
export const FRAME_BIRTH =
	"a frame is born by writing frame.tsx in its own folder under design/frames/, flat or inside a page folder";

/** The miss told straight: the canvas holds no such frame, anywhere. */
export function describeMissingFrame(name: string): string {
	return `no frame "${name}" on the canvas — ${FRAME_BIRTH}`;
}

/**
 * Every frame folder in a project, by name, without placing anything: what a turn's
 * witness diffs against (#365). Nothing when design/ cannot be read.
 */
export function discoverFrames(root: string): { name: string; page?: string; dir: string }[] | undefined {
	return discover(root)?.frames.map(({ name, page, dir }) =>
		page === undefined ? { name, dir } : { name, page, dir },
	);
}

/**
 * A spot on the root page held for a delegation that has not landed its frame yet (#365).
 * `frame` is the frame that filled it, once one has.
 */
export interface HeldSpot extends Rect {
	readonly name: string;
	readonly frame?: string;
}

/**
 * Every frame, placed. `seen` decorates each one with whether it has been
 * looked at since it last moved (seen.ts) — the canvas asks, the CLI does not.
 *
 * `held` is the spots running turns hold for their delegations (#365). A frame born
 * into one stands in it, and every other new frame on the root page stands clear of
 * the ones still empty.
 */
export function listProjectFrames(
	root: string,
	options: { seen?: boolean; held?: readonly HeldSpot[] } = {},
): Projection {
	const discovery = discover(root);
	if (discovery === undefined) return { root, pages: [], places: {}, frames: [] };

	// one sweep of the cover store answers every frame from immutable image names,
	// so this costs a readdir per frame folder and opens no image
	const covers = readCovers(root);

	const placed: ProjectedFrame[] = [];
	// a frame awaiting a position carries the size it will get it at: the one its
	// sidecar states, else the default (#113)
	const unplaced: { frame: DiscoveredFrame; footprint: Footprint; sized: boolean }[] = [];
	for (const frame of discovery.frames) {
		const sidecar = readSidecar(join(frame.dir, "frame.json"), discovery.designDir);
		if (sidecar.kind === "placed") placed.push(projected(frame, sidecar.geometry, covers.get(frame.name)));
		else {
			const footprint = sidecar.kind === "sized" ? sidecar.footprint : DEFAULT_FOOTPRINT;
			unplaced.push({ frame, footprint, sized: sidecar.kind === "sized" });
		}
	}
	const held = options.held ?? [];
	const open = held.filter((spot) => spot.frame === undefined);

	const stored = readStoredPlaces(root);

	// a new frame lands beside its own page's field, on its top line, never on
	// top of it — and never beside another page's (#39). The pages standing on
	// that field are part of it (#265): a page is a thing on the canvas, so a
	// frame may no more be born on top of one than on top of another frame
	for (const { frame, footprint, sized } of unplaced) {
		const slot = frame.page ?? ROOT_PAGE;
		const field: Rect[] = placed.filter((candidate) => candidate.page === frame.page);
		for (const { at, box } of pageObjectsOn(slot, discovery.pages, placed, stored)) {
			field.push({ ...at, ...box });
		}
		// a held spot is the root page's: its own frame stands in it, and nothing else does
		const spot =
			frame.page === undefined
				? (held.find((one) => one.frame === frame.name) ?? open.find((one) => one.name === frame.name))
				: undefined;
		if (frame.page === undefined) field.push(...open.filter((one) => one !== spot));
		const geometry =
			spot === undefined
				? { ...besideField(field), ...footprint }
				: { x: spot.x, y: spot.y, ...(sized ? footprint : { w: spot.w, h: spot.h }) };
		try {
			const persisted = writePlacement(join(frame.dir, "frame.json"), geometry, discovery.designDir);
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
	if (options.seen === true) {
		const marks = unseenNow(root, discovery.frames);
		for (const frame of placed) {
			const mark = marks.get(frame.name);
			if (mark !== undefined) frame.unseen = mark;
		}
	}
	// a page with no place gets one and keeps it: the arrangement is committed,
	// so it has to be the same coordinate on the next machine that pulls it
	const { places, filled } = placePages(discovery.pages, placed, stored);
	if (filled) {
		try {
			writePlaces(root, places);
		} catch (error) {
			if (error instanceof DesignBoundaryError) throw error;
			// read-only checkout, or a canvas.json spool will not overwrite: the
			// placement stays deterministic within this daemon run either way
		}
	}
	return { root, pages: discovery.pages, places, frames: placed };
}

function readStoredPlaces(root: string): CanvasPlaces {
	try {
		return readPlaces(root);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return {};
	}
}

function projected(
	frame: DiscoveredFrame,
	geometry: { x: number; y: number; w: number; h: number },
	cover: Cover | undefined,
): ProjectedFrame {
	const born = folderBorn(frame.dir);
	return {
		name: frame.name,
		...(frame.page === undefined ? {} : { page: frame.page }),
		...geometry,
		...(born === undefined ? {} : { born }),
		...(cover === undefined ? {} : { cover }),
	};
}

/** The folder's birth time, its mtime where the filesystem never recorded one. */
function folderBorn(dir: string): number | undefined {
	try {
		const stat = lstatSync(dir);
		const millis = stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs;
		return Math.round(millis);
	} catch {
		return undefined;
	}
}

/** Every frame name, sorted; undefined when frames/ is unreadable. */
export function frameNames(root: string): string[] | undefined {
	const discovery = discover(root);
	if (discovery === undefined) return undefined;
	return discovery.frames.map((frame) => frame.name);
}

/** Every page there is, by path; the root page is implied. */
export function pagePaths(root: string): Set<string> {
	return new Set(discover(root)?.pages ?? []);
}

/**
 * Every frame's folder, keyed by name, in name order: one discovery for a
 * whole project-wide read, rather than a lookup per frame.
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
	// a stated size is a stated size, placed or not: a shot of a sized frame is
	// the size its author asked for, and nothing narrates a missing default
	const sidecar = readSidecar(join(found.dir, "frame.json"), designDir);
	if (sidecar.kind === "placed") return { w: sidecar.geometry.w, h: sidecar.geometry.h, persisted: true };
	if (sidecar.kind === "sized") return { ...sidecar.footprint, persisted: true };
	return { ...DEFAULT_FOOTPRINT, persisted: false };
}

/** One card slot: the frame and its picture. */
export interface CoveredFrame {
	frame: string;
	cover: Cover;
}

export interface ProjectSummary {
	frameCount: number;
	/**
	 * The card's picture when the project has no thumbnail file: the still of its top-left frame, the one frame
	 * that stands first on the canvas, so it stays put however the stills are retaken. Empty while that frame has
	 * no still, and for a project with no frames.
	 */
	covers: CoveredFrame[];
}

/** One home card (#13): registry identity plus the summary scan. */
export interface ProjectCard extends ProjectSummary {
	name: string;
	root: string;
	openedAt: string;
	/** The team project this root is a local copy of: Home shows all of one's copies as one cover. */
	team?: { url: string; team: string; project: string };
	/** The team this folder was a local copy for until the project ended here: its cover goes on saying so. */
	ended?: string;
	/** What its tab and its cover draw: its icon file or its repo's favicon; absent, the name's first letter. */
	icon?: ProjectIcon;
	/** What its cover shows over its top-left frame: its `design/shared/thumbnail.*`, when it has one. */
	thumbnail?: ProjectThumbnail;
	/** A team project's local copy whose sync is paused on a limit, and why: its team mark goes hollow. */
	syncPaused?: string;
}

/**
 * The home card's read: a pure scan, never fills sidecars, tolerates a vanished
 * disk. Asynchronous because the home list is the app's first request and asks
 * for one of these per registered project — every one of them a walk of a whole
 * design folder, which no other request should have to wait behind. Past the
 * walk it reads only the sidecars of one page and one frame's still.
 */
export async function summarizeProject(root: string): Promise<ProjectSummary> {
	const discovery = await discoverAwaited(root);
	if (discovery === undefined) return { frameCount: 0, covers: [] };
	const frame = await topLeftFrame(root, discovery);
	const cover = frame === undefined ? undefined : await readCoverQuietly(root, frame);
	return {
		frameCount: discovery.frames.length,
		covers: frame === undefined || cover === undefined ? [] : [{ frame, cover }],
	};
}

/**
 * The frame a project's card pictures: on the root page, the one with the smallest top edge, ties to the smallest
 * left. A root page with no frames gives way to the pages in rail order (Order, merged the way the rail merges it),
 * a page before the pages it holds, and the first of them with frames is asked the same.
 */
async function topLeftFrame(root: string, discovery: Discovery): Promise<string | undefined> {
	const byPage = new Map<string, DiscoveredFrame[]>();
	for (const frame of discovery.frames) {
		const page = frame.page ?? ROOT_PAGE;
		byPage.set(page, [...(byPage.get(page) ?? []), frame]);
	}
	const rail = byPage.has(ROOT_PAGE)
		? [ROOT_PAGE]
		: flatPages(mergePageTree(readStoredOrder(root).pages, discovery.pages));
	const page = rail.find((each) => byPage.has(each));
	const frames = page === undefined ? undefined : byPage.get(page);
	if (frames === undefined) return undefined;
	const placed = await Promise.all(
		frames.map(async (frame) => ({ frame, sidecar: await readSidecarAwaited(frame.dir, discovery.designDir) })),
	);
	// a frame not placed yet is about to be put beside the others, so it stands after every placed one
	const at = (sidecar: Sidecar) =>
		sidecar.kind === "placed" ? sidecar.geometry : { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };
	placed.sort((a, b) => {
		const one = at(a.sidecar);
		const other = at(b.sidecar);
		return one.y - other.y || one.x - other.x || a.frame.name.localeCompare(b.frame.name);
	});
	return placed[0]?.frame.name;
}

/** A sidecar read off the event loop; anything outside design/ or unreadable reads as none. */
async function readSidecarAwaited(frameDir: string, designDir: string): Promise<Sidecar> {
	try {
		const file = await realpath(join(frameDir, "frame.json"));
		if (!isWithin(designDir, file)) return { kind: "none" };
		return parseSidecar(JSON.parse(await readFile(file, "utf8")));
	} catch {
		return { kind: "none" };
	}
}

function readStoredOrder(root: string): CanvasOrder {
	try {
		return readOrder(root);
	} catch {
		return {};
	}
}

async function readCoverQuietly(root: string, frame: string): Promise<Cover | undefined> {
	try {
		return await readCoverAwaited(root, frame);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
}
