// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import { ProjectCanvas } from "./canvas";
import type { MeasuredBox, PickedHit, SpacingReading } from "./protocol";

/**
 * The measurement overlay out on the canvas (#261): with a rung held, ⌥ and a
 * pointer over a sibling draw the distance and what it is made of.
 *
 * The frame answers both halves of this — the rung, then the reading — so the
 * test plays the frame, reading each ask off the posted message. What is
 * asserted is what the canvas draws and what it asked for, never how it got
 * there; the arithmetic has its own suite next door.
 */

const ACCEL_KEY = accelKeyName();
const ACCEL = ACCEL_KEY === "Meta" ? { metaKey: true } : { ctrlKey: true };

const frames = [{ name: "home", x: 0, y: 0, w: 640, h: 480, kind: "html" }];

const ROOT: PickedHit[] = [
	{
		selector: "screen",
		tag: "div",
		outerHtml: '<div class="screen" />',
		rect: { x: 0, y: 0, w: 200, h: 100 },
		radius: 0,
		source: null,
		generated: false,
	},
];

const box = (selector: string, x: number, className = ""): MeasuredBox => ({
	selector,
	tag: "li",
	className,
	rect: { x, y: 10, w: 60, h: 40 },
	radius: 0,
	margins: { top: 0, right: 0, bottom: 0, left: 0 },
	rtl: false,
	display: "block",
	loose: false,
});

/** Two rows of a flex list, sixteen pixels apart because the list says `gap-4`. */
const READING: SpacingReading = {
	axis: "x",
	from: 70,
	to: 86,
	at: 30,
	first: box("screen", 10),
	second: box("row", 86),
	parent: { selector: "ul", tag: "ul", className: "flex gap-4", display: "flex", gapX: 16, gapY: 0 },
	step: 4,
	root: 16,
};

it("measures from the held rung to the sibling under ⌥, and says what the distance is made of", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await hold(frame);

	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: 60, clientY: 30, pointerId: 1, altKey: true }),
		);
	});
	// the held rung and the point, which is all the frame needs to find the pair
	expect(frame.lastMeasure()).toEqual({ selector: "screen", x: 60, y: 30 });

	await frame.reading(READING);

	expect(host.querySelector('[data-measure-span="x"]')).not.toBeNull();
	const said = [...host.querySelectorAll("[data-measure-part]")].map((row) => row.textContent);
	expect(said).toEqual(["16pxgap-4on parent ul"]);
	expect(host.querySelector("[data-measure]")?.textContent).toContain("16px");
});

it("lists the residual under the parts it could name", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await hold(frame);

	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: 60, clientY: 30, pointerId: 1, altKey: true }),
		);
	});
	await frame.reading({ ...READING, to: 92 });

	const said = [...host.querySelectorAll("[data-measure-part]")].map((row) => row.textContent);
	expect(said).toEqual(["16pxgap-4on parent ul", "6pxresidual"]);
});

it("draws nothing for a point with no neighbour of the held rung under it", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await hold(frame);

	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: 60, clientY: 30, pointerId: 1, altKey: true }),
		);
	});
	await frame.reading(null);
	expect(host.querySelector("[data-measure]")).toBeNull();
});

it("asks for nothing while no rung is held", async () => {
	const { canvas, frame } = await readyCanvas();
	await clickAt(canvas, 40, 40);

	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: 60, clientY: 30, pointerId: 1, altKey: true }),
		);
	});
	// a measure is from somewhere to somewhere; the frame is not a somewhere
	expect(frame.lastMeasure()).toBeUndefined();
});

it("measures where the pointer already rests when ⌥ goes down, and puts the rungs back when it comes up", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await hold(frame);

	// a plain hover first: no modifier, so the frame is asked for an ancestry
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 60, clientY: 30, pointerId: 1 }));
	});
	await frame.answer(ROOT);
	expect(frame.lastMeasure()).toBeUndefined();

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", bubbles: true, cancelable: true, altKey: true }));
	});
	expect(frame.lastMeasure()).toEqual({ selector: "screen", x: 60, y: 30 });
	await frame.reading(READING);
	expect(host.querySelector("[data-measure]")).not.toBeNull();

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", bubbles: true }));
	});
	expect(host.querySelector("[data-measure]")).toBeNull();
});

// --- the harness -------------------------------------------------------------

interface FramePlayer {
	answer: (chain: readonly PickedHit[]) => Promise<void>;
	reading: (reading: SpacingReading | null) => Promise<void>;
	lastMeasure: () => { selector: string; x: number; y: number } | undefined;
}

/** Take the frame's root element: the rung every measure in here runs from. */
async function hold(frame: FramePlayer): Promise<void> {
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...ACCEL }));
	});
	await frame.answer(ROOT);
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

	await clickAt(canvas, 40, 40);
	await until(() => host.querySelector('iframe[title="home"]') !== null);

	const spies = new Map<Window, { mock: { calls: unknown[][] } }>();
	const live = (): Window | null => {
		const contentWindow = host.querySelector<HTMLIFrameElement>('iframe[title="home"]')?.contentWindow ?? null;
		if (contentWindow !== null && !spies.has(contentWindow)) {
			spies.set(contentWindow, vi.spyOn(contentWindow, "postMessage"));
		}
		return contentWindow;
	};
	await act(async () => {
		window.dispatchEvent(new MessageEvent("message", { data: { spool: "loaded", frame: "home" }, source: live() }));
	});

	const asks = (kinds: readonly string[]): Record<string, unknown>[] => {
		live();
		return [...spies.values()]
			.flatMap((spy) => spy.mock.calls.map((call) => call[0]))
			.filter((message): message is Record<string, unknown> => typeof message === "object" && message !== null)
			.filter((message) => kinds.includes(String(message.spool)))
			.sort((a, b) => Number(a.id) - Number(b.id));
	};

	const post = async (data: Record<string, unknown>) => {
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
				await post({ spool: "picked", frame: "home", id: ask?.id, chain });
			},
			reading: async (reading) => {
				const ask = asks(["measure"]).at(-1);
				expect(ask).toBeDefined();
				await post({ spool: "measured", frame: "home", id: ask?.id, reading });
			},
			lastMeasure: () => {
				const ask = asks(["measure"]).at(-1);
				return ask === undefined
					? undefined
					: { selector: String(ask.selector), x: Number(ask.x), y: Number(ask.y) };
			},
		},
	};
}

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

async function until(ready: () => boolean, ms = 4000): Promise<void> {
	const deadline = Date.now() + ms;
	while (!ready()) {
		if (Date.now() > deadline) throw new Error("canvas never got ready");
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
		vi.fn(async (input: RequestInfo | URL) => {
			const raw = input instanceof Request ? input.url : String(input);
			const url = new URL(raw, window.location.href);
			if (url.pathname.endsWith("/events")) {
				return new Response(new ReadableStream({ start() {} }), {
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
