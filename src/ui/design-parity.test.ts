import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * spool's own canvas is a team project, so design/ is out of git: a fresh checkout, CI's included, has none until a
 * signed-in verb fetches it. The canvas's half of each parity is checked wherever it has been.
 */
const canvas = existsSync(join(process.cwd(), "design/canvas.json"));

describe("typography foundations", () => {
	it.runIf(canvas)("keeps the canvas's type definitions identical to the app", () => {
		expect(readFileSync(join(process.cwd(), "design/shared/typography.css"), "utf8")).toBe(
			readFileSync(join(__dirname, "typography.css"), "utf8"),
		);
	});
});

/**
 * The arrival's own numbers, read off the stylesheet that holds them.
 *
 * A paragraph opens over 340ms and a row over 260ms on the house curve; the open is a grid
 * track growing, so the words are laid out at their final width from the first frame and
 * only the clip moves. None of it is reachable from a mounted element, so this reads the
 * file, and the design canvas's copy of it.
 */
describe("the stylesheet the arrival lives in", () => {
	const CSS = readFileSync(join(process.cwd(), "src/ui/ui.css"), "utf8");
	const TOKENS = canvas ? readFileSync(join(process.cwd(), "design/shared/tokens.css"), "utf8") : "";
	const block = (open: string): string => {
		const at = CSS.indexOf(open);
		if (at === -1) throw new Error(`no ${open}`);
		const end = CSS.indexOf("\n\t}", at);
		return CSS.slice(at, end === -1 ? undefined : end);
	};

	it("opens a paragraph over 340ms and a row over 260ms, on the house curve", () => {
		expect(CSS).toContain("--animate-agent-paragraph: agent-open 340ms cubic-bezier(0.22, 0.61, 0.36, 1)");
		expect(CSS).toContain("--animate-agent-open: agent-open 260ms cubic-bezier(0.22, 0.61, 0.36, 1)");
		expect(CSS).toContain("--animate-agent-rise: agent-entry 340ms cubic-bezier(0.22, 0.61, 0.36, 1)");
	});

	/** the box is a grid track: no height is measured and nothing re-lays the words */
	it("opens on a grid track from nothing to its own size", () => {
		const frames = block("@keyframes agent-open");

		expect(frames).toContain("grid-template-rows: 0fr");
		expect(frames).toContain("grid-template-rows: 1fr");
		expect(frames).not.toMatch(/height|max-height/);
	});

	it("rises 6px and fades, moving nothing else", () => {
		const frames = block("@keyframes agent-entry");

		expect(frames).toContain("opacity: 0");
		expect(frames).toContain("translateY(6px)");
		expect(frames).not.toMatch(/filter|blur|scale/);
	});

	it("blinks nothing, anywhere", () => {
		expect(CSS).not.toMatch(/blink/i);
	});

	/** reduced motion is a jump cut: the message is settled and nothing about it moves */
	it("stands the whole rail still when stillness is asked for", () => {
		const at = CSS.indexOf("@media (prefers-reduced-motion: reduce)");
		const still = CSS.slice(at, CSS.indexOf("\n}", at));

		for (const name of ["entry", "open", "paragraph", "rise", "word", "spin", "step"]) {
			expect(still).toContain(`.animate-agent-${name}`);
		}
		expect(still).toContain("animation: none");
	});

	/** the design canvas draws with the same tokens, so what it decides is what ships */
	it.runIf(canvas)("is mirrored by the design canvas", () => {
		for (const name of ["open", "paragraph", "rise"]) {
			const line = CSS.split("\n").find((one) => one.includes(`--animate-agent-${name}:`));
			expect(line).toBeDefined();
			expect(TOKENS).toContain(line ?? "");
		}
		expect(TOKENS).toContain(block("@keyframes agent-open"));
	});

	/**
	 * A delegate's step is replaced under the reader every few seconds (#194), so the two
	 * halves of the change are one gesture and have to last the same time: the words
	 * leaving go over exactly the span the words arriving come in on.
	 */
	it("crosses a delegate's words over the same 170ms they arrive in", () => {
		expect(CSS).toContain("--animate-agent-word: agent-word 170ms");
		expect(CSS).toContain("--animate-agent-leave: agent-leave 170ms");
		expect(block("@keyframes agent-word")).not.toMatch(/filter|blur|transform|translate|scale/);
		expect(block("@keyframes agent-leave")).not.toMatch(/filter|blur|transform|translate|scale/);
	});

	/**
	 * And stillness cannot mean `animation: none` for that half. What carries the words
	 * away is the animation itself, so words told not to animate would sit at full
	 * strength over the words that replaced them, with nothing left to take them down.
	 */
	it("takes the words leaving out of the drawing rather than freezing them over the new ones", () => {
		const at = CSS.indexOf("@media (prefers-reduced-motion: reduce)");
		const still = CSS.slice(at, CSS.indexOf("\n}", at));
		const leave = still.slice(still.indexOf(".animate-agent-leave"));

		expect(leave.slice(0, leave.indexOf("}"))).toContain("display: none");
	});
});

/**
 * The rail's floats and fades (#364): every popup rises or drops in and leaves the way it
 * came a little quicker, and the timers that unmount them are these same numbers.
 */
describe("the rail's floats", () => {
	const CSS = readFileSync(join(process.cwd(), "src/ui/ui.css"), "utf8");
	const TOKENS = canvas ? readFileSync(join(process.cwd(), "design/shared/tokens.css"), "utf8") : "";
	const NAMES = ["float-in", "float-out", "drop-in", "drop-out", "fade-in", "fade-out"];

	it("leaves on the timers the rail unmounts by", async () => {
		const { FADE_OUT_MS, FLOAT_OUT_MS } = await import("./canvas/agent-motion");
		expect(CSS).toContain(`--animate-agent-float-out: agent-float-out ${FLOAT_OUT_MS}ms`);
		expect(CSS).toContain(`--animate-agent-drop-out: agent-drop-out ${FLOAT_OUT_MS}ms`);
		expect(CSS).toContain(`--animate-agent-fade-out: agent-fade-out ${FADE_OUT_MS}ms`);
		expect(CSS).toContain("--shadow-agent-float:");
	});

	it("cuts every float in and out when stillness is asked for", () => {
		const at = CSS.indexOf("@media (prefers-reduced-motion: reduce)");
		const still = CSS.slice(at, CSS.indexOf("\n}", at));
		for (const name of NAMES) expect(still).toContain(`.animate-agent-${name}`);
	});

	it.runIf(canvas)("is mirrored by the design canvas", () => {
		for (const name of [...NAMES.map((one) => `--animate-agent-${one}:`), "--shadow-agent-float:"]) {
			const line = CSS.split("\n").find((one) => one.includes(name));
			expect(line).toBeDefined();
			expect(TOKENS).toContain(line ?? "");
		}
		for (const name of NAMES) {
			const at = CSS.indexOf(`@keyframes agent-${name} {`);
			expect(TOKENS).toContain(CSS.slice(at, CSS.indexOf("\n\t}", at)));
		}
	});
});

/**
 * A turn's frames (#365): a landing frame draws in from the top, the newest line of one
 * still streaming breathes, and the status line's words carry a light across them. All
 * three stand still when stillness is asked for, and the canvas draws with the same.
 */
describe("the turn's frames", () => {
	const CSS = readFileSync(join(process.cwd(), "src/ui/ui.css"), "utf8");
	const TOKENS = canvas ? readFileSync(join(process.cwd(), "design/shared/tokens.css"), "utf8") : "";
	const NAMES = ["draw-in", "newest", "shimmer"];

	it("draws a frame in from its top edge, moving nothing", () => {
		expect(CSS).toContain("--animate-agent-draw-in: agent-draw-in 720ms cubic-bezier(0.22, 0.61, 0.36, 1) both");
		const at = CSS.indexOf("@keyframes agent-draw-in {");
		const frames = CSS.slice(at, CSS.indexOf("\n\t}", at));
		expect(frames).toContain("clip-path: inset(0 0 100% 0)");
		expect(frames).not.toMatch(/transform|translate|scale|blur/);
	});

	it("stands every one of them still when stillness is asked for", () => {
		const at = CSS.indexOf("@media (prefers-reduced-motion: reduce)");
		const still = CSS.slice(at, CSS.indexOf("\n}", at));
		for (const name of NAMES) expect(still).toContain(`.animate-agent-${name}`);
	});

	it.runIf(canvas)("is mirrored by the design canvas", () => {
		for (const name of NAMES) {
			const line = CSS.split("\n").find((one) => one.includes(`--animate-agent-${name}:`));
			expect(line).toBeDefined();
			expect(TOKENS).toContain(line ?? "");
			const at = CSS.indexOf(`@keyframes agent-${name} {`);
			expect(TOKENS).toContain(CSS.slice(at, CSS.indexOf("\n\t}", at)));
		}
	});
});

/**
 * The agent on the canvas and its asks (#366): the companion arrives, travels and leaves, its
 * corners fly out and fold back, the waiting ring breathes and an ask turns out of its
 * anchor, on the numbers the companion's legend settled. The layer drives travel itself,
 * so the numbers it runs on are the same ones the stylesheet keyframes.
 */
describe("the agent on the canvas", () => {
	const CSS = readFileSync(join(process.cwd(), "src/ui/ui.css"), "utf8");
	const TOKENS = canvas ? readFileSync(join(process.cwd(), "design/shared/tokens.css"), "utf8") : "";
	const MOVING = ["arrive", "corners-out", "flash", "ring", "breathe", "ring-open"];
	const LEAVING = ["depart", "corners-in", "gather"];
	const SNAP = "cubic-bezier(0.32, 0.72, 0, 1)";
	const IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";

	it("moves on the legend's numbers and curves", async () => {
		const { EASE, MOTION } = await import("./canvas/agent-motion");
		expect(CSS).toContain(`--animate-agent-arrive: agent-arrive ${MOTION.arrive}ms ${SNAP} both`);
		expect(CSS).toContain(`--animate-agent-depart: agent-depart ${MOTION.leave}ms ${IN_OUT} forwards`);
		expect(CSS).toContain(`--animate-agent-corners-out: agent-corners-out ${MOTION.cornersOut}ms ${SNAP}`);
		expect(CSS).toContain(`--animate-agent-corners-in: agent-corners-in ${MOTION.cornersIn}ms ${IN_OUT}`);
		expect(CSS).toContain(`--animate-agent-flash: agent-flash ${MOTION.flashUp + MOTION.flashDown}ms`);
		expect(CSS).toContain(`--animate-agent-breathe: agent-breathe ${MOTION.breathe}ms ${IN_OUT} infinite alternate`);
		expect(CSS).toContain(`--animate-agent-ring-open: agent-ring-open ${MOTION.ringOpen}ms ${SNAP}`);
		expect(CSS).toContain(`--animate-agent-draw-in: agent-draw-in ${MOTION.drawIn}ms`);
		expect(MOTION).toMatchObject({ travel: 420, idleAfter: 2000, idle: 400, lineIn: 180, landed: 300 });
		expect(SNAP).toBe(`cubic-bezier(${EASE.snap.join(", ")})`);
		expect(IN_OUT).toBe(`cubic-bezier(${EASE.inOut.join(", ")})`);
		expect(EASE.out).toEqual([0.22, 0.61, 0.36, 1]);
	});

	it("arrives from 40% and leaves at 60%, where it stood", () => {
		const arrive = CSS.slice(CSS.indexOf("@keyframes agent-arrive {"));
		expect(arrive.slice(0, arrive.indexOf("\n\t}"))).toContain("scale(0.4)");
		const depart = CSS.slice(CSS.indexOf("@keyframes agent-depart {"));
		expect(depart.slice(0, depart.indexOf("\n\t}"))).toContain("scale(0.6)");
	});

	it("stands the moving ones still and takes the leaving ones out when stillness is asked for", () => {
		const at = CSS.indexOf("@media (prefers-reduced-motion: reduce)");
		const still = CSS.slice(at, CSS.indexOf("\n}", at));
		for (const name of MOVING) expect(still).toContain(`.animate-agent-${name}`);
		const gone = still.slice(still.indexOf(".animate-agent-depart"));
		for (const name of LEAVING) expect(gone.slice(0, gone.indexOf("}"))).toContain(`.animate-agent-${name}`);
		expect(gone.slice(0, gone.indexOf("}"))).toContain("display: none");
	});

	it.runIf(canvas)("is mirrored by the design canvas", () => {
		for (const name of [...MOVING, ...LEAVING]) {
			const line = CSS.split("\n").find((one) => one.includes(`--animate-agent-${name}:`));
			expect(line).toBeDefined();
			expect(TOKENS).toContain(line ?? "");
			const at = CSS.indexOf(`@keyframes agent-${name} {`);
			expect(TOKENS).toContain(CSS.slice(at, CSS.indexOf("\n\t}", at)));
		}
	});
});

describe("thread stylesheet", () => {
	/**
	 * The close lands on the first line's end, so on hover that corner of the ask fades out
	 * under it rather than the two overprinting. A mask image cannot transition, so the cut
	 * is always in the mask and parked past the right edge; hover slides it in. Plain CSS
	 * rather than a utility, because the value carries a slash the class parser reads as a
	 * modifier.
	 */
	it("fades the end of the first line out under the close, in the stylesheet", () => {
		const CSS = readFileSync(join(process.cwd(), "src/ui/ui.css"), "utf8");
		const at = CSS.indexOf(".agent-thread-ask {");
		expect(at).toBeGreaterThan(-1);
		const rule = CSS.slice(at, CSS.indexOf("\n}", at));
		expect(rule).toContain("mask-composite: exclude");
		expect(rule).toContain("calc(100% + 56px) 0 / 56px 16px");
		expect(rule).toContain("180ms cubic-bezier(0.22, 0.61, 0.36, 1)");
		expect(CSS).toContain(".agent-thread-row:hover .agent-thread-ask");
		// and the design canvas carries the same rule
		if (canvas) expect(readFileSync(join(process.cwd(), "design/shared/tokens.css"), "utf8")).toContain(rule);
	});
});
