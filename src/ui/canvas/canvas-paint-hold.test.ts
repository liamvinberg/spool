// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";
import { HOLD_PAINT_MS } from "./use-hand-edit";

/**
 * A reload from outside holds the frame's last paint (#253's no blink): an
 * agent's write to the frame and a save to a shared file it reads each keep the
 * outgoing document on screen until the new one reports arrived, as the hand's
 * own edits always did, and the bound still lets go of one that never arrives.
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

async function readyCanvas(): Promise<{
	host: HTMLDivElement;
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
