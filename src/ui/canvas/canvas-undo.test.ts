// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import type { Geometry } from "../api";
import { ProjectCanvas } from "./canvas";

/**
 * One undo stack, from the keyboard down (#230).
 *
 * The pure walking is covered beside the module; what these are about is where
 * a press lands: the trash toast still answers ⌘Z first, the stack answers
 * next, and an explorer entry the rail recorded is run back through the rail's
 * own calls without the canvas knowing how.
 */

const ACCEL = accelKeyName() === "Meta" ? { metaKey: true } : { ctrlKey: true };

interface Ask {
	url: string;
	body: unknown;
}

let asked: Ask[] = [];
/** the disk, as the daemon would report it — a landed operation moves it */
let projected: Array<Record<string, unknown>> = [];

beforeEach(() => {
	asked = [];
	projected = [
		{ name: "home", x: 0, y: 0, w: 320, h: 240, kind: "html" },
		{ name: "shell", x: 400, y: 0, w: 320, h: 240, kind: "html" },
	];
});

it("answers the trash toast first and the one stack next, on the same chord", async () => {
	const { host, canvas } = await renderCanvas();

	// take home and nudge it: one entry, once the flush lands
	await click(canvas, 40, 40);
	await act(async () => press("ArrowRight"));
	await settle(450);
	expect(lastGeometry()).toEqual({ home: { x: 1, y: 0, w: 320, h: 240 } });

	// take shell and stage it for the Trash
	await click(canvas, 440, 40);
	await act(async () => press("Backspace"));
	expect(host.querySelector('[data-frame-label="shell"]')).toBeNull();

	const wrote = geometryPuts().length;
	await act(async () => press("z", ACCEL));
	// the toast owned that one: shell is back and nothing moved
	expect(host.querySelector('[data-frame-label="shell"]')).not.toBeNull();
	expect(geometryPuts()).toHaveLength(wrote);

	await act(async () => press("z", ACCEL));
	expect(lastGeometry()).toEqual({ home: { x: 0, y: 0, w: 320, h: 240 } });

	await act(async () => press("z", { ...ACCEL, shiftKey: true }));
	expect(lastGeometry()).toEqual({ home: { x: 1, y: 0, w: 320, h: 240 } });
});

it("walks a rename the rail made back through the rail's own call", async () => {
	const { host } = await renderCanvas();

	await act(async () => {
		host.querySelector<HTMLButtonElement>('button[aria-label="Expand root"]')?.click();
	});
	const row = host.querySelector<HTMLElement>('button[aria-label="home frame"]')?.parentElement;
	await act(async () => {
		row?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 4 }));
		window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 4 }));
	});
	host.querySelector<HTMLElement>('[aria-label="Pages tree"]')?.focus();
	await act(async () => press("F2"));
	const input = host.querySelector<HTMLInputElement>('input[aria-label="Rename"]');
	await act(async () => type(input, "landing"));
	// the daemon renamed the folder, so the projection the rail re-reads has moved
	renamedTo("landing");
	await act(async () => input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
	expect(renames().at(-1)).toEqual({ from: "home", to: "landing" });
	await settle(20);

	// ⌘Z is the canvas's chord even while the rail holds focus, and the rail is
	// what runs the entry: the reverse rename goes out on the same wire
	renamedTo("home");
	await act(async () => press("z", ACCEL));
	await settle(20);
	expect(renames().at(-1)).toEqual({ from: "landing", to: "home" });

	renamedTo("landing");
	await act(async () => press("z", { ...ACCEL, shiftKey: true }));
	await settle(20);
	expect(renames().at(-1)).toEqual({ from: "home", to: "landing" });

	// and the frame keeps the place somebody put it, all the way round
	expect((lastOrder()?.frames as Record<string, string[]> | undefined)?.[""]).toEqual(["landing", "shell"]);
});

/** The daemon answered: the first frame goes by another name from here on. */
function renamedTo(name: string) {
	projected = [{ name, x: 0, y: 0, w: 320, h: 240, kind: "html" }, ...projected.slice(1)];
}

function press(key: string, extra: KeyboardEventInit = {}) {
	window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
}

async function click(canvas: HTMLElement, x: number, y: number) {
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 }),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 }),
		);
	});
}

/** React listens for `input`, so the value has to be set through the native setter */
function type(element: HTMLInputElement | null, text: string) {
	if (element === null) throw new Error("no input to type into");
	Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, text);
	element.dispatchEvent(new Event("input", { bubbles: true }));
}

async function settle(ms: number) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

function geometryPuts(): Array<Record<string, Geometry>> {
	return asked
		.filter((ask) => ask.url.endsWith("/geometry"))
		.map((ask) => (ask.body as { frames: Record<string, Geometry> }).frames);
}

const lastGeometry = () => geometryPuts().at(-1);

function renames(): Array<{ from: string; to: string }> {
	return asked
		.filter((ask) => ask.url.endsWith("/frames/rename"))
		.map((ask) => ask.body as { from: string; to: string });
}

function lastOrder(): Record<string, unknown> | undefined {
	return asked.filter((ask) => ask.url.endsWith("/order")).at(-1)?.body as Record<string, unknown> | undefined;
}

async function renderCanvas(): Promise<{ host: HTMLDivElement; canvas: HTMLElement }> {
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
	return { host, canvas };
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
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const raw = input instanceof Request ? input.url : String(input);
			const url = new URL(raw, window.location.href);
			const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
			asked.push({ url: url.pathname, body });
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) {
				return Response.json({ root: "/project", pages: [], frames: projected, collisions: [] });
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: ["home"], links: [], edges: [], unreadable: [] });
			}
			if (url.pathname.endsWith("/order")) return Response.json({});
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

async function until(ready: () => boolean, tries = 40): Promise<void> {
	for (let i = 0; i < tries; i++) {
		if (ready()) return;
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
		});
	}
	throw new Error("condition never became true");
}
