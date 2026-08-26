import type { Dirent } from "node:fs";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { ASSET_EXTENSIONS, IMAGE_BUDGET_BYTES, kilobytes } from "./assets";
import { designRelativePath, realDesignDir, resolveDesignPath } from "./design-path";
import type { PatchRefusal } from "./hand-write";

/**
 * The project half of the asset swap (#260).
 *
 * The write lane knows how to point a `src` at an identifier; it does not know
 * where a picture goes, what it may be called, or how much of it a document
 * can carry. That is all here, because all of it is about the project rather
 * than about JSX.
 *
 * One rule shapes the rest: an image in a frame is an import and never a URL,
 * so a hand that drops a photo onto an `<img>` is asking spool to put a file
 * in the repo. It goes beside the frame that draws it, which is where the
 * skill tells an agent to put one; moving it to `shared/assets/` when a second
 * frame wants it stays an authoring act rather than a swap.
 */

/** What a name may be before it is a file beside somebody's frame. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** How many project assets one listing offers, which is a menu rather than an index. */
export const ASSET_LISTING_CAP = 200;
/**
 * The most one swap request may carry.
 *
 * Not the budget. The budget is the lane's own answer and says so in the
 * project's own words, so this sits well above it: a photograph dropped on a
 * frame should hear that it is over the image budget, not that spool cannot
 * read it. What is left is a bound on a body nobody meant to send.
 */
export const ASSET_REQUEST_CAP = 16 * IMAGE_BUDGET_BYTES;

/**
 * What a `data:` URI costs before its bytes: `data:image/svg+xml;base64,` is
 * the longest of the six. Counted, because the compiler spends its budget on
 * the characters it writes rather than on the file, and a refusal that is
 * looser than the compile would let a swap land and then fail to build.
 */
const DATA_URI_PREFIX = "data:image/svg+xml;base64,".length;

/**
 * What the pictures a document would carry come to, or the reason it may not.
 *
 * The budget is the document's rather than the picture's — the compiler charges
 * every image it inlines against the same ceiling — so this is asked about the
 * whole set the swap would leave behind, the one being replaced already gone
 * from it.
 *
 * What it cannot see is an image imported by a shared component the frame
 * mounts: the closure is the compiler's answer and this reads one file. So a
 * swap that fits here can still bust the build, which the compile says in the
 * project's own words and names the file for. It is the common case this
 * catches, and catching it before the bytes are written is the point.
 */
export function overBudget(inlined: number): PatchRefusal | undefined {
	if (inlined <= IMAGE_BUDGET_BYTES) return undefined;
	return {
		code: "image-budget",
		says: `${kilobytes(inlined)} of image is over the ${kilobytes(IMAGE_BUDGET_BYTES)} document budget`,
	};
}

/** What one file costs a document: its base64, and the `data:` head in front of it. */
export function inlinedSize(bytes: number): number {
	return base64Length(bytes) + DATA_URI_PREFIX;
}

/**
 * What the images a file imports weigh, once inlined.
 *
 * `known` stands in for a picture that is not on disk yet, which is the one a
 * drop is about. A specifier that resolves to nothing costs nothing: the
 * compile is where a missing import is somebody's answer, not here.
 */
export function imageSpend(
	designDir: string,
	file: string,
	specifiers: readonly string[],
	known: ReadonlyMap<string, number>,
): number {
	let spent = 0;
	for (const specifier of specifiers) {
		const at = resolve(dirname(file), specifier);
		const held = known.get(at);
		if (held !== undefined) {
			spent += inlinedSize(held);
			continue;
		}
		try {
			spent += inlinedSize(statSync(resolveDesignPath(designDir, at)).size);
		} catch {
			// nothing there to weigh, and the compile is where that is answered
		}
	}
	return spent;
}

/**
 * What a file weighs once it is in a document.
 *
 * The budget is spent on the `data:` URI rather than on the file — the
 * compiler counts the characters it writes — so a base64 third is added
 * before anything is compared. Four characters per three bytes, rounded up.
 */
export function base64Length(bytes: number): number {
	return Math.ceil(bytes / 3) * 4;
}

/** Whether a name is one spool will write, and an image at that. */
export function assetName(name: string): string | undefined {
	if (name.length === 0 || name.length > 96 || !SAFE_NAME.test(name)) return undefined;
	return ASSET_EXTENSIONS.has(extname(name).toLowerCase()) ? name : undefined;
}

/**
 * Where the bytes go, and whether they need to be written at all.
 *
 * Beside the frame, under the name they arrived with. A name already taken by
 * the same picture is that picture — dropping the same file twice writes one
 * file — and a name taken by a different one gains a number rather than
 * overwriting somebody's asset.
 */
export function assetDestination(
	root: string,
	frameDir: string,
	name: string,
	bytes: Buffer,
): { file: string; path: string; write: boolean } {
	const designDir = realDesignDir(root);
	const stem = name.slice(0, name.length - extname(name).length);
	const ext = extname(name);
	for (let at = 1; at < 1000; at += 1) {
		const tried = at === 1 ? name : `${stem}-${at}${ext}`;
		const file = resolveDesignPath(designDir, join(frameDir, tried));
		let held: Buffer | undefined;
		try {
			held = readFileSync(file);
		} catch {
			return { file, path: designRelativePath(designDir, file), write: true };
		}
		if (held.equals(bytes)) return { file, path: designRelativePath(designDir, file), write: false };
	}
	throw new Error(`no free name beside the frame for ${name}`);
}

/** How one file reaches another from where it is written: `./hero.png`, `../../shared/assets/logo.svg`. */
export function specifierFrom(file: string, asset: string): string {
	const walk = relative(dirname(file), asset).split(sep).join("/");
	return walk.startsWith(".") ? walk : `./${walk}`;
}

/**
 * The identifier the import is minted with.
 *
 * The file's own name, because that is what an author would have typed, taken
 * down to something JavaScript will accept: `cart-hero.png` becomes
 * `cartHero`, and a name that begins with a digit gains a stem rather than
 * failing to parse.
 */
export function identifierHint(name: string): string {
	const stem = name.slice(0, name.length - extname(name).length);
	const camel = stem
		.split(/[^A-Za-z0-9]+/)
		.filter((part) => part !== "")
		.map((part, at) => (at === 0 ? part : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`))
		.join("");
	if (camel === "") return "image";
	return /^[0-9]/.test(camel) ? `image${camel[0]?.toUpperCase() ?? ""}${camel.slice(1)}` : camel;
}

/** One picture the project already has, as a menu row. */
export interface ProjectAsset {
	/** design-relative, as the canvas spells every path: `shared/assets/logo.svg` */
	path: string;
	bytes: number;
}

/**
 * The imports a frame may choose from: what is beside it, and what is shared.
 *
 * Never the whole project. An image beside another frame is that frame's, and
 * reaching across for it is the kind of import an author decides on rather
 * than one a menu should offer — `shared/assets/` is the place a project keeps
 * what more than one frame draws, so it is the place the menu reads.
 */
export function listAssets(root: string, frameDir: string): ProjectAsset[] {
	const designDir = realDesignDir(root);
	const found: ProjectAsset[] = [];
	collect(designDir, frameDir, found, 0);
	try {
		collect(designDir, resolveDesignPath(designDir, join(designDir, "shared", "assets")), found, 0);
	} catch {
		// a project with no shared/assets/ simply offers what is beside the frame
	}
	return found.slice(0, ASSET_LISTING_CAP).sort((a, b) => a.path.localeCompare(b.path));
}

/** Two levels is `shared/assets/` and one folder of sorting inside it. */
const LISTING_DEPTH = 2;

function collect(designDir: string, dir: string, found: ProjectAsset[], depth: number): void {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (found.length >= ASSET_LISTING_CAP) return;
		if (entry.name.startsWith(".")) continue;
		const file = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (depth < LISTING_DEPTH) collect(designDir, file, found, depth + 1);
			continue;
		}
		if (!ASSET_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
		const path = designRelativePath(designDir, file);
		if (found.some((held) => held.path === path)) continue;
		try {
			found.push({ path, bytes: statSync(file).size });
		} catch {
			// a file that went away between the listing and the stat is not one
		}
	}
}

/** A design-relative path a hand named, resolved, or nothing when it is no project image. */
export function assetChosen(root: string, path: string): { file: string; bytes: number } | undefined {
	if (path.includes("\\") || path.split("/").includes("..") || path.split("/").includes(".spool")) return undefined;
	if (!ASSET_EXTENSIONS.has(extname(path).toLowerCase())) return undefined;
	const designDir = realDesignDir(root);
	try {
		const file = resolveDesignPath(designDir, join(designDir, path));
		return { file, bytes: statSync(file).size };
	} catch {
		return undefined;
	}
}
