// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import { ProjectCanvas } from "./canvas";
import type { PickedHit } from "./protocol";

/**
 * The selection ladder out on the canvas (#254). The pointer walks it in the
 * Edit tool, where a click takes the rung the scope is open on and a
 * double-click steps down one; ⌘-click lands on the deepest rung from either
 * tool, and ⌘⏎, Tab and ⇧⏎ reach every rung with no pointer at all. In Select
 * a double-click goes inside the frame instead, which is the whole reason the
 * two tools are two.
 *
 * The frame answers every one of these, so each test plays the frame: it reads
 * the ask off the posted message and replies with an ancestry of its own.
 */

const ACCEL_KEY = accelKeyName();
const ACCEL = ACCEL_KEY === "Meta" ? { metaKey: true } : { ctrlKey: true };

// wide enough to be readable at zoom 1, so the document stays mounted throughout
const frames = [{ name: "home", x: 0, y: 0, w: 640, h: 480 }];

/** An ancestry the shim would answer with, root element first. */
const ancestry = (...selectors: readonly string[]): PickedHit[] =>
	selectors.map((selector, depth) => ({
		selector,
		tag: "div",
		outerHtml: `<div class="${selector}" />`,
		rect: { x: depth * 4, y: depth * 4, w: 100 - depth * 8, h: 80 - depth * 8 },
		radius: 0,
		source: null,
		generated: false,
	}));

/** screen › footer › pay, the ancestry under the pointer in every test here. */
const CHAIN = ancestry("screen", "footer", "pay");
/** screen › header › title, which leaves that one a rung below the root. */
const HEADER = ancestry("screen", "header", "title");

it("goes inside on a double-click, on the frame's body as much as on its label", async () => {
	const { host, canvas } = await readyCanvas();

	await clickAt(canvas, 40, 40);
	expect(await heldElements()).toBeUndefined(); // a bare click takes the frame
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).not.toContain("esc exits");

	await doubleClickAt(canvas, 40, 40);
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).toContain("live · esc exits");
	// going inside is not a descent: no rung is taken on the way in
	expect(await heldElements()).toBeUndefined();

	await press("Escape", ACCEL);
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).not.toContain("esc exits");

	await act(async () => {
		host
			.querySelector<HTMLElement>('[data-frame-label="home"]')
			?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 40, clientY: 40 }));
	});
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).toContain("live · esc exits");
});

it("takes an element on a plain click in Edit, and descends one rung per double-click", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await press("e");

	// with no scope open the click lands on the frame's root element, which is
	// rung one: in Edit the pointer never takes the frame itself
	await clickAt(canvas, 40, 40);
	await frame.answer(CHAIN);
	expect(await heldElements()).toEqual(["screen"]);

	await doubleClickAt(canvas, 40, 40);
	await frame.answer(CHAIN);
	expect(await heldElements()).toEqual(["footer"]);

	await doubleClickAt(canvas, 40, 40);
	await frame.answer(CHAIN);
	expect(await heldElements()).toEqual(["pay"]);

	// the leaf: the ladder ends rather than running off the end of the ancestry
	await doubleClickAt(canvas, 40, 40);
	await frame.answer(CHAIN);
	expect(await heldElements()).toEqual(["pay"]);

	// and none of those double-clicks went inside, which is Select's meaning
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).not.toContain("esc exits");
});

it("draws the rung under the pointer's own, dashed, only where Edit descends to it", async () => {
	const { host, canvas, frame } = await readyCanvas();

	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40, pointerId: 1 }));
	});
	await frame.answer(CHAIN);
	// Select: a click takes the frame, which draws its own ring, and no gesture
	// of Select's descends, so there is nothing beneath to promise
	expect(host.querySelectorAll(".opacity-50")).toHaveLength(0);
	expect(host.querySelectorAll(".border-dashed")).toHaveLength(0);

	await press("e");
	await clickAt(canvas, 40, 40);
	await frame.answer(CHAIN);
	expect(await heldElements()).toEqual(["screen"]);

	// hover picks are throttled, so let the window pass before asking again
	await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 41, clientY: 41, pointerId: 1 }));
	});
	await frame.answer(CHAIN);

	// the rung a click takes is the one already held, which wears the ring
	// rather than a preview of itself — so what is left is the dashed rung
	// beneath, which is where this pointer's double-click goes next
	expect(host.querySelectorAll(".opacity-50")).toHaveLength(0);
	expect(host.querySelectorAll(".border-dashed")).toHaveLength(1);
});

it("lands on the deepest rung on ⌘-click, which is the pointer's whole ladder", async () => {
	const { canvas, frame } = await readyCanvas();

	await deepClickAt(canvas, 40, 40);
	await frame.answer(CHAIN);
	expect(await heldElements()).toEqual(["pay"]);
});

it("takes the frame's root element on ⌘⏎, then the first child of what is held", async () => {
	const { canvas, frame } = await readyCanvas();
	await clickAt(canvas, 40, 40);

	await press("Enter", ACCEL);
	expect(frame.lastKin()).toEqual({ selector: "", step: "child" });
	await frame.answer(CHAIN.slice(0, 1));
	expect(await heldElements()).toEqual(["screen"]);

	await press("Enter", ACCEL);
	expect(frame.lastKin()).toEqual({ selector: "screen", step: "child" });
	await frame.answer(CHAIN.slice(0, 2));
	expect(await heldElements()).toEqual(["footer"]);
});

it("walks the row with Tab, and back with ⇧Tab", async () => {
	const { canvas, frame } = await readyCanvas();
	await clickAt(canvas, 40, 40);
	await press("Enter", ACCEL);
	await frame.answer(CHAIN.slice(0, 1));

	await press("Tab");
	expect(frame.lastKin()).toEqual({ selector: "screen", step: "next" });

	await press("Tab", { shiftKey: true });
	expect(frame.lastKin()).toEqual({ selector: "screen", step: "previous" });
});

it("leaves Tab to the browser while no rung is held", async () => {
	const { canvas, frame } = await readyCanvas();
	await clickAt(canvas, 40, 40);

	const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
	await act(async () => {
		window.dispatchEvent(event);
	});
	expect(event.defaultPrevented).toBe(false);
	expect(frame.lastKin()).toBeUndefined();
});

it("climbs a rung on ⇧⏎, and stops playing no flow on the way", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await clickAt(canvas, 40, 40);
	await press("Enter", ACCEL);
	await frame.answer(CHAIN.slice(0, 1));
	await press("Enter", ACCEL);
	await frame.answer(CHAIN.slice(0, 2));
	expect(await heldElements()).toEqual(["footer"]);

	await press("Enter", { shiftKey: true });
	expect(await heldElements()).toEqual(["screen"]);

	// the root element's parent is the frame, and the frame's is nothing
	await press("Enter", { shiftKey: true });
	expect(await heldFrames()).toEqual(["home"]);
	await press("Enter", { shiftKey: true });
	expect(await heldFrames()).toEqual([]);

	// ⇧⏎ is the climb now, so it never opens a play tab
	expect(host.ownerDocument.defaultView?.open).not.toHaveBeenCalled();
});

it("draws the rung a click takes, and nothing at all with no rung open", async () => {
	const { host, canvas, frame } = await readyCanvas();

	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40, pointerId: 1 }));
	});
	await frame.answer(CHAIN);

	// with no rung open a click takes the frame, which draws its own ring, and
	// there is no rung beneath to promise: no pointer gesture descends one
	expect(host.querySelectorAll(".opacity-50")).toHaveLength(0);

	// hold the footer, then point at a branch that leaves it: a click takes the
	// divergence point, and that is the one ring the hover draws
	await press("Enter", ACCEL);
	await frame.answer(CHAIN.slice(0, 1));
	await press("Enter", ACCEL);
	await frame.answer(CHAIN.slice(0, 2));
	// hover picks are throttled, so let the window pass before asking again
	await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 41, clientY: 41, pointerId: 1 }));
	});
	await frame.answer(HEADER);

	expect(host.querySelectorAll(".opacity-50")).toHaveLength(1);
});

it("draws again after a press voided the hover ask that was in flight", async () => {
	const { host, canvas, frame } = await readyCanvas();

	// a rung has to be held for a hover to draw one at all
	await clickAt(canvas, 40, 40);
	await press("Enter", ACCEL);
	await frame.answer(CHAIN.slice(0, 1));
	await press("Enter", ACCEL);
	await frame.answer(CHAIN.slice(0, 2));

	// a move, then a press before the frame has answered it: the press voids
	// every outstanding pick, so that hover's answer never arrives. The ring
	// has to survive it — an ask that is dropped must not latch it off.
	await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40, pointerId: 1 }));
	});
	await clickAt(canvas, 40, 40);

	await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 41, clientY: 41, pointerId: 1 }));
	});
	await frame.answer(HEADER);
	expect(host.querySelectorAll(".opacity-50")).toHaveLength(1);
});

// --- the harness -------------------------------------------------------------

interface FramePlayer {
	/** The ancestry this frame answers the outstanding ask with. */
	answer: (chain: readonly PickedHit[]) => Promise<void>;
	/** The last kin ask, which is the keyboard's half of the ladder. */
	lastKin: () => { selector: string; step: string } | undefined;
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
	await clickAt(canvas, 40, 40);
	await until(() => host.querySelector('iframe[title="home"]') !== null);

	// the canvas remounts a frame's document as its lifecycle changes, so both
	// the asks and the answers have to find the window that is live right now
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

	// ids are the canvas's own sequence, so they order asks across remounts
	const asks = (kinds: readonly string[]): Record<string, unknown>[] => {
		live();
		return [...spies.values()]
			.flatMap((spy) => spy.mock.calls.map((call) => call[0]))
			.filter((message): message is Record<string, unknown> => typeof message === "object" && message !== null)
			.filter((message) => kinds.includes(String(message.spool)))
			.sort((a, b) => Number(a.id) - Number(b.id));
	};

	return {
		host,
		canvas,
		frame: {
			answer: async (chain) => {
				const ask = asks(["pick", "kin"]).at(-1);
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
			lastKin: () => {
				const kin = asks(["kin"]).at(-1);
				return kin === undefined ? undefined : { selector: String(kin.selector), step: String(kin.step) };
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

/** ⌘-click: the deepest rung of whatever ancestry the frame answers with. */
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

/** The two presses a double-click is made of, then the double-click itself. */
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

/** Every selection the canvas has served, oldest first. */
function selectionPuts(): ({ frames?: string[] } & { elements?: { selector: string }[] })[] {
	const calls = (globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls;
	return calls
		.filter(([input, init]) => String(input).endsWith("/selection") && init?.method === "PUT")
		.map(([, init]) => JSON.parse(String(init?.body)));
}

/** The selection reaches the daemon on a debounce, so a reader waits it out. */
async function served(): Promise<{ frames?: string[]; elements?: { selector: string }[] }> {
	await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
	return selectionPuts().at(-1) ?? {};
}

async function heldElements(): Promise<string[] | undefined> {
	return (await served()).elements?.map((element) => element.selector);
}

async function heldFrames(): Promise<string[] | undefined> {
	return (await served()).frames;
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
			// a stream that stays open: a reconnect reloads every frame document,
			// which would drop the very selection these tests are about
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
