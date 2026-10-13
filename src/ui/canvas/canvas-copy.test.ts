// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import { ProjectCanvas } from "./canvas";
import { COPY_CASCADE_PX } from "./copy-placement";
import { openEventStream } from "./test-event-stream";

const ACCEL = accelKeyName() === "Meta" ? { metaKey: true } : { ctrlKey: true };

interface Asked {
	path: string;
	method: string;
	body: unknown;
}

/** ⌘C, ⌘V and ⌘D out on the canvas (DEV-294): the Pages rail's verbs, on the frames selected there. */
describe("canvas copy, paste and duplicate", () => {
	it("duplicates the selected frame beside its original", async () => {
		const { host, asked } = await mountCanvas({ "/frames/duplicate": [{ from: "home", to: "home-copy" }] });
		await select(host, "home");

		await act(async () => press("d"));
		await settle();

		expect(bodyOf(asked, "/frames/duplicate")).toEqual({ frames: ["home"] });
		expect(bodyOf(asked, "/geometry")).toEqual({
			frames: { "home-copy": { x: 40 + COPY_CASCADE_PX, y: 40 + COPY_CASCADE_PX, w: 100, h: 100 } },
		});
	});

	it("copies, and pastes onto the page in view", async () => {
		const { host, asked } = await mountCanvas({
			"/frames/duplicate": [{ from: "home", to: "shop/home", page: "shop" }],
		});
		await select(host, "home");
		await act(async () => press("c"));
		expect(host.querySelector("[data-pages-copied]")?.textContent).toBe("1 copied");

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="shop page"]')?.click();
		});
		blur();
		await act(async () => press("v"));
		await settle();

		expect(bodyOf(asked, "/frames/duplicate")).toEqual({ frames: ["home"], page: "shop" });
		// the source is on another page, so the copy lands in the middle of the view
		expect(bodyOf(asked, "/geometry")).toEqual({ frames: { "shop/home": { x: -50, y: -50, w: 100, h: 100 } } });
	});

	it("leaves ⌘C to text highlighted in the chrome, with a frame selected", async () => {
		const { host } = await mountCanvas({});
		await select(host, "home");
		const path = document.createElement("span");
		path.textContent = "frames/home/frame.tsx";
		host.append(path);
		const range = document.createRange();
		range.selectNodeContents(path);
		window.getSelection()?.removeAllRanges();
		window.getSelection()?.addRange(range);
		onTestFinished(() => window.getSelection()?.removeAllRanges());

		let event: KeyboardEvent | undefined;
		await act(async () => {
			event = press("c");
		});
		expect(event?.defaultPrevented).toBe(false);
		expect(host.querySelector("[data-pages-copied]")).toBeNull();
	});

	it("leaves the keys alone with nothing selected", async () => {
		const { asked } = await mountCanvas({});
		const event = press("d");
		await settle();
		expect(event.defaultPrevented).toBe(false);
		expect(asked.some((call) => call.path.endsWith("/frames/duplicate"))).toBe(false);
	});
});

function press(key: string): KeyboardEvent {
	const event = new KeyboardEvent("keydown", {
		key,
		code: `Key${key.toUpperCase()}`,
		bubbles: true,
		cancelable: true,
		...ACCEL,
	});
	document.body.dispatchEvent(event);
	return event;
}

function blur(): void {
	(document.activeElement as HTMLElement | null)?.blur();
}

async function select(host: HTMLElement, name: string): Promise<void> {
	await act(async () => {
		host.querySelector<HTMLButtonElement>(`button[aria-label="${name} frame"]`)?.click();
	});
	// the keys under test are the canvas's, not the rail's own
	blur();
}

function bodyOf(asked: readonly Asked[], path: string): unknown {
	return asked.find((call) => call.method !== "GET" && call.path.endsWith(path))?.body;
}

async function settle(): Promise<void> {
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
}

async function mountCanvas(
	copies: Partial<Record<"/frames/duplicate", unknown[]>>,
): Promise<{ host: HTMLElement; asked: Asked[] }> {
	const asked: Asked[] = [];
	const frames = [
		{ name: "home", x: 40, y: 40, w: 100, h: 100 },
		{ name: "about", x: 400, y: 40, w: 100, h: 100 },
	];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : undefined;
			const url = new URL(request?.url ?? String(input), window.location.href);
			const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
			const raw =
				init?.body ?? (request !== undefined && method !== "GET" ? await request.clone().text() : undefined);
			asked.push({ path: url.pathname, method, body: typeof raw === "string" ? JSON.parse(raw) : undefined });
			if (url.pathname.endsWith("/events")) return openEventStream();
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames/duplicate"))
				return Response.json({ frames: copies["/frames/duplicate"] ?? [] });
			if (url.pathname.endsWith("/frames")) return Response.json({ root: "/project", pages: ["shop"], frames });
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: frames.map((each) => each.name), links: [], edges: [], unreadable: [] });
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
	for (let attempt = 0; attempt < 20; attempt++) {
		if (host.querySelector('[data-frame-label="home"]') !== null) break;
		await settle();
	}
	return { host, asked };
}
