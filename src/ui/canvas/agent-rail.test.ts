// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { type AgentOffer, modelsOf } from "../../daemon/agent-offer";
import { longestStreamed, readModelsReply } from "../../test-helpers";
import type { AgentEvent, SelectionEntry, ServedThread, ThreadPut } from "../api";
import { chunksOf } from "./agent-markdown";
import { type FrameJump, followTo, sameEntry, windStrength } from "./agent-rail";
import type { AgentEntry } from "./agent-transcript";
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

/**
 * A browser that has never been dragged, before every test.
 *
 * A rail's width outlives a reload on purpose, so the test that pushes one under the snap
 * point leaves 44px behind in storage and every rail mounted after it opens as a strip —
 * with no composer, no transcript and no column to look at. It is the only state here that
 * crosses a test boundary, and it crosses it silently: on a runtime whose own `localStorage`
 * global shadows happy-dom's, the writes go nowhere and the whole file passes.
 */
beforeEach(() => {
	const box: Storage | undefined = window.localStorage;
	box?.clear();
});

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

/** one message of a turn, as the daemon reads it off the wire */
interface Said {
	readonly prompt: string;
	readonly selection?: readonly { readonly frame: string }[];
	readonly attachment?: { media: string; data: string };
}

/** one thread's stream, so a test can drive a conversation it is not looking at (#200) */
interface Stream {
	/** the thread this turn ran under, which is the session id the rail minted */
	readonly thread: string;
	push(event: AgentEvent): void;
	close(): void;
	/** the client let go of this turn, which is what takes the process with it */
	readonly aborted: () => boolean;
}

interface Turn {
	/** every message of every turn, flattened: a turn is one press or a queue that fired */
	readonly prompts: string[];
	/** whatever rode with those words, which so far is a reference image (#119) */
	readonly attachments: ({ media: string; data: string } | undefined)[];
	/** each turn's own messages, so a test can say two of them fired as one turn (#170) */
	readonly turns: (readonly Said[])[];
	/** what the person said to a waiting request, which goes up its own door (#145) */
	readonly answers: { request: string; reply: Record<string, unknown> }[];
	/** the turns a press asked to stop, by the name the rail gave them (#165) */
	readonly stops: string[];
	/** every stream this project has opened, in order, one per turn (#200) */
	readonly streams: Stream[];
	push(event: AgentEvent): void;
	close(): void;
}

/** the threads the daemon has stored, and what the rail writes back to it (#120, #200) */
interface Stored {
	/** what a mount reads: null is a project that has never had a thread */
	served: ServedThread[] | null;
	/** the read held open, so a test can press Enter before the rail has a thread (#234) */
	hold: Promise<void> | null;
	/** every picture the rail wrote down, newest last */
	readonly puts: { thread: string; body: ThreadPut }[];
	/** every thread the ✕ closed */
	readonly closed: string[];
}

/**
 * The selection the daemon serves back, which is what the composer draws (#116).
 *
 * `served` is a test standing in for the enrichment: the strip is the promise of what
 * a prompt will carry, so what it draws is the daemon's own list rather than a second
 * reading of the canvas out here. Left null, the stub enriches what was put the way
 * the daemon would.
 */
interface Pointed {
	served: SelectionEntry[] | null;
	readonly puts: { frames?: string[]; elements?: { selector: string }[] }[];
}

function enrich(put: { frames?: string[]; elements?: { frame: string; selector: string }[] }): SelectionEntry[] {
	if (put.elements !== undefined) {
		return put.elements.map((element) => ({
			kind: "element" as const,
			frame: element.frame,
			name: "main",
			path: `design/frames/${element.frame}/frame.tsx`,
			lines: [2, 4] as [number, number],
			selector: element.selector,
			excerpt: "<main>hi</main>",
		}));
	}
	return (put.frames ?? []).map((frame) => ({
		kind: "frame" as const,
		frame,
		path: `design/frames/${frame}/frame.tsx`,
		size: { w: 390, h: 844 },
	}));
}

const frameEntry = (frame: string): SelectionEntry => ({
	kind: "frame",
	frame,
	path: `design/frames/${frame}/frame.tsx`,
	size: { w: 390, h: 844 },
});

const elementEntry = (name: string, selector: string, lines: [number, number]): SelectionEntry => ({
	kind: "element",
	frame: "home",
	name,
	path: "design/frames/home/frame.tsx",
	lines,
	selector,
	excerpt: `<${name} className="row" />`,
});

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

/**
 * What `list_models` came back with, and what is answering (#118, #199).
 *
 * Read from `fixtures/claude-models.json` rather than typed out here: nothing in this
 * menu is spool's to write, two of the five rows resolve to the identical model with
 * only a parenthetical between them, and one of them carries no effort levels at all.
 */
const OFFERED: AgentOffer = {
	models: modelsOf(readModelsReply()),
	current: { value: "opus[1m]", resolved: "claude-opus-5[1m]", name: "Opus 5", effort: "high", pin: null },
};

/** the daemon's own answer to a choice: the binary's report of what it is now running */
function reported(offer: AgentOffer, wanted: { value?: string; effort?: string }): AgentOffer {
	const picked = offer.models.find((model) => model.value === wanted.value);
	// an alias the binary would not take leaves the report exactly where it was
	if (wanted.value !== undefined && picked === undefined) return offer;
	return {
		models: offer.models,
		current: {
			...offer.current,
			...(picked === undefined ? {} : { value: picked.value, resolved: picked.resolvedModel }),
			...(wanted.effort === undefined ? {} : { effort: wanted.effort }),
		},
	};
}

function mount({ still = false }: { still?: boolean } = {}) {
	const turn: Turn & { open: boolean } = {
		prompts: [],
		attachments: [],
		turns: [],
		answers: [],
		stops: [],
		streams: [],
		open: false,
		push: () => {},
		close: () => {},
	};
	const stored: Stored = { served: null, hold: null, puts: [], closed: [] };
	/** what the rail last called its turn, which is the address a stop names (#165) */
	let named = "";
	/** the daemon's own watcher channel: what a frame the turn writes arrives on */
	const watcher = sse();
	const chrome: { latest: CanvasChrome | null } = { latest: null };
	/** what the folder holds, so a test can take a frame out of it and say so */
	const project = { frames: PROJECTION.frames as { name: string; page?: string }[] };
	const pointed: Pointed = { served: null, puts: [] };
	/**
	 * The two ways there is no agent to talk to, as the daemon answers them (#201).
	 *
	 * `installed` starts null, which is a door that said nothing: the rail draws its
	 * ordinary self, because only a look that came back and found nothing is a wall.
	 * `login` is only ever asked by a press, and the counts are how a test says so.
	 */
	const preflight = {
		installed: null as boolean | null,
		login: { signedIn: false, account: null } as { signedIn: boolean; account: string | null },
		looks: 0,
		asked: 0,
	};
	/** the model door, and every choice that went through it (#199) */
	const offered = {
		offer: OFFERED,
		/** every thread the rail asked the offer about, in order */
		asked: [] as string[],
		chose: [] as { thread: string; value?: string; effort?: string }[],
		reply: reported,
		/** the door held shut, which is where the second between a press and its reply is */
		hold: null as Promise<void> | null,
	};
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
			// is there an agent on this machine at all: a `which`, asked when the rail opens
			// and again on every press behind the wall (#201)
			if (url.pathname.endsWith("/agent/installed")) {
				preflight.looks += 1;
				return Response.json(preflight.installed === null ? {} : { installed: preflight.installed });
			}
			// whose login it is, asked of the binary and only ever by a press (#201)
			if (url.pathname.endsWith("/agent/login")) {
				preflight.asked += 1;
				return Response.json(preflight.login);
			}
			// the attach door (#211, #234): a turn outlives the read of it, so a rail whose
			// stream dropped asks for the same turn again rather than starting a second. This
			// daemon holds nothing between reads, which is the answer that says the turn is gone
			if (url.pathname.includes("/agent/turn/")) {
				return new Response("no turn to read", { status: 404 });
			}
			if (url.pathname.endsWith("/agent/turn")) {
				const body = input instanceof Request ? await input.text() : String(init?.body ?? "{}");
				const sent = JSON.parse(body) as { thread: string; turn: string; said: readonly Said[] };
				named = sent.turn;
				turn.turns.push(sent.said);
				for (const one of sent.said) {
					turn.prompts.push(one.prompt);
					turn.attachments.push(one.attachment);
				}
				const stream = sse();
				turn.open = true;
				// `turn` is whichever stream opened last, which is what a one-thread test wants;
				// `streams` keeps every one of them, which is how a test drives a conversation it
				// is not looking at
				turn.push = (event) => stream.push("agent", event);
				turn.close = () => {
					turn.open = false;
					stream.close();
				};
				// the abort is the whole of what letting go of a turn looks like from out here:
				// the daemon takes the process with the request
				const signal = input instanceof Request ? input.signal : init?.signal;
				turn.streams.push({
					thread: sent.thread,
					push: (event) => stream.push("agent", event),
					close: () => stream.close(),
					aborted: () => signal?.aborted === true,
				});
				return stream.response();
			}
			// the threads this project has, and the picture the rail writes back (#120, #200)
			if (url.pathname.endsWith("/agent/threads")) {
				// held open, for the one claim that is about the window before they land (#234)
				if (stored.hold !== null) await stored.hold;
				return Response.json({ threads: stored.served ?? [] });
			}
			// the binary's own answer to `list_models`, and what a choice does to it: the menu
			// is populated at runtime, so the stub is the door rather than a table (#199). Both
			// hang under `/agent/threads/`, so they answer before the thread's own put
			if (url.pathname.endsWith("/models")) {
				const thread = url.pathname.split("/agent/threads/")[1]?.replace(/\/models$/, "") ?? "";
				offered.asked.push(thread);
				return Response.json(offered.offer);
			}
			if (url.pathname.endsWith("/model")) {
				const thread = url.pathname.split("/agent/threads/")[1]?.replace(/\/model$/, "") ?? "";
				const body = input instanceof Request ? await input.text() : String(init?.body ?? "{}");
				const wanted = JSON.parse(body) as { value?: string; effort?: string };
				offered.chose.push({ thread, ...wanted });
				// a real choice is a spawn away, so a test that wants to look at the menu in
				// between holds the door here rather than racing it
				if (offered.hold !== null) await offered.hold;
				offered.offer = offered.reply(offered.offer, wanted);
				return Response.json(offered.offer);
			}
			if (url.pathname.includes("/agent/threads/")) {
				const thread = url.pathname.split("/agent/threads/")[1]?.replace(/\/close$/, "") ?? "";
				if (url.pathname.endsWith("/close")) stored.closed.push(thread);
				else stored.puts.push({ thread, body: JSON.parse(String(init?.body ?? "{}")) as ThreadPut });
				return new Response(null, { status: 204 });
			}
			// the stop's own door: a request rather than a kill, so nothing comes back
			// here and everything it produces arrives on the stream (#165)
			if (url.pathname.endsWith("/agent/interrupt")) {
				const body = input instanceof Request ? await input.text() : String(init?.body ?? "{}");
				const asked = (JSON.parse(body) as { turn: string }).turn;
				if (asked !== named || !turn.open) return new Response(`no turn "${asked}" to stop`, { status: 404 });
				turn.stops.push(asked);
				return new Response(null, { status: 204 });
			}
			if (url.pathname.endsWith("/agent/answer")) {
				const body = input instanceof Request ? await input.text() : String(init?.body ?? "{}");
				turn.answers.push(JSON.parse(body) as Turn["answers"][number]);
				return new Response(null, { status: 204 });
			}
			// the daemon's own answer to a put: the enriched list the composer draws
			if (url.pathname.endsWith("/selection") && init?.method === "PUT") {
				const put = JSON.parse(String(init.body ?? "{}")) as Parameters<typeof enrich>[0];
				pointed.puts.push(put);
				return Response.json({ selection: pointed.served ?? enrich(put) });
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
		pointed,
		stored,
		offered,
		preflight,
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
 * The same sentence twenty times over: long enough to still be arriving, and plain, so
 * the text the log draws is the text that went in.
 *
 * It is how a stopped clock is observed now that nothing in the log draws a duration. The
 * pace is `min(12ms, 250ms ÷ pending)` per character, so a running clock spends a whole
 * delta inside 250ms whatever its length — which makes "is any of it still arriving" a
 * binary reading of whether the clock moved at all, with no window to tune. The arriving
 * window is the only place a partial message is drawn: once the whole of it is on screen
 * `Prose` draws it settled and the box is gone.
 */
const LONG = Array.from({ length: 20 }, () => MESSAGE).join(" ");

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

/** the chips the composer is drawing, in the order the strip lays them out */
const chips = (host: HTMLElement) =>
	[...host.querySelectorAll("[data-agent-chip]")].map((chip) => chip.getAttribute("data-agent-chip"));

/** the rows behind an opened count chip */
const chipRows = (host: HTMLElement) =>
	[...host.querySelectorAll("[data-agent-chip-row]")].map((row) => row.getAttribute("data-agent-chip-row"));

const chipDrop = (host: HTMLElement, label: string) =>
	host.querySelector<HTMLButtonElement>(`[data-agent-chip="${label}"] button[aria-label="drop ${label}"]`);

/** the way inside a frame: the double-click, presses and all */
async function enterHome(host: HTMLElement, x = 40, y = 40) {
	const field = host.querySelector<HTMLElement>('[role="application"]');
	if (field === null) throw new Error("no canvas");
	await act(async () => {
		for (const pointerId of [91, 92]) {
			field.dispatchEvent(
				new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId }),
			);
			field.dispatchEvent(
				new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId }),
			);
		}
		field.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: x, clientY: y }));
	});
}

/** one click on the frame, which is how a frame is taken */
async function clickHome(host: HTMLElement, x = 40, y = 40) {
	const field = host.querySelector<HTMLElement>('[role="application"]');
	if (field === null) throw new Error("no canvas");
	await act(async () => {
		field.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 7 }),
		);
		field.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 7 }),
		);
	});
}

/** a pasted screenshot, which is one of the two ways one gets into the composer */
async function paste(host: HTMLElement, file: File) {
	const box = field(host);
	if (box === null) throw new Error("no composer");
	await act(async () => {
		const event = new Event("paste", { bubbles: true });
		Object.defineProperty(event, "clipboardData", { value: { files: [file] } });
		box.dispatchEvent(event);
	});
	await until(() => host.querySelector("[data-agent-attached]") !== null);
}

/**
 * A drag over the composer, carrying what a dragging browser really carries.
 *
 * `files` is empty until the drop — the drag data store is in protected mode, and
 * only each item's kind and type can be read — so a dragover accepted off `files`
 * is a dragover that never happens.
 */
async function dragOver(host: HTMLElement, items: { kind: string; type: string }[]): Promise<boolean> {
	const box = field(host);
	if (box === null) throw new Error("no composer");
	const event = new Event("dragover", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "dataTransfer", { value: { items, files: [] } });
	await act(async () => {
		box.dispatchEvent(event);
	});
	return event.defaultPrevented;
}

async function drop(host: HTMLElement, file: File) {
	const box = field(host);
	if (box === null) throw new Error("no composer");
	await act(async () => {
		const event = new Event("drop", { bubbles: true, cancelable: true });
		Object.defineProperty(event, "dataTransfer", { value: { items: [], files: [file] } });
		box.dispatchEvent(event);
	});
}

/** one pixel of PNG, which is what a paste or a drop hands over */
const shot = () =>
	new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])], "shot.png", { type: "image/png" });

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
		// the composer is the whole of what an empty rail says, and the footer under it
		// says which machine is answering — the send hint's slot, because that outranks a
		// keyboard hint you learn once (#184)
		expect(field(canvas.host)?.placeholder).toBe("say what to change");
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("Opus") === true);
		expect(rail(canvas.host)?.textContent).not.toContain("enter to send");
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
		expect(canvas.host.querySelectorAll("[data-agent-log] .animate-agent-spin")).toHaveLength(1);
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
		expect(canvas.host.querySelectorAll("[data-agent-log] .animate-agent-spin")).toHaveLength(0);
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
		expect(canvas.host.querySelectorAll("[data-agent-log] .animate-agent-spin")).toHaveLength(1);
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
		expect(field(canvas.host)?.placeholder).toBe("say what to change");
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
			// a rule is structure with no words in it, so there is nothing of it to find here
			if (chunk.kind === "rule") continue;
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

		// 1,400px of message in a 500px box, its first line 100px down: the first line wins.
		// Waited for rather than deadlined: what moves the box is the rail's own 100ms tick,
		// and a fixed sleep makes the assertion a race with whatever else the machine is doing
		geometry(1400, 100);
		await until(() => log.scrollTop === 90);
		expect(log.scrollTop).toBe(90);

		// and an entry that fits keeps ordinary follow-the-end
		geometry(520, 400);
		await until(() => log.scrollTop === 20);
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
		delegated: [],
	};
	const arriving: AgentEntry = {
		key: "say:1:0",
		kind: "prose",
		full: "the frame is live.",
		landed: [{ at: 0, upto: 18 }],
		settled: false,
	};
	const out: AgentEntry = { key: "wait:1", kind: "wait", state: "running", at: 0, ms: null };

	it("sits out a clock it does not read", () => {
		expect(sameEntry(props(row, 400), props(row, 900))).toBe(true);
	});

	it("draws again while the edge is still moving through a message", () => {
		expect(sameEntry(props(arriving, 40), props(arriving, 140))).toBe(false);
	});

	it("sits out the clock once the whole message is on screen", () => {
		expect(sameEntry(props(arriving, 4000), props(arriving, 9000))).toBe(true);
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
 * The machine around the clamp: when following ends, what never re-arms it, and the
 * ways back. The geometry is handed in as above, except the tail's rect moves with the
 * scroll the way a real one does, because everything under test is positional — where
 * following would sit against where the reader is.
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
		// 1,400px of live entry in a 500px box, its first line held at 90
		geometry(1400, 100);
		await until(() => log.scrollTop === 90);
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

	/**
	 * The one from the field. A reader wheels down through a tall live entry and reaches
	 * its end; the follow point is the entry's first line, 810px up, and a rule that
	 * re-armed follow near the bottom warped them back there on every attempt. The end
	 * of a tall entry re-arms nothing now.
	 */
	it("reaching the end of a tall live entry does not warp back to its first line", async () => {
		const { canvas, log } = await pinned();
		await wheel(log, 53);
		await scrolled(log, 620);
		await scrolled(log, 900);
		canvas.turn.push(say(" and the rest of it"));
		await settle(250);
		expect(log.scrollTop).toBe(900);
	});

	it("the end re-arms follow when the end is where following would sit", async () => {
		const { canvas, log, geometry } = await pinned();
		// the same entry, now short of the box: its top 400px into a 700px scroll, so
		// the follow point is the plain end at 200
		geometry(700, 400);
		await until(() => log.scrollTop === 200);
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
		expect(log.scrollTop).toBe(90);
		await until(() => chip(canvas.host) === null);
		canvas.turn.push(say(" and the rest of it"));
		await settle(150);
		expect(log.scrollTop).toBe(90);
	});

	/**
	 * The other half of the same field report. The reader who reaches the end of a tall
	 * entry is away from the follow point by the entry's whole overflow, so the chip
	 * drew at the true bottom — a way back to something already read, pointing down.
	 */
	it("the end of a tall entry draws no chip, because nothing is below it", async () => {
		const { canvas, log } = await pinned();
		await wheel(log, 53);
		await scrolled(log, 400);
		await until(() => chip(canvas.host) !== null);
		await scrolled(log, 900);
		await until(() => chip(canvas.host) === null);
	});

	it("a press from inside a tall entry carries the reader to the end, never back up", async () => {
		const { canvas, log } = await pinned();
		await wheel(log, 53);
		// past the follow point at 90 and short of the end at 900: the arrow points down
		// and the follow point is behind them
		await scrolled(log, 400);
		await until(() => chip(canvas.host) !== null);
		await act(async () => {
			chip(canvas.host)?.click();
		});
		expect(log.scrollTop).toBe(900);
		await until(() => chip(canvas.host) === null);
		// and following did not re-arm, so the next write leaves them where they are
		canvas.turn.push(say(" and the rest of it"));
		await settle(150);
		expect(log.scrollTop).toBe(900);
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
 * What rides with the words (#116, #119, #139).
 *
 * The strip is the promise of what the prompt will carry, so what it draws is the
 * daemon's own enriched list rather than a second reading of the canvas out here —
 * which is why the stub answers a put the way the daemon does and the tests read the
 * chips off that answer.
 */
describe("the chip strip", () => {
	it("draws every entry the daemon serves, not just the first", async () => {
		const canvas = mount();
		canvas.pointed.served = ["menu", "cart", "receipt"].map(frameEntry);
		await canvas.render();

		await until(() => chips(canvas.host).length === 3);
		expect(chips(canvas.host)).toEqual(["menu", "cart", "receipt"]);
	});

	it("collapses to a count that opens into the list when the chips would take a second line", async () => {
		const canvas = mount();
		canvas.pointed.served = [
			elementEntry("cart-title", "h1", [36, 40]),
			elementEntry("line-item", "div > div:nth-child(1)", [44, 56]),
			elementEntry("line-item", "div > div:nth-child(2)", [44, 56]),
			elementEntry("total-row", "div > div:nth-child(3)", [61, 70]),
			elementEntry("pay-button", "button", [73, 81]),
		];
		await canvas.render();

		await until(() => chips(canvas.host).length === 1);
		// one line, so five element labels are a count instead — and nothing is a
		// list of two and a number
		expect(chips(canvas.host)).toEqual(["5 elements in home"]);
		expect(chipRows(canvas.host)).toEqual([]);

		const count = canvas.host.querySelector<HTMLButtonElement>('[data-agent-chip="5 elements in home"] button');
		await act(async () => count?.click());

		// two of these five are the same string, which is the whole reason removal
		// reaches out to the canvas rather than staying in the rail
		expect(chipRows(canvas.host)).toEqual([
			"cart-title · 36-40",
			"line-item · 44-56",
			"line-item · 44-56",
			"total-row · 61-70",
			"pay-button · 73-81",
		]);
	});

	it("deselects on the canvas when a chip is dismissed", async () => {
		const canvas = mount();
		await canvas.render();

		await clickHome(canvas.host);
		await until(() => chips(canvas.host).includes("home"));
		expect(canvas.host.querySelector('[data-frame-label="home"] .text-thread')).not.toBeNull();

		const drop = chipDrop(canvas.host, "home");
		expect(drop).not.toBeNull();
		await act(async () => drop?.click());

		// the strip and the canvas never disagree: the ring goes with the chip, and
		// what the daemon is told goes with both
		expect(canvas.host.querySelector('[data-frame-label="home"] .text-thread')).toBeNull();
		await until(() => chips(canvas.host).length === 0);
		await until(() => canvas.pointed.puts.at(-1)?.frames?.length === 0);
	});

	it("draws the frame the hands stepped into as an ordinary chip with no dismiss control", async () => {
		const canvas = mount();
		await canvas.render();

		await enterHome(canvas.host);
		await until(() => chips(canvas.host).includes("home"));

		// same accent, same word, same weight as one you picked — entering is the most
		// specific act the canvas has, and the only way out of it is a mode change
		const chip = canvas.host.querySelector('[data-agent-chip="home"]');
		expect(chip?.className).toContain("bg-raised");
		expect(chip?.className).not.toContain("bg-surface");
		expect(chipDrop(canvas.host, "home")).toBeNull();
	});

	it("keeps a line under the human's words saying what was sent with them", async () => {
		const canvas = mount();
		canvas.pointed.served = ["menu", "cart"].map(frameEntry);
		await canvas.render();
		await until(() => chips(canvas.host).length === 2);

		await send(canvas.host, "make these consistent");

		const context = canvas.host.querySelector("[data-agent-context]");
		expect(context?.textContent).toBe("menu, cart");
		// and it is a record rather than a live reading: the strip moving on does not
		// rewrite what a sent turn says it carried
		canvas.pointed.served = [frameEntry("receipt")];
		await clickHome(canvas.host);
		await until(() => chips(canvas.host).includes("receipt"));
		expect(canvas.host.querySelector("[data-agent-context]")?.textContent).toBe("menu, cart");
	});

	it("says nothing under words that carried nothing", async () => {
		const canvas = mount();
		await canvas.render();

		await send(canvas.host, "start a habit tracker");

		expect(canvas.host.querySelector("[data-agent-context]")).toBeNull();
	});
});

describe("an attached image", () => {
	it("rides with the words as bytes and shows what was sent", async () => {
		const canvas = mount();
		await canvas.render();

		await paste(canvas.host, shot());
		expect(canvas.host.querySelector("[data-agent-attached] img")).not.toBeNull();

		await send(canvas.host, "match this");

		const sent = canvas.turn.attachments.at(-1);
		expect(sent?.media).toBe("image/png");
		// the bytes themselves, base64: a browser never reveals a path, so there is
		// nothing else this could be
		expect(sent?.data).toBe("iVBORw0KGgoBAgM=");
		// the receipt is the picture, because a line of mono cannot audit one
		expect(canvas.host.querySelector('[data-agent-log] img[src^="data:image/png;base64,"]')).not.toBeNull();
		// and the composer is empty again: the reference went out with the message
		expect(canvas.host.querySelector("[data-agent-attached]")).toBeNull();
	});

	it("arrives from a drag the browser is still holding, and only from one carrying a picture", async () => {
		const canvas = mount();
		await canvas.render();

		// accepting the drag is the whole of it: without this the browser refuses the
		// drop and navigates to the file instead
		expect(await dragOver(canvas.host, [{ kind: "file", type: "image/png" }])).toBe(true);
		expect(await dragOver(canvas.host, [{ kind: "string", type: "text/plain" }])).toBe(false);
		expect(await dragOver(canvas.host, [{ kind: "file", type: "application/pdf" }])).toBe(false);

		await drop(canvas.host, shot());
		await until(() => canvas.host.querySelector("[data-agent-attached]") !== null);
	});

	it("is not taken at all when it is one the agent could not be sent", async () => {
		const canvas = mount();
		await canvas.render();

		// the composer refuses exactly what the daemon refuses, so a tile never draws
		// for something a turn would be turned away for
		await drop(canvas.host, new File([new Uint8Array([1, 2])], "logo.svg", { type: "image/svg+xml" }));
		await settle(60);
		expect(canvas.host.querySelector("[data-agent-attached]")).toBeNull();

		await send(canvas.host, "match this");
		expect(canvas.turn.attachments.at(-1)).toBeUndefined();
	});

	it("can be taken back with the ✕ before it goes", async () => {
		const canvas = mount();
		await canvas.render();

		await paste(canvas.host, shot());
		const drop = canvas.host.querySelector<HTMLButtonElement>('[aria-label="drop the attached image"]');
		await act(async () => drop?.click());

		expect(canvas.host.querySelector("[data-agent-attached]")).toBeNull();
		await send(canvas.host, "never mind");
		expect(canvas.turn.attachments.at(-1)).toBeUndefined();
	});

	/** 44px is enough to recognise a picture and not enough to check one */
	it("goes up at size on a press, and the press is not the way back", async () => {
		const canvas = mount();
		await canvas.render();

		await paste(canvas.host, shot());
		await act(async () => {
			canvas.host
				.querySelector<HTMLImageElement>("[data-agent-attached] img")
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// the same overlay a tool call's screenshot is held up in, with the same way out
		const held = canvas.host.querySelector<HTMLElement>("[data-agent-lightbox]");
		expect(held?.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,iVBORw0KGgoBAgM=");
		expect(held?.textContent).toContain("esc");
		// and looking at it is not dropping it: the ✕ is the only thing that does that
		expect(canvas.host.querySelector("[data-agent-attached]")).not.toBeNull();

		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
		});
		expect(canvas.host.querySelector("[data-agent-lightbox]")).toBeNull();
		expect(canvas.host.querySelector("[data-agent-attached]")).not.toBeNull();

		await send(canvas.host, "match this");
		expect(canvas.turn.attachments.at(-1)?.data).toBe("iVBORw0KGgoBAgM=");
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

	it("keeps the composer live beside it, and prose sent there answers", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot the receipt");

		ask(canvas);
		await until(() => options(canvas.host).length === 2);

		// the field is the path the tool prefers: it tests a typed sentence before the
		// picked ones and tells the agent to follow what the person actually said
		expect(field(canvas.host)?.placeholder).toBe("or say it in your own words");
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
		expect(dismiss?.textContent).toBe("dismiss");
		await act(async () => dismiss?.click());

		expect(canvas.turn.answers.at(-1)).toEqual({ request: "req-q", reply: { kind: "deny" } });
	});

	/**
	 * The clock is read off the arriving edge of a message, which is the one thing in this
	 * rail that is paced by it: a running clock spends a whole delta inside 250ms, so a
	 * message still short of its own end after 700ms is a clock that never moved.
	 */
	it("stops the clock while it waits and never answers for anybody", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot the receipt");
		canvas.turn.push({ kind: "waiting", parent: null });
		canvas.turn.push(speaking);
		canvas.turn.push(say(LONG));
		// the edge has to be somewhere before the question stops it, or a frozen clock at
		// zero would pass this by drawing nothing at all
		await until(() => arriving(canvas.host).length > 0);
		ask(canvas);
		await until(() => options(canvas.host).length === 2);
		expect(arriving(canvas.host).length).toBeLessThan(LONG.length);
		await settle(700);

		// the words are not arriving while somebody decides, so 700ms later some of the
		// message is still on its way — and nothing spool runs ever submits an answer
		const held = arriving(canvas.host);
		expect(held.length).toBeGreaterThan(0);
		expect(held.length).toBeLessThan(LONG.length);
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
		// and the composer is a composer again
		expect(field(canvas.host)?.placeholder).toBe("say what to change");
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
		expect(options(canvas.host)).toEqual(["allow", "always, for this thread", "deny"]);
		expect(canvas.host.querySelector("[data-agent-dismiss]")).toBeNull();

		const always = canvas.host.querySelector<HTMLButtonElement>('[data-agent-option="always, for this thread"]');
		await act(async () => always?.click());
		expect(canvas.turn.answers.at(-1)).toEqual({ request: "req-a", reply: { kind: "always" } });
	});

	it("offers no always where the request suggested no rule", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot the receipt");

		canvas.turn.push(approval({ suggestions: [] }));
		await until(() => options(canvas.host).length > 0);

		// absent rather than dead: spool never composes a rule of its own to fill it
		expect(options(canvas.host)).toEqual(["allow", "deny"]);
	});

	it("is never answered by typing, because no sentence answers may I run this", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot the receipt");

		canvas.turn.push(approval());
		await until(() => options(canvas.host).length > 0);

		// the field is a field, not a way of allowing something: typing "wait, don't"
		// at an approval must never be the thing that lets the command through
		expect(field(canvas.host)?.placeholder).toBe("say what to change");
		await send(canvas.host, "wait, do not run that");

		expect(canvas.turn.answers).toEqual([]);
		// and parked is not finished, so the press is refused rather than spawning a
		// second agent into a turn that is still holding the repo
		expect(canvas.turn.prompts).toEqual(["shoot the receipt"]);
		expect(canvas.host.querySelector("[data-agent-log]")?.textContent).not.toContain("wait, do not run that");
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
		await until(() => canvas.host.querySelector("[data-agent-ask]")?.getAttribute("data-agent-ask") === "dropped");

		// the clock has to come back with the drop, or the message stamped after it would
		// sit at zero characters forever: nothing left arriving, and the whole of it drawn
		await until(() => canvas.host.querySelector("[data-agent-prose]") === null);
		expect(log(canvas.host)).toContain(LONG);
	});
});

/**
 * Stopping a turn, and saying the next thing without stopping it (#165, #170, #176).
 *
 * One invariant spans them and is what makes them one thing to test: words that leave
 * the queue un-fired land back in the box. A stop cancels the queue and hands the
 * words back, and taking one back by hand is the same act with the same outcome.
 */

/** the press in the footer, which is the exit that works from wherever the eyes are */
const stopPress = (host: HTMLElement) =>
	[...host.querySelectorAll<HTMLButtonElement>('[aria-label="Agent"] button')].find(
		(button) => button.textContent?.startsWith("stop") === true,
	) ?? null;

/** every message waiting in the composer, in the order it will fire */
const queuedRows = (host: HTMLElement) =>
	[...host.querySelectorAll("[data-agent-queued] p")].map((row) => row.textContent);

/**
 * The stroke every row's mark actually draws, in the log's own order.
 *
 * A settled mark holds both strokes so the dash offset has something mounted to run
 * on, and the one it means is the one it lets be seen — so the marks are read off
 * opacity rather than off the path list, which would count a cross's spare stroke
 * against every row that is not one.
 */
const drawnStrokes = (host: HTMLElement) =>
	[...host.querySelectorAll<SVGPathElement>("[data-agent-row] path")]
		.filter((stroke) => stroke.style.opacity === "1")
		.map((stroke) => stroke.getAttribute("d"));

async function pressEscape(host: HTMLElement, where: "composer" | "canvas") {
	// the target is the whole of the difference: the hotkey dispatch returns on any
	// keydown born in a text field, so a press in the composer never reaches the ladder
	const target = where === "composer" ? field(host) : host.querySelector<HTMLElement>('[role="application"]');
	if (target === null) throw new Error("nowhere to press");
	await act(async () => {
		target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
	});
}

/** a turn in flight, which is the only state either of these controls exists in */
async function running(canvas: ReturnType<typeof mount>, prompt = "start a habit tracker") {
	await canvas.render();
	await send(canvas.host, prompt);
	canvas.turn.push(waiting);
	canvas.turn.push(speaking);
	await settle();
}

describe("stopping a turn", () => {
	it("stops it on a press in the composer footer", async () => {
		const canvas = mount();
		await running(canvas);

		const press = stopPress(canvas.host);
		expect(press).not.toBeNull();
		await act(async () => press?.click());

		expect(canvas.turn.stops).toHaveLength(1);
	});

	it("stops it on escape from the composer, where the key was going nowhere", async () => {
		const canvas = mount();
		await running(canvas);

		// the canvas ignores every key while focus is in a text field, and Enter leaves
		// focus here — so escape has been thrown away at the exact moment a turn runs
		await pressEscape(canvas.host, "composer");

		expect(canvas.turn.stops).toHaveLength(1);
	});

	it("draws what it caught as stopped, and never echoes the notice back at you", async () => {
		const canvas = mount();
		await running(canvas);
		// two reads open, which is the shape the capture holds: one whose block closed and
		// gets only the synthetic rejection, one cut mid-argument with no result at all
		canvas.turn.push(called("t1", "Read", { file_path: "/project/CLAUDE.md" }));
		canvas.turn.push({ kind: "call", id: "t2", block: 1, tool: "Read", parent: null });
		await act(async () => stopPress(canvas.host)?.click());

		// the aftermath the interrupt leaves: the caught call is stamped with the same
		// denial kind a permission decline gets, so the error alone cannot tell them apart
		canvas.turn.push(settled("t1", { failed: true, nonExecution: "user-rejected" }));
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

		// the half-typed one is a bare verb with no subject, which is beat one of three
		expect(rows(canvas.host)).toEqual(["read CLAUDE.md", "read"]);
		// one flat stroke each and nothing else drawn anywhere: a check is two strokes
		// meeting, a cross two crossing, and spool never says something errored when it
		// simply never ran
		expect(drawnStrokes(canvas.host)).toEqual(["M4.4 7h5.2", "M4.4 7h5.2"]);
		// spool says its own word for the boundary, and never the binary's note: that one
		// is addressed to the model, and echoing it reports your own press back at you
		const log = canvas.host.querySelector("[data-agent-log]")?.textContent ?? "";
		expect(log).toContain("stopped");
		expect(log).not.toContain("[Request interrupted by user]");
	});

	it("stops it on escape from the canvas, once the ladder out there has nothing to say", async () => {
		const canvas = mount();
		await running(canvas);
		// clicking out to watch a frame repaint is the state this whole rail is built
		// for, and it gives the key back to the canvas
		await clickHome(canvas.host);
		await settle(50);

		// the frame the click selected is the first rung, and it goes first
		await pressEscape(canvas.host, "canvas");
		expect(canvas.turn.stops).toHaveLength(0);

		await pressEscape(canvas.host, "canvas");
		expect(canvas.turn.stops).toHaveLength(1);
	});

	it("is offered against a turn that is still a process, and against nothing else", async () => {
		const canvas = mount();
		await canvas.render();

		// nothing has been said, so there is nothing to stop
		expect(stopPress(canvas.host)).toBeNull();

		await send(canvas.host, "shoot the receipt");
		canvas.turn.push(waiting);
		await settle();
		expect(stopPress(canvas.host)).not.toBeNull();

		// a parked turn is spending nothing and moving nowhere, and it is still a process
		// standing in the repo: the question's own dismiss answers the question, and this is
		// the only way out of the turn behind it (#234)
		canvas.turn.push({ kind: "called", id: "c1", tool: "Bash", input: { command: "spool upgrade" }, parent: null });
		canvas.turn.push({
			kind: "asking",
			request: "req-1",
			call: "c1",
			tool: "Bash",
			display: "Bash",
			input: { command: "spool upgrade" },
			description: "Upgrade the spool CLI",
			interaction: false,
			suggestions: [],
			parent: null,
		});
		await until(() => canvas.host.querySelector("[data-agent-ask]") !== null);
		expect(stopPress(canvas.host)).not.toBeNull();

		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle();
		expect(stopPress(canvas.host)).toBeNull();
	});

	/**
	 * A queue behind an unanswered question had no bulk exit at all (#170, #234).
	 *
	 * The press was not drawn and escape returned before it reached anything, so the only
	 * way out was answering a question you had parked precisely because you did not want to
	 * — or taking the messages back one ✕ at a time.
	 */
	it("stops a turn parked on a question, and hands its queue back", async () => {
		const canvas = mount();
		await running(canvas);
		await send(canvas.host, "hold off on add-habit");
		canvas.turn.push({ kind: "called", id: "c1", tool: "Bash", input: { command: "rm -rf build" }, parent: null });
		canvas.turn.push({
			kind: "asking",
			request: "req-1",
			call: "c1",
			tool: "Bash",
			display: "Bash",
			input: { command: "rm -rf build" },
			description: "Remove the build folder",
			interaction: false,
			suggestions: [],
			parent: null,
		});
		await until(() => canvas.host.querySelector("[data-agent-ask]") !== null);

		await pressEscape(canvas.host, "composer");

		expect(canvas.turn.stops).toHaveLength(1);
		expect(field(canvas.host)?.value).toBe("hold off on add-habit");
		expect(queuedRows(canvas.host)).toEqual([]);
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
		// it stacks inside the composer, dimmed, with a mono `queued` and a take-back
		expect(queuedRows(canvas.host)).toEqual(["hold off on add-habit until i've seen home"]);
		const row = canvas.host.querySelector("[data-agent-queued]");
		expect(row?.querySelector("p")?.className).toContain("text-text/45");
		expect(row?.textContent).toContain("queued");
		expect(row?.querySelector('button[aria-label^="take back"]')).not.toBeNull();
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

	it("caps its own height and scrolls inside itself rather than taking the log's room", async () => {
		const canvas = mount();
		await running(canvas);
		for (const words of ["one", "two", "three", "four", "five", "six"]) await send(canvas.host, words);

		expect(queuedRows(canvas.host)).toHaveLength(6);
		// the composer grows upward, so a queue with no ceiling is a transcript pushed off
		// the top of the rail: the cost of holding words on screen lands here instead
		const box = canvas.host.querySelector<HTMLElement>("[data-agent-queue]");
		expect(box?.style.maxHeight).toBe("164px");
		expect(box?.className).toContain("overflow-y-auto");
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

/* ---------- the threads, and what survives a restart (#120, #136, #200, #205) ---------- */

/** the column's cells, in the order it lays them out: newest at the top, fixed once */
const cells = (host: HTMLElement) =>
	[...host.querySelectorAll("[data-agent-thread]")].map((cell) => cell.getAttribute("data-agent-thread"));

const cell = (host: HTMLElement, name: string) => host.querySelector<HTMLElement>(`[data-agent-thread="${name}"]`);

/** the column itself, which is 34px of the rail's own width whatever is in it */
const spine = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-agent-threads]");

const lifeOfCell = (host: HTMLElement, name: string) => cell(host, name)?.getAttribute("data-agent-thread-life");

/** the thread you are in, which is the one place a name is written */
const nameplate = (host: HTMLElement) => host.querySelector("[data-agent-nameplate]")?.textContent ?? "";

/** the ring, the disc and the dot, counted inside the mark's own 14px box */
const marks = (host: HTMLElement, name: string) => {
	const mark = cell(host, name)?.querySelector("[data-agent-mark]");
	return {
		turning: mark?.querySelectorAll(".animate-agent-spin").length ?? 0,
		drawn: mark?.children.length ?? 0,
	};
};

async function press(element: Element | null | undefined) {
	if (element === null || element === undefined) throw new Error("nothing to press");
	await act(async () => {
		element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
}

const openCell = (host: HTMLElement, name: string) => press(cell(host, name));

/** the thread under the pointer, arriving over the log because the cell cannot hold it */
async function point(host: HTMLElement, name: string) {
	await hover(cell(host, name));
	return host.querySelector<HTMLElement>("[data-agent-flyout]");
}

/** the ✕, which is in the flyout because a 34px cell has room for one hit target */
const closeThread = async (host: HTMLElement, name: string) => {
	await point(host, name);
	await press(host.querySelector(`[data-agent-thread-close="${name}"]`));
};

const newThread = (host: HTMLElement) => press(host.querySelector('[aria-label="New thread"]'));

/** the words in the log, which is how a test says whose transcript is on screen */
const log = (host: HTMLElement) => host.querySelector("[data-agent-log]")?.textContent ?? "";

const camera = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-canvas-camera]")?.style.transform ?? "";

/** one whole turn, answered and settled, in the stream that is open */
async function answerTurn(stream: { push: (event: AgentEvent) => void; close: () => void }, text: string) {
	stream.push(waiting);
	stream.push(speaking);
	stream.push({ kind: "said", text, parent: null });
	stream.push(ended);
	stream.push(closed);
	stream.close();
	await settle();
}

/**
 * A thread as the daemon serves one back, which is spool's own drawing off disk.
 *
 * `frame` is what its one row edited, and it is a parameter because that is the thread's
 * name now (#205): two fixtures that both edited `home` are two threads called `home`, and
 * a test that cannot tell them apart is asserting nothing about which one it opened.
 */
function storedThread({
	frame = "home",
	...over
}: Partial<ServedThread> & { id: string; ask: string; frame?: string }): ServedThread {
	return {
		life: "read",
		at: 1_700_000_000_000,
		entries: [
			{ key: "u0", kind: "user", text: over.ask, context: null, attached: null },
			{
				key: "row:t1",
				kind: "row",
				state: "done",
				verb: "edit",
				subject: frame,
				detail: `design/frames/${frame}/frame.tsx`,
				frame,
				count: 1,
				shot: null,
				foreign: null,
				parent: null,
				delegated: [],
			},
			/*
			 * The schedule the message arrived on, kept in the fixture on purpose.
			 *
			 * Every real streamed message has one, and it is milliseconds from *that* turn's
			 * send. A restored thread has no clock to read it against — the daemon that held one
			 * is gone — so a picture that came back still carrying its schedule drew as no
			 * characters at all, which is the one way "restored is identical to live" can fail
			 * silently.
			 */
			{
				key: "p0",
				kind: "prose",
				full: "The header is tighter now.",
				landed: [{ at: 4200, upto: 26 }],
				settled: true,
			},
		],
		kept: 3,
		plan: null,
		queued: [],
		draft: "",
		stopped: false,
		closed: false,
		continuable: true,
		live: false,
		...over,
	};
}

const ONE = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";
const TWO = "2a1b3c4d-5e6f-4788-9900-112233445566";

/** a project with as many restored threads in it as asked for, each named by its own frame */
const written = (count: number): ServedThread[] =>
	Array.from({ length: count }, (_, at) =>
		storedThread({ id: `thread-${at}`, ask: `ask ${at}`, frame: `frame-${at}`, at }),
	);

describe("the threads column", () => {
	it("opens on one thread, named above the log rather than in the column", async () => {
		const canvas = mount();
		await canvas.render();

		expect(cells(canvas.host)).toEqual(["new thread"]);
		// nothing in the column is a name: a cell is a mark, and the name is on the nameplate
		expect(cell(canvas.host, "new thread")?.textContent).toBe("");
		expect(nameplate(canvas.host)).toBe("new thread");
		// the accent says which of several is open, so with one thread there is no which
		expect(canvas.host.querySelector('[data-agent-thread="new thread"] .bg-thread')).toBeNull();
	});

	/**
	 * The claim the column is for: what it costs does not move with the number of threads.
	 *
	 * The row's did. #136 measured four names at 112px each and called that the floor, so a
	 * fifth thread was already scrolling under a fade. Nothing here is laid out — happy-dom
	 * computes no boxes — so what is asserted is the part that would have to move first:
	 * every thread has a cell of its own, none is elided into an overflow, and the number of
	 * them reaches neither the rail's width nor the column's.
	 */
	it.each([1, 4, 12])("draws %i threads without widening anything", async (count) => {
		const canvas = mount();
		canvas.stored.served = written(count);
		await canvas.render();
		await settle();

		expect(cells(canvas.host)).toHaveLength(count);
		// every one of them is in it: nothing overflows into a menu and nothing is elided
		expect(cells(canvas.host)).toContain(`frame-${count - 1}`);
		expect(cells(canvas.host)).toContain("frame-0");
		// 34 is the ticket's own number, pinned here rather than read back off the component
		expect(spine(canvas.host)?.style.width).toBe("34px");
		expect(rail(canvas.host)?.style.width).toBe("420px");
	});

	/** the name is what it wrote, derived on read: no call, no invention, nothing to store */
	it("names a thread by the frames it wrote", async () => {
		const canvas = mount();
		canvas.stored.served = [storedThread({ id: ONE, ask: "tighten the header", frame: "home" })];
		await canvas.render();
		await settle();

		expect(cells(canvas.host)).toEqual(["home"]);
		expect(nameplate(canvas.host)).toBe("home");
		// the record on disk keeps the ask, which is a different fact and still true
		expect(canvas.stored.served[0]?.ask).toBe("tighten the header");
	});

	/** a thread that has written nothing is still its ask: a better name where there is one */
	it("falls back to the ask until the thread has written something", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home and fix whatever reads wrong");
		await settle();

		expect(nameplate(canvas.host)).toBe("shoot home and fix whatever reads wrong");
		expect(cells(canvas.host)).toEqual(["shoot home and fix whatever reads wrong"]);
	});

	it("holds many conversations and switches between them in one press", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "The header is tighter now.");

		await newThread(canvas.host);
		await send(canvas.host, "write the swedish copy deck");
		await answerTurn(canvas.turn.streams[1] as Stream, "The copy deck landed.");

		// newest at the top, and each turn ran under its own thread
		expect(cells(canvas.host)).toEqual(["write the swedish copy deck", "tighten the header"]);
		expect(canvas.turn.streams[0]?.thread).not.toBe(canvas.turn.streams[1]?.thread);
		expect(log(canvas.host)).toContain("The copy deck landed.");

		await openCell(canvas.host, "tighten the header");

		expect(log(canvas.host)).toContain("The header is tighter now.");
		expect(log(canvas.host)).not.toContain("The copy deck landed.");
		expect(nameplate(canvas.host)).toBe("tighten the header");
	});

	/**
	 * A thread is a conversation in a project rather than a conversation about a place, so
	 * there is nowhere for a switch to move to. It is why the deck carries no page at all.
	 */
	it("leaves the canvas exactly where it is", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "done.");
		await newThread(canvas.host);
		await send(canvas.host, "write the copy deck");
		await answerTurn(canvas.turn.streams[1] as Stream, "done.");

		const before = camera(canvas.host);
		const frames = [...canvas.host.querySelectorAll("[data-frame-label]")].map((frame) =>
			frame.getAttribute("data-frame-label"),
		);

		await openCell(canvas.host, "tighten the header");

		expect(camera(canvas.host)).toBe(before);
		expect(
			[...canvas.host.querySelectorAll("[data-frame-label]")].map((frame) => frame.getAttribute("data-frame-label")),
		).toEqual(frames);
	});
});

describe("the thread under the pointer", () => {
	/** the cell cannot name anything, so the hover is the whole of the answer */
	it("arrives over the log with the name, the last line, the age and the ✕", async () => {
		const canvas = mount();
		canvas.stored.served = [
			storedThread({ id: ONE, ask: "tighten the header", frame: "home", at: Date.now() - 5 * 60_000 }),
		];
		await canvas.render();
		await settle();

		const shown = await point(canvas.host, "home");

		expect(shown?.textContent).toContain("home");
		// the last line it drew, in the rail's own nouns rather than the tool's words
		expect(shown?.textContent).toContain("edit home");
		expect(shown?.textContent).toContain("5m");
		expect(shown?.querySelector('[data-agent-thread-close="home"]')).not.toBeNull();
	});

	it("says so when a thread has drawn no line yet", async () => {
		const canvas = mount();
		await canvas.render();

		expect((await point(canvas.host, "new thread"))?.textContent).toContain("nothing yet");
	});

	/** a caret opens the same flyout a pointer does, and takes it away again on the way out */
	it("goes when the caret leaves the cell that opened it", async () => {
		const canvas = mount();
		await canvas.render();
		const one = cell(canvas.host, "new thread");
		await act(async () => one?.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		expect(canvas.host.querySelector("[data-agent-flyout]")).not.toBeNull();

		await act(async () => one?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

		expect(canvas.host.querySelector("[data-agent-flyout]")).toBeNull();
	});

	/**
	 * The caret's own route to the ✕ (#207).
	 *
	 * The close is in the flyout because a 34px cell has room for one hit target, and that left
	 * it pointer-only for as long as the flyout was drawn after the whole column: tabbing off a
	 * cell reached the next cell, never the close the cell had just opened. The flyout belongs
	 * to its cell in the markup now, so the stop after a cell is its own ✕.
	 */
	it("puts the ✕ one stop after the cell that opened it, and holds it there", async () => {
		const canvas = mount();
		await canvas.render();
		const one = cell(canvas.host, "new thread");
		await act(async () => one?.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		const shown = canvas.host.querySelector("[data-agent-flyout]");
		expect(one?.nextElementSibling).toBe(shown);

		// a caret moving into the flyout is not a caret leaving the thread
		const close = shown?.querySelector<HTMLElement>('[data-agent-thread-close="new thread"]') ?? null;
		await act(async () => {
			one?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: close }));
		});
		expect(canvas.host.querySelector("[data-agent-flyout]")).not.toBeNull();

		// and leaving the ✕ for anything else is
		await act(async () => close?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect(canvas.host.querySelector("[data-agent-flyout]")).toBeNull();
	});

	it("goes when the pointer leaves the column", async () => {
		const canvas = mount();
		await canvas.render();
		await point(canvas.host, "new thread");

		await act(async () => {
			spine(canvas.host)?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
			spine(canvas.host)?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
		});

		expect(canvas.host.querySelector("[data-agent-flyout]")).toBeNull();
	});
});

describe("a thread's mark", () => {
	/**
	 * All five lives draw, and the two working ones draw the same thing.
	 *
	 * The cell is the only place a column says whether a thread is moving, and the thread
	 * you are looking at is the one you are most likely to be waiting on. Leaving it blank
	 * left an empty square next to neighbours that all carried a mark, which reads as a
	 * fault rather than as a distinction.
	 */
	it("turns for the thread in the rail while its turn runs", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		canvas.turn.push(waiting);
		await settle();

		expect(lifeOfCell(canvas.host, "tighten the header")).toBe("streaming");
		expect(marks(canvas.host, "tighten the header").turning).toBe(1);
	});

	it("turns for a thread working somewhere you are not looking", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "three takes on the empty cart");
		canvas.turn.push(waiting);
		await settle();
		await newThread(canvas.host);

		expect(lifeOfCell(canvas.host, "three takes on the empty cart")).toBe("running");
		expect(marks(canvas.host, "three takes on the empty cart").turning).toBe(1);
		// and the stream it left behind is still open, which is the whole point
		expect(canvas.turn.streams[0]?.aborted()).toBe(false);
	});

	it("is a solid dot once a thread lands where nobody was looking, and clears on a look", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push(waiting);
		await settle();
		await newThread(canvas.host);

		await answerTurn(canvas.turn.streams[0] as Stream, "Home is shot.");
		expect(lifeOfCell(canvas.host, "shoot home")).toBe("unread");

		await openCell(canvas.host, "shoot home");
		// opening a thread is what reads it, wherever the opening happened
		expect(lifeOfCell(canvas.host, "shoot home")).toBe("read");
	});

	it("keeps a collapsed read thread pressable with a hollow dot", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		await answerTurn(canvas.turn.streams[0] as Stream, "Home is shot.");
		await newThread(canvas.host);

		// out here the mark is the thread, and a thread you cannot see is one you cannot
		// press, so read falls back to the strength a disabled thing gets
		expect(lifeOfCell(canvas.host, "shoot home")).toBe("read");
		expect(marks(canvas.host, "shoot home").drawn).toBe(1);
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

		expect(lifeOfCell(canvas.host, "pick a direction")).toBe("waiting");
		// nothing turns: the thread has stopped and is costing nothing
		expect(marks(canvas.host, "pick a direction").turning).toBe(0);
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

		expect(lifeOfCell(canvas.host, "tidy the repo")).toBe("waiting");
	});

	it("draws the disc for a signed-out bounce, in the binary's own words", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push({ kind: "closed", code: 1, message: "Not logged in · Please run /login", parent: null });
		canvas.turn.close();
		await settle();

		expect(lifeOfCell(canvas.host, "shoot home")).toBe("waiting");
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

		expect(lifeOfCell(canvas.host, "three takes on the cart")).toBe("running");
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
		expect(lifeOfCell(canvas.host, "pick a direction")).toBe("waiting");

		await openCell(canvas.host, "pick a direction");

		expect(lifeOfCell(canvas.host, "pick a direction")).toBe("waiting");
	});
});

describe("what survives a restart", () => {
	it("restores every thread the daemon kept, identical to a live one", async () => {
		const canvas = mount();
		canvas.stored.served = [
			storedThread({ id: ONE, ask: "tighten the header", frame: "home", at: 10 }),
			storedThread({ id: TWO, ask: "write the copy deck", frame: "copy-deck", at: 20 }),
		];
		await canvas.render();
		await settle();

		expect(cells(canvas.host)).toEqual(["copy-deck", "home"]);
		// the picture is the whole of it: nothing capped, nothing elided, the same view
		expect(log(canvas.host)).toContain("write the copy deck");
		expect(log(canvas.host)).toContain("The header is tighter now.");
		expect(canvas.host.querySelector('[data-agent-row="edit copy-deck"]')).not.toBeNull();
		/*
		 * And it is *drawn*, rather than sitting in the invisible reserve a message still
		 * arriving holds. A restored message has no clock to be paced against, so both of
		 * the live edge's boxes have to be absent: an arriving copy with nothing in it and a
		 * reserve holding the text it cannot reach is exactly what a schedule read against a
		 * clock that starts again at zero produces.
		 */
		expect(canvas.host.querySelector("[data-agent-prose]")).toBeNull();
		expect(canvas.host.querySelector("[data-agent-reserve]")).toBeNull();
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
					{ key: "u0", kind: "user", text: "three takes on the cart", context: null, attached: null },
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
		expect(field(canvas.host)?.placeholder).toBe("say what to change · this starts a new thread");
		expect(rail(canvas.host)?.textContent).not.toMatch(/resume/i);

		await send(canvas.host, "and now the receipt");
		await settle();

		// a new thread, rather than a resume that would fail. The words that started it are
		// its name until it writes something; the restored one is called what it wrote
		expect(canvas.turn.streams[0]?.thread).not.toBe(ONE);
		expect(cells(canvas.host)).toEqual(["and now the receipt", "home"]);
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
		await until(() => arriving(canvas.host) === "");

		await send(canvas.host, "and now the receipt");
		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push(say("Receipt is next."));
		await settle(120);

		// the first turn is settled text with no live boxes of its own, under the second
		expect(log(canvas.host)).toContain(MESSAGE);
		expect(log(canvas.host)).toContain("tighten the header");
		expect(log(canvas.host)).toContain("and now the receipt");
		// and exactly one message is arriving: the one that is
		expect(canvas.host.querySelectorAll("[data-agent-prose]")).toHaveLength(1);
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
		expect(cells(canvas.host)).toEqual(["home"]);
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

describe("closing a thread", () => {
	it("takes the tab out of the strip and deletes neither the session nor the picture", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "done.");
		await newThread(canvas.host);
		await send(canvas.host, "write the copy deck");
		await answerTurn(canvas.turn.streams[1] as Stream, "done.");

		await closeThread(canvas.host, "tighten the header");

		expect(cells(canvas.host)).toEqual(["write the copy deck"]);
		// its own door, which writes one flag: nothing here is a delete
		expect(canvas.stored.closed).toEqual([canvas.turn.streams[0]?.thread]);
	});

	it("opens the newest of what is left when the open one is closed", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "The header is tighter now.");
		await newThread(canvas.host);
		await send(canvas.host, "write the copy deck");
		await answerTurn(canvas.turn.streams[1] as Stream, "The copy deck landed.");

		await closeThread(canvas.host, "write the copy deck");

		expect(cells(canvas.host)).toEqual(["tighten the header"]);
		expect(log(canvas.host)).toContain("The header is tighter now.");
	});

	/** a tab nobody can reach must not go on holding a process the hands cannot see */
	it("stops the turn the tab was holding, and not only the read of it", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "three takes on the cart");
		canvas.turn.push(waiting);
		await settle();
		await newThread(canvas.host);
		expect(canvas.turn.streams[0]?.aborted()).toBe(false);

		await closeThread(canvas.host, "three takes on the cart");
		await settle();

		expect(canvas.turn.streams[0]?.aborted()).toBe(true);
		// and the process with it: a turn outlives the read of it now (#211), so dropping the
		// read is no longer what stops one — the stop has to be asked for
		expect(canvas.turn.stops).toHaveLength(1);
	});

	it("leaves a fresh thread behind when the last one is closed", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "done.");

		await closeThread(canvas.host, "tighten the header");

		expect(cells(canvas.host)).toEqual(["new thread"]);
		expect(field(canvas.host)?.placeholder).toBe("say what to change");
	});

	/**
	 * Words spool is holding are never thrown away, and a ✕ is not an exception (#170, #234).
	 *
	 * A stop hands its queue back into the box and a take-back hands one message back, so a
	 * close was the one exit that dropped them: the thread went, the queue went with it, and
	 * nothing said so. It lands in the composer the rail shows next, which is where the hands
	 * are about to be.
	 */
	it("hands the queue back into the composer it opens next", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "done.");
		await newThread(canvas.host);
		await send(canvas.host, "three takes on the cart");
		canvas.turn.push(waiting);
		await settle();
		await send(canvas.host, "hold off on the empty state");
		await send(canvas.host, "swedish weekday chips");
		expect(queuedRows(canvas.host)).toHaveLength(2);

		await closeThread(canvas.host, "three takes on the cart");
		await settle();

		// the thread is gone, its turn was stopped, and the words it was holding are in the
		// box in front of the person who wrote them, in the order they were going to be said
		expect(cells(canvas.host)).toEqual(["tighten the header"]);
		expect(field(canvas.host)?.value).toBe("hold off on the empty state\n\nswedish weekday chips");
		expect(queuedRows(canvas.host)).toEqual([]);
	});
});

/**
 * The box outlives the tab, because a browser is where a thing is lost by a keystroke
 * (#234).
 *
 * A stop hands a whole queue back into the composer, which makes the composer the place a
 * turn's worth of typing can be sitting — and it was memory only, so a refresh took it.
 */
describe("what the composer keeps", () => {
	it("writes the words in the box down with the thread they belong to", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "done.");

		await act(async () => {
			const box = field(canvas.host);
			if (box !== null) type(box, "and now the receipt, but only the");
		});
		// on the throttle rather than per keystroke: a PUT a character is what the throttle
		// is there to stop
		await settle(2400);

		expect(canvas.stored.puts.at(-1)?.body.draft).toBe("and now the receipt, but only the");
	});

	it("comes back to the sentence the tab went away in the middle of", async () => {
		const canvas = mount();
		canvas.stored.served = [
			storedThread({ id: ONE, ask: "tighten the header", draft: "and now the receipt, but only the" }),
		];
		await canvas.render();
		await settle();

		expect(field(canvas.host)?.value).toBe("and now the receipt, but only the");
	});
});

/* ---------- which machine is answering (#118, #122, #184, #186, #199) ----------
 * The readout is the footer's whole left half now, and it is a button. Everything in
 * the menu it opens arrives from the binary at runtime: nothing here is a table spool
 * shipped, and a press is a shortcut for `/model haiku` rather than a second source of
 * truth — so what moves the readout is the reply and never the press. */

const modelTrigger = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('[aria-label="model"]');

const modelMenu = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-agent-model-menu]");

/** every row in the menu, in the order the reply listed them */
const modelRows = (host: HTMLElement) =>
	[...host.querySelectorAll<HTMLButtonElement>("[data-agent-model-row]")].map(
		(row) => row.getAttribute("data-agent-model-row") ?? "",
	);

const modelRow = (host: HTMLElement, label: string) =>
	host.querySelector<HTMLButtonElement>(`[data-agent-model-row="${label}"]`);

/** the one slot, and what it is saying about whatever the cursor is on */
const menuSlot = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-agent-model-says]");

const usageLine = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-agent-usage]")?.textContent ?? null;

async function openModelMenu(canvas: ReturnType<typeof mount>) {
	await until(() => modelTrigger(canvas.host)?.textContent?.includes("Opus") === true);
	await act(async () => modelTrigger(canvas.host)?.click());
	await settle(50);
}

/**
 * The rail dragged to one width, which is the constraint every footer claim is about.
 *
 * The grip captures the pointer, and happy-dom has no capture to give — so it is
 * stubbed the way the drag's own test stubs it, and the gesture is three separate acts
 * because the handler reads state each time.
 */
async function resizeRail(host: HTMLElement, width: number) {
	const grip = host.querySelector<HTMLElement>('[aria-label="Resize agent"]');
	if (grip === null) throw new Error("no grip");
	grip.setPointerCapture = () => {};
	grip.releasePointerCapture = () => {};
	const from = 1000;
	const at = Number(host.querySelector<HTMLElement>('[aria-label="Agent"]')?.style.width.replace("px", "") ?? 420);
	await act(async () => {
		grip.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, button: 0, clientX: from, bubbles: true }));
	});
	await act(async () => {
		grip.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: at + from - width, bubbles: true }));
	});
	await act(async () => {
		grip.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true }));
	});
}

async function hover(target: HTMLElement | null) {
	if (target === null) throw new Error("nothing to point at");
	await act(async () => {
		target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
		target.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
	});
}

/** the effort rows and the rule above them, which answer the pointer as one block */
const effortBlock = (host: HTMLElement) => modelRow(host, "max")?.parentElement ?? null;

/** the 18px line the model and the stop share, which is what the menu is measured against */
const footerRow = (host: HTMLElement) => modelTrigger(host)?.parentElement?.parentElement ?? null;

/** the usage window as the two captures carry it: `seven_day` at 92%, resetting Wednesday */
const warned: AgentEvent = {
	kind: "limit",
	limit: {
		status: "allowed_warning",
		window: "seven_day",
		utilization: 0.92,
		resetsAt: Math.floor(Date.now() / 1000) + 38 * 3600,
		usingOverage: false,
		surpassedThreshold: 0.75,
	},
	parent: null,
};

describe("the model menu", () => {
	it("is populated by the binary rather than by a table spool ships", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);

		// five rows came back and none of them is `Opus`: the reply is what names them
		expect(modelRows(canvas.host)).toEqual([
			"Default (recommended)",
			"Opus (1M context)",
			"Fable",
			"Sonnet",
			"Haiku",
			"low",
			"medium",
			"high",
			"xhigh",
			"max",
		]);
		// and it asks again on the way open, because the answer is the installed CLI's
		expect(modelMenu(canvas.host)).not.toBeNull();
	});

	it("draws one line per row, and one slot for whatever the cursor is on", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);

		// the row is its name and nothing else, so the description cannot be printed twice
		// — which it was, word for word, on the two rows that resolve to the same model
		expect(modelRow(canvas.host, "Opus (1M context)")?.textContent).toBe("Opus (1M context)");
		expect(modelRow(canvas.host, "Default (recommended)")?.textContent).toBe("Default (recommended)");
		// with nothing pointed at, the slot describes the model that is set
		expect(menuSlot(canvas.host)?.getAttribute("data-agent-model-says")).toBe(
			"Opus 5 with 1M context · Best for everyday, complex tasks",
		);

		await hover(modelRow(canvas.host, "Sonnet"));
		expect(menuSlot(canvas.host)?.getAttribute("data-agent-model-says")).toBe(
			"Sonnet 5 · Efficient for routine tasks",
		);
		// one slot for both vocabularies, because a model value and a level cannot collide
		await hover(modelRow(canvas.host, "max"));
		expect(menuSlot(canvas.host)?.getAttribute("data-agent-model-says")).toContain("Maximum capability");
	});

	it("reserves the tallest sentence, so nothing reflows under the pointer", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);
		const slot = menuSlot(canvas.host);
		if (slot === null) throw new Error("no slot");

		// the panel opens upward, so a slot that grew would move its own top edge. What is
		// reserved is the longest thing it can ever say, which is `max` at 165 characters
		const reserved = slot.querySelector("[aria-hidden]")?.textContent ?? "";
		expect(reserved).toContain("Use sparingly for the hardest tasks.");
		await hover(modelRow(canvas.host, "low"));
		expect(slot.querySelector("[aria-hidden]")?.textContent).toBe(reserved);
		// and it is never empty: something is always set, so something is always described
		expect(slot.getAttribute("data-agent-model-says")).not.toBe("");
	});

	it("shows no effort control at all on a model that reports no levels", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);

		await act(async () => modelRow(canvas.host, "Haiku")?.click());
		await settle(50);
		await act(async () => modelTrigger(canvas.host)?.click());
		await settle(50);

		// haiku carries no `supportedEffortLevels` at all, so the control is absent rather
		// than present and inert — which makes it a fact rather than a judgement
		expect(modelRows(canvas.host)).toEqual([
			"Default (recommended)",
			"Opus (1M context)",
			"Fable",
			"Sonnet",
			"Haiku",
		]);
		expect(modelMenu(canvas.host)?.textContent).not.toContain("effort");
		// and the readout drops the level with it, because the model says it has none
		expect(modelTrigger(canvas.host)?.textContent).toContain("Haiku");
		expect(modelTrigger(canvas.host)?.textContent).not.toContain("high");
	});

	it("sends the message, and lets the reply move the readout", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);

		await act(async () => modelRow(canvas.host, "Sonnet")?.click());
		await settle(50);

		expect(canvas.offered.chose.map((one) => one.value)).toEqual(["sonnet"]);
		expect(modelTrigger(canvas.host)?.textContent).toContain("Sonnet · high");
		// the menu closes on a model, because that was the decision
		expect(modelMenu(canvas.host)).toBeNull();
		// and it went to the thread that is open, because that is what the answer is about
		expect(canvas.offered.chose[0]?.thread).toBe(canvas.offered.asked[0]);
	});

	it("is asked again per thread, because which machine is answering is one thread's fact", async () => {
		const canvas = mount();
		canvas.stored.served = [
			storedThread({ id: ONE, ask: "tighten the header", frame: "home", at: 20 }),
			storedThread({ id: TWO, ask: "write the copy deck", frame: "copy-deck", at: 10 }),
		];
		await canvas.render();
		await until(() => canvas.offered.asked.length > 0);

		await openCell(canvas.host, "copy-deck");
		await until(() => canvas.offered.asked.length > 1);

		// a project runs one thread on Opus and another on Haiku, so switching re-asks
		// rather than carrying the last thread's model across
		expect(canvas.offered.asked).toEqual([ONE, TWO]);
	});

	it("moves under the finger, a whole spawn before the binary has answered", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);
		let answer = () => {};
		canvas.offered.hold = new Promise<void>((done) => {
			answer = done;
		});

		await act(async () => modelRow(canvas.host, "Sonnet")?.click());
		await settle(50);

		// the reply is a spawn away — about a second on a cold binary — and nothing on
		// screen waits for it. The level rides across because sonnet offers it
		expect(canvas.offered.chose.map((one) => one.value)).toEqual(["sonnet"]);
		expect(modelTrigger(canvas.host)?.textContent).toContain("Sonnet · high");

		canvas.offered.hold = null;
		answer();
		await settle(50);
		// and what stays is the report, which here says the same thing the finger did
		expect(modelTrigger(canvas.host)?.textContent).toContain("Sonnet · high");
	});

	it("takes the effort with it the moment a model reporting none is pressed", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);
		let answer = () => {};
		canvas.offered.hold = new Promise<void>((done) => {
			answer = done;
		});

		await act(async () => modelRow(canvas.host, "Haiku")?.click());
		await settle(50);
		await act(async () => modelTrigger(canvas.host)?.click());
		await settle(50);

		// `Haiku · high` for the second the door is shut would be a level on a model that
		// reports no levels at all, so the press asserts the name and drops the rest
		expect(modelTrigger(canvas.host)?.textContent).toContain("Haiku");
		expect(modelTrigger(canvas.host)?.textContent).not.toContain("high");
		expect(modelRows(canvas.host)).not.toContain("max");

		canvas.offered.hold = null;
		answer();
		await settle(50);
	});

	it("puts the readout back when the binary does not take the choice", async () => {
		const canvas = mount();
		await canvas.render();
		// the report comes back unchanged, which is what an alias `list_models` never
		// offered does: the press is a claim with an expiry and never the authority
		canvas.offered.reply = (offer) => offer;
		await openModelMenu(canvas);
		let answer = () => {};
		canvas.offered.hold = new Promise<void>((done) => {
			answer = done;
		});

		await act(async () => modelRow(canvas.host, "Sonnet")?.click());
		await settle(50);
		expect(modelTrigger(canvas.host)?.textContent).toContain("Sonnet · high");

		canvas.offered.hold = null;
		answer();
		await settle(50);

		expect(canvas.offered.chose.map((one) => one.value)).toEqual(["sonnet"]);
		expect(modelTrigger(canvas.host)?.textContent).toContain("Opus (1M context) · high");
	});

	it("keeps the menu open on an effort level, because it refines the model above it", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);

		await act(async () => modelRow(canvas.host, "xhigh")?.click());
		await settle(50);

		expect(canvas.offered.chose.map((one) => one.effort)).toEqual(["xhigh"]);
		expect(modelMenu(canvas.host)).not.toBeNull();
		expect(modelTrigger(canvas.host)?.textContent).toContain("Opus (1M context) · xhigh");
	});

	it("says which variable holds the effort, and offers no level it cannot move", async () => {
		const canvas = mount();
		canvas.offered.offer = {
			models: OFFERED.models,
			current: { ...OFFERED.current, effort: "max", pin: "max" },
		};
		await canvas.render();
		await openModelMenu(canvas);

		// measured, an exported CLAUDE_CODE_EFFORT_LEVEL refuses an in-session change and
		// names itself in the refusal — so the environment outranks anything spool draws,
		// and it says so where the rows it killed are rather than over every row. The block
		// answers, not the row: a disabled control fires no mouse event at all
		await hover(effortBlock(canvas.host));
		expect(menuSlot(canvas.host)?.getAttribute("data-agent-model-says")).toBe(
			"CLAUDE_CODE_EFFORT_LEVEL=max is set in the environment",
		);
		await hover(modelRow(canvas.host, "max"));
		expect(menuSlot(canvas.host)?.getAttribute("data-agent-model-says")).toBe(
			"CLAUDE_CODE_EFFORT_LEVEL=max is set in the environment",
		);
		// and a model row still describes its model, so no sentence in the reply becomes
		// unreadable on a machine that happens to export the variable
		await hover(modelRow(canvas.host, "Sonnet"));
		expect(menuSlot(canvas.host)?.getAttribute("data-agent-model-says")).toBe(
			"Sonnet 5 · Efficient for routine tasks",
		);
		expect(modelRow(canvas.host, "low")?.disabled).toBe(true);
		expect(modelRow(canvas.host, "max")?.disabled).toBe(false);
		expect(modelTrigger(canvas.host)?.textContent).toContain("Opus (1M context) · max");
	});
});

describe("the footer the model hangs off", () => {
	it("holds the model and the stop and nothing else", async () => {
		const canvas = mount();
		await running(canvas);
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("Opus") === true);
		const footer = footerRow(canvas.host);
		if (footer === null) throw new Error("no footer");

		// 243 wanted at every width: the model, the gap and the stop. The limit went to
		// the menu and the send hint went with it (#184)
		expect(footer.textContent).toBe("Opus (1M context) · highstop⎋");
		expect(footer.textContent).not.toContain("weekly limit");
		expect(footer.textContent).not.toContain("enter to");
	});

	it("truncates the name and never shortens it, across the whole drag range", async () => {
		const canvas = mount();
		await canvas.render();
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("Opus") === true);

		for (const width of [200, 260, 300, 360, 420, 480]) {
			await resizeRail(canvas.host, width);
			expect(rail(canvas.host)?.style.width).toBe(`${width}px`);
			const name = modelTrigger(canvas.host)?.querySelector("span");
			// `Opus (1M context)` cut to `Opus` would be the correct name of a *different*
			// machine — `/model opus` resolves without the 1M window — so the string stays
			// whole in the DOM and the layout is what gives way
			expect(name?.textContent).toBe("Opus (1M context) · high");
			expect(name?.className).toContain("truncate");
			// and the model is the only thing that gives way: a cut name is still readable
			// and half a stop button is not
			expect(modelTrigger(canvas.host)?.className).toContain("min-w-0");
		}

		// and the stop, which only exists against a turn in flight, never gives way at all
		await send(canvas.host, "go");
		canvas.turn.push(waiting);
		await settle(150);
		expect(stopPress(canvas.host)?.className).toContain("shrink-0");
	});
});

describe("the usage window", () => {
	it("is absent until the binary warns, and draws no gauge below that", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");
		// at `allowed` the payload carries no utilization at all, so there is nothing to
		// draw a gauge from and nothing to say
		canvas.turn.push({
			kind: "limit",
			limit: { status: "allowed", window: "seven_day", resetsAt: 1785308400, usingOverage: false },
			parent: null,
		});
		await settle(150);
		await openModelMenu(canvas);

		expect(usageLine(canvas.host)).toBeNull();
		expect(modelMenu(canvas.host)?.textContent).not.toContain("%");

		// and nothing about overage at any status: billing spool has no relationship to
		// narrate, and it is moot anyway, since overage being on means the limit is not
		// stopping you
		canvas.turn.push({ kind: "limit", limit: { ...warned.limit, usingOverage: true }, parent: null });
		await settle(150);
		expect(usageLine(canvas.host)).toMatch(/^weekly limit 92% · resets [a-z]{3}$/);
		expect(modelMenu(canvas.host)?.textContent).not.toMatch(/overage|credit/i);
		expect(rail(canvas.host)?.textContent).not.toMatch(/overage/i);
	});

	it("renders whole inside the menu, at every rail width", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");
		canvas.turn.push(warned);
		await settle(150);
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("Opus") === true);

		for (const width of [200, 300, 420, 480]) {
			await resizeRail(canvas.host, width);
			await act(async () => modelTrigger(canvas.host)?.click());
			// the reset time is half of what the readout is for: ninety-two per cent of a
			// week is a different fact depending on whether it comes back Wednesday or in
			// an hour. In the footer at 420 it clipped to `resets…`
			expect(usageLine(canvas.host)).toMatch(/^weekly limit 92% · resets [a-z]{3}$/);
			/*
			 * And the panel fits inside the rail rather than being cut off by it.
			 *
			 * Asserted as the mechanism rather than measured, because this environment has no
			 * layout: what makes it fit is that it wants 300 and is clamped to the row it hangs
			 * off, and that the row is the composer's own width rather than the trigger's. The
			 * rail drags to a 200 floor with 171px of box and is `overflow-hidden`, so a fixed
			 * 300 anchored to the trigger has its right edge guillotined below 315.
			 */
			const panel = modelMenu(canvas.host);
			expect(panel?.style.width).toBe("300px");
			expect(panel?.className).toContain("max-w-full");
			expect(panel?.parentElement?.className).not.toContain("relative");
			expect(footerRow(canvas.host)?.contains(panel as Node)).toBe(true);
			await act(async () => modelTrigger(canvas.host)?.click());
		}
	});

	it("outlives the turn that saw it, because the window does", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");
		canvas.turn.push(warned);
		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle(150);
		await send(canvas.host, "and again");
		await settle(50);
		await openModelMenu(canvas);

		// it came back on the message before this one and it will still be true tomorrow,
		// so a new turn does not clear it
		expect(usageLine(canvas.host)).toContain("weekly limit 92%");
	});

	it("draws the wind-down across the log, because it is why the work stops early", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");
		canvas.turn.push(warned);
		await settle(150);
		expect(rail(canvas.host)?.textContent).not.toContain("winding down");

		canvas.turn.push({
			kind: "limit",
			limit: { ...warned.limit, status: "rejected", graceActive: true },
			parent: null,
		});
		await settle(150);

		// the agent has been told to finish or checkpoint and start nothing new, and
		// without a line saying so the delegation it announced and never made reads as the
		// agent losing the thread
		expect(rail(canvas.host)?.textContent).toContain("usage limit reached · winding down");
		await openModelMenu(canvas);
		expect(usageLine(canvas.host)).toContain("weekly limit hit");
	});
});

/* ---------- the two ways there is no agent to talk to (#127, #201) ----------
 * Both are ordinary states of the rail rather than error paths, because spool spawns the
 * developer's own binary and reuses whatever login is already there. They are drawn as
 * different shapes because they are not knowable in the same way: whether a command is on
 * PATH is a fact about this machine, so it is known before anybody types and it is a wall;
 * whether it is signed in is a fact inside another product, so it is found out by spawning
 * and it is a strip over a log that still works. */

/** the wall, in the transcript's place */
const wall = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-agent-wall]");

/** the standing half of being signed out, on the shelf */
const outStrip = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-agent-login]");

/** the one control either of these states offers, pressed and given time to answer */
async function checkAgain(within: HTMLElement | null) {
	await press(within?.querySelector("[data-agent-check]"));
	await settle(100);
}

/** how many times the log holds one sentence, which for a held prompt has to be once */
const said = (host: HTMLElement, text: string) =>
	(host.querySelector("[data-agent-log]")?.textContent?.split(text).length ?? 1) - 1;

/** the binary's own refusal, as the runner hands it back off a non-zero exit */
const refused: AgentEvent = {
	kind: "closed",
	code: 1,
	message: "Not logged in · Please run /login",
	parent: null,
};

describe("no agent on this machine", () => {
	it("draws a wall in the transcript's place before the first keystroke", async () => {
		const canvas = mount();
		canvas.preflight.installed = false;
		await canvas.render();
		await settle(50);

		expect(wall(canvas.host)?.textContent).toContain("no claude on this machine");
		expect(canvas.host.querySelector("[data-agent-log]")).toBeNull();
		// the docs root is the binary's own, and the sentence about why is spool's
		expect(wall(canvas.host)?.textContent).toContain("code.claude.com/docs");
		// nothing was sent, and nothing was asked about a login either: this state is
		// answered by looking, and looking is free
		expect(canvas.turn.prompts).toEqual([]);
		expect(canvas.preflight.asked).toBe(0);
	});

	/**
	 * The composer stays and it is dead: take it away and the rail is a sentence with no
	 * evidence of what the rail is for, leave it live and it collects a prompt for nobody.
	 */
	it("keeps the composer, at its resting height and switched off", async () => {
		const canvas = mount();
		canvas.preflight.installed = false;
		await canvas.render();
		await settle(50);

		expect(canvas.host.querySelector("[data-agent-dead]")?.textContent).toBe("say what to change");
		expect(field(canvas.host)).toBeNull();
	});

	/**
	 * Installing an agent takes minutes rather than the second a login takes, so pressing
	 * this twice is the normal case and a press that leaves no mark reads as broken.
	 */
	it("lets its check fail as often as it likes, and says so each time", async () => {
		const canvas = mount();
		canvas.preflight.installed = false;
		await canvas.render();
		await settle(50);
		expect(canvas.host.querySelector("[data-agent-looked]")).toBeNull();

		await checkAgain(wall(canvas.host));
		expect(canvas.host.querySelector("[data-agent-looked]")?.textContent).toBe("still nothing on your PATH");

		await checkAgain(wall(canvas.host));
		expect(canvas.host.querySelector("[data-agent-looked]")?.textContent).toBe("still nothing on your PATH");
		expect(canvas.preflight.looks).toBe(3);
		// and the wall is still the whole of the rail's body
		expect(field(canvas.host)).toBeNull();
	});

	it("goes the moment a check finds one, and the composer comes back", async () => {
		const canvas = mount();
		canvas.preflight.installed = false;
		await canvas.render();
		await settle(50);

		canvas.preflight.installed = true;
		await checkAgain(wall(canvas.host));

		expect(wall(canvas.host)).toBeNull();
		expect(field(canvas.host)?.placeholder).toBe("say what to change");
		await send(canvas.host, "shoot home");
		expect(canvas.turn.prompts).toEqual(["shoot home"]);
	});

	/** a wall is spool saying it looked, so a door that said nothing draws no wall */
	it("draws no wall when the door said nothing", async () => {
		const canvas = mount();
		await canvas.render();
		await settle(50);

		expect(wall(canvas.host)).toBeNull();
		expect(field(canvas.host)).not.toBeNull();
	});

	/**
	 * And it never guesses the other way either. A door that cannot answer is not a machine
	 * that grew an agent: taking the wall down on it would put a live composer over nothing
	 * to spawn, on the one press meant to find out.
	 */
	it("keeps the wall when a look comes back with no answer", async () => {
		const canvas = mount();
		canvas.preflight.installed = false;
		await canvas.render();
		await settle(50);

		canvas.preflight.installed = null;
		await checkAgain(wall(canvas.host));

		expect(wall(canvas.host)).not.toBeNull();
		expect(canvas.host.querySelector("[data-agent-looked]")).not.toBeNull();
		expect(field(canvas.host)).toBeNull();
	});
});

describe("signed out", () => {
	/**
	 * Nothing local knows the login is bad. The spawn is the question, so the words go out
	 * and land in the log the instant Enter is pressed, and the refusal arrives when the
	 * first token would have — a composer that refused instantly would be spool guessing,
	 * and it would guess wrong the moment somebody signs in without telling it.
	 */
	it("is found out by spawning, and the words are in the log before the refusal is", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");

		expect(canvas.turn.prompts).toEqual(["shoot home"]);
		expect(rail(canvas.host)?.textContent).toContain("shoot home");
		expect(outStrip(canvas.host)).toBeNull();

		canvas.turn.push(refused);
		canvas.turn.close();
		await settle();

		// the binary's own words, verbatim, and one sentence of spool's under them saying
		// what to do about it from here
		expect(rail(canvas.host)?.textContent).toContain("Not logged in · Please run /login");
		expect(rail(canvas.host)?.textContent).toContain("run `claude` in a terminal, then /login");
		expect(rail(canvas.host)?.textContent).toContain("spool uses that login; it never asks for a key");
		expect(outStrip(canvas.host)?.textContent).toContain("signed out");
		// nothing local knows any better than the last spawn did, so the composer stays live
		// and the next send is a send: it would answer wrong the moment somebody signs in
		// without telling it
		expect(field(canvas.host)?.placeholder).toBe("say what to change");
		await send(canvas.host, "again then");
		expect(canvas.turn.prompts).toEqual(["shoot home", "again then"]);
	});

	it("holds the prompt, and checking again runs it with no second copy of it", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push(refused);
		canvas.turn.close();
		await settle();

		canvas.preflight.login = { signedIn: true, account: "ada@kaffe.se" };
		await checkAgain(outStrip(canvas.host));

		// the same words, sent again, without anybody retyping a sentence to prove they
		// meant it — and said once, so the log holds one copy of them
		expect(canvas.turn.prompts).toEqual(["shoot home", "shoot home"]);
		expect(said(canvas.host, "shoot home")).toBe(1);
		// the account is named once, from the reply, at the moment spool starts using it
		expect(rail(canvas.host)?.textContent).toContain("signed in as ada@kaffe.se");
		expect(outStrip(canvas.host)).toBeNull();
	});

	it("says so and runs nothing when the check comes back with the same answer", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push(refused);
		canvas.turn.close();
		await settle();

		await checkAgain(outStrip(canvas.host));

		expect(canvas.turn.prompts).toEqual(["shoot home"]);
		expect(rail(canvas.host)?.textContent).toContain("still signed out");
		expect(outStrip(canvas.host)).not.toBeNull();

		// a press that keeps saying the same thing leaves the one line saying it, rather
		// than stacking a third identical boundary across the log
		await checkAgain(outStrip(canvas.host));
		expect(canvas.preflight.asked).toBe(2);
		expect(said(canvas.host, "still signed out")).toBe(1);
	});

	/** the mark and the strip say the same thing, and they stop saying it together */
	it("marks the thread waiting, and stops once a turn does not bounce", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push(refused);
		canvas.turn.close();
		await settle();
		expect(lifeOfCell(canvas.host, "shoot home")).toBe("waiting");

		canvas.preflight.login = { signedIn: true, account: "ada@kaffe.se" };
		await checkAgain(outStrip(canvas.host));
		canvas.turn.push(waiting);
		await settle(150);

		// the turn that ran is what says the bounce stopped, and it says it while it runs
		expect(lifeOfCell(canvas.host, "shoot home")).toBe("streaming");
		expect(outStrip(canvas.host)).toBeNull();

		canvas.turn.push(speaking);
		canvas.turn.push(say("on it."));
		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle(600);

		// and it stays stopped: the refusal is in the log above, where it happened, and the
		// thread it happened in is one somebody has read
		expect(lifeOfCell(canvas.host, "shoot home")).toBe("read");
		expect(outStrip(canvas.host)).toBeNull();
	});

	/**
	 * The API-key state is cut, and cutting it is a decision: spool asks for nothing and
	 * stores nothing, so a warning would be spool holding an opinion about somebody's
	 * billing arrangement. What survives is the promise, said once under the remedy.
	 */
	it("offers nowhere to paste a key", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push(refused);
		canvas.turn.close();
		await settle();

		expect(rail(canvas.host)?.querySelectorAll("input")).toHaveLength(0);
		expect(rail(canvas.host)?.textContent).not.toContain("API key");
		expect(rail(canvas.host)?.textContent).not.toContain("ANTHROPIC");
	});
});

/**
 * The stroke on the composer's top border, which is what says the agent is alive (#N).
 *
 * It spends no transcript pixels: it rides the hairline the composer already draws. So
 * what there is to assert is which of three pictures is up, and then the arithmetic of the
 * stroke itself, which lives in the stylesheet rather than in any element — a keyframe's
 * values are not reachable from a mounted node, so the last block reads the file the way
 * `agent-said.test.ts` reads it.
 */
describe("the stroke on the composer's border", () => {
	const stroke = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-agent-wind]");
	const state = (host: HTMLElement) => stroke(host)?.getAttribute("data-agent-wind");
	const laying = (host: HTMLElement) => stroke(host)?.className.includes("animate-agent-wind") ?? false;
	const stopped = (host: HTMLElement) => stroke(host)?.className.includes("animation-play-state:paused") ?? false;
	const broken = (host: HTMLElement) =>
		host.querySelector<HTMLElement>("[data-agent-wind-break]")?.className.includes("opacity-100") ?? false;

	/** a still of the rail at rest is the rail as it shipped: the border and nothing over it */
	it("draws the border unchanged while nothing is running", async () => {
		const canvas = mount();
		await canvas.render();

		expect(state(canvas.host)).toBe("idle");
		expect(laying(canvas.host)).toBe(false);
		expect(broken(canvas.host)).toBe(false);
	});

	/**
	 * One picture for every state of a turn in flight. A reader watching the edge of their
	 * own eye learns nothing from the difference between a request being out and a `read`
	 * being open, because the answer to *do I need to do anything* is no in both.
	 */
	it("lays and takes up for a request out, a thought, words and work alike", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");

		canvas.turn.push(waiting);
		await settle();
		expect(state(canvas.host)).toBe("laying");

		canvas.turn.push(speaking);
		canvas.turn.push({ kind: "thinking", block: 0, tokens: 40, parent: null });
		await settle();
		expect(state(canvas.host)).toBe("laying");

		canvas.turn.push(say("the frame is live."));
		canvas.turn.push({ kind: "called", id: "c9", tool: "Read", input: { file_path: "/project/x" }, parent: null });
		await settle();
		expect(state(canvas.host)).toBe("laying");
		expect(laying(canvas.host)).toBe(true);
		expect(stopped(canvas.host)).toBe(false);
		expect(broken(canvas.host)).toBe(false);
	});

	/**
	 * And the one thing it does say about how long is strength, never pace (#231).
	 *
	 * The travel is the constraint rather than a detail. This came from a rail that read as
	 * stopped, so the indicator may not answer *how long has this been* by moving less: a
	 * take that slowed the only moving thing in the rail would answer *is this alive* with
	 * less evidence that it is, exactly when a reader is asking. It carries upward instead —
	 * a longer silence draws a more present line, never a fainter one — and it tops out at
	 * thirty seconds, because 22 of the 27 thinking blocks in the captures are 1,050
	 * estimated tokens or fewer, which is under 18 seconds at the measured rate.
	 */
	it("carries the length of a silence upward, and tops out at thirty seconds", () => {
		expect(windStrength(0, true)).toBeCloseTo(0.75, 4);
		expect(windStrength(15_000, true)).toBeCloseTo(0.875, 4);
		expect(windStrength(30_000, true)).toBeCloseTo(1, 4);
		// the worst thought measured is 9,500 tokens, about 159s: it pins rather than wraps
		expect(windStrength(159_000, true)).toBeCloseTo(1, 4);
		expect(windStrength(0, true)).toBeLessThan(windStrength(4000, true));
	});

	/** nothing out is the stroke as it shipped, whatever the turn did before */
	it("rests at the strength the stroke has always had when nothing is out", () => {
		expect(windStrength(0, false)).toBeCloseTo(0.75, 4);
		expect(windStrength(159_000, false)).toBeCloseTo(0.75, 4);
	});

	/**
	 * And the rail is wired to it, with the travel left alone.
	 *
	 * The arithmetic above is the behaviour; this is the wiring, and the second assertion is
	 * the one that matters. No `animation-duration` of the stroke's own means the cycle is
	 * still the stylesheet's 1600ms at every length of wait, which is the constraint this
	 * take was chosen under.
	 */
	it("hands the stroke its strength and leaves the cycle to the stylesheet", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");

		canvas.turn.push(waiting);
		await settle();

		expect(Number(stroke(canvas.host)?.style.opacity ?? "")).toBeCloseTo(0.75, 2);
		expect(stroke(canvas.host)?.style.animationDuration).toBe("");
		expect(laying(canvas.host)).toBe(true);
	});

	/**
	 * The one state that is a call to act gets a shape of its own rather than the same
	 * picture slower: the stroke stops where the request caught it and an 18px break opens
	 * in the line. Stopping is the animation paused, so nothing of spool's holds the clock.
	 */
	it("stops where it was and breaks the line while the turn waits on a person", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push({ kind: "called", id: "c1", tool: "Bash", input: { command: "spool upgrade" }, parent: null });
		canvas.turn.push({
			kind: "asking",
			request: "req-a",
			call: "c1",
			tool: "Bash",
			display: "Bash",
			input: { command: "spool upgrade" },
			description: "Run `spool upgrade`",
			interaction: false,
			suggestions: [],
			parent: null,
		});
		await until(() => state(canvas.host) === "parked");

		expect(laying(canvas.host)).toBe(true);
		expect(stopped(canvas.host)).toBe(true);
		expect(broken(canvas.host)).toBe(true);
	});

	/** the turn is over, so the border is the border again */
	it("is gone once the turn has ended", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push(say("done."));
		canvas.turn.push(ended);
		// the daemon is what says the turn is over, so it lays until the process goes (#234)
		canvas.turn.push(closed);
		canvas.turn.close();
		await until(() => state(canvas.host) === "idle");

		expect(laying(canvas.host)).toBe(false);
		expect(broken(canvas.host)).toBe(false);
	});

	/**
	 * The stroke is the entire indicator. Earlier candidates carried a `working` or an
	 * `idle` beside it and both were rejected: a word on the boundary is a word to read,
	 * and the whole argument for a stroke is that it is answered without reading anything.
	 */
	it("carries no word, and nothing that could hold one", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push(waiting);
		await settle();

		const parts = [...canvas.host.querySelectorAll("[data-agent-wind], [data-agent-wind-break]")];
		expect(parts).toHaveLength(2);
		for (const part of parts) {
			expect(part.textContent).toBe("");
			expect(part.children).toHaveLength(0);
			expect(part.getAttribute("aria-hidden")).toBe("true");
		}
		expect(rail(canvas.host)?.textContent).not.toContain("working");
	});
});

/**
 * The arithmetic of the stroke, which is a stylesheet fact.
 *
 * Two independently moving ends on one composited matrix: `translateX` is the tail and
 * `scaleX` about a left origin is the length. Neither the cycle nor a keyframe's values are
 * reachable from a mounted element, so this reads the file.
 */
describe("the stylesheet the stroke lives in", () => {
	const CSS = readFileSync(join(process.cwd(), "src/ui/ui.css"), "utf8");
	const block = (open: string): string => {
		const at = CSS.indexOf(open);
		if (at === -1) throw new Error(`no ${open}`);
		const end = CSS.indexOf("\n\t}", at);
		return CSS.slice(at, end === -1 ? undefined : end);
	};
	/** every stop as [tail, length], both fractions of the track */
	const stops = [...block("@keyframes agent-wind").matchAll(/translateX\((-?[\d.]+)%\) scaleX\(([\d.]+)\)/g)].map(
		(stop) => [Number(stop[1]) / 100, Number(stop[2])] as const,
	);

	it("lays and takes up once every 1600ms", () => {
		expect(CSS).toContain("--animate-agent-wind: agent-wind 1600ms linear infinite");
	});

	/**
	 * Linear, because the easing is in the values: each end has its own smoothstep over its
	 * own part of the cycle, and one shared timing function cannot express two.
	 */
	it("moves two ends on one matrix and nothing else", () => {
		const frames = block("@keyframes agent-wind");

		expect(stops).toHaveLength(21);
		expect(frames).not.toMatch(/opacity|filter|background|width|left|margin/);
	});

	/** so the loop restarts on screen with nothing drawn, rather than off the right edge */
	it("is nothing at all at both ends of the cycle", () => {
		expect(stops.at(0)).toEqual([0, 0]);
		expect(stops.at(-1)).toEqual([1, 0]);
	});

	/**
	 * The progress question, answered by the arithmetic rather than by taste: no state of
	 * it is full, and its length falls for the whole second half of the cycle. A bar that
	 * empties on the way to completion is not the idiom.
	 */
	it("is never full and never accumulates", () => {
		const lengths = stops.map(([, length]) => length);
		const longest = Math.max(...lengths);

		expect(longest).toBeCloseTo(0.41, 2);
		expect(lengths.indexOf(longest)).toBe(10);
		const falling = lengths.slice(10);
		expect(falling).toEqual([...falling].sort((one, two) => two - one));
		// and the tail only ever goes forward, so nothing is ever laid backwards
		const tails = stops.map(([tail]) => tail);
		expect(tails).toEqual([...tails].sort((one, two) => one - two));
	});

	/**
	 * Stillness cannot mean absence here, because the stroke is the whole indicator. It is
	 * held a third of the way along its own cycle instead, which is the same picture
	 * everybody else sees with nothing moving in it.
	 */
	it("holds one static stroke when stillness is asked for", () => {
		const at = CSS.indexOf("@media (prefers-reduced-motion: reduce)");
		const still = CSS.slice(at, CSS.indexOf("\n}", at));

		expect(still).toContain(".animate-agent-wind");
		expect(still).toContain("animation: none");
		expect(still).toContain("transform: translateX(6.372%) scaleX(0.3406)");
	});
});
