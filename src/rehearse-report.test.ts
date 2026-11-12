import { expect, it } from "vitest";
import type { Finding } from "./daemon/deck/rehearse-rules";
import { type RehearseOutcome, reportOf } from "./rehearse-report";

const outcome = (findings: Finding[], more: Partial<RehearseOutcome> = {}): RehearseOutcome => ({
	page: "talk",
	slides: [
		{ frame: "talk/open", beats: [""] },
		{ frame: "talk/steps", beats: ["first", "second"] },
		{ frame: "talk/close", beats: [""] },
	],
	size: { w: 1280, h: 720 },
	from: 0,
	to: 2,
	beats: 4,
	ms: 21_400,
	findings,
	folder: "design/.spool/rehearse/talk",
	sheets: ["sheet-1.png", "sheet-2.png"],
	...more,
});

it("says a clean talk in one line, and where its sheet and pictures are", () => {
	expect(reportOf(outcome([]))).toEqual({
		stderr: [],
		stdout: [
			"rehearsed talk, 3 slides (4 beats), forward and back in 21 s: clean",
			"sheet: design/.spool/rehearse/talk/sheet-1.png, sheet-2.png (every beat at rest in order, and each move between slides at its start, middle and end); every picture full size in design/.spool/rehearse/talk/stills/",
		],
		ok: true,
	});
	expect(reportOf(outcome([], { from: 1, to: 1, beats: 2 }), "out").stdout).toEqual([
		"rehearsed talk, slide 2 (2 beats), forward and back in 21 s: clean",
		"sheet: out/sheet-1.png, sheet-2.png (every beat at rest in order, and each move between slides at its start, middle and end); every picture full size in out/stills/",
	]);
});

it("fails only for what is broken, and counts no note for a machine that could not judge lag", () => {
	const late: Finding = {
		kind: "late",
		place: { slide: 1, beat: 1 },
		file: { kind: "picture", name: "http://run.spool.localhost:7767/asset/ab.png", after: 1600 },
	};
	const unjudged: Finding = { kind: "unjudged", why: "busy", load: 90, cores: 22 };
	const noted = reportOf(outcome([late, unjudged]));
	expect(noted.ok).toBe(true);
	expect(noted.stdout[0]).toBe("rehearsed talk, 3 slides (4 beats), forward and back in 21 s: 1 note");
	expect(noted.stderr).toEqual([
		`design/frames/talk/steps/frame.tsx: slide 2 "steps", beat 2 "second": its picture /asset/ab.png came 1.6 s after the slide went on screen, so the slide showed without it; draw it from the slide's first beat, where the stage loads it before the slide comes on, or make it smaller`,
		"lag not judged: the machine is busy (load 90 on 22 cores), so a slow step would say more of it than of the talk; rehearse again when it is quieter",
	]);
	const threw: Finding = { kind: "threw", place: { slide: 2 }, when: "mount", why: "Error: no" };
	const broken = reportOf(outcome([late, threw]));
	expect(broken.ok).toBe(false);
	expect(broken.stdout[0]).toBe("rehearsed talk, 3 slides (4 beats), forward and back in 21 s: 1 broken, 1 note");
});

it("points a finding at the element's own line when it knows one, and at the slide's file when not", () => {
	const twins = [
		{ name: "hero", tag: "h1", source: "frames/talk/close/frame.tsx:3:4" },
		{ name: "hero", tag: "p", source: "frames/talk/close/frame.tsx:4:4" },
	];
	const { stderr } = reportOf(
		outcome([
			{
				kind: "move-failed",
				from: 1,
				why: "InvalidStateError",
				twice: [{ name: "hero", slide: 2, elements: twins }],
			},
			{ kind: "webgl", place: { slide: 2, beat: 0 }, contexts: 3, kept: 2 },
		]),
	);
	expect(stderr).toEqual([
		`design/frames/talk/close/frame.tsx:3:4: the move from slide 2 "steps" to slide 3 "close" did not run: view-transition-name "hero" is on 2 elements of slide 3, h1 at design/frames/talk/close/frame.tsx:3:4 and p at design/frames/talk/close/frame.tsx:4:4; give a name to one element per slide`,
		`design/frames/talk/close/frame.tsx: slide 3 "close": holds 3 WebGL contexts, past the 2 the stage shares between the slide on screen and the ones it readies, so the slides around it come on unready; draw on one canvas`,
	]);
});

it("says what slowed a step that lagged, and where spool check's timing of the slide alone meets it", () => {
	const census = {
		elements: 900,
		animations: [{ properties: ["filter"], elements: 40, endless: true }],
		canvasCount: 0,
		canvases: [],
		videos: 0,
		oversized: [],
		webgl: 0,
		loop: false,
	};
	const [line] = reportOf(
		outcome([
			{
				kind: "lag",
				place: { slide: 1, beat: 0 },
				move: true,
				keyMs: 420,
				census,
				alone: { perSecond: 21, slow: true },
			},
		]),
	).stderr;
	expect(line?.split("\n")[0]).toBe(
		`design/frames/talk/steps/frame.tsx: the move from slide 1 "open" to slide 2 "steps", beat 1 "first" lagged: its change came 420 ms after its key (smooth is under 150)`,
	);
	expect(line?.split("\n").at(-1)).toBe(
		"  alone, it drew 21 frames a second when spool last timed it: spool check design/frames/talk names what slows it",
	);
	expect(line?.split("\n").length).toBeGreaterThan(2);
});
