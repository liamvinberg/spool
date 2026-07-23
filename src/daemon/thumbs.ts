import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";

/**
 * The thumbnail cache under design/.spool (#8): boot covers for unmounted
 * frames. Self-captures from the canvas persist here; the Playwright fallback
 * writes the same store. App-owned, gitignored, and deliberately invisible to
 * the change watcher — the store publishes its own writes on the hub.
 */

export function thumbFile(root: string, frame: string): string {
	return join(root, "design", ".spool", "thumbs", `${frame}.png`);
}

/** A terminal frame's serialized screen (#42) — its still store, beside the thumbs. */
export function termScreenFile(root: string, frame: string): string {
	return join(root, "design", ".spool", "term", `${frame}.screen`);
}

export interface StoredThumb {
	png: Buffer;
	etag: string;
}

export function readThumb(root: string, frame: string): StoredThumb | undefined {
	let png: Buffer;
	try {
		png = readFileSync(thumbFile(root, frame));
	} catch {
		return undefined;
	}
	return { png, etag: `"thumb-${createHash("sha256").update(png).digest("hex").slice(0, 32)}"` };
}

export function writeThumb(root: string, frame: string, png: Buffer): void {
	writeAtomic(thumbFile(root, frame), png);
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
	stored(root: string, frame: string): void;
}

const HEAL_COOLDOWN_MS = 60_000;

/**
 * The persistent fallback (#8): a thumbnail miss enqueues one headless shot —
 * single file, per-frame cooldown — so covers heal one by one after the shot
 * lands, announced through `stored` (the hub). Misses while a browser is
 * unavailable cost one failed launch and then nothing.
 */
export function createThumbHealer(deps: HealerDeps) {
	const attempted = new Map<string, number>();
	let tail: Promise<void> = Promise.resolve();

	function request(heal: HealRequest): void {
		const key = `${heal.root}\0${heal.frame}`;
		const last = attempted.get(key);
		const now = Date.now();
		if (last !== undefined && now - last < HEAL_COOLDOWN_MS) return;
		attempted.set(key, now);
		tail = tail
			.then(async () => {
				const png = await deps.capture(heal);
				if (png === undefined) return;
				writeThumb(heal.root, heal.frame, png);
				deps.stored(heal.root, heal.frame);
			})
			// one failed heal (full disk, dead browser) must not wedge the queue
			// or become an unhandled rejection; the cooldown already holds retry
			.catch(() => {});
	}

	return { request };
}
