// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";
import type { PickedHit } from "./protocol";

/**
 * The properties rail out on the canvas (#256): the right column, holding one
 * thing.
 *
 * What is proved here is the shell — which rail the column stands in, what the
 * crumbs say and where a press on one lands, what a scope chip does, and what
 * each empty state reads. The rows between them are #257's and #258's, and the
 * scope vocabulary itself is `properties-scope.test.ts`'s.
 */

const frames = [
	{ name: "home", x: 0, y: 0, w: 640, h: 480, kind: "html" },
	{ name: "receipt", x: 900, y: 0, w: 390, h: 640, kind: "html" },
];

/** An ancestry the shim would answer with, root element first, every rung stamped. */
const ancestry = (...selectors: readonly string[]): PickedHit[] =>
	selectors.map((selector, depth) => ({
		selector,
		tag: depth === 0 ? "div" : "span",
		outerHtml: `<div class="${selector}" />`,
		rect: { x: depth * 4, y: depth * 4, w: 100 - depth * 8, h: 80 - depth * 8 },
		radius: 0,
		source: `frames/home/frame.tsx:${10 + depth}:3`,
		generated: false,
	}));

/** screen › footer › pay, the ancestry under the pointer in every test here. */
const CHAIN = ancestry("screen", "footer", "pay");

/** the same rung with a className no hand may write, which is what a refusal reads off */
const asExpression = (rung: (typeof RUNGS)[number]) => ({
	...rung,
	refusal: { code: "computed-class", says: "className is an expression", expression: "{busy ? a : b}" },
});

/** what the daemon says the file holds for that ancestry */
const RUNGS = [
	{
		source: "frames/home/frame.tsx:10:3",
		name: "main",
		className: "flex flex-col",
		path: "design/frames/home/frame.tsx",
		line: 10,
	},
	{
		source: "frames/home/frame.tsx:11:3",
		name: "footer",
		className: "flex gap-2",
		path: "design/frames/home/frame.tsx",
		line: 11,
	},
	{
		source: "frames/home/frame.tsx:12:3",
		name: "PayButton",
		className: "rounded-md px-3 hover:bg-thread hover:text-on-thread",
		path: "design/frames/home/frame.tsx",
		line: 12,
	},
];

it("says select an element with nothing held, and how many with several", async () => {
	const { host, canvas } = await readyCanvas();

	expect(rail(host)?.textContent).toContain("select an element");

	await clickAt(canvas, 40, 40);
	expect(rail(host)?.textContent).not.toContain("select an element");

	// a marquee over both frames: one rail cannot stand for two rectangles
	await marqueeOver(canvas);
	expect(rail(host)?.textContent).toContain("2 frames");
});

it("shows a frame's own x, y, w and h in raw pixels, and writes one back", async () => {
	const { host, canvas } = await readyCanvas();
	await clickAt(canvas, 40, 40);

	expect(fieldFor(host, "x")?.value).toBe("0");
	expect(fieldFor(host, "w")?.value).toBe("640");
	expect(rail(host)?.textContent).toContain("frame.json");

	await typeInto(fieldFor(host, "w"), "700");
	expect(await geometryPut()).toEqual({ home: { x: 0, y: 0, w: 700, h: 480 } });
	expect(fieldFor(host, "w")?.value).toBe("700");

	// one field is one press of undo, on the stack a drag joins
	await press("z", { metaKey: true, ctrlKey: true });
	expect(await geometryPut()).toEqual({ home: { x: 0, y: 0, w: 640, h: 480 } });
});

it("crumbs the frame and every rung above the one held, by the names the file gave them", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);

	await until(() => crumbs(host).length === 4);
	expect(crumbs(host)).toEqual(["home", "main", "footer", "PayButton"]);
	// the tag beside them is the live one, so a component says what it renders as
	expect(rail(host)?.textContent).toContain("span");
});

it("climbs when a crumb is pressed, and takes the frame from the one at the root", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => crumbs(host).length === 4);

	await pressCrumb(host, "footer");
	expect(await heldElements()).toEqual(["footer"]);
	expect(crumbs(host)).toEqual(["home", "main", "footer"]);

	await pressCrumb(host, "home");
	expect(await heldFrames()).toEqual(["home"]);
	expect(fieldFor(host, "x")).not.toBeNull();
});

it("carries the base and every scope the literal has, and edits under the one pressed", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => chips(host).length === 2);

	expect(chips(host)).toEqual(["base", "hover:"]);
	// the base is every token's scope: at the base nothing is out of view, so
	// the whole literal reads at one strength
	expect(rail(host)?.textContent).toContain("hover:bg-thread");
	expect(dimmedTokens(host)).toEqual([]);

	// under a variant the rest of the literal dims, which is what makes the bar
	// a lens over one literal rather than a filter that hides the others
	await pressChip(host, "hover:");
	expect(dimmedTokens(host)).toEqual(["rounded-md", "px-3"]);
});

it("offers this project's own breakpoints to open a scope on, not Tailwind's", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => chips(host).length === 2);

	await press("+", {}, host.querySelector<HTMLElement>('[aria-label="Open a scope"]'));
	const offered = [...(rail(host)?.querySelectorAll("button") ?? [])].map((button) => button.textContent ?? "");

	// the compiled theme renamed the breakpoints, so `md:` is a scope this
	// project does not have and `app:` is the one it does
	expect(offered.some((says) => says.startsWith("app:"))).toBe(true);
	expect(offered.some((says) => says.startsWith("md:"))).toBe(false);
	expect(offered.some((says) => says.startsWith("focus:"))).toBe(true);
});

it("greys the scope bar on a literal no hand may write, rather than hiding it", async () => {
	const { host, canvas, frame } = await readyCanvas({ refused: true });
	await descendTo(canvas, frame, 3);
	await until(() => chips(host).length === 2);

	// a missing control reads as a bug; a greyed one teaches you the shape of
	// your own code, so both the chips and the `+` stay and lose their box
	expect(rail(host)?.textContent).toContain("className is an expression");
	expect(host.querySelector<HTMLButtonElement>('[aria-label="Open a scope"]')?.disabled).toBe(true);
	expect(host.querySelector('[aria-label="remove hover:"]')).toBeNull();
});

it("drops every token under a scope in one write, and falls back to the base", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => chips(host).length === 2);
	await pressChip(host, "hover:");

	await press("×", {}, host.querySelector<HTMLElement>('[aria-label="remove hover:"]'));
	const gated = await gatedOps();
	expect(gated).toEqual([
		{ kind: "set-class", source: "frames/home/frame.tsx:12:3", token: "bg-thread", scope: "hover:", remove: true },
		{
			kind: "set-class",
			source: "frames/home/frame.tsx:12:3",
			token: "text-on-thread",
			scope: "hover:",
			remove: true,
		},
	]);
	expect(chips(host).filter((chip) => chip === "hover:")).toHaveLength(1);
});

it("is the whole column while the agent experiment is off", async () => {
	const { host } = await readyCanvas();

	expect(rail(host)?.style.width).toBe("300px");
	// off is absent rather than hidden: there is no strip to press and nothing
	// in the document for a key to find
	expect(host.querySelector('[aria-label="Expand agent"]')).toBeNull();
	expect(host.querySelector('[aria-label="Agent"]')).toBeNull();
});

it("hands the column over to the agent's strip, and takes it back from its own", async () => {
	const { host } = await readyCanvas({ agentPanel: true });

	// the agent's own 44px strip is the switch, and never a tab row
	expect(rail(host)?.style.width).toBe("300px");
	expect(host.querySelector<HTMLElement>('[aria-label="Agent"]')?.style.width).toBe("44px");

	await press("click", {}, host.querySelector<HTMLElement>('[aria-label="Expand agent"]'));
	// one column, one rail: properties leave for a strip of their own
	expect(rail(host)?.style.width).toBe("44px");
	expect(host.querySelector<HTMLElement>('[aria-label="Agent"]')?.style.width).toBe("420px");

	await press("click", {}, host.querySelector<HTMLElement>('[aria-label="Expand properties"]'));
	expect(rail(host)?.style.width).toBe("300px");
	expect(host.querySelector<HTMLElement>('[aria-label="Agent"]')?.style.width).toBe("44px");
});

it("writes a row's change to the lane as one op under the live scope", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => chips(host).length === 2);
	await pressChip(host, "hover:");

	await typeInto(fieldFor(host, "opacity"), "60");
	expect(await gatedOps()).toEqual([
		{ kind: "set-class", source: "frames/home/frame.tsx:12:3", token: "opacity-60", scope: "hover:" },
	]);
});

it("keeps the rung it is editing when its own write reloads the frame", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => crumbs(host).length === 4);

	await typeInto(fieldFor(host, "opacity"), "60");
	await changed("home");
	await frame.loaded();

	// the reload would have dropped the pick, which would empty the surface the
	// edit was made from between one keystroke and the next (#258)
	expect(crumbs(host)).toEqual(["home", "main", "footer", "PayButton"]);
	// and the fresh document is asked for the same element, so the geometry the
	// overlay draws is the one the new render produced
	expect(frame.asked()).toMatchObject({ spool: "kin", selector: "pay", step: "self" });
	await frame.answer(CHAIN);
	expect(await heldElements()).toEqual(["pay"]);
});

it("gates the `+` on the compiler, and lands what it accepts under the live scope", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => chips(host).length === 2);

	await press("click", {}, host.querySelector<HTMLElement>('[aria-label="Add a class"]'));
	await typeField(host.querySelector<HTMLInputElement>('input[placeholder="any class"]'), "foo-bar");
	// what the compiler refuses stays grey with its own reason, never hidden
	expect(candidate(host, "foo-bar")?.textContent).toContain("no utility foo-bar");
	expect(candidate(host, "foo-bar")?.disabled).toBe(true);

	await typeField(host.querySelector<HTMLInputElement>('input[placeholder="any class"]'), "md:hidden");
	await press("click", {}, candidate(host, "md:hidden"));
	expect(await gatedOps()).toEqual([
		{ kind: "set-class", source: "frames/home/frame.tsx:12:3", token: "hidden", scope: "md:" },
	]);
});

it("removes a token from the source line, which is the only way back out for a `+`", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => crumbs(host).length === 4);

	await press("click", {}, sourceToken(host, "hover:bg-thread"));
	expect(await gatedOps()).toEqual([
		{ kind: "set-class", source: "frames/home/frame.tsx:12:3", token: "bg-thread", scope: "hover:", remove: true },
	]);
});

// --- the harness -------------------------------------------------------------

const rail = (host: HTMLElement) => host.querySelector<HTMLElement>('[aria-label="Properties"]');

/** the crumbs, in order, as they read */
function crumbs(host: HTMLElement): string[] {
	const line = rail(host)?.querySelector("[data-properties-crumbs]");
	return [...(line?.querySelectorAll("button") ?? [])].map((button) => button.textContent ?? "");
}

/** the scope chips, in order */
function chips(host: HTMLElement): string[] {
	return [...(rail(host)?.querySelectorAll("[data-scope-chip]") ?? [])].map((chip) => chip.textContent ?? "");
}

/** the tokens on the source line drawn as out of the live scope */
function dimmedTokens(host: HTMLElement): string[] {
	const line = rail(host)?.querySelector("[data-properties-source]");
	return [...(line?.querySelectorAll(".text-muted\\/40") ?? [])].map((token) => (token.textContent ?? "").trim());
}

function fieldFor(host: HTMLElement, name: string): HTMLInputElement | null {
	return rail(host)?.querySelector<HTMLInputElement>(`[data-properties-row="${name}"] input`) ?? null;
}

async function pressCrumb(host: HTMLElement, name: string): Promise<void> {
	const line = rail(host)?.querySelector("[data-properties-crumbs]");
	const found = [...(line?.querySelectorAll("button") ?? [])].find((button) => button.textContent === name);
	await press("click", {}, found ?? null);
}

async function pressChip(host: HTMLElement, name: string): Promise<void> {
	const found = [...(rail(host)?.querySelectorAll("[data-scope-chip]") ?? [])].find(
		(chip) => chip.textContent === name,
	);
	await press("click", {}, (found as HTMLElement | undefined) ?? null);
}

/** one candidate in the `+` field's list */
function candidate(host: HTMLElement, token: string): HTMLButtonElement | null {
	return host.querySelector<HTMLButtonElement>(`[data-class-candidate="${token}"]`);
}

/** one token on the source line, which is a press that takes it off */
function sourceToken(host: HTMLElement, token: string): HTMLElement | null {
	const line = rail(host)?.querySelector("[data-properties-source]");
	return [...(line?.querySelectorAll<HTMLElement>("button") ?? [])].find((held) => held.textContent === token) ?? null;
}

/** typing without committing, which is what a find line and the `+` take */
async function typeField(field: HTMLInputElement | null, text: string): Promise<void> {
	if (field === null) throw new Error("no field");
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	await act(async () => {
		setter?.call(field, text);
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
}

async function typeInto(field: HTMLInputElement | null, text: string): Promise<void> {
	if (field === null) throw new Error("no field");
	// React tracks the value it last wrote, so a bare assignment reads as no
	// change at all: the native setter is what a real keystroke goes through
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	await act(async () => {
		setter?.call(field, text);
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await act(async () => {
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	});
}

async function press(
	key: string,
	modifiers: Record<string, boolean> = {},
	target: HTMLElement | null = null,
): Promise<void> {
	await act(async () => {
		if (target !== null) target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		else window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }));
	});
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
}

/** the geometry the canvas last wrote, which is `frame.json` and never source */
async function geometryPut(): Promise<Record<string, unknown> | undefined> {
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
	const calls = (globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls;
	const last = calls.filter(([input, init]) => String(input).endsWith("/geometry") && init?.method === "PUT").at(-1);
	return last === undefined
		? undefined
		: (JSON.parse(String(last[1]?.body)) as { frames: Record<string, unknown> }).frames;
}

/** the ops the last gate was asked about */
async function gatedOps(): Promise<unknown> {
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
	const calls = (globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls;
	const last = calls.filter(([input]) => String(input).endsWith("/patch/gate")).at(-1);
	return last === undefined ? undefined : (JSON.parse(String(last[1]?.body)) as { ops: unknown }).ops;
}

interface FramePlayer {
	answer: (chain: readonly PickedHit[]) => Promise<void>;
	/** what the canvas last asked this frame for */
	asked: () => Record<string, unknown> | undefined;
	/** the fresh document reporting for duty after a reload */
	loaded: () => Promise<void>;
}

/** Down `depth` rungs of the ancestry, which is `depth` double-clicks. */
async function descendTo(canvas: HTMLElement, frame: FramePlayer, depth: number): Promise<void> {
	await clickAt(canvas, 40, 40);
	for (let rung = 0; rung < depth; rung++) {
		await doubleClickAt(canvas, 40, 40);
		await frame.answer(CHAIN);
	}
}

async function readyCanvas({
	agentPanel = false,
	refused = false,
}: {
	agentPanel?: boolean;
	refused?: boolean;
} = {}): Promise<{
	host: HTMLDivElement;
	canvas: HTMLElement;
	frame: FramePlayer;
}> {
	stubCanvasApis(refused);
	Object.assign(window, { __SPOOL_EXPERIMENTS__: agentPanel ? ["agent-panel"] : [] });
	window.localStorage?.clear();
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

	const asks = (): Record<string, unknown>[] => {
		live();
		return [...spies.values()]
			.flatMap((spy) => spy.mock.calls.map((call) => call[0]))
			.filter((message): message is Record<string, unknown> => typeof message === "object" && message !== null)
			.filter((message) => message.spool === "pick" || message.spool === "kin")
			.sort((a, b) => Number(a.id) - Number(b.id));
	};

	// nothing is held after the boot click; the rail starts on its empty state
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
	});

	return {
		host,
		canvas,
		frame: {
			asked: () => asks().at(-1),
			loaded: async () => {
				await act(async () => {
					window.dispatchEvent(
						new MessageEvent("message", { data: { spool: "loaded", frame: "home" }, source: live() }),
					);
				});
				await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
			},
			answer: async (chain) => {
				const ask = asks().at(-1);
				expect(ask).toBeDefined();
				await act(async () => {
					window.dispatchEvent(
						new MessageEvent("message", {
							data: { spool: "picked", frame: "home", id: ask?.id, chain },
							source: live(),
						}),
					);
				});
				await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
			},
		},
	};
}

/** The daemon saying a frame's source changed, which is what reloads its document. */
async function changed(frame: string): Promise<void> {
	const line = `event: change\ndata: ${JSON.stringify({ kind: "frame", frame })}\n\n`;
	await act(async () => {
		events?.enqueue(new TextEncoder().encode(line));
	});
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
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

async function doubleClickAt(canvas: HTMLElement, x: number, y: number): Promise<void> {
	await clickAt(canvas, x, y, 91);
	await clickAt(canvas, x, y, 92);
	await act(async () => {
		canvas.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: x, clientY: y }));
	});
}

/** a drag across empty canvas that takes both frames in */
async function marqueeOver(canvas: HTMLElement): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 1500, clientY: 900, pointerId: 7 }),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: -40, clientY: -40, pointerId: 7 }),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: -40, clientY: -40, pointerId: 7 }),
		);
	});
}

/** Every selection the canvas has served, oldest first. */
async function served(): Promise<{ frames?: string[]; elements?: { selector: string }[] }> {
	await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
	const calls = (globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls;
	return (
		calls
			.filter(([input, init]) => String(input).endsWith("/selection") && init?.method === "PUT")
			.map(([, init]) => JSON.parse(String(init?.body)))
			.at(-1) ?? {}
	);
}

async function heldElements(): Promise<string[] | undefined> {
	return (await served()).elements?.map((element) => element.selector);
}

async function heldFrames(): Promise<string[] | undefined> {
	return (await served()).frames;
}

/** kaffe's compiled theme: one breakpoint of its own, and none of Tailwind's. */
const THEME = {
	colour: [{ name: "thread", value: "#F5391A", from: "project" }],
	text: [],
	weight: [],
	font: [],
	leading: [],
	tracking: [],
	radius: [],
	shadow: [],
	ease: [],
	screen: [{ name: "app", value: "1280px", from: "project" }],
	step: 4,
};

/** the daemon's event stream, held open so a test can push a change down it */
let events: ReadableStreamDefaultController<Uint8Array> | null = null;

/** the compiler's verdicts on whatever the `+` puts to it here */
const COMPILED = [
	{ ok: true, token: "md:hidden", css: "@media (width >= 48rem) { display: none }" },
	{ ok: false, token: "foo-bar", reason: "no utility foo-bar" },
];

function stubCanvasApis(refused = false): void {
	events = null;
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
				return new Response(
					new ReadableStream({
						start(controller) {
							events = controller;
						},
					}),
					{ headers: { "content-type": "text/event-stream" } },
				);
			}
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) {
				return Response.json({ root: "/project", pages: [], frames, collisions: [] });
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: ["home"], links: [], edges: [], unreadable: [] });
			}
			if (url.pathname.endsWith("/theme")) {
				return Response.json({ theme: THEME });
			}
			// the compiler as the gate on the `+` (#258's P5): the daemon's own
			// answer, so what the field offers is what this project compiles
			if (url.pathname.endsWith("/theme/classes")) {
				return Response.json({ compiled: COMPILED });
			}
			if (url.pathname.endsWith("/rungs")) {
				return Response.json({ rungs: refused ? RUNGS.map(asExpression) : RUNGS });
			}
			if (url.pathname.endsWith("/patch/gate")) {
				return Response.json({ ok: true, path: "design/frames/home/frame.tsx", fingerprint: "f", mapped: false });
			}
			if (url.pathname.endsWith("/patch")) {
				return Response.json({
					ok: true,
					path: "design/frames/home/frame.tsx",
					fingerprint: "g",
					mapped: false,
					undo: { path: "design/frames/home/frame.tsx", start: 0, end: 0, text: "", fingerprint: "g" },
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
