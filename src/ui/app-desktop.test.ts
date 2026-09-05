// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { App } from "./app";
import type { DesktopCommand, DesktopWindow } from "./desktop-window";

describe("native app commands", () => {
	it("opens the existing surfaces, replaces an open overlay, and detaches on unmount", async () => {
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		let command: ((command: DesktopCommand) => void) | undefined;
		const detached = vi.fn();
		const setCanvasActive = vi.fn();
		const bridge = {
			onCommand: (listener) => {
				command = listener;
				return detached;
			},
			setCanvasActive,
		} satisfies DesktopWindow;
		vi.stubGlobal("spoolCanvasWindow", bridge);
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const raw = input instanceof Request ? input.url : String(input);
				const { pathname } = new URL(raw, window.location.href);
				if (pathname.endsWith("/events")) {
					return new Response(new ReadableStream<Uint8Array>({ start: () => {} }), {
						headers: { "content-type": "text/event-stream" },
					});
				}
				if (pathname === "/api/session") return Response.json({ open: [] });
				if (pathname === "/api/projects") return Response.json({ projects: [] });
				if (pathname === "/api/settings") return Response.json({ project: null, entries: [] });
				if (pathname === "/api/fs/list") return Response.json({ path: "/Users/test", parent: "/Users", dirs: [] });
				return Response.json({});
			}),
		);
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		onTestFinished(() => {
			act(() => root.unmount());
			host.remove();
			vi.unstubAllGlobals();
		});
		await act(async () => root.render(createElement(App)));
		expect(command).toBeDefined();
		expect(setCanvasActive).toHaveBeenLastCalledWith(false);

		await act(async () => command?.("app.open-project"));
		expect(host.querySelector('dialog[aria-label="Open a folder"]')).not.toBeNull();
		await act(async () => command?.("app.settings"));
		expect(host.querySelector('dialog[aria-label="Open a folder"]')).toBeNull();
		expect(host.querySelector('[role="dialog"][aria-label="Settings"]')).not.toBeNull();
		await act(async () => command?.("app.help"));
		expect(host.querySelector('[role="dialog"][aria-label="Settings"]')).toBeNull();
		expect(host.querySelector('[role="dialog"][aria-label="Shortcuts"]')).not.toBeNull();

		await act(async () => root.unmount());
		expect(detached).toHaveBeenCalledTimes(1);
		expect(setCanvasActive).toHaveBeenLastCalledWith(false);
	});
});
