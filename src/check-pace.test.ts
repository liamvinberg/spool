import { utimesSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { describeSlowFrame, slowFrames } from "./check-pace";
import { writePace } from "./daemon/thumbs";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "./test-helpers";

const FRAME = "export default function Frame() { return <main />; }\n";
const pace = (root: string, frame: string) => join(root, "design", ".spool", "thumbs", frame, "pace.json");
const at = (file: string, seconds: number) => utimesSync(file, seconds, seconds);

it("names every frame the booth timed slow, and none it timed keeping up", () => {
	const { root } = makeProject(makeTempDir());
	writeFrame(root, "glass", FRAME);
	writePace(root, "glass", { perSecond: 8, slowestMs: 139, scale: 2 });
	writeFrame(root, "quick", FRAME);
	writePace(root, "quick", { perSecond: 120, slowestMs: 11, scale: 2 });
	writeFrame(root, "clock/hands", FRAME);
	writePace(root, "clock/hands", { perSecond: 30, slowestMs: 40, scale: 1.4 });
	// a timing outliving its frame is of nothing
	writePace(root, "gone", { perSecond: 5, slowestMs: 300, scale: 2 });

	const slow = slowFrames(root);
	expect(slow.map((frame) => frame.path)).toEqual([
		join("design", "frames", "clock", "hands", "frame.tsx"),
		join("design", "frames", "glass", "frame.tsx"),
	]);
	expect(describeSlowFrame(slow[1]!)).toBe(
		`${join("design", "frames", "glass", "frame.tsx")}: slow: drew 8 frames a second at Retina density when last timed (smooth is 60; its longest took 139 ms). While it plays it holds back the whole canvas.`,
	);
	expect(describeSlowFrame(slow[0]!)).toContain("at 1.4x density");
});

it("says a timing is older than the frame's latest edit, and not that a move made it so", () => {
	const { root } = makeProject(makeTempDir());
	writeFrame(root, "glass", FRAME);
	writePace(root, "glass", { perSecond: 8, slowestMs: 139, scale: 2 });
	const source = join(root, "design", "frames", "glass", "frame.tsx");
	at(source, 1000);
	at(pace(root, "glass"), 2000);
	writeDesignFile(root, "frames/glass/frame.json", '{ "x": 0, "y": 0, "w": 1440, "h": 900 }\n');
	expect(slowFrames(root)[0]?.editedSince).toBe(false);

	at(source, 3000);
	expect(slowFrames(root)[0]?.editedSince).toBe(true);
	expect(describeSlowFrame(slowFrames(root)[0]!)).toMatch(/Timed before its latest edit\.$/);
});
