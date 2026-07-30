// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished } from "vitest";
import { longestStreamed, streamedMessages } from "../../test-helpers";
import { chunksOf } from "./agent-markdown";
import { Caret, Said } from "./agent-said";

/**
 * What a rendered message leaves in the DOM (#163, #195), and what the arriving edge
 * of one costs.
 *
 * The claim being asserted is that a settled word contributes no element at all, and
 * it is asserted the way the design frame measured it: against the DOM the markdown
 * structure itself needs, which is the same DOM raw text renders into. So the count
 * below is derived from the chunks rather than remembered, and it cannot move with the
 * message's word count — which is the whole of the decision.
 *
 * The stylesheet is read as a file at the bottom, because 170ms and *opacity only*
 * live nowhere else: the animation is a theme variable Tailwind resolves at build
 * time, so no mounted element can be asked what it is.
 */

const LONGEST = longestStreamed("claude-mcp").text;
const SHORTEST = streamedMessages("claude-mcp").reduce(
	(least, { text }) => (text.length < least.length ? text : least),
	LONGEST,
);

function draw(node: ReactNode): HTMLElement {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	act(() => root.render(node));
	return host;
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
const words = (host: HTMLElement) => host.querySelectorAll(".animate-agent-word");

describe("a settled message", () => {
	it("gives a word no element at all, on the longest message and the shortest", () => {
		expect(LONGEST.length).toBe(3372);
		expect(SHORTEST.length).toBeLessThan(100);
		// the settle sheet's own reading of this message: 74 elements, where wrapping every
		// word was 633
		expect(structural(LONGEST)).toBe(74);

		for (const text of [LONGEST, SHORTEST]) {
			const host = draw(createElement(Said, { text }));

			expect(elements(host)).toBe(structural(text));
			expect(words(host)).toHaveLength(0);
		}
	});

	/** the same prose one word longer is the same DOM plus nothing */
	it("does not grow its DOM as the prose grows", () => {
		const one = draw(createElement(Said, { text: "the frame is live" }));
		const many = draw(createElement(Said, { text: `the frame is live ${"and still live ".repeat(40)}` }));

		expect(elements(many)).toBe(elements(one));
	});

	/** the one glyph in the block that is the renderer's rather than the agent's */
	it("draws a list marker as its own glyph, marked as not the agent's word", () => {
		const host = draw(createElement(Said, { text: "- one\n2. two" }));

		expect([...host.querySelectorAll("[data-marker]")].map((mark) => mark.textContent)).toEqual(["\u2022", "2."]);
	});

	it("carries no caret, because nothing is coming", () => {
		const host = draw(createElement(Said, { text: LONGEST }));

		expect(host.querySelector("[data-agent-caret]")).toBeNull();
	});
});

describe("the arriving edge", () => {
	it("costs one plain span a word and nothing else", () => {
		const text = "the frame is authored and live on the canvas.";
		const host = draw(createElement(Said, { text, live: text.length }));
		const arriving = [...words(host)];

		expect(arriving).toHaveLength(text.split(/\s+/).filter(Boolean).length);
		expect(elements(host)).toBe(structural(text) + arriving.length);
		for (const word of arriving) {
			expect(word.tagName).toBe("SPAN");
			// one class and no inline style: a delay would paint the word at full strength
			// and then snap it to nothing to begin its own fade
			expect(word.className).toBe("animate-agent-word");
			expect(word.getAttribute("style")).toBeNull();
		}
	});

	/** the window is the only thing wrapped, on the message the decision was measured on */
	it("wraps only its window on a real long message", () => {
		const host = draw(createElement(Said, { text: LONGEST, live: 150 }));
		const arriving = [...words(host)];

		expect(arriving.length).toBeGreaterThan(0);
		expect(elements(host)).toBe(structural(LONGEST) + arriving.length);
	});

	it("never wraps whitespace, so no line begins with an indent it did not ask for", () => {
		const text = "one two three";
		const host = draw(createElement(Said, { text, live: text.length }));

		expect([...words(host)].map((word) => word.textContent)).toEqual(["one", "two", "three"]);
	});
});

describe("the caret", () => {
	it("is one static bar and nothing animates it", () => {
		const host = draw(createElement(Said, { text: "the frame is", live: 4, caret: createElement(Caret) }));
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
		const prose = draw(createElement(Said, { text: "one\n\ntwo", live: 3, caret: createElement(Caret) }));
		const fenced = draw(createElement(Said, { text: "look:\n```\nconst a = 1\n```", caret: createElement(Caret) }));

		expect(prose.querySelectorAll("p")[1]?.contains(prose.querySelector("[data-agent-caret]")) ?? false).toBe(true);
		expect(fenced.querySelector("pre")?.contains(fenced.querySelector("[data-agent-caret]")) ?? false).toBe(true);
	});
});

/**
 * The arrival's own numbers, read off the stylesheet that holds them.
 *
 * 170ms is where the sourced numbers land rather than where it looked right, and the
 * keyframes are opacity alone because Chromium disqualifies an animated pixel-moving
 * filter from compositing by name. Neither fact is reachable from a mounted element, so
 * this reads the file.
 */
describe("the stylesheet the arrival lives in", () => {
	const CSS = readFileSync(join(process.cwd(), "src/ui/ui.css"), "utf8");
	const block = (open: string): string => {
		const at = CSS.indexOf(open);
		if (at === -1) throw new Error(`no ${open}`);
		const end = CSS.indexOf("\n\t}", at);
		return CSS.slice(at, end === -1 ? undefined : end);
	};

	it("fades a word in at 170ms", () => {
		expect(CSS).toContain("--animate-agent-word: agent-word 170ms");
	});

	it("moves no pixels: the keyframes are opacity and nothing else", () => {
		const frames = block("@keyframes agent-word");

		expect(frames).toContain("opacity: 0");
		expect(frames).not.toMatch(/filter|blur|transform|translate|scale/);
	});

	it("blinks nothing, anywhere", () => {
		expect(CSS).not.toMatch(/blink/i);
	});

	/** reduced motion is a jump cut: the message is settled and nothing about it moves */
	it("stands the whole rail still when stillness is asked for", () => {
		const at = CSS.indexOf("@media (prefers-reduced-motion: reduce)");
		const still = CSS.slice(at, CSS.indexOf("\n}", at));

		expect(still).toContain(".animate-agent-word");
		expect(still).toContain(".animate-agent-entry");
		expect(still).toContain(".animate-agent-spin");
		expect(still).toContain("animation: none");
	});
});
