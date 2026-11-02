import type { Buffer } from "node:buffer";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { ASSET_MEDIA_TYPES } from "./assets";
import type { CompiledAsset } from "./design-compile";
import { designPathResolver, realDesignDir } from "./design-path";
import { contentDigest } from "./design-reads";

/** An image the asset route answers with: bytes that hash as asked, and its media type. */
export interface ServedAsset {
	bytes: Buffer;
	type: string;
}

/** How long a walk of every design/ answers for the hashes it did not find, whatever the watchers said. */
const INDEX_MS = 60_000;

/**
 * The images behind `/asset/<hash>.<ext>` (#216): only a regular file in a
 * registered project's design/ whose bytes hash as asked, reached through
 * design/'s boundary. A compiled document names where its images are; a hash
 * no compile named (a player, a document from before a restart) is looked for
 * by one walk of every registered design/, which then answers for every hash
 * it did not find until a design/ changes. Each file is hashed once per change
 * of its size or time, so a changed or deleted file stops answering its old
 * hash without its bytes being hashed on every answer.
 */
export function createAssetStore(deps: {
	roots: () => readonly string[];
	/** Hear of every change under a project's design/; answers the way to stop. */
	subscribe?: (root: string, changed: () => void) => () => void;
}) {
	/** Where each hash was found: file, then its project root. */
	const known = new Map<string, Map<string, string>>();
	/** Each file's hash, as of the size and time it had. */
	const hashes = new Map<string, { size: number; mtimeMs: number; hash: string }>();
	/** Each project's changes heard, and the way to stop hearing them. */
	const heard = new Map<string, { revision: number; stop: () => void }>();
	/** What the last walk was of: every root's revision, and when. */
	let walked: { revisions: string; at: number } | undefined;

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

	/** Every registered root's revision as heard, its watch started if none is; undefined when one can't be heard. */
	function revisions(roots: readonly string[]): string | undefined {
		const subscribe = deps.subscribe;
		if (subscribe === undefined) return undefined;
		for (const [root, entry] of heard) {
			if (roots.includes(root)) continue;
			entry.stop();
			heard.delete(root);
		}
		return roots
			.map((root) => {
				let entry = heard.get(root);
				if (entry === undefined) {
					const started: { revision: number; stop: () => void } = { revision: 0, stop: () => {} };
					started.stop = subscribe(root, () => {
						started.revision += 1;
					});
					heard.set(root, started);
					entry = started;
				}
				return `${root}\0${entry.revision}`;
			})
			.join("\0");
	}

	/** A regular file's hash, by its size and time: hashed again only when either moved. */
	async function hashOf(file: string): Promise<{ hash: string; bytes?: Buffer } | undefined> {
		let found: { size: number; mtimeMs: number; isFile(): boolean };
		try {
			found = await stat(file);
		} catch {
			hashes.delete(file);
			return undefined;
		}
		if (!found.isFile()) return undefined;
		const before = hashes.get(file);
		if (before !== undefined && before.size === found.size && before.mtimeMs === found.mtimeMs) {
			return { hash: before.hash };
		}
		let bytes: Buffer;
		try {
			bytes = await readFile(file);
		} catch {
			return undefined;
		}
		const hash = contentDigest(bytes);
		hashes.set(file, { size: found.size, mtimeMs: found.mtimeMs, hash });
		return { hash, bytes };
	}

	/** The file's bytes, if it is still in its project's design/, of the type asked, and hashes as asked. */
	async function verified(root: string, file: string, hash: string, type: string): Promise<Buffer | undefined> {
		if (ASSET_MEDIA_TYPES[extname(file).toLowerCase()] !== type) return undefined;
		let path: string;
		try {
			path = designPathResolver(realDesignDir(root))(file);
		} catch {
			return undefined;
		}
		const found = await hashOf(path);
		if (found?.hash !== hash) return undefined;
		try {
			return found.bytes ?? (await readFile(path));
		} catch {
			return undefined;
		}
	}

	/** Every image file under a design/ a frame could import: regular files alone, never through a symlink. */
	async function imagesIn(folder: string, into: string[]): Promise<void> {
		let entries: import("node:fs").Dirent[];
		try {
			entries = await readdir(folder, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			// spool's own state (covers among it) and installed packages are no frame's imports
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const path = join(folder, entry.name);
			if (entry.isDirectory()) await imagesIn(path, into);
			else if (entry.isFile() && ASSET_MEDIA_TYPES[extname(entry.name).toLowerCase()] !== undefined) into.push(path);
		}
	}

	/** Every image in every registered design/, each where it is now. */
	async function walk(roots: readonly string[]): Promise<void> {
		for (const root of roots) {
			let designDir: string;
			try {
				designDir = realDesignDir(root);
			} catch {
				continue;
			}
			const files: string[] = [];
			await imagesIn(designDir, files);
			for (const file of files) {
				const found = await hashOf(file);
				if (found !== undefined) remember(found.hash, root, file);
			}
		}
	}

	async function found(hash: string, type: string, registered: ReadonlySet<string>): Promise<Buffer | undefined> {
		const places = known.get(hash);
		for (const [file, root] of places ?? []) {
			const bytes = registered.has(root) ? await verified(root, file, hash, type) : undefined;
			if (bytes !== undefined) return bytes;
			places?.delete(file);
		}
		return undefined;
	}

	/** The image at `/asset/<hash><extension>`, or nothing when no registered design/ holds it now. */
	async function read(hash: string, extension: string): Promise<ServedAsset | undefined> {
		const type = ASSET_MEDIA_TYPES[extension.toLowerCase()];
		if (type === undefined) return undefined;
		const roots = deps.roots();
		const registered = new Set(roots);
		const bytes = await found(hash, type, registered);
		if (bytes !== undefined) return { bytes, type };
		// a walk since every design/ last changed has already said this hash is nowhere
		const now = revisions(roots);
		if (now !== undefined && walked?.revisions === now && Date.now() - walked.at < INDEX_MS) return undefined;
		await walk(roots);
		if (now !== undefined) walked = { revisions: now, at: Date.now() };
		const again = await found(hash, type, registered);
		return again === undefined ? undefined : { bytes: again, type };
	}

	function close(): void {
		for (const entry of heard.values()) entry.stop();
		heard.clear();
	}

	return { note, read, close };
}

export type AssetStore = ReturnType<typeof createAssetStore>;
