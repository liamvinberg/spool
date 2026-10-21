import type { ViewerConfig, ViewerProject } from "./source";

/**
 * What an outsider hasn't seen of a share (spool#184): the pages and frames that weren't in it when this browser last
 * opened it, and those still not opened since. Kept in the browser alone, per share, since a link share's outsider may
 * be no account; the first open marks nothing.
 */
export interface OutsiderUnseen {
	pages: ReadonlySet<string>;
	frames: ReadonlySet<string>;
}

/** What this browser keeps of one share: what it held at the last open, and what is still unopened of it. */
interface SeenRecord {
	pages: string[];
	frames: string[];
	unseenPages: string[];
	unseenFrames: string[];
}

/**
 * Where a share's record is kept: by its id when spool.page names it, else by its canvas's address, which is the
 * share's own (a link share's host, a people share's path).
 */
export function seenKey(config: ViewerConfig, project: ViewerProject): string {
	const share = project.outsider?.share.id ?? new URL(config.api, window.location.href).href;
	return `spool-share-seen:${share}`;
}

function read(key: string): SeenRecord | undefined {
	try {
		const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
		if (typeof value !== "object" || value === null) return undefined;
		const record = value as Partial<SeenRecord>;
		const list = (each: unknown) => (Array.isArray(each) ? each.filter((one) => typeof one === "string") : []);
		return {
			pages: list(record.pages),
			frames: list(record.frames),
			unseenPages: list(record.unseenPages),
			unseenFrames: list(record.unseenFrames),
		};
	} catch {
		return undefined;
	}
}

function write(key: string, record: SeenRecord): void {
	try {
		window.localStorage.setItem(key, JSON.stringify(record));
	} catch {}
}

/**
 * The share opened: what wasn't in it at the last open joins what was still unopened, of what it holds now. This
 * open becomes the last one.
 */
export function openShare(key: string, project: ViewerProject): OutsiderUnseen {
	const pages = project.canvas.pages;
	const frames = project.canvas.frames.map((frame) => frame.name);
	const last = read(key);
	const unseen = (now: string[], then: string[] | undefined, still: string[] | undefined) => {
		if (then === undefined) return new Set<string>();
		const held = new Set(then);
		const open = new Set(still);
		return new Set(now.filter((each) => !held.has(each) || open.has(each)));
	};
	const found = {
		pages: unseen(pages, last?.pages, last?.unseenPages),
		frames: unseen(frames, last?.frames, last?.unseenFrames),
	};
	write(key, { pages, frames, unseenPages: [...found.pages], unseenFrames: [...found.frames] });
	return found;
}

/** A page or frame of the share was opened: it is seen from now on, in this browser. */
export function markSeen(key: string, kind: "page" | "frame", name: string): void {
	const record = read(key);
	if (record === undefined) return;
	// one that came in while the canvas was open is held from now on, so the next load doesn't mark it again
	if (kind === "page") {
		record.unseenPages = record.unseenPages.filter((each) => each !== name);
		if (!record.pages.includes(name)) record.pages.push(name);
	} else {
		record.unseenFrames = record.unseenFrames.filter((each) => each !== name);
		if (!record.frames.includes(name)) record.frames.push(name);
	}
	write(key, record);
}
