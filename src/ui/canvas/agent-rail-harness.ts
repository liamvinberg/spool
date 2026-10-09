import { IDBFactory } from "fake-indexeddb";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { onTestFinished, vi } from "vitest";
import { type AgentOffer, modelsOf } from "../../daemon/agent-offer";
import { readModelsReply } from "../../test-helpers";
import type { AgentEvent, SelectionEntry, ServedThread, ThreadPut } from "../api";
import { forgetAgentDefaults } from "./agent-defaults";
import { draftsFor } from "./agent-drafts";
import { type CanvasChrome, ProjectCanvas } from "./canvas";

/**
 * The agent rail's test harness: a whole canvas on a stubbed daemon, shared by the rail's
 * test files and the menus', composer's, wall's and thread list's beside it.
 */

/** A browser that has never been dragged, before every test. */
export const freshBrowser = () => {
	vi.stubGlobal("indexedDB", new IDBFactory());
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"] });
	onTestFinished(() => {
		vi.useRealTimers();
	});
	const box: Storage | undefined = window.localStorage;
	box?.clear();
	// a page that has just loaded knows nothing of the machine's agent yet
	forgetAgentDefaults();
};

/** `receipt` sits one page over, which is the normal case: a thread is not bound to a page */
export const PROJECTION = {
	root: "/project",
	pages: ["site"],
	frames: [
		{ name: "home", x: 0, y: 0, w: 390, h: 844 },
		{ name: "site/receipt", page: "site", x: 0, y: 0, w: 390, h: 844 },
	],
};

/** one message of a turn, as the daemon reads it off the wire */
export interface Said {
	readonly prompt: string;
	readonly selection?: readonly { readonly frame: string }[];
	readonly attachments?: { media: string; data: string }[];
}

/** one thread's stream, so a test can drive a conversation it is not looking at (#200) */
export interface Stream {
	/** the thread this turn ran under, which is the session id the rail minted */
	readonly thread: string;
	push(event: AgentEvent): void;
	close(): void;
	/** the client let go of this turn, which is what takes the process with it */
	readonly aborted: () => boolean;
}

export interface Turn {
	/** every message of every turn, flattened: a turn is one press or a queue that fired */
	readonly prompts: string[];
	/** whatever rode with those words, which so far is a reference image (#119) */
	readonly attachments: { media: string; data: string }[][];
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
export interface Stored {
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
export interface Pointed {
	served: SelectionEntry[] | null;
	readonly puts: { frames?: string[]; elements?: { selector: string }[] }[];
}

export function enrich(put: { frames?: string[]; elements?: { frame: string; selector: string }[] }): SelectionEntry[] {
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

/** an SSE body a test can write into, which is both of the canvas's live streams */
export function sse() {
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
export const OFFERED: AgentOffer = {
	models: modelsOf(readModelsReply()),
	current: { value: "opus[1m]", resolved: "claude-opus-5[1m]", name: "Opus 5", effort: "high", pin: null },
};

/**
 * A second agent's offer, so the menu has another group to draw (#364): two models, the
 * first with effort levels, neither of them a name Claude's reply uses.
 */
export const CODEX_OFFERED: AgentOffer = {
	models: [
		{
			value: "gpt-5.5",
			resolvedModel: "gpt-5.5",
			displayName: "GPT-5.5",
			description: "",
			supportsEffort: true,
			supportedEffortLevels: ["low", "medium", "high"],
		},
		{ value: "gpt-5.5-mini", resolvedModel: "gpt-5.5-mini", displayName: "GPT-5.5 mini", description: "" },
	],
	current: { value: "gpt-5.5", resolved: "gpt-5.5", name: "GPT-5.5", effort: "medium", pin: null },
};

/** the daemon's own answer to a choice: the binary's report of what it is now running */
export function reported(offer: AgentOffer, wanted: { value?: string; effort?: string }): AgentOffer {
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

export function mount({ still = false }: { still?: boolean } = {}) {
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
	const project = {
		frames: PROJECTION.frames as { name: string; page?: string }[],
		/** the frames on their way: designers' placeholders, which a test puts here as the daemon would */
		placeholders: [] as { name: string; page?: string; x: number; y: number; w: number; h: number }[],
	};
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
		/** which engines the machine has, as the engines door names them (#363); null leaves it to `engines.listed` */
		engines: null as { id: string; installed: boolean; outdated?: boolean }[] | null,
		/** this thread's engine is there but too old to run (#362) */
		outdated: false,
		login: { signedIn: false, account: null } as { signedIn: boolean; account: string | null },
		looks: 0,
		asked: 0,
	};
	/** the model door, and every choice that went through it (#199) */
	const machine = {
		preferred: "claude",
		mode: "edits",
		/** a save held open, so a test can look at the menu while it waits on one */
		saving: null as Promise<void> | null,
		/** a save the daemon refuses */
		refuses: false,
	};
	/**
	 * The agents the daemon reports, and a second one a test can install (#364).
	 *
	 * Claude alone by default, which is every claim about one agent's menu. A test about
	 * switching agents puts codex beside it, and codex answers its own doors: its models,
	 * a choice of model for its next chat, and whether it is signed in. `calls` is the order
	 * the switch's two writes went out in, which is what says the choice was saved first.
	 */
	const engines = {
		listed: [{ id: "claude", installed: true }] as { id: string; installed: boolean; outdated?: boolean }[],
		// null is a models door that fails
		codex: {
			offer: CODEX_OFFERED as AgentOffer | null,
			signedIn: true,
			chose: [] as { value?: string; effort?: string }[],
		},
		calls: [] as string[],
	};
	/** the mode the thread doors answer with, and every pick that was saved */
	const permissions = { mode: "ask", picks: [] as string[] };
	const offered = {
		offer: OFFERED,
		/** every thread the rail asked the offer about, in order */
		asked: [] as string[],
		chose: [] as { thread: string; value?: string; effort?: string }[],
		reply: reported,
		/** the door held shut, which is where the second between a press and its reply is */
		hold: null as Promise<void> | null,
		/** the offer's own door held shut, which is the wait before a chat's first offer */
		reading: null as Promise<void> | null,
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
			const method = init?.method ?? (input instanceof Request ? input.method : "GET");
			// the second agent's own doors, ahead of the thread doors their endings share (#364)
			if (url.pathname.endsWith("/agent/engines/codex/models"))
				return engines.codex.offer === null
					? new Response("", { status: 500 })
					: Response.json(engines.codex.offer);
			if (url.pathname.endsWith("/agent/engines/codex/model")) {
				const body = input instanceof Request ? await input.text() : String(init?.body ?? "{}");
				engines.codex.chose.push(JSON.parse(body) as { value?: string; effort?: string });
				engines.calls.push("POST codex model");
				return Response.json(engines.codex.offer);
			}
			if (url.pathname.endsWith("/agent/login") && url.searchParams.get("engine") === "codex") {
				return Response.json({ signedIn: engines.codex.signedIn, account: null });
			}
			// the machine's agent choice (#361), saved by a PUT and read back by every GET
			if (url.pathname.endsWith("/agent/engines")) {
				if (method === "PUT") {
					const body = input instanceof Request ? await input.text() : String(init?.body ?? "{}");
					const preferred = (JSON.parse(body) as { preferred: string }).preferred;
					engines.calls.push(`PUT engines ${preferred}`);
					if (machine.saving !== null) await machine.saving;
					if (machine.refuses) return new Response("could not save", { status: 500 });
					machine.preferred = preferred;
				}
				return Response.json({ ...machine, engines: preflight.engines ?? engines.listed });
			}
			// is there an agent on this machine at all: a `which`, asked when the rail opens
			// and again on every press behind the wall (#201)
			if (url.pathname.endsWith("/agent/installed")) {
				preflight.looks += 1;
				return Response.json(
					preflight.installed === null
						? {}
						: { installed: preflight.installed, ...(preflight.outdated ? { outdated: true } : {}) },
				);
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
					turn.attachments.push(one.attachments ?? []);
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
				if (offered.reading !== null) await offered.reading;
				// a chat on codex is answered by codex
				if (url.searchParams.get("engine") === "codex") return Response.json(engines.codex.offer);
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
			// the machine's one mode (#361), which a pick in the mode menu saves
			if (url.pathname.endsWith("/permissions")) {
				if (method === "PUT") {
					const body = input instanceof Request ? await input.text() : String(init?.body ?? "{}");
					permissions.mode = (JSON.parse(body) as { mode: string }).mode;
					permissions.picks.push(permissions.mode);
				}
				return Response.json({ mode: permissions.mode });
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
			if (url.pathname.endsWith("/frames"))
				return Response.json({ ...PROJECTION, frames: project.frames, placeholders: project.placeholders });
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
	// happy-dom has no CSS animations. Seed's motion is exercised with an animation
	// clock in agent-seed.test.ts; this harness checks the full transcript lifecycle.
	Object.defineProperty(HTMLElement.prototype, "getAnimations", { configurable: true, value: () => [] });
	onTestFinished(() => {
		Reflect.deleteProperty(HTMLElement.prototype, "getAnimations");
	});
	/**
	 * Every size watcher the page put on something, so a test can say the content grew.
	 *
	 * happy-dom lays nothing out, so the observer it constructs never fires: the log's own
	 * pin, which rides the body's size, is driven from here by hand — set the geometry, then
	 * say it changed, which is what a browser does in one layout.
	 */
	const watchers: { callback: ResizeObserverCallback; targets: Element[] }[] = [];
	vi.stubGlobal(
		"ResizeObserver",
		class {
			private readonly entry: { callback: ResizeObserverCallback; targets: Element[] };
			constructor(callback: ResizeObserverCallback) {
				this.entry = { callback, targets: [] };
				watchers.push(this.entry);
			}
			observe(target: Element) {
				this.entry.targets.push(target);
			}
			unobserve() {}
			disconnect() {
				this.entry.targets = [];
			}
		},
	);

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
		leave: async () => {
			await act(async () => root.render(null));
		},
		turn,
		watcher,
		chrome,
		project,
		pointed,
		stored,
		offered,
		machine,
		engines,
		permissions,
		preflight,
		/** the log's body changed size: what a browser tells the rail's watcher after a layout */
		grew: async () => {
			await act(async () => {
				for (const watcher of watchers) {
					if (!watcher.targets.some((target) => target.closest("[data-agent-log]") !== null)) continue;
					watcher.callback([], watcher as unknown as ResizeObserver);
				}
			});
		},
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
			// properties are the right side's lit tab by default (#359), so a file
			// about the agent lights the Agent tab, which is what every test here starts from
			await act(async () => {
				await draftsFor("test").ready;
			});
			const tab = host.querySelector<HTMLElement>('[data-pane-tab="agent"]');
			if (tab !== null && tab.getAttribute("aria-selected") !== "true") {
				await act(async () => {
					tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				});
			}
		},
	};
}

export const rail = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-agent-rail]");

/** the right side's tabs and panes, whose width is what the agent is laid out at */
export const stack = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-side-tabs="right"]');

export const field = (host: HTMLElement) => host.querySelector<HTMLTextAreaElement>("textarea");

/**
 * What matches and is not on its way out (#364).
 *
 * A float that closes stays mounted for its exit, inert, before it unmounts; it is not
 * there to be read or pressed. A browser would say so with `:not([inert] *)`, which
 * happy-dom does not read, so the leaving ones are filtered by hand.
 */
export const live = <T extends Element = HTMLElement>(host: ParentNode, selector: string): T[] =>
	[...host.querySelectorAll<T>(selector)].filter((element) => element.closest("[inert]") === null);

export async function until(condition: () => boolean, ms = 4000) {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > ms) throw new Error("condition never held");
		await act(async () => {
			await vi.advanceTimersByTimeAsync(25);
		});
	}
}

/** React listens for `input`, so the value has to be set through the native setter */
export function type(element: HTMLTextAreaElement, text: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
	setter?.call(element, text);
	element.dispatchEvent(new Event("input", { bubbles: true }));
}

export async function send(host: HTMLElement, text: string) {
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
export async function settle(ms = 400) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

export async function drop(host: HTMLElement, file: File) {
	const box = field(host);
	if (box === null) throw new Error("no composer");
	await act(async () => {
		const event = new Event("drop", { bubbles: true, cancelable: true });
		Object.defineProperty(event, "dataTransfer", { value: { items: [], files: [file] } });
		box.dispatchEvent(event);
	});
}

/** one pixel of PNG, which is what a paste or a drop hands over */
export const shot = () =>
	new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])], "shot.png", { type: "image/png" });

export const ended: AgentEvent = { kind: "ended", ending: "done", reason: "completed", stopReason: null, parent: null };

export const closed: AgentEvent = { kind: "closed", code: 0, parent: null };

/* ---------- the threads, and what survives a restart (#120, #136, #200, #205) ---------- */

/**
 * The plate under the Agent tab, which holds the chat's title (#364, #359): the title is the
 * switcher, and the tab above already says Agent.
 */
export const header = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-agent-plate]");

/** the agent's verbs in its tab row: the + */
export const verbs = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-pane-verbs="agent"]');

/** the chat's title on the plate, which is the press that drops the list */
export const titleButton = (host: HTMLElement) =>
	header(host)?.querySelector<HTMLElement>("[data-agent-thread-title]") ?? null;

/** the thread you are in, which is the one place its name is written outside the list */
export const threadTitle = (host: HTMLElement) => titleButton(host)?.querySelector(":scope > span")?.textContent ?? "";

/** the list dropped from the title over the log, or null while it is shut or on its way out */
export const threadList = (host: HTMLElement) => live(host, "[data-agent-threads]")[0] ?? null;

export async function press(element: Element | null | undefined) {
	if (element === null || element === undefined) throw new Error("nothing to press");
	await act(async () => {
		element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
}

/** the list, dropped if it is not already: a row exists only while the list is up */
export async function listed(host: HTMLElement) {
	if (threadList(host) === null) await press(titleButton(host));
	return threadList(host);
}

/** the rows, in the order the list lays them out: newest at the top, fixed once */
export async function cells(host: HTMLElement) {
	const list = await listed(host);
	return [...(list?.querySelectorAll("[data-agent-thread]") ?? [])].map((row) =>
		row.getAttribute("data-agent-thread"),
	);
}

export async function cell(host: HTMLElement, name: string) {
	const list = await listed(host);
	return list?.querySelector<HTMLElement>(`[data-agent-thread="${name}"]`) ?? null;
}

/** a press on a row, which opens that thread and shuts the list */
export const openCell = async (host: HTMLElement, name: string) => press(await cell(host, name));

/** the + in the Agent tab's row */
export const newThread = async (host: HTMLElement) => {
	await press(verbs(host)?.querySelector('button[aria-label="New chat"]'));
};

/**
 * A thread as the daemon serves one back, which is spool's own drawing off disk.
 *
 * `frame` is what its one row edited, and it is a parameter because that is the thread's
 * name now (#205): two fixtures that both edited `home` are two threads called `home`, and
 * a test that cannot tell them apart is asserting nothing about which one it opened.
 */
export function storedThread({
	frame = "home",
	...over
}: Partial<ServedThread> & { id: string; ask: string; frame?: string }): ServedThread {
	return {
		engine: "claude",
		session: { id: over.id },
		life: "read",
		at: 1_700_000_000_000,
		entries: [
			{ key: "u0", kind: "user", text: over.ask, context: null, attached: [] },
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
			{
				key: "p0",
				kind: "prose",
				full: "The header is tighter now.",
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

export const ONE = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";

export const TWO = "2a1b3c4d-5e6f-4788-9900-112233445566";

/* ---------- which machine is answering (#118, #122, #184, #186, #199) ----------
 * The readout is the footer's whole left half now, and it is a button. Everything in
 * the menu it opens arrives from the binary at runtime: nothing here is a table spool
 * shipped, and a press is a shortcut for `/model haiku` rather than a second source of
 * truth — so what moves the readout is the reply and never the press. */

export const modelTrigger = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('[aria-label="Choose model"]');

/** the menu while it is up, and not the one fading out after a close */
export const modelMenu = (host: HTMLElement) => live(host, "[data-agent-model-menu]")[0] ?? null;

/** every row in the menu, in the order the reply listed them */
export const modelRows = (host: HTMLElement) =>
	live<HTMLButtonElement>(host, "[data-agent-model-row]").map((row) => row.getAttribute("data-agent-model-row") ?? "");

export const modelRow = (host: HTMLElement, label: string) =>
	live<HTMLButtonElement>(host, `[data-agent-model-row="${label}"]`)[0] ?? null;

/** the chosen row's effort control, which opens the levels in place under it (#364) */
export const effortToggle = (host: HTMLElement) =>
	live<HTMLButtonElement>(host, "[data-agent-effort-toggle]")[0] ?? null;

/** the levels, while they are open: shut, they are in the menu and inert */
export const effortPills = (host: HTMLElement) => live<HTMLButtonElement>(host, "[data-agent-effort]");

export const effortPill = (host: HTMLElement, level: string) =>
	live<HTMLButtonElement>(host, `[data-agent-effort="${level}"]`)[0] ?? null;

export const usageLine = (host: HTMLElement) =>
	host.querySelector<HTMLElement>("[data-agent-usage]")?.textContent ?? null;

export async function openModelMenu(canvas: ReturnType<typeof mount>) {
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
export async function resizeRail(host: HTMLElement, width: number) {
	const grip = host.querySelector<HTMLElement>('[aria-label="Resize right side"]');
	if (grip === null) throw new Error("no grip");
	grip.setPointerCapture = () => {};
	grip.releasePointerCapture = () => {};
	const from = 1000;
	const at = Number(stack(host)?.style.width.replace("px", "") ?? 300);
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

/** the left of the composer's foot, where attach, the model and the mode sit (#364) */
export const footerRow = (host: HTMLElement) =>
	rail(host)?.querySelector<HTMLElement>('[data-agent-foot="start"]') ?? null;

/** the usage window as the two captures carry it: `seven_day` at 92%, resetting Wednesday */
export const warned: Extract<AgentEvent, { kind: "limit" }> = {
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

export const frameEntry = (frame: string): SelectionEntry => ({
	kind: "frame",
	frame,
	path: `design/frames/${frame}/frame.tsx`,
	size: { w: 390, h: 844 },
});

export const elementEntry = (name: string, selector: string, lines: [number, number]): SelectionEntry => ({
	kind: "element",
	frame: "home",
	name,
	path: "design/frames/home/frame.tsx",
	lines,
	selector,
	excerpt: `<${name} className="row" />`,
});

/** the chips the composer is drawing, in the order the strip lays them out */
export const chips = (host: HTMLElement) =>
	[...host.querySelectorAll("[data-agent-chip]")].map((chip) => chip.getAttribute("data-agent-chip"));

/** the rows behind an opened count chip */
export const chipRows = (host: HTMLElement) =>
	[...host.querySelectorAll("[data-agent-chip-row]")].map((row) => row.getAttribute("data-agent-chip-row"));

export const chipDrop = (host: HTMLElement, label: string) =>
	host.querySelector<HTMLButtonElement>(`[data-agent-chip="${label}"] button[aria-label="drop ${label}"]`);

/** the way inside a frame: the double-click, presses and all */
export async function enterHome(host: HTMLElement, x = 40, y = 40) {
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
		// the label, not the body: a double-click on the body descends a rung (#254)
		host
			.querySelector<HTMLElement>('[data-frame-label="home"]')
			?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: x, clientY: y }));
	});
}

/** one click on the frame, which is how a frame is taken */
export async function clickHome(host: HTMLElement, x = 40, y = 40) {
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
export async function paste(host: HTMLElement, ...files: File[]) {
	const count = host.querySelectorAll("[data-agent-attached]").length + files.length;
	const box = field(host);
	if (box === null) throw new Error("no composer");
	await act(async () => {
		const event = new Event("paste", { bubbles: true });
		Object.defineProperty(event, "clipboardData", { value: { files } });
		box.dispatchEvent(event);
	});
	await until(() => host.querySelectorAll("[data-agent-attached]").length === count);
}

/**
 * A drag over the composer, carrying what a dragging browser really carries.
 *
 * `files` is empty until the drop — the drag data store is in protected mode, and
 * only each item's kind and type can be read — so a dragover accepted off `files`
 * is a dragover that never happens.
 */
export async function dragOver(host: HTMLElement, items: { kind: string; type: string }[]): Promise<boolean> {
	const box = field(host);
	if (box === null) throw new Error("no composer");
	const event = new Event("dragover", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "dataTransfer", { value: { items, files: [] } });
	await act(async () => {
		box.dispatchEvent(event);
	});
	return event.defaultPrevented;
}

export const waiting: AgentEvent = { kind: "waiting", parent: null };

export const speaking: AgentEvent = { kind: "speaking", message: "m", model: "claude-opus-5", parent: null };

export const say = (text: string): AgentEvent => ({ kind: "say", block: 0, text, parent: null });

/** one whole call, as the wire hands one over once its arguments have finished arriving */
export const called = (id: string, tool: string, input: unknown, parent: string | null = null): AgentEvent => ({
	kind: "called",
	id,
	tool,
	input,
	parent,
});

export const settled = (id: string, over: Partial<Extract<AgentEvent, { kind: "result" }>> = {}): AgentEvent => ({
	kind: "result",
	id,
	failed: false,
	text: "",
	images: [],
	parent: null,
	...over,
});

/** what every row in the log says out loud, in order */
export const rows = (host: HTMLElement) =>
	[...host.querySelectorAll("[data-agent-row]")].map((row) => row.getAttribute("data-agent-row"));

/**
 * Stopping a turn, and saying the next thing without stopping it (#165, #170, #176).
 *
 * One invariant spans them and is what makes them one thing to test: words that leave
 * the queue un-fired land back in the box. A stop cancels the queue and hands the
 * words back, and taking one back by hand is the same act with the same outcome.
 */

/**
 * The press in the composer's foot, which is the exit that works from wherever the eyes
 * are: Send, turned to Stop for as long as the turn is a process (#364).
 */
export const stopPress = (host: HTMLElement) =>
	live<HTMLButtonElement>(rail(host) ?? host, '[data-agent-stop][aria-label="Stop"]')[0] ?? null;

/** the send it stands in for, which is there whenever the stop is not */
export const sendPress = (host: HTMLElement) =>
	live<HTMLButtonElement>(rail(host) ?? host, '[data-agent-send][aria-label="Send"]')[0] ?? null;

/** every message waiting at the end of the log, in the order it will fire (#364) */
export const queuedRows = (host: HTMLElement) =>
	[...host.querySelectorAll("[data-agent-log] [data-agent-queue] [data-agent-queued] p")].map(
		(row) => row.textContent,
	);

/**
 * The stroke every row's mark actually draws, in the log's own order.
 *
 * A settled mark holds both strokes so the dash offset has something mounted to run
 * on, and the one it means is the one it lets be seen — so the marks are read off
 * opacity rather than off the path list, which would count a cross's spare stroke
 * against every row that is not one.
 */
export const drawnStrokes = (host: HTMLElement) =>
	[...host.querySelectorAll<SVGPathElement>("[data-agent-row] path")]
		.filter((stroke) => stroke.style.opacity === "1")
		.map((stroke) => stroke.getAttribute("d"));

export async function pressEscape(host: HTMLElement, where: "composer" | "canvas") {
	// the target is the whole of the difference: the hotkey dispatch returns on any
	// keydown born in a text field, so a press in the composer never reaches the ladder
	const target = where === "composer" ? field(host) : host.querySelector<HTMLElement>('[role="application"]');
	if (target === null) throw new Error("nowhere to press");
	await act(async () => {
		target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
	});
}

/** a turn in flight, which is when the Stop button is offered */
export async function running(canvas: ReturnType<typeof mount>, prompt = "start a habit tracker") {
	await canvas.render();
	await send(canvas.host, prompt);
	canvas.turn.push(waiting);
	canvas.turn.push(speaking);
	await settle();
}

/** the dot on the Agent tab, which says another thread has news (#364) */
export const elsewhere = (host: HTMLElement) =>
	// a dot on its way out is already gone, fading where it stood
	host.querySelector('[data-pane-tab="agent"] [data-pane-mark="elsewhere"]:not([data-pane-mark-state="leaving"])') !==
	null;

export const lifeOfCell = async (host: HTMLElement, name: string) =>
	(await cell(host, name))?.getAttribute("data-agent-thread-life");

/** the ring, the disc and the dot, counted inside the mark's own 14px box */
export const marks = async (host: HTMLElement, name: string) => {
	const mark = (await cell(host, name))?.querySelector("[data-agent-mark]");
	return {
		marked: mark !== null && mark !== undefined,
		turning: mark?.querySelectorAll(".animate-agent-spin").length ?? 0,
		drawn: mark?.children.length ?? 0,
	};
};

/** the ✕ on a row, which appears on hover and is off the ask so a miss opens rather than closes */
export const closeThread = async (host: HTMLElement, name: string) => {
	await cell(host, name);
	await press(threadList(host)?.querySelector(`[data-agent-thread-close="${name}"]`));
};

/** the words in the log, which is how a test says whose transcript is on screen */
export const log = (host: HTMLElement) => host.querySelector("[data-agent-log]")?.textContent ?? "";

export const camera = (host: HTMLElement) =>
	host.querySelector<HTMLElement>("[data-canvas-camera]")?.style.transform ?? "";

/** one whole turn, answered and settled, in the stream that is open */
export async function answerTurn(stream: { push: (event: AgentEvent) => void; close: () => void }, text: string) {
	stream.push(waiting);
	stream.push(speaking);
	stream.push({ kind: "said", text, parent: null });
	stream.push(ended);
	stream.push(closed);
	stream.close();
	await settle();
}

/** a project with as many restored threads in it as asked for, each with its own ask and frame */
export const written = (count: number): ServedThread[] =>
	Array.from({ length: count }, (_, at) =>
		storedThread({ id: `thread-${at}`, ask: `ask ${at}`, frame: `frame-${at}`, at }),
	);

/* ---------- the two ways there is no agent to talk to (#127, #201) ----------
 * Both are ordinary states of the rail rather than error paths, because spool spawns the
 * developer's own binary and reuses whatever login is already there. They are drawn as
 * different shapes because they are not knowable in the same way: whether a command is on
 * PATH is a fact about this machine, so it is known before anybody types and it is a wall;
 * whether it is signed in is a fact inside another product, so it is found out by spawning
 * and it is a strip over a log that still works. */

/** the wall, in the transcript's place */
export const wall = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-recovery="claude"]');

/** the standing half of being signed out, on the shelf */
export const outStrip = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-recovery="claude"]');

/** the one control either of these states offers, pressed and given time to answer */
export async function checkAgain(within: HTMLElement | null) {
	await press(within?.querySelector("[data-agent-check]"));
	await settle(100);
}

/** how many times the log holds one sentence, which for a held prompt has to be once */
export const said = (host: HTMLElement, text: string) =>
	(host.querySelector("[data-agent-log]")?.textContent?.split(text).length ?? 1) - 1;

/** the binary's own refusal, as the runner hands it back off a non-zero exit */
export const refused: AgentEvent = {
	kind: "closed",
	code: 1,
	message: "Not logged in · Please run /login",
	parent: null,
};
