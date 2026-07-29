// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { AgentEvent } from "../api";
import { type CanvasChrome, ProjectCanvas } from "./canvas";

/**
 * The agent rail as the canvas drives it (#192).
 *
 * One turn, end to end: the composer takes a sentence, the daemon's stream answers
 * it, and the transcript is what the projection said it would be. What is asserted
 * here is the wiring — that the human's words land before anything comes back, that
 * the request carries them, that prose arrives rather than appearing, and that the
 * rail is the agent and nothing else.
 *
 * The words themselves are `agent-transcript.test.ts`'s and the pace is
 * `agent-pace.test.ts`'s.
 */

const PROJECTION = {
	root: "/project",
	pages: [],
	frames: [{ name: "home", kind: "html", x: 0, y: 0, w: 390, h: 844 }],
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
			if (url.pathname.endsWith("/frames")) return Response.json(PROJECTION);
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
		render: async () => {
			await act(async () => {
				root.render(
					createElement(ProjectCanvas, {
						project: "test",
						onChrome: (_next: CanvasChrome | null) => {},
					}),
				);
			});
		},
	};
}

const rail = (host: HTMLElement) => host.querySelector<HTMLElement>('[aria-label="Agent"]');
const field = (host: HTMLElement) => host.querySelector<HTMLTextAreaElement>("textarea");
/** how much of a message still arriving is on screen; a settled one has no such box */
const arriving = (host: HTMLElement) => host.querySelector("[data-agent-prose]")?.textContent ?? "";

/** long enough that the pace cannot spend it inside one tick of the rail's clock */
const MESSAGE = "the frame is authored and live on the canvas, and the shot came back clean.";

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
