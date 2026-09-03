// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { longestStreamed, streamedMessages } from "../../test-helpers";
import { chunksOf } from "./agent-markdown";
import { Caret, Paragraphs, paragraphsOf, Said, UNIT_GAP_MS } from "./agent-said";

/**
 * What a rendered message leaves in the DOM (#163, #195), and how one arrives: a paragraph
 * at a time (#149).
 *
 * The claim being asserted about the DOM is that a word contributes no element at all, and
 * it is asserted the way the design frame measured it: against the DOM the markdown
 * structure itself needs, which is the same DOM raw text renders into. So the count below
 * is derived from the chunks rather than remembered, and it cannot move with the message's
 * word count — which is the whole of the decision.
 *
 * The stylesheet is read as a file at the bottom, because the durations and the shape of
 * the open live nowhere else: the animations are theme variables Tailwind resolves at
 * build time, so no mounted element can be asked what they are.
 */

const LONGEST = longestStreamed("claude-mcp").text;
const SHORTEST = streamedMessages("claude-mcp").reduce(
	(least, { text }) => (text.length < least.length ? text : least),
	LONGEST,
);

function draw(node: ReactNode): { host: HTMLElement; redraw: (next: ReactNode) => void } {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	act(() => root.render(node));
	return { host, redraw: (next) => act(() => root.render(next)) };
}

/**
 * Every element the markdown structure itself needs: the block stack, one wrapper per
 * markdown run, and an item's own marker and body.
 *
 * This is the reference the settled render is measured against, and it is a function of
 * the chunks alone — no term in it is a word. A per-word wrapper anywhere in a settled
 * message shows up here as a plain miscount.
 */
function structural(text: string): number {
	return chunksOf(text).reduce((total, chunk) => {
		if (chunk.kind === "fence") return total + 1;
		// one `<hr>` and nothing inside it
		if (chunk.kind === "rule") return total + 1;
		if (chunk.kind === "item") return total + 3 + chunk.spans.length;
		return total + 1 + chunk.spans.length;
	}, 1);
}

const elements = (host: HTMLElement) => host.querySelectorAll("*").length;

describe("a settled message", () => {
	it("gives a word no element at all, on the longest message and the shortest", () => {
		expect(LONGEST.length).toBe(3372);
		expect(SHORTEST.length).toBeLessThan(100);
		// the settle sheet's own reading of this message: 74 elements, where wrapping every
		// word was 633
		expect(structural(LONGEST)).toBe(74);

		for (const text of [LONGEST, SHORTEST]) {
			const { host } = draw(createElement(Said, { text }));

			expect(elements(host)).toBe(structural(text));
			expect(host.querySelector('[class*="animate-"]')).toBeNull();
		}
	});

	/** the same prose one word longer is the same DOM plus nothing */
	it("does not grow its DOM as the prose grows", () => {
		const one = draw(createElement(Said, { text: "the frame is live" }));
		const many = draw(createElement(Said, { text: `the frame is live ${"and still live ".repeat(40)}` }));

		expect(elements(many.host)).toBe(elements(one.host));
	});

	/** the one glyph in the block that is the renderer's rather than the agent's */
	it("draws a list marker as its own glyph, marked as not the agent's word", () => {
		const { host } = draw(createElement(Said, { text: "- one\n2. two" }));

		expect([...host.querySelectorAll("[data-marker]")].map((mark) => mark.textContent)).toEqual(["•", "2."]);
	});

	it("carries no caret, because nothing is coming", () => {
		const { host } = draw(createElement(Said, { text: LONGEST }));

		expect(host.querySelector("[data-agent-caret]")).toBeNull();
	});
});

describe("the caret", () => {
	it("is one static bar and nothing animates it", () => {
		const { host } = draw(createElement(Said, { text: "the frame is", caret: createElement(Caret) }));
		const carets = host.querySelectorAll("[data-agent-caret]");
		const caret = carets[0];

		expect(carets).toHaveLength(1);
		expect(caret?.className).not.toMatch(/animate-/);
		expect(caret?.getAttribute("aria-hidden")).toBe("true");
		// and it says nothing out loud, because it is not a word
		expect(caret?.textContent).toBe("");
	});

	/** handed in as a sibling it would read as an empty next paragraph */
	it("sits inside the last block rather than after it", () => {
		const prose = draw(createElement(Said, { text: "one\n\ntwo", caret: createElement(Caret) }));
		const fenced = draw(createElement(Said, { text: "look:\n```\nconst a = 1\n```", caret: createElement(Caret) }));

		expect(
			prose.host.querySelectorAll("p")[1]?.contains(prose.host.querySelector("[data-agent-caret]")) ?? false,
		).toBe(true);
		expect(fenced.host.querySelector("pre")?.contains(fenced.host.querySelector("[data-agent-caret]")) ?? false).toBe(
			true,
		);
	});
});

/* ---------- a paragraph at a time (#149) ---------- */

/** the paragraphs on screen, in order, as the text each one draws */
const shown = (host: HTMLElement) =>
	[...host.querySelectorAll("[data-agent-paragraph]")].map((paragraph) => paragraph.textContent);

describe("what a paragraph is", () => {
	it("splits on blank lines and drops an empty run", () => {
		expect(paragraphsOf("one\n\ntwo\n\n\nthree\n\n")).toEqual(["one", "two", "three"]);
	});

	/** a half fence renders as a swallowed message, so the blank lines inside one are its own */
	it("never splits a fence", () => {
		expect(paragraphsOf("look:\n\n```\nconst a = 1\n\nconst b = 2\n```\n\nafter")).toEqual([
			"look:",
			"```\nconst a = 1\n\nconst b = 2\n```",
			"after",
		]);
		// an open fence holds everything after it until it closes
		expect(paragraphsOf("```\na\n\nb")).toEqual(["```\na\n\nb"]);
	});
});

describe("the agent's words arriving", () => {
	const paragraphs = (text: string, finished: boolean, still = false) =>
		createElement(Paragraphs, { text, finished, still, caret: createElement(Caret) });

	afterEach(() => {
		vi.useRealTimers();
	});

	/**
	 * Timers and the clock both faked, because the release rule reads `performance.now()`
	 * and wakes itself on a timeout: a test that advanced one without the other would have
	 * the wake fire into a clock that says the paragraph is not yet due.
	 */
	const clock = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
	const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

	it("holds a paragraph until the text after it has begun, and then lets it out whole", () => {
		clock();
		const { host, redraw } = draw(paragraphs("", false));
		expect(shown(host)).toEqual([]);

		redraw(paragraphs("The header is", false));
		// nothing of a paragraph still being written reaches the screen
		expect(shown(host)).toEqual([]);

		redraw(paragraphs("The header is tighter now.\n\nThe", false));
		expect(shown(host).map((text) => text?.replace(/​/g, ""))).toEqual(["The header is tighter now."]);
	});

	it("shows every paragraph once the message has finished", () => {
		clock();
		const { host, redraw } = draw(paragraphs("", false));
		redraw(paragraphs("one\n\ntwo\n\nthree", false));
		redraw(paragraphs("one\n\ntwo\n\nthree", true));
		wait(UNIT_GAP_MS * 3);

		expect(shown(host)).toEqual(["one", "two", "three"]);
		expect(host.querySelector("[data-agent-caret]")).toBeNull();
		expect(host.querySelector("[data-agent-caret-line]")).toBeNull();
	});

	/** two paragraphs completing in one delta land as two arrivals, never one block */
	it("lets paragraphs out at least 700ms apart, so a burst becomes a cadence", () => {
		clock();
		const { host, redraw } = draw(paragraphs("", false));
		redraw(paragraphs("one\n\ntwo\n\nthree\n\nfo", false));

		expect(shown(host)).toEqual(["one"]);
		wait(UNIT_GAP_MS - 10);
		expect(shown(host)).toEqual(["one"]);
		wait(10);
		expect(shown(host)).toEqual(["one", "two"]);
		wait(UNIT_GAP_MS);
		expect(shown(host)).toEqual(["one", "two", "three"]);
	});

	it("keeps a fence whole while it arrives", () => {
		clock();
		const { host, redraw } = draw(paragraphs("", false));
		redraw(paragraphs("look:\n\n```\nconst a = 1\n\nconst b", false));
		// the fence is still open, so nothing after `look:` is a paragraph yet
		expect(shown(host)).toEqual(["look:"]);

		redraw(paragraphs("look:\n\n```\nconst a = 1\n\nconst b = 2\n```\n\nafter", false));
		wait(UNIT_GAP_MS);
		expect(host.querySelectorAll("pre")).toHaveLength(1);
		expect(host.querySelector("pre")?.textContent).toBe("const a = 1\n\nconst b = 2");
	});

	/** before there is a paragraph to stand at the end of, the caret has a line of its own */
	it("stands the caret alone on a 20px line until the first paragraph is whole, then inline", () => {
		clock();
		const { host, redraw } = draw(paragraphs("The header", false));
		const line = host.querySelector<HTMLElement>("[data-agent-caret-line]");
		expect(line).not.toBeNull();
		expect(line?.style.height).toBe("20px");
		expect(line?.querySelector("[data-agent-caret]")).not.toBeNull();

		redraw(paragraphs("The header is tighter now.\n\nAnd", false));
		expect(host.querySelector("[data-agent-caret-line]")).toBeNull();
		// inside the paragraph's own last block, so the message ending removes a glyph and
		// never a line
		expect(host.querySelector("[data-agent-paragraph] p")?.contains(host.querySelector("[data-agent-caret]"))).toBe(
			true,
		);
	});

	/** the first paragraph opens out of the caret's line rather than out of nothing */
	it("opens the first paragraph from the caret's 20px line and later ones from nothing", () => {
		clock();
		const { host, redraw } = draw(paragraphs("The header", false));
		redraw(paragraphs("one\n\ntwo\n\nth", false));
		wait(UNIT_GAP_MS);
		const [first, second] = [...host.querySelectorAll<HTMLElement>("[data-agent-paragraph]")];

		expect(first?.className).toContain("animate-agent-paragraph");
		expect(first?.firstElementChild?.className).toContain("min-h-5");
		expect(second?.className).toContain("animate-agent-paragraph");
		expect(second?.firstElementChild?.className).toContain("min-h-0");
		// and the words rise into the box rather than sitting in it from the first frame
		expect(first?.querySelector(".animate-agent-rise")).not.toBeNull();
	});

	/**
	 * A restored thread, a thread switched back to and a message that arrived whole are
	 * pictures rather than arrivals: what is already whole at mount is drawn settled.
	 */
	it("draws what was already whole at mount without arriving", () => {
		clock();
		const { host } = draw(paragraphs("one\n\ntwo\n\nthree", true));

		expect(shown(host)).toEqual(["one", "two", "three"]);
		expect(host.querySelector('[class*="animate-"]')).toBeNull();
	});

	it("draws everything landed, settled and without a caret, when stillness is asked for", () => {
		clock();
		const { host } = draw(paragraphs("one\n\ntwo\n\nthr", false, true));

		expect(host.textContent).toBe("onetwothr");
		expect(host.querySelector('[class*="animate-"]')).toBeNull();
		expect(host.querySelector("[data-agent-caret]")).toBeNull();
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
