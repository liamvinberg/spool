import { cpSync, type Dirent, existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import {
	isFramePath,
	isPagePath,
	isPageSlot,
	isSafeName,
	movedOnto,
	pageName,
	pageParent,
	pageUnder,
	pageWithin,
	ROOT_PAGE,
} from "../page-path";
import { readOrder, withPageMoved, withPagesDropped, writeOrder } from "./canvas-order";
import {
	withPagesDropped as placesAfterDrop,
	withPageMoved as placesAfterMove,
	readPlaces,
	writePlaces,
} from "./canvas-places";
import { realDesignDir, resolveDesignPath } from "./design-path";
import { type Moved, retargetFor, retargetLinks } from "./frame-links";
import { reaimEscapingImports } from "./import-aim";
import { pageMovedInState, pagesDroppedFromState, readCanvasState, writeCanvasState } from "./project-state";
import { describeMissingFrame, hasFrameEntry, lookupFrame, pagePaths } from "./projection";
import { carrySeen } from "./seen";
import { carryCover } from "./thumbs";

/**
 * The explorer's file operations (#228): what the rail's verbs do on disk, at
 * whatever depth the page holding them sits (#231).
 *
 * Every one of them moves or copies a folder. Frames and pages are both named
 * by their path (#336), so a name only has to be free among the folders beside
 * it, and the disk is the whole of what can refuse one. But a path is also what
 * every walk into a frame says, so a gesture that changes one keeps two kinds
 * of bookkeeping true afterwards, and authors nothing else: a `../` import whose
 * target stayed put while the folder's depth changed is re-aimed (#273,
 * `import-aim.ts`), and every walk target naming a frame that moved is written
 * at its new name (`frame-links.ts`). A copy changes no name, so it re-aims
 * imports and leaves every walk where it pointed.
 *
 * Every path resolves before the first write, the way the geometry handler
 * resolves every sidecar before it writes one: a rename that would escape
 * design/ or a copy whose destination is taken has to fail with the disk
 * exactly as it was.
 */

/** Why an operation never happened, in the status the route answers with. */
export interface Refusal {
	kind: "refused";
	status: 400 | 404 | 409;
	message: string;
}

/** One copy that landed: what it was made from, what it is called, where it sits. */
export interface FrameCopy {
	from: string;
	to: string;
	/** The page the copy landed on, by path; absent on the root page, as in the projection. */
	page?: string;
}

const refuse = (status: Refusal["status"], message: string): Refusal => ({ kind: "refused", status, message });

/** The refusal a taken folder earns, naming the folder that already holds one. */
function describeTaken(parent: string, name: string): string {
	return `design/${parent === ROOT_PAGE ? "frames" : `frames/${parent}`}/ already holds a folder named "${name}"`;
}

/** Where a page's or a frame's folder is, or would be: both are paths under frames/, so this is one join. */
function folderOf(designDir: string, page: string): string {
	return resolveDesignPath(designDir, join(designDir, "frames", page));
}

/**
 * The canvas's own bookkeeping for a page that moved, whether it moved by being
 * renamed or by changing the page holding it. The page the canvas is on, every
 * camera inside it, and every list of the stored order beneath it are keyed by
 * path, so leaving them behind would put the canvas on a page that is gone.
 */
function carryPage(root: string, from: string, to: string): void {
	const state = pageMovedInState(readCanvasState(root), from, to);
	if (state !== undefined) writeCanvasState(root, state);
	const order = withPageMoved(readOrder(root), from, to);
	if (order !== undefined) writeOrder(root, order);
	// where it stands on the field is its arrangement (#265): a rename keeps it,
	// a change of parent gives it up, and the projection completes the new one
	const places = placesAfterMove(readPlaces(root), from, to);
	if (places !== undefined) writePlaces(root, places);
}

/**
 * What every rename and move ends with, once the folders stand where they were
 * asked to: the covers and the seen mark of every frame that changed name
 * follow it, and every walk into one is written at its new name.
 */
function renamed(root: string, designDir: string, moved: Moved): void {
	const frames = [
		...(moved.frames ?? []),
		...(moved.pages ?? []).flatMap((page) =>
			frameFoldersUnder(folderOf(designDir, page.to), designDir).map((frame) => ({
				from: pageUnder(page.from, frame),
				to: pageUnder(page.to, frame),
			})),
		),
	];
	for (const frame of frames) carryCover(root, frame.from, frame.to);
	carrySeen(root, frames);
	retargetLinks(root, retargetFor(moved));
}

/**
 * A frame renamed in place. Both ends are names and both sit on the same page:
 * what a frame is called is one gesture and which page holds it is another.
 */
export function renameFrame(root: string, from: string, to: string): Refusal | { kind: "renamed" } {
	if (!isFramePath(from)) return refuse(400, `not a frame name: "${from}"`);
	if (!isFramePath(to)) return refuse(400, `not a frame name: "${to}"`);
	// a frame renamed to what it is already called is a request already answered
	if (from === to) return { kind: "renamed" };
	if (pageParent(from) !== pageParent(to)) {
		return refuse(400, "a rename keeps a frame on its page; moving it onto another page is a move");
	}
	const designDir = realDesignDir(root);
	const found = lookupFrame(root, from);
	if (found.kind === "missing") return refuse(404, describeMissingFrame(from));
	const target = folderOf(designDir, to);
	if (existsSync(target)) return refuse(409, describeTaken(pageParent(to), pageName(to)));
	renameSync(resolveDesignPath(designDir, found.dir), target);
	renamed(root, designDir, { frames: [{ from, to }] });
	return { kind: "renamed" };
}

/**
 * A page renamed in place. Both ends are paths and both name the same parent:
 * what a page is called is one gesture and where it sits is another, so a
 * rename that changed the holding page would be a move wearing a rename's wire.
 */
export function renamePage(root: string, from: string, to: string): Refusal | { kind: "renamed" } {
	if (!isPagePath(from)) return refuse(400, `not a page name: "${from}"`);
	if (!isPagePath(to)) return refuse(400, `not a page name: "${to}"`);
	if (from === to) return { kind: "renamed" };
	if (pageParent(from) !== pageParent(to)) {
		return refuse(400, "a rename keeps a page where it is — moving it into another page is a move");
	}
	const designDir = realDesignDir(root);
	if (!pagePaths(root).has(from)) return refuse(404, describeMissingPage(from));
	const target = folderOf(designDir, to);
	if (existsSync(target)) return refuse(409, describeTaken(pageParent(to), pageName(to)));
	renameSync(folderOf(designDir, from), target);
	// the page's own bookkeeping follows the folder: the page the canvas is on,
	// every camera inside it, and its place and contents in the rail's order
	carryPage(root, from, to);
	renamed(root, designDir, { pages: [{ from, to }] });
	return { kind: "renamed" };
}

/**
 * Pages moved into another page (#231), or back out to the root page.
 *
 * A page can never land inside itself or inside one of its own pages: the
 * folder would have to be its own parent, and the rail refuses the drop for the
 * same reason a round trip earlier. A page named alongside one of its own
 * ancestors rides along inside it rather than moving twice.
 */
export function movePages(root: string, pages: readonly string[], parent: string): Refusal | { kind: "moved" } {
	if (pages.length === 0) return refuse(400, "a move must name at least one page");
	if (!isPageSlot(parent)) return refuse(400, `not a page name: "${parent}"`);
	const designDir = realDesignDir(root);
	const known = pagePaths(root);
	if (parent !== ROOT_PAGE && !known.has(parent)) return refuse(404, describeMissingPage(parent));
	const named = [...new Set(pages)];
	const moves: { from: string; to: string; dir: string; target: string }[] = [];
	for (const page of named) {
		if (!isPagePath(page)) return refuse(400, `not a page name: "${page}"`);
		if (!known.has(page)) return refuse(404, describeMissingPage(page));
		if (page === parent || pageWithin(page, parent)) {
			return refuse(409, `"${page}" cannot move into itself or into a page inside it`);
		}
		// a page inside another page being moved is already moving, in its folder
		if (named.some((each) => pageWithin(each, page))) continue;
		// a page already held by the page it is being moved to has arrived
		if (pageParent(page) === parent) continue;
		const to = movedOnto(parent, page);
		const target = folderOf(designDir, to);
		if (existsSync(target) || moves.some((move) => move.to === to)) {
			return refuse(409, describeTaken(parent, pageName(page)));
		}
		moves.push({ from: page, to, dir: folderOf(designDir, page), target });
	}
	for (const move of moves) {
		renameSync(move.dir, move.target);
		// every frame the page carries changed depth with it (#273)
		reaimEscapingImports(designDir, move.dir, move.target);
		carryPage(root, move.from, move.to);
	}
	renamed(root, designDir, { pages: moves.map(({ from, to }) => ({ from, to })) });
	return { kind: "moved" };
}

export function moveFrames(root: string, frames: readonly string[], page: string): Refusal | { kind: "moved" } {
	if (frames.length === 0) return refuse(400, "a move must name at least one frame");
	if (!isPageSlot(page)) return refuse(400, `not a page name: "${page}"`);
	const designDir = realDesignDir(root);
	if (page !== ROOT_PAGE && !pagePaths(root).has(page)) return refuse(404, describeMissingPage(page));
	const moves: { from: string; to: string; dir: string; target: string }[] = [];
	for (const name of new Set(frames)) {
		if (!isFramePath(name)) return refuse(400, `not a frame name: "${name}"`);
		const found = lookupFrame(root, name);
		if (found.kind === "missing") return refuse(404, describeMissingFrame(name));
		// a frame already on the page it is being moved to has arrived
		if (pageParent(name) === page) continue;
		const to = movedOnto(page, name);
		const target = folderOf(designDir, to);
		if (existsSync(target) || moves.some((move) => move.to === to)) {
			return refuse(409, `${describePage(page)} already holds a folder named "${pageName(name)}"`);
		}
		moves.push({ from: name, to, dir: resolveDesignPath(designDir, found.dir), target });
	}
	// the folder carries geometry and source; a `../` import inside it is
	// re-aimed (#273) because its target stayed put while the depth changed
	for (const move of moves) {
		renameSync(move.dir, move.target);
		reaimEscapingImports(designDir, move.dir, move.target);
	}
	renamed(root, designDir, { frames: moves.map(({ from, to }) => ({ from, to })) });
	return { kind: "moved" };
}

export function duplicateFrames(
	root: string,
	frames: readonly string[],
	page: string | undefined,
): Refusal | { kind: "duplicated"; copies: FrameCopy[] } {
	if (frames.length === 0) return refuse(400, "a duplicate must name at least one frame");
	if (page !== undefined && !isPageSlot(page)) return refuse(400, `not a page name: "${page}"`);
	const designDir = realDesignDir(root);
	if (page !== undefined && page !== ROOT_PAGE && !pagePaths(root).has(page)) {
		return refuse(404, describeMissingPage(page));
	}
	const minted = new Set<string>();
	const plan: { from: string; to: string; copy: FrameCopy }[] = [];
	for (const name of new Set(frames)) {
		if (!isFramePath(name)) return refuse(400, `not a frame name: "${name}"`);
		const found = lookupFrame(root, name);
		if (found.kind === "missing") return refuse(404, describeMissingFrame(name));
		// with no page asked for, a copy stays where its original lives
		const landing = page ?? pageParent(name);
		const fresh = freshName(pageName(name), (candidate) => {
			const at = pageUnder(landing, candidate);
			return minted.has(at) || existsSync(folderOf(designDir, at));
		});
		const to = pageUnder(landing, fresh);
		minted.add(to);
		plan.push({
			from: resolveDesignPath(designDir, found.dir),
			to: folderOf(designDir, to),
			copy: { from: name, to, ...(landing === ROOT_PAGE ? {} : { page: landing }) },
		});
	}
	// the whole folder, sidecar included: a copy lands where its original sits
	for (const step of plan) {
		cpSync(step.from, step.to, { recursive: true });
		// a copy asked onto another page may land at another depth (#273)
		reaimEscapingImports(designDir, step.from, step.to);
	}
	return { kind: "duplicated", copies: plan.map((step) => step.copy) };
}

/**
 * A page copied beside itself, every frame and page inside it keeping its own
 * name: a name only has to be free among its siblings, and the copy's are new.
 */
export function duplicatePage(
	root: string,
	name: string,
): Refusal | { kind: "duplicated"; page: string; copies: FrameCopy[] } {
	if (!isPagePath(name)) return refuse(400, `not a page name: "${name}"`);
	const designDir = realDesignDir(root);
	if (!pagePaths(root).has(name)) return refuse(404, describeMissingPage(name));
	const source = folderOf(designDir, name);
	const parent = pageParent(name);
	const fresh = freshName(pageName(name), (candidate) =>
		existsSync(folderOf(designDir, pageUnder(parent, candidate))),
	);
	const page = pageUnder(parent, fresh);
	cpSync(source, folderOf(designDir, page), { recursive: true });
	const copies = frameFoldersUnder(source, designDir).map((held) => {
		const landed = pageParent(pageUnder(page, held));
		return { from: pageUnder(name, held), to: pageUnder(page, held), page: landed };
	});
	return { kind: "duplicated", page, copies };
}

export function createPage(root: string, page: string): Refusal | { kind: "created" } {
	if (!isPagePath(page)) return refuse(400, `not a page name: "${page}"`);
	const designDir = realDesignDir(root);
	const parent = pageParent(page);
	// a page inside a page nothing holds has nowhere to be born; spool never
	// mints the folders above it as a side effect of naming this one
	if (parent !== ROOT_PAGE && !pagePaths(root).has(parent)) return refuse(404, describeMissingPage(parent));
	const target = folderOf(designDir, page);
	if (existsSync(target)) return refuse(409, describeTaken(parent, pageName(page)));
	// an entry-less safe folder is already a page: nothing else has to be written
	mkdirSync(target, { recursive: true });
	return { kind: "created" };
}

/** Where a page's folder is, for the one caller that moves it to the OS Trash. */
export function pageDir(root: string, page: string): Refusal | { kind: "found"; dir: string } {
	if (!isPagePath(page)) return refuse(400, `not a page name: "${page}"`);
	if (!pagePaths(root).has(page)) return refuse(404, describeMissingPage(page));
	return { kind: "found", dir: folderOf(realDesignDir(root), page) };
}

/**
 * What a trashed page leaves behind (#228). The canvas must not stay on a page
 * that is gone and its camera has nothing left to look at, so both go — for the
 * page and for every page inside it, which went with the folder. The rail's
 * order for them goes with them. Frame entries elsewhere in the order are left
 * alone — order is advisory, and a name going stale is not damage.
 */
export function forgetPages(root: string, pages: readonly string[]): void {
	const state = pagesDroppedFromState(readCanvasState(root), pages);
	if (state !== undefined) writeCanvasState(root, state);
	const order = withPagesDropped(readOrder(root), pages);
	if (order !== undefined) writeOrder(root, order);
	const places = placesAfterDrop(readPlaces(root), pages);
	if (places !== undefined) writePlaces(root, places);
}

function describeMissingPage(page: string): string {
	return `no page "${page}" on the canvas — a page is a folder under design/frames/ holding frame folders`;
}

function describePage(page: string): string {
	return page === ROOT_PAGE ? "the root page" : `page "${page}"`;
}

/**
 * `<name>-copy`, `<name>-copy-2`, … — the first spelling nothing claims. What
 * claims one is the caller's to say: whatever already sits where it would land,
 * and every name this same request already minted.
 */
function freshName(name: string, taken: (candidate: string) => boolean): string {
	const base = `${name}-copy`;
	if (!taken(base)) return base;
	for (let suffix = 2; ; suffix += 1) {
		const candidate = `${base}-${suffix}`;
		if (!taken(candidate)) return candidate;
	}
}

/**
 * Every frame folder inside a page, as its path relative to that page —
 * discovery's own rule, asked of one subtree. A page that moves or is copied
 * carries every frame inside it, at whatever depth it sits.
 */
function frameFoldersUnder(dir: string, designDir: string): string[] {
	const found: string[] = [];
	const walk = (at: string, under: string): void => {
		let entries: Dirent[];
		try {
			entries = readdirSync(at, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || !isSafeName(entry.name)) continue;
			const child = join(at, entry.name);
			const held = pageUnder(under, entry.name);
			if (hasFrameEntry(child, designDir)) found.push(held);
			else walk(child, held);
		}
	};
	walk(dir, ROOT_PAGE);
	return found.sort();
}
