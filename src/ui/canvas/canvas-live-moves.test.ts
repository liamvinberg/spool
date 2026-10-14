// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";
import { OVERVIEW_HOLD_MS } from "./live-moves";
import { openEventStream } from "./test-event-stream";

// the Mac's keyboard law, read once and before anything asks: ⌘ is accel
vi.hoisted(() => {
	Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
});

/**
 * Moving between frames while live (DEV-295), on the real canvas. A signup
 * flow in a row, forking at sign-up:
 *
 *   welcome → sign-up → verify
 *                 ↘
 *                   plan (under verify)
 */
const frames = [
	{ name: "welcome", x: 0, y: 0, w: 100, h: 100 },
	{ name: "sign-up", x: 180, y: 0, w: 100, h: 100 },
	{ name: "verify", x: 360, y: 0, w: 100, h: 100 },
	{ name: "plan", x: 360, y: 180, w: 100, h: 100 },
];
const edge = (from: string, to: string) => ({ from, to, certainty: "will", sites: [] });
const edges = [edge("welcome", "sign-up"), edge("sign-up", "verify"), edge("sign-up", "plan")];

// close up, so the overview has somewhere to step back to
const START = { x: 0, y: 0, k: 2 };
const VIEW = { w: 1000, h: 800 };

async function openCanvas(
	world: { frames: Array<Record<string, unknown>>; edges: unknown[]; pages: string[] } = { frames, edges, pages: [] },
	start: { x: number; y: number; k: number } = START,
): Promise<{ host: HTMLElement; canvas: HTMLElement }> {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			if (url.pathname.endsWith("/events")) return openEventStream();
			if (url.pathname.endsWith("/state")) return Response.json({ camera: start });
			if (url.pathname.endsWith("/frames")) {
				return Response.json({ root: "/project", pages: world.pages, frames: world.frames });
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({
					frames: world.frames.map(({ name }) => name),
					links: [],
					edges: world.edges,
					unreadable: [],
				});
			}
			return Response.json({});
		}),
	);
	const setAttribute = HTMLIFrameElement.prototype.setAttribute;
	vi.spyOn(HTMLIFrameElement.prototype, "setAttribute").mockImplementation(function (
		this: HTMLIFrameElement,
		name,
		value,
	) {
		setAttribute.call(this, name, name === "src" ? "about:blank" : value);
	});
	// every flight lands in the frame it starts
	vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
		callback(performance.now() + 1000);
		return 1;
	});
	vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
	vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(VIEW.w);
	vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(VIEW.h);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});
	await act(async () => root.render(createElement(ProjectCanvas, { project: "test", onChrome: () => {} })));
	await until(() => cameraTransform(host) === `translate(${start.x}px, ${start.y}px) scale(${start.k})`);
	await until(() => host.querySelector(`[data-frame-label="${String(world.frames[0]?.name)}"]`) !== null);
	const canvas = host.querySelector<HTMLElement>('[role="application"]');
	if (canvas === null) throw new Error("no canvas");
	return { host, canvas };
}

async function enter(host: HTMLElement, name: string): Promise<void> {
	await act(async () => {
		host
			.querySelector<HTMLElement>(`[data-frame-label="${name}"]`)
			?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
	});
	await until(() => liveChip(host) === name);
}

/** A message from a frame's shim, as it would post one. */
function relay(host: HTMLElement, frame: string, data: Record<string, unknown>) {
	return act(async () => {
		const source = host.querySelector<HTMLIFrameElement>(`iframe[title="${frame}"]`)?.contentWindow ?? null;
		window.dispatchEvent(new MessageEvent("message", { data: { frame, ...data }, source }));
	});
}

const step = (key: string, code = key) => ({
	spool: "key",
	id: "canvas.step",
	metaKey: false,
	ctrlKey: false,
	key,
	code,
});
const holdAlt = { spool: "key", id: "canvas.overview", metaKey: false, ctrlKey: false, key: "Alt", code: "AltLeft" };
const thread = (id: "canvas.thread-next" | "canvas.thread-back") => ({
	spool: "key",
	id,
	metaKey: true,
	ctrlKey: false,
});

describe("moving between frames while live", () => {
	it("opens the overview on the first ⌥ arrow from inside a frame, and letting go enters the target", async () => {
		const { host } = await openCanvas();
		await enter(host, "welcome");
		const entered = cameraTransform(host);
		expect(host.querySelector('[data-frame-ring="welcome"]')).not.toBeNull();

		await relay(host, "welcome", step("ArrowRight"));
		expect(overviewTarget(host)).toBe("sign-up");
		// the camera stepped back to hold sign-up and its neighbours
		expect(cameraScale(host)).toBeLessThan(2);
		// one arrow away, each wearing the key that reaches it
		expect(host.querySelector('[data-overview-near="welcome"]')).not.toBeNull();
		expect(host.querySelector('[data-overview-near="verify"]')).not.toBeNull();
		expect(labelText(host, "sign-up")).toContain("let go of ⌥ to enter");
		// still live where it opened, its chip faded
		expect(liveChip(host)).toBe("welcome");
		expect(host.querySelector('[data-live-chip="welcome"]')?.className).toContain("bg-surface-control");
		// and ringed only as the neighbour it is: no accent ring of its own as well
		expect(host.querySelector('[data-frame-ring="welcome"]')).toBeNull();

		// ⌥L is ¬ on a Mac: by place, it is right
		await relay(host, "welcome", step("¬", "KeyL"));
		expect(overviewTarget(host)).toBe("verify");
		await relay(host, "welcome", step("ArrowRight"));
		expect(host.querySelector('[data-overview-stop="right"]')?.textContent).toContain("nothing to the right");

		await relay(host, "welcome", { spool: "hold", phase: "up" });
		expect(overviewTarget(host)).toBeNull();
		expect(liveChip(host)).toBe("verify");
		// the chip slides in from the side it came from, the ring flashes once
		expect(host.querySelector('[data-live-chip="verify"]')?.className).toContain("animate-live-chip-right");
		expect(host.querySelector('[data-land-ring="verify"]')).not.toBeNull();
		expect(host.querySelector('[data-frame-ring="verify"]')).not.toBeNull();
		// back at the zoom it was live at
		expect(cameraScale(host)).toBe(2);
		expect(cameraTransform(host)).not.toBe(entered);
	});

	it("opens on ⌥ held alone a moment, and letting go without moving zooms back in, still live", async () => {
		const { host } = await openCanvas();
		await enter(host, "welcome");
		const entered = cameraTransform(host);

		await relay(host, "welcome", holdAlt);
		expect(overviewTarget(host)).toBeNull();
		await wait(OVERVIEW_HOLD_MS + 40);
		expect(overviewTarget(host)).toBe("welcome");
		expect(cameraScale(host)).toBeLessThan(2);
		expect(labelText(host, "welcome")).toContain("let go of ⌥ to stay");

		await relay(host, "welcome", { spool: "hold", phase: "up" });
		expect(overviewTarget(host)).toBeNull();
		expect(cameraTransform(host)).toBe(entered);
		expect(liveChip(host)).toBe("welcome");
	});

	it("never opens when another key goes down under ⌥, and closes where it stood when one does", async () => {
		const { host } = await openCanvas();
		await enter(host, "welcome");
		const entered = cameraTransform(host);

		// ⌥2 for @: the frame breaks the hold before it opens
		await relay(host, "welcome", holdAlt);
		await relay(host, "welcome", { spool: "hold", phase: "broken" });
		await wait(OVERVIEW_HOLD_MS + 40);
		expect(overviewTarget(host)).toBeNull();

		await relay(host, "welcome", holdAlt);
		await relay(host, "welcome", step("ArrowRight"));
		expect(overviewTarget(host)).toBe("sign-up");
		await relay(host, "welcome", { spool: "hold", phase: "broken" });
		expect(overviewTarget(host)).toBeNull();
		expect(cameraTransform(host)).toBe(entered);
		expect(liveChip(host)).toBe("welcome");
	});

	it("takes relays only from the live frame, or the one a move just left", async () => {
		const { host } = await openCanvas();
		await enter(host, "welcome");
		await relay(host, "verify", step("ArrowRight"));
		expect(overviewTarget(host)).toBeNull();
		await relay(host, "plan", thread("canvas.thread-next"));
		expect(liveChip(host)).toBe("welcome");
	});

	it("steps straight through on ⌘⌥ arrows, landing entered", async () => {
		const { host } = await openCanvas();
		await enter(host, "welcome");
		await relay(host, "welcome", { ...step("ArrowRight"), id: "canvas.step-through", metaKey: true });
		expect(overviewTarget(host)).toBeNull();
		expect(liveChip(host)).toBe("sign-up");
		// and back the way it came
		await relay(host, "sign-up", { ...step("ArrowLeft"), id: "canvas.step-through", metaKey: true });
		expect(liveChip(host)).toBe("welcome");
	});

	it("walks the threads on ⌘] and ⌘[, and ] again at a fork swaps to the next thread until ⌘ comes up", async () => {
		const { host } = await openCanvas();
		await enter(host, "welcome");

		await relay(host, "welcome", thread("canvas.thread-next"));
		expect(liveChip(host)).toBe("sign-up");
		await relay(host, "sign-up", thread("canvas.thread-next"));
		expect(liveChip(host)).toBe("verify");
		expect(liveChipText(host)).toBe("1 of 2 · ] again for plan");
		await relay(host, "verify", thread("canvas.thread-next"));
		expect(liveChip(host)).toBe("plan");
		expect(liveChipText(host)).toBe("2 of 2 · ] again for verify");

		await relay(host, "plan", { spool: "modifier", modifier: "Meta", held: false });
		expect(liveChipText(host)).toBe("live · esc exits");
		await relay(host, "plan", thread("canvas.thread-next"));
		expect(liveChipText(host)).toBe("end of the thread");

		// back along the way actually taken: plan, not verify, came from sign-up
		await relay(host, "plan", thread("canvas.thread-back"));
		expect(liveChip(host)).toBe("sign-up");
		await relay(host, "sign-up", thread("canvas.thread-back"));
		expect(liveChip(host)).toBe("welcome");
		await relay(host, "welcome", thread("canvas.thread-back"));
		expect(liveChipText(host)).toBe("start of the thread");
	});

	it("keeps a fork's ] again when the frame it left loses the focus, ⌘ still down", async () => {
		const { host } = await openCanvas();
		await enter(host, "welcome");
		await relay(host, "welcome", thread("canvas.thread-next"));
		await relay(host, "sign-up", thread("canvas.thread-next"));
		expect(liveChipText(host)).toBe("1 of 2 · ] again for plan");
		// verify booted and took the focus: sign-up blurred, which is no ⌘ let go
		await relay(host, "verify", { spool: "loaded" });
		await relay(host, "sign-up", { spool: "modifier", modifier: "Meta", held: false, blur: true });
		await relay(host, "sign-up", { spool: "modifier", modifier: "Control", held: false, blur: true });
		expect(liveChipText(host)).toBe("1 of 2 · ] again for plan");
		await relay(host, "verify", thread("canvas.thread-next"));
		expect(liveChip(host)).toBe("plan");
	});

	it("hears the frame a move left only until the one it landed on speaks", async () => {
		const { host } = await openCanvas();
		await enter(host, "welcome");
		await relay(host, "welcome", thread("canvas.thread-next"));
		expect(liveChip(host)).toBe("sign-up");
		// sign-up has booted: welcome no longer speaks for it
		await relay(host, "sign-up", { spool: "loaded" });
		await relay(host, "welcome", thread("canvas.thread-next"));
		expect(liveChip(host)).toBe("sign-up");

		// a step that boots nothing: the landed frame's first relay does the same
		await relay(host, "sign-up", { ...step("ArrowLeft"), id: "canvas.step-through", metaKey: true });
		expect(liveChip(host)).toBe("welcome");
		await relay(host, "welcome", { ...step("ArrowRight"), id: "canvas.step-through", metaKey: true });
		expect(liveChip(host)).toBe("sign-up");
		await relay(host, "sign-up", thread("canvas.thread-back"));
		expect(liveChip(host)).toBe("welcome");
		await relay(host, "sign-up", thread("canvas.thread-next"));
		expect(liveChip(host)).toBe("welcome");
	});

	it("closes an overview whose frame reloads, or stops being live, flying back", async () => {
		const { host, canvas } = await openCanvas();
		await enter(host, "welcome");
		const entered = cameraTransform(host);

		await relay(host, "welcome", step("ArrowRight"));
		expect(overviewTarget(host)).toBe("sign-up");
		// the document the ⌥ went down in is gone: its keyup never comes
		await relay(host, "welcome", { spool: "loaded" });
		expect(overviewTarget(host)).toBeNull();
		expect(cameraTransform(host)).toBe(entered);
		expect(liveChip(host)).toBe("welcome");

		await relay(host, "welcome", step("ArrowRight"));
		expect(overviewTarget(host)).toBe("sign-up");
		await relay(host, "welcome", { spool: "key", id: "canvas.leave", metaKey: false, ctrlKey: false });
		expect(liveChip(host)).toBeNull();
		expect(overviewTarget(host)).toBeNull();
		expect(cameraTransform(host)).toBe(entered);

		// a press on the canvas with it up only closes it: nothing selected, the
		// frame still live
		await enter(host, "welcome");
		await relay(host, "welcome", step("ArrowRight"));
		const camera = cameraOf(host);
		const down = new PointerEvent("pointerdown", {
			bubbles: true,
			cancelable: true,
			button: 0,
			pointerId: 1,
			clientX: 230 * camera.k + camera.x,
			clientY: 50 * camera.k + camera.y,
		});
		await act(async () => {
			canvas.dispatchEvent(down);
			canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 1 }));
		});
		expect(down.defaultPrevented).toBe(true);
		expect(overviewTarget(host)).toBeNull();
		expect(liveChip(host)).toBe("welcome");
		expect(labelClass(host, "sign-up")).not.toContain("text-accent");
		expect(cameraTransform(host)).toBe(entered);
	});

	it("walks the selection onto another page along a thread that leaves this one", async () => {
		const world = {
			frames: [
				{ name: "welcome", x: 0, y: 0, w: 100, h: 100 },
				{ name: "shop/cart", page: "shop", x: 0, y: 0, w: 100, h: 100 },
			],
			edges: [edge("welcome", "shop/cart")],
			pages: ["shop"],
		};
		const { host, canvas } = await openCanvas(world);
		await act(async () => {
			for (const type of ["pointerdown", "pointerup"]) {
				canvas.dispatchEvent(
					new PointerEvent(type, { bubbles: true, button: 0, clientX: 100, clientY: 100, pointerId: 1 }),
				);
			}
		});
		expect(labelClass(host, "welcome")).toContain("text-accent");
		await act(async () => {
			window.dispatchEvent(
				new KeyboardEvent("keydown", {
					bubbles: true,
					cancelable: true,
					key: "]",
					code: "BracketRight",
					metaKey: true,
				}),
			);
		});
		await until(() => host.querySelector('[data-frame-label="shop/cart"]') !== null);
		expect(host.querySelector('[data-frame-label="welcome"]')).toBeNull();
		// a frame on its page is labelled by its own name there
		expect(host.querySelector('[data-frame-label="shop/cart"] span.text-accent-strong')?.textContent).toBe("cart");
	});

	it("enters another frame on one click while live, and says so on hover", async () => {
		const { host, canvas } = await openCanvas();
		await enter(host, "welcome");
		const camera = cameraOf(host);
		// sign-up's middle on screen
		const at = { clientX: 230 * camera.k + camera.x, clientY: 50 * camera.k + camera.y };
		await act(async () => {
			canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, ...at }));
		});
		expect(host.querySelector('[data-click-enters="sign-up"]')?.textContent).toBe("click enters");
		await act(async () => {
			for (const type of ["pointerdown", "pointerup"]) {
				canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, ...at }));
			}
		});
		expect(liveChip(host)).toBe("sign-up");
		expect(host.querySelector('[data-live-chip="sign-up"]')?.className).toContain("animate-live-chip-right");
	});

	it("works on a frame selected out on the canvas: letting go selects, a press of the pointer ends it", async () => {
		const { host, canvas } = await openCanvas();
		// welcome sits at screen 0..200
		await act(async () => {
			for (const type of ["pointerdown", "pointerup"]) {
				canvas.dispatchEvent(
					new PointerEvent(type, { bubbles: true, button: 0, clientX: 100, clientY: 100, pointerId: 1 }),
				);
			}
		});
		expect(labelClass(host, "welcome")).toContain("text-accent");
		const key = (type: string, init: KeyboardEventInit) =>
			act(async () => {
				window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }));
			});

		await key("keydown", { key: "Alt", code: "AltLeft", altKey: true });
		await wait(OVERVIEW_HOLD_MS + 40);
		expect(overviewTarget(host)).toBe("welcome");
		expect(labelText(host, "welcome")).toContain("let go of ⌥ to select");
		await key("keydown", { key: "ArrowRight", code: "ArrowRight", altKey: true });
		expect(overviewTarget(host)).toBe("sign-up");
		// the selection waits for ⌥ to come up
		expect(labelClass(host, "welcome")).toContain("text-accent");
		await key("keyup", { key: "Alt", code: "AltLeft" });
		expect(overviewTarget(host)).toBeNull();
		expect(labelClass(host, "sign-up")).toContain("text-accent");
		expect(liveChip(host)).toBeNull();

		// ⌥ drag and ⌥ click are gestures of their own
		await key("keydown", { key: "Alt", code: "AltLeft", altKey: true });
		await wait(OVERVIEW_HOLD_MS + 40);
		expect(overviewTarget(host)).toBe("sign-up");
		await act(async () => {
			canvas.dispatchEvent(
				new PointerEvent("pointerdown", {
					bubbles: true,
					button: 0,
					clientX: 900,
					clientY: 700,
					pointerId: 1,
					altKey: true,
				}),
			);
		});
		expect(overviewTarget(host)).toBeNull();
		await key("keyup", { key: "Alt", code: "AltLeft" });

		// and any other key under ⌥ disarms it
		await act(async () => {
			canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 1 }));
		});
		await key("keydown", { key: "Alt", code: "AltLeft", altKey: true });
		await key("keydown", { key: "@", code: "Digit2", altKey: true });
		await wait(OVERVIEW_HOLD_MS + 40);
		expect(overviewTarget(host)).toBeNull();
	});
});

/**
 * Design-system pages side by side (DEV-295's tall case), zoomed out so the
 * row shows: each 1000 screen pixels tall at this zoom, taller than the view,
 * so entering one keeps the camera, and moving to the next must still bring
 * it over, its top at a fit's margin.
 */
describe("moving between tall frames while live", () => {
	const pages = ["tokens", "type", "colour"].map((name, i) => ({ name, x: i * 1600, y: 0, w: 1440, h: 5000 }));
	const world = { frames: pages, edges: [edge("tokens", "type"), edge("type", "colour")], pages: [] };
	const ROW = { x: 0, y: 0, k: 0.2 };

	/** Where a page stands on screen now: its middle across, and its top. */
	function placed(host: HTMLElement, name: string) {
		const page = pages.find((candidate) => candidate.name === name);
		if (page === undefined) throw new Error(name);
		const camera = cameraOf(host);
		return { k: camera.k, middle: (page.x + page.w / 2) * camera.k + camera.x, top: page.y * camera.k + camera.y };
	}
	const broughtIn = { k: 0.2, middle: VIEW.w / 2, top: 64 };

	it("brings the next page in on ⌘⌥ arrows, where entering kept the camera", async () => {
		const { host } = await openCanvas(world, ROW);
		await enter(host, "tokens");
		expect(cameraOf(host)).toEqual(ROW);
		await relay(host, "tokens", { ...step("ArrowRight"), id: "canvas.step-through", metaKey: true });
		expect(liveChip(host)).toBe("type");
		expect(placed(host, "type")).toEqual(broughtIn);
	});

	it("brings a clicked page in", async () => {
		const { host, canvas } = await openCanvas(world, ROW);
		await enter(host, "tokens");
		const at = { clientX: placed(host, "type").middle, clientY: 400 };
		await act(async () => {
			for (const type of ["pointerdown", "pointerup"]) {
				canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, ...at }));
			}
		});
		expect(liveChip(host)).toBe("type");
		expect(placed(host, "type")).toEqual(broughtIn);
	});

	it("lands the overview's target from the camera it stepped back from", async () => {
		const { host } = await openCanvas(world, ROW);
		await enter(host, "tokens");
		await relay(host, "tokens", step("ArrowRight"));
		expect(overviewTarget(host)).toBe("type");
		await relay(host, "tokens", { spool: "hold", phase: "up" });
		expect(liveChip(host)).toBe("type");
		expect(placed(host, "type")).toEqual(broughtIn);
	});

	it("brings the page a thread walks to in, either way", async () => {
		const { host } = await openCanvas(world, ROW);
		await enter(host, "tokens");
		await relay(host, "tokens", thread("canvas.thread-next"));
		expect(liveChip(host)).toBe("type");
		expect(placed(host, "type")).toEqual(broughtIn);
		await relay(host, "type", thread("canvas.thread-next"));
		expect(placed(host, "colour")).toEqual(broughtIn);
		await relay(host, "colour", thread("canvas.thread-back"));
		expect(placed(host, "type")).toEqual(broughtIn);
	});
});

/**
 * A row of tall screens readable from the overview's zoom (DEV-295): its
 * stops are glances on the way to a frame, not rests, so the frames it brings
 * on screen stay stills, and the documents live where it opened stay live.
 */
describe("the overview over readable frames", () => {
	const row = Array.from({ length: 8 }, (_, i) => ({ name: `s${i}`, x: i * 250, y: 0, w: 200, h: 1000 }));
	const world = { frames: row, edges: [], pages: [] };
	const documents = (host: HTMLElement) =>
		[...host.querySelectorAll<HTMLIFrameElement>("iframe[title]")].map((frame) => frame.title).sort();

	it("mounts no document for a frame it passes over, and puts none down", async () => {
		const { host } = await openCanvas(world, { x: 0, y: 0, k: 1 });
		await enter(host, "s0");
		await wait(400);
		const live = documents(host);
		expect(live).toEqual(["s0", "s1", "s2", "s3", "s4"]);

		await relay(host, "s0", step("ArrowRight"));
		expect(overviewTarget(host)).toBe("s1");
		// s5 is readable inside the overview's ring, and is left its still
		expect(cameraScale(host)).toBeLessThan(1);
		await wait(400);
		expect(documents(host)).toEqual(live);
		// and so are s5 and s6 a stop further on
		await relay(host, "s0", step("ArrowRight"));
		expect(overviewTarget(host)).toBe("s2");
		await wait(400);
		expect(documents(host)).toEqual(live);

		// letting go is a rest again: the ring around where it landed mounts
		await relay(host, "s0", { spool: "hold", phase: "up" });
		expect(liveChip(host)).toBe("s2");
		await wait(400);
		expect(documents(host)).toEqual([...live, "s5"]);
	});
});

async function until(done: () => boolean, ms = 2000): Promise<void> {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}

function wait(ms: number): Promise<void> {
	return act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
}

function cameraTransform(host: HTMLElement): string {
	const field = [...host.querySelectorAll<HTMLElement>("div")].find((el) => el.style.transformOrigin === "0 0");
	return field?.style.transform ?? "";
}

function cameraOf(host: HTMLElement): { x: number; y: number; k: number } {
	const match = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\) scale\(([\d.e-]+)\)/.exec(cameraTransform(host));
	if (match === null) throw new Error(`no camera in "${cameraTransform(host)}"`);
	return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) };
}

function cameraScale(host: HTMLElement): number {
	return cameraOf(host).k;
}

function overviewTarget(host: HTMLElement): string | null {
	return host.querySelector<HTMLElement>("[data-overview]")?.dataset.overview ?? null;
}

function liveChip(host: HTMLElement): string | null {
	return host.querySelector<HTMLElement>("[data-live-chip]")?.dataset.liveChip ?? null;
}

function liveChipText(host: HTMLElement): string {
	return host.querySelector("[data-live-chip]")?.textContent ?? "";
}

function labelText(host: HTMLElement, name: string): string {
	return host.querySelector(`[data-frame-label="${name}"]`)?.textContent ?? "";
}

function labelClass(host: HTMLElement, name: string): string {
	return (
		[...(host.querySelector(`[data-frame-label="${name}"]`)?.querySelectorAll("span") ?? [])]
			.find((span) => span.textContent === name)
			?.getAttribute("class") ?? ""
	);
}
