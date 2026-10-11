// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { App } from "./app";

/**
 * Settings stands in for the tab's content and goes again without touching it:
 * the gear and ⌘, open it, and esc, Back and the gear put the
 * tab back as it was.
 */
it("opens settings in place of Home from every door, and esc gives Home back as it was", async () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const { pathname } = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			if (pathname.endsWith("/events")) {
				return new Response(new ReadableStream<Uint8Array>({ start: () => {} }), {
					headers: { "content-type": "text/event-stream" },
				});
			}
			if (pathname === "/api/session") return Response.json({ open: [] });
			if (pathname === "/api/projects") return Response.json({ projects: [] });
			if (pathname === "/api/settings") return Response.json({ project: null, entries: [] });
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

	const page = () => host.querySelector('section[aria-label="Settings"]');
	const home = () => host.querySelector('nav[aria-label="Home sections"]');
	const behind = () => home()?.closest("[inert]");
	const gear = () => host.querySelector<HTMLButtonElement>('[data-bar-end="settings"]');
	const key = (init: KeyboardEventInit) =>
		act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
		});

	expect(page()).toBeNull();
	await act(async () => gear()?.click());
	expect(page()).not.toBeNull();
	expect(gear()?.getAttribute("aria-pressed")).toBe("true");
	// Home stays mounted behind it, hidden, so nothing about it is lost
	expect(home()).not.toBeNull();
	expect(behind()).not.toBeNull();
	expect(page()?.querySelector('[data-section="project"]')).toBeNull();
	expect(page()?.querySelector('button[aria-label="Back to Home"]')).not.toBeNull();

	await key({ key: "Escape" });
	expect(page()).toBeNull();
	expect(behind()).toBeNull();

	await act(async () => gear()?.click());
	expect(page()).not.toBeNull();
	await act(async () => page()?.querySelector<HTMLButtonElement>('button[aria-label="Back to Home"]')?.click());
	expect(page()).toBeNull();

	await key({ key: ",", ctrlKey: true });
	expect(page()).not.toBeNull();
	await key({ key: ",", ctrlKey: true });
	expect(page()).toBeNull();

	await act(async () => gear()?.click());
	await act(async () => gear()?.click());
	expect(page()).toBeNull();
});
