// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";
import type { PickedHit } from "./protocol";

/**
 * The Comment tool's aim on a team canvas: a pin points at the deepest element under it, ↑ and ↓ climb out of it
 * and back in as far as the whole frame, and the frame's label points at the whole frame. Each test plays the frame,
 * answering its picks with an ancestry of its own.
 */

const frames = [{ name: "home", x: 0, y: 100, w: 640, h: 480 }];

/** main › footer › button, root element first, each one smaller and further in. */
const CHAIN: PickedHit[] = [
	["main", "main"],
	["footer", "main > footer"],
	["button", "main > footer > button"],
].map(([tag = "", selector = ""], depth) => ({
	selector,
	tag,
	outerHtml: `<${tag} />`,
	rect: { x: depth * 10, y: depth * 10, w: 300 - depth * 50, h: 200 - depth * 50 },
	radius: 0,
	source: null,
	generated: false,
}));

it("climbs out of the deepest element with ↑ and back in with ↓, and pins the level it is on", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await commentTool();

	await moveTo(canvas, 140, 240);
	await frame.answer(CHAIN);
	expect(outline(host)).toEqual({ w: 200, h: 100 });

	await press("ArrowUp");
	expect(outline(host)).toEqual({ w: 250, h: 150 });
	await press("ArrowUp");
	expect(outline(host)).toEqual({ w: 300, h: 200 });
	// past the top-level element: the whole frame
	await press("ArrowUp");
	expect(outline(host)).toEqual({ w: 640, h: 480 });
	await press("ArrowDown");
	await press("ArrowDown");
	expect(outline(host)).toEqual({ w: 250, h: 150 });

	await pressAt(canvas, 140, 240);
	await frame.answer(CHAIN);
	await until(() => host.querySelector("[data-comment-element]") !== null);
	expect(host.querySelector("[data-comment-element]")?.textContent).toBe("footer");
});

it("pins the whole frame from its label, with no element under the pin", async () => {
	const { host, frame } = await readyCanvas();
	await commentTool();
	const label = host.querySelector<HTMLElement>('[data-frame-label="home"]');
	if (label === null) throw new Error("no label");

	await act(async () => {
		label.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 20, clientY: 90, pointerId: 1 }));
	});
	expect(outline(host)).toEqual({ w: 640, h: 480 });

	const asked = frame.asks();
	await act(async () => {
		label.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 20, clientY: 90, pointerId: 1 }),
		);
		label.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 20, clientY: 90, pointerId: 1 }),
		);
	});
	await until(() => host.querySelector("[data-comment-composer]") !== null);
	expect(frame.asks()).toBe(asked);
	expect(host.querySelector("[data-comment-element]")).toBeNull();
	// on the frame, at its top edge under the press, not out on the field above it where the label is
	const pin = host.querySelector<HTMLElement>("[data-comment-ghost]");
	expect(pin?.style.left).toBe("20px");
	expect(parseFloat(pin?.style.top ?? "") + parseFloat(pin?.style.height ?? "")).toBe(100);
});

/** The size of the one faint outline the hover draws, at zoom 1. */
function outline(host: HTMLElement): { w: number; h: number } | null {
	const rings = host.querySelectorAll<HTMLElement>(".opacity-50");
	if (rings.length !== 1) return null;
	const ring = rings[0] as HTMLElement;
	return { w: parseFloat(ring.style.width) - 4, h: parseFloat(ring.style.height) - 4 };
}

async function commentTool(): Promise<void> {
	await press("c");
	await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
}

async function moveTo(canvas: HTMLElement, x: number, y: number): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
	});
}

async function pressAt(canvas: HTMLElement, x: number, y: number): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 }),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 }),
		);
	});
}

async function press(key: string): Promise<void> {
	await act(async () => {
		window.dispatchEvent(
			new KeyboardEvent("keydown", { key, code: `Key${key.toUpperCase()}`, bubbles: true, cancelable: true }),
		);
	});
}

interface FramePlayer {
	answer: (chain: PickedHit[]) => Promise<void>;
	asks: () => number;
}

async function readyCanvas(): Promise<{ host: HTMLDivElement; canvas: HTMLElement; frame: FramePlayer }> {
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

	// the frame has to be mounted and booted before it can answer anything
	await pressAt(canvas, 40, 140);
	await until(() => host.querySelector('iframe[title="home"]') !== null);
	const spies = new Map<Window, { mock: { calls: unknown[][] } }>();
	const live = (): Window | null => {
		const contentWindow = host.querySelector<HTMLIFrameElement>('iframe[title="home"]')?.contentWindow ?? null;
		if (contentWindow !== null && !spies.has(contentWindow))
			spies.set(contentWindow, vi.spyOn(contentWindow, "postMessage"));
		return contentWindow;
	};
	const contentWindow = live();
	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", { data: { spool: "loaded", frame: "home" }, source: contentWindow }),
		);
	});
	const picks = (): Record<string, unknown>[] => {
		live();
		return [...spies.values()]
			.flatMap((spy) => spy.mock.calls.map((call) => call[0]))
			.filter((message): message is Record<string, unknown> => typeof message === "object" && message !== null)
			.filter((message) => message.spool === "pick")
			.sort((a, b) => Number(a.id) - Number(b.id));
	};

	return {
		host,
		canvas,
		frame: {
			answer: async (chain) => {
				const ask = picks().at(-1);
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
			asks: () => picks().length,
		},
	};
}

function stubCanvasApis(): void {
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
			const raw = input instanceof Request ? input.url : String(input);
			const url = new URL(raw, window.location.href);
			// a team canvas, said once on a stream that stays open
			if (url.pathname.endsWith("/events")) {
				const hello = new TextEncoder().encode(`event: hello\ndata: ${JSON.stringify({ team: true })}\n\n`);
				return new Response(new ReadableStream<Uint8Array>({ start: (controller) => controller.enqueue(hello) }), {
					headers: { "content-type": "text/event-stream" },
				});
			}
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) return Response.json({ root: "/project", pages: [], frames });
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: ["home"], links: [], edges: [], unreadable: [] });
			}
			if (url.pathname.endsWith("/comments")) return Response.json({ comments: [], online: true });
			return Response.json({});
		}),
	);
	// a viewport the frame reads at, so its document stays up once the pin takes the hover away
	vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1280);
	vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
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
