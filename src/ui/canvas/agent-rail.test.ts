// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { longestStreamed } from "../../test-helpers";
import type { AgentEvent } from "../api";
import { chunksOf } from "./agent-markdown";
import { followTo } from "./agent-rail";
import { type CanvasChrome, ProjectCanvas } from "./canvas";

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

/** `receipt` sits one page over, which is the normal case: a thread is not bound to a page */
const PROJECTION = {
	root: "/project",
	pages: ["site"],
	frames: [
		{ name: "home", kind: "html", x: 0, y: 0, w: 390, h: 844 },
		{ name: "receipt", page: "site", kind: "html", x: 0, y: 0, w: 390, h: 844 },
	],
	collisions: [],
};

interface Turn {
	readonly prompts: string[];
	push(event: AgentEvent): void;
	close(): void;
}

/** an SSE body a test can write into, which is both of the canvas's live streams */
function sse() {
	const encoder = new TextEncoder();
	let ctrl: ReadableStreamDefaultController<Uint8Array> | undefined;
	let open = true;
	const stream = new ReadableStream<Uint8Array>({
		start: (controller) => {
			ctrl = controller;
		},
	});
	return {
		response: () => new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }),
		push: (event: string, data: unknown) =>
			ctrl?.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)),
		close: () => {
			if (!open) return;
			open = false;
			ctrl?.close();
		},
		isOpen: () => open,
	};
}

function mount({ still = false }: { still?: boolean } = {}) {
	const turn: Turn & { open: boolean } = {
		prompts: [],
		open: false,
		push: () => {},
		close: () => {},
	};
	/** the daemon's own watcher channel: what a frame the turn writes arrives on */
	const watcher = sse();
	const chrome: { latest: CanvasChrome | null } = { latest: null };
	/** what the folder holds, so a test can take a frame out of it and say so */
	const project = { frames: PROJECTION.frames as { name: string; page?: string }[] };
	if (still) {
		vi.stubGlobal("matchMedia", (query: string) => ({
			matches: query.includes("prefers-reduced-motion"),
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		}));
	}
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			if (url.pathname.endsWith("/agent/turn")) {
				const body = input instanceof Request ? await input.text() : String(init?.body ?? "{}");
				turn.prompts.push((JSON.parse(body) as { prompt: string }).prompt);
				const stream = sse();
				turn.open = true;
				turn.push = (event) => stream.push("agent", event);
				turn.close = () => {
					turn.open = false;
					stream.close();
				};
				return stream.response();
			}
			if (url.pathname.endsWith("/events")) return watcher.response();
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) return Response.json({ ...PROJECTION, frames: project.frames });
			if (url.pathname.endsWith("/flows/resolve")) return Response.json({ skipped: 0, read: 0, unavailable: 0 });
			if (url.pathname.endsWith("/flows")) return Response.json({ frames: [], edges: [], unreadable: [] });
			return Response.json({});
		}),
	);
	vi.stubGlobal(
		"EventSource",
		class {
			addEventListener() {}
			close() {}
		},
	);
	vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
		callback(performance.now() + 1000);
		return 1;
	});
	vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});

	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		turn.close();
		watcher.close();
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});
	return {
		host,
		turn,
		watcher,
		chrome,
		project,
		render: async () => {
			await act(async () => {
				root.render(
					createElement(ProjectCanvas, {
						project: "test",
						onChrome: (next: CanvasChrome | null) => {
							if (next !== null) chrome.latest = next;
						},
					}),
				);
			});
			await until(() => host.querySelector('[data-frame-label="home"]') !== null);
		},
	};
}

const rail = (host: HTMLElement) => host.querySelector<HTMLElement>('[aria-label="Agent"]');
const field = (host: HTMLElement) => host.querySelector<HTMLTextAreaElement>("textarea");
/** how much of a message still arriving is on screen; a settled one has no such box */
const arriving = (host: HTMLElement) => host.querySelector("[data-agent-prose]")?.textContent ?? "";

/** long enough that the pace cannot spend it inside one tick of the rail's clock */
const MESSAGE = "the frame is authored and live on the canvas, and the shot came back clean.";

/**
 * The longest message the captures hold: 3,372 characters of bold lead-ins, inline code,
 * two fenced blocks and a blockquote. It is the thing every claim about a long message is
 * about, so it is what the rail is asked to draw.
 */
const DOCUMENT = longestStreamed("claude-mcp").text;

async function until(condition: () => boolean, ms = 4000) {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > ms) throw new Error("condition never held");
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 25));
		});
	}
}

/** React listens for `input`, so the value has to be set through the native setter */
function type(element: HTMLTextAreaElement, text: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
	setter?.call(element, text);
	element.dispatchEvent(new Event("input", { bubbles: true }));
}

async function send(host: HTMLElement, text: string) {
	const box = field(host);
	if (box === null) throw new Error("no composer");
	await act(async () => {
		type(box, text);
	});
	await act(async () => {
		box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	});
}

/** let the stream's reader run, then let the rail's clock read it */
async function settle(ms = 400) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

const waiting: AgentEvent = { kind: "waiting", parent: null };
const speaking: AgentEvent = { kind: "speaking", message: "m", model: "claude-opus-5", parent: null };
const say = (text: string): AgentEvent => ({ kind: "say", block: 0, text, parent: null });
const ended: AgentEvent = { kind: "ended", ending: "done", reason: "completed", stopReason: null, parent: null };
const closed: AgentEvent = { kind: "closed", code: 0, parent: null };

describe("the rail", () => {
	it("is the agent, and the tab row is gone with both of its tabs", async () => {
		const canvas = mount();
		await canvas.render();

		expect(rail(canvas.host)).not.toBeNull();
		expect(canvas.host.querySelector('[aria-label="Inspector"]')).toBeNull();
		expect(rail(canvas.host)?.textContent).not.toContain("elements");
		expect(rail(canvas.host)?.textContent).not.toContain("connections");
		// the composer is the whole of what an empty rail says
		expect(field(canvas.host)?.placeholder).toBe("say what to change");
		expect(rail(canvas.host)?.textContent).toContain("enter to send");
	});

	it("opens at 420, inside the range it already had", async () => {
		const canvas = mount();
		await canvas.render();

		expect(rail(canvas.host)?.style.width).toBe("420px");
	});

	/** nothing may assume 420: the range is what every later strip is measured against */
	it("holds the drag between the 200 floor and the 480 ceiling, and snaps to its strip", async () => {
		const canvas = mount();
		await canvas.render();
		const grip = canvas.host.querySelector<HTMLElement>('[aria-label="Resize agent"]');
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
		expect(rail(canvas.host)?.style.width).toBe("480px");
		// pushed under the snap point: the rail leaves for its 44px strip rather than
		// standing at an unreadable width
		await drag(1400);
		expect(rail(canvas.host)?.style.width).toBe("44px");
		expect(canvas.host.querySelector('[aria-label="Expand agent"]')).not.toBeNull();
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
	 * The measured wait before the first token is over a second, so the beat is the
	 * difference between the rail reading as intent and reading as a hang. It leaves no
	 * receipt: once the answer starts, the wait was the absence of one.
	 */
	it("shows the wait as work, and takes it back once the first token lands", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");

		canvas.turn.push(waiting);
		await settle();
		const beats = rail(canvas.host)?.querySelectorAll(".animate-agent-spin").length ?? 0;
		expect(beats).toBe(1);

		canvas.turn.push(speaking);
		canvas.turn.push(say("the frame is live."));
		await settle();
		expect(rail(canvas.host)?.querySelectorAll(".animate-agent-spin")).toHaveLength(0);
	});

	it("draws a thinking beat as a duration and never as prose", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");

		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push({ kind: "thinking", block: 0, tokens: 61, parent: null });
		await settle();

		expect(rail(canvas.host)?.textContent).toContain("thinking");
		expect(rail(canvas.host)?.textContent).toMatch(/thinking\s*\d+\.\d+s/);
	});

	it("lets the agent's words arrive rather than appear whole", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");

		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		// one delta, long enough that the pace cannot spend it in a single tick
		canvas.turn.push(say(MESSAGE));
		await settle(120);
		const drawn = arriving(canvas.host);
		expect(drawn.length).toBeGreaterThan(0);
		expect(drawn.length).toBeLessThan(MESSAGE.length);
		// one caret at the live edge, static, saying more is coming — every fade completes
		// during a pause, so it is then the only thing that does
		const carets = canvas.host.querySelectorAll("[data-agent-caret]");
		expect(carets).toHaveLength(1);
		expect(carets[0]?.className).not.toMatch(/animate-/);
		// and words are arriving rather than appearing
		expect(canvas.host.querySelectorAll(".animate-agent-word").length).toBeGreaterThan(0);

		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle(1400);
		expect(rail(canvas.host)?.textContent).toContain(MESSAGE);
		// and nothing is left half-written once the turn is over
		expect(canvas.host.querySelector("[data-agent-prose]")).toBeNull();
	});

	/**
	 * The loop closes without the human carrying anything across it: the frame lands on
	 * disk, the daemon's watcher says so, and the canvas repaints it — all while the
	 * message explaining it is still being written.
	 */
	it("repaints a frame the turn writes while the transcript is still arriving", async () => {
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
		const drawn = arriving(canvas.host);
		expect(drawn.length).toBeGreaterThan(0);
		expect(drawn.length).toBeLessThan(MESSAGE.length);
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
		// nothing is mid-arrival, so there is no live copy at all
		expect(canvas.host.querySelector("[data-agent-prose]")).toBeNull();
		// and nothing about the settled message moves: no word is arriving and no caret
		// says more is coming
		expect(canvas.host.querySelectorAll(".animate-agent-word")).toHaveLength(0);
		expect(canvas.host.querySelector("[data-agent-caret]")).toBeNull();
	});

	it("gives the composer back when the turn ends, and refuses it while one runs", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");
		canvas.turn.push(waiting);
		await settle();

		expect(rail(canvas.host)?.textContent).toContain("a turn is running");
		// a second send would spawn a second agent against the same repo, so the press
		// is refused — and the words stay in the field rather than being thrown away
		await send(canvas.host, "and again");
		expect(canvas.turn.prompts).toEqual(["go"]);
		expect(field(canvas.host)?.value).toBe("and again");

		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle();
		expect(rail(canvas.host)?.textContent).toContain("enter to send");

		await send(canvas.host, "and again");
		await settle(50);
		expect(canvas.turn.prompts).toEqual(["go", "and again"]);
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
		expect(rail(canvas.host)?.textContent).toContain("enter to send");
	});
});

/* ---------- a message that is a document ----------
 * The one-line rule settles this without argument: a message has no call to outlive. So
 * it is rendered whole and nothing is clamped, and the thing that makes it long is the
 * thing that makes it skimmable. What the log does about the size of it is where the top
 * anchor comes in — following the end of a 3,372-character message drives the verdict in
 * its first line out of view before anyone has read it. */

describe("a long message", () => {
	it("renders as markdown, whole, and clamps nothing", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "check the copy");

		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push(say(DOCUMENT));
		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		// the pace drains a backlog this big in about 1.6s, and the live copy going away is
		// the edge having caught up with the wire
		await until(() => arriving(canvas.host).length > 0);
		await until(() => canvas.host.querySelector("[data-agent-prose]") === null, 8000);

		const said = canvas.host.querySelector("[data-agent-log]")?.firstElementChild?.lastElementChild;
		if (!(said instanceof HTMLElement)) throw new Error("no message");
		const chunks = chunksOf(DOCUMENT);
		// every block of it is on screen: the whole message, nothing dropped
		for (const chunk of chunks) {
			const own = chunk.kind === "fence" ? chunk.text : chunk.spans.map((span) => span.text).join("");
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
	 * A sentence holds the pace's lag so its last lines do not walk in one at a time; a
	 * document does not, because the reserve would put its whole height into the scroll
	 * range from the first character and leave screens of scrollable nothing under a
	 * message still being written.
	 */
	it("reserves the height of a short message and lets a document grow instead", async () => {
		const reserve = (host: HTMLElement) => host.querySelector("[data-agent-reserve]");

		const sentence = mount();
		await sentence.render();
		await send(sentence.host, "go");
		sentence.turn.push(waiting);
		sentence.turn.push(speaking);
		sentence.turn.push(say(MESSAGE));
		await until(() => arriving(sentence.host).length > 0);

		expect(reserve(sentence.host)).not.toBeNull();

		const report = mount();
		await report.render();
		await send(report.host, "check the copy");
		report.turn.push(waiting);
		report.turn.push(speaking);
		report.turn.push(say(DOCUMENT));
		await until(() => arriving(report.host).length > 0);

		expect(reserve(report.host)).toBeNull();
	});

	/**
	 * The crossover happens mid-stream, because the paragraph count is read off what the
	 * wire has sent: a message is a sentence until its fourth paragraph lands and a document
	 * afterwards. The live copy has to survive that, or every word in the window fires its
	 * arrival again at the moment the reserve goes.
	 */
	it("keeps the live copy mounted when a message becomes a document mid-stream", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "check the copy");
		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		// three paragraphs: still a sentence as far as the reserve is concerned
		const blocks = chunksOf(DOCUMENT).flatMap((chunk) =>
			chunk.kind === "p" ? [chunk.spans.map((span) => span.text).join("")] : [],
		);
		canvas.turn.push(say(blocks.slice(0, 3).join("\n\n")));
		await until(() => arriving(canvas.host).length > 0);
		const before = canvas.host.querySelector("[data-agent-prose]");

		expect(before).not.toBeNull();
		expect(canvas.host.querySelector("[data-agent-reserve]")).not.toBeNull();

		// and the fourth lands
		canvas.turn.push(say(`\n\n${blocks[3] ?? ""}`));
		await until(() => canvas.host.querySelector("[data-agent-reserve]") === null);

		// the same element, so nothing inside it remounted and no word arrived twice
		expect(canvas.host.querySelector("[data-agent-prose]")).toBe(before);
		expect(arriving(canvas.host).length).toBeGreaterThan(0);
	});

	/**
	 * The geometry is handed in because happy-dom lays nothing out, and the arithmetic it
	 * feeds is `followTo`'s own — asserted directly below this.
	 */
	it("anchors the top of a live entry taller than the box, and the end of one that fits", async () => {
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

		// 1,400px of message in a 500px box, its first line 100px down: the first line wins
		geometry(1400, 100);
		await settle(150);
		expect(log.scrollTop).toBe(90);

		// and an entry that fits keeps ordinary follow-the-end
		geometry(520, 400);
		await settle(150);
		expect(log.scrollTop).toBe(20);
	});
});

/**
 * The clamp itself, which is the whole of the anchoring rule and needs no layout.
 *
 * `tail` is how far the last entry's top sits below the box's own top edge.
 */
describe("what the log scrolls to", () => {
	it("follows the end while the last entry fits the box", () => {
		expect(followTo({ scrollTop: 0, scrollHeight: 520, clientHeight: 500 }, 400)).toBe(20);
	});

	/** 1,400px of content in 500px of box: the scroll that pins the first line is below the end */
	it("pins the first line of an entry taller than the box", () => {
		expect(followTo({ scrollTop: 0, scrollHeight: 1400, clientHeight: 500 }, 100)).toBe(90);
	});

	it("follows the end when the log holds nothing to anchor", () => {
		expect(followTo({ scrollTop: 0, scrollHeight: 520, clientHeight: 500 }, null)).toBe(20);
	});

	it("never scrolls above the top of the log", () => {
		expect(followTo({ scrollTop: 0, scrollHeight: 100, clientHeight: 500 }, 0)).toBe(0);
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
/** one whole call, as the wire hands one over once its arguments have finished arriving */
const called = (id: string, tool: string, input: unknown, parent: string | null = null): AgentEvent => ({
	kind: "called",
	id,
	tool,
	input,
	parent,
});
const edit = (id: string, frame = "home"): AgentEvent =>
	called(id, "Edit", { file_path: `/project/design/frames/${frame}/frame.tsx` });
const settled = (id: string, over: Partial<Extract<AgentEvent, { kind: "result" }>> = {}): AgentEvent => ({
	kind: "result",
	id,
	failed: false,
	text: "",
	images: [],
	parent: null,
	...over,
});
/** what every row in the log says out loud, in order */
const rows = (host: HTMLElement) =>
	[...host.querySelectorAll("[data-agent-row]")].map((row) => row.getAttribute("data-agent-row"));

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

		canvas.turn.push({
			kind: "called",
			id: "t2",
			tool: "Read",
			input: { file_path: "/project/design/AGENTS.md" },
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
			canvas.turn.push(called(`r${index}`, "Read", { file_path: `/project/design/frames/home/take-${index}.tsx` }));
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
		const zoom = canvas.chrome.latest?.zoomPct;

		canvas.turn.push(ready);
		canvas.turn.push(edit("t1", "site/receipt"));
		canvas.turn.push(settled("t1"));
		await settle(120);
		expect(rows(canvas.host)).toEqual(["edit receipt"]);

		await press(name(canvas.host, "receipt"));
		await settle(60);

		// the page follows, and the frame it names is the one that is mounted
		expect(canvas.host.querySelector('[data-frame-label="receipt"]')).not.toBeNull();
		expect(canvas.host.querySelector('[data-frame-label="home"]')).toBeNull();
		expect(canvas.host.querySelector('button[aria-label="receipt frame"]')?.getAttribute("aria-pressed")).toBe(
			"true",
		);
		// and the zoom is the reader's, so following a row is not a navigation to undo
		expect(canvas.chrome.latest?.zoomPct).toBe(zoom);
		// the press on the name is not the press on the disclosure
		expect(canvas.host.querySelector('[aria-label="edit receipt"]')?.getAttribute("aria-expanded")).toBe("false");
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

		await hover(name(canvas.host, "receipt"), true);
		expect(canvas.host.querySelector("[data-page-lit]")?.textContent).toContain("site");
		expect(canvas.host.querySelector('[data-frame-hover="receipt"]')).toBeNull();

		await hover(name(canvas.host, "receipt"), false);
		expect(canvas.host.querySelector("[data-page-lit]")).toBeNull();
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
		expect(name(canvas.host, "receipt")).not.toBeNull();

		// the frame leaves the folder, and the daemon's watcher says so
		canvas.project.frames = canvas.project.frames.filter((frame) => frame.name !== "receipt");
		canvas.watcher.push("change", { kind: "frame", frame: "receipt" });
		await until(() => canvas.host.querySelector('[data-agent-jump="receipt"]') === null);

		expect(rows(canvas.host)).toEqual(["edit receipt"]);
		const word = [...(canvas.host.querySelectorAll('[aria-label="edit receipt"] span') ?? [])].find(
			(span) => span.textContent === "receipt",
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
	it("is one row that expands into its own transcript", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "three takes on the receipt");

		canvas.turn.push(ready);
		canvas.turn.push(called("d1", "Agent", { description: "Design receipt--empty" }));
		canvas.turn.push({
			kind: "called",
			id: "w1",
			tool: "Write",
			input: { file_path: "/project/design/frames/site/receipt/frame.tsx" },
			parent: "d1",
		});
		canvas.turn.push(settled("w1", { parent: "d1" }));
		await settle(120);

		// one line in the log until somebody wants more, which is what makes a fan-out
		// one line per delegate rather than a page of interleaved writes
		expect(rows(canvas.host)).toEqual(["delegate Design receipt--empty"]);

		await act(async () => {
			canvas.host
				.querySelector('[aria-label="delegate Design receipt--empty"]')
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(rows(canvas.host)).toEqual(["delegate Design receipt--empty", "write receipt"]);
		expect(canvas.host.querySelector('[data-agent-row="write receipt"]')?.hasAttribute("data-agent-nested")).toBe(
			true,
		);
		// and its rows navigate on the same rule as everything else, because for a
		// delegate the place is the canvas
		expect(canvas.host.querySelector('[data-agent-jump="receipt"]')).not.toBeNull();
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
