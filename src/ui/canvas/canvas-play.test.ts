// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";

/**
 * Play opens a tab (#227). What is asserted here is the seam: the press names
 * one frame on the `/play/` door, nothing on the canvas changes state, and the
 * canvas keeps every key it owns — there is no player over it to stand down for.
 */

const frames = [
	{ name: "menu", x: 0, y: 0, w: 390, h: 844 },
	{ name: "cart", x: 600, y: 0, w: 390, h: 844 },
];

interface Harness {
	host: HTMLElement;
	requests: string[];
	opened: ReturnType<typeof vi.fn>;
}

async function mountCanvas(): Promise<Harness> {
	const requests: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const raw = input instanceof Request ? input.url : String(input);
			const url = new URL(raw, window.location.href);
			requests.push(`${url.pathname}${url.search}`);
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
	const opened = vi.fn();
	vi.stubGlobal("open", opened);

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
	await until(() => host.querySelector('[data-frame-label="menu"]') !== null);
	return { host, requests, opened };
}

describe("playing a frame", () => {
	it("opens the play door on the frame the press meant", async () => {
		const { host, opened } = await mountCanvas();

		await act(async () => {
			host.querySelector<HTMLElement>('[role="application"]')?.focus();
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
		});
		// nothing is selected: the press has no single frame to mean
		expect(opened).not.toHaveBeenCalled();

		await act(async () => clickFrame(host, "cart"));
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
		});

		expect(opened).toHaveBeenCalledWith("/play/test?frame=cart", "_blank", "noopener,noreferrer");
	});

	it("leaves the canvas exactly as it found it", async () => {
		const { host, opened, requests } = await mountCanvas();
		const before = cameraTransform(host);

		await act(async () => clickFrame(host, "menu"));
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
		});

		expect(opened).toHaveBeenCalledTimes(1);
		// the canvas holds no play state at all: no camera flight, no session
		// fetched, and the frame layer is still the frame layer
		expect(cameraTransform(host)).toBe(before);
		expect(requests.some((path) => path.startsWith("/api/p/test/play"))).toBe(false);
		expect(host.querySelector('[data-frame-label="menu"]')).not.toBeNull();

		// and every canvas key still answers, because nothing is over it
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true }));
		});
		expect(host.querySelector<HTMLElement>('[role="application"]')?.style.cursor).toBe("grab");
	});
});

function clickFrame(host: HTMLElement, name: string): void {
	const frame = frames.find((candidate) => candidate.name === name);
	if (frame === undefined) throw new Error(`no frame ${name}`);
	const canvas = host.querySelector<HTMLElement>('[role="application"]');
	const at = { clientX: frame.x + 10, clientY: frame.y + 10, bubbles: true, button: 0, pointerId: 1 };
	canvas?.dispatchEvent(new PointerEvent("pointerdown", at));
	canvas?.dispatchEvent(new PointerEvent("pointerup", at));
}

/** The field's transform is the camera made visible — one string per resting spot. */
function cameraTransform(host: HTMLElement): string {
	const field = host.querySelector<HTMLElement>("[data-canvas-camera]");
	return field?.style.transform ?? "";
}

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 40; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
