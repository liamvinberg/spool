// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";

const frames = [{ name: "home", x: 0, y: 0, w: 320, h: 240, kind: "html", hasThumb: false }];

it("opens in Interact and enters a frame with one clean click", async () => {
	const { host, canvas } = await renderCanvas();

	const interact = host.querySelector<HTMLButtonElement>('button[aria-label="interact"]');
	expect(interact?.getAttribute("aria-pressed")).toBe("true");

	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
		canvas?.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
	});

	expect(host.querySelector('[data-frame-label="home"]')?.textContent).toContain("live · esc exits");
});

it("does not enter from a dragged Interact press", async () => {
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

it("does not marquee-select from an empty-canvas drag in Interact", async () => {
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

	expect(host.querySelector('[data-frame-label="home"] .text-thread')).toBeNull();
});

it("freezes an entered frame in place while Select is active and thaws it back into play", async () => {
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
	expect(iframe?.contentWindow).not.toBeNull();
	const postMessage = vi.spyOn(iframe?.contentWindow as Window, "postMessage");
	postMessage.mockClear();

	await act(async () => {
		host.querySelector<HTMLButtonElement>('button[aria-label="select"]')?.click();
	});
	await until(() =>
		postMessage.mock.calls.some(
			([message]) =>
				typeof message === "object" &&
				message !== null &&
				"spool" in message &&
				message.spool === "freeze" &&
				"on" in message &&
				message.on === true,
		),
	);
	expect(host.querySelector('iframe[title="home"]')).toBe(iframe);
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).toContain("esc exits");
	expect(iframe?.style.pointerEvents).toBe("none");

	postMessage.mockClear();
	await act(async () => {
		host.querySelector<HTMLButtonElement>('button[aria-label="interact"]')?.click();
	});
	await until(() =>
		postMessage.mock.calls.some(
			([message]) =>
				typeof message === "object" &&
				message !== null &&
				"spool" in message &&
				message.spool === "freeze" &&
				"on" in message &&
				message.on === false,
		),
	);
	expect(host.querySelector('iframe[title="home"]')).toBe(iframe);
	expect(host.querySelector('[data-frame-label="home"]')?.textContent).toContain("esc exits");
});

it("borrows Select while Command is held without changing the committed Interact tool", async () => {
	const { host } = await renderCanvas();

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta", metaKey: true, bubbles: true }));
	});

	expect(host.querySelector("[data-borrow-caption]")?.getAttribute("data-visible")).toBe("true");
	expect(host.querySelector("[data-borrow-caption]")?.textContent).toContain("borrowing select while held");
	expect(host.querySelector('button[aria-label="interact"]')?.getAttribute("aria-pressed")).toBe("true");
	expect(host.querySelector('button[aria-label="select"]')?.getAttribute("data-borrowed")).toBe("true");

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { key: "Meta", bubbles: true }));
	});

	expect(host.querySelector("[data-borrow-caption]")?.getAttribute("data-visible")).toBe("false");
	expect(host.querySelector('button[aria-label="interact"]')?.getAttribute("aria-pressed")).toBe("true");
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
	await act(async () => {
		window.dispatchEvent(new MessageEvent("message", { data: { spool: "key", frame: "home", key: "Escape" } }));
	});

	const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
	const postMessage = vi.spyOn(iframe?.contentWindow as Window, "postMessage");
	const select = host.querySelector<HTMLButtonElement>('button[aria-label="select"]');
	await act(async () => {
		select?.click();
	});
	postMessage.mockClear();

	await act(async () => {
		select?.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40, pointerId: 2, metaKey: true }),
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
	await act(async () => {
		window.dispatchEvent(new MessageEvent("message", { data: { spool: "key", frame: "home", key: "Escape" } }));
	});
	const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
	const postMessage = vi.spyOn(iframe?.contentWindow as Window, "postMessage");

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta", metaKey: true, bubbles: true }));
	});
	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40, pointerId: 1, metaKey: true }),
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
		window.dispatchEvent(new KeyboardEvent("keyup", { key: "Meta", bubbles: true }));
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
			}),
		);
	});

	expect(host.querySelector(".opacity-50")).toBeNull();

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta", metaKey: true, bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 90));
	});
	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: 50, clientY: 50, pointerId: 2, metaKey: true }),
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
			}),
		);
	});
	expect(host.querySelector(".opacity-50")).not.toBeNull();

	await act(async () => {
		window.dispatchEvent(new Event("blur"));
	});
	expect(host.querySelector(".opacity-50")).toBeNull();

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true }));
	});
	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 3 }),
		);
		canvas?.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 3 }),
		);
	});
	const selectionPick = postMessage.mock.calls
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
	expect(selectionPick?.id).not.toBe(secondPick?.id);
	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: {
					spool: "picked",
					frame: "home",
					id: selectionPick?.id,
					chain: [
						{
							selector: "main",
							tag: "main",
							outerHtml: "<main><button>Open</button></main>",
							rect: { x: 0, y: 0, w: 200, h: 120 },
							radius: 0,
							source: null,
							generated: true,
						},
					],
				},
			}),
		);
	});
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 90));
	});
	await act(async () => {
		canvas?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 60, clientY: 60, pointerId: 4 }));
	});
	const thirdPick = postMessage.mock.calls
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
	expect(thirdPick?.id).not.toBe(secondPick?.id);
	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: {
					spool: "picked",
					frame: "home",
					id: thirdPick?.id,
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
			}),
		);
	});
	expect(host.querySelector(".opacity-50")).not.toBeNull();

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true }));
	});
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

it("borrows Hand with Space, gives Command precedence, and clears both on blur", async () => {
	const { host } = await renderCanvas();

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
	});
	expect(host.querySelector('button[aria-label="hand"]')?.getAttribute("data-borrowed")).toBe("true");
	expect(host.querySelector('button[aria-label="interact"]')?.getAttribute("aria-pressed")).toBe("true");
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

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta", metaKey: true, bubbles: true }));
	});
	expect(host.querySelector('button[aria-label="select"]')?.getAttribute("data-borrowed")).toBe("true");
	expect(host.querySelector('button[aria-label="hand"]')?.hasAttribute("data-borrowed")).toBe(false);

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { key: "Meta", bubbles: true }));
	});
	expect(host.querySelector('button[aria-label="hand"]')?.getAttribute("data-borrowed")).toBe("true");

	await act(async () => {
		window.dispatchEvent(new Event("blur"));
	});
	expect(host.querySelector("button[data-borrowed]")).toBeNull();
	expect(host.querySelector('button[aria-label="interact"]')?.getAttribute("aria-pressed")).toBe("true");
});

it("borrows Select from a focused frame's Command key and thaws that same document on release", async () => {
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
	postMessage.mockClear();

	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { spool: "modifier", frame: "home", modifier: "Meta", held: true },
			}),
		);
	});
	await until(() =>
		postMessage.mock.calls.some(
			([message]) =>
				typeof message === "object" &&
				message !== null &&
				"spool" in message &&
				message.spool === "freeze" &&
				"on" in message &&
				message.on === true,
		),
	);
	expect(host.querySelector("[data-borrow-caption]")?.getAttribute("data-visible")).toBe("true");
	expect(host.querySelector('iframe[title="home"]')).toBe(iframe);

	postMessage.mockClear();
	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { spool: "modifier", frame: "home", modifier: "Meta", held: false },
			}),
		);
	});
	await until(() =>
		postMessage.mock.calls.some(
			([message]) =>
				typeof message === "object" &&
				message !== null &&
				"spool" in message &&
				message.spool === "freeze" &&
				"on" in message &&
				message.on === false,
		),
	);
	expect(host.querySelector('iframe[title="home"]')).toBe(iframe);
	expect(host.querySelector('button[aria-label="interact"]')?.getAttribute("aria-pressed")).toBe("true");
});

it("commits Select with V and asks the frame for the clicked element", async () => {
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
		window.dispatchEvent(new MessageEvent("message", { data: { spool: "key", frame: "home", key: "Escape" } }));
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true }));
	});
	expect(host.querySelector('button[aria-label="select"]')?.getAttribute("aria-pressed")).toBe("true");

	const postMessage = vi.spyOn(iframe?.contentWindow as Window, "postMessage");
	postMessage.mockClear();
	await act(async () => {
		canvas?.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 2 }),
		);
	});

	expect(
		postMessage.mock.calls.some(
			([message]) =>
				typeof message === "object" && message !== null && "spool" in message && message.spool === "pick",
		),
	).toBe(true);
});

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

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
