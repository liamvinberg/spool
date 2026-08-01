import { createHash } from "node:crypto";
import { type Dirent, readdirSync, readFileSync, rmSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import type { Cover } from "../cover";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";

const COVER_FORMATS = [
	{ ext: "jpg", type: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
	{ ext: "png", type: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
] as const;

type CoverExt = (typeof COVER_FORMATS)[number]["ext"];
const HASH_CHARS = 32;
const COVER_HASH = new RegExp(`^[0-9a-f]{${HASH_CHARS}}$`);
const COVER_NAME = new RegExp(`^([0-9a-f]{${HASH_CHARS}})\\.(${COVER_FORMATS.map((f) => f.ext).join("|")})$`);

export function isCoverHash(value: string): boolean {
	return COVER_HASH.test(value);
}

function coverStoreDir(root: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "thumbs"));
}

function coverDir(root: string, frame: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "thumbs", frame));
}

export function termScreenFile(root: string, frame: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "term", `${frame}.screen`));
}

function listing(dir: string): Dirent[] {
	try {
		return readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
}

const filesIn = (dir: string): string[] =>
	listing(dir)
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name);
const foldersIn = (dir: string): string[] =>
	listing(dir)
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

/** A legacy ladder has no plain image name, and therefore no cover. */
function coverOf(dir: string): Cover | undefined {
	return coverAmong(filesIn(dir));
}

function coverAmong(names: string[]): Cover | undefined {
	const hashes = names
		.map((name) => COVER_NAME.exec(name)?.[1])
		.filter((hash): hash is string => hash !== undefined)
		.sort();
	const hash = hashes.at(-1);
	return hash === undefined ? undefined : { hash };
}

export function scanCovers(root: string): Map<string, Cover> {
	const covers = new Map<string, Cover>();
	const store = coverStoreDir(root);
	for (const frame of foldersIn(store)) {
		const cover = coverOf(join(store, frame));
		if (cover !== undefined) covers.set(frame, cover);
	}
	return covers;
}

/** One cover and the moment its folder last changed. */
export interface DatedCover {
	cover: Cover;
	shotAt: number;
}

/**
 * Every stored cover with its freshness, without holding the event loop. The
 * home list reads each registered project's whole store this way, so one walk
 * answers both what a frame's picture is and how recent it is — asking the
 * store for the picture and then stating each folder separately would resolve
 * the design boundary again per cover, and do all of it in a row.
 */
export async function scanDatedCovers(root: string): Promise<Map<string, DatedCover>> {
	const store = coverStoreDir(root);
	const folders = (await listed(store)).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	const scanned = await Promise.all(
		folders.map(async (frame) => {
			const dir = join(store, frame);
			const cover = coverAmong((await listed(dir)).filter((entry) => entry.isFile()).map((entry) => entry.name));
			return cover === undefined ? undefined : { frame, cover, shotAt: (await modified(dir)) ?? 0 };
		}),
	);
	const covers = new Map<string, DatedCover>();
	for (const entry of scanned) {
		if (entry !== undefined) covers.set(entry.frame, { cover: entry.cover, shotAt: entry.shotAt });
	}
	return covers;
}

async function listed(dir: string): Promise<Dirent[]> {
	try {
		return await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
}

async function modified(dir: string): Promise<number | undefined> {
	try {
		return (await stat(dir)).mtimeMs;
	} catch {
		return undefined;
	}
}

export function readCover(root: string, frame: string): Cover | undefined {
	return coverOf(coverDir(root, frame));
}

export interface StoredCover {
	bytes: Buffer;
	type: string;
}

/** The one image an immutable cover address names. */
export function readCoverImage(root: string, frame: string, hash: string): StoredCover | undefined {
	if (!isCoverHash(hash)) return undefined;
	const dir = coverDir(root, frame);
	for (const format of COVER_FORMATS) {
		try {
			return { bytes: readFileSync(join(dir, `${hash}.${format.ext}`)), type: format.type };
		} catch (error) {
			if (error instanceof DesignBoundaryError) throw error;
		}
	}
	return undefined;
}

function coverFormat(bytes: Buffer): { ext: CoverExt; type: string } | undefined {
	return COVER_FORMATS.find((format) => format.magic.every((byte, index) => bytes[index] === byte));
}

/** Write one image and retire every prior address for this frame. */
export function writeCover(root: string, frame: string, bytes: Buffer): Cover {
	const dir = coverDir(root, frame);
	const format = coverFormat(bytes);
	if (format === undefined) throw new UnservableCoverError();
	const hash = createHash("sha256").update(bytes).digest("hex").slice(0, HASH_CHARS);
	const name = `${hash}.${format.ext}`;
	writeAtomic(join(dir, name), bytes);
	for (const old of filesIn(dir)) {
		if (old !== name) rmSync(join(dir, old), { force: true });
	}
	for (const legacyFormat of COVER_FORMATS) {
		rmSync(join(coverStoreDir(root), `${frame}.${legacyFormat.ext}`), { force: true });
	}
	return { hash };
}

export class UnservableCoverError extends Error {
	constructor() {
		super("a cover must be one PNG or JPEG image");
		this.name = "UnservableCoverError";
	}
}

export interface HealRequest {
	root: string;
	frame: string;
	url: string;
	width: number;
	height: number;
}

interface HealerDeps {
	capture(target: { url: string; width: number; height: number }): Promise<Buffer | undefined>;
	stored(root: string, frame: string, cover: Cover): void;
}

const HEAL_COOLDOWN_MS = 60_000;

export function createThumbHealer(deps: HealerDeps) {
	const attempted = new Map<string, number>();
	let tail: Promise<void> = Promise.resolve();
	const covered = (root: string, frame: string): boolean => {
		try {
			return readCover(root, frame) !== undefined;
		} catch {
			return false;
		}
	};
	function request(heal: HealRequest): void {
		const key = `${heal.root}\0${heal.frame}`;
		const now = Date.now();
		if ((attempted.get(key) ?? -Infinity) + HEAL_COOLDOWN_MS > now || covered(heal.root, heal.frame)) return;
		attempted.set(key, now);
		tail = tail
			.then(async () => {
				const image = await deps.capture(heal);
				if (image === undefined || covered(heal.root, heal.frame)) return;
				const cover = writeCover(heal.root, heal.frame, image);
				deps.stored(heal.root, heal.frame, cover);
			})
			.catch(() => {});
	}
	return { request };
}
