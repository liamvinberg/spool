// @vitest-environment happy-dom

import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { longestStreamed } from "../../test-helpers";
import type { AgentEvent } from "../api";
import { chunksOf, drawnText } from "./agent-markdown";
import { type FrameJump, followTo, sameEntry, turnLayout } from "./agent-rail";
import {
	answerTurn,
	called,
	cells,
	chips,
	clickHome,
	closed,
	effortPills,
	effortToggle,
	ended,
	field,
	frameEntry,
	freshBrowser,
	lifeOfCell,
	live,
	log,
	marks,
	modelRow,
	modelTrigger,
	mount,
	newThread,
	ONE,
	openCell,
	openModelMenu,
	paste,
	press,
	queuedRows,
	rail,
	rows,
	running,
	type Stream,
	say,
	send,
	settle,
	settled,
	shot,
	speaking,
	stack,
	stopPress,
	storedThread,
	TWO,
	type,
	until,
	waiting,
} from "./agent-rail-harness";
import type { AgentEntry } from "./agent-transcript";

/**
 * The agent rail as the canvas drives it (#192, #193, #194).
 *
 * One turn, end to end: the composer takes a sentence, the daemon's stream answers
 * it, and the transcript is what the projection said it would be. What is asserted
 * here is the wiring — that the human's words land before anything comes back, that
 * the request carries them, that prose arrives rather than appearing, that a tool
 * call reaches the screen as one line, that pressing a frame's name takes the canvas
 * there, and that the rail is the agent and nothing else.
 *
 * The rules behind the rows are `agent-transcript.test.ts`'s, the pace is
 * `agent-pace.test.ts`'s, and what a rendered word leaves in the DOM is
 * `agent-said.test.ts`'s.
 */

/**
 * A browser that has never been dragged, before every test.
 *
 * A rail's width outlives a reload on purpose, so the test that pushes one under the snap
 * point leaves 44px behind in storage and every rail mounted after it opens as a strip —
 * with no composer, no transcript and no column to look at. It is the only state here that
 * crosses a test boundary, and it crosses it silently: on a runtime whose own `localStorage`
 * global shadows happy-dom's, the writes go nowhere and the whole file passes.
 */
beforeEach(freshBrowser);
/** the paragraphs of the agent's words on screen, in order */
const paragraphs = (host: HTMLElement) =>
	[...host.querySelectorAll("[data-agent-paragraph]")].map((paragraph) => paragraph.textContent);
/** the live end marker, which stands while a message is still being written */
const caret = (host: HTMLElement) => host.querySelector("[data-agent-caret]");

const MESSAGE = "the frame is authored and live on the canvas, and the shot came back clean.";

/**
 * The same sentence twenty times over, one paragraph, and plain, so the text the log draws
 * is the text that went in. A paragraph reaches the screen once the text after it has
 * begun or the message has ended, so a message that is one paragraph and not over is one
 * that draws a caret and nothing else.
 */
const LONG = Array.from({ length: 20 }, () => MESSAGE).join(" ");

/**
 * The longest message the captures hold: 3,372 characters of bold lead-ins, inline code,
 * two fenced blocks and a blockquote. It is the thing every claim about a long message is
 * about, so it is what the rail is asked to draw.
 */
const DOCUMENT = longestStreamed("claude-mcp").text;

describe("the rail", () => {
	it("is the agent, and the tab row is gone with both of its tabs", async () => {
		const canvas = mount();
		await canvas.render();

		expect(rail(canvas.host)).not.toBeNull();
		expect(canvas.host.querySelector('[aria-label="Inspector"]')).toBeNull();
		expect(rail(canvas.host)?.textContent).not.toContain("elements");
		expect(rail(canvas.host)?.textContent).not.toContain("connections");
		// the composer is the whole of what an empty rail says, and the footer under it
		// says which machine is answering — the send hint's slot, because that outranks a
		// keyboard hint you learn once (#184)
		expect(field(canvas.host)?.placeholder).toBe("Say what to change");
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("Opus") === true);
		expect(rail(canvas.host)?.textContent).not.toContain("enter to send");
	});

	it("opens no narrower than the agent's 380 floor (#364)", async () => {
		const canvas = mount();
		await canvas.render();

		expect(stack(canvas.host)?.style.width).toBe("380px");
	});

	/** nothing may assume 420: the range is what every later strip is measured against */
	it("holds the drag between the 380 floor and the 560 ceiling, and snaps the side shut", async () => {
		const canvas = mount();
		await canvas.render();
		const grip = canvas.host.querySelector<HTMLElement>('[aria-label="Resize right side"]');
		if (grip === null) throw new Error("no grip");
		grip.setPointerCapture = () => {};
		grip.releasePointerCapture = () => {};

		const drag = async (to: number) => {
			await act(async () => {
				grip.dispatchEvent(
					new PointerEvent("pointerdown", { pointerId: 1, button: 0, clientX: 1000, bubbles: true }),
				);
			});
			await act(async () => {
				grip.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: to, bubbles: true }));
			});
			await act(async () => {
				grip.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true }));
			});
		};

		// pulled far past the ceiling
		await drag(200);
		expect(stack(canvas.host)?.style.width).toBe("560px");
		// pushed under the snap point: the side collapses rather than standing at an
		// unreadable width, and what is left is the rail it is opened from again
		await drag(1500);
		expect(canvas.host.querySelector('aside[data-side="right"]')?.hasAttribute("data-side-open")).toBe(false);
		expect(canvas.host.querySelector('[data-rail-icon="agent"]')?.getAttribute("aria-pressed")).toBe("false");
	});
});

describe("one turn", () => {
	it("sends what was typed and puts it in the log before anything comes back", async () => {
		const canvas = mount();
		await canvas.render();

		await send(canvas.host, "tidy the receipt");

		// the human's words are in the transcript with no event having landed
		expect(rail(canvas.host)?.textContent).toContain("tidy the receipt");
		expect(field(canvas.host)?.value).toBe("");
		await settle(50);
		expect(canvas.turn.prompts).toEqual(["tidy the receipt"]);
	});

	/**
	 * The box empties because something took the words, and never because Enter was
	 * pressed (#234).
	 *
	 * The threads of a project arrive over a door, and until they land there is no thread
	 * for a message to go into. The press was taken anyway and the field cleared itself
	 * over it, so a sentence typed into a rail that was still loading went nowhere and left
	 * nothing behind — no draft, no log line, and no way back to it.
	 */
	it("keeps a sentence typed before there was anywhere to put it", async () => {
		const canvas = mount();
		let land = () => {};
		canvas.stored.hold = new Promise<void>((resolve) => {
			land = resolve;
		});
		await canvas.render();

		await send(canvas.host, "tighten the header");

		expect(field(canvas.host)?.value).toBe("tighten the header");
		expect(canvas.turn.prompts).toEqual([]);

		// and the same words go the moment there is a conversation to say them into
		land();
		await settle();
		await send(canvas.host, "tighten the header");
		await settle(50);
		expect(canvas.turn.prompts).toEqual(["tighten the header"]);
		expect(field(canvas.host)?.value).toBe("");
	});

	/**
	 * The wait leaves a receipt and the thought that follows it still leaves nothing of
	 * its own (#212). They are not the same object: the thinking block's own span is
	 * `0.0s` for 34 of the 36 in the captures, and a line saying that is a line saying
	 * nothing.
	 *
	 * What the thought does instead is keep the one receipt open (#231). A message that
	 * begins by thinking begins at once, so a receipt settled at the top of it would say
	 * `0.0s` about a silence that had not started yet — and the log would then hold still
	 * for the whole of it with every mark in it at rest.
	 *
	 * The stroke on the composer's border is untouched and answers a different question.
	 * It says whether anything is happening, in the periphery, for free; this says what
	 * happened and how long, in the log, an hour later.
	 */
	it("draws one receipt for the request and no line for the thought", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");

		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push({ kind: "thinking", block: 0, tokens: 61, parent: null });
		await settle();

		expect(canvas.host.querySelectorAll("[data-agent-log] [data-agent-wait]")).toHaveLength(1);
		// the thinking is the wait, so the one receipt is still counting it and its mark turns
		expect(canvas.host.querySelector("[data-agent-log] [data-agent-wait]")?.getAttribute("data-agent-wait")).toBe(
			"running",
		);
		expect(canvas.host.querySelectorAll("[data-agent-log] [data-agent-wait] .animate-agent-spin")).toHaveLength(1);
	});

	/** and it settles the moment there is something to read, which is what it was counting to */
	it("settles the receipt when the words start rather than when the thinking does", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");

		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push({ kind: "thinking", block: 0, tokens: 61, parent: null });
		canvas.turn.push({ kind: "say", block: 1, text: "done.", parent: null });
		await settle();

		expect(canvas.host.querySelector("[data-agent-log] [data-agent-wait]")?.getAttribute("data-agent-wait")).toBe(
			"done",
		);
		expect(canvas.host.querySelectorAll("[data-agent-log] [data-agent-wait] .animate-agent-spin")).toHaveLength(0);
	});

	/** while nothing has come back the mark turns, which is the whole of what it is for */
	it("turns the receipt's mark while the request is still out", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");

		canvas.turn.push(waiting);
		await settle();

		expect(canvas.host.querySelector("[data-agent-log] [data-agent-wait]")?.getAttribute("data-agent-wait")).toBe(
			"running",
		);
		expect(canvas.host.querySelectorAll("[data-agent-log] [data-agent-wait] .animate-agent-spin")).toHaveLength(1);
		expect(log(canvas.host)).toContain("thinking");
	});

	/**
	 * The one rule that earns it the room: it is written once and never removed, so an
	 * answer landing moves nothing above it. That is the whole difference between this
	 * and the beat `b4aef45` deleted, which was the one entry this log ever took back out
	 * and dragged everything above it down 38.3px on the way.
	 */
	it("keeps the receipt once the answer has landed", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");

		canvas.turn.push(waiting);
		await settle();
		const before = canvas.host.querySelectorAll("[data-agent-log] [data-agent-wait]").length;

		canvas.turn.push(speaking);
		canvas.turn.push({ kind: "say", block: 0, text: "done.", parent: null });
		await settle();

		expect(before).toBe(1);
		expect(canvas.host.querySelectorAll("[data-agent-log] [data-agent-wait]")).toHaveLength(1);
		expect(log(canvas.host)).toContain("thinking");
	});

	/**
	 * The agent's words arrive a paragraph at a time (#149): nothing of a paragraph still
	 * being written reaches the screen, and it lands whole the moment the text after it has
	 * begun, opening into the log the way a row does.
	 */
	it("lets the agent's words arrive a paragraph at a time rather than appear whole", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");

		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push(say(MESSAGE));
		await settle(120);
		// one paragraph and not over: a caret alone on its own line, and none of the words
		expect(paragraphs(canvas.host)).toEqual([]);
		expect(rail(canvas.host)?.textContent).not.toContain(MESSAGE);
		expect(canvas.host.querySelectorAll("[data-agent-caret]")).toHaveLength(1);
		expect(canvas.host.querySelectorAll("[data-agent-seed]")).toHaveLength(1);
		expect(canvas.host.querySelector("[data-agent-caret-line]")).not.toBeNull();
		expect(caret(canvas.host)?.className).not.toMatch(/animate-/);

		// the break lands: the first paragraph is whole and opens, the caret rides its end
		canvas.turn.push(say("\n\nAnd the"));
		await settle(120);
		expect(paragraphs(canvas.host)).toEqual([MESSAGE]);
		expect(canvas.host.querySelector("[data-agent-paragraph]")?.className).toContain("animate-agent-paragraph");
		expect(canvas.host.querySelector("[data-agent-caret-line]")).toBeNull();
		expect(canvas.host.querySelector("[data-agent-paragraph] p")?.contains(caret(canvas.host))).toBe(true);

		canvas.turn.push(say(" receipt is next."));
		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await until(() => paragraphs(canvas.host).length === 2, 3000);
		expect(paragraphs(canvas.host)).toEqual([MESSAGE, "And the receipt is next."]);
		// and nothing says more is coming once the turn is over
		expect(caret(canvas.host)).toBeNull();
	});

	it.each(["done", "stopped", "failed", "closed"] as const)(
		"clears an unfinished paragraph's cursor after %s",
		async (ending) => {
			const canvas = mount();
			await canvas.render();
			await send(canvas.host, "go");
			canvas.turn.push(waiting);
			canvas.turn.push(speaking);
			canvas.turn.push(say("The header is tighter.\n\nThe receipt"));
			await settle(120);
			expect(caret(canvas.host)).not.toBeNull();
			expect(canvas.host.querySelector("[data-agent-seed]")).not.toBeNull();

			if (ending !== "closed") {
				canvas.turn.push({ kind: "ended", ending, reason: ending, stopReason: null, parent: null });
			}
			canvas.turn.push(closed);
			canvas.turn.close();
			await settle(1400);

			expect(log(canvas.host)).toContain("The header is tighter.");
			expect(log(canvas.host)).toContain("The receipt");
			expect(caret(canvas.host)).toBeNull();
			expect(canvas.host.querySelector("[data-agent-seed]")).toBeNull();
			expect(canvas.host.querySelector("[data-agent-caret-line]")).toBeNull();
		},
	);

	/**
	 * The loop closes without the human carrying anything across it: the frame lands on
	 * disk, the daemon's watcher says so, and the canvas repaints it — all while the
	 * message explaining it is still being written.
	 */
	it("repaints a frame the turn writes while the transcript is still arriving", async () => {
		// a viewport with a size, so the phone is drawn big enough to read and runs
		// its document: happy-dom lays nothing out
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
		vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(900);
		const canvas = mount();
		await canvas.render();
		const src = () => canvas.host.querySelector("iframe")?.getAttribute("src") ?? null;
		await until(() => src() !== null);
		const before = src();

		await send(canvas.host, "tidy the receipt");
		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push(say(MESSAGE));
		await settle(120);

		canvas.watcher.push("change", { kind: "frame", frame: "home" });
		await settle(120);

		expect(src()).not.toBe(before);
		expect(canvas.turn.open).toBe(true);
		// the message that explains it has not finished landing
		expect(caret(canvas.host)).not.toBeNull();
		expect(paragraphs(canvas.host)).toEqual([]);
	});

	/**
	 * Reduced motion drops the pacing, not the updates. The arrival is what someone
	 * asking for stillness is asking not to see; a rail that showed them their own
	 * sentence and nothing else until the process exited would be answering a different
	 * request.
	 */
	it("puts the words on screen whole and at once when stillness is asked for", async () => {
		const canvas = mount({ still: true });
		await canvas.render();
		await send(canvas.host, "go");

		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push(say(MESSAGE));
		await settle(300);

		expect(rail(canvas.host)?.textContent).toContain(MESSAGE);
		// and nothing about the settled message moves: no paragraph is opening and no caret
		// says more is coming
		expect(canvas.host.querySelector(".animate-agent-paragraph")).toBeNull();
		expect(caret(canvas.host)).toBeNull();
	});

	it("holds the press while a turn runs, and gives the composer back when it ends", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");
		canvas.turn.push(waiting);
		await settle();

		// a second send would spawn a second agent against the same repo, so the press is
		// taken and held rather than sent (#170). The footer says nothing about it either
		// way: #184 spent that slot on which machine is answering, and the dimmed row
		// inside the composer is what says the words were taken
		await send(canvas.host, "then this");
		await settle(50);
		expect(canvas.turn.prompts).toEqual(["go"]);
		expect(queuedRows(canvas.host)).toEqual(["then this"]);
		expect(rail(canvas.host)?.textContent).not.toContain("enter to");

		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle();
		expect(canvas.turn.prompts).toEqual(["go", "then this"]);
	});

	/** the log is receipts, and a clean ending is not one */
	it("says nothing about a turn that ended cleanly, and says why one that did not", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");
		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push(say("done."));
		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle(1400);

		expect(rail(canvas.host)?.textContent).toContain("done.");
		expect(rail(canvas.host)?.textContent).not.toContain("stopped");
		expect(rail(canvas.host)?.textContent).not.toContain("exited");
	});

	it("never swallows an agent that could not be spawned", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");

		canvas.turn.push({ kind: "closed", code: null, message: "spawn claude ENOENT", parent: null });
		canvas.turn.close();
		await settle();

		expect(rail(canvas.host)?.textContent).toContain("spawn claude ENOENT");
		// and the composer comes back: the turn is over, so the next thing said is a send
		expect(field(canvas.host)?.placeholder).toBe("Say what to change");
	});
});

/* ---------- a message that is a document ----------
 * The one-line rule settles this without argument: a message has no call to outlive. So
 * it is rendered whole and nothing is clamped, and the thing that makes it long is the
 * thing that makes it skimmable. The log follows the newest words until the reader
 * scrolls up to read earlier ones. */

/**
 * A turn's foot (#365): the frames the turn touched as a grid, and one status line that
 * opens into every step. The steps are behind the line rather than in the log.
 */
describe("a turn's foot", () => {
	it("draws the designers' frames, says how many are working, and ends with a receipt", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "two directions for hello");

		canvas.turn.push(waiting);
		canvas.turn.push({
			kind: "task-started",
			task: "t1",
			call: "a1",
			description: "Design hello-calm frame",
			agent: "designer",
			prompt: null,
			parent: null,
		});
		canvas.turn.push({
			kind: "spot",
			state: "held",
			name: "hello-calm",
			task: "t1",
			call: "a1",
			x: 0,
			y: 0,
			w: 1440,
			h: 900,
			parent: null,
		});
		await settle();
		const status = () => canvas.host.querySelector<HTMLButtonElement>("[data-agent-turn-line]");
		expect(canvas.host.querySelector('[data-agent-tile="hello-calm"]')?.getAttribute("data-agent-tile-state")).toBe(
			"reading",
		);
		expect(status()?.textContent).toContain("1 designer working");
		// the steps are behind the line until somebody opens it
		expect(canvas.host.querySelector("[data-agent-steps]")?.getAttribute("data-agent-steps")).toBe("shut");
		await act(async () => status()?.click());
		expect(canvas.host.querySelector("[data-agent-steps]")?.getAttribute("data-agent-steps")).toBe("open");

		canvas.turn.push({
			kind: "frame",
			change: "created",
			frame: "hello-calm",
			lines: 18,
			call: "b1",
			task: "t1",
			spot: "hello-calm",
			parent: "a1",
		});
		canvas.turn.push({ kind: "task-done", task: "t1", status: "completed", summary: null, parent: null });
		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await until(() => status()?.getAttribute("data-agent-turn-line") === "done");

		expect(status()?.textContent).toMatch(/^Done in \d+s/);
		expect(canvas.host.querySelector('[data-agent-tile="hello-calm"]')?.getAttribute("data-agent-tile-state")).toBe(
			"done",
		);
	});
});

describe("a long message", () => {
	it("renders as markdown, whole, and clamps nothing", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "check the copy");

		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		// the whole message at once, which is what a runtime that sends no partials does
		canvas.turn.push({ kind: "said", text: DOCUMENT, parent: null });
		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await until(() => canvas.host.querySelectorAll("[data-agent-log] pre").length === 2);

		// the last entry rather than the log's last child: the queue's place follows it (#364)
		// and above the turn's foot, which is the turn's last entry (#365)
		const said = [...canvas.host.querySelectorAll("[data-agent-log] > div > [data-agent-arrive]")]
			.filter((one) => one.querySelector("[data-agent-turn]") === null)
			.at(-1);
		if (!(said instanceof HTMLElement)) throw new Error("no message");
		const chunks = chunksOf(DOCUMENT);
		// every block of it is on screen: the whole message, nothing dropped
		for (const chunk of chunks) {
			// a rule is structure with no words in it, so there is nothing of it to find here
			if (chunk.kind === "rule") continue;
			const own = chunk.kind === "fence" ? chunk.text : drawnText([chunk]);
			expect(said.textContent).toContain(own);
		}
		// drawn rather than printed: the markers are gone and the structure is elements
		expect(said.textContent).not.toContain("**");
		expect(said.textContent).not.toContain("```");
		expect(said.querySelectorAll("strong").length).toBeGreaterThan(0);
		expect(said.querySelectorAll("code").length).toBeGreaterThan(0);
		// two fenced blocks and one paragraph per remaining block, blockquote included
		expect(said.querySelectorAll("pre")).toHaveLength(2);
		expect(said.querySelectorAll("p")).toHaveLength(chunks.filter((chunk) => chunk.kind !== "fence").length);
		// and nothing shortens it: no clamp, no height cut, and nothing to press to find out
		// whether the rest mattered
		expect(said.querySelector('[class*="line-clamp"]')).toBeNull();
		expect(said.querySelector('[class*="max-h-"]')).toBeNull();
		expect(said.querySelectorAll("button")).toHaveLength(0);
	});

	/**
	 * A paragraph that has landed stays where it is: a later delta re-renders the block and
	 * must not remount what is already on screen, or every paragraph would open again.
	 */
	it("keeps the paragraphs already on screen when the next lands", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "check the copy");
		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		const blocks = chunksOf(DOCUMENT).flatMap((chunk) =>
			chunk.kind === "p" ? [chunk.spans.map((span) => span.text).join("")] : [],
		);
		canvas.turn.push(say(`${blocks.slice(0, 2).join("\n\n")}\n\n`));
		await until(() => paragraphs(canvas.host).length === 1);
		const before = canvas.host.querySelector("[data-agent-paragraph]");

		canvas.turn.push(say(`${blocks[2] ?? ""}\n\n${blocks[3] ?? ""}`));
		await until(() => paragraphs(canvas.host).length === 3, 3000);

		// the same element, so nothing inside it remounted and no paragraph arrived twice
		expect(canvas.host.querySelector("[data-agent-paragraph]")).toBe(before);
	});

	/**
	 * The geometry is handed in because happy-dom lays nothing out, and the arithmetic it
	 * feeds is `followTo`'s own — asserted directly below this.
	 */
	it("follows every paragraph as a live message grows taller than the box", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "check the copy");
		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push(say(DOCUMENT));
		await settle(120);

		const log = canvas.host.querySelector<HTMLElement>("[data-agent-log]");
		const tail = log?.firstElementChild?.lastElementChild;
		if (log === null || !(tail instanceof HTMLElement)) throw new Error("no live entry");
		const geometry = (scrollHeight: number, top: number) => {
			Object.defineProperty(log, "scrollHeight", { value: scrollHeight, configurable: true });
			Object.defineProperty(log, "clientHeight", { value: 500, configurable: true });
			log.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
			tail.getBoundingClientRect = () => ({ top }) as DOMRect;
		};

		// Start with a message that fits, then let successive paragraphs open past the
		// viewport. No reader input occurs between the size notifications.
		for (const height of [520, 800, 1400, 1800]) {
			geometry(height, 100 - log.scrollTop);
			await canvas.grew();
			expect(log.scrollTop).toBe(height - 500);
			expect(canvas.host.querySelector("[data-agent-live]")).toBeNull();
		}
	});
});

describe("what the log scrolls to", () => {
	it("follows the end", () => {
		expect(followTo({ scrollHeight: 520, clientHeight: 500 })).toBe(20);
	});

	it("follows the end of a message taller than the box", () => {
		expect(followTo({ scrollHeight: 1400, clientHeight: 500 })).toBe(900);
	});

	it("never scrolls above the top of the log", () => {
		expect(followTo({ scrollHeight: 100, clientHeight: 500 })).toBe(0);
	});
});

/**
 * What an entry redraws for, which is what a nine-minute turn costs.
 *
 * Every entry in the log is handed the turn's clock and the clock steps ten times a
 * second for as long as the turn is open, so drawing them all on every step is the
 * transcript re-rendering itself a hundred times for the sake of the one word arriving at
 * the bottom. Two entries actually read the clock and both of them settle.
 */
describe("what an entry redraws for", () => {
	/** one object for every reading, because a fresh one is a real change and says so */
	const jump: FrameJump = { have: new Set(), gone: new Set(), onPoint: () => {}, onJump: () => {} };
	const onAnswer = () => {};
	const props = (entry: AgentEntry, elapsed: number) => ({ entry, elapsed, jump, onAnswer });
	const row: AgentEntry = {
		key: "call:c1",
		kind: "row",
		state: "done",
		verb: "read",
		subject: "receipt.tsx",
		frame: null,
		count: 1,
		detail: null,
		shot: null,
		foreign: null,
		parent: null,
		step: null,
		delegated: [],
	};
	const arriving: AgentEntry = {
		key: "say:1:0",
		kind: "prose",
		full: "the frame is live.",
		settled: false,
	};
	const out: AgentEntry = { key: "wait:1", kind: "wait", state: "running", at: 0, ms: null };

	it("sits out a clock it does not read", () => {
		expect(sameEntry(props(row, 400), props(row, 900))).toBe(true);
	});

	/** a message keeps its own time: its paragraphs release themselves, and the clock is not theirs */
	it("sits out the clock for a message still arriving", () => {
		expect(sameEntry(props(arriving, 40), props(arriving, 140))).toBe(true);
	});

	it("draws again when the wire moves a message", () => {
		expect(sameEntry(props(arriving, 40), props({ ...arriving, full: "the frame is live. And" }, 40))).toBe(false);
	});

	it("draws again while a request out still has a digit to turn over", () => {
		expect(sameEntry(props(out, 1400), props(out, 1900))).toBe(false);
	});

	it("sits out the clock once the request has a total on it", () => {
		const answered: AgentEntry = { ...out, state: "done", ms: 1_970 };

		expect(sameEntry(props(answered, 2000), props(answered, 9000))).toBe(true);
	});

	/** a fresh fold is a different entry, whatever it says: the log has moved under it */
	it("never sits out an entry it has not seen before", () => {
		expect(sameEntry(props(row, 400), props({ ...row }, 400))).toBe(false);
	});
});

/**
 * Reader input pauses following; arriving back at the end resumes it. Geometry is
 * supplied because happy-dom does not lay out the transcript.
 */
describe("when the reader takes the wheel", () => {
	async function pinned() {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "check the copy");
		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push(say(DOCUMENT));
		await settle(120);
		const log = canvas.host.querySelector<HTMLElement>("[data-agent-log]");
		const tail = log?.firstElementChild?.lastElementChild;
		if (log === null || !(tail instanceof HTMLElement)) throw new Error("no live entry");
		const geometry = (scrollHeight: number, top: number) => {
			Object.defineProperty(log, "scrollHeight", { value: scrollHeight, configurable: true });
			Object.defineProperty(log, "clientHeight", { value: 500, configurable: true });
			log.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
			tail.getBoundingClientRect = () => ({ top: top - log.scrollTop }) as DOMRect;
		};
		// 1,400px of content in a 500px box, held at the live end
		geometry(1400, 100);
		await canvas.grew();
		expect(log.scrollTop).toBe(900);
		return { canvas, log, geometry };
	}

	/** the reader's wheel, which acts before any scroll it causes lands */
	async function wheel(log: HTMLElement, deltaY: number) {
		await act(async () => {
			log.dispatchEvent(new WheelEvent("wheel", { deltaY, bubbles: true }));
		});
	}
	/** where the reader's scroll put the box, arriving the way a real one does */
	async function scrolled(log: HTMLElement, to: number) {
		await act(async () => {
			log.scrollTop = to;
			log.dispatchEvent(new Event("scroll"));
		});
	}
	const chip = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-agent-live]");

	it("a wheel ends following and the log stays where the reader put it", async () => {
		const { canvas, log } = await pinned();
		await wheel(log, -53);
		await scrolled(log, 40);
		canvas.turn.push(say(" and the rest of it"));
		await settle(250);
		expect(log.scrollTop).toBe(40);
	});

	it.each(["wheel", "touch", "key"])("%s toward newer text keeps following during growth", async (input) => {
		const { canvas, log, geometry } = await pinned();
		// Content has grown, but its resize notification has not arrived yet. Scrolling
		// toward the new bottom must not be mistaken for leaving to read earlier text.
		geometry(1600, 100);
		await act(async () => {
			if (input === "wheel") {
				log.dispatchEvent(new WheelEvent("wheel", { deltaY: 53, bubbles: true }));
			} else if (input === "key") {
				log.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
			} else {
				log.dispatchEvent(
					new TouchEvent("touchstart", {
						touches: [new Touch({ identifier: 0, target: log, clientY: 100 })],
						bubbles: true,
					}),
				);
				log.dispatchEvent(
					new TouchEvent("touchmove", {
						touches: [new Touch({ identifier: 0, target: log, clientY: 50 })],
						bubbles: true,
					}),
				);
			}
		});
		await scrolled(log, 950);
		await canvas.grew();
		expect(log.scrollTop).toBe(1100);
		expect(chip(canvas.host)).toBeNull();
	});

	it.each(["touch", "key"])("%s toward earlier text pauses following through growth", async (input) => {
		const { canvas, log, geometry } = await pinned();
		await act(async () => {
			if (input === "key") {
				log.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }));
			} else {
				log.dispatchEvent(
					new TouchEvent("touchstart", {
						touches: [new Touch({ identifier: 0, target: log, clientY: 50 })],
						bubbles: true,
					}),
				);
				log.dispatchEvent(
					new TouchEvent("touchmove", {
						touches: [new Touch({ identifier: 0, target: log, clientY: 100 })],
						bubbles: true,
					}),
				);
			}
		});
		await scrolled(log, 620);
		geometry(1600, 100);
		await canvas.grew();
		expect(log.scrollTop).toBe(620);
		expect(chip(canvas.host)).not.toBeNull();
	});

	it("reaching the end of a tall message resumes following new paragraphs", async () => {
		const { canvas, log, geometry } = await pinned();
		await wheel(log, -53);
		await scrolled(log, 620);
		await scrolled(log, 900);
		geometry(1600, 100);
		await canvas.grew();
		expect(log.scrollTop).toBe(1100);
		expect(chip(canvas.host)).toBeNull();
	});

	it("the end re-arms follow for a short message", async () => {
		const { canvas, log, geometry } = await pinned();
		// the same entry, now short of the box: its top 400px into a 700px scroll, so
		// the follow point is the plain end at 200
		geometry(700, 400);
		await canvas.grew();
		expect(log.scrollTop).toBe(200);
		await wheel(log, -53);
		await scrolled(log, 80);
		await scrolled(log, 200);
		// the log grows 60px; a follower is carried to the new end
		geometry(760, 400);
		canvas.turn.push(say(" and the rest of it"));
		await until(() => log.scrollTop === 260);
	});

	it("a chip names the live end, and a press returns and holds", async () => {
		const { canvas, log } = await pinned();
		expect(chip(canvas.host)).toBeNull();
		await wheel(log, -53);
		await scrolled(log, 40);
		await until(() => chip(canvas.host) !== null);
		expect(chip(canvas.host)?.textContent).toContain("live");
		await act(async () => {
			chip(canvas.host)?.click();
		});
		expect(log.scrollTop).toBe(900);
		await until(() => chip(canvas.host) === null);
		canvas.turn.push(say(" and the rest of it"));
		await settle(150);
		expect(log.scrollTop).toBe(900);
	});

	it("the end of a tall entry draws no chip, because nothing is below it", async () => {
		const { canvas, log } = await pinned();
		await wheel(log, -53);
		await scrolled(log, 400);
		await until(() => chip(canvas.host) !== null);
		await scrolled(log, 900);
		await until(() => chip(canvas.host) === null);
	});

	it("a press from inside a tall entry carries the reader to the end, never back up", async () => {
		const { canvas, log, geometry } = await pinned();
		await wheel(log, -53);
		await scrolled(log, 400);
		await until(() => chip(canvas.host) !== null);
		await act(async () => {
			chip(canvas.host)?.click();
		});
		expect(log.scrollTop).toBe(900);
		await until(() => chip(canvas.host) === null);
		// Following resumed, so another paragraph carries them to the new end.
		geometry(1600, 100);
		await canvas.grew();
		expect(log.scrollTop).toBe(1100);
	});

	it("the chip says latest once the turn has settled", async () => {
		const { canvas, log } = await pinned();
		// the daemon's own word for the end of a turn, which is the only thing that ends one
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle(120);
		await wheel(log, -53);
		await scrolled(log, 40);
		await until(() => chip(canvas.host)?.textContent?.includes("latest") === true);
	});

	it("the reader speaking carries the log back to the live edge", async () => {
		const { canvas, log } = await pinned();
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle(120);
		await wheel(log, -53);
		await scrolled(log, 40);
		await until(() => chip(canvas.host) !== null);
		await send(canvas.host, "and once more");
		await until(() => chip(canvas.host) === null && log.scrollTop !== 40);
	});

	/* ---------- growth under a still scrollbar (#149) ----------
	 * Rows open, paragraphs open, pictures land: the log grows under a reader who touched
	 * nothing, and following has to survive every one of them. The box moves only up, only
	 * by the log's own hand, and never leaves live. */

	/** at the plain end of a log that fits its last entry: 700px of log in a 500px box */
	async function atEnd() {
		const { canvas, log, geometry } = await pinned();
		geometry(700, 400);
		await canvas.grew();
		expect(log.scrollTop).toBe(200);
		return { canvas, log, geometry };
	}

	it("keeps following while a paragraph opens and a picture lands, and never moves the log down", async () => {
		const { canvas, log, geometry } = await atEnd();
		// a six-line paragraph opens under the reader: 60px more log, no scroll of theirs
		geometry(760, 400);
		await canvas.grew();
		expect(log.scrollTop).toBe(260);
		// and a tall picture lands under a look
		geometry(860, 400);
		await canvas.grew();
		expect(log.scrollTop).toBe(360);
		expect(chip(canvas.host)).toBeNull();
		// still following: the next write carries the reader to the new end
		geometry(880, 400);
		canvas.turn.push(say(" and the rest of it"));
		await until(() => log.scrollTop === 380);
		expect(chip(canvas.host)).toBeNull();
	});

	/**
	 * The one from the field: a picture landing in the log dropped the reader out of live.
	 *
	 * Between the content growing and the size watcher pinning it, a browser can move the
	 * box itself — Chrome's scroll anchoring re-aims a scroller whose content changed under
	 * it — and the scroll event that lands is neither the log's own write nor where following
	 * sits, which read as the reader taking the wheel. The box says `overflow-anchor: none`
	 * so Chrome never does that here, and a scroll that arrives while the content has grown
	 * past what the log last aimed at is the log's to re-aim rather than the reader's.
	 */
	it("a picture landing never drops the reader out of live, even if the browser re-aims the box first", async () => {
		const { canvas, log, geometry } = await atEnd();
		expect(log.className).toContain("[overflow-anchor:none]");

		// the picture lands: the log is 160px taller and the browser moves the box on its own
		// before the watcher has said anything
		geometry(860, 400);
		await scrolled(log, 260);
		await settle(150);
		expect(chip(canvas.host)).toBeNull();

		await canvas.grew();
		expect(log.scrollTop).toBe(360);
		// and following is intact: the next write carries the reader to the new end
		geometry(880, 400);
		canvas.turn.push(say(" and the rest of it"));
		await until(() => log.scrollTop === 380);
		expect(chip(canvas.host)).toBeNull();
	});

	/**
	 * The box moves with nothing grown: a focus pulled into view, a row folding shut
	 * to the height it had, a scroll the browser owes to nothing the log can see. The old
	 * rule read any move that was neither the log's own nor the follow point as the reader
	 * taking the wheel, and dropped them out of live. A move with no gesture behind it is
	 * never the reader's: the log re-aims and stays live.
	 */
	it("a scroll with no gesture behind it never ends following: the log re-aims", async () => {
		const { canvas, log, geometry } = await atEnd();
		await scrolled(log, 120);
		expect(log.scrollTop).toBe(200);
		await settle(150);
		expect(chip(canvas.host)).toBeNull();
		geometry(760, 400);
		canvas.turn.push(say(" and the rest of it"));
		await until(() => log.scrollTop === 260);
		expect(chip(canvas.host)).toBeNull();
	});

	/** the one scroll without a wheel, finger or key that is still the reader's: a scrollbar under a held pointer */
	it("a scrollbar drag ends following, and letting go hands the box back to the browser's moves", async () => {
		const { canvas, log } = await atEnd();
		await act(async () => {
			log.dispatchEvent(new Event("pointerdown", { bubbles: true }));
		});
		await scrolled(log, 120);
		expect(log.scrollTop).toBe(120);
		await until(() => chip(canvas.host) !== null);
		await act(async () => {
			window.dispatchEvent(new Event("pointerup"));
		});
		canvas.turn.push(say(" and the rest of it"));
		await settle(150);
		expect(log.scrollTop).toBe(120);
	});

	/**
	 * A row opening is 260ms of growth, so the watcher pins every frame and every pin causes
	 * a scroll event of its own a frame later. Each has to be read as the log's write, or the
	 * first frame of every arrival would read as the reader leaving.
	 */
	it("recognises its own writes frame after frame while a row opens", async () => {
		const { canvas, log, geometry } = await atEnd();
		for (let frame = 1; frame <= 12; frame += 1) {
			// the track grows, the watcher pins, and the browser reports the pin's own scroll
			geometry(700 + frame * 3, 400);
			await canvas.grew();
			expect(log.scrollTop).toBe(200 + frame * 3);
			await scrolled(log, log.scrollTop);
		}
		expect(chip(canvas.host)).toBeNull();
		geometry(800, 400);
		canvas.turn.push(say(" and the rest of it"));
		await until(() => log.scrollTop === 300);
		expect(chip(canvas.host)).toBeNull();
	});
});

/* ---------- the log ----------
 * The projection's rules are `agent-transcript.test.ts`'s. What is asserted here is
 * that a row reaches the screen as one line, and that the payload the projection kept
 * separate stays off it until somebody asks. */

const ready: AgentEvent = {
	kind: "ready",
	session: "s",
	model: "claude-opus-5",
	cwd: "/project",
	version: "2.1.220",
	permissionMode: "default",
	apiKeySource: "none",
	capabilities: [],
	parent: null,
};
const edit = (id: string, frame = "home"): AgentEvent =>
	called(id, "Edit", { file_path: `/project/design/frames/${frame}/frame.tsx` });
/** where the delegate that is running says it has got to, or nothing if none is saying */
const step = (host: HTMLElement) => host.querySelector("[data-agent-step]")?.textContent ?? null;

describe("a tool row", () => {
	it("is one line, with its path behind a disclosure nobody has to open", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tidy the numbers");

		canvas.turn.push(ready);
		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push(edit("t1"));
		canvas.turn.push(settled("t1"));
		canvas.turn.push(ended);
		canvas.turn.close();
		await settle();

		expect(rows(canvas.host)).toEqual(["edit home"]);
		// the payload is one click down and closed, so the path is nowhere on screen
		expect(rail(canvas.host)?.textContent).not.toContain("design/frames/home/frame.tsx");
		const disclosure = canvas.host.querySelector<HTMLElement>('[aria-label="edit home"]');
		expect(disclosure?.getAttribute("aria-expanded")).toBe("false");

		await act(async () => {
			disclosure?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(canvas.host.querySelector("[data-agent-detail]")?.textContent).toBe("design/frames/home/frame.tsx");
	});

	/** reads one after another are one row, every path behind its one disclosure (#365, story 48) */
	it("groups reads and searches into one row, a path or command to a line behind it", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "look around");

		canvas.turn.push(ready);
		for (const [id, tool, input] of [
			["r1", "Read", { file_path: "/project/design/frames/home/frame.tsx" }],
			["r2", "Read", { file_path: "/project/design/shared/tokens.css" }],
			["g1", "Grep", { pattern: "accent" }],
		] as const) {
			canvas.turn.push({ kind: "called", id, tool, input, parent: null });
			canvas.turn.push(settled(id));
		}
		canvas.turn.push(ended);
		canvas.turn.close();
		await settle();

		expect(rows(canvas.host)).toEqual(["search 3 times"]);
		expect(rail(canvas.host)?.textContent).not.toContain("tokens.css");
		const disclosure = canvas.host.querySelector<HTMLElement>('[aria-label="search 3 times"]');
		await act(async () => {
			disclosure?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(
			[...(canvas.host.querySelector("[data-agent-detail]")?.children ?? [])].map((line) => line.textContent),
		).toEqual(["design/frames/home/frame.tsx", "design/shared/tokens.css", "accent"]);
	});

	/** six edits to one frame are one row, and the count climbs while it happens */
	it("counts a run of writes rather than repeating it", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tidy the numbers");

		canvas.turn.push(ready);
		canvas.turn.push(edit("t1"));
		canvas.turn.push(settled("t1"));
		await settle(120);
		expect(rows(canvas.host)).toEqual(["edit home"]);

		canvas.turn.push(edit("t2"));
		canvas.turn.push(settled("t2"));
		canvas.turn.push(edit("t3"));
		canvas.turn.push(settled("t3"));
		await settle(120);

		expect(rows(canvas.host)).toEqual(["edit home ×3"]);
	});

	/** a stop is neither done nor failed, so the mark is neither a check nor a cross */
	it("draws a stopped call as one flat stroke and a failed one as two crossing", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");
		const strokes = () =>
			[...canvas.host.querySelectorAll("[data-agent-row] path")]
				.filter((path) => (path as SVGPathElement).style.opacity === "1")
				.map((path) => path.getAttribute("d"));

		canvas.turn.push(ready);
		canvas.turn.push({
			kind: "called",
			id: "t1",
			tool: "Read",
			input: { file_path: "/project/design/CLAUDE.md" },
			parent: null,
		});
		canvas.turn.push({
			kind: "result",
			id: "t1",
			failed: true,
			nonExecution: "user-rejected",
			text: "The user doesn't want to proceed with this tool use.",
			images: [],
			parent: null,
		});
		await settle(120);
		// one flat stroke, drawn short of the mark's full width
		expect(strokes()).toEqual(["M4.4 7h5.2"]);

		// a command, so it is a row of its own rather than a second read in the first one's group
		canvas.turn.push({
			kind: "called",
			id: "t2",
			tool: "Bash",
			input: { command: "npm install", description: "Install the dependencies" },
			parent: null,
		});
		canvas.turn.push({ kind: "result", id: "t2", failed: true, text: "not found", images: [], parent: null });
		await settle(120);

		expect(strokes()).toEqual(["M4.4 7h5.2", "M4.2 4.2l5.6 5.6", "M9.8 4.2l-5.6 5.6"]);
	});
});

/* ---------- what a row opens and where it goes (#194) ----------
 * The plan earns a place off the line because it outlives the call that wrote it; a
 * screenshot does not, so it is the payload of its own row. The name is the place and
 * the rest of the row is still the call. */

const strip = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-agent-plan]");
const task = (subject: string, activeForm: string, id: string): AgentEvent =>
	called(id, "TaskCreate", { subject, description: "…", activeForm });
const move = (id: string, which: string, status: string): AgentEvent =>
	called(id, "TaskUpdate", { taskId: which, status });

describe("the plan", () => {
	it("leaves the transcript for a strip carrying a count and the agent's own wording", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "build the streak app");

		canvas.turn.push(ready);
		await settle(60);
		// most turns never write one, and the rail costs nothing for those
		expect(strip(canvas.host)).toBeNull();

		canvas.turn.push(task("Author the home frame", "Authoring the home frame", "p1"));
		canvas.turn.push(task("Verify each frame with spool shot", "Verifying frames with spool shot", "p2"));
		canvas.turn.push(move("p3", "1", "in_progress"));
		await settle(120);

		expect(strip(canvas.host)?.textContent).toContain("plan");
		expect(strip(canvas.host)?.textContent).toContain("0/2");
		// the agent's own present participle, never a friendlier one spool wrote
		expect(strip(canvas.host)?.textContent).toContain("Authoring the home frame");
		expect(strip(canvas.host)?.textContent).not.toContain("Author the home frame");
		// out of the log and out of the box that scrolls, which is the whole point of it
		expect(strip(canvas.host)?.closest(".pages-scrollbar")).toBeNull();
		// and the log keeps the one line that says the list was written
		expect(rows(canvas.host)).toEqual(["plan 2 tasks"]);
	});

	/** the strip is where a changing thing can live; a log is where it gets lost */
	it("goes on changing while the log grows past the line that wrote it", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "build the streak app");

		canvas.turn.push(ready);
		canvas.turn.push(task("Author the home frame", "Authoring the home frame", "p1"));
		canvas.turn.push(task("Verify each frame with spool shot", "Verifying frames with spool shot", "p2"));
		canvas.turn.push(move("p3", "1", "in_progress"));
		await settle(120);
		expect(strip(canvas.host)?.textContent).toContain("0/2");

		// eight rows of work land between the plan and its next move, which is what
		// carries it off the top of a transcript
		for (let index = 0; index < 8; index += 1) {
			canvas.turn.push(called(`r${index}`, "Edit", { file_path: `/project/design/frames/home-${index}/frame.tsx` }));
			canvas.turn.push(settled(`r${index}`));
		}
		canvas.turn.push(move("p4", "1", "completed"));
		canvas.turn.push(move("p5", "2", "in_progress"));
		await settle(160);

		expect(rows(canvas.host).length).toBeGreaterThan(8);
		expect(strip(canvas.host)?.textContent).toContain("1/2");
		expect(strip(canvas.host)?.textContent).toContain("Verifying frames with spool shot");
	});

	/** seven tasks permanently open is a hundred and fifty pixels answering nothing */
	it("opens into the list it is a count of, and starts shut", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "build the streak app");

		canvas.turn.push(ready);
		canvas.turn.push(task("Author the home frame", "Authoring the home frame", "p1"));
		canvas.turn.push(task("Verify each frame with spool shot", "Verifying frames with spool shot", "p2"));
		await settle(120);

		const open = canvas.host.querySelector<HTMLElement>('[aria-label="plan"]');
		expect(open?.getAttribute("aria-expanded")).toBe("false");
		expect(strip(canvas.host)?.textContent).not.toContain("Verify each frame with spool shot");

		await act(async () => {
			open?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(strip(canvas.host)?.textContent).toContain("Author the home frame");
		expect(strip(canvas.host)?.textContent).toContain("Verify each frame with spool shot");
	});
});

describe("a screenshot", () => {
	const look = called("s1", "Read", { file_path: "/project/design/.spool/verify/home.png" });
	/** what a real one is: about 150 KB of base64, which is why it must never reach a line */
	const DATA = "iVBORw0KGgo".repeat(14_000);
	const picture = (host: HTMLElement) => host.querySelector<HTMLImageElement>("[data-agent-row] img");

	it("opens itself as a 120px thumbnail behind the disclosure, and never reaches a line", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "check the home frame");

		canvas.turn.push(ready);
		canvas.turn.push(look);
		await settle(120);
		expect(rows(canvas.host)).toEqual(["look home"]);
		expect(picture(canvas.host)).toBeNull();

		canvas.turn.push(settled("s1", { images: [{ media: "image/png", data: DATA }] }));
		await settle(120);

		// the one payload worth showing unasked, since the picture is what the agent saw
		const line = canvas.host.querySelector<HTMLElement>('[aria-label="look home"]');
		expect(line?.getAttribute("aria-expanded")).toBe("true");
		expect(picture(canvas.host)?.getAttribute("width")).toBe("120");
		expect(picture(canvas.host)?.getAttribute("src")).toBe(`data:image/png;base64,${DATA}`);
		// the line stays the receipt: the picture hangs under it and not on it
		expect(line?.querySelector("img")).toBeNull();
		expect(line?.textContent).not.toContain("iVBORw0KGgo");
		expect(rail(canvas.host)?.textContent).not.toContain("iVBORw0KGgo");
		// `image/png` is a fact about a file; which frame is the thing worth keeping
		expect(rail(canvas.host)?.textContent).not.toContain("image/png");
		expect(rows(canvas.host)).toEqual(["look home"]);
	});

	/** the row above the thumbnail already said which frame, so the thumbnail does not */
	it("says which frame only where the line above it does not", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "check the home frame");

		canvas.turn.push(ready);
		canvas.turn.push(look);
		canvas.turn.push(settled("s1", { images: [{ media: "image/png", data: DATA }] }));
		await settle(120);

		expect(rows(canvas.host)).toEqual(["look home"]);
		expect(canvas.host.querySelector('[data-agent-row="look home"]')?.textContent).toBe("lookhome");
	});

	/** 120px says a frame changed; this is where you see what changed */
	it("goes to life size on a press and comes back on esc", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "check the home frame");

		canvas.turn.push(ready);
		canvas.turn.push(look);
		canvas.turn.push(settled("s1", { images: [{ media: "image/png", data: DATA }] }));
		await settle(120);

		await act(async () => {
			picture(canvas.host)?.parentElement?.parentElement?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		const held = canvas.host.querySelector<HTMLElement>("[data-agent-lightbox]");
		expect(held?.querySelector("img")?.getAttribute("width")).toBe("390");
		// held big, the row is behind the picture, so the caption is the only thing saying
		// what this is
		expect(held?.textContent).toContain("home");
		expect(held?.textContent).toContain("esc");

		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
		});
		expect(canvas.host.querySelector("[data-agent-lightbox]")).toBeNull();
	});

	/**
	 * The picture takes the keyboard the way every other modal here does, through the
	 * register's exclusive `dialog` scope — so while it is up, a canvas shortcut does not
	 * fire underneath it.
	 */
	it("holds the canvas's own keys while it is up", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "check the home frame");

		canvas.turn.push(ready);
		canvas.turn.push(look);
		canvas.turn.push(settled("s1", { images: [{ media: "image/png", data: DATA }] }));
		await settle(120);
		const tool = () => canvas.host.querySelector('[aria-label="hand"]')?.getAttribute("aria-pressed");
		expect(tool()).toBe("false");

		await act(async () => {
			picture(canvas.host)?.parentElement?.parentElement?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true, cancelable: true }));
		});

		expect(tool()).toBe("false");
		expect(canvas.host.querySelector("[data-agent-lightbox]")).not.toBeNull();
	});
});

/**
 * A row opens (#149): from no height to its own over 260ms, the row rising into it, so
 * the log above glides up because the thing pushing it is growing rather than appearing.
 * The gap before an entry rides inside the clipped cell, and every disclosure that grows a
 * row opens the same way. Nothing here is laid out, so what is asserted is the shape the
 * animation needs: a grid cell that clips, with the padding inside it.
 */
describe("a row opening", () => {
	/** every entry that opens, the turn's foot aside: its steps open inside it (#365) */
	const arrivals = (host: HTMLElement) =>
		[...host.querySelectorAll<HTMLElement>("[data-agent-log] [data-agent-arrive]")].filter(
			(one) => one.querySelector("[data-agent-turn]") === null,
		);
	/** the cell that clips, and the padded content inside it */
	const cellOf = (arrive: HTMLElement) => arrive.firstElementChild as HTMLElement;
	const innerOf = (arrive: HTMLElement) => cellOf(arrive).firstElementChild as HTMLElement;

	it("opens every entry from no height, with its gap inside the clipped cell", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tidy the receipt");
		canvas.turn.push(ready);
		canvas.turn.push(edit("c1"));
		canvas.turn.push(settled("c1"));
		canvas.turn.push(called("c2", "Read", { file_path: "/project/design/frames/home/frame.tsx" }));
		await settle(120);

		const [words, first, second] = arrivals(canvas.host);
		expect(arrivals(canvas.host)).toHaveLength(3);
		for (const arrive of arrivals(canvas.host)) {
			expect(arrive.className).toContain("animate-agent-open");
			expect(arrive.className).toContain("grid");
			expect(cellOf(arrive).className).toContain("overflow-hidden");
			expect(cellOf(arrive).className).toContain("min-h-0");
			// the rise is the row's, inside the box that is opening
			expect(innerOf(arrive).className).toContain("animate-agent-entry");
		}
		// the gap opens with the row rather than landing ahead of it: it is the padding of
		// the content inside the clip, never a margin on the cell
		expect(innerOf(words as HTMLElement).style.paddingTop).toBe("0px");
		// the first step is the first thing behind the status line, so nothing stands above it
		expect(innerOf(first as HTMLElement).style.paddingTop).toBe("0px");
		expect(innerOf(second as HTMLElement).style.paddingTop).toBe("6px");
		for (const arrive of arrivals(canvas.host)) {
			expect(arrive.style.marginTop).toBe("");
			expect(arrive.style.paddingTop).toBe("");
		}
	});

	/** a picture landing under `look` is the same growth as a row landing */
	it("opens the picture that lands under a look the same way", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "check the home frame");
		canvas.turn.push(ready);
		canvas.turn.push(called("s1", "Read", { file_path: "/project/design/.spool/verify/home.png" }));
		await settle(120);
		expect(canvas.host.querySelector('[data-agent-row="look home"] [data-agent-arrive]')).toBeNull();

		canvas.turn.push(settled("s1", { images: [{ media: "image/png", data: "iVBORw0KGgo" }] }));
		await settle(120);

		const opened = canvas.host.querySelector<HTMLElement>('[data-agent-row="look home"] [data-agent-arrive]');
		expect(opened?.className).toContain("animate-agent-open");
		expect(opened?.querySelector("img")).not.toBeNull();
	});

	it("opens the plan's list the same way", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "build the streak app");
		canvas.turn.push(ready);
		canvas.turn.push(task("Author the home frame", "Authoring the home frame", "p1"));
		await settle(120);

		await press(canvas.host.querySelector('[aria-label="plan"]'));

		const opened = canvas.host.querySelector<HTMLElement>("[data-agent-plan] [data-agent-arrive]");
		expect(opened?.className).toContain("animate-agent-open");
		expect(opened?.textContent).toContain("Author the home frame");
	});
});

describe("a row that names a frame", () => {
	const name = (host: HTMLElement, frame: string) => host.querySelector<HTMLElement>(`[data-agent-jump="${frame}"]`);
	const press = async (element: HTMLElement | null) => {
		await act(async () => {
			element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
	};
	const hover = async (element: HTMLElement | null, over: boolean) => {
		await act(async () => {
			element?.dispatchEvent(new MouseEvent(over ? "mouseover" : "mouseout", { bubbles: true }));
		});
	};

	/** landing on a frame is going to where it is, never deciding how close you wanted to be */
	it("navigates, centres, selects and keeps the zoom", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tidy the receipt");
		const zoom = canvas.chrome.latest?.camera.get()?.k;

		canvas.turn.push(ready);
		canvas.turn.push(edit("t1", "site/receipt"));
		canvas.turn.push(settled("t1"));
		await settle(120);
		expect(rows(canvas.host)).toEqual(["edit site/receipt"]);

		await press(name(canvas.host, "site/receipt"));
		await settle(60);

		// the page follows, and the frame it names is the one that is mounted
		expect(canvas.host.querySelector('[data-frame-label="site/receipt"]')).not.toBeNull();
		expect(canvas.host.querySelector('[data-frame-label="home"]')).toBeNull();
		expect(canvas.host.querySelector('button[aria-label="receipt frame"]')?.getAttribute("aria-pressed")).toBe(
			"true",
		);
		// and the zoom is the reader's, so following a row is not a navigation to undo
		expect(canvas.chrome.latest?.camera.get()?.k).toBe(zoom);
		// the press on the name is not the press on the disclosure
		expect(canvas.host.querySelector('[aria-label="edit site/receipt"]')?.getAttribute("aria-expanded")).toBe(
			"false",
		);
	});

	/**
	 * A row can only light a frame that is on screen, and a thread is not bound to a
	 * page, so for most rows there is no box out there to ring. Pointing gets answered
	 * wherever the answer can be drawn.
	 */
	it("pairs with the frame's page when the frame is not on screen", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tidy the receipt");

		canvas.turn.push(ready);
		canvas.turn.push(edit("t1", "site/receipt"));
		canvas.turn.push(settled("t1"));
		await settle(120);

		await hover(name(canvas.host, "site/receipt"), true);
		expect(canvas.host.querySelector("[data-page-lit]")?.textContent).toContain("site");
		expect(canvas.host.querySelector('[data-frame-hover="site/receipt"]')).toBeNull();

		await hover(name(canvas.host, "site/receipt"), false);
		expect(canvas.host.querySelector("[data-page-lit]")).toBeNull();
	});

	/**
	 * A file in a frame's own subfolder names that subfolder from the path alone, and
	 * only the project knows which prefix of it is the frame (#336).
	 */
	it("goes to the frame holding a file in its own subfolder", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tidy the receipt rows");

		canvas.turn.push(ready);
		canvas.turn.push(called("t1", "Edit", { file_path: "/project/design/frames/site/receipt/parts/row.tsx" }));
		canvas.turn.push(settled("t1"));
		await settle(120);

		expect(name(canvas.host, "site/receipt")).not.toBeNull();
	});

	/** the frame is drawn, so pointing rings it out there rather than lighting its page */
	it("rings the frame itself when it is on screen", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tidy the home frame");

		canvas.turn.push(ready);
		canvas.turn.push(edit("t1"));
		canvas.turn.push(settled("t1"));
		await settle(120);

		await hover(name(canvas.host, "home"), true);
		expect(canvas.host.querySelector('[data-frame-hover="home"]')).not.toBeNull();
		expect(canvas.host.querySelector("[data-page-lit]")).toBeNull();
	});

	/**
	 * Pointing is per frame and this rail names one frame over and over, so a mark keyed
	 * on the frame would light every row naming it. It is keyed on the cursor's own row.
	 */
	it("marks the name on the row under the cursor and never every row naming that frame", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tidy the home frame");
		const marked = () =>
			[...canvas.host.querySelectorAll("[data-agent-jump]")].filter((word) =>
				word.firstElementChild?.className.includes("underline"),
			).length;

		canvas.turn.push(ready);
		canvas.turn.push(edit("t1"));
		canvas.turn.push(settled("t1"));
		canvas.turn.push(called("t2", "Read", { file_path: "/project/design/frames/home/frame.tsx" }));
		canvas.turn.push(settled("t2"));
		await settle(120);
		expect(rows(canvas.host)).toEqual(["edit home", "read home"]);
		expect(marked()).toBe(0);

		await hover(name(canvas.host, "home"), true);
		expect(marked()).toBe(1);
	});

	/** linking the count would say the count is part of the place */
	it("keeps a run's count outside the target", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tidy the home frame");

		canvas.turn.push(ready);
		for (const id of ["t1", "t2", "t3"]) {
			canvas.turn.push(edit(id));
			canvas.turn.push(settled(id));
		}
		await settle(120);

		expect(rows(canvas.host)).toEqual(["edit home ×3"]);
		// the name is the whole of the target, and the count is beside it on the line
		expect(name(canvas.host, "home")?.textContent).toBe("home");
		expect(canvas.host.querySelector('[aria-label="edit home ×3"]')?.textContent).toContain("×3");
	});

	/**
	 * Not-yet and never-again are both simply absent from in here and they read as
	 * opposites, so which one it is comes from the canvas rather than being inferred.
	 */
	it("reads struck and does nothing once the frame is gone", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tidy the receipt");

		canvas.turn.push(ready);
		canvas.turn.push(edit("t1", "site/receipt"));
		canvas.turn.push(settled("t1"));
		await settle(120);
		expect(name(canvas.host, "site/receipt")).not.toBeNull();

		// the frame leaves the folder, and the daemon's watcher says so
		canvas.project.frames = canvas.project.frames.filter((frame) => frame.name !== "site/receipt");
		canvas.watcher.push("change", { kind: "frame", frame: "site/receipt" });
		await until(() => canvas.host.querySelector('[data-agent-jump="site/receipt"]') === null);

		expect(rows(canvas.host)).toEqual(["edit site/receipt"]);
		const word = [...(canvas.host.querySelectorAll('[aria-label="edit site/receipt"] span') ?? [])].find(
			(span) => span.textContent === "site/receipt",
		);
		expect(word?.className).toContain("line-through");
		// and a frame this turn has not written yet is not struck: it is one beat from here
		canvas.turn.push(called("t2", "Write", { file_path: "/project/design/frames/menu/frame.tsx" }));
		await settle(120);
		const coming = [...canvas.host.querySelectorAll('[data-agent-row="write menu"] span')].find(
			(span) => span.textContent === "menu",
		);
		expect(coming?.className).not.toContain("line-through");
		expect(name(canvas.host, "menu")).toBeNull();
	});
});

describe("a sub-agent", () => {
	it("is one row and the step it is on, never the calls it made", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "three takes on the receipt");

		canvas.turn.push(ready);
		canvas.turn.push(called("d1", "Agent", { description: "Design receipt--empty" }));
		canvas.turn.push({
			kind: "task-started",
			task: "a1",
			call: "d1",
			description: null,
			agent: "designer",
			prompt: null,
			parent: null,
		});
		canvas.turn.push({
			kind: "called",
			id: "w1",
			tool: "Write",
			input: { file_path: "/project/design/frames/site/receipt/frame.tsx" },
			parent: "d1",
		});
		canvas.turn.push(settled("w1", { parent: "d1" }));
		await settle(120);

		// one line however much the delegate does, which is what makes a fan-out three
		// lines rather than a page of interleaved writes — and it does not open, because
		// there is nothing of somebody else's homework in there to open
		expect(rows(canvas.host)).toEqual(["delegate Design receipt--empty"]);
		expect(canvas.host.querySelector('[aria-label="delegate Design receipt--empty"]')).toBeNull();
		expect(rail(canvas.host)?.textContent).not.toContain("receipt--empty/frame.tsx");

		// what it says about itself is where it is, one line down and asked of nobody
		canvas.turn.push({
			kind: "task-step",
			task: "a1",
			call: "d1",
			description: "Reading design/frames/site/receipt/frame.tsx",
			lastTool: "Read",
			parent: null,
		});
		await settle(120);
		expect(step(canvas.host)).toBe("Reading design/frames/site/receipt/frame.tsx");

		// and it goes when the task lands: the frames it wrote are out on the canvas
		canvas.turn.push({ kind: "task-done", task: "a1", status: "completed", summary: null, parent: null });
		await settle(120);
		expect(step(canvas.host)).toBeNull();
		expect(rows(canvas.host)).toEqual(["delegate Design receipt--empty"]);
	});

	/**
	 * A step is replaced every few seconds and the line it is on is at the edge of where
	 * somebody is reading, so the change is a crossfade rather than a cut: the words being
	 * replaced stay on screen, under the ones replacing them, for as long as it takes them
	 * to go. Only one set of them is true, which is what the hook is on.
	 */
	it("holds the words it is replacing on screen while the new ones arrive", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "a take on the receipt");
		const walking = (description: string): AgentEvent => ({
			kind: "task-step",
			task: "a1",
			call: "d1",
			description,
			lastTool: "Read",
			parent: null,
		});

		canvas.turn.push(ready);
		canvas.turn.push(called("d1", "Agent", { description: "Design receipt--empty" }));
		canvas.turn.push({
			kind: "task-started",
			task: "a1",
			call: "d1",
			description: null,
			agent: "designer",
			prompt: null,
			parent: null,
		});
		canvas.turn.push(walking("Reading the flows topic"));
		await settle(120);
		canvas.turn.push(walking("Writing receipt--empty"));
		await settle(120);

		expect(step(canvas.host)).toBe("Writing receipt--empty");
		expect(log(canvas.host)).toContain("Reading the flows topic");
	});

	/**
	 * A fan-out is uneven and its order is not the one you would write down: whoever
	 * finishes first arrives first, so the third take can land before the second. The
	 * canvas is where that is visible, because a frame appears the moment its file does.
	 */
	it("lands each delegate's frame on the canvas as it finishes", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "three takes on the cart");
		const on = (frame: string) => canvas.host.querySelector(`[data-frame-label="${frame}"]`) !== null;

		canvas.turn.push(ready);
		for (const take of ["d1", "d2", "d3"]) canvas.turn.push(called(take, "Agent", { description: `Design ${take}` }));
		await settle(120);
		expect(rows(canvas.host)).toEqual(["delegate Design d1", "delegate Design d2", "delegate Design d3"]);

		/** one delegate's frame reaching disk, which the daemon's watcher says out loud */
		const lands = async (frame: string) => {
			canvas.project.frames = [...canvas.project.frames, { name: frame }];
			canvas.watcher.push("change", { kind: "frame", frame });
			await until(() => on(frame));
		};

		await lands("cart--empty");
		expect([on("cart--empty"), on("cart--empty-c"), on("cart--empty-b")]).toEqual([true, false, false]);
		// the third designer finishes before the second, and nothing waits for the second
		await lands("cart--empty-c");
		expect([on("cart--empty"), on("cart--empty-c"), on("cart--empty-b")]).toEqual([true, true, false]);
		await lands("cart--empty-b");
		expect([on("cart--empty"), on("cart--empty-c"), on("cart--empty-b")]).toEqual([true, true, true]);
	});
});

/**
 * The turn waiting on the person, in the rail (#121, #145, #162).
 *
 * The wire half is `agent-answer.test.ts`'s and the projection half is
 * `agent-transcript.test.ts`'s. What is asserted here is the surface: that the
 * options and their whole descriptions are in the log, that pressing one sends the
 * answer, that the composer stays live beside them and prose typed there answers,
 * and that the dismiss is one wordless word.
 */
describe("a question in the log", () => {
	const QUESTION = "`spool shot` is blocked by the CLI and daemon split. How do you want the version gap closed?";
	const OPTIONS = [
		{
			label: "Run `spool upgrade`",
			description:
				"I run it, which installs the latest release and restarts the daemon on it, then re-run `spool shot receipt` and report the render. Side effect: the daemon restarts under any canvas you currently have open.",
		},
		{
			label: "Ship it unverified",
			description:
				"Leave the frame as authored. It is live on the canvas either way, but nobody has seen it render, so overflow or a font miss would go unnoticed.",
		},
	];

	/** the ask the way the wire sends it: the call, then the request that parks the turn */
	function ask(canvas: ReturnType<typeof mount>, over: Partial<Extract<AgentEvent, { kind: "asking" }>> = {}) {
		canvas.turn.push({
			kind: "called",
			id: "q1",
			tool: "AskUserQuestion",
			input: { questions: [{ question: QUESTION, header: "Shot fix", options: OPTIONS }] },
			parent: null,
		});
		canvas.turn.push({
			kind: "asking",
			request: "req-q",
			call: "q1",
			tool: "AskUserQuestion",
			display: "AskUserQuestion",
			input: { questions: [{ question: QUESTION, header: "Shot fix", options: OPTIONS }] },
			description: null,
			interaction: true,
			suggestions: [],
			parent: null,
			...over,
		});
	}

	const options = (host: HTMLElement) =>
		[...host.querySelectorAll("[data-agent-option]")].map((option) => option.getAttribute("data-agent-option"));

	it("draws the options and their whole descriptions, and sends the one that is pressed", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot the receipt");

		ask(canvas);
		await until(() => options(canvas.host).length === 2);

		const block = canvas.host.querySelector<HTMLElement>("[data-agent-ask]");
		expect(block?.textContent).toContain(QUESTION);
		// 150 to 250 characters of what each choice costs, whole and side by side: the
		// descriptions are the reason the options are a block rather than chips
		for (const option of OPTIONS) expect(block?.textContent).toContain(option.description);

		const pressed = canvas.host.querySelector<HTMLButtonElement>('[data-agent-option="Ship it unverified"]');
		await act(async () => pressed?.click());

		expect(canvas.turn.answers.at(-1)).toEqual({
			request: "req-q",
			reply: { kind: "picked", picks: { [QUESTION]: "Ship it unverified" } },
		});
	});

	it("asks a two-question call one at a time and sends both answers together", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot the receipt");

		const SECOND = "What should it be named?";
		const NAMES = [
			{ label: "receipt", description: "The name it already has on the canvas." },
			{ label: "receipt-fixed", description: "A second frame beside it, so both renders stay comparable." },
		];
		const questions = [
			{ question: QUESTION, header: "Shot fix", options: OPTIONS },
			{ question: SECOND, header: "Name", options: NAMES },
		];
		canvas.turn.push({ kind: "called", id: "q1", tool: "AskUserQuestion", input: { questions }, parent: null });
		canvas.turn.push({
			kind: "asking",
			request: "req-q",
			call: "q1",
			tool: "AskUserQuestion",
			display: "AskUserQuestion",
			input: { questions },
			description: null,
			interaction: true,
			suggestions: [],
			parent: null,
		});
		await until(() => options(canvas.host).length === 2);

		// the second question's options are not on screen: one decision at a time, the
		// way the binary's own prompt asks them
		expect(options(canvas.host)).toEqual(OPTIONS.map((option) => option.label));
		expect(canvas.host.querySelector("[data-agent-ask]")?.textContent).not.toContain(SECOND);

		const first = canvas.host.querySelector<HTMLButtonElement>('[data-agent-option="Ship it unverified"]');
		await act(async () => first?.click());

		// answering one of two is not an answer, so nothing went up the wire and the
		// second question is what the block is asking now
		expect(canvas.turn.answers).toEqual([]);
		await until(() => options(canvas.host).length === 2);
		expect(options(canvas.host)).toEqual(NAMES.map((option) => option.label));
		const block = canvas.host.querySelector<HTMLElement>("[data-agent-ask]");
		// the settled one keeps its sentence and its answer
		expect(block?.textContent).toContain(QUESTION);
		expect(block?.textContent).toContain("Ship it unverified");
		expect(block?.textContent).toContain(SECOND);

		const second = canvas.host.querySelector<HTMLButtonElement>('[data-agent-option="receipt-fixed"]');
		await act(async () => second?.click());

		expect(canvas.turn.answers.at(-1)).toEqual({
			request: "req-q",
			reply: { kind: "picked", picks: { [QUESTION]: "Ship it unverified", [SECOND]: "receipt-fixed" } },
		});
	});

	it("keeps the composer live beside it, and prose sent there answers", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot the receipt");

		ask(canvas);
		await until(() => options(canvas.host).length === 2);

		// the field is the path the tool prefers: it tests a typed sentence before the
		// picked ones and tells the agent to follow what the person actually said
		expect(field(canvas.host)?.placeholder).toBe("Or type your own answer");
		await send(canvas.host, "neither, leave my install alone");

		expect(canvas.turn.answers.at(-1)).toEqual({
			request: "req-q",
			reply: { kind: "said", text: "neither, leave my install alone" },
		});
		// answering answered rather than starting a second turn
		expect(canvas.turn.prompts).toEqual(["shoot the receipt"]);
	});

	it("takes a wordless dismiss and sends a bare deny", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot the receipt");

		ask(canvas);
		await until(() => options(canvas.host).length === 2);

		const dismiss = canvas.host.querySelector<HTMLButtonElement>("[data-agent-dismiss]");
		// one word, and nothing else in it: it means one thing
		expect(dismiss?.textContent).toBe("Dismiss");
		await act(async () => dismiss?.click());

		expect(canvas.turn.answers.at(-1)).toEqual({ request: "req-q", reply: { kind: "deny" } });
	});

	/**
	 * A question parks the turn: the message it interrupted stays held where the wire left
	 * it, and nothing spool runs ever submits an answer on anybody's behalf.
	 */
	it("holds the words where they stopped and never answers for anybody", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot the receipt");
		canvas.turn.push({ kind: "waiting", parent: null });
		canvas.turn.push(speaking);
		canvas.turn.push(say(LONG));
		await until(() => caret(canvas.host) !== null);
		ask(canvas);
		await until(() => options(canvas.host).length === 2);
		await settle(700);

		// one paragraph and not over, so it is a caret and none of the words, however long
		// somebody takes to decide
		expect(paragraphs(canvas.host)).toEqual([]);
		expect(caret(canvas.host)).not.toBeNull();
		expect(canvas.turn.answers).toEqual([]);
		expect(canvas.host.querySelector("[data-agent-ask]")?.getAttribute("data-agent-ask")).toBe("open");
	});

	it("collapses to the person's own words once they have answered", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot the receipt");

		ask(canvas);
		await until(() => options(canvas.host).length === 2);
		canvas.turn.push({
			kind: "answered",
			request: "req-q",
			answer: "picked",
			words: "Ship it unverified",
			parent: null,
		});
		await until(() => options(canvas.host).length === 0);

		// the answer is a sentence the person chose, so it lands in the shape the rail
		// already gives the person's words, and the option list is gone
		expect(canvas.host.querySelector("[data-agent-ask]")?.textContent).toContain("Ship it unverified");
		expect(canvas.host.querySelector("[data-agent-dismiss]")).toBeNull();
		// and the composer is a composer again, asking for what follows the turn that is
		// still running rather than for an answer (#364)
		expect(field(canvas.host)?.placeholder).toBe("Say what comes next");
	});
});

/**
 * An ask opens out of what it concerns (#366): an approval and a question about no frame
 * out of the turn's line, a question whose options name the turn's frames out of its grid,
 * a designer's ask out of its own tile, and every one folds to one quiet line once answered.
 */
describe("an ask, anchored", () => {
	const asking = (over: Partial<Extract<AgentEvent, { kind: "asking" }>>): AgentEvent => ({
		kind: "asking",
		request: "req-1",
		call: "c1",
		tool: "Edit",
		display: "Edit",
		input: { file_path: "/p/src/theme.ts" },
		description: "Moving the new roast colours into the app's theme so the real app matches.",
		interaction: false,
		suggestions: [
			{ type: "addRules", rules: [{ toolName: "Edit" }], behavior: "allow", destination: "localSettings" },
		],
		parent: null,
		...over,
	});
	const ready: AgentEvent = {
		kind: "ready",
		session: "s",
		model: null,
		cwd: "/p",
		version: null,
		permissionMode: null,
		apiKeySource: null,
		capabilities: [],
		parent: null,
	};
	const landed = (frame: string, task: string | null = null, parent: string | null = null): AgentEvent => ({
		kind: "frame",
		change: "created",
		frame,
		lines: 40,
		call: null,
		task,
		parent,
	});
	const options = (host: HTMLElement) =>
		[...host.querySelectorAll("[data-agent-option]")].map((option) => option.getAttribute("data-agent-option"));
	const look = (host: HTMLElement) => host.querySelector("[data-agent-ask]")?.getAttribute("data-agent-ask-look");

	it("opens an approval out of the turn's line, its reason first and what it lets through behind a disclosure", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "carry the colours into the app");
		canvas.turn.push(ready);
		canvas.turn.push({
			kind: "called",
			id: "c1",
			tool: "Edit",
			input: { file_path: "/p/src/theme.ts" },
			parent: null,
		});
		canvas.turn.push(asking({}));
		await until(() => options(canvas.host).length > 0);

		expect(look(canvas.host)).toBe("line");
		const status = canvas.host.querySelector('[data-agent-turn-line="waiting"]');
		expect(status?.textContent).toContain("Waiting on you");
		const block = canvas.host.querySelector<HTMLElement>("[data-agent-ask]");
		expect(block?.textContent).toContain("Moving the new roast colours");
		// the path is there, one press down, and not in the reader's way
		const disclosure = canvas.host.querySelector<HTMLButtonElement>("[data-agent-ask-detail]");
		expect(disclosure?.textContent).toContain("Edit a file outside design/");
		expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
		await act(async () => disclosure?.click());
		expect(disclosure?.getAttribute("aria-expanded")).toBe("true");
		expect(block?.textContent).toContain("src/theme.ts");
		// three answers of one weight, and Enter answers none of them
		expect(options(canvas.host)).toEqual(["Allow", "Allow for this chat", "Deny"]);

		const allow = canvas.host.querySelector<HTMLButtonElement>('[data-agent-option="Allow"]');
		await act(async () => allow?.click());
		expect(canvas.turn.answers.at(-1)).toEqual({ request: "req-1", reply: { kind: "allow" } });
		canvas.turn.push({ kind: "answered", request: "req-1", answer: "allow", words: null, parent: null });
		await until(() => look(canvas.host) === "folded");

		// folded to one quiet line, and the line is the turn's own again
		expect(canvas.host.querySelector("[data-agent-folded]")?.textContent).toBe("Allowed: edit src/theme.ts");
		expect(canvas.host.querySelector('[data-agent-turn-line="waiting"]')).toBeNull();
	});

	it("folds a deny and an always the same quiet way", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "carry the colours into the app");
		canvas.turn.push(ready);
		canvas.turn.push(asking({ tool: "Bash", input: { command: "npm install @fontsource/fraunces" } }));
		await until(() => options(canvas.host).length > 0);
		canvas.turn.push({ kind: "answered", request: "req-1", answer: "always", words: null, parent: null });
		await until(() => look(canvas.host) === "folded");
		expect(canvas.host.querySelector("[data-agent-folded]")?.textContent).toBe(
			"Allowed for this chat: run npm install @fontsource/fraunces",
		);
	});

	it("turns the grid into the choice when the options name the turn's frames", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "make five directions");
		canvas.turn.push(ready);
		for (const frame of ["home", "home--calm", "home--dense", "home--timeline"]) canvas.turn.push(landed(frame));
		const question = {
			question: "Which direction should I take further?",
			header: "Direction",
			multiSelect: false,
			options: [
				{ label: "Calm", description: "No boxes, Fraunces headings, hairline rules." },
				{ label: "Dense", description: "Three aligned tables with every lot." },
				{ label: "Timeline", description: "The day as two roaster lanes." },
			],
		};
		canvas.turn.push({
			kind: "called",
			id: "q1",
			tool: "AskUserQuestion",
			input: { questions: [question] },
			parent: null,
		});
		canvas.turn.push(
			asking({
				request: "req-q",
				call: "q1",
				tool: "AskUserQuestion",
				display: "AskUserQuestion",
				input: { questions: [question] },
				description: null,
				interaction: true,
				suggestions: [],
			}),
		);
		await until(() => options(canvas.host).length === 3);

		expect(look(canvas.host)).toBe("grid");
		// every named picture carries its option, and the frame no option names steps back
		const picture = canvas.host.querySelector('[data-agent-option="Timeline"]');
		expect(picture?.getAttribute("data-agent-tile")).toBe("home--timeline");
		expect(picture?.textContent).toContain("3");
		expect(picture?.textContent).toContain("The day as two roaster lanes.");
		expect(canvas.host.querySelector('[data-agent-tile="home"]')?.hasAttribute("data-agent-tile-aside")).toBe(true);
		expect(canvas.host.querySelector('[data-agent-turn-line="waiting"]')?.textContent).toContain(
			"Which direction should I take further?",
		);

		await act(async () => (picture as HTMLButtonElement | null)?.click());
		expect(canvas.turn.answers.at(-1)).toEqual({
			request: "req-q",
			reply: { kind: "picked", picks: { "Which direction should I take further?": "Timeline" } },
		});
		canvas.turn.push({ kind: "answered", request: "req-q", answer: "picked", words: "Timeline", parent: null });
		await until(() => look(canvas.host) === "folded");
		expect(canvas.host.querySelector("[data-agent-folded]")?.textContent).toBe("You picked Timeline");
	});

	it("asks a question about no frame as a card at the end of the chat, ticks several and sends them", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "new header");
		canvas.turn.push(ready);
		const question = {
			question: "Which screens should get the new header?",
			header: "Screens",
			multiSelect: true,
			options: [
				{ label: "Orders", description: "The wholesale list." },
				{ label: "Schedule", description: "The roaster lanes on their own." },
				{ label: "Stock", description: "Green coffee by lot." },
			],
		};
		canvas.turn.push({
			kind: "called",
			id: "q1",
			tool: "AskUserQuestion",
			input: { questions: [question] },
			parent: null,
		});
		canvas.turn.push(
			asking({
				request: "req-m",
				call: "q1",
				tool: "AskUserQuestion",
				display: "AskUserQuestion",
				input: { questions: [question] },
				description: null,
				interaction: true,
				suggestions: [],
			}),
		);
		await until(() => options(canvas.host).length === 3);
		// a question about no frame is a quiet card at the end of the chat (story 67), the
		// turn's line left as it was
		expect(look(canvas.host)).toBe("card");
		const turn = canvas.host.querySelector("[data-agent-turn]");
		expect(turn?.lastElementChild?.getAttribute("data-agent-ask-look")).toBe("card");
		expect(turn?.querySelector('[data-agent-turn-line="waiting"]')).toBeNull();

		const sendButton = () =>
			[...canvas.host.querySelectorAll<HTMLButtonElement>("[data-agent-ask] button")].find((one) =>
				one.textContent?.startsWith("Send"),
			);
		expect(sendButton()?.disabled).toBe(true);
		for (const label of ["Orders", "Schedule"]) {
			const row = canvas.host.querySelector<HTMLButtonElement>(`[data-agent-option="${label}"]`);
			await act(async () => row?.click());
		}
		// ticking is not answering
		expect(canvas.turn.answers).toEqual([]);
		expect(canvas.host.querySelectorAll('[data-agent-tick="on"]')).toHaveLength(2);
		expect(sendButton()?.textContent).toBe("Send 2");
		await act(async () => sendButton()?.click());
		expect(canvas.turn.answers.at(-1)).toEqual({
			request: "req-m",
			reply: { kind: "picked", picks: { "Which screens should get the new header?": "Orders, Schedule" } },
		});
	});

	it("hangs a designer's ask under its own tile, and rings the tile", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "make two directions");
		canvas.turn.push(ready);
		canvas.turn.push({
			kind: "called",
			id: "a1",
			tool: "Agent",
			input: { description: "Design calm" },
			parent: null,
		});
		canvas.turn.push({
			kind: "called",
			id: "a2",
			tool: "Agent",
			input: { description: "Design bold" },
			parent: null,
		});
		for (const [task, call, frame] of [
			["t1", "a1", "home--calm"],
			["t2", "a2", "home--bold"],
		] as const) {
			canvas.turn.push({
				kind: "task-started",
				task,
				call,
				description: `Design ${frame}`,
				agent: "designer",
				prompt: null,
				parent: null,
			});
			canvas.turn.push(landed(frame, task, call));
		}
		canvas.turn.push({
			kind: "called",
			id: "s1",
			tool: "Bash",
			input: { command: "spool shot home--bold" },
			parent: "a2",
		});
		canvas.turn.push(
			asking({
				call: "s1",
				tool: "Bash",
				input: { command: "spool shot home--bold" },
				description: "Taking a picture of home--bold to check the layout.",
			}),
		);
		await until(() => options(canvas.host).length > 0);

		expect(look(canvas.host)).toBe("card");
		expect(canvas.host.querySelector("[data-agent-tile-waiting]")?.getAttribute("data-agent-tile")).toBe(
			"home--bold",
		);
		// the turn's own line is still the turn's: one designer waits, the others work
		expect(canvas.host.querySelector('[data-agent-turn-line="waiting"]')).toBeNull();
		// the card hangs under the grid, from the tile that waits
		const under = canvas.host.querySelector("[data-agent-ask-under]");
		expect(under?.getAttribute("data-agent-ask-under")).toBe("home--bold");
		expect(under?.previousElementSibling?.hasAttribute("data-agent-tiles")).toBe(true);
		expect(under?.querySelector('[data-agent-ask-look="card"]')?.textContent).toContain(
			"Taking a picture of home--bold",
		);
	});

	/** a designer that asks before its frame exists still has a place: the spot held for it */
	it("stands a designer's ask under its reserved spot on the canvas while the rail is shut", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "make a calm direction");
		canvas.turn.push(ready);
		canvas.turn.push({
			kind: "called",
			id: "a1",
			tool: "Agent",
			input: { description: "Design calm" },
			parent: null,
		});
		canvas.turn.push({
			kind: "task-started",
			task: "t1",
			call: "a1",
			description: "Design home--calm",
			agent: "designer",
			prompt: null,
			parent: null,
		});
		canvas.turn.push({
			kind: "spot",
			state: "held",
			name: "home--calm",
			task: "t1",
			call: "a1",
			x: 2000,
			y: 0,
			w: 1440,
			h: 900,
			parent: null,
		});
		canvas.turn.push(
			asking({
				call: "n1",
				tool: "Bash",
				input: { command: "npm install dayjs" },
				description: "Adding a date library for the opening hours.",
				parent: "a1",
			}),
		);
		await until(() => options(canvas.host).length > 0);
		await press(canvas.host.querySelector('[data-rail-icon="agent"]'));

		await until(() => canvas.host.querySelector("[data-agent-canvas-ask]") !== null);
		const card = () => canvas.host.querySelector("[data-agent-canvas-ask]");
		expect(card()?.textContent).toContain("Adding a date library");

		// answered there, it fades where it stood and then goes
		await act(async () => card()?.querySelector<HTMLButtonElement>('[data-agent-option="Allow"]')?.click());
		expect(canvas.turn.answers.at(-1)?.request).toBe("req-1");
		canvas.turn.push({ kind: "answered", request: "req-1", answer: "allow", words: null, parent: null });
		await until(() => card()?.getAttribute("data-agent-canvas-ask") === "leaving");
		await until(() => card() === null);
	});

	it("keeps a second waiting ask on screen as a card under the first", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "carry the colours into the app");
		canvas.turn.push(ready);
		canvas.turn.push(asking({}));
		canvas.turn.push(asking({ request: "req-2", call: "c2", tool: "Bash", input: { command: "npm test" } }));
		await until(() => canvas.host.querySelectorAll('[data-agent-ask="open"]').length === 2);
		const looks = [...canvas.host.querySelectorAll('[data-agent-ask="open"]')].map((one) =>
			one.getAttribute("data-agent-ask-look"),
		);
		expect(looks).toEqual(["line", "card"]);
	});

	it("leaves a waiting ask in the log, as a card, where the turn has no line to open it out of", () => {
		const ask = {
			key: "ask:c1",
			kind: "ask",
			request: "r",
			question: false,
			asked: "Run it",
			questions: [],
			always: false,
			state: "open",
			words: null,
		} as const;
		const user = { key: "user", kind: "user", text: "go", context: null, attached: [] } as const;
		const foot = {
			key: "turn",
			kind: "turn",
			tiles: [],
			status: null,
			thinking: false,
			ms: null,
			ending: null,
		} as const;
		expect(turnLayout([user, ask]).map((one) => one.entry.kind)).toEqual(["user", "ask"]);
		const anchored = turnLayout([user, ask, foot]);
		expect(anchored.map((one) => one.entry.kind)).toEqual(["user", "turn"]);
		expect(anchored[1]?.asks).toEqual([ask]);
	});
});

describe("an approval in the log", () => {
	const approval = (over: Partial<Extract<AgentEvent, { kind: "asking" }>> = {}): AgentEvent => ({
		kind: "asking",
		request: "req-a",
		call: "c1",
		tool: "Bash",
		display: "Bash",
		input: { command: "spool upgrade" },
		description: "Run `spool upgrade`, which restarts the daemon under any canvas you have open",
		interaction: false,
		suggestions: [
			{
				type: "addRules",
				rules: [{ toolName: "Bash", ruleContent: "spool upgrade" }],
				behavior: "allow",
				destination: "localSettings",
			},
		],
		parent: null,
		...over,
	});

	const options = (host: HTMLElement) =>
		[...host.querySelectorAll("[data-agent-option]")].map((option) => option.getAttribute("data-agent-option"));

	it("carries the agent's own written description and three answers", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot the receipt");

		canvas.turn.push({
			kind: "called",
			id: "c1",
			tool: "Bash",
			input: { command: "spool upgrade", description: "Upgrade the CLI" },
			parent: null,
		});
		canvas.turn.push(approval());
		await until(() => options(canvas.host).length > 0);

		// the row above already says what the call is, so the block says why — and every
		// one of the three is an answer, so all three are rows
		expect(canvas.host.querySelector("[data-agent-ask]")?.textContent).toContain("which restarts the daemon");
		expect(options(canvas.host)).toEqual(["Allow", "Allow for this chat", "Deny"]);
		expect(canvas.host.querySelector("[data-agent-dismiss]")).toBeNull();

		const always = canvas.host.querySelector<HTMLButtonElement>('[data-agent-option="Allow for this chat"]');
		await act(async () => always?.click());
		expect(canvas.turn.answers.at(-1)).toEqual({ request: "req-a", reply: { kind: "always" } });
	});

	it("is never answered by typing, because no sentence answers may I run this", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot the receipt");

		canvas.turn.push(approval());
		await until(() => options(canvas.host).length > 0);

		// the field is a field, not a way of allowing something: typing "wait, don't"
		// at an approval must never be the thing that lets the command through. It asks for
		// what comes next, because that is what a press does to a turn still running (#364)
		expect(field(canvas.host)?.placeholder).toBe("Say what comes next");
		await send(canvas.host, "wait, do not run that");

		expect(canvas.turn.answers).toEqual([]);
		// and parked is not finished, so the press is held rather than spawning a second
		// agent into a turn that is still holding the repo: it waits in the queue at the end
		// of the log, and is no row of the transcript
		expect(canvas.turn.prompts).toEqual(["shoot the receipt"]);
		expect(queuedRows(canvas.host)).toEqual(["wait, do not run that"]);
		const entries = [...canvas.host.querySelectorAll("[data-agent-log] > div > [data-agent-arrive]")];
		expect(entries.map((entry) => entry.textContent).join("")).not.toContain("wait, do not run that");
	});

	it("lets the clock run again when nobody answered and the agent moved on", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot the receipt");
		canvas.turn.push({ kind: "called", id: "c1", tool: "Bash", input: { command: "spool upgrade" }, parent: null });
		canvas.turn.push(approval());
		await until(() => options(canvas.host).length > 0);

		// the agent takes the cautious option itself and its result lands 84ms later, so
		// the block says the question expired — and the clock has to come back with it,
		// or every event after it stamps at the same millisecond and nothing draws
		canvas.turn.push({ kind: "result", id: "c1", failed: true, text: "", images: [], parent: null });
		canvas.turn.push({ kind: "waiting", parent: null });
		canvas.turn.push(speaking);
		canvas.turn.push(say(LONG));
		canvas.turn.push({ kind: "said", text: LONG, parent: null });
		await until(() => canvas.host.querySelector("[data-agent-ask]")?.getAttribute("data-agent-ask") === "dropped");

		// and the message that followed the drop is drawn whole, with nothing left arriving
		await until(() => log(canvas.host).includes(LONG), 3000);
		expect(caret(canvas.host)).toBeNull();
	});
});

describe("the queue", () => {
	it("takes a message typed into a running turn rather than sending or stopping", async () => {
		const canvas = mount();
		await running(canvas);

		await send(canvas.host, "hold off on add-habit until i've seen home");

		// nothing went down the wire mid-turn, and nothing was interrupted for it
		expect(canvas.turn.prompts).toEqual(["start a habit tracker"]);
		expect(canvas.turn.stops).toEqual([]);
		// it waits at the end of the log, shaped as the ask it will become and faint, its rail
		// dashed because it has not gone out, with a Take back under it (#364)
		expect(queuedRows(canvas.host)).toEqual(["hold off on add-habit until i've seen home"]);
		const row = canvas.host.querySelector("[data-agent-log] [data-agent-queued]");
		expect(row?.querySelector("p")?.className).toContain("text-muted");
		expect(row?.querySelector(".border-dashed")).not.toBeNull();
		const back = row?.querySelector('button[aria-label^="take back"]');
		expect(back?.textContent).toBe("Take back");
		expect(back?.getAttribute("aria-label")).toBe("take back hold off on add-habit until i've seen home");
		// and the composer holds none of it: the box is where the next words go
		expect(canvas.host.querySelector("[data-agent-composer] [data-agent-queue]")).toBeNull();
		// and the field is empty again, because the message has been taken
		expect(field(canvas.host)?.value).toBe("");
	});

	it("fires in order as one turn the moment the result arrives", async () => {
		const canvas = mount();
		await running(canvas);
		await send(canvas.host, "hold off on add-habit");
		await send(canvas.host, "swedish weekday chips");
		expect(queuedRows(canvas.host)).toHaveLength(2);

		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await until(() => canvas.turn.turns.length === 2);

		// one turn reading both of them, in the order they were said in — not two turns
		expect(canvas.turn.turns[1]?.map((one) => one.prompt)).toEqual([
			"hold off on add-habit",
			"swedish weekday chips",
		]);
		// the box is its own again, and both messages are the log's own rows
		expect(queuedRows(canvas.host)).toEqual([]);
		await until(() => canvas.host.querySelector("[data-agent-log]")?.textContent?.includes("weekday") === true);
		expect(canvas.host.querySelector("[data-agent-log]")?.textContent).toContain("hold off on add-habit");
	});

	it("carries the selection each message was said against, not the one at firing time", async () => {
		const canvas = mount();
		canvas.pointed.served = [frameEntry("cart")];
		await running(canvas);
		await until(() => chips(canvas.host).includes("cart"));
		await send(canvas.host, "make this consistent");

		// the hands move on, which is the whole reason this is captured at Enter: nine
		// minutes can pass between the press and the fire
		canvas.pointed.served = [frameEntry("menu")];
		await clickHome(canvas.host);
		await until(() => chips(canvas.host).includes("menu"));
		await send(canvas.host, "and this one");

		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await until(() => canvas.turn.turns.length === 2);

		expect(canvas.turn.turns[1]?.map((one) => one.selection?.map((entry) => entry.frame))).toEqual([
			["cart"],
			["menu"],
		]);
	});

	it("hands a message back into the box when it is taken back by hand", async () => {
		const canvas = mount();
		await running(canvas);
		await send(canvas.host, "hold off on add-habit");
		// a half-written sentence, because the merge is only a question when there is a
		// caret sitting in one
		await act(async () => {
			const box = field(canvas.host);
			if (box !== null) type(box, "make the header sticky and give the");
		});

		const back = canvas.host.querySelector<HTMLButtonElement>('[data-agent-queued] button[aria-label^="take back"]');
		await act(async () => back?.click());

		// above the draft, with a blank line: the queue's order is the order these were
		// going to be said in, and the caret is mid-word
		expect(field(canvas.host)?.value).toBe("hold off on add-habit\n\nmake the header sticky and give the");
		expect(queuedRows(canvas.host)).toEqual([]);
	});

	/**
	 * The queue is the end of the log, so the log follows to it as it would to a reply: a
	 * message held where nobody could see it would read as one that was lost (#364).
	 */
	it("stands after the last entry, and leaves on a fade when it is taken back", async () => {
		const canvas = mount();
		await running(canvas);
		await send(canvas.host, "one");
		await send(canvas.host, "two");

		const body = canvas.host.querySelector("[data-agent-log] > div");
		const queue = canvas.host.querySelector("[data-agent-queue]");
		expect(body?.lastElementChild?.contains(queue ?? null)).toBe(true);
		expect(queuedRows(canvas.host)).toEqual(["one", "two"]);

		await act(async () => canvas.host.querySelector<HTMLButtonElement>('[aria-label="take back one"]')?.click());
		// gone from the queue at once, and still drawn, inert, for the fade it leaves on
		expect(queuedRows(canvas.host)).toEqual(["two"]);
		const leaving = [...(queue?.querySelectorAll("p") ?? [])].find((row) => row.textContent === "one");
		expect(leaving?.closest("[inert]")).not.toBeNull();
		await settle(200);
		expect([...(queue?.querySelectorAll("p") ?? [])].map((row) => row.textContent)).toEqual(["two"]);
		expect(field(canvas.host)?.value).toBe("one");
	});

	it("hands the reference back with the words rather than dropping it", async () => {
		const canvas = mount();
		await running(canvas);
		await paste(canvas.host, shot());
		await send(canvas.host, "match this");
		// the picture left the box with the message, so while it waits there is one queued
		// row and nothing attached
		expect(queuedRows(canvas.host)).toEqual(["match this"]);
		expect(canvas.host.querySelector("[data-agent-attached]")).toBeNull();

		const back = canvas.host.querySelector<HTMLButtonElement>('[data-agent-queued] button[aria-label^="take back"]');
		await act(async () => back?.click());

		// and it comes home with them: a reference that vanished on the way back would be
		// a picture the hand cannot see and cannot get again, since a browser never gave
		// spool its path
		expect(field(canvas.host)?.value).toBe("match this");
		await until(() => canvas.host.querySelector("[data-agent-attached] img") !== null);
	});

	it("is cancelled by a stop, which hands every word back the same way", async () => {
		const canvas = mount();
		await running(canvas);
		await send(canvas.host, "hold off on add-habit");
		await send(canvas.host, "swedish weekday chips");
		await act(async () => {
			const box = field(canvas.host);
			if (box !== null) type(box, "make the header sticky and give the");
		});

		await act(async () => stopPress(canvas.host)?.click());

		expect(canvas.turn.stops).toHaveLength(1);
		// one act with one outcome: the same landing a take-back produces, for both
		expect(field(canvas.host)?.value).toBe(
			"hold off on add-habit\n\nswedish weekday chips\n\nmake the header sticky and give the",
		);
		expect(queuedRows(canvas.host)).toEqual([]);

		// and nothing fires when the stopped turn ends, because the queue is already gone
		canvas.turn.push({
			kind: "ended",
			ending: "stopped",
			reason: "aborted_streaming",
			stopReason: null,
			parent: null,
		});
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle();
		expect(canvas.turn.turns).toHaveLength(1);
	});
});

describe("a thread waiting on a person", () => {
	/** a parked question, a waiting approval and a signed-out bounce are one mark */
	it("draws the disc for a question the agent parked on", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "pick a direction");
		canvas.turn.push(ready);
		canvas.turn.push({
			kind: "asking",
			request: "req-q",
			call: null,
			tool: "AskUserQuestion",
			display: null,
			input: { questions: [{ question: "Which layout?", options: [{ label: "grid" }] }] },
			description: null,
			interaction: true,
			suggestions: [],
			parent: null,
		});
		await settle();

		expect(await lifeOfCell(canvas.host, "pick a direction")).toBe("waiting");
		// nothing turns: the thread has stopped and is costing nothing
		expect((await marks(canvas.host, "pick a direction")).turning).toBe(0);
	});

	it("draws the disc for an approval nobody has answered", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tidy the repo");
		canvas.turn.push(ready);
		canvas.turn.push(called("call-1", "Bash", { command: "rm -rf build" }));
		canvas.turn.push({
			kind: "asking",
			request: "req-a",
			call: "call-1",
			tool: "Bash",
			display: null,
			input: { command: "rm -rf build" },
			description: "Delete the build folder",
			interaction: false,
			suggestions: [],
			parent: null,
		});
		await settle();

		expect(await lifeOfCell(canvas.host, "tidy the repo")).toBe("waiting");
	});

	it("draws the disc for a signed-out bounce, in the binary's own words", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push({ kind: "closed", code: 1, message: "Not logged in · Please run /login", parent: null });
		canvas.turn.close();
		await settle();

		expect(await lifeOfCell(canvas.host, "shoot home")).toBe("waiting");
	});

	/** the agent is told to finish and does, so a wind-down is not a thread that is stuck */
	it("does not draw it for a usage wind-down", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "three takes on the cart");
		canvas.turn.push(waiting);
		canvas.turn.push({
			kind: "limit",
			limit: { status: "approaching_limit", window: "five_hour", utilization: 0.92, graceActive: true },
			parent: null,
		});
		await settle();
		await newThread(canvas.host);

		expect(await lifeOfCell(canvas.host, "three takes on the cart")).toBe("running");
	});

	/** a look reads a thread; nothing about looking answers a question */
	it("keeps the disc through a look", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "pick a direction");
		canvas.turn.push(ready);
		canvas.turn.push({
			kind: "asking",
			request: "req-q",
			call: null,
			tool: "AskUserQuestion",
			display: null,
			input: { questions: [{ question: "Which layout?", options: [{ label: "grid" }] }] },
			description: null,
			interaction: true,
			suggestions: [],
			parent: null,
		});
		await settle();
		await newThread(canvas.host);
		expect(await lifeOfCell(canvas.host, "pick a direction")).toBe("waiting");

		await openCell(canvas.host, "pick a direction");

		expect(await lifeOfCell(canvas.host, "pick a direction")).toBe("waiting");
	});
});

describe("what survives a restart", () => {
	it.each([false, true])("removes a saved prose cursor when stopped is %s", async (stopped) => {
		const canvas = mount();
		canvas.stored.served = [
			storedThread({
				id: ONE,
				ask: "tighten the header",
				life: stopped ? "running" : "read",
				stopped,
				entries: [
					{ key: "u0", kind: "user", text: "tighten the header", context: null, attached: [] },
					{ key: "p0", kind: "prose", full: "The header is tighter.\n\nThe receipt", settled: false },
				],
				kept: 2,
			}),
		];
		await canvas.render();
		await settle();

		expect(log(canvas.host)).toContain("The header is tighter.");
		expect(log(canvas.host)).toContain("The receipt");
		expect(caret(canvas.host)).toBeNull();
		expect(canvas.host.querySelector("[data-agent-seed]")).toBeNull();
		expect(canvas.host.querySelector("[data-agent-caret-line]")).toBeNull();
		expect(canvas.host.querySelector(".animate-agent-paragraph")).toBeNull();

		await newThread(canvas.host);
		await openCell(canvas.host, "tighten the header");
		expect(log(canvas.host)).toContain("The receipt");
		expect(caret(canvas.host)).toBeNull();
	});

	it("restores every thread the daemon kept, identical to a live one", async () => {
		const canvas = mount();
		canvas.stored.served = [
			storedThread({ id: ONE, ask: "tighten the header", frame: "home", at: 10 }),
			storedThread({ id: TWO, ask: "write the copy deck", frame: "copy-deck", at: 20 }),
		];
		await canvas.render();
		await settle();

		expect(await cells(canvas.host)).toEqual(["write the copy deck", "tighten the header"]);
		// the picture is the whole of it: nothing capped, nothing elided, the same view
		expect(log(canvas.host)).toContain("write the copy deck");
		expect(log(canvas.host)).toContain("The header is tighter now.");
		expect(canvas.host.querySelector('[data-agent-row="edit copy-deck"]')).not.toBeNull();
		// and it is a picture rather than an arrival: nothing opens and nothing says more is
		// coming, because a restored message is over
		expect(canvas.host.querySelector(".animate-agent-paragraph")).toBeNull();
		expect(caret(canvas.host)).toBeNull();
	});

	/** a reboot is not a hand: the thread reads stopped and nothing offers to run it again */
	it("reads a thread the restart caught mid-turn as stopped, and offers no resume", async () => {
		const canvas = mount();
		canvas.stored.served = [
			storedThread({
				id: ONE,
				ask: "three takes on the cart",
				life: "running",
				stopped: true,
				entries: [
					{ key: "u0", kind: "user", text: "three takes on the cart", context: null, attached: [] },
					{
						key: "row:t1",
						kind: "row",
						state: "running",
						verb: "write",
						subject: "cart--empty-b",
						detail: null,
						frame: "cart--empty-b",
						count: 1,
						shot: null,
						foreign: null,
						parent: null,
						delegated: [],
					},
				],
			}),
		];
		await canvas.render();
		await settle();

		expect(log(canvas.host)).toContain("stopped");
		expect(canvas.host.querySelector('[data-agent-row="write cart--empty-b"]')).not.toBeNull();
		// nothing turns, because nothing is running
		expect(rail(canvas.host)?.querySelectorAll(".animate-agent-spin")).toHaveLength(0);
		expect(rail(canvas.host)?.textContent).not.toMatch(/resume|continue/i);
		// and nothing was spawned to bring it back
		expect(canvas.turn.turns).toEqual([]);
	});

	/**
	 * The binary deletes its own sessions after thirty days, so spool's picture outlives
	 * the thing that makes the conversation continuable.
	 */
	it("reads a thread whose session has aged out as finished", async () => {
		const canvas = mount();
		canvas.stored.served = [storedThread({ id: ONE, ask: "tighten the header", continuable: false })];
		await canvas.render();
		await settle();

		// the transcript is intact and worth reading
		expect(log(canvas.host)).toContain("The header is tighter now.");
		// and the composer says what the next thing said will actually do, in the field it is
		// a fact about — #184 gave the footer's own 18px line to the model readout
		expect(field(canvas.host)?.placeholder).toBe("Say what to change · this starts a new chat");
		expect(rail(canvas.host)?.textContent).not.toMatch(/resume/i);

		await send(canvas.host, "and now the receipt");
		await settle();

		// a new thread, rather than a resume that would fail. The words that started it are
		// its name until it writes something; the restored one is called what it wrote
		expect(canvas.turn.streams[0]?.thread).not.toBe(ONE);
		expect(await cells(canvas.host)).toEqual(["and now the receipt", "tighten the header"]);
	});

	/**
	 * The same clock rule inside one session: a thread's earlier turns keep their text.
	 *
	 * A message's schedule is milliseconds from its own turn's send, and the next turn's
	 * clock starts again at zero — so a turn left carrying its schedule would re-type
	 * itself, from nothing, every time somebody said the next thing.
	 */
	it("keeps a thread's earlier turns whole while the next one arrives", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push(say(MESSAGE));
		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await until(() => caret(canvas.host) === null && log(canvas.host).includes(MESSAGE));

		await send(canvas.host, "and now the receipt");
		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push(say("Receipt is next."));
		await settle(120);

		// the first turn is settled text with no live marker of its own, under the second
		expect(log(canvas.host)).toContain(MESSAGE);
		expect(log(canvas.host)).toContain("tighten the header");
		expect(log(canvas.host)).toContain("and now the receipt");
		// and exactly one message is arriving: the one that is
		expect(canvas.host.querySelectorAll("[data-agent-caret]")).toHaveLength(1);
	});

	it("carries on in a thread whose session is still there", async () => {
		const canvas = mount();
		canvas.stored.served = [storedThread({ id: ONE, ask: "tighten the header" })];
		await canvas.render();
		await settle();

		await send(canvas.host, "and now the receipt");
		await settle();

		expect(canvas.turn.streams[0]?.thread).toBe(ONE);
		// the conversation keeps what it had drawn, above the turn that continues it
		expect(log(canvas.host)).toContain("The header is tighter now.");
		expect(log(canvas.host)).toContain("and now the receipt");
		expect(await cells(canvas.host)).toEqual(["tighten the header"]);
	});

	it("writes the picture down as it draws it", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		await answerTurn(canvas.turn.streams[0] as Stream, "Home is shot.");

		const put = canvas.stored.puts.at(-1);
		expect(put?.thread).toBe(canvas.turn.streams[0]?.thread);
		expect(put?.body.ask).toBe("shoot home");
		expect(put?.body.life).toBe("read");
		// stored is exactly drawn: the entries are the ones the transcript rendered
		expect(put?.body.entries).toContainEqual(expect.objectContaining({ kind: "user", text: "shoot home" }));
		expect(put?.body.entries).toContainEqual(expect.objectContaining({ kind: "prose", full: "Home is shot." }));
	});

	/** a thread the rail is not looking at is stored as what it was doing, never as streaming */
	it("stores a thread working elsewhere as running", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "three takes on the cart");
		canvas.turn.push(waiting);
		await settle();
		await newThread(canvas.host);
		await settle(2400);

		expect(canvas.stored.puts.at(-1)?.body.life).toBe("running");
	});
});

describe("codex (#362)", () => {
	it("is a group in the agent menu with its own efforts, and its chat's modes name it", async () => {
		const canvas = mount();
		canvas.preflight.engines = [
			{ id: "claude", installed: true },
			{ id: "codex", installed: true },
		];
		await canvas.render();
		await openModelMenu(canvas);
		await until(() => modelRow(canvas.host, "GPT-5.5") !== null);
		expect(live(canvas.host, "[data-agent-group]").map((group) => group.getAttribute("data-agent-group"))).toEqual([
			"claude",
			"codex",
		]);
		// an empty chat takes Codex in place
		await press(modelRow(canvas.host, "GPT-5.5"));
		await settle(50);
		await until(
			() => canvas.host.querySelector("[data-agent-rail]")?.getAttribute("data-agent-rail-engine") === "codex",
		);
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("GPT-5.5") === true);

		// its efforts are the ones Codex reports for the model, opened in place
		await act(async () => modelTrigger(canvas.host)?.click());
		await settle(50);
		expect(effortToggle(canvas.host)?.getAttribute("aria-label")).toBe("Effort, medium");
		await press(effortToggle(canvas.host));
		expect(effortPills(canvas.host).map((pill) => pill.getAttribute("data-agent-effort"))).toEqual([
			"low",
			"medium",
			"high",
		]);
		await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
		await settle(200);

		// and Ask first says the same promise, naming no engine
		await until(() => canvas.host.querySelector("[data-permission-trigger]") !== null);
		await press(canvas.host.querySelector("[data-permission-trigger]"));
		expect(live(canvas.host, '[data-permission-mode="ask"]')[0]?.textContent).toBe(
			"Ask firstAsks before it edits outside design/ or runs commands outside its sandbox.",
		);
	});

	it("bounces a signed-out turn to codex login", async () => {
		const canvas = mount();
		canvas.machine.preferred = "codex";
		canvas.preflight.engines = [{ id: "codex", installed: true }];
		await canvas.render();
		await settle(50);
		await send(canvas.host, "shoot home");
		canvas.turn.push({
			kind: "ended",
			ending: "failed",
			reason: "Sign in to Codex to continue.",
			stopReason: null,
			recovery: { kind: "login", account: "Codex", scope: "account" },
			parent: null,
		});
		canvas.turn.push({ kind: "closed", code: 0, parent: null });
		canvas.turn.close();
		await settle();

		const strip = canvas.host.querySelector<HTMLElement>('[data-recovery="codex"]');
		expect(strip?.textContent).toContain("Sign in to Codex to continue.");
		expect(strip?.textContent).toContain("Run codex login in a terminal.");
		expect(strip?.textContent).not.toContain("/login");
	});
});
