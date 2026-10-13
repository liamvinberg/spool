// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { ProjectCard } from "./api";
import { App } from "./app";
import type { DesktopCommand, DesktopWindow } from "./desktop-window";

const card = (name: string): ProjectCard => ({
	root: `/w/${name}`,
	name,
	openedAt: "2026-09-01T00:00:00.000Z",
	frameCount: 0,
	covers: [],
});

/** The app on a daemon with three tabs open, as the Mac app's window, recording what it is told of the session. */
async function launch() {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	window.history.replaceState(null, "", "/");
	const projects = [card("alpha"), card("beta"), card("gamma")];
	const writes: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request =
				input instanceof Request ? input : new Request(new URL(String(input), window.location.href), init);
			const { pathname } = new URL(request.url);
			if (pathname.endsWith("/events")) {
				return new Response(new ReadableStream<Uint8Array>({ start: () => {} }), {
					headers: { "content-type": "text/event-stream" },
				});
			}
			if (pathname === "/api/session" && request.method === "PUT") {
				const { root, open } = (await request.json()) as { root: string; open: boolean };
				writes.push(`${open ? "open" : "close"} ${root}`);
				return new Response(null, { status: 204 });
			}
			if (pathname === "/api/session/order") {
				const { order } = (await request.json()) as { order: string[] };
				writes.push(`order ${order.join(" ")}`);
				return new Response(null, { status: 204 });
			}
			if (pathname === "/api/session/active") return Response.json({ openedAt: "2026-10-01T00:00:00.000Z" });
			if (pathname === "/api/session") return Response.json({ open: projects.map((p) => p.root) });
			if (pathname === "/api/projects") return Response.json({ projects });
			if (pathname === "/api/settings") return Response.json({ project: null, entries: [] });
			const canvas = pathname.match(/^\/api\/p\/([^/]+)\/frames$/);
			if (canvas !== null) return Response.json({ root: `/w/${canvas[1]}`, pages: [], places: {}, frames: [] });
			return new Response(null, { status: 404 });
		}),
	);
	let command: ((command: DesktopCommand) => void) | undefined;
	const closeWindow = vi.fn();
	vi.stubGlobal("spoolCanvasWindow", {
		onCommand: (listener) => {
			command = listener;
			return () => {};
		},
		setCanvasActive: () => {},
		closeWindow,
	} satisfies DesktopWindow);
	// happy-dom runs no animations, and the strip asks after its own as a tab goes
	const hadAnimations = "getAnimations" in Element.prototype;
	if (!hadAnimations)
		Object.defineProperty(Element.prototype, "getAnimations", { value: () => [], configurable: true });
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		if (!hadAnimations) Reflect.deleteProperty(Element.prototype, "getAnimations");
		act(() => root.unmount());
		host.remove();
		window.history.replaceState(null, "", "/");
		vi.unstubAllGlobals();
	});
	await act(async () => root.render(createElement(App)));
	await settle();
	const key = (init: KeyboardEventInit) =>
		act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
		});
	const menu = (name: DesktopCommand) => act(async () => command?.(name));
	const tabs = () => [...host.querySelectorAll<HTMLElement>("[role=tab]")].map((tab) => tab.textContent?.trim());
	return { host, key, menu, tabs, writes, closeWindow, path: () => window.location.pathname };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 5; i++) {
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	}
}

describe("the tab keys", () => {
	it("go to tab N with Home first, the last with 9, and step round the strip", async () => {
		const app = await launch();
		expect(app.path()).toBe("/");
		await app.key({ key: "3", code: "Digit3", metaKey: true });
		expect(app.path()).toBe("/p/beta");
		await app.key({ key: "1", code: "Digit1", metaKey: true });
		expect(app.path()).toBe("/");
		await app.key({ key: "9", code: "Digit9", metaKey: true });
		expect(app.path()).toBe("/p/gamma");
		await app.key({ key: "6", code: "Digit6", metaKey: true });
		expect(app.path()).toBe("/p/gamma");

		await app.key({ key: "Tab", code: "Tab", ctrlKey: true });
		expect(app.path()).toBe("/");
		await app.key({ key: "Tab", code: "Tab", ctrlKey: true, shiftKey: true });
		expect(app.path()).toBe("/p/gamma");
		// by place: ⌘⇧¨ and ⌘⇧å on a Swedish board
		await app.key({ key: "^", code: "BracketRight", metaKey: true, shiftKey: true });
		expect(app.path()).toBe("/");
		await app.key({ key: "Å", code: "BracketLeft", metaKey: true, shiftKey: true });
		expect(app.path()).toBe("/p/gamma");
		await app.key({ key: "t", code: "KeyT", metaKey: true });
		expect(app.path()).toBe("/");
	});

	it("close the focused tab, reopen it in its slot, and close the window from Home", async () => {
		const app = await launch();
		await app.key({ key: "3", code: "Digit3", metaKey: true });
		await app.key({ key: "w", code: "KeyW", metaKey: true });
		await settle();
		expect(app.writes).toContain("close /w/beta");
		expect(app.path()).toBe("/p/gamma");
		await app.key({ key: "2", code: "Digit2", metaKey: true });
		await app.menu("app.close-tab");
		await settle();
		expect(app.writes).toContain("close /w/alpha");

		await app.key({ key: "t", code: "KeyT", metaKey: true, shiftKey: true });
		await settle();
		expect(app.path()).toBe("/p/alpha");
		await app.key({ key: "T", code: "KeyT", metaKey: true, shiftKey: true });
		await settle();
		expect(app.path()).toBe("/p/beta");
		expect(app.writes.slice(-4)).toEqual([
			"open /w/alpha",
			"order /w/alpha /w/gamma",
			"open /w/beta",
			"order /w/alpha /w/beta /w/gamma",
		]);
		// the stack is spent
		await app.key({ key: "t", code: "KeyT", metaKey: true, shiftKey: true });
		expect(app.path()).toBe("/p/beta");

		await app.key({ key: "t", code: "KeyT", metaKey: true });
		expect(app.closeWindow).not.toHaveBeenCalled();
		await app.key({ key: "w", code: "KeyW", metaKey: true });
		expect(app.closeWindow).toHaveBeenCalledTimes(1);
		await app.key({ key: "W", code: "KeyW", metaKey: true, shiftKey: true });
		expect(app.closeWindow).toHaveBeenCalledTimes(2);
	});

	it("put away what is on top before any tab", async () => {
		const app = await launch();
		await app.key({ key: "2", code: "Digit2", metaKey: true });
		await app.menu("app.help");
		expect(app.host.querySelector('[role="dialog"][aria-label="Shortcuts"]')).not.toBeNull();
		await app.menu("app.close-tab");
		expect(app.host.querySelector('[role="dialog"][aria-label="Shortcuts"]')).toBeNull();
		expect(app.path()).toBe("/p/alpha");
		await app.menu("app.settings");
		expect(app.host.querySelector('section[aria-label="Settings"]')).not.toBeNull();
		await app.menu("app.close-tab");
		expect(app.host.querySelector('section[aria-label="Settings"]')).toBeNull();
		expect(app.path()).toBe("/p/alpha");
		// a native dialog takes its own Esc, and is sent one
		await app.menu("app.new-project");
		expect(app.host.querySelector('dialog[aria-label="New project"]')).not.toBeNull();
		await app.menu("app.close-tab");
		expect(app.host.querySelector('dialog[aria-label="New project"]')).toBeNull();
		expect(app.path()).toBe("/p/alpha");
		expect(app.writes.filter((write) => write.startsWith("close"))).toEqual([]);
	});
});
