import { type Dirent, lstatSync, readdirSync } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Cover } from "../cover";
import { composePage, medianFrameArea, pageBox, type Rect, type Size } from "../page-box";
import { isSafeName, pageHolds, pageName, pageParent, pageSlot, pageUnder, ROOT_PAGE } from "../page-path";
import { DEFAULT_COLS, DEFAULT_ROWS, pxForCells } from "../term/cells";
import { type CanvasPlaces, type Place, readPlaces, writePlaces } from "./canvas-places";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import { type Footprint, readSidecar, writePlacement } from "./geometry";
import { type Unseen, unseenNow } from "./seen";
import { type DatedCover, scanCovers, scanDatedCovers } from "./thumbs";

/**
 * The canvas projection of design/frames (#22), grouped to any depth (#39,
 * #231): a frame is a folder holding a frame entry, and every safe-named folder
 * above it without one is a page. A page's identity is its path under frames/
 * (`explorations/chat`); a frame's is its bare leaf name, unique project-wide —
 * a name claimed twice is surfaced as a collision, never resolved by guessing.
 * Geometry is the one thing hands own; a frame born without a sidecar gets one
 * filled in here — placed beside its own page's field, written to disk so
 * placement is durable, never re-rolled per request (#3: "optional frame.json,
 * app fills in").
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
 * needs: whether it is current, and what addresses it. The image is absent
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
	 * the canvas reads as "show the placeholder". Terminal frames are filled in
	 * from their persisted screen, which only the session store can address.
	 */
	cover?: Cover;
	/** Terminal-only cover truth; unavailable states carry the canvas message. */
	terminalCover?: TerminalCoverState;
	/**
	 * Nobody has looked at this frame yet, or nobody has looked at it since its
	 * folder last moved. Only the canvas asks for it — `listProjectFrames` leaves
	 * it out unless a caller wants seen-state, so a shot or a play never seeds a
	 * record for a person who is not looking at anything.
	 */
	unseen?: Unseen;
}

export interface FrameCollision {
	name: string;
	/** Every design-relative folder claiming the name, sorted. */
	paths: string[];
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
	return entryKind(directory) === undefined;
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

/**
 * What a frame is when nobody said. A size left out is a size nobody thought
 * about, and the frame it belongs to is far more often a page than a phone: a
 * phone is a deliberate shape and states itself, while a desktop frame is what
 * you get when the thought was about the design rather than the viewport.
 * Everything here still holds the sizes it asked for; this is only the floor
 * under a frame that asked for nothing.
 */
const DEFAULT_W = 1440;
const DEFAULT_H = 900;
const GUTTER = 80;

/** New terminal frames start at the conventional floor, in exact cell pixels. */
const TERM_DEFAULT = pxForCells(DEFAULT_COLS, DEFAULT_ROWS);

function defaultFootprint(kind: FrameKind): Footprint {
	return kind === "term" ? TERM_DEFAULT : { w: DEFAULT_W, h: DEFAULT_H };
}

/** One folder claiming a frame name, before anything knows whether two do. */
interface FrameClaim {
	name: string;
	page: string | undefined;
	dir: string;
	kind: FrameKind | "conflict";
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

/**
 * What a walk collected, read as a discovery: a name claimed once is a frame, a
 * name claimed twice is a collision nobody resolves by guessing. Both walks
 * below share this, so the two can never disagree about what a project holds.
 */
function assemble(designDir: string, claimed: FrameClaim[], pages: string[]): Discovery {
	const claims = new Map<string, FrameClaim[]>();
	for (const claim of claimed) {
		const list = claims.get(claim.name);
		if (list === undefined) claims.set(claim.name, [claim]);
		else list.push(claim);
	}
	const frames: DiscoveredFrame[] = [];
	const collisions: FrameCollision[] = [];
	for (const [name, list] of claims) {
		const first = list[0];
		if (list.length === 1 && first !== undefined) {
			// a both-entries folder projects as html so the error document shows (#42)
			frames.push({ name, page: first.page, dir: first.dir, kind: first.kind === "conflict" ? "html" : first.kind });
		} else {
			collisions.push({ name, paths: list.map((entry) => frameFolder(name, entry.page)).sort() });
		}
	}
	frames.sort((a, b) => a.name.localeCompare(b.name));
	collisions.sort((a, b) => a.name.localeCompare(b.name));
	pages.sort((a, b) => a.localeCompare(b));
	return { designDir, frames, pages, collisions };
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
	const claimed: FrameClaim[] = [];
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
			const kind = entryKind(child);
			if (kind !== undefined) {
				claimed.push({ name: entry.name, page: page === ROOT_PAGE ? undefined : page, dir: child, kind });
				continue;
			}
			const inner = pageUnder(page, entry.name);
			pages.push(inner);
			walk(child, inner);
		}
	};
	walk(dirs.framesDir, ROOT_PAGE);
	return assemble(dirs.designDir, claimed, pages);
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
	const walk = async (dir: string, page: string): Promise<{ pages: string[]; claimed: FrameClaim[] }> => {
		let entries: Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return { pages: [], claimed: [] };
		}
		const walked = await Promise.all(
			entries
				.filter((entry) => entry.isDirectory() && isSafeName(entry.name))
				.map(async (entry): Promise<{ pages: string[]; claimed: FrameClaim[] }> => {
					const child = join(dir, entry.name);
					const kind = await entryKindAwaited(child);
					if (kind !== undefined) {
						return {
							pages: [],
							claimed: [{ name: entry.name, page: page === ROOT_PAGE ? undefined : page, dir: child, kind }],
						};
					}
					const inner = pageUnder(page, entry.name);
					const below = await walk(child, inner);
					return { pages: [inner, ...below.pages], claimed: below.claimed };
				}),
		);
		return { pages: walked.flatMap((each) => each.pages), claimed: walked.flatMap((each) => each.claimed) };
	};
	const walked = await walk(dirs.framesDir, ROOT_PAGE);
	return assemble(dirs.designDir, walked.claimed, walked.pages);
}

/** `entryKind` without the blocking stats; the same lexical marker either way. */
async function entryKindAwaited(directory: string): Promise<FrameKind | "conflict" | undefined> {
	const present = async (entry: string): Promise<boolean> => {
		try {
			await lstat(join(directory, entry));
			return true;
		} catch {
			return false;
		}
	};
	const [html, term] = await Promise.all([present("frame.tsx"), present("term.tsx")]);
	if (html && term) return "conflict";
	if (term) return "term";
	if (html) return "html";
	return undefined;
}

/** The design-relative folder a frame name resolves to, wire-format slashes —
 * the one spelling of "where pages put a frame" every daemon surface shares.
 * A page is already a path, so depth costs this nothing. */
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

/** The collision told straight: both locations named, the law restated. */
export function describeCollision(name: string, paths: string[]): string {
	return `two frames named "${name}" — ${paths.join(" and ")} — frame names are identity and must be unique across the project`;
}

/** One frame as the placement reads it: where it sits, and which page's field it is on. */
type FieldFrame = Rect & { page?: string };

/**
 * Where the next thing on a field goes: beside what is already there, on that
 * field's top line, never on top of anything.
 *
 * One rule, two callers. A frame born without a sidecar and a page with no
 * place are the same problem — something has arrived on a field that never said
 * where it stands — so they are answered the same way, and the field each of
 * them is measured against holds both kinds of thing.
 */
function besideField(field: readonly Rect[]): { x: number; y: number } {
	if (field.length === 0) return { x: GUTTER, y: GUTTER };
	return {
		x: Math.max(...field.map((each) => each.x + each.w)) + GUTTER,
		y: Math.min(...field.map((each) => each.y)),
	};
}

/** The box a page's object occupies on the field holding it (#265, `page-box.ts`). */
export function pageObjectBox(page: string, frames: readonly FieldFrame[]): Size {
	const under = frames.filter((frame) => pageHolds(page, pageSlot(frame)));
	const beside = frames.filter((frame) => pageSlot(frame) === pageParent(page));
	return pageBox(composePage(under), medianFrameArea(beside), under.length);
}

/** Every page standing on one page's field, as rects, in page order. */
function pageObjectsOn(parent: string, pages: readonly string[], frames: readonly FieldFrame[], places: CanvasPlaces) {
	return pages
		.filter((page) => pageParent(page) === parent && places[page] !== undefined)
		.map((page) => ({ page, at: places[page] as Place, box: pageObjectBox(page, frames) }));
}

/**
 * Every page's place: the stored ones kept, the missing ones completed.
 *
 * A page with no place is given one exactly the way a frame with no sidecar is,
 * because a page is a thing on that field and the two of them are arranged among
 * each other. So the field a page is placed against holds both: the frames on
 * the parent page, and the pages already standing there.
 *
 * A stored place is left alone whatever it says, including one naming a page
 * that has since gone. Order is deterministic so two daemons reading the same
 * disk fill in the same coordinates.
 */
export function placePages(
	pages: readonly string[],
	frames: readonly FieldFrame[],
	stored: CanvasPlaces,
): { places: CanvasPlaces; filled: boolean } {
	const places: CanvasPlaces = { ...stored };
	const sorted = [...pages].sort((a, b) => a.localeCompare(b));
	const parents = [...new Set(sorted.map(pageParent))].sort((a, b) => a.localeCompare(b));
	let filled = false;
	for (const parent of parents) {
		const field: Rect[] = frames
			.filter((frame) => pageSlot(frame) === parent)
			.map(({ x, y, w, h }) => ({ x, y, w, h }));
		for (const { at, box } of pageObjectsOn(parent, sorted, frames, places)) field.push({ ...at, ...box });
		for (const page of sorted.filter((each) => pageParent(each) === parent && places[each] === undefined)) {
			const box = pageObjectBox(page, frames);
			const at = besideField(field);
			places[page] = at;
			field.push({ ...at, ...box });
			filled = true;
		}
	}
	return { places, filled };
}

/**
 * Every frame, placed. `seen` decorates each one with whether it has been
 * looked at since it last moved (seen.ts) — the canvas asks, the CLI does not.
 */
export function listProjectFrames(root: string, options: { seen?: boolean } = {}): Projection {
	const discovery = discover(root);
	if (discovery === undefined) return { root, pages: [], places: {}, frames: [], collisions: [] };

	// one sweep of the cover store answers every frame from immutable image names,
	// so this costs a readdir per frame folder and opens no image
	const covers = readCovers(root);

	const placed: ProjectedFrame[] = [];
	// a frame awaiting a position carries the size it will get it at: the one its
	// sidecar states, else the default for its kind (#113)
	const unplaced: { frame: DiscoveredFrame; footprint: Footprint }[] = [];
	for (const frame of discovery.frames) {
		const sidecar = readSidecar(join(frame.dir, "frame.json"), discovery.designDir);
		if (sidecar.kind === "placed") placed.push(projected(frame, sidecar.geometry, covers.get(frame.name)));
		else {
			const footprint = sidecar.kind === "sized" ? sidecar.footprint : defaultFootprint(frame.kind);
			unplaced.push({ frame, footprint });
		}
	}

	const stored = readStoredPlaces(root);

	// a new frame lands beside its own page's field, on its top line, never on
	// top of it — and never beside another page's (#39). The pages standing on
	// that field are part of it (#265): a page is a thing on the canvas, so a
	// frame may no more be born on top of one than on top of another frame
	for (const { frame, footprint } of unplaced) {
		const slot = frame.page ?? ROOT_PAGE;
		const field: Rect[] = placed.filter((candidate) => candidate.page === frame.page);
		for (const { at, box } of pageObjectsOn(slot, discovery.pages, placed, stored)) {
			field.push({ ...at, ...box });
		}
		const geometry = { ...besideField(field), ...footprint };
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
	return { root, pages: discovery.pages, places, frames: placed, collisions: discovery.collisions };
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
		kind: frame.kind,
		...(frame.page === undefined ? {} : { page: frame.page }),
		...geometry,
		...(born === undefined ? {} : { born }),
		// a terminal's cover is its persisted screen, which only the session store
		// can hash and size — the frames read fills those in (#42)
		...(frame.kind === "term" || cover === undefined ? {} : { cover }),
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

/** Every unambiguous frame name, sorted; undefined when frames/ is unreadable. */
export function frameNames(root: string): string[] | undefined {
	const discovery = discover(root);
	if (discovery === undefined) return undefined;
	return discovery.frames.map((frame) => frame.name);
}

/**
 * What a new name must miss (#228, #231): every name a frame claims anywhere,
 * ambiguous ones included, every page there is, and what those pages are called.
 * One walk answers all three, and it fills no sidecar — a rename, a copy and a
 * page create all have to know this before they write.
 *
 * Pages come back twice because a page is two things. Its identity is its path,
 * which is what tells one page from another; its name is the folder's own, which
 * is what a frame name has to miss — a bare frame name is identity across the
 * whole project, so nothing anywhere may repeat it, page folders included. Two
 * pages may share a name under different parents; no frame may share one with
 * any page at all.
 */
export interface ClaimedNames {
	frames: Set<string>;
	/** Every page's path — a page's identity. */
	pages: Set<string>;
	/** Every page's own name, at whatever depth it sits. */
	pageNames: Set<string>;
}

export function claimedNames(root: string): ClaimedNames {
	const discovery = discover(root);
	if (discovery === undefined) return { frames: new Set(), pages: new Set(), pageNames: new Set() };
	const claimed = [...discovery.frames, ...discovery.collisions].map((entry) => entry.name);
	return {
		frames: new Set(claimed),
		pages: new Set(discovery.pages),
		pageNames: new Set(discovery.pages.map(pageName)),
	};
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
	// a stated size is a stated size, placed or not: a shot of a sized frame is
	// the size its author asked for, and nothing narrates a missing default
	const sidecar = readSidecar(join(found.dir, "frame.json"), designDir);
	if (sidecar.kind === "placed") return { w: sidecar.geometry.w, h: sidecar.geometry.h, persisted: true };
	if (sidecar.kind === "sized") return { ...sidecar.footprint, persisted: true };
	return { ...defaultFootprint(found.frameKind), persisted: false };
}

/** One card slot: the frame and its picture. */
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

/**
 * The home card's read: a pure scan, never fills sidecars, tolerates a vanished
 * disk. Asynchronous because the home list is the app's first request and asks
 * for one of these per registered project — every one of them a walk of a whole
 * design folder, which no other request should have to wait behind.
 */
export async function summarizeProject(root: string): Promise<ProjectSummary> {
	const [discovery, held] = await Promise.all([discoverAwaited(root), readDatedCovers(root)]);
	if (discovery === undefined) return { frameCount: 0, covers: [] };
	const covers = discovery.frames
		.flatMap(({ name }) => {
			const dated = held.get(name);
			return dated === undefined ? [] : [{ frame: name, ...dated }];
		})
		.sort((a, b) => b.shotAt - a.shotAt)
		.slice(0, 3)
		.map(({ frame, cover }) => ({ frame, cover }));
	return { frameCount: discovery.frames.length, covers };
}

async function readDatedCovers(root: string): Promise<Map<string, DatedCover>> {
	try {
		return await scanDatedCovers(root);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return new Map();
	}
}
