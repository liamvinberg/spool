import { utimesSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, writeDesignFile } from "../test-helpers";
import { realDesignDir } from "./design-path";
import { listProjectFrames } from "./projection";
import { folderTouched, markSeen, verdict } from "./seen";

/**
 * The seen record: what a person has looked at, and what has moved since.
 *
 * Everything here goes through `listProjectFrames(root, { seen: true })`, because
 * the seeding is the part with teeth — a project's first read must report nothing
 * unseen, or an upgrade greets everybody with their whole canvas unread.
 */

function project(...names: string[]): string {
	const root = makeTempDir();
	for (const name of names) {
		writeDesignFile(root, join("frames", name, "frame.tsx"), "export default () => null;\n");
	}
	return root;
}

/** Rewind a frame folder's files, which is how a test says "you saw this later". */
function backdate(root: string, frame: string, seconds: number): void {
	const at = new Date(Date.now() - seconds * 1000);
	utimesSync(join(realDesignDir(root), "frames", frame, "frame.tsx"), at, at);
}

const marks = (root: string): Record<string, string | undefined> =>
	Object.fromEntries(listProjectFrames(root, { seen: true }).frames.map((frame) => [frame.name, frame.unseen]));

describe("the first read", () => {
	it("reports nothing unseen and seeds the record", () => {
		const root = project("home", "pricing");
		expect(marks(root)).toEqual({ home: undefined, pricing: undefined });
		// second read agrees: the seed persisted rather than being recomputed
		expect(marks(root)).toEqual({ home: undefined, pricing: undefined });
	});

	it("leaves seen-state out entirely when nobody asked for it", () => {
		const root = project("home");
		const { frames } = listProjectFrames(root);
		expect(frames[0]?.unseen).toBeUndefined();
		// and asking after the fact still seeds rather than reporting a full canvas
		expect(marks(root)).toEqual({ home: undefined });
	});
});

describe("a frame nobody has looked at", () => {
	it("is new when it arrives after the record was seeded", () => {
		const root = project("home");
		marks(root);
		writeDesignFile(root, join("frames", "pricing", "frame.tsx"), "export default () => null;\n");
		expect(marks(root)).toEqual({ home: undefined, pricing: "new" });
	});

	it("is changed when its own file moves under it", () => {
		const root = project("home");
		backdate(root, "home", 60);
		marks(root);
		writeDesignFile(root, join("frames", "home", "frame.tsx"), "export default () => <main />;\n");
		expect(marks(root)).toEqual({ home: "changed" });
	});

	it("is changed by a file beside its entry, not only by the entry", () => {
		const root = project("home");
		backdate(root, "home", 60);
		marks(root);
		writeDesignFile(root, join("frames", "home", "screens.tsx"), "export const Hero = () => null;\n");
		expect(marks(root)).toEqual({ home: "changed" });
	});

	/**
	 * The scope is the frame's own folder on purpose: one edit to a shared
	 * component would otherwise mark every frame that imports it, which is noise
	 * about one edit rather than news about forty frames.
	 */
	it("is not changed by a shared file it imports", () => {
		const root = project("home");
		backdate(root, "home", 60);
		marks(root);
		writeDesignFile(root, join("shared", "ui", "button.tsx"), "export const Button = () => null;\n");
		expect(marks(root)).toEqual({ home: undefined });
	});
});

describe("marking frames seen", () => {
	it("clears the ones named and leaves the rest", () => {
		const root = project("home");
		marks(root);
		writeDesignFile(root, join("frames", "pricing", "frame.tsx"), "export default () => null;\n");
		writeDesignFile(root, join("frames", "receipt", "frame.tsx"), "export default () => null;\n");
		expect(marks(root)).toEqual({ home: undefined, pricing: "new", receipt: "new" });

		const dirs = [...frameDirs(root)].map(([name, dir]) => ({ name, dir }));
		markSeen(root, dirs, ["pricing"]);
		expect(marks(root)).toEqual({ home: undefined, pricing: undefined, receipt: "new" });
	});

	it("ignores a name the project does not hold", () => {
		const root = project("home");
		marks(root);
		markSeen(root, [{ name: "home", dir: join(realDesignDir(root), "frames", "home") }], ["gone"]);
		expect(marks(root)).toEqual({ home: undefined });
	});

	it("does not swallow an edit that lands after the mark", () => {
		const root = project("home");
		marks(root);
		markSeen(root, [{ name: "home", dir: join(realDesignDir(root), "frames", "home") }], ["home"]);
		backdate(root, "home", -60);
		expect(marks(root)).toEqual({ home: "changed" });
	});
});

describe("geometry", () => {
	/**
	 * Dragging a frame rewrites its sidecar, and spool writes one the first time a
	 * frame is placed. Neither is news about the frame.
	 */
	it("does not mark a frame the hands only moved", () => {
		const root = project("home");
		backdate(root, "home", 60);
		marks(root);
		writeDesignFile(root, join("frames", "home", "frame.json"), '{ "x": 40, "y": 40, "w": 390, "h": 844 }\n');
		expect(marks(root)).toEqual({ home: undefined });
	});
});

describe("the pieces on their own", () => {
	it("reads no entry as new and an older entry as changed", () => {
		expect(verdict(undefined, 10)).toBe("new");
		expect(verdict(5, 10)).toBe("changed");
		expect(verdict(10, 10)).toBeUndefined();
		expect(verdict(20, 10)).toBeUndefined();
	});

	it("says nothing about a folder that is not there", () => {
		expect(folderTouched(join(makeTempDir(), "nowhere"))).toBe(0);
	});
});

/** the same map the seen route builds, without reaching for the whole projection */
function frameDirs(root: string): Map<string, string> {
	const design = realDesignDir(root);
	return new Map(listProjectFrames(root).frames.map((frame) => [frame.name, join(design, "frames", frame.name)]));
}
