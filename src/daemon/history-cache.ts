import { type Dirent, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

/*
 * What this Mac read of its team projects' history (spool#189), kept so the same moment is never read twice: bytes
 * by key under the spool state dir, outside every local copy. It is an accelerator, never the truth: anything in it
 * can go, and is read again from spool.page when it is wanted. Its whole size is bounded, the least recently used
 * going first; when each was last used is its file's mtime, so a later daemon goes on from the same order.
 */

export interface HistoryCache {
	/** The bytes kept under a key, now its most recently used; undefined when none are kept. */
	read(key: string): Uint8Array | undefined;
	/** Keep bytes under a key, letting the least recently used go until all of it fits. */
	write(key: string, bytes: Uint8Array): void;
}

/** A key is a relative path of plain segments: `blobs/<hash>`, `moments/<team>/<project>/<moment>.json`. */
const KEY = /^(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+$/u;

export function historyCache(dir: string, { maxBytes }: { maxBytes: number }): HistoryCache {
	/** What is kept, by key: its size and when it was last used. */
	let kept: Map<string, { size: number; used: number }> | undefined;
	let total = 0;
	let clock = 0;

	const fileOf = (key: string) => {
		if (!KEY.test(key) || key.split("/").some((segment) => segment === "." || segment === ".."))
			throw new Error(`not a history cache key: ${key}`);
		return join(dir, key);
	};

	const index = () => {
		if (kept !== undefined) return kept;
		kept = new Map();
		let entries: Dirent[] = [];
		try {
			entries = readdirSync(dir, { recursive: true, withFileTypes: true });
		} catch {
			// nothing kept yet
		}
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			const file = join(entry.parentPath, entry.name);
			try {
				const { size, mtimeMs } = statSync(file);
				kept.set(relative(dir, file).split(sep).join("/"), { size, used: mtimeMs });
				total += size;
				clock = Math.max(clock, mtimeMs);
			} catch {
				// gone meanwhile
			}
		}
		return kept;
	};

	/** A moment after every use so far, so two uses in one millisecond still come in order. */
	const tick = () => {
		clock = Math.max(Date.now(), clock + 1);
		return clock;
	};

	const touch = (key: string, file: string) => {
		const used = tick();
		const entry = index().get(key);
		if (entry !== undefined) entry.used = used;
		try {
			utimesSync(file, used / 1000, used / 1000);
		} catch {
			// a cache that can't say when it was used still reads
		}
	};

	const drop = (key: string) => {
		const entry = index().get(key);
		if (entry === undefined) return;
		index().delete(key);
		total -= entry.size;
		rmSync(fileOf(key), { force: true });
	};

	return {
		read(key) {
			const file = fileOf(key);
			let bytes: Uint8Array;
			try {
				bytes = new Uint8Array(readFileSync(file));
			} catch {
				return undefined;
			}
			touch(key, file);
			return bytes;
		},
		write(key, bytes) {
			const file = fileOf(key);
			drop(key);
			if (bytes.byteLength > maxBytes) return;
			const entries = index();
			const oldest = [...entries].sort(([, a], [, b]) => a.used - b.used);
			for (const [other] of oldest) {
				if (total + bytes.byteLength <= maxBytes) break;
				drop(other);
			}
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, bytes);
			entries.set(key, { size: bytes.byteLength, used: 0 });
			total += bytes.byteLength;
			touch(key, file);
		},
	};
}
