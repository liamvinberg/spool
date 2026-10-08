import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { SpoolError } from "../errors";
import { realDesignDir, resolveDesignPath } from "./design-path";

/**
 * A project's one picture of a kind, kept as a hidden image file in `design/shared/` and found by name with no
 * manifest: `shared/icon.*` is what its tab wears, `shared/thumbnail.*` what its Home card shows. shared/ is what a
 * team project's sync sends, so a teammate gets the file for free, and a local project's git tracks it.
 *
 * The hash is the file's content: it addresses the bytes in a URL, where it is both the credential an <img>
 * cannot carry as a header and an immutable cache key.
 */
export interface SharedImage {
	/** Relative to the project root, forward slashes. */
	path: string;
	hash: string;
}

/** The image kinds a shared image may be, in the order they are looked for. */
const IMAGE_TYPES = {
	svg: "image/svg+xml",
	png: "image/png",
	webp: "image/webp",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
} as const;
export type ImageExt = keyof typeof IMAGE_TYPES;
const IMAGE_EXTS = Object.keys(IMAGE_TYPES) as ImageExt[];

/** `design/shared/<stem>.<ext>`, for each kind in turn. */
export function sharedImageFiles(stem: string): string[] {
	return IMAGE_EXTS.map((ext) => `design/shared/${stem}.${ext}`);
}

const HASH_CHARS = 32;
const IMAGE_HASH = new RegExp(`^[0-9a-f]{${HASH_CHARS}}$`);

export function isImageHash(value: string): boolean {
	return IMAGE_HASH.test(value);
}

export const hashOf = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex").slice(0, HASH_CHARS);

/** The content type an image path is served as. */
export function imageType(path: string): string {
	const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	if (ext === "ico") return "image/x-icon";
	return IMAGE_TYPES[ext as ImageExt] ?? "application/octet-stream";
}

/**
 * A regular file's bytes, or nothing: a link is never followed, so a file symlinked at a secret never leaves the
 * machine through a URL, and a file past the cap is not taken.
 */
async function readPlain(file: string, maxBytes: number): Promise<Buffer | undefined> {
	try {
		const stat = await lstat(file);
		if (!stat.isFile() || stat.size === 0 || stat.size > maxBytes) return undefined;
		return await readFile(file);
	} catch {
		return undefined;
	}
}

/** Whether every folder on the way to a root-relative path is a folder, not a link out. */
function throughFolders(root: string, path: string): boolean {
	const segments = path.split("/").slice(0, -1);
	let at = root;
	for (const segment of segments) {
		at = join(at, segment);
		try {
			if (!lstatSync(at).isDirectory()) return false;
		} catch {
			return false;
		}
	}
	return true;
}

/** The first of some root-relative paths that is a plain file under the cap, with its bytes. */
export async function readFirstImage(
	root: string,
	paths: readonly string[],
	maxBytes: number,
): Promise<{ image: SharedImage; bytes: Buffer } | undefined> {
	for (const path of paths) {
		if (!throughFolders(root, path)) continue;
		const bytes = await readPlain(join(root, ...path.split("/")), maxBytes);
		if (bytes !== undefined) return { image: { path, hash: hashOf(bytes) }, bytes };
	}
	return undefined;
}

/** The kind of image some bytes are, read from the bytes rather than from what a request said they were. */
export function sniffImage(bytes: Buffer): ImageExt | undefined {
	const starts = (magic: number[], at = 0) => magic.every((byte, index) => bytes[at + index] === byte);
	if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
	if (starts([0xff, 0xd8, 0xff])) return "jpg";
	if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "webp";
	// an SVG is text: an XML prolog, comments or a doctype may come first, then the <svg> element
	const head = bytes
		.subarray(0, 4096)
		.toString("utf8")
		.replace(/^\uFEFF/u, "");
	if (/^\s*</u.test(head) && /<svg[\s>]/iu.test(head) && !head.includes("\u0000")) return "svg";
	return undefined;
}

export class ImageRefused extends SpoolError {}

/** What a refused image is told, in the app's words. */
export function imageRefusals(maxBytes: number) {
	return {
		type: "Use an SVG, PNG, WebP or JPEG image.",
		size: `Use an image under ${maxBytes / 1_000_000} MB.`,
	} as const;
}

/** design/shared, resolved inside design/, made if it is not there yet. */
function sharedDir(root: string): string {
	const designDir = realDesignDir(root);
	const shared = resolveDesignPath(designDir, join(designDir, "shared"));
	mkdirSync(shared, { recursive: true });
	return shared;
}

/** Every `<stem>.*` design/shared holds, by name, of the kinds an image may be. */
function imageFilesIn(shared: string, stem: string): string[] {
	try {
		return readdirSync(shared, { withFileTypes: true })
			.filter((entry) => !entry.isDirectory() && entry.name.startsWith(`${stem}.`))
			.map((entry) => entry.name)
			.filter((name) => (IMAGE_EXTS as string[]).includes(name.slice(stem.length + 1).toLowerCase()));
	} catch {
		return [];
	}
}

/**
 * Write `design/shared/<stem>.<ext>`, the kind read from the bytes, and take away every other `<stem>.*` so
 * exactly one is there. Refuses what isn't an SVG, PNG, WebP or JPEG, and anything over the cap.
 */
export function writeSharedImage(root: string, stem: string, bytes: Buffer, maxBytes: number): SharedImage {
	const refusals = imageRefusals(maxBytes);
	if (bytes.length > maxBytes) throw new ImageRefused(refusals.size);
	const ext = bytes.length === 0 ? undefined : sniffImage(bytes);
	if (ext === undefined) throw new ImageRefused(refusals.type);
	const shared = sharedDir(root);
	const name = `${stem}.${ext}`;
	const file = resolveDesignPath(realDesignDir(root), join(shared, name));
	writeAtomic(file, bytes);
	for (const other of imageFilesIn(shared, stem)) if (other !== name) rmSync(join(shared, other), { force: true });
	return { path: `design/shared/${name}`, hash: hashOf(bytes) };
}

/** Take away every `design/shared/<stem>.*`, and nothing else in shared/. */
export function removeSharedImage(root: string, stem: string): void {
	let shared: string;
	try {
		const designDir = realDesignDir(root);
		shared = resolveDesignPath(designDir, join(designDir, "shared"));
	} catch {
		return;
	}
	for (const name of imageFilesIn(shared, stem)) rmSync(join(shared, name), { force: true });
}

/**
 * Keeps the open pages told when a project's shared image changes on disk: by a menu, by hand, by an agent, or
 * arriving from a teammate through sync. It listens to the change hub's shared/ events, the ones such a file
 * raises, and only says something when the image a project resolves to is not the one it last said.
 */
export function createSharedImageWatch<Image extends { hash: string }>(deps: {
	find: (root: string) => Promise<Image | undefined>;
	subscribe: (root: string, listener: (event: { kind: string }) => void) => () => void;
	changed: (root: string, image: Image | undefined) => void;
}) {
	const watches = new Map<string, () => void>();
	/** The hash each root's image last resolved to; null for none. */
	const said = new Map<string, string | null>();
	const recheck = async (root: string) => {
		const image = await deps.find(root);
		const hash = image?.hash ?? null;
		if (said.get(root) === hash || !watches.has(root)) return;
		said.set(root, hash);
		deps.changed(root, image);
	};
	return {
		keeping(roots: readonly string[]): void {
			for (const [root, stop] of watches) {
				if (roots.includes(root)) continue;
				stop();
				watches.delete(root);
				said.delete(root);
			}
			for (const root of roots) {
				if (watches.has(root)) continue;
				watches.set(
					root,
					deps.subscribe(root, (event) => {
						if (event.kind === "shared") void recheck(root);
					}),
				);
				void deps.find(root).then((image) => {
					if (!said.has(root)) said.set(root, image?.hash ?? null);
				});
			}
		},
		/** The image a write just made, so the watcher's echo of it says nothing twice. */
		saw(root: string, image: Image | undefined): void {
			said.set(root, image?.hash ?? null);
		},
		close(): void {
			for (const stop of watches.values()) stop();
			watches.clear();
			said.clear();
		},
	};
}
