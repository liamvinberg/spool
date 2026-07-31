// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { fitBox } from "../../fit";
import { ProjectCanvas } from "./canvas";

/**
 * Inline play (#210): pressing play flies the camera into the frame and the
 * player takes the viewport, and `accel+esc` flies back out. What is asserted
 * here is the seam — the door no longer opens a tab, the layer asks the daemon
 * for a session, the landing is the player's own placement, and leaving puts
 * the canvas back.
 */

const frames = [
	{ name: "menu", x: 0, y: 0, w: 390, h: 844, kind: "html" },
	{ name: "cart", x: 600, y: 0, w: 390, h: 844, kind: "html" },
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
			if (url.pathname.endsWith("/play")) {
				return Response.json({
					project: "test",
					start: url.searchParams.get("frame") ?? "menu",
					frames: Object.fromEntries(frames.map((frame) => [frame.name, { w: frame.w, h: frame.h }])),
					terminals: [],
					innerUrl: `http://render.localhost/play/test?frame=${url.searchParams.get("frame") ?? "menu"}&shell=1&handoff=x`,
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
	const opened = vi.fn();
	vi.stubGlobal("open", opened);
	// the flight is a real animation; run every frame straight through so the
	// camera is wherever it was going by the time the next assertion reads it
	vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
		callback(performance.now() + 10_000);
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
	await until(() => host.querySelector('[data-frame-label="menu"]') !== null);
	return { host, requests, opened };
}

describe("playing a frame inline", () => {
	it("asks the daemon for a session and never opens a tab", async () => {
		const { host, requests, opened } = await mountCanvas();

		await act(async () => {
			host.querySelector<HTMLElement>('[role="application"]')?.focus();
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
		});
		// nothing is selected: the press has no single frame to mean
		expect(requests.some((path) => path.startsWith("/api/p/test/play"))).toBe(false);

		await act(async () => {
			clickFrame(host, "menu");
		});
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
		});
		await until(() => requests.some((path) => path.startsWith("/api/p/test/play")));

		expect(requests.find((path) => path.startsWith("/api/p/test/play"))).toBe("/api/p/test/play?frame=menu");
		expect(opened).not.toHaveBeenCalled();
	});

	it("mounts the player at the placement the camera flies to", async () => {
		const { host } = await mountCanvas();

		await act(async () => clickFrame(host, "menu"));
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
		});
		await until(() => host.querySelector('iframe[title="test"]') !== null);
		const place = fitBox(390, 844, window.innerWidth, window.innerHeight);
		await until(() => transformOf(cameraTransform(host))[2] !== 1);

		const player = host.querySelector<HTMLIFrameElement>('iframe[title="test"]');
		expect(player?.getAttribute("sandbox")).toBe("allow-scripts");
		expect(player?.src).toContain("shell=1");

		// the stage's own fit, so the flight's landing values are the placement
		expect(player?.style.width).toBe("390px");
		expect(player?.style.transform).toBe(`translate(${place.x}px, ${place.y}px) scale(${place.scale})`);
		// and the camera came to rest on exactly that
		const [x, y, k] = transformOf(cameraTransform(host));
		expect(x).toBeCloseTo(place.x, 6);
		expect(y).toBeCloseTo(place.y, 6);
		expect(k).toBeCloseTo(place.scale, 9);
	});

	it("dissolves the canvas chrome before the camera moves", async () => {
		const { host } = await mountCanvas();

		await act(async () => clickFrame(host, "menu"));
		expect(chromeOpacity(host, "menu")).toBe("1");

		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
		});
		expect(chromeOpacity(host, "menu")).toBe("0");
	});

	it("stands every canvas key down while the player is up", async () => {
		const { host } = await mountCanvas();

		await act(async () => clickFrame(host, "menu"));
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
		});
		await until(() => host.querySelector('iframe[title="test"]') !== null);
		const canvas = host.querySelector<HTMLElement>('[role="application"]');
		expect(canvas?.style.cursor).toBe("default");

		// a player filling the screen is a live frame, and spool takes no plain
		// key from one — not even the ones the canvas owns everywhere else
		for (const key of ["h", "e", "r", "Backspace"]) {
			await act(async () => {
				window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
			});
		}
		expect(canvas?.style.cursor).toBe("default");
		expect(host.querySelector('iframe[title="test"]')).not.toBeNull();

		// and the same key is the canvas's again the moment the player is gone
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", metaKey: true, ctrlKey: true }));
		});
		await until(() => host.querySelector('iframe[title="test"]') === null);
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true }));
		});
		expect(canvas?.style.cursor).toBe("grab");
	});

	it("leaves on accel+esc and puts the canvas back where it was", async () => {
		const { host } = await mountCanvas();
		const before = cameraTransform(host);

		await act(async () => clickFrame(host, "menu"));
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
		});
		await until(() => host.querySelector('iframe[title="test"]') !== null);
		await until(() => cameraTransform(host) !== before);

		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", metaKey: true, ctrlKey: true }));
		});
		await until(() => host.querySelector('iframe[title="test"]') === null);
		// the furniture only comes back once the camera has stopped, so both are
		// waited for rather than read the moment the player goes
		await until(() => chromeOpacity(host, "menu") === "1");
		expect(cameraTransform(host)).toBe(before);
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

/** The label layer's opacity: the chrome dissolve, read where it is applied. */
function chromeOpacity(host: HTMLElement, name: string): string {
	const label = host.querySelector(`[data-frame-label="${name}"]`);
	let node = label?.parentElement ?? null;
	while (node !== null) {
		if (node.style.transitionProperty === "opacity" || node.className.includes("transition-opacity")) {
			return node.style.opacity;
		}
		node = node.parentElement;
	}
	throw new Error("no chrome layer above the label");
}

/** `translate(Xpx, Ypx) scale(K)` taken apart. */
function transformOf(transform: string): [number, number, number] {
	const [, x, y, k] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(transform) ?? [];
	return [Number(x), Number(y), Number(k)];
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
