import { describe, expect, it } from "vitest";
import type { BeatAtRest, LaidOut, Machine, Rehearsal, RestLook, StepRecord, WordsAtEdge } from "../../deck/rehearsal";
import type { At } from "../../deck/stage-session";
import { cutOf, findingsOf, layoutMoved, missedFrames, restless, unjudgeable } from "./rehearse-rules";

const SIZE = { w: 1280, h: 720 };

const words = (lines: WordsAtEdge["lines"], more: Partial<WordsAtEdge> = {}): WordsAtEdge => ({
	text: "Words",
	size: 32,
	moving: false,
	lines,
	clip: null,
	...more,
});

describe("cutOf", () => {
	const pastRight = { left: 1100, top: 100, right: 1400, bottom: 140 };

	it("names the edge words run past, and how far, whether nothing clips them or the slide's own box does", () => {
		expect(cutOf(words([pastRight]), SIZE)).toEqual({ edge: "right", past: 120 });
		expect(cutOf(words([pastRight], { clip: { left: 0, top: 0, right: 1280, bottom: 720 } }), SIZE)).toEqual({
			edge: "right",
			past: 120,
		});
		expect(cutOf(words([{ left: 40, top: 690, right: 400, bottom: 740 }]), SIZE)).toEqual({
			edge: "bottom",
			past: 20,
		});
	});

	it("says nothing of words a box inside the slide clips, a line out of sight, words that move, display type, or a glyph's overhang", () => {
		expect(
			cutOf(words([pastRight], { clip: { left: 100, top: 0, right: 1200, bottom: 720 } }), SIZE),
		).toBeUndefined();
		expect(cutOf(words([{ left: 1300, top: 100, right: 1600, bottom: 140 }]), SIZE)).toBeUndefined();
		expect(cutOf(words([pastRight], { moving: true }), SIZE)).toBeUndefined();
		expect(cutOf(words([pastRight], { size: 160 }), SIZE)).toBeUndefined();
		expect(cutOf(words([{ left: 1100, top: 100, right: 1282, bottom: 140 }]), SIZE)).toBeUndefined();
	});
});

describe("layoutMoved", () => {
	const element = (id: number, y: number, more: Partial<LaidOut> = {}): LaidOut => ({
		id,
		tag: `p.line-${id}`,
		shown: true,
		moving: false,
		x: 80,
		y,
		w: 600,
		h: 40,
		...more,
	});

	it("names what appeared when the beat pushed the rest, counting a moved box once with what is in it", () => {
		const before = [element(1, 80), element(2, 80, { parent: 1 }), element(3, 0, { shown: false, w: 0, h: 0 })];
		const after = [
			element(1, 140),
			element(2, 140, { parent: 1 }),
			element(3, 80, { source: "frames/a/frame.tsx:4:2" }),
		];
		expect(layoutMoved(before, after)).toEqual({
			moved: 1,
			shift: 60,
			causes: [{ what: "appeared", tag: "p.line-3", source: "frames/a/frame.tsx:4:2" }],
		});
	});

	it("names what grew when nothing appeared or left", () => {
		const before = [element(1, 80, { h: 40 }), element(2, 120)];
		const after = [element(1, 80, { h: 100 }), element(2, 180)];
		expect(layoutMoved(before, after)?.causes).toEqual([{ what: "grew", tag: "p.line-1" }]);
	});

	it("says nothing when nothing moved, or only what moves on its own", () => {
		const before = [element(1, 80), element(2, 300, { moving: true })];
		expect(layoutMoved(before, [element(1, 80), element(2, 340, { moving: true })])).toBeUndefined();
		expect(layoutMoved(before, [...before, element(3, 500)])).toBeUndefined();
		// a caret a typewriter moves along, before the key and after it alike
		const rested = [element(1, 80), element(4, 80, { x: 100 })];
		const typing = [element(1, 80), element(4, 80, { x: 400 })];
		expect(
			layoutMoved(rested, [element(1, 80), element(4, 80, { x: 700 })], restless(rested, typing)),
		).toBeUndefined();
	});

	it("takes a box that only grew from an edge it kept, or one with nothing to draw, for no move", () => {
		// right-aligned words set bolder on their beat: wider to the left, their right edge where it was
		expect(layoutMoved([element(1, 80, { x: 1285, w: 563 })], [element(1, 80, { x: 1277, w: 571 })])).toBeUndefined();
		// a <br>, which lays out nowhere
		expect(layoutMoved([element(1, 627, { w: 0, h: 0 })], [element(1, 0, { x: 0, w: 0, h: 0 })])).toBeUndefined();
		// words centred on their line that wrap to one line fewer: both edges move
		expect(layoutMoved([element(1, 382, { h: 179 })], [element(1, 427, { h: 90 })])?.shift).toBe(45);
	});
});

describe("missedFrames", () => {
	it("counts each gap longer than a frame as the frames it skipped, against the frames the time held", () => {
		expect(missedFrames([16, 32, 48, 64, 80, 96], 0, 100, 16)).toEqual({ missed: 0, of: 6 });
		expect(missedFrames([16, 96], 0, 100, 16)).toEqual({ missed: 4, of: 6 });
	});
});

const quiet: Machine = { software: false, load: 1, cores: 8, idle: Array.from({ length: 30 }, (_, at) => at * 16.7) };

describe("unjudgeable", () => {
	it("judges lag only with a GPU, on a machine neither busy nor missing frames on an empty page", () => {
		expect(unjudgeable(quiet)).toBeUndefined();
		expect(unjudgeable({ ...quiet, software: true })).toBe("software");
		expect(unjudgeable({ ...quiet, load: 7 })).toBe("busy");
		expect(unjudgeable({ ...quiet, idle: [0, 16.7, 33.4, 50, 200, 216.7, 233.4, 250] })).toBe("uneven");
	});
});

describe("findingsOf", () => {
	const look = (frame: string, more: Partial<RestLook> = {}): RestLook => ({
		frame,
		size: SIZE,
		words: [],
		layout: [],
		names: [],
		webgl: 0,
		late: [],
		...more,
	});
	const at = (slide: number, beat = 0): At => ({ slide, beat });
	const beat = (slide: number, beat: number, frame: string, more: Partial<RestLook> = {}): BeatAtRest => ({
		at: at(slide, beat),
		look: look(frame, more),
		shownAt: 0,
		loop: false,
		still: "",
	});
	/** A step shown on time and smooth, its frames every 16.7 ms from its key to rest. */
	const step = (from: At, to: At, key: number, more: Partial<StepRecord> = {}): StepRecord => ({
		pass: "forward",
		from,
		to,
		key,
		shownAt: key + 40,
		shown: { at: to, frame: "", take: 0, ready: true, held: false, frames: 1, waited: 0 },
		rest: key + 300,
		frames: Array.from({ length: 18 }, (_, n) => key + n * 16.7),
		...more,
	});
	const talk = (more: Partial<Rehearsal>): Rehearsal => ({
		page: "talk",
		size: SIZE,
		slides: [
			{ frame: "talk/one", beats: ["a", "b"] },
			{ frame: "talk/two", beats: [""] },
			{ frame: "talk/three", beats: [""] },
		],
		from: 0,
		to: 2,
		machine: quiet,
		openMs: 900,
		steps: [],
		visits: [],
		beats: [],
		moves: [],
		console: [],
		requests: [],
		documents: 1,
		ms: 10_000,
		...more,
	});

	it("puts a line the talk said where it was on screen when said, once however often it came on there", () => {
		const visits = [
			{ at: 1000, to: at(0, 1), pass: "forward" as const },
			{ at: 2000, to: at(1), pass: "forward" as const },
			// the move into slide 2 played again to picture it, and the way back
			{ at: 3000, to: at(0, 1), pass: "forward" as const },
			{ at: 3500, to: at(1), pass: "forward" as const },
			{ at: 9000, to: at(1), pass: "back" as const },
		];
		const said = (at: number) => ({ text: "two said this", at });
		expect(
			findingsOf(
				talk({
					visits,
					console: [said(2100), said(3600), said(9100)],
					requests: [{ url: "https://x.test/a", status: 404, at: 500 }],
				}),
			),
		).toEqual([
			{ kind: "request", place: { slide: 0, beat: 0 }, url: "https://x.test/a", status: 404 },
			{ kind: "console", place: { slide: 1, beat: 0 }, text: "two said this", times: 3 },
		]);
	});

	it("names the elements that share a name for a move that would not run, and leaves the browser's own line about it unsaid", () => {
		const twins = [
			{ name: "hero", tag: "h1", source: "frames/talk/two/frame.tsx:3:4" },
			{ name: "hero", tag: "p", source: "frames/talk/two/frame.tsx:4:4" },
		];
		const found = findingsOf(
			talk({
				beats: [beat(0, 1, "talk/one"), beat(1, 0, "talk/two", { names: twins })],
				steps: [
					step(at(0, 1), at(1), 1000, {
						move: { at: 1000, from: "talk/one", to: "talk/two", failed: "InvalidStateError: aborted" },
					}),
				],
				visits: [{ at: 1000, to: at(1), pass: "forward" }],
				console: [{ text: "Unexpected duplicate view-transition-name: hero", at: 1010 }],
			}),
		);
		expect(found).toEqual([
			{
				kind: "move-failed",
				from: 0,
				why: "InvalidStateError: aborted",
				twice: [{ name: "hero", slide: 1, elements: twins }],
			},
		]);
	});

	it("says a beat that moves a slide's layout, but never of a live slide, whose prototype moves as it is used", () => {
		const laid = (y: number): LaidOut[] => [{ id: 1, tag: "p", shown: true, moving: false, x: 80, y, w: 600, h: 40 }];
		const beats = [beat(0, 0, "talk/one", { layout: laid(80) }), beat(0, 1, "talk/one", { layout: laid(200) })];
		expect(findingsOf(talk({ beats }))).toEqual([
			{ kind: "layout", place: { slide: 0, beat: 1 }, moved: 1, shift: 120, causes: [] },
		]);
		const live = talk({ beats }).slides.map((slide, at) => (at === 0 ? { ...slide, live: true } : slide));
		expect(findingsOf(talk({ beats, slides: live }))).toEqual([]);
	});

	it("says a slide that threw as it came on at the slide, and one that threw on a beat at that beat", () => {
		const slides = (frame: string, when: "mount" | "later") => [
			{ frame, status: "broken" as const, why: "Error: no\n  at x", when },
		];
		const found = findingsOf(
			talk({
				steps: [
					step(at(0), at(0, 1), 1000, { slides: slides("talk/one", "later") }),
					step(at(0, 1), at(1), 2000, { slides: slides("talk/three", "mount") }),
				],
			}),
		);
		expect(found).toEqual([
			{ kind: "threw", place: { slide: 0, beat: 1 }, when: "later", why: "Error: no" },
			{ kind: "threw", place: { slide: 2 }, when: "mount", why: "Error: no" },
		]);
		// one slide of one beat, rehearsed alone, has no key to say it after: the talk's opening says it
		expect(findingsOf(talk({ from: 1, to: 1, opened: slides("talk/two", "mount") }))).toEqual([
			{ kind: "threw", place: { slide: 1 }, when: "mount", why: "Error: no" },
		]);
	});

	it("says a move back between two slides only when the move forward between them went right", () => {
		const failed = (at: number) => ({ at, from: "", to: "", failed: "InvalidStateError: aborted" });
		const found = findingsOf(
			talk({
				steps: [
					step(at(0, 1), at(1), 1000, { move: failed(1000) }),
					step(at(1), at(2), 2000),
					step(at(2), at(1), 3000, { pass: "back", move: failed(3000) }),
					step(at(1), at(0, 1), 4000, { pass: "back", move: failed(4000) }),
				],
			}),
		);
		expect(found.map((finding) => (finding.kind === "move-failed" ? [finding.from, finding.back] : []))).toEqual([
			[0, undefined],
			[1, true],
		]);
	});

	it("says a face that came after its slide was shown, but not on the beat the talk opened on, before anyone watches", () => {
		const font = { kind: "font" as const, name: "Inter", after: 400 };
		const beats = [beat(0, 0, "talk/one", { late: [font] }), beat(1, 0, "talk/two", { late: [font] })];
		expect(findingsOf(talk({ beats }))).toEqual([{ kind: "late", place: { slide: 1, beat: 0 }, file: font }]);
	});

	it("measures words at the edge against the slide's own size, which may not be the talk's", () => {
		const past = words([{ left: 500, top: 100, right: 700, bottom: 140 }]);
		const small = beat(1, 0, "talk/two", { size: { w: 640, h: 360 }, words: [past] });
		expect(findingsOf(talk({ beats: [small] }))).toEqual([
			expect.objectContaining({ kind: "cut", place: { slide: 1, beat: 0 }, edge: "right", past: 60 }),
		]);
	});

	it("names a step that lagged on a machine that can tell, and on one that cannot only says so", () => {
		const slow = step(at(0), at(0, 1), 1000, { shownAt: 1400, frames: [1000, 1100, 1400] });
		expect(findingsOf(talk({ steps: [slow] }))).toEqual([
			expect.objectContaining({ kind: "lag", place: { slide: 0, beat: 1 }, move: false, keyMs: 400 }),
		]);
		expect(findingsOf(talk({ steps: [slow], machine: { ...quiet, software: true } }))).toEqual([
			{ kind: "unjudged", why: "software", load: 1, cores: 8 },
		]);
	});

	it("says the talk was saved while it played, and why it stopped before the end", () => {
		expect(
			findingsOf(talk({ documents: 2, stopped: "the stage's document went away" }), {
				changed: ["frames/talk/two/frame.tsx"],
			}),
		).toEqual([
			{ kind: "saved", files: ["frames/talk/two/frame.tsx"] },
			{ kind: "stopped", why: "the stage's document went away" },
		]);
	});
});
