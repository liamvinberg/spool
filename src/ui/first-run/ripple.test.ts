// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { Ripple } from "./ripple";

/**
 * The open's light without a dependable GPU (spool#250): WebGL 2 that fails to set up, or
 * is taken back while it draws, leaves the plain mark, the words on time, and nothing
 * held on the GPU.
 */

/** A WebGL 2 context that links its program or doesn't, and counts what is made and given back. */
function fakeWebGl(links: boolean) {
	let made = 0;
	let freed = 0;
	const make = () => {
		made += 1;
		return {};
	};
	const free = () => {
		freed += 1;
	};
	const gl = new Proxy(
		{
			createProgram: make,
			createBuffer: make,
			createTexture: make,
			createShader: make,
			deleteProgram: free,
			deleteBuffer: free,
			deleteTexture: free,
			deleteShader: free,
			getProgramParameter: () => links,
			getUniformLocation: () => ({}),
		} as Record<string, unknown>,
		{ get: (target, name: string) => target[name] ?? (() => {}) },
	);
	return { gl, live: () => made - freed };
}

function stubCanvas(gl: unknown) {
	// the mark's field is drawn on a 2D canvas: an empty one will do
	const flat = {
		setTransform: () => {},
		fill: () => {},
		getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
	};
	vi.stubGlobal("Path2D", class {});
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((kind: string) =>
		kind === "webgl2" ? gl : flat) as never);
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function mount(onWords: () => void) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => host.remove());
	act(() =>
		root.render(createElement(Ripple, { startedAt: performance.now(), clock: () => 0, envelope: [0.1], onWords })),
	);
	const holder = host.querySelector("canvas")?.parentElement;
	return { root, host, holder };
}

it("gives back what it made when the light can't be set up, and shows the plain mark", () => {
	const webgl = fakeWebGl(false);
	stubCanvas(webgl.gl);
	const { root, holder } = mount(() => {});
	expect(holder?.dataset.backend).toBe("fallback");
	expect(webgl.live()).toBe(0);
	act(() => root.unmount());
});

it("turns to the plain mark when the GPU takes the context back, the words still on time", () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
	const webgl = fakeWebGl(true);
	stubCanvas(webgl.gl);
	const onWords = vi.fn();
	const { root, host, holder } = mount(onWords);
	expect(holder?.dataset.backend).toBe("webgl");

	act(() => {
		host.querySelector("canvas")?.dispatchEvent(new Event("webglcontextlost"));
	});
	expect(holder?.dataset.backend).toBe("fallback");
	act(() => vi.advanceTimersByTime(6100));
	expect(onWords).toHaveBeenCalledOnce();
	act(() => root.unmount());
	expect(webgl.live()).toBe(0);
});
