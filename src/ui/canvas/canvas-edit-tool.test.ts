// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import { ProjectCanvas } from "./canvas";
import type { PickedHit } from "./protocol";

/**
 * The Edit tool out on the canvas (#339). A click takes the deepest element
 * under the pointer, in one go; the keys step from what is held — ⏎ and a
 * double-click into the words or the children, Esc and ⇧⏎ to the parent, Tab
 * round the siblings, ⌘A to all of them. ⌘ held in Select borrows the click.
 * In Select a double-click goes inside the frame instead, which is the whole
 * reason the two tools are two.
 *
 * The frame answers every one of these, so each test plays the frame: it reads
 * the ask off the posted message and replies with an ancestry of its own.
 */

const ACCEL_KEY = accelKeyName();
const ACCEL = ACCEL_KEY === "Meta" ? { metaKey: true } : { ctrlKey: true };

// wide enough to be readable at zoom 1, so the document stays mounted throughout
const frames = [{ name: "home", x: 0, y: 0, w: 640, h: 480 }];

/** An ancestry the shim would answer with, root element first, each one named. */
const ancestry = (...selectors: readonly string[]): PickedHit[] =>
	selectors.map((selector, depth) => ({
		selector,
		tag: "div",
		name: "Group",
		outerHtml: `<div class="${selector}" />`,
		rect: { x: depth * 4, y: depth * 4, w: 100 - depth * 8, h: 80 - depth * 8 },
		radius: 0,
		source: null,
		generated: false,
	}));

/** screen › footer › pay, the ancestry under the pointer in most tests here. */
const CHAIN = ancestry("screen", "screen > footer", "screen > footer > pay");
/** The same ancestry, with words of their own at the bottom of it. */
const WORDS = CHAIN.map((hit, depth) =>
	depth === 2 ? { ...hit, tag: "button", name: "PayButton", words: true, source: "frames/home/frame.tsx:9:5" } : hit,
);
/** The footer's children: the pay button and the row beside it. */
const FOOTER_KIDS = ancestry("screen", "screen > footer", "screen > footer > pay", "screen > footer > note").slice(2);

it("goes inside on a double-click in Select, on the frame's body as much as on its label", async () => {
	const { host, canvas } = await readyCanvas();

	await clickAt(canvas, 40, 40);
	expect(await heldElements()).toBeUndefined(); // a bare click takes the frame
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).not.toContain("esc exits");

	await doubleClickAt(canvas, 40, 40);
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).toContain("live · esc exits");
	// going inside is not a selection: nothing inside is taken on the way in
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

it("takes the deepest element on a plain click in Edit, and never goes inside", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await press("e");

	await clickAt(canvas, 40, 40);
	await frame.answer(CHAIN);
	expect(await heldElements()).toEqual(["screen > footer > pay"]);

	// a click on the frame's background is the frame
	await clickAt(canvas, 40, 40);
	await frame.answer([]);
	expect(await heldFrames()).toEqual(["home"]);

	expect(host.querySelector('[data-frame-label="home"]')?.textContent).not.toContain("esc exits");
});

it("lands on the deepest element on ⌘-click from Select, which borrows Edit", async () => {
	const { canvas, frame } = await readyCanvas();

	await deepClickAt(canvas, 40, 40);
	await frame.answer(CHAIN);
	expect(await heldElements()).toEqual(["screen > footer > pay"]);
});

it("opens the words on a double-click, and the children of a group", async () => {
	const { canvas, frame } = await readyCanvas();
	await press("e");

	// the deepest element has words of its own: the two clicks mean them
	await clickAt(canvas, 40, 40, 91);
	await frame.answer(WORDS);
	await clickAt(canvas, 40, 40, 92);
	await frame.answer(WORDS);
	await act(async () => {
		canvas.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 40, clientY: 40 }));
	});
	await frame.answer(WORDS);
	expect(frame.lastAsk("edit")).toMatchObject({ selector: "screen > footer > pay" });
	await press("Escape");

	// a group has none, so a double-click on it takes everything inside it
	await doubleClickAt(canvas, 40, 40);
	await frame.answer(CHAIN.slice(0, 2));
	expect(frame.lastAsk("family")).toMatchObject({ selector: "screen > footer", of: "children" });
	await frame.generation(CHAIN.slice(0, 2), FOOTER_KIDS);
	expect(await heldElements()).toEqual(["screen > footer > pay", "screen > footer > note"]);
});

it("opens with ⏎: the words after the last of them, the children, or the frame's top", async () => {
	const { canvas, frame } = await readyCanvas();
	await press("e");

	// the frame held and nothing inside it: ⏎ takes its top-level elements
	await clickAt(canvas, 40, 40);
	await frame.answer([]);
	await press("Enter");
	expect(frame.lastAsk("family")).toMatchObject({ selector: "", of: "children" });
	await frame.generation([], CHAIN.slice(0, 1));
	expect(await heldElements()).toEqual(["screen"]);

	// a group: its children
	await press("Enter");
	expect(frame.lastAsk("family")).toMatchObject({ selector: "screen", of: "children" });

	// words: the caret after them, with no point to put it at
	await clickAt(canvas, 40, 40);
	await frame.answer(WORDS);
	await press("Enter");
	expect(frame.lastAsk("edit")).toMatchObject({ selector: "screen > footer > pay", x: null, y: null });
});

it("climbs to the parent on Esc and ⇧⏎, then to the frame, then to nothing", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await press("e");
	await clickAt(canvas, 40, 40);
	await frame.answer(CHAIN);

	await press("Escape");
	expect(await heldElements()).toEqual(["screen > footer"]);
	await press("Enter", { shiftKey: true });
	expect(await heldElements()).toEqual(["screen"]);

	// the root element's parent is the frame, and the frame's is nothing
	await press("Escape");
	expect(await heldFrames()).toEqual(["home"]);
	await press("Escape");
	expect(await heldFrames()).toEqual([]);

	// ⇧⏎ is the climb, so it never opens a play tab
	expect(host.ownerDocument.defaultView?.open).not.toHaveBeenCalled();
});

it("walks round the siblings with Tab, and leaves Tab to the browser with nothing held", async () => {
	const { canvas, frame } = await readyCanvas();
	await press("e");

	const loose = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
	await act(async () => {
		window.dispatchEvent(loose);
	});
	expect(loose.defaultPrevented).toBe(false);
	expect(frame.lastAsk("kin")).toBeUndefined();

	await clickAt(canvas, 40, 40);
	await frame.answer(CHAIN);
	await press("Tab");
	expect(frame.lastAsk("kin")).toMatchObject({ selector: "screen > footer > pay", step: "next" });
	await press("Tab", { shiftKey: true });
	expect(frame.lastAsk("kin")).toMatchObject({ selector: "screen > footer > pay", step: "previous" });
});

it("takes every sibling on ⌘A, and climbs from all of them to the parent they share", async () => {
	const { canvas, frame } = await readyCanvas();
	await press("e");
	await clickAt(canvas, 40, 40);
	await frame.answer(CHAIN);

	const all = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true, ...ACCEL });
	await act(async () => {
		window.dispatchEvent(all);
	});
	expect(all.defaultPrevented).toBe(true);
	expect(frame.lastAsk("family")).toMatchObject({ selector: "screen > footer > pay", of: "siblings" });
	await frame.generation(CHAIN.slice(0, 2), FOOTER_KIDS);
	expect(await heldElements()).toEqual(["screen > footer > pay", "screen > footer > note"]);

	await press("Escape");
	expect(await heldElements()).toEqual(["screen > footer"]);
});

it("adds the deepest element on ⇧-click", async () => {
	const { canvas, frame } = await readyCanvas();
	await press("e");
	await clickAt(canvas, 40, 40);
	await frame.answer(CHAIN);

	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				button: 0,
				clientX: 60,
				clientY: 60,
				pointerId: 5,
				shiftKey: true,
			}),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 60, clientY: 60, pointerId: 5 }),
		);
	});
	await frame.answer(ancestry("screen", "screen > header", "screen > header > title"));
	expect(await heldElements()).toEqual(["screen > footer > pay", "screen > header > title"]);
});

it("outlines the element a click would take, and names the one held", async () => {
	const { host, canvas, frame } = await readyCanvas();

	// Select points at frames: a hover asks the frame nothing and outlines nothing
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40, pointerId: 1 }));
	});
	expect(frame.lastAsk("pick")).toBeUndefined();
	expect(host.querySelectorAll(".opacity-50")).toHaveLength(0);

	await press("e");
	await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 41, clientY: 41, pointerId: 1 }));
	});
	await frame.answer(WORDS);
	// one outline, the deepest element's, and no second one promising a step
	expect(host.querySelectorAll(".opacity-50")).toHaveLength(1);
	expect(host.querySelectorAll(".border-dashed")).toHaveLength(0);
	expect(host.querySelector("[data-name-label]")).toBeNull();

	await clickAt(canvas, 40, 40);
	await frame.answer(WORDS);
	expect(host.querySelector("[data-name-label]")?.textContent).toBe("PayButton");
});

it("says a refusal on the element, with the door to the agent, and lets it go", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
	onTestFinished(() => {
		vi.useRealTimers();
	});
	const { host, canvas, frame } = await readyCanvas({
		rungs: [
			{ source: "frames/home/frame.tsx:9:5", words: { code: "expression-text", says: "{label} is an expression" } },
		],
	});
	await press("e");
	await clickAt(canvas, 40, 40);
	await frame.answer(WORDS);
	// the selection's read of the file lands before the words are asked for
	await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

	await press("Enter");
	const note = () => host.querySelector("[data-hand-refusal]");
	expect(note()?.textContent).toContain("{label} is an expression");
	expect(note()?.querySelector("[data-hand-ask]")?.textContent).toBe("Ask the agent");
	// nothing was opened, and the strip says nothing
	expect(frame.lastAsk("edit")).toBeUndefined();
	expect(host.querySelector('[role="alert"], [role="status"]')).toBeNull();

	await act(async () => {
		vi.advanceTimersByTime(4100);
	});
	expect(note()).toBeNull();
});

// --- the harness -------------------------------------------------------------

interface FramePlayer {
	/** The ancestry this frame answers the outstanding pick or kin ask with. */
	answer: (chain: readonly PickedHit[]) => Promise<void>;
	/** A whole generation, answering the outstanding family ask: the parent's ancestry and its members. */
	generation: (chain: readonly PickedHit[], hits: readonly PickedHit[]) => Promise<void>;
	/** The last ask of one kind the canvas sent the frame. */
	lastAsk: (kind: string) => Record<string, unknown> | undefined;
}

async function readyCanvas(
	options: { rungs?: readonly Record<string, unknown>[] } = {},
): Promise<{ host: HTMLDivElement; canvas: HTMLElement; frame: FramePlayer }> {
	stubCanvasApis(options.rungs ?? []);
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
			generation: async (chain, hits) => {
				const ask = asks(["family"]).at(-1);
				expect(ask).toBeDefined();
				await act(async () => {
					window.dispatchEvent(
						new MessageEvent("message", {
							data: { spool: "generation", frame: "home", id: ask?.id, chain, hits },
							source: live(),
						}),
					);
				});
			},
			lastAsk: (kind) => asks([kind]).at(-1),
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

/** ⌘-click from Select: the deepest element of whatever ancestry the frame answers with. */
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

function stubCanvasApis(rungs: readonly Record<string, unknown>[]): void {
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
				return Response.json({ root: "/project", pages: [], frames });
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: ["home"], links: [], edges: [], unreadable: [] });
			}
			if (url.pathname.endsWith("/rungs")) return Response.json({ rungs });
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
