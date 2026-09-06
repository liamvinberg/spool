import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("typography foundations", () => {
	it("keeps the canvas's type definitions identical to the app", () => {
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
	const TOKENS = readFileSync(join(process.cwd(), "design/shared/tokens.css"), "utf8");
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
	it("is mirrored by the design canvas", () => {
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
		expect(readFileSync(join(process.cwd(), "design/shared/tokens.css"), "utf8")).toContain(rule);
	});
});
