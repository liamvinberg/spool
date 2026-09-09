// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import type { SourceRead } from "../../source-edit";
import { ProjectCanvas } from "./canvas";
import type { ElementSizing, PickedHit } from "./protocol";

/**
 * Moving the held element with the keyboard (#308), out on the canvas.
 *
 * One arrow means one of two things and the document decides which: an element
 * the file already places freely moves by a pixel, and an element its parent
 * lays out moves one place along the row it is in. Holding the key is one
 * gesture either way: one save, one press of undo. Escape retires it, and the
 * frame's own nudge is left exactly as it was for a canvas selection.
 */

const ACCEL = accelKeyName() === "Meta" ? { metaKey: true } : { ctrlKey: true };

const frames = [{ name: "home", x: 0, y: 0, w: 640, h: 480 }];

const STAMP = "frames/home/frame.tsx:7:4";

const ORIGINAL = {
	publication: "publication",
	cell: "className",
	occurrence: "occurrence",
	invocation: "invocation",
	context: "context",
	value: "",
};

const FLOW_SIZING: ElementSizing = {
	units: { rem: 16, em: 16 },
	box: { w: 200, h: 120 },
	extra: { w: 0, h: 0 },
	free: false,
	flow: { axis: "row", reversed: false },
	offset: { left: null, top: null },
	limits: { minW: 0, minH: 0, maxW: null, maxH: null },
};

const FREE_SIZING: ElementSizing = {
	...FLOW_SIZING,
	free: true,
	flow: { axis: null, reversed: false },
	offset: { left: 40, top: 24 },
};

let sizing: ElementSizing = FLOW_SIZING;

const chain = (): PickedHit[] => [
	{
		selector: "screen",
		tag: "div",
		outerHtml: "<div />",
		rect: { x: 0, y: 0, w: 400, h: 300 },
		radius: 0,
		source: "frames/home/frame.tsx:5:3",
		generated: false,
	},
	{
		selector: "screen > article",
		tag: "article",
		outerHtml: "<article />",
		rect: { x: 10, y: 10, w: 200, h: 120 },
		radius: 0,
		source: STAMP,
		generated: false,
	},
];

it("moves the held element one place later among its siblings, once, on release", async () => {
	const { canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await keyDown("ArrowRight");
	await settle();
	// nothing is written while the key is down
	expect(sourceCalls("commit")).toHaveLength(0);
	await keyUp("ArrowRight");
	await settle();

	expect(sourceCalls("read").at(-1)).toMatchObject({ operation: { kind: "reorder", steps: 1 } });
	expect(sourceCalls("commit")).toHaveLength(1);
	expect(sourceCalls("commit").at(-1)).toMatchObject({ change: { kind: "reorder" } });

	// one gesture is one press of undo
	await keyDown("z", ACCEL);
	await settle();
	expect(sourceCalls("inverse")).toHaveLength(1);
});

it("counts a held key as one move of as many places as it repeated", async () => {
	const { canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await keyDown("ArrowRight");
	await keyDown("ArrowRight", { repeat: true });
	await keyDown("ArrowRight", { repeat: true });
	await settle();
	await keyUp("ArrowRight");
	await settle();

	expect(sourceCalls("commit")).toHaveLength(1);
	expect(sourceCalls("read").at(-1)).toMatchObject({ operation: { kind: "reorder", steps: 3 } });
});

it("reads a reversed row backwards, so forward on screen is earlier in the source", async () => {
	sizing = { ...FLOW_SIZING, flow: { axis: "row", reversed: true } };
	const { canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await keyDown("ArrowRight");
	await keyUp("ArrowRight");
	await settle();

	expect(sourceCalls("read").at(-1)).toMatchObject({ operation: { kind: "reorder", steps: -1 } });
});

it("gives the reply that arrives late to the gesture that asked for it", async () => {
	sizing = FREE_SIZING;
	const { canvas, frame, holdSizing, releaseSizing } = await readyCanvas();
	await holdTheElement(canvas, frame);

	// the second arrow ends the first gesture before the document has answered
	// it; the answer it was waiting for belongs to nothing now
	holdSizing();
	await keyDown("ArrowRight");
	await keyDown("ArrowDown");
	await releaseSizing();
	await settle();
	await keyUp("ArrowDown");
	await settle();

	expect(sourceCalls("commit")).toHaveLength(1);
	expect(sourceCalls("commit").at(-1)).toMatchObject({
		change: {
			kind: "properties",
			value: { kind: "fields", changes: [{ property: "top", value: { kind: "binding", tokens: ["top-[25px]"] } }] },
		},
	});
});

it("saves nothing when Escape retires the held key", async () => {
	const { canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await keyDown("ArrowRight");
	await settle();
	await keyDown("Escape");
	await keyUp("ArrowRight");
	await settle();

	expect(sourceCalls("commit")).toHaveLength(0);
});

it("leaves the position to the parent layout when the arrow is across its axis", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await keyDown("ArrowDown");
	await settle();
	await keyUp("ArrowDown");
	await settle();

	expect(host.querySelector('[data-hand-refusal="source"]')?.textContent).toBe(
		"the parent layout decides this position; use its alignment or spacing",
	);
	expect(sourceCalls("commit")).toHaveLength(0);
	expect(sourceCalls("read")).toHaveLength(0);
});

it("nudges an already free element by a pixel, and by ten with shift", async () => {
	sizing = FREE_SIZING;
	const { canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await keyDown("ArrowRight");
	await settle();
	expect(sourceCalls("preview").length).toBeGreaterThan(0);
	expect(sourceCalls("commit")).toHaveLength(0);
	await keyUp("ArrowRight");
	await settle();

	expect(sourceCalls("commit").at(-1)).toMatchObject({
		change: {
			kind: "properties",
			value: {
				kind: "fields",
				changes: [{ property: "left", value: { kind: "binding", tokens: ["left-[41px]"] } }],
			},
		},
	});

	await keyDown("ArrowDown", { shiftKey: true });
	await keyUp("ArrowDown");
	await settle();

	expect(sourceCalls("commit").at(-1)).toMatchObject({
		change: {
			kind: "properties",
			value: { kind: "fields", changes: [{ property: "top", value: { kind: "binding", tokens: ["top-[34px]"] } }] },
		},
	});
});

it("puts the preview back and saves nothing when Escape retires a nudge", async () => {
	sizing = FREE_SIZING;
	const { canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await keyDown("ArrowRight");
	await settle();
	await keyDown("Escape");
	await settle();
	await keyUp("ArrowRight");
	await settle();

	expect(sourceCalls("commit")).toHaveLength(0);
	expect(sourceCalls("cancel").length).toBeGreaterThan(0);
});

it("refuses a placement the file writes in a form no key can move", async () => {
	sizing = FREE_SIZING;
	rung = { source: STAMP, name: "article", className: "left-1/2", path: "design/frames/home/frame.tsx", line: 7 };
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await keyDown("ArrowRight");
	await settle();
	await keyUp("ArrowRight");
	await settle();

	expect(host.querySelector('[data-hand-refusal="authored-unit"]')?.textContent).toBe(
		"left-1/2 is what the layout decides, not a length a drag can move",
	);
	expect(sourceCalls("commit")).toHaveLength(0);
});

it("leaves the frame's own nudge to the frames when no element is held", async () => {
	const { canvas } = await readyCanvas();
	await clickAt(canvas, 20, 20);
	await settle();

	await keyDown("ArrowRight");
	await keyUp("ArrowRight");
	// the frame's own nudge settles its move on the geometry it keeps
	await act(() => new Promise((resolve) => setTimeout(resolve, 600)));

	expect(sourceCalls("read")).toHaveLength(0);
	expect(sourceCalls("commit")).toHaveLength(0);
	expect(sent("/geometry", "PUT").at(-1)).toMatchObject({ frames: { home: { x: 1 } } });
});

// --- the harness -------------------------------------------------------------

interface RungRead {
	source: string;
	name?: string;
	className: string;
	path?: string;
	line?: number;
	refusal?: { code: string; says: string };
}

const THEME = {
	colour: [],
	text: [],
	weight: [],
	font: [],
	leading: [],
	tracking: [],
	radius: [],
	shadow: [],
	ease: [],
	screen: [{ name: "md", value: "48rem", from: "default" }],
	step: 4,
};

let rung: RungRead = {
	source: STAMP,
	name: "article",
	className: "p-4",
	path: "design/frames/home/frame.tsx",
	line: 7,
};

let sourceRead: SourceRead | undefined;

interface FramePlayer {
	answer: (chain: readonly PickedHit[]) => Promise<void>;
}

/** Hold the element the ring is drawn on, and let its read land. */
async function holdTheElement(canvas: HTMLElement, frame: FramePlayer): Promise<void> {
	await clickAt(canvas, 20, 20);
	await deepClickAt(canvas, 20, 20);
	await frame.answer(chain());
	await settle();
}

async function readyCanvas(): Promise<{
	host: HTMLDivElement;
	canvas: HTMLElement;
	frame: FramePlayer;
	holdSizing: () => void;
	releaseSizing: () => Promise<void>;
}> {
	sourceRead = undefined;
	stubCanvasApis();
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		rung = { source: STAMP, name: "article", className: "p-4", path: "design/frames/home/frame.tsx", line: 7 };
		sizing = FLOW_SIZING;
	});

	await act(async () => {
		root.render(createElement(ProjectCanvas, { project: "test", onChrome: () => {} }));
	});
	await until(() => host.querySelector('[data-frame-label="home"]') !== null);
	const canvas = host.querySelector<HTMLElement>('[role="application"]');
	if (canvas === null) throw new Error("canvas did not render");

	await clickAt(canvas, 20, 20);
	await until(() => host.querySelector('iframe[title="home"]') !== null);

	let held: (() => void)[] | null = null;
	const spies = new Map<Window, { mock: { calls: unknown[][] } }>();
	const live = (): Window | null => {
		const contentWindow = host.querySelector<HTMLIFrameElement>('iframe[title="home"]')?.contentWindow ?? null;
		if (contentWindow !== null && !spies.has(contentWindow)) {
			spies.set(
				contentWindow,
				vi.spyOn(contentWindow, "postMessage").mockImplementation((message) => {
					const answer = (data: Record<string, unknown>) =>
						queueMicrotask(() =>
							window.dispatchEvent(new MessageEvent("message", { source: contentWindow, data })),
						);
					if (message?.spool === "sizing") {
						const reply = () => answer({ spool: "sized", frame: "home", id: message.id, sizing });
						if (held === null) reply();
						else held.push(reply);
						return;
					}
					if (message?.spool !== "source-request") return;
					const result =
						message.action === "read" || message.action === "inspect" || message.action === "complete"
							? ORIGINAL
							: message.action === "inventory"
								? {
										publication: ORIGINAL.publication,
										uses: [{ original: ORIGINAL, visible: true }],
										unknown: 0,
									}
								: true;
					answer({ spool: "source-reply", id: message.id, result });
				}),
			);
		}
		return contentWindow;
	};
	await act(async () => {
		window.dispatchEvent(new MessageEvent("message", { data: { spool: "loaded", frame: "home" }, source: live() }));
	});

	return {
		host,
		canvas,
		/** Keep the document's answers back, so a second press can beat the first reply. */
		holdSizing: () => {
			held = [];
		},
		releaseSizing: async () => {
			const waiting = held ?? [];
			held = null;
			await act(async () => {
				for (const reply of waiting) reply();
			});
		},
		frame: {
			answer: async (chain) => {
				live();
				const ask = [...spies.values()]
					.flatMap((spy) => spy.mock.calls.map((call) => call[0]))
					.filter((message): message is Record<string, unknown> => typeof message === "object" && message !== null)
					.filter((message) => message.spool === "pick" || message.spool === "kin")
					.sort((a, b) => Number(a.id) - Number(b.id))
					.at(-1);
				expect(ask).toBeDefined();
				await act(async () => {
					window.dispatchEvent(
						new MessageEvent("message", {
							data: { spool: "picked", frame: "home", id: ask?.id, chain },
							source: live(),
						}),
					);
				});
			},
		},
	};
}

function sent(suffix: string, method: string): Record<string, unknown>[] {
	const calls = (globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls;
	return calls
		.filter(([input, init]) => String(input).endsWith(suffix) && init?.method === method)
		.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

const sourceCalls = (action: string) => sent("/source", "POST").filter((body) => body.action === action);

async function clickAt(canvas: HTMLElement, x: number, y: number, pointerId = 1): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId }),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId }),
		);
	});
}

/** The chord that holds the deepest rung of whatever ancestry the frame answers with. */
async function deepClickAt(canvas: HTMLElement, x: number, y: number): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1, ...ACCEL }),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 }),
		);
	});
}

async function keyDown(key: string, modifiers: Record<string, boolean> = {}): Promise<void> {
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }));
	});
}

async function keyUp(key: string): Promise<void> {
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
	});
}

async function settle(): Promise<void> {
	await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
}

async function until(ready: () => boolean, ms = 2000): Promise<void> {
	const deadline = Date.now() + ms;
	while (!ready()) {
		if (Date.now() > deadline) throw new Error("timed out");
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
}

function stubCanvasApis(): void {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	vi.stubGlobal("open", vi.fn());
	const setAttribute = HTMLIFrameElement.prototype.setAttribute;
	vi.spyOn(HTMLIFrameElement.prototype, "setAttribute").mockImplementation(function (
		this: HTMLIFrameElement,
		name,
		value,
	) {
		setAttribute.call(this, name, name === "src" ? "about:blank" : value);
	});
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const raw = input instanceof Request ? input.url : String(input);
			const url = new URL(raw, window.location.href);
			if (url.pathname.endsWith("/events")) {
				return new Response(new ReadableStream<Uint8Array>({ start() {} }), {
					headers: { "content-type": "text/event-stream" },
				});
			}
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) {
				return Response.json({ root: "/project", pages: [], frames, collisions: [] });
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: ["home"], links: [], edges: [], unreadable: [] });
			}
			if (url.pathname.endsWith("/source")) {
				const body = JSON.parse(String(init?.body)) as {
					action: string;
					generation: number;
					revision?: number;
					operation?: { kind: string };
				};
				if (body.action === "read") {
					sourceRead = {
						operation: body.operation,
						handle: "read",
						owner: "owner",
						generation: body.generation,
						original: ORIGINAL,
						source: STAMP,
						role: body.operation?.kind === "reorder" ? "structural-unit" : "class-cell",
						value: "",
					} as unknown as SourceRead;
					return Response.json({ ok: true, read: sourceRead });
				}
				if (body.action === "reach")
					return Response.json(sourceRead ? { ok: true, read: sourceRead } : { ok: false, reason: "no read" });
				if (body.action === "preview")
					return Response.json({
						ok: true,
						preview: { generation: body.generation, revision: body.revision ?? 1, value: "", frames: [] },
					});
				if (body.action === "commit" || body.action === "inverse")
					return Response.json({
						ok: true,
						source: "saved",
						publication: null,
						receipt: { owner: "owner", handle: "receipt", operation: { kind: "reorder", steps: 1 } },
					});
				return Response.json({ ok: true });
			}
			if (url.pathname.endsWith("/rungs")) {
				const asked = JSON.parse(String(init?.body)) as { sources: string[] };
				const rungs = asked.sources.map((source, at) =>
					at === asked.sources.length - 1
						? { ...rung, source }
						: { source, name: "div", className: "flex", path: "design/frames/home/frame.tsx", line: 5 },
				);
				return Response.json({ rungs });
			}
			if (url.pathname.endsWith("/theme")) return Response.json({ theme: THEME });
			if (url.pathname.endsWith("/theme/classes")) return Response.json({ compiled: [] });
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
}
