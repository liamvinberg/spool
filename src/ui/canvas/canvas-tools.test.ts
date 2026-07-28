// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import { ProjectCanvas } from "./canvas";

/**
 * The accel modifier as this environment binds it. Asserting against ⌘ would
 * only test the Mac: happy-dom reports a non-Apple platform, so these events
 * hold ctrl here and ⌘ in a real Mac browser, which is the point.
 */
const ACCEL_KEY = accelKeyName();
const ACCEL = ACCEL_KEY === "Meta" ? { metaKey: true } : { ctrlKey: true };

const frames = [{ name: "home", x: 0, y: 0, w: 320, h: 240, kind: "html" }];

it("previews a hovered frame without selecting it", async () => {
	const { host, canvas } = await renderCanvas();

	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40, pointerId: 1 }));
	});

	const hover = host.querySelector<HTMLElement>('[data-frame-hover="home"]');
	expect(hover?.style.opacity).toBe("1");
	expect(hover?.classList.contains("border-border-raised")).toBe(true);
	expect(host.querySelector('[data-frame-label="home"] .text-text')).not.toBeNull();
	expect(host.querySelector('[data-frame-label="home"] .text-thread')).toBeNull();

	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: 400, clientY: 300, pointerId: 1 }),
		);
	});

	expect(hover?.style.opacity).toBe("0");
	expect(hover?.style.transition).toBe("opacity 80ms ease-out");
	expect(host.querySelector('[data-frame-label="home"] .text-muted')).not.toBeNull();

	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40, pointerId: 1 }));
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
	});

	expect(host.querySelector('[data-frame-hover="home"]')).toBeNull();
	expect(host.querySelector('[data-frame-label="home"] .text-thread')).not.toBeNull();
});

it("opens in Select, takes a frame with one click, and enters it on a double-click", async () => {
	const { host, canvas } = await renderCanvas();

	expect(host.querySelector('button[aria-label="select"]')?.getAttribute("aria-pressed")).toBe("true");
	expect(host.querySelector('button[aria-label="interact"]')).toBeNull();

	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
		canvas?.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
	});
	// a bare click takes the frame and stops there
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).not.toContain("esc exits");

	await enterHome(canvas);
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).toContain("live · esc exits");
});

it("keeps serving the frame you are inside, so Play and agents do not lose you", async () => {
	const { host, canvas } = await renderCanvas();

	await enterHome(canvas);
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).toContain("esc exits");
	// entering clears the selection ring, but never what the canvas points at
	await until(() => selectionPuts().at(-1)?.frames?.[0] === "home");
	expect(selectionPuts().at(-1)).toEqual({ frames: ["home"] });
});

it("does not enter from a dragged press", async () => {
	const { host, canvas } = await renderCanvas();

	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
		canvas?.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, button: 0, clientX: 80, clientY: 60, pointerId: 1 }),
		);
		canvas?.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 80, clientY: 60, pointerId: 1 }),
		);
	});

	expect(host.querySelector('[data-frame-label="home"]')?.textContent).not.toContain("esc exits");

	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 2 }),
		);
		canvas?.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 80, clientY: 60, pointerId: 2 }),
		);
	});

	expect(host.querySelector('[data-frame-label="home"]')?.textContent).not.toContain("esc exits");
});

it("marquee-selects from an empty-canvas drag, now that Select is the resting tool", async () => {
	const { host, canvas } = await renderCanvas();

	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 400, clientY: 300, pointerId: 1 }),
		);
		canvas?.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, button: 0, clientX: 10, clientY: 10, pointerId: 1 }),
		);
		canvas?.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 10, clientY: 10, pointerId: 1 }),
		);
	});

	expect(host.querySelector('[data-frame-label="home"] .text-thread')).not.toBeNull();
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).not.toContain("esc exits");
});

it("hands the pointer back while Command is held without taking the frame off the screen", async () => {
	const { host, canvas } = await renderCanvas();

	await enterHome(canvas);
	await until(() => host.querySelector('iframe[title="home"]') !== null);
	const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
	await reportLoaded(iframe);
	const wrapper = () => host.querySelector<HTMLIFrameElement>('iframe[title="home"]')?.parentElement;

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: ACCEL_KEY, ...ACCEL, bubbles: true }));
	});
	// ⌘ takes the pointer back off the frame so an element can be reached
	await until(() => iframe?.style.pointerEvents === "none");
	expect(host.querySelector('iframe[title="home"]')).toBe(iframe);
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).toContain("esc exits");
	// and leaves it painted: Select owns the pointer, but the readable frame
	// keeps running rather than swapping to a stale still.
	expect(wrapper()?.style.visibility).toBe("visible");
	expect(wrapper()?.style.contentVisibility).toBe("");

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { key: ACCEL_KEY, bubbles: true }));
	});
	await until(() => iframe?.style.pointerEvents === "auto");
	expect(host.querySelector('iframe[title="home"]')).toBe(iframe);
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).toContain("esc exits");
});

it("treats Command as Select's element modifier, never as a tool of its own", async () => {
	const { host } = await renderCanvas();

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: ACCEL_KEY, ...ACCEL, bubbles: true }));
	});

	// holding ⌘ reaches an element, it does not change which tool is committed
	expect(host.querySelector('button[aria-label="select"]')?.getAttribute("aria-pressed")).toBe("true");
	expect(host.querySelector('button[aria-label="select"]')?.textContent).not.toContain("hold ⌘");
	expect(host.querySelector('button[aria-label="hand"]')?.textContent).toContain("hold space");

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { key: ACCEL_KEY, bubbles: true }));
	});

	expect(host.querySelector('button[aria-label="select"]')?.getAttribute("aria-pressed")).toBe("true");
});

it("keeps toolbar gestures out of the canvas beneath it", async () => {
	const { host, canvas } = await renderCanvas();
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
	});
	await until(() => host.querySelector('iframe[title="home"]') !== null);
	const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { spool: "key", frame: "home", key: "Escape" },
				source: iframe?.contentWindow ?? null,
			}),
		);
	});

	const postMessage = vi.spyOn(iframe?.contentWindow as Window, "postMessage");
	const select = host.querySelector<HTMLButtonElement>('button[aria-label="select"]');
	await act(async () => {
		select?.click();
	});
	postMessage.mockClear();

	await act(async () => {
		select?.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40, pointerId: 2, ...ACCEL }),
		);
		select?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 40, clientY: 40 }));
		select?.dispatchEvent(
			new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
		);
	});

	expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ spool: "pick" }), "*");
	expect(host.querySelector('[role="menu"]')).toBeNull();
});

it("clears borrowed Select previews across Command release and window blur", async () => {
	const { host, canvas } = await renderCanvas();
	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
		canvas?.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
	});
	await until(() => host.querySelector('iframe[title="home"]') !== null);
	const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { spool: "key", frame: "home", key: "Escape" },
				source: iframe?.contentWindow ?? null,
			}),
		);
	});
	const postMessage = vi.spyOn(iframe?.contentWindow as Window, "postMessage");

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: ACCEL_KEY, ...ACCEL, bubbles: true }));
	});
	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40, pointerId: 1, ...ACCEL }),
		);
	});
	const pick = postMessage.mock.calls
		.map(([message]) => message)
		.find(
			(message): message is { spool: "pick"; id: number } =>
				typeof message === "object" &&
				message !== null &&
				"spool" in message &&
				message.spool === "pick" &&
				"id" in message &&
				typeof message.id === "number",
		);
	expect(pick).toBeDefined();

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { key: ACCEL_KEY, bubbles: true }));
	});
	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: {
					spool: "picked",
					frame: "home",
					id: pick?.id,
					chain: [
						{
							selector: "button",
							tag: "button",
							outerHtml: "<button>Open</button>",
							rect: { x: 10, y: 10, w: 80, h: 30 },
							radius: 4,
							source: null,
							generated: true,
						},
					],
				},
				source: iframe?.contentWindow ?? null,
			}),
		);
	});

	expect(host.querySelector(".opacity-50")).toBeNull();

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: ACCEL_KEY, ...ACCEL, bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 90));
	});
	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: 50, clientY: 50, pointerId: 2, ...ACCEL }),
		);
	});
	const secondPick = postMessage.mock.calls
		.map(([message]) => message)
		.filter(
			(message): message is { spool: "pick"; id: number } =>
				typeof message === "object" &&
				message !== null &&
				"spool" in message &&
				message.spool === "pick" &&
				"id" in message &&
				typeof message.id === "number",
		)
		.at(-1);
	expect(secondPick?.id).not.toBe(pick?.id);
	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: {
					spool: "picked",
					frame: "home",
					id: secondPick?.id,
					chain: [
						{
							selector: "button",
							tag: "button",
							outerHtml: "<button>Open</button>",
							rect: { x: 10, y: 10, w: 80, h: 30 },
							radius: 4,
							source: null,
							generated: true,
						},
					],
				},
				source: iframe?.contentWindow ?? null,
			}),
		);
	});
	expect(host.querySelector(".opacity-50")).not.toBeNull();

	await act(async () => {
		window.dispatchEvent(new Event("blur"));
	});
	expect(host.querySelector(".opacity-50")).toBeNull();

	// a plain click no longer reaches into the frame: elements are ⌘'s alone
	postMessage.mockClear();
	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 3 }),
		);
		canvas?.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 3 }),
		);
	});
	expect(
		postMessage.mock.calls.some(
			([message]) =>
				typeof message === "object" && message !== null && "spool" in message && message.spool === "pick",
		),
	).toBe(false);
	expect(host.querySelector(".opacity-50")).toBeNull();
});

it("commits Hand with H and pans from a primary drag without entering the frame", async () => {
	const { host, canvas } = await renderCanvas();
	const field = canvas?.querySelector<HTMLElement>(".absolute.top-0.left-0");
	expect(field?.style.transform).toContain("translate(0px, 0px)");

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true }));
	});
	expect(host.querySelector('button[aria-label="hand"]')?.getAttribute("aria-pressed")).toBe("true");

	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
		canvas?.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, button: 0, clientX: 80, clientY: 60, pointerId: 1 }),
		);
		canvas?.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 80, clientY: 60, pointerId: 1 }),
		);
	});

	expect(field?.style.transform).toContain("translate(40px, 20px)");
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).not.toContain("esc exits");
});

it("borrows Hand with Space, keeps it under Command, and clears it on blur", async () => {
	const { host } = await renderCanvas();

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
	});
	expect(host.querySelector('button[aria-label="hand"]')?.getAttribute("aria-pressed")).toBe("true");
	expect(host.querySelector('button[aria-label="select"]')?.getAttribute("aria-pressed")).toBe("false");
	const repeatedSpace = new KeyboardEvent("keydown", {
		key: " ",
		code: "Space",
		bubbles: true,
		cancelable: true,
		repeat: true,
	});
	await act(async () => {
		window.dispatchEvent(repeatedSpace);
	});
	expect(repeatedSpace.defaultPrevented).toBe(true);

	// ⌘ is a modifier now, so it no longer outranks the borrowed Hand
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: ACCEL_KEY, ...ACCEL, bubbles: true }));
	});
	expect(host.querySelector('button[aria-label="hand"]')?.getAttribute("aria-pressed")).toBe("true");

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { key: ACCEL_KEY, bubbles: true }));
	});
	expect(host.querySelector('button[aria-label="hand"]')?.getAttribute("aria-pressed")).toBe("true");

	await act(async () => {
		window.dispatchEvent(new Event("blur"));
	});
	expect(host.querySelector('button[aria-label="select"]')?.getAttribute("aria-pressed")).toBe("true");
	expect(host.querySelector('button[aria-label="hand"]')?.getAttribute("aria-pressed")).toBe("false");
});

it("takes the pointer back on a focused frame's relayed Command key and returns it on release", async () => {
	const { host, canvas } = await renderCanvas();
	await enterHome(canvas);
	await until(() => host.querySelector('iframe[title="home"]') !== null);
	const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
	await reportLoaded(iframe);

	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { spool: "modifier", frame: "home", modifier: ACCEL_KEY, held: true },
				source: iframe?.contentWindow ?? null,
			}),
		);
	});
	await until(() => iframe?.style.pointerEvents === "none");
	expect(host.querySelector('button[aria-label="select"]')?.getAttribute("aria-pressed")).toBe("true");
	expect(host.querySelector('iframe[title="home"]')).toBe(iframe);

	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { spool: "modifier", frame: "home", modifier: ACCEL_KEY, held: false },
				source: iframe?.contentWindow ?? null,
			}),
		);
	});
	await until(() => iframe?.style.pointerEvents === "auto");
	expect(host.querySelector('iframe[title="home"]')).toBe(iframe);
});

it("asks the frame for the element under a ⌘-click, and for nothing under a bare one", async () => {
	const { host, canvas } = await renderCanvas();
	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
		canvas?.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
	});
	await until(() => host.querySelector('iframe[title="home"]') !== null);
	const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
	const postMessage = vi.spyOn(iframe?.contentWindow as Window, "postMessage");
	const asked = () =>
		postMessage.mock.calls.some(
			([message]) =>
				typeof message === "object" && message !== null && "spool" in message && message.spool === "pick",
		);

	postMessage.mockClear();
	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 2 }),
		);
	});
	expect(asked()).toBe(false);

	postMessage.mockClear();
	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				button: 0,
				clientX: 40,
				clientY: 40,
				pointerId: 3,
				...ACCEL,
			}),
		);
	});
	expect(asked()).toBe(true);
});

/** Every selection the canvas has served, oldest first. */
function selectionPuts(): { frames?: string[] }[] {
	const calls = (globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls;
	return calls
		.filter(([input, init]) => String(input).endsWith("/selection") && init?.method === "PUT")
		.map(([, init]) => JSON.parse(String(init?.body)) as { frames?: string[] });
}

/** The way inside: a double-click on the frame, presses and all. */
async function enterHome(canvas: HTMLElement, x = 40, y = 40): Promise<void> {
	await act(async () => {
		for (const pointerId of [91, 92]) {
			canvas.dispatchEvent(
				new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId }),
			);
			canvas.dispatchEvent(
				new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId }),
			);
		}
		canvas.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: x, clientY: y }));
	});
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
		vi.fn(async (input: RequestInfo | URL) => {
			const raw = input instanceof Request ? input.url : String(input);
			const url = new URL(raw, window.location.href);
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

/** The frame's own boot report — happy-dom loads no document, so the test is the frame. */
async function reportLoaded(iframe: HTMLIFrameElement | null): Promise<void> {
	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { spool: "loaded", frame: iframe?.title },
				source: iframe?.contentWindow ?? null,
			}),
		);
	});
}

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
