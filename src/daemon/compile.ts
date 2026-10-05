import { basename } from "node:path";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { isFramePath } from "../page-path";
import { daemonCompileHost } from "./compile-host";
import {
	type CompiledFrameDocument,
	type CompileHost,
	compileFrameDocument,
	describeCompileError,
	type FrameAuthority,
	frameStamp,
	inputsHash,
} from "./design-compile";
import type { DesignFiles } from "./design-files";
import { designPathResolver, realDesignDir } from "./design-path";
import { contentDigest, readDesignBytes } from "./design-reads";
import { diskDesignFiles } from "./disk-files";
import { errorDocument } from "./document";
import { describeMissingFrame, frameFolder, hasFrameEntry, lookupFrame } from "./projection";
import { inertWebfonts, type Webfonts } from "./webfonts";

export type { FrameAuthority } from "./design-compile";

export type FrameDocument =
	| { kind: "ok"; document: string; etag: string; source: string; cache: "hit" | "miss" }
	| { kind: "error"; document: string; message: string }
	| { kind: "missing"; message: string };

/**
 * Compiles frames/<name>/frame.tsx into its served document, content-hash
 * cached: a request rehashes the previous compile's input files and reuses the
 * document byte-for-byte when nothing changed. Compile failures are never
 * cached — a broken frame recompiles per request and recovers instantly.
 */
export function createFrameCompiler(
	version: string,
	webfonts: Webfonts = inertWebfonts(),
	host: CompileHost = daemonCompileHost,
) {
	const cache = new Map<string, CompiledFrameDocument>();

	async function getDocument(root: string, frame: string, authority: FrameAuthority): Promise<FrameDocument> {
		if (!isFramePath(frame)) return { kind: "missing", message: `not a frame name: "${frame}"` };
		const lookup = lookupFrame(root, frame);
		if (lookup.kind === "missing") {
			return { kind: "missing", message: describeMissingFrame(frame) };
		}
		const frameDir = lookup.dir;
		const designDir = realDesignDir(root);
		// the raw entry read, not the projection's memory of it
		if (!hasFrameEntry(frameDir, designDir)) {
			// discovery saw an entry here and the raw read no longer does: the folder
			// is known, so name it exactly, page segment and all
			return {
				kind: "missing",
				message: `no frame "${frame}" — expected design/${frameFolder(frame)}/frame.tsx`,
			};
		}

		const stamp = frameStamp(frame, authority);
		const key = `${root}\0${stamp}`;
		// What this request found. A miss answers only for that: another miss
		// overlapping it may have cached a newer document meanwhile, which this one
		// must neither cover with its own nor clear on its failure.
		const cached = cache.get(key);
		try {
			// One canonical root owns the entry, every resolved import, stylesheets,
			// direct shared reads, and cache revalidation for this document.
			// A machine that comes back online resolves webfonts it could not reach
			// before, and the revision it was built at retires it (#80) — read after
			// the compile, because the compile is what moves it.
			if (
				cached !== undefined &&
				cached.fonts === webfonts.revision() &&
				(await hashInputs(version, stamp, cached.inputs, designDir)) === cached.hash &&
				// again after the hash, which hands the loop back: a resolve that landed
				// meanwhile retires this document as surely as one before it
				cached.fonts === webfonts.revision()
			) {
				return { kind: "ok", document: cached.document, etag: cached.etag, source: cached.source, cache: "hit" };
			}
			const entry = await compileFrameDocument(host, {
				designDir,
				frame,
				project: basename(root),
				authority,
				version,
				webfonts,
			});
			if (cache.get(key) === cached) {
				if (entry.settled) cache.set(key, entry);
				else cache.delete(key);
			}
			return { kind: "ok", document: entry.document, etag: entry.etag, source: entry.source, cache: "miss" };
		} catch (error) {
			if (cache.get(key) === cached) cache.delete(key);
			const message = await describeCompileError(host.esbuild, error);
			return { kind: "error", document: errorDocument(frame, message), message };
		}
	}

	/**
	 * Drop one frame's compiled document, whatever authority it was built for.
	 * The next request compiles it again, at a compile's cost and nothing more:
	 * the cache is an accelerator, never the truth.
	 */
	function forget(root: string, frame: string): void {
		const prefix = `${root}\0${frame}\0`;
		for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
	}

	return { getDocument, forget };
}

export type FrameCompiler = ReturnType<typeof createFrameCompiler>;

/**
 * How long hashing a document's inputs holds the event loop before handing it
 * back. Every input is read, its path checked against design/, and hashed, on
 * a miss and on every hit; a frame on a large canvas has a hundred inputs or
 * more and the player has every frame's. In one piece that was the longest
 * stretch of a compile left on the daemon's event loop once stylesheets moved to
 * their workers.
 */
const HASH_SLICE_MS = 2;

/** A cached document's inputs as they are on disk now, hashed as the compile hashed what it read. */
export async function hashInputs(
	version: string,
	stamp: string,
	inputs: string[],
	designDir: string,
	files: DesignFiles = diskDesignFiles,
): Promise<string> {
	const digests = new Map<string, string>();
	const resolvePath = designPathResolver(designDir, files);
	let slice = performance.now();
	for (const file of inputs) {
		digests.set(file, contentDigest(readDesignBytes(resolvePath, file, files)));
		if (performance.now() - slice >= HASH_SLICE_MS) {
			await yieldTurn();
			slice = performance.now();
		}
	}
	return inputsHash(version, stamp, designDir, digests);
}
