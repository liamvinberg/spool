import { utimesSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { causesOf, describeSlowFrame, slowFrames } from "./check-pace";
import { type FrameCensus, writePace } from "./daemon/thumbs";
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
	// one too slow to time at all is as slow as a frame gets
	expect(describeSlowFrame({ ...slow[1]!, perSecond: 0, slowestMs: 3000 })).toContain("drew under 1 frame a second");
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

const QUIET: FrameCensus = {
	elements: 40,
	animations: [],
	canvasCount: 0,
	canvases: [],
	videos: 0,
	oversized: [],
	webgl: 0,
	loop: false,
};

it("names what a census holds that is likely slowing a frame, most likely first, and what to do", () => {
	const busy: FrameCensus = {
		elements: 4200,
		animations: [
			{ properties: ["left", "width"], elements: 40, endless: false },
			{ properties: ["box-shadow", "opacity"], elements: 12, endless: true },
			// composited motion and a custom property are no cause by their name alone
			{ properties: ["transform"], elements: 300, endless: false },
			{ properties: ["--t"], elements: 1, endless: false },
		],
		// the census keeps the largest canvases, and counts them all
		canvasCount: 11,
		canvases: [
			{ width: 4000, height: 4000, drawnWidth: 200, drawnHeight: 200 },
			{ width: 2560, height: 1440, drawnWidth: 1280, drawnHeight: 720 },
		],
		videos: 2,
		oversized: [
			{ width: 4000, height: 3000, drawnWidth: 400, drawnHeight: 300, count: 1 },
			{ width: 6000, height: 4000, drawnWidth: 300, drawnHeight: 200, count: 12 },
		],
		webgl: 2,
		loop: true,
	};
	expect(causesOf(busy, 2, "slide")).toEqual([
		"animates left and width on 40 elements: these re-lay the page out every frame; move and size with transform",
		"animates box-shadow on 12 elements: these repaint every frame; animate opacity or transform instead",
		"its own requestAnimationFrame loop runs every frame, so the slide never rests; stop it once its motion is done",
		"animations that never end, on 12 elements, keep the slide drawing while you talk; let it end, unless the slide is about that motion",
		"runs 2 WebGL scenes at once; one per slide at most",
		"draws 11 canvases (the largest 4000 by 4000 pixels); one per slide at most",
		"a canvas of 4000 by 4000 pixels drawn at 200 by 200; size it to 400 by 400",
		"a 4000 by 3000 image drawn at 400 by 300; make it about 800 by 600, twice its drawn size, for a sharp screen",
		"12 images of 6000 by 4000 drawn at 300 by 200; make them about 600 by 400, twice their drawn size, for a sharp screen",
		"plays 2 videos at once; one at a time",
		"holds 4200 elements, each one more to style and paint; draw fewer",
	]);
	// one endless animation, on a frame of the canvas rather than a slide
	const spinner = { ...QUIET, animations: [{ properties: ["transform"], elements: 1, endless: true }] };
	expect(causesOf(spinner, 2, "frame")).toEqual([
		"an animation that never ends keeps the frame drawing while it is on screen; let it end, unless the frame is about that motion",
	]);
	// a census that names nothing says so rather than guessing
	expect(causesOf(QUIET, 2, "frame")).toEqual([
		"nothing the booth counts explains it (no layout or paint animation, endless animation, drawing loop or oversized picture): look at what its code does every frame",
	]);
});

it("says a slide's slowest beat by number and name, with its causes, and nothing of a frame timed fine throughout", () => {
	const { root } = makeProject(makeTempDir());
	writeFrame(root, "talk/reveal", FRAME);
	const heavy = { ...QUIET, animations: [{ properties: ["left"], elements: 900, endless: false }] };
	writePace(root, "talk/reveal", {
		perSecond: 58,
		slowestMs: 20,
		scale: 2,
		census: QUIET,
		beats: [
			{ beat: 1, name: "claim", perSecond: 40, slowestMs: 60, census: QUIET },
			{ beat: 2, name: "detail", perSecond: 14, slowestMs: 120, census: heavy },
			{ beat: 3, name: "close", perSecond: 59, slowestMs: 18, census: QUIET },
		],
	});
	// a census that finds something, on a frame that timed fine, is not reported
	writeFrame(root, "talk/calm", FRAME);
	writePace(root, "talk/calm", { perSecond: 60, slowestMs: 17, scale: 2, census: heavy });

	const slow = slowFrames(root);
	expect(slow.map((frame) => frame.frame)).toEqual(["talk/reveal"]);
	expect(describeSlowFrame(slow[0]!, 5)).toBe(
		[
			`${join("design", "frames", "talk", "reveal", "frame.tsx")}: slide 5, slow while beat 3 ("detail") enters: drew 14 frames a second at Retina density when last timed (smooth is 60; its longest took 120 ms). Beat 2 entered slow too.`,
			"  animates left on 900 elements: these re-lay the page out every frame; move and size with transform",
		].join("\n"),
	);
});

it("dates a timing by the shared files the frame imports too", () => {
	const { root } = makeProject(makeTempDir());
	writeFrame(root, "glass", FRAME);
	writePace(root, "glass", { perSecond: 8, slowestMs: 139, scale: 2 });
	writeDesignFile(root, "shared/pane.tsx", "export const Pane = () => null;\n");
	const shared = join(root, "design", "shared", "pane.tsx");
	at(join(root, "design", "frames", "glass", "frame.tsx"), 1000);
	at(shared, 1000);
	at(pace(root, "glass"), 2000);
	const sourcesOf = (frame: string) => (frame === "glass" ? [shared] : []);
	expect(slowFrames(root, sourcesOf)[0]?.editedSince).toBe(false);

	at(shared, 3000);
	expect(slowFrames(root, sourcesOf)[0]?.editedSince).toBe(true);
});
