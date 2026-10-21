import { afterEach, beforeEach, expect, it } from "vitest";
import { markSeen, openShare } from "./outsider-seen";
import type { ViewerProject } from "./source";

/** A share's canvas holding these frames, each on the page its path names. */
function holding(frames: string[]): ViewerProject {
	const pages = [...new Set(frames.map((name) => name.split("/").slice(0, -1).join("/")).filter((page) => page))];
	return { canvas: { pages, frames: frames.map((name) => ({ name })) } } as unknown as ViewerProject;
}

beforeEach(() => {
	const kept = new Map<string, string>();
	Object.assign(globalThis, {
		window: {
			localStorage: {
				getItem: (key: string) => kept.get(key) ?? null,
				setItem: (key: string, value: string) => void kept.set(key, value),
			},
		},
	});
});

afterEach(() => {
	Reflect.deleteProperty(globalThis, "window");
});

it("holds what was opened while the canvas was open, so the next open doesn't mark it", () => {
	const key = "spool-share-seen:s1";
	openShare(key, holding(["home"]));
	// the canvas read again while open brings a page in, and the outsider opens it before any reload
	markSeen(key, "page", "menu");
	markSeen(key, "frame", "menu/list");
	const next = openShare(key, holding(["home", "menu/list"]));
	expect([...next.pages, ...next.frames]).toEqual([]);
});

it("marks nothing when the browser keeps nothing", () => {
	Object.assign(globalThis, {
		window: {
			localStorage: {
				getItem: () => {
					throw new Error("blocked");
				},
				setItem: () => {
					throw new Error("blocked");
				},
			},
		},
	});
	const key = "spool-share-seen:s2";
	openShare(key, holding(["home"]));
	const next = openShare(key, holding(["home", "menu/list"]));
	expect([...next.pages, ...next.frames]).toEqual([]);
});
