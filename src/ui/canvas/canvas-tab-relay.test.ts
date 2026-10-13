// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import { ProjectCanvas } from "./canvas";
import { openEventStream } from "./test-event-stream";

// the Mac's keyboard law, read once and before anything asks: ⌘ is accel, ctrl is not
vi.hoisted(() => {
	Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
});

const frames = [
	{ name: "origin", x: 0, y: 0, w: 400, h: 400 },
	{ name: "beside", x: 440, y: 0, w: 400, h: 400 },
];

it("switches tabs only for the frame that is entered, and only under ⌘", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			if (url.pathname.endsWith("/events")) return openEventStream();
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) return Response.json({ root: "/project", pages: [], frames });
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: frames.map(({ name }) => name), links: [], edges: [], unreadable: [] });
			}
			return Response.json({});
		}),
	);
	const setAttribute = HTMLIFrameElement.prototype.setAttribute;
	vi.spyOn(HTMLIFrameElement.prototype, "setAttribute").mockImplementation(function (
		this: HTMLIFrameElement,
		name,
		value,
	) {
		setAttribute.call(this, name, name === "src" ? "about:blank" : value);
	});
	vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
		callback(performance.now() + 1000);
		return 1;
	});
	vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
	vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
	vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
	const next = vi.fn();
	const detachApp = attachHotkeyLayer({ scope: "app", handlers: { "app.next-tab": next } });
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		detachApp();
		host.remove();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	await act(async () => root.render(createElement(ProjectCanvas, { project: "test", onChrome: () => {} })));
	await until(() => host.querySelector('[data-frame-label="origin"]') !== null);
	await act(async () => {
		host
			.querySelector<HTMLElement>('[data-frame-label="origin"]')
			?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 40, clientY: 40 }));
	});
	await until(
		() =>
			host.querySelector('iframe[title="origin"]') !== null && host.querySelector('iframe[title="beside"]') !== null,
	);
	const relay = (frame: string, modifiers: { metaKey: boolean; ctrlKey: boolean }) =>
		act(async () => {
			const source = host.querySelector<HTMLIFrameElement>(`iframe[title="${frame}"]`)?.contentWindow ?? null;
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { spool: "key", frame, id: "app.next-tab", ...modifiers },
					source,
				}),
			);
		});

	// a frame running beside the entered one, on a timer say, is refused
	await relay("beside", { metaKey: true, ctrlKey: false });
	expect(next).not.toHaveBeenCalled();
	// ctrl+⇧] matched the shim's either-modifier rule, and is not ⌘⇧] on a Mac
	await relay("origin", { metaKey: false, ctrlKey: true });
	expect(next).not.toHaveBeenCalled();
	await relay("origin", { metaKey: true, ctrlKey: false });
	expect(next).toHaveBeenCalledTimes(1);
});

async function until(check: () => boolean): Promise<void> {
	for (let i = 0; i < 50; i++) {
		if (check()) return;
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	}
	throw new Error("canvas did not settle");
}
