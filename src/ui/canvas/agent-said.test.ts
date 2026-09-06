// @vitest-environment happy-dom

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

	it("releases later paragraphs when time passes between render and timer setup", () => {
		clock();
		const { host, redraw } = draw(paragraphs("", false));
		const current = performance.now.bind(performance);
		// Rendering and effect setup are separate clock reads. The timer API
		// truncates the resulting fractional delay to a whole millisecond.
		const now = vi
			.spyOn(performance, "now")
			.mockReturnValueOnce(current())
			.mockImplementation(() => current() + 0.25);
		onTestFinished(() => {
			now.mockRestore();
		});
		redraw(paragraphs("one\n\ntwo\n\nthree\n\nfour", false));
		const first = host.querySelector("[data-agent-paragraph]");
		expect(shown(host)).toEqual(["one"]);
		wait(UNIT_GAP_MS - 1);
		expect(shown(host)).toEqual(["one"]);
		wait(1);
		expect(shown(host)).toEqual(["one", "two"]);
		wait(UNIT_GAP_MS);
		expect(shown(host)).toEqual(["one", "two", "three"]);
		expect(host.querySelector("[data-agent-paragraph]")).toBe(first);
	});

	it("keeps waiting for a paragraph when its timer wakes before the deadline", () => {
		clock();
		const { host, redraw } = draw(paragraphs("", false));
		const schedule = globalThis.setTimeout.bind(globalThis);
		// Native timers may wake just before the performance clock reaches the
		// deadline. Deliver that first wake without another stream update.
		const timer = vi
			.spyOn(window, "setTimeout")
			.mockImplementationOnce((callback, delay, ...args) =>
				schedule(callback, Math.max(0, (delay ?? 0) - 1), ...args),
			);
		onTestFinished(() => {
			timer.mockRestore();
		});
		redraw(paragraphs("one\n\ntwo", true));
		const first = host.querySelector("[data-agent-paragraph]");
		expect(shown(host)).toEqual(["one"]);
		wait(UNIT_GAP_MS - 1);
		expect(shown(host)).toEqual(["one"]);
		wait(1);
		expect(shown(host)).toEqual(["one", "two"]);
		expect(host.querySelector("[data-agent-paragraph]")).toBe(first);
		expect(host.querySelector("[data-agent-caret]")).toBeNull();
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
