// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import type { SourceRead } from "../../source-edit";
import { ProjectCanvas } from "./canvas";
import type { PickedHit } from "./protocol";

/**
 * Resize by handle (#305), out on the canvas.
 *
 * The ring wears the approved outline's set on a held element: a cube on each
 * corner, a grab strip on each side long enough to hold one, and a rotate zone
 * diagonally outside each corner. Nothing is written while the pointer is
 * down, because every sample is a preview in the running layout, and letting
 * go is one source operation and one press of undo. Every way a drag can be
 * interrupted retires the samples and saves nothing.
 */

const ACCEL = accelKeyName() === "Meta" ? { metaKey: true } : { ctrlKey: true };

const frames = [{ name: "home", x: 0, y: 0, w: 640, h: 480 }];

const STAMP = "frames/home/frame.tsx:7:4";

const ORIGINAL = {
	publication: "publication",
	cell: "className",
	occurrence: "occurrence",
	invocation: "invocation",
	context: "context",
	value: "p-4",
};

/** The box the frame answers with for the held rung, which each case may state. */
let held = { x: 10, y: 10, w: 200, h: 120 };

const chain = (): PickedHit[] => [
	{
		selector: "screen",
		tag: "div",
		outerHtml: "<div />",
		rect: { x: 0, y: 0, w: 400, h: 300 },
		radius: 0,
		source: "frames/home/frame.tsx:5:3",
		generated: false,
	},
	{
		selector: "screen > article",
		tag: "article",
		outerHtml: "<article />",
		rect: held,
		radius: 0,
		source: STAMP,
		generated: false,
	},
];

/** Where the south-east cube sits: the ring is the element's box, 2px out. */
const SE = { x: 212, y: 132 };
/** The east strip, half way down the ring. */
const EAST = { x: 212, y: 70 };

const binding = (token: string) => ({ kind: "binding", tokens: [token] });

it("drags the corner and saves both axes as one source operation", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	const corner = host.querySelector<HTMLElement>('[data-element-handle="se"]');
	expect(corner).not.toBeNull();

	await pointerDown(corner, SE.x, SE.y);
	await pointerMove(canvas, SE.x + 104, SE.y + 44);
	await settle();

	// the readout rides beside the ring, the matching rail field ticks in the
	// size the drag is making, and the source is left exactly as it was
	expect(host.querySelector("[data-element-readout]")?.textContent).toBe("304 × 164");
	expect(host.querySelector('[data-properties-row="width"] .type-value')?.textContent).toBe("[304px]");
	expect(sourceCalls("commit")).toHaveLength(0);
	// every sample previews in the running layout through the common owner
	expect(sourceCalls("preview").length).toBeGreaterThan(0);

	await pointerUp(canvas);
	await settle();

	// a whole step is the bare class, anything else stays absolute pixels
	expect(sourceCalls("commit").at(-1)).toMatchObject({
		original: ORIGINAL,
		change: {
			kind: "properties",
			value: {
				kind: "fields",
				changes: [
					{ property: "width", scope: "", value: binding("w-76") },
					{ property: "height", scope: "", value: binding("h-41") },
				],
			},
		},
	});

	// one gesture is one press of undo, even though it wrote two properties
	await press("z", ACCEL);
	await settle();
	expect(sourceCalls("inverse")).toHaveLength(1);
});

it("drags one edge and writes that axis alone", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await pointerDown(host.querySelector<HTMLElement>('[data-element-handle="e"]'), EAST.x, EAST.y);
	// a width off a whole step stays absolute: the drag meant pixels
	await pointerMove(canvas, EAST.x + 21, EAST.y + 300);
	await pointerUp(canvas);
	await settle();

	expect(sourceCalls("commit").at(-1)).toMatchObject({
		change: {
			kind: "properties",
			value: { kind: "fields", changes: [{ property: "width", value: binding("w-[221px]") }] },
		},
	});
});

it("keeps the proportions the box started with while shift is held", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	// shift decides what the gesture may write, so it is read where the read is
	// opened: a proportional edge drag is about both axes from the start
	await pointerDown(host.querySelector<HTMLElement>('[data-element-handle="e"]'), EAST.x, EAST.y, { shiftKey: true });
	await pointerMove(canvas, EAST.x + 100, EAST.y, { shiftKey: true });
	await pointerUp(canvas);
	await settle();

	expect(sourceCalls("commit").at(-1)).toMatchObject({
		change: {
			kind: "properties",
			value: {
				kind: "fields",
				changes: [
					{ property: "width", value: binding("w-75") },
					{ property: "height", value: binding("h-45") },
				],
			},
		},
	});
});

it("draws the approved set on a box with room for all of it", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	expect(new Set(handleNames(host))).toEqual(new Set(["nw", "n", "ne", "e", "se", "s", "sw", "w"]));
});

it("drops a strip the side has no room for, and keeps the corners", async () => {
	// 64px tall: the approved outline gives a side under 72px no strip of its
	// own, because a strip that short is a corner with worse aim
	held = { x: 10, y: 10, w: 200, h: 64 };
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	expect(new Set(handleNames(host))).toEqual(new Set(["nw", "n", "ne", "se", "s", "sw"]));
});

it("draws nothing on a target under 24px on its smaller dimension", async () => {
	held = { x: 10, y: 10, w: 200, h: 20 };
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	expect(handleNames(host)).toEqual([]);
});

const handleNames = (host: HTMLElement): (string | undefined)[] =>
	[...host.querySelectorAll("[data-element-handle]")].map((node) => (node as HTMLElement).dataset.elementHandle);

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

it("turns from the zone outside a corner, and writes the rotation it settled on", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	const zone = host.querySelector<HTMLElement>('[data-element-rotate="ne"]');
	expect(zone).not.toBeNull();

	// the element's centre is (110, 70): a grab due east, dragged to due south
	await pointerDown(zone, 310, 70);
	await pointerMove(canvas, 110, 270);
	expect(host.querySelector("[data-element-readout]")?.textContent).toBe("90°");
	await pointerMove(canvas, 140, 270, { shiftKey: true });
	expect(host.querySelector("[data-element-readout]")?.textContent).toBe("75°");
	await pointerUp(canvas);
	await settle();

	expect(sourceCalls("commit").at(-1)).toMatchObject({
		change: {
			kind: "properties",
			value: { kind: "fields", changes: [{ property: "rotate", value: binding("rotate-75") }] },
		},
	});
});

it("refuses a size the layout decides rather than rewriting it in pixels", async () => {
	rung = { source: STAMP, name: "article", className: "w-full", path: "design/frames/home/frame.tsx", line: 7 };
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await pointerDown(host.querySelector<HTMLElement>('[data-element-handle="e"]'), EAST.x, EAST.y);
	await pointerMove(canvas, EAST.x + 40, EAST.y);
	await settle();

	expect(host.querySelector('[data-hand-refusal="authored-unit"]')?.textContent).toBe(
		"w-full is what the layout decides, not a length a drag can move",
	);
	await pointerUp(canvas);
	await settle();
	expect(sourceCalls("commit")).toHaveLength(0);
});

it("keeps the source as it was when a drag ends where it began", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await pointerDown(host.querySelector<HTMLElement>('[data-element-handle="se"]'), SE.x, SE.y);
	await pointerMove(canvas, SE.x, SE.y);
	await pointerUp(canvas);
	await settle();

	expect(sourceCalls("commit")).toHaveLength(0);
});

/**
 * Every way a drag ends without a save (#305). Each retires the samples, puts
 * the previews the gesture owned back, and leaves the source untouched. A
 * release that arrives afterwards cannot revive the generation it cancelled.
 */
const INTERRUPTIONS = [
	{
		name: "Escape",
		interrupt: async () => {
			await press("Escape");
		},
	},
	{
		name: "pointer cancellation",
		interrupt: async (canvas: HTMLElement) => {
			await act(async () => {
				canvas.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 5 }));
			});
		},
	},
	{
		name: "lost capture",
		interrupt: async (canvas: HTMLElement) => {
			await act(async () => {
				canvas.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: true, pointerId: 5 }));
			});
		},
	},
	{
		name: "window blur",
		interrupt: async () => {
			await act(async () => {
				window.dispatchEvent(new Event("blur"));
			});
		},
	},
	{
		name: "a scrolled or zoomed canvas",
		interrupt: async (canvas: HTMLElement) => {
			await act(async () => {
				canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120 }));
			});
		},
	},
];

it.each(INTERRUPTIONS)("saves nothing when $name interrupts the drag", async ({ interrupt }) => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await pointerDown(host.querySelector<HTMLElement>('[data-element-handle="se"]'), SE.x, SE.y);
	await pointerMove(canvas, SE.x + 104, SE.y + 44);
	await settle();
	await interrupt(canvas);
	await settle();

	expect(host.querySelector("[data-element-readout]")).toBeNull();
	expect(sourceCalls("commit")).toHaveLength(0);
	// the read the gesture opened is given back rather than left held
	expect(sourceCalls("cancel").length).toBeGreaterThan(0);

	// the release the pointer still owes cannot bring the cancelled drag back
	await pointerUp(canvas);
	await settle();
	expect(sourceCalls("commit")).toHaveLength(0);
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

/** What the document says about the element a drag has grabbed. */
const SIZING = {
	units: { rem: 16, em: 16 },
	box: { w: 200, h: 120 },
	extra: { w: 0, h: 0 },
	free: false,
	flow: { axis: "column" as const, reversed: false },
	offset: { left: null, top: null },
	limits: { minW: 0, minH: 0, maxW: null, maxH: null },
};

/**
 * What the document says a drag may align with (#311), and what the layout
 * makes of the size it is given: `actual` is the box the element comes back as
 * after the correction was written, where that is not the size that was asked
 * for.
 */
let snapping: {
	targets: { id: number; box: { x: number; y: number; w: number; h: number } }[];
	sensitivity: { w: number; h: number };
	actual: { w: number; h: number } | null;
} = { targets: [], sensitivity: { w: 0, h: 0 }, actual: null };

/** The width the last preview wrote, which is the box the document then has. */
let previewed: number | null = null;

/** A size token back to the pixels it names, on this project's own step. */
function tokenPx(token: string): number | null {
	const bracket = /^[a-z]+-\[(-?[\d.]+)px\]$/.exec(token);
	if (bracket !== null) return Number(bracket[1]);
	const step = /^[a-z]+-([\d.]+)$/.exec(token);
	return step === null ? null : Number(step[1]) * THEME.step;
}

let rung: RungRead = {
	source: STAMP,
	name: "article",
	className: "p-4",
	path: "design/frames/home/frame.tsx",
	line: 7,
};

let sourceRead: SourceRead | undefined;

interface FramePlayer {
	answer: (chain: readonly PickedHit[]) => Promise<void>;
	boot: () => Promise<void>;
}

/** Hold the element the ring is drawn on, and let its read land. */
async function holdTheElement(canvas: HTMLElement, frame: FramePlayer): Promise<void> {
	await clickAt(canvas, 20, 20);
	await deepClickAt(canvas, 20, 20);
	await frame.answer(chain());
	await settle();
}

async function readyCanvas(): Promise<{ host: HTMLDivElement; canvas: HTMLElement; frame: FramePlayer }> {
	sourceRead = undefined;
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
		held = { x: 10, y: 10, w: 200, h: 120 };
		snapping = { targets: [], sensitivity: { w: 0, h: 0 }, actual: null };
		previewed = null;
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
			spies.set(
				contentWindow,
				vi.spyOn(contentWindow, "postMessage").mockImplementation((message) => {
					const answer = (data: Record<string, unknown>) =>
						queueMicrotask(() =>
							window.dispatchEvent(new MessageEvent("message", { source: contentWindow, data })),
						);
					if (message?.spool === "sizing") {
						answer({ spool: "sized", frame: "home", id: message.id, sizing: SIZING });
						return;
					}
					if (message?.spool === "snapping") {
						// a trial states the size it asks about; the check afterwards reads
						// whatever the sample actually wrote, which is what the layout took
						const trial = message.trial as { wear: { w: number | null; h: number | null } } | null;
						const width = trial === null ? (snapping.actual?.w ?? previewed ?? held.w) : (trial.wear.w ?? held.w);
						const height = trial === null ? (snapping.actual?.h ?? held.h) : (trial.wear.h ?? held.h);
						answer({
							spool: "snapped",
							frame: "home",
							id: message.id,
							snapping: {
								box: { x: held.x, y: held.y, w: width, h: height },
								sensitivity: snapping.sensitivity,
								targets: snapping.targets,
								parent: null,
							},
						});
						return;
					}
					if (message?.spool !== "source-request") return;
					const result =
						message.action === "read" || message.action === "inspect" || message.action === "complete"
							? ORIGINAL
							: message.action === "inventory"
								? {
										publication: ORIGINAL.publication,
										uses: [{ original: ORIGINAL, visible: true }],
										unknown: 0,
									}
								: true;
					answer({ spool: "source-reply", id: message.id, result });
				}),
			);
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

const sourceCalls = (action: string) => posted("/source").filter((body) => body.action === action);

async function pointerDown(
	target: HTMLElement | null,
	x: number,
	y: number,
	modifiers: Record<string, boolean> = {},
): Promise<void> {
	if (target === null) throw new Error("no handle to grab");
	await act(async () => {
		target.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				button: 0,
				clientX: x,
				clientY: y,
				pointerId: 5,
				...modifiers,
			}),
		);
	});
	await settle();
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
			if (url.pathname.endsWith("/source")) {
				const body = JSON.parse(String(init?.body)) as { action: string; generation: number; revision?: number };
				if (body.action === "read") {
					sourceRead = {
						operation: { kind: "properties", target: { kind: "fields", fields: [] } },
						handle: "read",
						owner: "owner",
						generation: body.generation,
						original: ORIGINAL,
						source: STAMP,
						role: "class-cell",
						value: "p-4",
					} as unknown as SourceRead;
					return Response.json({ ok: true, read: sourceRead });
				}
				if (body.action === "reach")
					return Response.json(sourceRead ? { ok: true, read: sourceRead } : { ok: false, reason: "no read" });
				if (body.action === "preview") {
					const change = body as unknown as {
						change?: { value?: { changes?: { property: string; value: { tokens?: string[] } }[] } };
					};
					for (const field of change.change?.value?.changes ?? [])
						if (field.property === "width") previewed = tokenPx(field.value.tokens?.[0] ?? "");
					return Response.json({
						ok: true,
						preview: { generation: body.generation, revision: body.revision ?? 1, value: "", frames: [] },
					});
				}
				if (body.action === "commit" || body.action === "inverse")
					return Response.json({
						ok: true,
						source: "saved",
						publication: null,
						receipt: { owner: "owner", handle: "receipt", operation: { kind: "properties" } },
					});
				return Response.json({ ok: true });
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

/* --- snapping the drag onto what the document offers (#311) ---------------- */

it("pulls the dragged edge onto a stop the document offers and draws its guide", async () => {
	// the sibling's right edge is at 234; the pointer asks for 221, which puts
	// the dragged edge at 231, three pixels short and inside the six
	snapping = { targets: [{ id: 1, box: { x: 74, y: 0, w: 160, h: 40 } }], sensitivity: { w: 1, h: 0 }, actual: null };
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await pointerDown(host.querySelector<HTMLElement>('[data-element-handle="e"]'), EAST.x, EAST.y);
	await pointerMove(canvas, EAST.x + 21, EAST.y);
	await settle();

	expect(host.querySelector("[data-element-readout]")?.textContent).toBe("224 × 120");
	expect(host.querySelectorAll("[data-element-guide]")).toHaveLength(1);

	await pointerUp(canvas);
	await settle();
	expect(sourceCalls("commit").at(-1)).toMatchObject({
		change: {
			kind: "properties",
			value: { kind: "fields", changes: [{ property: "width", value: binding("w-56") }] },
		},
	});
});

it("keeps the size the pointer asked for when the layout did not take the correction", async () => {
	// the correction was applied and the element came back the size it was: an
	// alignment nobody got is no alignment, so the raw intent stands alone
	snapping = {
		targets: [{ id: 1, box: { x: 74, y: 0, w: 160, h: 40 } }],
		sensitivity: { w: 1, h: 0 },
		actual: { w: 221, h: 120 },
	};
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await pointerDown(host.querySelector<HTMLElement>('[data-element-handle="e"]'), EAST.x, EAST.y);
	await pointerMove(canvas, EAST.x + 21, EAST.y);
	await settle();

	expect(host.querySelector("[data-element-readout]")?.textContent).toBe("221 × 120");
	expect(host.querySelectorAll("[data-element-guide]")).toHaveLength(0);
});

it("drops the whole pool while the bypass is held, and takes it back on release", async () => {
	snapping = { targets: [{ id: 1, box: { x: 74, y: 0, w: 160, h: 40 } }], sensitivity: { w: 1, h: 0 }, actual: null };
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await pointerDown(host.querySelector<HTMLElement>('[data-element-handle="e"]'), EAST.x, EAST.y);
	await pointerMove(canvas, EAST.x + 21, EAST.y, ACCEL);
	await settle();
	expect(host.querySelector("[data-element-readout]")?.textContent).toBe("221 × 120");
	expect(host.querySelectorAll("[data-element-guide]")).toHaveLength(0);

	await pointerMove(canvas, EAST.x + 22, EAST.y);
	await settle();
	expect(host.querySelector("[data-element-readout]")?.textContent).toBe("224 × 120");
	expect(host.querySelectorAll("[data-element-guide]")).toHaveLength(1);
});

it("takes the guide down when the drag is cancelled", async () => {
	snapping = { targets: [{ id: 1, box: { x: 74, y: 0, w: 160, h: 40 } }], sensitivity: { w: 1, h: 0 }, actual: null };
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await pointerDown(host.querySelector<HTMLElement>('[data-element-handle="e"]'), EAST.x, EAST.y);
	await pointerMove(canvas, EAST.x + 21, EAST.y);
	await settle();
	expect(host.querySelectorAll("[data-element-guide]")).toHaveLength(1);

	await press("Escape");
	await settle();
	expect(host.querySelectorAll("[data-element-guide]")).toHaveLength(0);
	expect(sourceCalls("commit")).toHaveLength(0);
});
