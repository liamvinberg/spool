import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { SpoolError } from "../errors";
import { realDesignDir, resolveDesignPath } from "./design-path";

/**
 * A project's icon, found by name with no manifest: the first file found wins.
 *
 * 1. `design/shared/icon.*`, the one a person chose. It sits in shared/ because that is what a team project's
 *    sync sends, so a teammate's tab gets it for free, and a local project's git tracks it.
 * 2. The repo's own favicon, from a short list of the places frameworks keep one. The project root is the folder
 *    holding design/, so a project made in a codebase wears that codebase's icon until someone picks another.
 * 3. Nothing, and the UI draws the name's first letter.
 *
 * The hash is the file's content: it addresses the bytes at `/icons/<project>/<hash>`, where it is both the
 * credential an <img> cannot carry as a header and an immutable cache key.
 */
export interface ProjectIcon {
	from: "file" | "favicon";
	/** Relative to the project root, forward slashes. */
	path: string;
	hash: string;
}

/** The image kinds an icon file may be, in the order they are looked for. */
const ICON_TYPES = {
	svg: "image/svg+xml",
	png: "image/png",
	webp: "image/webp",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
} as const;
type IconExt = keyof typeof ICON_TYPES;
const ICON_EXTS = Object.keys(ICON_TYPES) as IconExt[];

/** `design/shared/icon.<ext>`, the chosen icon, for each kind in turn. */
export const ICON_FILES = ICON_EXTS.map((ext) => `design/shared/icon.${ext}`);

/**
 * Where a repo keeps its favicon, most likely first: a vector anywhere beats a bitmap, since the icon is drawn at
 * 16 to 24 pixels, and an .ico (often a 16px bitmap) comes last. Within each kind: Vite's and CRA's `public/`,
 * Next's app router (`app/` or `src/app/`), SvelteKit's `static/`, then the root.
 */
export const FAVICON_FILES = [
	"public/favicon.svg",
	"public/icon.svg",
	"app/icon.svg",
	"src/app/icon.svg",
	"static/favicon.svg",
	"favicon.svg",
	"public/favicon.png",
	"public/icon.png",
	"app/icon.png",
	"src/app/icon.png",
	"static/favicon.png",
	"public/favicon.ico",
	"app/favicon.ico",
	"src/app/favicon.ico",
	"static/favicon.ico",
	"favicon.ico",
];

/** The largest icon spool takes, written or found: an icon is drawn at 24 pixels. */
export const ICON_MAX_BYTES = 1_000_000;
const HASH_CHARS = 32;
const ICON_HASH = new RegExp(`^[0-9a-f]{${HASH_CHARS}}$`);

export function isIconHash(value: string): boolean {
	return ICON_HASH.test(value);
}

const hashOf = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex").slice(0, HASH_CHARS);

/** The content type an icon path is served as. */
export function iconType(path: string): string {
	const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	if (ext === "ico") return "image/x-icon";
	return ICON_TYPES[ext as IconExt] ?? "application/octet-stream";
}

/**
 * A regular file's bytes, or nothing: a link is never followed, so a favicon symlinked at a secret never leaves
 * the machine through a URL, and a file past the cap is not an icon.
 */
async function readPlain(file: string): Promise<Buffer | undefined> {
	try {
		const stat = await lstat(file);
		if (!stat.isFile() || stat.size === 0 || stat.size > ICON_MAX_BYTES) return undefined;
		return await readFile(file);
	} catch {
		return undefined;
	}
}

/** The candidates in order: the chosen file's, then the favicons. Each folder above them must be a real one. */
function candidates(): { from: ProjectIcon["from"]; path: string }[] {
	return [
		...ICON_FILES.map((path) => ({ from: "file" as const, path })),
		...FAVICON_FILES.map((path) => ({ from: "favicon" as const, path })),
	];
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

/** The project's icon and its bytes, or nothing when it has none. */
export async function readProjectIcon(root: string): Promise<{ icon: ProjectIcon; bytes: Buffer } | undefined> {
	for (const { from, path } of candidates()) {
		if (!throughFolders(root, path)) continue;
		const bytes = await readPlain(join(root, ...path.split("/")));
		if (bytes !== undefined) return { icon: { from, path, hash: hashOf(bytes) }, bytes };
	}
	return undefined;
}

/** The project's icon, for its card: what Home and the tabs draw. */
export async function findProjectIcon(root: string): Promise<ProjectIcon | undefined> {
	return (await readProjectIcon(root))?.icon;
}

/** The kind of image some bytes are, read from the bytes rather than from what a request said they were. */
export function sniffIcon(bytes: Buffer): IconExt | undefined {
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

export class IconRefused extends SpoolError {}

/** What a refused icon is told, in the app's words. */
export const ICON_REFUSALS = {
	type: "Use an SVG, PNG, WebP or JPEG image.",
	size: `Use an image under ${ICON_MAX_BYTES / 1_000_000} MB.`,
} as const;

/** design/shared, resolved inside design/, made if it is not there yet. */
function sharedDir(root: string): string {
	const designDir = realDesignDir(root);
	const shared = resolveDesignPath(designDir, join(designDir, "shared"));
	mkdirSync(shared, { recursive: true });
	return shared;
}

/** Every `icon.*` design/shared holds, by name: the icon files and any other kind someone left there. */
function iconFilesIn(shared: string): string[] {
	try {
		return readdirSync(shared, { withFileTypes: true })
			.filter((entry) => !entry.isDirectory() && /^icon\.[^.]+$/u.test(entry.name))
			.map((entry) => entry.name)
			.filter((name) => (ICON_EXTS as string[]).includes(name.slice(5).toLowerCase()));
	} catch {
		return [];
	}
}

/**
 * Write the chosen icon as `design/shared/icon.<ext>`, the kind read from its bytes, and take away every other
 * `icon.*` so exactly one is there. Refuses what isn't an SVG, PNG, WebP or JPEG, and anything over the cap.
 */
export function writeProjectIcon(root: string, bytes: Buffer): ProjectIcon {
	if (bytes.length > ICON_MAX_BYTES) throw new IconRefused(ICON_REFUSALS.size);
	const ext = bytes.length === 0 ? undefined : sniffIcon(bytes);
	if (ext === undefined) throw new IconRefused(ICON_REFUSALS.type);
	const shared = sharedDir(root);
	const name = `icon.${ext}`;
	const file = resolveDesignPath(realDesignDir(root), join(shared, name));
	writeAtomic(file, bytes);
	for (const other of iconFilesIn(shared)) if (other !== name) rmSync(join(shared, other), { force: true });
	return { from: "file", path: `design/shared/${name}`, hash: hashOf(bytes) };
}

/** Take away `design/shared/icon.*`: the favicon or the letter comes back. */
export function removeProjectIcon(root: string): void {
	let shared: string;
	try {
		const designDir = realDesignDir(root);
		shared = resolveDesignPath(designDir, join(designDir, "shared"));
	} catch {
		return;
	}
	for (const name of iconFilesIn(shared)) rmSync(join(shared, name), { force: true });
}

/**
 * Keeps the open pages told when a project's icon changes on disk: by the menu, by hand, by an agent, or arriving
 * from a teammate through sync. It listens to the change hub's shared/ events, the ones an icon file raises, and
 * only says something when the icon a project resolves to is not the one it last said.
 */
export function createIconWatch(deps: {
	subscribe: (root: string, listener: (event: { kind: string }) => void) => () => void;
	changed: (root: string, icon: ProjectIcon | undefined) => void;
}) {
	const watches = new Map<string, () => void>();
	/** The hash each root's icon last resolved to; null for none. */
	const said = new Map<string, string | null>();
	const recheck = async (root: string) => {
		const icon = await findProjectIcon(root);
		const hash = icon?.hash ?? null;
		if (said.get(root) === hash || !watches.has(root)) return;
		said.set(root, hash);
		deps.changed(root, icon);
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
				void findProjectIcon(root).then((icon) => {
					if (!said.has(root)) said.set(root, icon?.hash ?? null);
				});
			}
		},
		/** The icon a write just made, so the watcher's echo of it says nothing twice. */
		saw(root: string, icon: ProjectIcon | undefined): void {
			said.set(root, icon?.hash ?? null);
		},
		close(): void {
			for (const stop of watches.values()) stop();
			watches.clear();
			said.clear();
		},
	};
}
