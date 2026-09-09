// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import type { SourceRead } from "../../source-edit";
import { ProjectCanvas } from "./canvas";
import type { GapReading } from "./hand-gap";
import type { PickedHit } from "./protocol";

/**
 * Gap by handle (#306), out on the canvas.
 *
 * A held flex container wears a band over each gap the document can honestly
 * name. Dragging one previews in the running layout and writes once when it is
 * let go; clicking one opens the same exact value the rail's own field offers.
 * A container whose geometry does not identify a gap wears nothing at all, and
 * its row in the rail is still there.
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
	value: "flex gap-4",
};

const held = { x: 10, y: 10, w: 200, h: 120 };

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

/** Two 80x40 children with a 16px column gap between them: one band, at x 90. */
const ROW: GapReading = {
	display: "flex",
	direction: "row",
	wrap: "nowrap",
	justify: "flex-start",
	writing: "horizontal-tb",
	columnGap: "16px",
	rowGap: "16px",
	ambiguous: false,
	children: [
		{ box: { x: 10, y: 10, w: 80, h: 40 }, out: false, displaced: false },
		{ box: { x: 106, y: 10, w: 80, h: 40 }, out: false, displaced: false },
	],
};

/** The middle of the one band the row draws. */
const BAND = { x: 98, y: 30 };

let reading: GapReading | null = ROW;

const binding = (token: string) => ({ kind: "binding", tokens: [token] });

it("drags a visible gap and saves the one axis it names", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	const band = host.querySelector<HTMLElement>('[data-element-gap="0"]');
	expect(band).not.toBeNull();

	await pointerDown(band, BAND.x, BAND.y);
	await pointerMove(canvas, BAND.x + 16, BAND.y);
	await settle();

	// 16 document pixels on a four-pixel scale is four steps along it, and every
	// sample is a preview: the file is left exactly as it was
	expect(sourceCalls("commit")).toHaveLength(0);
	expect(sourceCalls("preview").length).toBeGreaterThan(0);

	await pointerUp(canvas);
	await settle();

	expect(sourceCalls("commit").at(-1)).toMatchObject({
		original: ORIGINAL,
		change: {
			kind: "properties",
			value: {
				kind: "fields",
				changes: [{ property: "column-gap", scope: "", value: binding("gap-x-8") }],
			},
		},
	});

	// one drag is one save and one press of undo
	await press("z", ACCEL);
	await settle();
	expect(sourceCalls("inverse")).toHaveLength(1);
});

it("writes nothing where a drag never moved", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await pointerDown(host.querySelector('[data-element-gap="0"]'), BAND.x, BAND.y);
	await pointerUp(canvas);
	await settle();

	expect(sourceCalls("commit")).toHaveLength(0);
});

it("puts every preview back when the drag is cancelled", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await pointerDown(host.querySelector('[data-element-gap="0"]'), BAND.x, BAND.y);
	await pointerMove(canvas, BAND.x + 16, BAND.y);
	await settle();
	await press("Escape");
	await settle();

	expect(sourceCalls("commit")).toHaveLength(0);
	expect(sourceCalls("cancel").length).toBeGreaterThan(0);

	// the release the pointer still owes cannot bring the cancelled drag back
	await pointerUp(canvas);
	await settle();
	expect(sourceCalls("commit")).toHaveLength(0);
});

it("opens the exact value on a click that never became a drag", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	await pointerDown(host.querySelector('[data-element-gap="0"]'), BAND.x, BAND.y);
	await pointerUp(canvas);
	await settle();

	const field = host.querySelector<HTMLInputElement>("[data-gap-popover] input");
	expect(field).not.toBeNull();
	expect(field?.value).toBe("4");

	await typeInto(field, "12");
	await settle();

	expect(sourceCalls("commit").at(-1)).toMatchObject({
		change: {
			kind: "properties",
			value: { kind: "fields", changes: [{ property: "column-gap", scope: "", value: binding("gap-x-12") }] },
		},
	});
});

it("draws no band where the geometry does not identify a gap", async () => {
	reading = { ...ROW, wrap: "wrap" };
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	expect(host.querySelector("[data-element-gap]")).toBeNull();
	// the honest route is still there: the rail's own row for the same property
	expect(host.querySelector('[data-properties-row="gap"]')).not.toBeNull();
});

it("draws no band over a gap too thin to grab", async () => {
	reading = {
		...ROW,
		columnGap: "2px",
		children: [
			{ box: { x: 10, y: 10, w: 80, h: 40 }, out: false, displaced: false },
			{ box: { x: 92, y: 10, w: 80, h: 40 }, out: false, displaced: false },
		],
	};
	const { host, canvas, frame } = await readyCanvas();
	await holdTheElement(canvas, frame);

	expect(host.querySelector("[data-element-gap]")).toBeNull();
	expect(host.querySelector('[data-properties-row="gap"]')).not.toBeNull();
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
	className: "flex gap-4",
	path: "design/frames/home/frame.tsx",
	line: 7,
};

let sourceRead: SourceRead | undefined;

interface FramePlayer {
	answer: (chain: readonly PickedHit[]) => Promise<void>;
	boot: () => Promise<void>;
}

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
		rung = { source: STAMP, name: "article", className: "flex gap-4", path: "design/frames/home/frame.tsx", line: 7 };
		reading = ROW;
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
					if (message?.spool === "gaps") {
						answer({ spool: "gapped", frame: "home", id: message.id, gaps: reading });
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

async function pointerDown(target: HTMLElement | null, x: number, y: number): Promise<void> {
	if (target === null) throw new Error("no band to grab");
	await act(async () => {
		target.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 5 }),
		);
	});
	await settle();
}

async function pointerMove(canvas: HTMLElement, x: number, y: number): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, pointerId: 5 }));
	});
}

async function pointerUp(canvas: HTMLElement): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 5 }));
	});
}

async function typeInto(field: HTMLInputElement | null, text: string): Promise<void> {
	if (field === null) throw new Error("no field to type into");
	await act(async () => {
		field.focus();
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		setter?.call(field, text);
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await act(async () => {
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
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
			if (url.pathname.endsWith("/frames"))
				return Response.json({ root: "/project", pages: [], frames, collisions: [] });
			if (url.pathname.endsWith("/flows"))
				return Response.json({ frames: ["home"], links: [], edges: [], unreadable: [] });
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
						value: "flex gap-4",
					} as unknown as SourceRead;
					return Response.json({ ok: true, read: sourceRead });
				}
				if (body.action === "reach")
					return Response.json(sourceRead ? { ok: true, read: sourceRead } : { ok: false, reason: "no read" });
				if (body.action === "preview")
					return Response.json({
						ok: true,
						preview: { generation: body.generation, revision: body.revision ?? 1, value: "", frames: [] },
					});
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
