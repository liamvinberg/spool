// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";
import { HOLD_PAINT_MS } from "./use-hand-edit";

/**
 * How a change from outside replaces a frame's document. A reload holds the
 * frame's last paint (#253's no blink): an agent's write to the frame and a save
 * to a shared file it reads each keep the outgoing document on screen until the
 * new one reports arrived, as the hand's own edits always did, and the bound
 * still lets go of one that never arrives. With Fast Refresh on, a swap the hand
 * came into while it ran is dropped and its reload waits for the hand to leave
 * (the rules themselves: `hot-updates.test.ts`).
 */

const frames = [{ name: "home", x: 0, y: 0, w: 640, h: 480 }];

it("holds the last paint through an outside save and a shared save, until arrival or the bound", async () => {
	const { host, change, post } = await readyCanvas();
	const held = () => host.querySelector('iframe[title="home (held)"]');
	const current = () => host.querySelector<HTMLIFrameElement>('iframe[title="home"]');

	// a document that never loaded has no paint to hold
	await change({ kind: "frame", frame: "home" });
	expect(held()).toBeNull();
	await post("loaded");

	// an agent's write: the loaded document stays on top until the next arrives
	const painted = current();
	await change({ kind: "frame", frame: "home" });
	expect(held()).toBe(painted);
	expect(current()).not.toBe(painted);
	// a second write before it arrived keeps the paint still standing
	await change({ kind: "frame", frame: "home" });
	expect(held()).toBe(painted);
	await post("loaded");
	await post("arrived");
	expect(held()).toBeNull();

	// a shared file it reads: the same hold, and the bound lets go of a document that never arrives
	await change({ kind: "shared", frames: ["home"] });
	expect(held()).not.toBeNull();
	await act(() => vi.advanceTimersByTimeAsync(HOLD_PAINT_MS - 100));
	expect(held()).not.toBeNull();
	await act(() => vi.advanceTimersByTimeAsync(100));
	expect(held()).toBeNull();
});

it("cancels a Fast Refresh swap the hand picks into while it runs, and reloads one that committed when the hand leaves", async () => {
	vi.stubGlobal("__SPOOL_EXPERIMENTS__", ["fast-refresh"]);
	const { host, canvas, change, post } = await readyCanvas();
	const current = () => host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
	const asked = (kind: string) =>
		vi
			.mocked(current()?.contentWindow?.postMessage ?? vi.fn())
			.mock.calls.map((call) => call[0] as { spool?: string; id?: number })
			.filter((message) => message.spool === kind)
			.at(-1);
	await post("loaded");
	// the first save reloads the plain document into a hot one, which the next swaps
	await change({ kind: "frame", frame: "home" });
	await post("loaded");
	await post("arrived");
	const hot = current();
	if (hot?.contentWindow == null) throw new Error("no document");
	vi.spyOn(hot.contentWindow, "postMessage");
	await change({ kind: "frame", frame: "home" });
	const offer = asked("hot");
	expect(offer?.id).toBeTypeOf("number");

	// the hand comes in while it runs: an element picked in the frame
	const ACCEL = navigator.platform.includes("Mac") ? { metaKey: true } : { ctrlKey: true };
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				button: 0,
				clientX: 40,
				clientY: 40,
				pointerId: 2,
				...ACCEL,
			}),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 2 }),
		);
	});
	const hit = {
		selector: "main",
		tag: "main",
		name: "Main",
		outerHtml: "<main />",
		rect: { x: 0, y: 0, w: 100, h: 80 },
		radius: 0,
		source: null,
		generated: false,
	};
	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { spool: "picked", frame: "home", id: asked("pick")?.id, chain: [hit] },
				source: hot.contentWindow,
			}),
		);
	});
	// the document is told to drop the swap, should it not have committed yet
	expect(asked("hot-cancel")?.id).toBe(offer?.id);
	// it had: the swap may predate the hand's next write, which is when the reload is paid, or else the hand leaving
	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { spool: "hot", frame: "home", id: offer?.id, ok: true },
				source: hot.contentWindow,
			}),
		);
	});
	// the swap is not kept, and the reload waits under the pick
	expect(current()).toBe(hot);
	// up from the element to its frame, then off it: the hand has left, and the frame is still on screen
	for (const _ of [1, 2]) {
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
		});
	}
	await act(() => vi.advanceTimersByTimeAsync(10));
	expect(current()).not.toBe(hot);
	expect(host.querySelector('iframe[title="home (held)"]')).toBe(hot);
});

async function readyCanvas(): Promise<{
	host: HTMLDivElement;
	canvas: HTMLElement;
	change: (event: Record<string, unknown>) => Promise<void>;
	post: (kind: "loaded" | "arrived") => Promise<void>;
}> {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	const streams = stubCanvasApis();
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});
	await act(async () => {
		root.render(createElement(ProjectCanvas, { project: "test", onChrome: () => {} }));
	});
	await until(() => host.querySelector('[data-frame-label="home"]') !== null);
	const canvas = host.querySelector<HTMLElement>('[role="application"]');
	if (canvas === null) throw new Error("canvas did not render");
	// selected, so live at any viewport size
	await act(async () => {
		for (const type of ["pointerdown", "pointerup"]) {
			canvas.dispatchEvent(
				new PointerEvent(type, { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
			);
		}
	});
	await until(() => host.querySelector('iframe[title="home"]') !== null);
	const bytes = new TextEncoder();
	return {
		host,
		canvas,
		change: async (event) => {
			await act(async () => {
				for (const stream of streams)
					stream.enqueue(bytes.encode(`event: change\ndata: ${JSON.stringify(event)}\n\n`));
				await vi.advanceTimersByTimeAsync(10);
			});
		},
		post: async (kind) => {
			await act(async () => {
				window.dispatchEvent(
					new MessageEvent("message", {
						data: { spool: kind, frame: "home" },
						source: host.querySelector<HTMLIFrameElement>('iframe[title="home"]')?.contentWindow ?? null,
					}),
				);
			});
		},
	};
}

function stubCanvasApis(): ReadableStreamDefaultController<Uint8Array>[] {
	const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			if (url.pathname.endsWith("/events")) {
				return new Response(
					new ReadableStream<Uint8Array>({ start: (controller) => void streams.push(controller) }),
					{
						headers: { "content-type": "text/event-stream" },
					},
				);
			}
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) return Response.json({ root: "/project", pages: [], frames });
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: ["home"], links: [], edges: [], unreadable: [] });
			}
			if (url.pathname.endsWith("/rungs")) return Response.json({ rungs: [] });
			return Response.json({});
		}),
	);
	// a viewport the frame sits inside, so it is live with nothing selected
	vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1280);
	vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
	vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);
	vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
	return streams;
}

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (done()) return;
		await act(() => vi.advanceTimersByTimeAsync(10));
	}
	throw new Error("canvas did not settle");
}
