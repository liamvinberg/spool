// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import { hotkeyKey } from "../hotkeys";
import { ProjectCanvas } from "./canvas";
import { openEventStream } from "./test-event-stream";

/**
 * Folders as places (spool#224), driven through the canvas: a page holding
 * only pages draws as the list of them, the path at the top left says where
 * you are and where ⌘↓ goes, and the keys move between pages the way Finder's
 * and a browser's do. The rules each answer reads are page-list.ts's and
 * visits.ts's; this is their wiring.
 */

interface Projected {
	name: string;
	page?: string;
	x: number;
	y: number;
	w: number;
	h: number;
	cover?: { hash: string };
}

function frame(name: string, extra: Partial<Projected> = {}): Projected {
	const cut = name.lastIndexOf("/");
	return { name, ...(cut === -1 ? {} : { page: name.slice(0, cut) }), x: 0, y: 0, w: 100, h: 100, ...extra };
}

/** the platform's accel, as the register reads it: ⌘ on a Mac, ctrl here */
const ACCEL = accelKeyName() === "Meta" ? { metaKey: true } : { ctrlKey: true };

// the root holds no frames of its own, so it is a list; so is explore
const KAFFE = {
	pages: ["app", "onboarding", "explore", "explore/checkout", "explore/checkout/tipping", "explore/loyalty"],
	frames: [
		frame("app/menu", { cover: { hash: "m1" } }),
		frame("onboarding/welcome"),
		frame("explore/checkout/pay", { cover: { hash: "p1" } }),
		frame("explore/checkout/tipping/tip"),
		frame("explore/loyalty/card"),
	],
};

const rows = (host: HTMLElement) =>
	[...host.querySelectorAll<HTMLElement>("[data-page-row]")].map((row) => row.dataset.pageRow);
const lit = (host: HTMLElement) =>
	host.querySelector<HTMLElement>('[data-page-row][aria-current="true"]')?.dataset.pageRow;
const path = (host: HTMLElement) =>
	[...host.querySelectorAll<HTMLElement>("[data-path-page]")].map(
		(name) => `${name.dataset.pathKind}:${name.dataset.pathPage}`,
	);
const on = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-page-field]")?.dataset.pageField;

async function into(host: HTMLElement, page: string): Promise<void> {
	await act(async () => {
		host.querySelector<HTMLElement>(`[data-page-row="${page}"]`)?.click();
	});
	await until(() => on(host) === page);
}

describe("a page holding only pages", () => {
	it("draws them as a list of stills, the root too, and nothing on it runs live", async () => {
		const host = await mountCanvas(KAFFE);
		await until(() => rows(host).length > 0);
		expect(rows(host)).toEqual(["app", "explore", "onboarding"]);
		const app = host.querySelector('[data-page-row="app"]');
		expect(app?.getAttribute("aria-label")).toBe("app, 1 frame");
		expect(app?.querySelector("img")?.getAttribute("src")).toBe("/covers/test/app%2Fmenu/m1");
		// a page of only pages takes the still of the first frame under it
		expect(host.querySelector('[data-page-row="explore"] img')?.getAttribute("src")).toBe(
			"/covers/test/explore%2Fcheckout%2Fpay/p1",
		);
		expect(host.querySelector('[data-page-row="explore"]')?.getAttribute("aria-label")).toBe(
			"explore, 3 frames · checkout, loyalty",
		);
		expect(host.querySelector("[data-frame-label]")).toBeNull();
		expect(host.querySelector("iframe")).toBeNull();

		await into(host, "explore");
		expect(rows(host)).toEqual(["explore/checkout", "explore/loyalty"]);
		await into(host, "explore/checkout");
		expect(host.querySelector("[data-page-list]")).toBeNull();
		expect(host.querySelector('[data-frame-label="explore/checkout/pay"]')).not.toBeNull();
	});

	it("walks its lit row with the arrows, the path's ghost naming it, and goes in on ⏎", async () => {
		const host = await mountCanvas(KAFFE);
		await into(host, "explore");
		expect(lit(host)).toBe("explore/checkout");
		expect(path(host)).toEqual(["crumb:", "here:explore", "ghost:explore/checkout"]);
		await keydown({ key: "ArrowDown" });
		expect(lit(host)).toBe("explore/loyalty");
		expect(path(host)).toEqual(["crumb:", "here:explore", "ghost:explore/loyalty"]);
		// held at the end
		await keydown({ key: "ArrowDown" });
		expect(lit(host)).toBe("explore/loyalty");
		await keydown({ key: "Enter" });
		await until(() => on(host) === "explore/loyalty");
		expect(host.querySelector('[data-frame-label="explore/loyalty/card"]')).not.toBeNull();
	});
});

describe("the keys between pages", () => {
	it("goes up on ⌘↑ with the page left picked, and back down it on ⌘↓", async () => {
		const host = await mountCanvas(KAFFE);
		await into(host, "explore");
		await into(host, "explore/loyalty");
		await keydown({ key: "ArrowUp", ...ACCEL });
		await until(() => on(host) === "explore");
		expect(lit(host)).toBe("explore/loyalty");
		await keydown({ key: "ArrowDown", ...ACCEL });
		await until(() => on(host) === "explore/loyalty");
	});

	it("goes down a page of frames into the page its ghost names, and up the path by a name", async () => {
		const host = await mountCanvas(KAFFE);
		await into(host, "explore");
		await into(host, "explore/checkout");
		expect(path(host)).toEqual([
			"crumb:",
			"crumb:explore",
			"here:explore/checkout",
			"ghost:explore/checkout/tipping",
		]);
		await keydown({ key: "ArrowDown", ...ACCEL });
		await until(() => on(host) === "explore/checkout/tipping");
		await act(async () => {
			host.querySelector<HTMLElement>('[data-path-page=""]')?.click();
		});
		await until(() => on(host) === "");
		// up the path lands with the page you came out of picked, as ⌘↑ does
		expect(lit(host)).toBe("explore");
	});

	it("steps back and forward through the pages visited on ⌘[ and ⌘]", async () => {
		const host = await mountCanvas(KAFFE);
		await into(host, "explore");
		await into(host, "explore/loyalty");
		// a held frame keeps the page: ⌘[ and ⌘] are the frame's then
		await press(host, screenAt(host, { x: 10, y: 10 }));
		await keydown({ key: "[", code: "BracketLeft", ...ACCEL });
		await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
		expect(on(host)).toBe("explore/loyalty");
		await keydown({ key: "Escape" });
		await keydown({ key: "[", code: "BracketLeft", ...ACCEL });
		await until(() => on(host) === "explore");
		await keydown({ key: "[", code: "BracketLeft", ...ACCEL });
		await until(() => on(host) === "");
		await keydown({ key: "]", code: "BracketRight", ...ACCEL });
		await until(() => on(host) === "explore");
		// a page gone to from here voids the way forward
		await into(host, "explore/checkout");
		await keydown({ key: "]", code: "BracketRight", ...ACCEL });
		expect(on(host)).toBe("explore/checkout");
	});

	it("shows the keys on the path only while ⌘ is held", async () => {
		const host = await mountCanvas(KAFFE);
		await into(host, "explore");
		const keys = () => [...host.querySelectorAll<HTMLElement>("[data-path-key]")].map((key) => key.dataset.pathKey);
		expect(keys()).toEqual([]);
		await keydown({ key: accelKeyName(), ...ACCEL });
		await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
		expect(keys()).toEqual([hotkeyKey("canvas.page-up"), hotkeyKey("canvas.page-in")]);
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keyup", { key: accelKeyName(), bubbles: true }));
		});
		expect(keys()).toEqual([]);
	});
});

describe("a page of frames", () => {
	it("puts a selected frame down on Esc before going up a page", async () => {
		const host = await mountCanvas(KAFFE);
		await into(host, "app");
		await press(host, screenAt(host, { x: 10, y: 10 }));
		const menu = () => host.querySelector('button[aria-label="menu frame"]')?.getAttribute("aria-pressed");
		expect(menu()).toBe("true");
		await keydown({ key: "Escape" });
		expect(menu()).toBe("false");
		expect(on(host)).toBe("app");
		await keydown({ key: "Escape" });
		await until(() => on(host) === "");
		expect(lit(host)).toBe("app");
	});

	it("says so on a page nobody has written into", async () => {
		const host = await mountCanvas({ pages: [...KAFFE.pages, "fresh"], frames: KAFFE.frames });
		await into(host, "fresh");
		const empty = host.querySelector("[data-page-empty]");
		expect(empty?.textContent).toContain("no frames yet");
		expect(empty?.textContent).toContain("frames/fresh/<name>/frame.tsx");
		expect(host.querySelector("[data-page-list]")).toBeNull();
	});
});

describe("the peek", () => {
	const card = () => document.querySelector<HTMLElement>("[data-peek-card]");
	const space = () => keydown({ key: " ", code: "Space" });

	/** Space looks into a folder without going in: its stills, never a live frame */
	it("opens over the lit row on Space with the folder's stills, walks with the arrows, and goes on Esc", async () => {
		const host = await mountCanvas(KAFFE);
		await until(() => lit(host) === "app");
		await space();
		await until(() => card() !== null);
		expect(card()?.querySelector("[data-peek-map]")?.getAttribute("data-peek-map")).toBe("app");
		expect(card()?.querySelector("img")?.getAttribute("src")).toBe("/covers/test/app%2Fmenu/m1");
		expect(card()?.querySelector("iframe")).toBeNull();

		// the next folder down, the list's lit row following it; a folder of folders shows them
		await keydown({ key: "ArrowDown" });
		expect(lit(host)).toBe("explore");
		await until(() => card()?.querySelector('[data-drop-page="explore/checkout"]') != null);

		await keydown({ key: "Escape" });
		await until(() => card() === null);
		expect(on(host)).toBe("");
	});

	it("leaves Space to the Hand on a page of frames, the tree's cursor on a folder or not", async () => {
		const host = await mountCanvas(KAFFE);
		await into(host, "app");
		await space();
		expect(host.querySelector('button[aria-label="hand"]')?.getAttribute("aria-pressed")).toBe("true");
		expect(card()).toBeNull();
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }));
		});

		// the tree holds the keys with its cursor on a folder that is not this page, the pointer over the canvas
		const tree = host.querySelector<HTMLElement>('[aria-label="Pages tree"]');
		await act(async () => tree?.focus());
		const cursor = () => host.querySelector<HTMLElement>('[role="tree"] [data-rail-cursor]')?.dataset.dropPage;
		for (let step = 0; step < 6 && cursor() !== "explore"; step++) await keydown({ key: "ArrowDown" });
		await into(host, "explore/checkout");
		await act(async () => tree?.focus());
		expect(cursor()).toBe("explore");
		await act(async () => {
			host.querySelector('[role="application"]')?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
		});
		await space();
		expect(host.querySelector('button[aria-label="hand"]')?.getAttribute("aria-pressed")).toBe("true");
		expect(card()).toBeNull();
	});
});

describe("a frame dragged off the field", () => {
	/** the path's names are folders a frame lands in, through the rail's own move, with its undo said */
	it("moves to the page named on the path it is let go on, and says so with an Undo", async () => {
		const host = await mountCanvas(KAFFE);
		await into(host, "app");
		const root = host.querySelector<HTMLElement>('[data-path-page=""]');
		expect(root?.dataset.dropAt).toBe("path");
		// happy-dom lays nothing out, so the point the frame is let go at is said to be over that name
		const original = document.elementFromPoint;
		document.elementFromPoint = (x: number) => (x > 500 ? root : null);
		onTestFinished(() => {
			document.elementFromPoint = original;
		});
		await drag(host, screenAt(host, { x: 10, y: 10 }), { x: 600, y: 4 });

		const fetched = vi.mocked(fetch).mock.calls.find(([input]) => String(input).endsWith("/frames/move"));
		expect(JSON.parse(String(fetched?.[1]?.body))).toEqual({ frames: ["app/menu"], page: "" });
		await until(() => host.textContent?.includes("Moved menu to test") === true);
		// nothing the move took is written where the drag left it on the page it left
		expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith("/geometry"))).toBe(false);
	});

	/** the toast's Undo is the next ⌘Z, so a later change takes it away rather than leaving it to undo that */
	it("takes the move's toast away once another change is the one an undo would take", async () => {
		const host = await mountCanvas({ ...KAFFE, frames: [...KAFFE.frames, frame("app/cart", { x: 300 })] });
		await into(host, "app");
		const root = host.querySelector<HTMLElement>('[data-path-page=""]');
		const original = document.elementFromPoint;
		document.elementFromPoint = (x: number) => (x > 500 ? root : null);
		onTestFinished(() => {
			document.elementFromPoint = original;
		});
		await drag(host, screenAt(host, { x: 10, y: 10 }), { x: 600, y: 4 });
		await until(() => host.textContent?.includes("Moved menu to test") === true);

		const cart = screenAt(host, { x: 310, y: 10 });
		await drag(host, cart, { x: cart.x + 40, y: cart.y + 40 });
		await until(() => host.textContent?.includes("Moved menu to test") === false);
	});
});

async function keydown(init: KeyboardEventInit): Promise<void> {
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
	});
}

/** where a world point lands on the glass under the camera as it stands */
function screenAt(host: HTMLElement, world: { x: number; y: number }): { x: number; y: number } {
	const transform = camera(host)?.style.transform ?? "";
	const move = /translate\(([^p]+)px, ([^p]+)px\)/.exec(transform);
	const k = Number(/scale\(([^)]+)\)/.exec(transform)?.[1] ?? 1);
	return { x: world.x * k + Number(move?.[1] ?? 0), y: world.y * k + Number(move?.[2] ?? 0) };
}

/** a pointer press and release on the camera layer, in viewport coordinates */
async function press(host: HTMLElement, at: { x: number; y: number }): Promise<void> {
	await drag(host, at, at);
}

async function drag(host: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
	const surface = host.querySelector('[role="application"]');
	if (surface === null) throw new Error("no canvas surface");
	const pointer = (type: string, at: { x: number; y: number }) =>
		new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX: at.x, clientY: at.y });
	await act(async () => {
		surface.dispatchEvent(pointer("pointerdown", from));
	});
	if (from.x !== to.x || from.y !== to.y) {
		await act(async () => {
			surface.dispatchEvent(pointer("pointermove", to));
		});
	}
	await act(async () => {
		surface.dispatchEvent(pointer("pointerup", to));
	});
}

async function mountCanvas(
	project: {
		pages: readonly string[];
		frames: readonly Projected[];
	},
	options: { viewport?: number; cameras?: Record<string, { x: number; y: number; k: number }> } = {},
): Promise<HTMLElement> {
	if (options.viewport !== undefined) {
		// happy-dom lays nothing out, and a fit reads the viewport's own box
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(options.viewport);
		vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(options.viewport);
	}
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			if (url.pathname.endsWith("/events")) return openEventStream();
			if (url.pathname.endsWith("/state")) {
				return Response.json({ camera: { x: 0, y: 0, k: 1 }, pageCameras: options.cameras ?? {} });
			}
			if (url.pathname.endsWith("/frames")) {
				return Response.json({
					root: "/project",
					pages: project.pages,
					frames: project.frames,
				});
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({
					frames: project.frames.map((each) => each.name),
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
	// the presses below are in viewport coordinates, so they only mean what this
	// file says they mean once the stored camera has landed at the origin
	await until(() => camera(host)?.style.transform === "translate(0px, 0px) scale(1)");
	return host;
}

function camera(host: HTMLElement): HTMLElement | null {
	return host.querySelector<HTMLElement>('[data-canvas-camera=""]');
}

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
