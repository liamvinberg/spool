// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import { ProjectCanvas } from "./canvas";
import type { PickedHit } from "./protocol";

/**
 * Resize by handle (#259), out on the canvas.
 *
 * The ring wears Figma's set on a held element: a cube on each corner, bare
 * grab strips on the edges, and a rotate zone diagonally outside each corner.
 * A handle is drawn only for an axis the file leaves live, so every drag on
 * the ring is one the lane will take. Nothing is written until the pointer
 * comes up, and what it writes is one patch and one press of undo.
 */

const ACCEL = accelKeyName() === "Meta" ? { metaKey: true } : { ctrlKey: true };

const frames = [{ name: "home", x: 0, y: 0, w: 640, h: 480, kind: "html" }];

const STAMP = "frames/home/frame.tsx:7:4";

const CHAIN: PickedHit[] = [
	{
		selector: "screen",
		tag: "div",
		outerHtml: "<div />",
		rect: { x: 0, y: 0, w: 200, h: 120 },
		radius: 0,
		source: "frames/home/frame.tsx:5:3",
		generated: false,
	},
	{
		selector: "screen > article",
		tag: "article",
		outerHtml: "<article />",
		rect: { x: 10, y: 10, w: 120, h: 40 },
		radius: 0,
		source: STAMP,
		generated: false,
	},
];

/** Where the south-east cube sits: the ring is the element's box, 2px out. */
const SE = { x: 132, y: 52 };

it("drags the corner and writes both axes as one patch", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	const corner = host.querySelector<HTMLElement>('[data-element-handle="se"]');
	expect(corner).not.toBeNull();

	await pointerDown(corner, SE.x, SE.y);
	await pointerMove(canvas, SE.x + 104, SE.y + 44);
	// the readout rides beside the ring while the pointer is down, and the file
	// is left exactly as it was
	expect(host.querySelector("[data-element-readout]")?.textContent).toBe("224 × 84");
	// and the matching field in the rail ticks with it, in the token about to land
	expect(host.querySelector<HTMLInputElement>('[data-properties-row="width"] input')?.value).toBe("[224px]");
	expect(writes()).toHaveLength(0);

	await pointerUp(canvas);
	await settle();

	// a whole step is the bare class, anything else stays absolute pixels
	expect(gateAsks().at(-1)).toEqual({
		frame: "home",
		ops: [
			{ kind: "set-class", source: STAMP, token: "w-56", scope: "" },
			{ kind: "set-class", source: STAMP, token: "h-21", scope: "" },
		],
	});
	expect(writes().at(-1)).toMatchObject({ frame: "home", fingerprint: "abc" });

	// one gesture is one press of undo, even though it wrote two tokens
	await press("z", { metaKey: true, ctrlKey: true });
	await settle();
	expect(reverts()).toHaveLength(1);
});

it("drags one edge and writes that axis alone", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	const edge = host.querySelector<HTMLElement>('[data-element-handle="e"]');
	await pointerDown(edge, 132, 30);
	// a width off a whole step stays absolute: the drag meant pixels
	await pointerMove(canvas, 132 + 21, 300);
	await pointerUp(canvas);
	await settle();

	expect(gateAsks().at(-1)).toEqual({
		frame: "home",
		ops: [{ kind: "set-class", source: STAMP, token: "w-[141px]", scope: "" }],
	});
});

it("turns from the zone outside a corner, and snaps to 15° under shift", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	const zone = host.querySelector<HTMLElement>('[data-element-rotate="ne"]');
	expect(zone).not.toBeNull();

	// the element's centre is (70, 30): a grab due east, dragged to due south
	await pointerDown(zone, 170, 30);
	await pointerMove(canvas, 70, 130);
	expect(host.querySelector("[data-element-readout]")?.textContent).toBe("90°");
	await pointerMove(canvas, 100, 130, { shiftKey: true });
	expect(host.querySelector("[data-element-readout]")?.textContent).toBe("75°");
	await pointerUp(canvas);
	await settle();

	expect(gateAsks().at(-1)).toEqual({
		frame: "home",
		ops: [{ kind: "set-class", source: STAMP, token: "rotate-75", scope: "" }],
	});
});

it("draws no handle for an axis a breakpoint pins, and keeps the other", async () => {
	rung = { source: STAMP, name: "article", className: "md:w-96", path: "design/frames/home/frame.tsx", line: 7 };
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	// a base width cannot honestly beat `md:w-96`, so there is nothing to grab
	// on that axis and the height is untouched
	expect(host.querySelector('[data-element-handle="e"]')).toBeNull();
	expect(host.querySelector('[data-element-handle="w"]')).toBeNull();
	expect(host.querySelector('[data-element-handle="s"]')).not.toBeNull();
});

it("draws no handle at all on a literal no hand may write", async () => {
	rung = {
		source: STAMP,
		name: "article",
		className: "",
		path: "design/frames/home/frame.tsx",
		line: 7,
		refusal: { code: "computed-class", says: "className is an expression" },
	};
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	expect(host.querySelector("[data-element-handle]")).toBeNull();
	expect(host.querySelector("[data-element-rotate]")).toBeNull();
});

it("puts a size back when the box the document came back with is not the one written", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await pointerDown(host.querySelector<HTMLElement>('[data-element-handle="se"]'), SE.x, SE.y);
	await pointerMove(canvas, SE.x + 104, SE.y + 44);
	await pointerUp(canvas);
	await settle();
	expect(reverts()).toHaveLength(0);

	// the document reloads and reports a box a flex-basis clamped: the class
	// landed and the size did not, so the patch is run back and it says so
	await frame.boot();
	await frame.answer([CHAIN[0] as PickedHit, { ...(CHAIN[1] as PickedHit), rect: { x: 10, y: 10, w: 96, h: 84 } }]);
	await settle();

	expect(reverts()).toHaveLength(1);
	expect(host.querySelector('[data-hand-notice="clamped"]')).not.toBeNull();

	// the entry it pushed is withdrawn: there is nothing left to undo
	await press("z", { metaKey: true, ctrlKey: true });
	await settle();
	expect(reverts()).toHaveLength(1);
});

it("keeps the file as it was when a drag ends where it began", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await pointerDown(host.querySelector<HTMLElement>('[data-element-handle="se"]'), SE.x, SE.y);
	await pointerMove(canvas, SE.x, SE.y);
	await pointerUp(canvas);
	await settle();

	expect(gateAsks().filter((ask) => JSON.stringify(ask).includes("set-class"))).toHaveLength(0);
	expect(writes()).toHaveLength(0);
});

// --- the harness -------------------------------------------------------------

interface RungRead {
	source: string;
	name?: string;
	className: string;
	path?: string;
	line?: number;
	refusal?: { code: string; says: string };
}

/** the project's own theme, which is where the step and the breakpoints come from */
const THEME = {
	colour: [],
	text: [],
	weight: [],
	font: [],
	leading: [],
	tracking: [],
	radius: [],
	shadow: [],
	ease: [],
	screen: [{ name: "md", value: "48rem", from: "default" }],
	step: 4,
};

let rung: RungRead = {
	source: STAMP,
	name: "article",
	className: "p-4",
	path: "design/frames/home/frame.tsx",
	line: 7,
};

interface FramePlayer {
	answer: (chain: readonly PickedHit[]) => Promise<void>;
	boot: () => Promise<void>;
}

/** Hold the element the ring is drawn on, and let its read land. */
async function holdTheElement(canvas: HTMLElement, frame: FramePlayer): Promise<void> {
	await clickAt(canvas, 20, 20);
	await deepClickAt(canvas, 20, 20);
	await frame.answer(CHAIN.slice(0, 2));
	await settle();
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
		rung = { source: STAMP, name: "article", className: "p-4", path: "design/frames/home/frame.tsx", line: 7 };
	});

	await act(async () => {
		root.render(createElement(ProjectCanvas, { project: "test", onChrome: () => {} }));
	});
	await until(() => host.querySelector('[data-frame-label="home"]') !== null);
	const canvas = host.querySelector<HTMLElement>('[role="application"]');
	if (canvas === null) throw new Error("canvas did not render");

	await clickAt(canvas, 20, 20);
	await until(() => host.querySelector('iframe[title="home"]') !== null);

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

	return {
		host,
		canvas,
		frame: {
			answer: async (chain) => {
				live();
				const ask = [...spies.values()]
					.flatMap((spy) => spy.mock.calls.map((call) => call[0]))
					.filter((message): message is Record<string, unknown> => typeof message === "object" && message !== null)
					.filter((message) => message.spool === "pick" || message.spool === "kin")
					.sort((a, b) => Number(a.id) - Number(b.id))
					.at(-1);
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
			boot,
		},
	};
}

function posted(suffix: string): Record<string, unknown>[] {
	const calls = (globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls;
	return calls
		.filter(([input, init]) => String(input).endsWith(suffix) && init?.method === "POST")
		.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

const gateAsks = () => posted("/patch/gate");
const reverts = () => posted("/patch/revert");
const writes = () => posted("/patch");

async function pointerDown(target: HTMLElement | null, x: number, y: number): Promise<void> {
	if (target === null) throw new Error("no handle to grab");
	await act(async () => {
		target.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 5 }),
		);
	});
}

async function pointerMove(
	canvas: HTMLElement,
	x: number,
	y: number,
	modifiers: Record<string, boolean> = {},
): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, pointerId: 5, ...modifiers }),
		);
	});
}

async function pointerUp(canvas: HTMLElement): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 5 }));
	});
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

async function press(key: string, modifiers: Record<string, boolean> = {}): Promise<void> {
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }));
	});
}

async function settle(): Promise<void> {
	await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
}

async function until(ready: () => boolean, ms = 2000): Promise<void> {
	const deadline = Date.now() + ms;
	while (!ready()) {
		if (Date.now() > deadline) throw new Error("timed out");
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
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const raw = input instanceof Request ? input.url : String(input);
			const url = new URL(raw, window.location.href);
			if (url.pathname.endsWith("/events")) {
				return new Response(new ReadableStream<Uint8Array>({ start() {} }), {
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
			if (url.pathname.endsWith("/rungs")) {
				// one read per stamp asked about, in order: the rail asks for the whole
				// ancestry and the ring for the held rung alone
				const asked = JSON.parse(String(init?.body)) as { sources: string[] };
				const rungs = asked.sources.map((source, at) =>
					at === asked.sources.length - 1
						? { ...rung, source }
						: { source, name: "div", className: "flex", path: "design/frames/home/frame.tsx", line: 5 },
				);
				return Response.json({ rungs });
			}
			if (url.pathname.endsWith("/theme")) return Response.json({ theme: THEME });
			if (url.pathname.endsWith("/theme/classes")) return Response.json({ compiled: [] });
			if (url.pathname.endsWith("/patch/gate")) {
				return Response.json({ ok: true, path: "design/frames/home/frame.tsx", fingerprint: "abc", mapped: false });
			}
			if (url.pathname.endsWith("/patch/revert")) {
				return Response.json({
					ok: true,
					path: "design/frames/home/frame.tsx",
					fingerprint: "def",
					undo: { path: "design/frames/home/frame.tsx", start: 0, end: 4, text: "w-56", fingerprint: "def" },
				});
			}
			if (url.pathname.endsWith("/patch")) {
				return Response.json({
					ok: true,
					path: "design/frames/home/frame.tsx",
					fingerprint: "def",
					mapped: false,
					undo: { path: "design/frames/home/frame.tsx", start: 0, end: 3, text: "p-4", fingerprint: "def" },
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
}
