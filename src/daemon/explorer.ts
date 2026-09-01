import { cpSync, type Dirent, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	isPagePath,
	isPageSlot,
	isSafeName,
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
import { reaimEscapingImports } from "./import-aim";
import { pageMovedInState, pagesDroppedFromState, readCanvasState, writeCanvasState } from "./project-state";
import { claimedNames, describeCollision, describeMissingFrame, frameKind, lookupFrame } from "./projection";
import { coverDir, termScreenFile } from "./thumbs";

/**
 * The explorer's file operations (#228): what the rail's verbs do on disk, at
 * whatever depth the page holding them sits (#231).
 *
 * Every one of them moves or copies a folder, and none of them authors frame
 * source — the law that the canvas never writes what a frame draws stands
 * untouched. The one exception a move carries is bookkeeping, not authoring: a
 * `../` import whose target stayed put while the folder's depth changed is
 * re-aimed (#273, `import-aim.ts`), because leaving it is leaving the frame
 * broken by a gesture that promised to only rearrange. `data-go` literals are
 * deliberately left alone, because the flow map is derived and reports a
 * target it can no longer find.
 *
 * Three rules run through all of it. A bare frame name is identity across the
 * whole project, so a name that lands anywhere must miss every name claimed
 * anywhere — page folders included — and a claimed one is refused rather than
 * resolved by guessing. A page's identity is its path, so its own name only has
 * to be free among its siblings, and a page that moves carries its subtree's
 * cameras and stored order with it. And every path resolves before the first
 * write, the way the geometry handler resolves every sidecar before it writes
 * one: a rename that would escape design/ or a copy whose destination is taken
 * has to fail with the disk exactly as it was.
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

/** The refusal a taken frame name earns — `describeCollision`'s law, said before the fact. */
function describeClaimed(name: string): string {
	return `"${name}" is already a frame — frame names are identity and must be unique across the project`;
}

/** The refusal a taken folder earns, naming the folder that already holds one. */
function describeTaken(parent: string, name: string): string {
	return `design/${parent === ROOT_PAGE ? "frames" : `frames/${parent}`}/ already holds a folder named "${name}"`;
}

/** Where a page's folder is, or would be. A page is already a path, so this is one join. */
function pageFolder(designDir: string, page: string): string {
	return resolveDesignPath(designDir, join(designDir, "frames", page));
}

/** Where a frame's folder is, or would be, on a given page — `""` being the root one. */
function frameFolderIn(designDir: string, page: string, name: string): string {
	return page === ROOT_PAGE
		? resolveDesignPath(designDir, join(designDir, "frames", name))
		: resolveDesignPath(designDir, join(designDir, "frames", page, name));
}

/** One `.spool` store that has to follow a renamed frame, resolved before anything moves. */
interface Carry {
	from: string;
	to: string;
}

/**
 * The stores keyed by the bare name (#228): a frame's covers and its persisted
 * terminal screen. The geometry sidecar needs nothing — it rides inside the
 * folder — but these two sit in .spool/ under the old name, and a rename that
 * left them there would blank the picture the canvas is drawing right now.
 */
function nameKeyedStores(root: string, from: string, to: string): Carry[] {
	return [
		{ from: coverDir(root, from), to: coverDir(root, to) },
		{ from: termScreenFile(root, from), to: termScreenFile(root, to) },
	];
}

function carry({ from, to }: Carry): void {
	if (!existsSync(from)) return;
	// the new name is nobody's frame, so anything parked under it is orphaned cache
	rmSync(to, { recursive: true, force: true });
	renameSync(from, to);
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

export function renameFrame(root: string, from: string, to: string): Refusal | { kind: "renamed" } {
	if (!isSafeName(from)) return refuse(400, `not a frame name: "${from}"`);
	if (!isSafeName(to)) return refuse(400, `not a frame name: "${to}"`);
	// a frame renamed to what it is already called is a request already answered
	if (from === to) return { kind: "renamed" };
	const designDir = realDesignDir(root);
	const found = lookupFrame(root, from);
	if (found.kind === "collision") return refuse(409, describeCollision(from, found.paths));
	if (found.kind === "missing") return refuse(404, describeMissingFrame(from));
	const claimed = claimedNames(root);
	const page = found.page ?? ROOT_PAGE;
	const target = frameFolderIn(designDir, page, to);
	if (claimed.frames.has(to)) return refuse(409, describeClaimed(to));
	// a page holds its name against frames wherever that page sits, and holds it
	// project-wide: only a frame landing beside the page's own folder would be
	// stopped by the disk, so the disk alone would let a frame elsewhere take a
	// name a page already answers to
	if (claimed.pageNames.has(to) || existsSync(target)) return refuse(409, describeTaken(page, to));
	const stores = nameKeyedStores(root, from, to);
	renameSync(resolveDesignPath(designDir, found.dir), target);
	for (const store of stores) carry(store);
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
	const claimed = claimedNames(root);
	if (!claimed.pages.has(from)) return refuse(404, describeMissingPage(from));
	const name = pageName(to);
	const target = pageFolder(designDir, to);
	if (claimed.frames.has(name)) return refuse(409, describeClaimed(name));
	if (claimed.pages.has(to) || existsSync(target)) return refuse(409, describeTaken(pageParent(to), name));
	renameSync(pageFolder(designDir, from), target);
	// the page's own bookkeeping follows the folder: the page the canvas is on,
	// every camera inside it, and its place and contents in the rail's order
	carryPage(root, from, to);
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
	const claimed = claimedNames(root);
	if (parent !== ROOT_PAGE && !claimed.pages.has(parent)) return refuse(404, describeMissingPage(parent));
	const named = [...new Set(pages)];
	const moves: { from: string; to: string; dir: string; target: string }[] = [];
	for (const page of named) {
		if (!isPagePath(page)) return refuse(400, `not a page name: "${page}"`);
		if (!claimed.pages.has(page)) return refuse(404, describeMissingPage(page));
		if (page === parent || pageWithin(page, parent)) {
			return refuse(409, `"${page}" cannot move into itself or into a page inside it`);
		}
		// a page inside another page being moved is already moving, in its folder
		if (named.some((each) => pageWithin(each, page))) continue;
		// a page already held by the page it is being moved to has arrived
		if (pageParent(page) === parent) continue;
		const to = pageUnder(parent, pageName(page));
		const target = pageFolder(designDir, to);
		if (existsSync(target)) return refuse(409, describeTaken(parent, pageName(page)));
		moves.push({ from: page, to, dir: pageFolder(designDir, page), target });
	}
	for (const move of moves) {
		renameSync(move.dir, move.target);
		// every frame the page carries changed depth with it (#273)
		reaimEscapingImports(designDir, move.dir, move.target);
		carryPage(root, move.from, move.to);
	}
	return { kind: "moved" };
}

export function moveFrames(root: string, frames: readonly string[], page: string): Refusal | { kind: "moved" } {
	if (frames.length === 0) return refuse(400, "a move must name at least one frame");
	if (!isPageSlot(page)) return refuse(400, `not a page name: "${page}"`);
	const designDir = realDesignDir(root);
	if (page !== ROOT_PAGE && !claimedNames(root).pages.has(page)) return refuse(404, describeMissingPage(page));
	const moves: Carry[] = [];
	for (const name of new Set(frames)) {
		if (!isSafeName(name)) return refuse(400, `not a frame name: "${name}"`);
		const found = lookupFrame(root, name);
		if (found.kind === "collision") return refuse(409, describeCollision(name, found.paths));
		if (found.kind === "missing") return refuse(404, describeMissingFrame(name));
		// a frame already on the page it is being moved to has arrived
		if ((found.page ?? ROOT_PAGE) === page) continue;
		const target = frameFolderIn(designDir, page, name);
		if (existsSync(target)) return refuse(409, `${describePage(page)} already holds a folder named "${name}"`);
		moves.push({ from: resolveDesignPath(designDir, found.dir), to: target });
	}
	// name is identity, so the folder is the whole move: geometry, stills, the
	// terminal screen, the frame's URL and every flow into it are untouched.
	// The one thing inside it a move does touch is a `../` import (#273): its
	// target stayed put while the folder's depth changed, so the import is
	// re-aimed rather than the frame left broken
	for (const move of moves) {
		renameSync(move.from, move.to);
		reaimEscapingImports(designDir, move.from, move.to);
	}
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
	const claimed = claimedNames(root);
	if (page !== undefined && page !== ROOT_PAGE && !claimed.pages.has(page)) {
		return refuse(404, describeMissingPage(page));
	}
	const minted = new Set<string>();
	const plan: { move: Carry; copy: FrameCopy }[] = [];
	for (const name of new Set(frames)) {
		if (!isSafeName(name)) return refuse(400, `not a frame name: "${name}"`);
		const found = lookupFrame(root, name);
		if (found.kind === "collision") return refuse(409, describeCollision(name, found.paths));
		if (found.kind === "missing") return refuse(404, describeMissingFrame(name));
		// with no page asked for, a copy stays where its original lives
		const landing = page ?? found.page ?? ROOT_PAGE;
		const fresh = freshName(
			name,
			(candidate) =>
				claimed.frames.has(candidate) ||
				claimed.pageNames.has(candidate) ||
				minted.has(candidate) ||
				existsSync(frameFolderIn(designDir, landing, candidate)),
		);
		minted.add(fresh);
		plan.push({
			move: { from: resolveDesignPath(designDir, found.dir), to: frameFolderIn(designDir, landing, fresh) },
			copy: { from: name, to: fresh, ...(landing === ROOT_PAGE ? {} : { page: landing }) },
		});
	}
	// the whole folder, sidecar included: a copy lands where its original sits
	for (const step of plan) {
		cpSync(step.move.from, step.move.to, { recursive: true });
		// a copy asked onto another page may land at another depth (#273)
		reaimEscapingImports(designDir, step.move.from, step.move.to);
	}
	return { kind: "duplicated", copies: plan.map((step) => step.copy) };
}

export function duplicatePage(
	root: string,
	name: string,
): Refusal | { kind: "duplicated"; page: string; copies: FrameCopy[] } {
	if (!isPagePath(name)) return refuse(400, `not a page name: "${name}"`);
	const designDir = realDesignDir(root);
	const claimed = claimedNames(root);
	if (!claimed.pages.has(name)) return refuse(404, describeMissingPage(name));
	const source = pageFolder(designDir, name);
	const parent = pageParent(name);
	// a page's name only has to be free where the copy lands, because a page is
	// its path: two pages under different parents may share one
	const fresh = freshName(
		pageName(name),
		(candidate) =>
			claimed.frames.has(candidate) ||
			claimed.pages.has(pageUnder(parent, candidate)) ||
			existsSync(pageFolder(designDir, pageUnder(parent, candidate))),
	);
	const page = pageUnder(parent, fresh);
	const target = pageFolder(designDir, page);
	// every frame inside is renamed as it lands, at whatever depth it sits: two
	// claimants of one name is a collision, so a page copy that kept its frames'
	// names would make one per frame. The name this call is minting counts as
	// claimed the moment it is chosen.
	const minted = new Set<string>([fresh]);
	// the copy is the source byte for byte, so what a child name would collide
	// with there is what it collides with here — asked before anything is written
	const copies = frameFoldersUnder(source, designDir).map((held) => {
		const under = pageParent(held);
		const child = pageName(held);
		const renamed = freshName(
			child,
			(candidate) =>
				claimed.frames.has(candidate) ||
				claimed.pageNames.has(candidate) ||
				minted.has(candidate) ||
				existsSync(join(source, under, candidate)),
		);
		minted.add(renamed);
		return { held, under, from: child, to: renamed, page: pageUnder(page, under) };
	});
	cpSync(source, target, { recursive: true });
	for (const copy of copies) renameSync(join(target, copy.held), join(target, copy.under, copy.to));
	return { kind: "duplicated", page, copies: copies.map(({ from, to, page }) => ({ from, to, page })) };
}

export function createPage(root: string, page: string): Refusal | { kind: "created" } {
	if (!isPagePath(page)) return refuse(400, `not a page name: "${page}"`);
	const designDir = realDesignDir(root);
	const claimed = claimedNames(root);
	const parent = pageParent(page);
	// a page inside a page nothing holds has nowhere to be born; spool never
	// mints the folders above it as a side effect of naming this one
	if (parent !== ROOT_PAGE && !claimed.pages.has(parent)) return refuse(404, describeMissingPage(parent));
	const name = pageName(page);
	if (claimed.frames.has(name)) return refuse(409, describeClaimed(name));
	const target = pageFolder(designDir, page);
	if (claimed.pages.has(page) || existsSync(target)) return refuse(409, describeTaken(parent, name));
	// an entry-less safe folder is already a page: nothing else has to be written
	mkdirSync(target, { recursive: true });
	return { kind: "created" };
}

/** Where a page's folder is, for the one caller that moves it to the OS Trash. */
export function pageDir(root: string, page: string): Refusal | { kind: "found"; dir: string } {
	if (!isPagePath(page)) return refuse(400, `not a page name: "${page}"`);
	if (!claimedNames(root).pages.has(page)) return refuse(404, describeMissingPage(page));
	return { kind: "found", dir: pageFolder(realDesignDir(root), page) };
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
 * claims one is the caller's to say: a frame copy has to miss every frame name
 * in the project, every name this same request already minted, and whatever
 * already sits where it would land.
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
 * discovery's own rule, asked of one subtree. A page copy has to rename every
 * frame it took, and how deep one sits changes nothing about that.
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
			if (frameKind(child, designDir) !== undefined) found.push(held);
			else walk(child, held);
		}
	};
	walk(dir, ROOT_PAGE);
	return found.sort();
}
