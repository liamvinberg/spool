// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";

const frames = [
	{ name: "origin", x: 0, y: 0, w: 100, h: 100 },
	{ name: "right", x: 180, y: 0, w: 100, h: 100 },
];

/**
 * The events door, answered the way the daemon answers it: a body that stays open.
 *
 * `subscribeSse` reads this stream over `fetch`, so a door that hands back a finished
 * body is a connection that dropped the instant it opened. It reconnects on a 250-500ms
 * backoff and, because every connection after the first is a return, tells the canvas to
 * resync each time — and a resync reloads every frame document, which drops the picks.
 * Left finished, that is a reconnect storm wiping the standing these tests assert on,
 * roughly every other run. A stream nobody ends is one connection and no returns.
 */
const openEventStream = () =>
	new Response(new ReadableStream<Uint8Array>({ start: () => {} }), {
		headers: { "content-type": "text/event-stream" },
	});

describe("canvas keyboard navigation", () => {
	it("returns from an entered frame, moves spatially, and enters the target without walking", async () => {
		const requests: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const raw = input instanceof Request ? input.url : String(input);
				const url = new URL(raw, window.location.href);
				requests.push(url.pathname);
				if (url.pathname.endsWith("/events")) return openEventStream();
				if (url.pathname.endsWith("/state")) {
					return Response.json({ camera: { x: 0, y: 0, k: 1 } });
				}
				if (url.pathname.endsWith("/frames")) {
					return Response.json({ root: "/project", pages: [], frames, collisions: [] });
				}
				if (url.pathname.endsWith("/flows"))
					return Response.json({ frames: frames.map(({ name }) => name), links: [], edges: [], unreadable: [] });
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
			act(() => root.unmount());
			host.remove();
			vi.unstubAllGlobals();
			vi.restoreAllMocks();
		});

		await act(async () => {
			root.render(createElement(ProjectCanvas, { project: "test", onChrome: () => {} }));
		});
		await until(() => host.querySelector('[data-frame-label="origin"]') !== null);
		const canvas = host.querySelector<HTMLElement>('[role="application"]');
		expect(canvas).not.toBeNull();

		await act(async () => {
			canvas?.dispatchEvent(
				new PointerEvent("pointerdown", {
					bubbles: true,
					button: 0,
					clientX: 50,
					clientY: 50,
					pointerId: 1,
				}),
			);
			canvas?.dispatchEvent(
				new PointerEvent("pointerup", {
					bubbles: true,
					button: 0,
					clientX: 50,
					clientY: 50,
					pointerId: 1,
				}),
			);
			// the label, not the body: a body double-click descends a rung (#254)
			host
				.querySelector<HTMLElement>('[data-frame-label="origin"]')
				?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 50, clientY: 50 }));
		});
		expect(labelText(host, "origin")).toContain("live · esc exits");
		const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="origin"]');

		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { spool: "key", frame: "origin", key: "Escape" },
					source: iframe?.contentWindow ?? null,
				}),
			);
		});
		expect(document.activeElement).toBe(canvas);
		expect(labelClass(host, "origin")).toContain("text-thread");

		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true }));
		});
		expect(labelClass(host, "right")).toContain("text-thread");

		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		});
		expect(labelText(host, "right")).toContain("live · esc exits");
		expect(requests.some((path) => path.endsWith("/walked"))).toBe(false);
	});

	it("ctrl+o returns to the walk's departure and ctrl+i retraces it", async () => {
		const cover = { hash: "c".repeat(32) };
		const selections: Array<{
			frames?: string[];
			elements?: Array<{ frame: string; selector: string }>;
		}> = [];
		const walkFrames = [
			{ name: "origin", x: 0, y: 0, w: 100, h: 100, cover },
			{ name: "right", x: 180, y: 0, w: 100, h: 100, cover },
		];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const raw = input instanceof Request ? input.url : String(input);
				const url = new URL(raw, window.location.href);
				if (url.pathname.endsWith("/events")) return openEventStream();
				if (url.pathname.endsWith("/selection") && init?.method === "PUT") {
					selections.push(JSON.parse(String(init.body)));
					return Response.json({ selection: [] });
				}
				if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
				if (url.pathname.endsWith("/frames")) {
					return Response.json({ root: "/project", pages: [], frames: walkFrames, collisions: [] });
				}
				if (url.pathname.endsWith("/flows")) {
					return Response.json({
						frames: walkFrames.map(({ name }) => name),
						links: [],
						edges: [],
						unreadable: [],
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
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
			callback(performance.now() + 1000);
			return 1;
		});
		vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
		// happy-dom lays nothing out, and the canvas reads the viewport's own box
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
		vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);

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
		await until(() => host.querySelector('[data-frame-label="origin"]') !== null);
		const canvas = host.querySelector<HTMLElement>('[role="application"]');

		await act(async () => {
			// the label, not the body: a body double-click descends a rung (#254)
			host
				.querySelector<HTMLElement>('[data-frame-label="origin"]')
				?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 50, clientY: 50 }));
		});
		expect(labelText(host, "origin")).toContain("live · esc exits");
		await until(() => host.querySelector('iframe[title="origin"]') !== null);
		const source = host.querySelector<HTMLIFrameElement>('iframe[title="origin"]')?.contentWindow ?? null;
		const departed = cameraTransform(host);
		const postMessage = vi.spyOn(source as Window, "postMessage");

		// entering left the camera where it was, so origin still sits at the
		// origin of the screen — pick inside the box it actually occupies
		await act(async () => {
			canvas?.dispatchEvent(
				new PointerEvent("pointerdown", {
					bubbles: true,
					button: 0,
					clientX: 60,
					clientY: 60,
					pointerId: 1,
					ctrlKey: true,
				}),
			);
		});
		const pick = postMessage.mock.calls
			.map(([message]) => message)
			.find(
				(message): message is { spool: "pick"; id: number } =>
					typeof message === "object" &&
					message !== null &&
					"spool" in message &&
					message.spool === "pick" &&
					"id" in message &&
					typeof message.id === "number",
			);
		expect(pick).toBeDefined();
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						spool: "picked",
						frame: "origin",
						id: pick?.id,
						chain: [
							{
								selector: "button",
								tag: "button",
								outerHtml: "<button>Open</button>",
								rect: { x: 10, y: 10, w: 80, h: 30 },
								radius: 4,
								source: null,
								generated: true,
							},
						],
					},
					source,
				}),
			);
		});
		await until(() => selections.at(-1)?.elements?.[0]?.selector === "button");

		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						spool: "go",
						frame: "origin",
						target: "right",
						session: { scenario: "default", state: {}, stack: [] },
						id: 1,
					},
					source,
				}),
			);
		});
		expect(labelText(host, "right")).toContain("live · esc exits");
		await until(() => selections.at(-1)?.frames?.[0] === "right");
		const arrived = cameraTransform(host);
		expect(arrived).not.toBe(departed);

		// back arrives as a relayed chord: mid-walk, the entered frame owns the
		// keyboard, and the shim hands the canvas what it must never lose
		await until(() => host.querySelector('iframe[title="right"]') !== null);
		const walked = host.querySelector<HTMLIFrameElement>('iframe[title="right"]')?.contentWindow ?? null;
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", { data: { spool: "key", frame: "right", key: "ctrl+o" }, source: walked }),
			);
		});
		// the departure was made from inside origin, so back stands there again
		expect(labelText(host, "right")).not.toContain("live");
		expect(labelText(host, "origin")).toContain("live · esc exits");
		expect(cameraTransform(host)).toBe(departed);
		await until(() => selections.at(-1)?.elements?.[0]?.selector === "button");

		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "i", ctrlKey: true }));
		});
		expect(cameraTransform(host)).toBe(arrived);
		expect(labelText(host, "right")).toContain("live · esc exits");
		expect(labelText(host, "origin")).not.toContain("live");
	});

	it("ctrl+o crosses back to the page it left and stands inside the frame again", async () => {
		const cover = { hash: "c".repeat(32) };
		const walkFrames = [
			{ name: "origin", x: 0, y: 0, w: 100, h: 100, cover },
			{ name: "checkout", page: "shop", x: 0, y: 0, w: 100, h: 100, cover },
		];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const raw = input instanceof Request ? input.url : String(input);
				const url = new URL(raw, window.location.href);
				if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
				if (url.pathname.endsWith("/frames")) {
					return Response.json({ root: "/project", pages: ["shop"], frames: walkFrames, collisions: [] });
				}
				if (url.pathname.endsWith("/flows")) {
					return Response.json({
						frames: walkFrames.map(({ name }) => name),
						links: [],
						edges: [],
						unreadable: [],
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
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
			callback(performance.now() + 1000);
			return 1;
		});
		vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
		vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);

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
		await until(() => host.querySelector('[data-frame-label="origin"]') !== null);

		await act(async () => {
			// the label, not the body: a body double-click descends a rung (#254)
			host
				.querySelector<HTMLElement>('[data-frame-label="origin"]')
				?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 50, clientY: 50 }));
		});
		expect(labelText(host, "origin")).toContain("live · esc exits");
		await until(() => host.querySelector('iframe[title="origin"]') !== null);
		const source = host.querySelector<HTMLIFrameElement>('iframe[title="origin"]')?.contentWindow ?? null;
		const departed = cameraTransform(host);

		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						spool: "go",
						frame: "origin",
						target: "checkout",
						session: { scenario: "default", state: {}, stack: [] },
						id: 1,
					},
					source,
				}),
			);
		});
		expect(host.querySelector('[data-frame-label="origin"]')).toBeNull();
		expect(labelText(host, "checkout")).toContain("live · esc exits");

		await until(() => host.querySelector('iframe[title="checkout"]') !== null);
		const walked = host.querySelector<HTMLIFrameElement>('iframe[title="checkout"]')?.contentWindow ?? null;
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", { data: { spool: "key", frame: "checkout", key: "ctrl+o" }, source: walked }),
			);
		});
		// the page came back with the camera, and so did the standing
		expect(host.querySelector('[data-frame-label="checkout"]')).toBeNull();
		expect(labelText(host, "origin")).toContain("live · esc exits");
		expect(cameraTransform(host)).toBe(departed);
	});
});

/**
 * A deadline rather than a tick count: the canvas holds a selection PUT back 150ms, and
 * twenty ticks of ten is a budget that only just covers it on a machine with nothing else
 * to do. What is being waited for is a settle, so what bounds the wait is a clock.
 */
async function until(done: () => boolean, ms = 2000): Promise<void> {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}

function labelText(host: HTMLElement, name: string): string {
	return host.querySelector(`[data-frame-label="${name}"]`)?.textContent ?? "";
}

/** The field's transform is the camera made visible — one string per resting spot. */
function cameraTransform(host: HTMLElement): string {
	const field = [...host.querySelectorAll<HTMLElement>("div")].find((el) => el.style.transformOrigin === "0 0");
	return field?.style.transform ?? "";
}

function labelClass(host: HTMLElement, name: string): string {
	return (
		[...(host.querySelector(`[data-frame-label="${name}"]`)?.querySelectorAll("span") ?? [])]
			.find((span) => span.textContent === name)
			?.getAttribute("class") ?? ""
	);
}
