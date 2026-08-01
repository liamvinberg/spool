import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ROOT_PAGE, readOrder, withPageRenamed, withPagesDropped, writeOrder } from "./canvas-order";
import { realDesignDir, resolveDesignPath } from "./design-path";
import { isSafeName } from "./project-files";
import { pageRenamedInState, pagesDroppedFromState, readCanvasState, writeCanvasState } from "./project-state";
import { claimedNames, describeCollision, describeMissingFrame, frameKind, lookupFrame } from "./projection";
import { coverDir, termScreenFile } from "./thumbs";

/**
 * The explorer's file operations (#228): what the rail's verbs do on disk.
 *
 * Every one of them moves or copies a folder, and none of them writes frame
 * source — the law that the canvas never authors a frame stands untouched, and
 * `data-go` literals are deliberately left alone, because the flow map is
 * derived and reports a target it can no longer find.
 *
 * Two rules run through all of it. A bare frame name is identity across the
 * whole project, so a name that lands anywhere must miss every name claimed
 * anywhere, and a claimed one is refused rather than resolved by guessing. And
 * every path resolves before the first write, the way the geometry handler
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
	/** The page the copy landed on; absent on the root page, as in the projection. */
	page?: string;
}

const refuse = (status: Refusal["status"], message: string): Refusal => ({ kind: "refused", status, message });

/** The refusal a taken frame name earns — `describeCollision`'s law, said before the fact. */
function describeClaimed(name: string): string {
	return `"${name}" is already a frame — frame names are identity and must be unique across the project`;
}

/** Where a page's folder is, or would be. */
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
	const target = frameFolderIn(designDir, found.page ?? ROOT_PAGE, to);
	if (claimed.frames.has(to)) return refuse(409, describeClaimed(to));
	// a page holds its name against frames too, and holds it project-wide: only a
	// root-page frame would land on the page's own folder, so the disk alone
	// would let a frame inside a page take a name a page already answers to
	if (claimed.pages.has(to) || existsSync(target)) {
		return refuse(409, `design/frames/ already holds a folder named "${to}"`);
	}
	const stores = nameKeyedStores(root, from, to);
	renameSync(resolveDesignPath(designDir, found.dir), target);
	for (const store of stores) carry(store);
	return { kind: "renamed" };
}

export function renamePage(root: string, from: string, to: string): Refusal | { kind: "renamed" } {
	if (!isSafeName(from)) return refuse(400, `not a page name: "${from}"`);
	if (!isSafeName(to)) return refuse(400, `not a page name: "${to}"`);
	if (from === to) return { kind: "renamed" };
	const designDir = realDesignDir(root);
	const claimed = claimedNames(root);
	if (!claimed.pages.has(from)) return refuse(404, describeMissingPage(from));
	const target = pageFolder(designDir, to);
	if (claimed.frames.has(to)) return refuse(409, describeClaimed(to));
	if (claimed.pages.has(to) || existsSync(target)) {
		return refuse(409, `design/frames/ already holds a folder named "${to}"`);
	}
	renameSync(pageFolder(designDir, from), target);
	// the page's own bookkeeping follows the folder: the page the canvas is on,
	// that page's camera, and the page's place and contents in the rail's order
	const state = pageRenamedInState(readCanvasState(root), from, to);
	if (state !== undefined) writeCanvasState(root, state);
	const order = withPageRenamed(readOrder(root), from, to);
	if (order !== undefined) writeOrder(root, order);
	return { kind: "renamed" };
}

export function moveFrames(root: string, frames: readonly string[], page: string): Refusal | { kind: "moved" } {
	if (frames.length === 0) return refuse(400, "a move must name at least one frame");
	if (page !== ROOT_PAGE && !isSafeName(page)) return refuse(400, `not a page name: "${page}"`);
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
	// terminal screen, the frame's URL and every flow into it are untouched
	for (const move of moves) renameSync(move.from, move.to);
	return { kind: "moved" };
}

export function duplicateFrames(
	root: string,
	frames: readonly string[],
	page: string | undefined,
): Refusal | { kind: "duplicated"; copies: FrameCopy[] } {
	if (frames.length === 0) return refuse(400, "a duplicate must name at least one frame");
	if (page !== undefined && page !== ROOT_PAGE && !isSafeName(page)) return refuse(400, `not a page name: "${page}"`);
	const designDir = realDesignDir(root);
	const claimed = claimedNames(root);
	if (page !== undefined && page !== ROOT_PAGE && !claimed.pages.has(page))
		return refuse(404, describeMissingPage(page));
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
				claimed.pages.has(candidate) ||
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
	for (const step of plan) cpSync(step.move.from, step.move.to, { recursive: true });
	return { kind: "duplicated", copies: plan.map((step) => step.copy) };
}

export function duplicatePage(
	root: string,
	name: string,
): Refusal | { kind: "duplicated"; page: string; copies: FrameCopy[] } {
	if (!isSafeName(name)) return refuse(400, `not a page name: "${name}"`);
	const designDir = realDesignDir(root);
	const claimed = claimedNames(root);
	if (!claimed.pages.has(name)) return refuse(404, describeMissingPage(name));
	const source = pageFolder(designDir, name);
	const page = freshName(
		name,
		(candidate) =>
			claimed.frames.has(candidate) || claimed.pages.has(candidate) || existsSync(pageFolder(designDir, candidate)),
	);
	const target = pageFolder(designDir, page);
	// every child is renamed as it lands: two claimants of one name is a
	// collision, so a page copy that kept its frames' names would make one per frame.
	// The page this call is minting counts as claimed the moment it is chosen.
	const minted = new Set<string>([page]);
	// the copy is the source byte for byte, so what a child name would collide
	// with there is what it collides with here — asked before anything is written
	const copies = frameFoldersIn(source, designDir).map((child) => {
		const fresh = freshName(
			child,
			(candidate) =>
				claimed.frames.has(candidate) ||
				claimed.pages.has(candidate) ||
				minted.has(candidate) ||
				existsSync(join(source, candidate)),
		);
		minted.add(fresh);
		return { from: child, to: fresh, page };
	});
	cpSync(source, target, { recursive: true });
	for (const copy of copies) renameSync(join(target, copy.from), join(target, copy.to));
	return { kind: "duplicated", page, copies };
}

export function createPage(root: string, name: string): Refusal | { kind: "created" } {
	if (!isSafeName(name)) return refuse(400, `not a page name: "${name}"`);
	const designDir = realDesignDir(root);
	const claimed = claimedNames(root);
	if (claimed.frames.has(name)) return refuse(409, describeClaimed(name));
	const target = pageFolder(designDir, name);
	if (claimed.pages.has(name) || existsSync(target)) {
		return refuse(409, `design/frames/ already holds a folder named "${name}"`);
	}
	// an entry-less safe folder is already a page: nothing else has to be written
	mkdirSync(target, { recursive: true });
	return { kind: "created" };
}

/** Where a page's folder is, for the one caller that moves it to the OS Trash. */
export function pageDir(root: string, page: string): Refusal | { kind: "found"; dir: string } {
	if (!isSafeName(page)) return refuse(400, `not a page name: "${page}"`);
	if (!claimedNames(root).pages.has(page)) return refuse(404, describeMissingPage(page));
	return { kind: "found", dir: pageFolder(realDesignDir(root), page) };
}

/**
 * What a trashed page leaves behind (#228). The canvas must not stay on a page
 * that is gone and its camera has nothing left to look at, so both go; the
 * rail's order for it goes with them. Frame entries elsewhere in the order are
 * left alone — order is advisory, and a name going stale is not damage.
 */
export function forgetPages(root: string, pages: readonly string[]): void {
	const state = pagesDroppedFromState(readCanvasState(root), pages);
	if (state !== undefined) writeCanvasState(root, state);
	const order = withPagesDropped(readOrder(root), pages);
	if (order !== undefined) writeOrder(root, order);
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

/** The frame folders one level inside a page, by leaf name — discovery's own rule. */
function frameFoldersIn(dir: string, designDir: string): string[] {
	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && isSafeName(entry.name))
		.map((entry) => entry.name)
		.filter((child) => frameKind(join(dir, child), designDir) !== undefined)
		.sort();
}
