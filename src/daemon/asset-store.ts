import type { Buffer } from "node:buffer";
import { statSync } from "node:fs";
import { extname, join } from "node:path";
import { ASSET_MEDIA_TYPES } from "./assets";
import type { CompiledAsset } from "./design-compile";
import { designPathResolver, realDesignDir } from "./design-path";
import { contentDigest, readDesignBytes } from "./design-reads";
import { diskDesignFiles } from "./disk-files";

/** An image the asset route answers with: the bytes just read and found to hash as asked. */
export interface ServedAsset {
	bytes: Buffer;
	type: string;
}

/**
 * The images behind `/asset/<hash>.<ext>` (#216): only a file in a registered
 * project's design/ whose bytes hash as asked, read through design/'s boundary
 * and hashed again on every answer, so a changed or deleted file stops
 * answering its old hash. A compiled document names where its images are; a
 * hash no compile named here (a player, a document from before a restart) is
 * looked for through every registered design/, each file hashed once per
 * change of its size or time.
 */
export function createAssetStore(roots: () => readonly string[]) {
	/** Where each hash was last found: project root, then the file. */
	const known = new Map<string, Map<string, string>>();
	/** Each scanned file's hash, as of the size and time it had. */
	const scanned = new Map<string, { size: number; mtimeMs: number; hash: string }>();

	function remember(hash: string, root: string, file: string): void {
		let places = known.get(hash);
		if (places === undefined) {
			places = new Map();
			known.set(hash, places);
		}
		places.set(file, root);
	}

	/** A compiled document's images, where it found them. */
	function note(root: string, assets: readonly CompiledAsset[]): void {
		if (assets.length === 0) return;
		let designDir: string;
		try {
			designDir = realDesignDir(root);
		} catch {
			return;
		}
		for (const asset of assets) remember(asset.hash, root, join(designDir, asset.path));
	}

	/** The file's bytes, if it is still in its project's design/, of the type asked, and hashes as asked. */
	function verified(root: string, file: string, hash: string, type: string): Buffer | undefined {
		if (ASSET_MEDIA_TYPES[extname(file).toLowerCase()] !== type) return undefined;
		try {
			const designDir = realDesignDir(root);
			const bytes = readDesignBytes(designPathResolver(designDir), file, diskDesignFiles);
			return bytes !== undefined && contentDigest(bytes) === hash ? bytes : undefined;
		} catch {
			return undefined;
		}
	}

	/** Every image file of a type under one design/, symlinked folders left alone. */
	function* imagesIn(folder: string, type: string): Generator<string> {
		for (const entry of diskDesignFiles.list(folder) ?? []) {
			const path = join(folder, entry.name);
			if (entry.kind === "directory") yield* imagesIn(path, type);
			else if (entry.kind !== "other" && ASSET_MEDIA_TYPES[extname(entry.name).toLowerCase()] === type) yield path;
		}
	}

	function hashOf(file: string): string | undefined {
		let stat: { size: number; mtimeMs: number };
		try {
			stat = statSync(file);
		} catch {
			scanned.delete(file);
			return undefined;
		}
		const before = scanned.get(file);
		if (before !== undefined && before.size === stat.size && before.mtimeMs === stat.mtimeMs) return before.hash;
		const bytes = diskDesignFiles.read(file);
		if (bytes === undefined) return undefined;
		const hash = contentDigest(bytes);
		scanned.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, hash });
		return hash;
	}

	/** The image at `/asset/<hash><extension>`, or nothing when no registered design/ holds it now. */
	function read(hash: string, extension: string): ServedAsset | undefined {
		const type = ASSET_MEDIA_TYPES[extension.toLowerCase()];
		if (type === undefined) return undefined;
		const registered = new Set(roots());
		const places = known.get(hash);
		for (const [file, root] of places ?? []) {
			const bytes = registered.has(root) ? verified(root, file, hash, type) : undefined;
			if (bytes !== undefined) return { bytes, type };
			places?.delete(file);
		}
		for (const root of registered) {
			let designDir: string;
			try {
				designDir = realDesignDir(root);
			} catch {
				continue;
			}
			for (const file of imagesIn(designDir, type)) {
				if (hashOf(file) !== hash) continue;
				const bytes = verified(root, file, hash, type);
				if (bytes === undefined) continue;
				remember(hash, root, file);
				return { bytes, type };
			}
		}
		return undefined;
	}

	return { note, read };
}

export type AssetStore = ReturnType<typeof createAssetStore>;
