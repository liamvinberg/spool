// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";

/**
 * One session per page: the canvas is the bus between the sandboxed
 * frames on a page and the memory a frame booting onto it joins. What is
 * asserted here is the wiring: a write fans out to the siblings on the page and
 * to nobody else, never back to its writer, and the next boot's handshake is
 * answered with it.
 */

const frames = [
	{ name: "a", x: 0, y: 0, w: 100, h: 100, cover: { hash: "a".repeat(32) } },
	// no cover, so the canvas borrows it to make one (#112): a mounted sibling
	{ name: "b", x: 160, y: 0, w: 100, h: 100 },
	{ name: "c", page: "shop", x: 0, y: 0, w: 100, h: 100, cover: { hash: "c".repeat(32) } },
];

const openEventStream = () =>
	new Response(new ReadableStream<Uint8Array>({ start: () => {} }), {
		headers: { "content-type": "text/event-stream" },
	});

describe("page session", () => {
	it("fans a frame's write out to the page and answers the next boot with it", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
				if (url.pathname.endsWith("/events")) return openEventStream();
				if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
				if (url.pathname.endsWith("/frames")) {
					return Response.json({ root: "/project", pages: ["shop"], frames, collisions: [] });
				}
				if (url.pathname.endsWith("/flows")) {
					return Response.json({ frames: frames.map(({ name }) => name), links: [], edges: [], unreadable: [] });
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
		const nativeSetAttribute = HTMLIFrameElement.prototype.setAttribute;
		vi.spyOn(HTMLIFrameElement.prototype, "setAttribute").mockImplementation(function (
			this: HTMLIFrameElement,
			name,
			value,
		) {
			nativeSetAttribute.call(this, name, name === "src" ? "about:blank" : value);
		});
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
			callback(performance.now() + 1000);
			return 1;
		});
		vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});

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
		await until(() => host.querySelector('[data-frame-label="a"]') !== null);
		const canvas = host.querySelector<HTMLElement>('[role="application"]');
		if (canvas === null) throw new Error("canvas did not render");

		// a is entered, so its document runs; b is borrowed for its picture — two mounted documents
		await select(canvas, 40, false);
		await act(async () => {
			host
				.querySelector<HTMLElement>('[data-frame-label="a"]')
				?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 40, clientY: 40 }));
		});
		await until(
			() => host.querySelector('iframe[title="a"]') !== null && host.querySelector('iframe[title="b"]') !== null,
		);
		const a = host.querySelector<HTMLIFrameElement>('iframe[title="a"]')?.contentWindow;
		const b = host.querySelector<HTMLIFrameElement>('iframe[title="b"]')?.contentWindow;
		if (a == null || b == null) throw new Error("frames did not mount");
		const aPost = vi.spyOn(a, "postMessage");
		const bPost = vi.spyOn(b, "postMessage");
		const stateCalls = (post: typeof bPost) =>
			post.mock.calls.filter(([data]) => (data as { spool?: string }).spool === "state");
		const post = (data: Record<string, unknown>, source: Window) =>
			act(async () => {
				window.dispatchEvent(new MessageEvent("message", { data, source }));
			});

		// a's write reaches b, the sibling on its page
		await post({ spool: "state", frame: "a", scenario: "default", state: { turn: 2 } }, a);
		expect(stateCalls(bPost)).toEqual([[{ spool: "state", state: { turn: 2 } }, "*"]]);
		expect(stateCalls(aPost)).toEqual([]);

		// b's own write reaches a and is never sent back to b
		await post({ spool: "state", frame: "b", scenario: "default", state: { turn: 3 } }, b);
		expect(stateCalls(aPost)).toEqual([[{ spool: "state", state: { turn: 3 } }, "*"]]);
		expect(stateCalls(bPost)).toHaveLength(1);

		// the page remembers: a frame booting onto it is handed what was last written there
		await post({ spool: "session?", frame: "b" }, b);
		expect(bPost.mock.calls.filter(([data]) => (data as { spool?: string }).spool === "session")).toEqual([
			[{ spool: "session", record: { scenario: "default", state: { turn: 3 }, stack: [] } }, "*"],
		]);
	});
});

async function select(canvas: HTMLElement, x: number, shiftKey: boolean): Promise<void> {
	await act(async () => {
		for (const type of ["pointerdown", "pointerup"]) {
			canvas.dispatchEvent(
				new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: 40, pointerId: x, shiftKey }),
			);
		}
	});
}

async function until(done: () => boolean, ms = 2000): Promise<void> {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
