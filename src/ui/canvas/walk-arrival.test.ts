// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";

/**
 * What a walk arrival costs (#110). The target's reboot is the whole of the
 * arrival, so nothing may stand between the click and it. The dearest case is a
 * target already mounted and booted: it is the one a self-capture could answer,
 * and the one the old race charged its whole timeout for. The arrival's cover is
 * the target's stored still instead — a picture of a freshly booted frame, which
 * is where the walk lands (#5).
 */

const COVER = { hash: "b".repeat(32) };
const frames = [
	{ name: "origin", x: 0, y: 0, w: 100, h: 100, kind: "html", cover: COVER },
	// no cover, so the canvas borrows it to make one: the only way a frame you
	// are not inside holds a document at all (#112), and the mounted, booted
	// target this test is about
	{ name: "right", x: 180, y: 0, w: 100, h: 100, kind: "html" },
];

describe("walk arrival", () => {
	it("reboots a mounted, booted target without waiting on a capture", async () => {
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
					return Response.json({ frames: frames.map(({ name }) => name), links: [], edges: [], unreadable: [] });
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
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
			callback(performance.now() + 1000);
			return 1;
		});
		vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
		// happy-dom lays nothing out, and the canvas reads the viewport's own box
		// for its camera fit
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
		vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);

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
		// the target has to be mounted before the walk: an unmounted one answers no
		// capture at all, and the dear case is the one that would have answered.
		// A borrowed frame is that case — it has a document and it has booted.
		await until(() => host.querySelector('iframe[title="right"]') !== null);

		await act(async () => {
			host
				.querySelector<HTMLElement>('[data-frame-label="origin"]')
				?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 50, clientY: 50 }));
		});
		expect(host.querySelector('[data-frame-label="origin"]')?.textContent).toContain("live · esc exits");

		const source = host.querySelector<HTMLIFrameElement>('iframe[title="origin"]')?.contentWindow ?? null;
		const target = host.querySelector<HTMLIFrameElement>('iframe[title="right"]');
		expect(target).not.toBeNull();
		// the target has booted, so a self-capture would reach its shim and wait
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { spool: "loaded", frame: "right" },
					source: target?.contentWindow ?? null,
				}),
			);
		});
		const before = target?.src;

		// one microtask flush, no timer: the reboot is owed on the click itself
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						spool: "go",
						frame: "origin",
						target: "right",
						session: { scenario: "default", state: {}, stack: [] },
						id: 1,
					},
					source,
				}),
			);
		});

		const rebooted = host.querySelector<HTMLIFrameElement>('iframe[title="right"]');
		expect(rebooted?.src).not.toBe(before);
		expect(rebooted?.src).toContain("?v=1");
	});
});

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 80; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
	}
	throw new Error("canvas did not settle");
}
