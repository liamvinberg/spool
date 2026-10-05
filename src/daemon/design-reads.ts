import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { DesignBoundaryError, designPathResolver } from "./design-boundary";
import type { DesignFiles } from "./design-files";

/** What a cache key says of one file: the SHA-256 of its bytes, or that there were none. */
export function contentDigest(bytes: Uint8Array | undefined): string {
	return bytes === undefined ? "absent" : createHash("sha256").update(bytes).digest("hex");
}

/**
 * One design file's bytes, or undefined when there are none to read: nothing
 * at the path, or a folder where a file was expected. A path that leaves
 * design/ is refused, never read.
 */
export function readDesignBytes(
	resolvePath: (file: string) => string,
	file: string,
	files: DesignFiles,
): Buffer | undefined {
	let path: string;
	try {
		path = resolvePath(file);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
	const bytes = files.read(path);
	return bytes === undefined ? undefined : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Everything one compile reads from design/, each file read once. The bundle,
 * the stylesheet and the cache key are all made from these bytes, so a
 * document is a pure function of one read of its inputs and is cached under
 * the hash of exactly what it was made of. An edit that lands mid-compile
 * leaves a document of the files as they were, under their own hash, and the
 * next request finds the hash moved and compiles again. Two reads of the same
 * file were what let the old document be cached under the new hash.
 */
export interface DesignReads {
	/** A file's bytes: read on the first ask, the same bytes on every ask after. */
	bytes(file: string): Buffer | undefined;
	text(file: string): string | undefined;
	/**
	 * A file read where these reads cannot reach, a stylesheet worker, by the
	 * digest of what it read. Read twice with different bytes, the compile is
	 * of no one state of the folder.
	 */
	noted(file: string, digest: string): void;
	/** Every file read, by the digest of what was read. */
	digests(): ReadonlyMap<string, string>;
	/** Whether every file was one state throughout: no read differed from another of the same file. */
	settled(): boolean;
}

export function createDesignReads(designDir: string, files: DesignFiles): DesignReads {
	const resolvePath = designPathResolver(designDir, files);
	const read = new Map<string, Buffer | undefined>();
	const digests = new Map<string, string>();
	let torn = false;

	function noted(file: string, digest: string): void {
		const before = digests.get(file);
		if (before !== undefined && before !== digest) torn = true;
		digests.set(file, digest);
	}

	function bytes(file: string): Buffer | undefined {
		if (read.has(file)) return read.get(file);
		const found = readDesignBytes(resolvePath, file, files);
		read.set(file, found);
		noted(file, contentDigest(found));
		return found;
	}

	return {
		bytes,
		text: (file) => bytes(file)?.toString("utf8"),
		noted,
		digests: () => digests,
		settled: () => !torn,
	};
}
