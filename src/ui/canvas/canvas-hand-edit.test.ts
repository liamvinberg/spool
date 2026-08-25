// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import { ProjectCanvas } from "./canvas";
import type { PickedHit } from "./protocol";

/**
 * The write lane's two canvas gestures (#255), out on the canvas.
 *
 * A second click on a held element's words opens an edit on the element
 * itself; ⌫ on a held element takes its lines. Both ask the gate before
 * anything happens, both write through the lane, and both leave one press of
 * undo behind. The frame answers every ask here, so each test plays it: it
 * reads the message the canvas posted and replies as the shim would.
 */

const ACCEL_KEY = accelKeyName();
const ACCEL = ACCEL_KEY === "Meta" ? { metaKey: true } : { ctrlKey: true };

const frames = [{ name: "home", x: 0, y: 0, w: 640, h: 480, kind: "html" }];

const STAMP = "frames/home/frame.tsx:7:4";

/** The ancestry the frame answers with: a root element and the words in it. */
const CHAIN: PickedHit[] = [
	{
		selector: "screen",
		tag: "div",
		outerHtml: "<div />",
		rect: { x: 0, y: 0, w: 200, h: 120 },
		radius: 0,
		source: "frames/home/frame.tsx:5:3",
		generated: false,
	},
	{
		selector: "screen > h1",
		tag: "h1",
		outerHtml: "<h1>Pay now</h1>",
		rect: { x: 10, y: 10, w: 120, h: 40 },
		radius: 0,
		source: STAMP,
		generated: false,
	},
];

it("opens an edit on the second click, and writes what was typed", async () => {
	const { canvas, frame } = await readyCanvas();
	await holdTheWords(canvas, frame);

	// the second click: the press lands on the element that is already held
	await clickAt(canvas, 20, 20);
	await frame.answer(CHAIN);
	await settle();

	// the gate is asked before anything happens to the element
	expect(gateAsks().at(-1)).toEqual({
		frame: "home",
		ops: [{ kind: "set-text", source: STAMP, text: "" }],
	});
	const opened = frame.lastEdit();
	expect(opened).toMatchObject({ selector: "screen > h1", x: 20, y: 20 });

	await frame.opened(opened?.id, "Pay now");
	await frame.ended(opened?.id, true, "Pay later");
	await settle();

	expect(writes().at(-1)).toEqual({
		frame: "home",
		fingerprint: "abc",
		ops: [{ kind: "set-text", source: STAMP, text: "Pay later" }],
	});

	// one gesture is one press of undo, and it runs the patch the write left
	await press("z", ACCEL);
	await settle();
	expect(reverts().at(-1)).toMatchObject({ path: "design/frames/home/frame.tsx", text: "Pay now" });
});

it("writes nothing when Esc ended it, and nothing when the words did not change", async () => {
	const { canvas, frame } = await readyCanvas();
	await holdTheWords(canvas, frame);

	await clickAt(canvas, 20, 20);
	await frame.answer(CHAIN);
	await settle();
	const first = frame.lastEdit();
	await frame.opened(first?.id, "Pay now");
	await frame.ended(first?.id, false, "Pay later");
	await settle();
	expect(writes()).toHaveLength(0);

	await clickAt(canvas, 20, 20);
	await frame.answer(CHAIN);
	await settle();
	const again = frame.lastEdit();
	await frame.opened(again?.id, "Pay now");
	await frame.ended(again?.id, true, "Pay now");
	await settle();
	expect(writes()).toHaveLength(0);
});

// the two the ticket names for text: the expression is named, and the words of
// a mapped row are data rather than design
const TEXT_REFUSALS = [
	{ code: "expression-text", says: "the text is an expression", expression: "{total}" },
	{ code: "mapped-text", says: "the words are data, not design" },
];

it.each(TEXT_REFUSALS)("shows $code and opens no edit when the gate refuses", async (refusal) => {
	const { host, canvas, frame } = await readyCanvas();
	gate = { ok: false, refusal };
	await holdTheWords(canvas, frame);

	await clickAt(canvas, 20, 20);
	await frame.answer(CHAIN);
	await settle();

	expect(frame.lastEdit()).toBeUndefined();
	const shown = host.querySelector(`[data-hand-refusal="${refusal.code}"]`);
	expect(shown?.textContent).toBe([refusal.says, refusal.expression].filter(Boolean).join(" "));
});

it("takes the held element's lines on ⌫, and the frame's own when no rung is open", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheWords(canvas, frame);

	await press("Backspace");
	await settle();
	expect(gateAsks().at(-1)).toEqual({ frame: "home", ops: [{ kind: "delete", source: STAMP }] });
	expect(writes().at(-1)).toEqual({
		frame: "home",
		fingerprint: "abc",
		ops: [{ kind: "delete", source: STAMP }],
	});
	// silent, like every other patch: no toast stands between it and undo
	expect(host.querySelector('[data-frame-label="home"]')).not.toBeNull();

	// with the rung climbed away the key is the frame's trash again
	await press("Enter", { shiftKey: true });
	await press("Enter", { shiftKey: true });
	await press("Backspace");
	await settle();
	expect(host.querySelector('[data-frame-label="home"]')).toBeNull();
});

// and the two it names for delete: an element that is not a whole child, and
// one a shared component defines rather than this frame
const DELETE_REFUSALS = [
	{ code: "not-a-child", says: "not a whole child of its parent" },
	{ code: "shared-definition", says: "defined in shared/ui/card.tsx:2, rendered by 4 frames" },
];

it.each(DELETE_REFUSALS)("refuses a delete the lane will not take ($code), and says why", async (refusal) => {
	const { host, canvas, frame } = await readyCanvas();
	gate = { ok: false, refusal };
	await holdTheWords(canvas, frame);

	await press("Backspace");
	await settle();
	expect(writes()).toHaveLength(0);
	expect(host.querySelector(`[data-hand-refusal="${refusal.code}"]`)?.textContent).toBe(refusal.says);
});

it("holds the last paint while the document a write reloaded boots behind it", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheWords(canvas, frame);

	await press("Backspace");
	await settle();
	expect(host.querySelectorAll('iframe[title="home (held)"]')).toHaveLength(0);

	// the watcher's own event, which is how every source edit reaches the canvas
	await act(async () => {
		reload?.({ kind: "frame", frame: "home" });
		await new Promise((resolve) => setTimeout(resolve, 30));
	});
	// the outgoing document stands, and no still is drawn over it
	expect(host.querySelectorAll('iframe[title="home (held)"]')).toHaveLength(1);
	expect(host.querySelector<HTMLElement>('[data-frame-cover="home"]')?.style.opacity ?? "0").toBe("0");

	await frame.boot();
	expect(host.querySelectorAll('iframe[title="home (held)"]')).toHaveLength(0);
});

// --- the harness -------------------------------------------------------------

type Gate =
	| { ok: true; path: string; fingerprint: string; mapped: boolean }
	| { ok: false; refusal: { code: string; says: string; expression?: string } };

let gate: Gate = { ok: true, path: "design/frames/home/frame.tsx", fingerprint: "abc", mapped: false };
let reload: ((event: { kind: string; frame?: string }) => void) | undefined;

interface FramePlayer {
	answer: (chain: readonly PickedHit[]) => Promise<void>;
	lastEdit: () => { id: number; selector: string; x: number; y: number } | undefined;
	opened: (id: number | undefined, text: string) => Promise<void>;
	ended: (id: number | undefined, commit: boolean, text: string) => Promise<void>;
	boot: () => Promise<void>;
}

/** Descend to the words, which is the rung both gestures act on. */
async function holdTheWords(canvas: HTMLElement, frame: FramePlayer): Promise<void> {
	await clickAt(canvas, 20, 20);
	for (const _ of [0, 1]) {
		await doubleClickAt(canvas, 20, 20);
		await frame.answer(CHAIN);
	}
	await settle();
}

async function readyCanvas(): Promise<{ host: HTMLDivElement; canvas: HTMLElement; frame: FramePlayer }> {
	gate = { ok: true, path: "design/frames/home/frame.tsx", fingerprint: "abc", mapped: false };
	reload = undefined;
	stubCanvasApis();
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	await act(async () => {
		root.render(createElement(ProjectCanvas, { project: "test", onChrome: () => {} }));
	});
	await until(() => host.querySelector('[data-frame-label="home"]') !== null);
	const canvas = host.querySelector<HTMLElement>('[role="application"]');
	if (canvas === null) throw new Error("canvas did not render");

	await clickAt(canvas, 20, 20);
	await until(() => host.querySelector('iframe[title="home"]') !== null);

	const spies = new Map<Window, { mock: { calls: unknown[][] } }>();
	const live = (): Window | null => {
		const contentWindow = host.querySelector<HTMLIFrameElement>('iframe[title="home"]')?.contentWindow ?? null;
		if (contentWindow !== null && !spies.has(contentWindow)) {
			spies.set(contentWindow, vi.spyOn(contentWindow, "postMessage"));
		}
		return contentWindow;
	};
	const boot = async () => {
		const contentWindow = live();
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", { data: { spool: "loaded", frame: "home" }, source: contentWindow }),
			);
		});
	};
	await boot();

	const asks = (kinds: readonly string[]): Record<string, unknown>[] => {
		live();
		return [...spies.values()]
			.flatMap((spy) => spy.mock.calls.map((call) => call[0]))
			.filter((message): message is Record<string, unknown> => typeof message === "object" && message !== null)
			.filter((message) => kinds.includes(String(message.spool)))
			.sort((a, b) => Number(a.id) - Number(b.id));
	};
	const reply = async (data: Record<string, unknown>) => {
		await act(async () => {
			window.dispatchEvent(new MessageEvent("message", { data, source: live() }));
		});
	};

	return {
		host,
		canvas,
		frame: {
			answer: async (chain) => {
				const ask = asks(["pick", "kin"]).at(-1);
				expect(ask).toBeDefined();
				await reply({ spool: "picked", frame: "home", id: ask?.id, chain });
			},
			lastEdit: () => {
				const edit = asks(["edit"]).at(-1);
				return edit === undefined
					? undefined
					: { id: Number(edit.id), selector: String(edit.selector), x: Number(edit.x), y: Number(edit.y) };
			},
			opened: async (id, text) => {
				await reply({ spool: "edit-open", frame: "home", id, ok: true, text });
			},
			ended: async (id, commit, text) => {
				await reply({ spool: "edited", frame: "home", id, commit, text });
			},
			boot,
		},
	};
}

/** Every body the canvas has posted to one lane door. */
function posted(suffix: string): Record<string, unknown>[] {
	const calls = (globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls;
	return calls
		.filter(([input, init]) => String(input).endsWith(suffix) && init?.method === "POST")
		.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

const gateAsks = () => posted("/patch/gate");
const reverts = () => posted("/patch/revert");
const writes = () => posted("/patch");

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

async function doubleClickAt(canvas: HTMLElement, x: number, y: number): Promise<void> {
	await clickAt(canvas, x, y, 91);
	await clickAt(canvas, x, y, 92);
	await act(async () => {
		canvas.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: x, clientY: y }));
	});
}

async function press(key: string, modifiers: Record<string, boolean> = {}): Promise<void> {
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }));
	});
}

/** The lane's round trips are fetches: let them land before reading. */
async function settle(): Promise<void> {
	await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
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
		vi.fn(async (input: RequestInfo | URL) => {
			const raw = input instanceof Request ? input.url : String(input);
			const url = new URL(raw, window.location.href);
			if (url.pathname.endsWith("/events")) {
				// the watcher's own channel, held open so a test can fire one edit
				return new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							const bytes = new TextEncoder();
							reload = (event) => {
								controller.enqueue(bytes.encode(`event: change\ndata: ${JSON.stringify(event)}\n\n`));
							};
						},
					}),
					{ headers: { "content-type": "text/event-stream" } },
				);
			}
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) {
				return Response.json({ root: "/project", pages: [], frames, collisions: [] });
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: ["home"], links: [], edges: [], unreadable: [] });
			}
			if (url.pathname.endsWith("/patch/gate")) return Response.json(gate);
			if (url.pathname.endsWith("/patch/revert")) {
				return Response.json({
					ok: true,
					path: "design/frames/home/frame.tsx",
					fingerprint: "def",
					undo: { path: "design/frames/home/frame.tsx", start: 0, end: 9, text: "Pay later", fingerprint: "def" },
				});
			}
			if (url.pathname.endsWith("/patch")) {
				return Response.json({
					ok: true,
					path: "design/frames/home/frame.tsx",
					fingerprint: "def",
					mapped: false,
					undo: { path: "design/frames/home/frame.tsx", start: 0, end: 9, text: "Pay now", fingerprint: "def" },
				});
			}
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
	vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);
	vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
}

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
