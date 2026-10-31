// @vitest-environment happy-dom

import { beforeAll, describe, expect, it, onTestFinished } from "vitest";

/** A Retina screen, and a frame the canvas shows at a quarter of it. */
let shim: typeof import("./resolution");
beforeAll(async () => {
	Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => 2 });
	window.name = "spool-dpr=0.5";
	shim = await import("./resolution");
	shim.shownDensity();
});

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Every reload the shim asks the canvas for while `run` lasts. */
async function reloadsAsked(run: () => Promise<unknown>): Promise<number> {
	let asked = 0;
	const onMessage = (event: MessageEvent) => {
		if ((event.data as { spool?: string } | null)?.spool === "resolution-reload") asked++;
	};
	addEventListener("message", onMessage);
	try {
		await run().catch(() => {});
		await sleep(50);
		return asked;
	} finally {
		removeEventListener("message", onMessage);
	}
}

/** Frame code sizing its canvas the agent way: read the density on mount and on every resize. */
function followsResize(): void {
	const draw = () => window.devicePixelRatio;
	draw();
	addEventListener("resize", draw);
	onTestFinished(() => removeEventListener("resize", draw));
}

describe("a frame drawn at the density it is shown (frame-resolution)", () => {
	it("is reloaded for a finer density only when it read the density once and never again", async () => {
		await shim.setShownDensity(0.5);
		void window.devicePixelRatio; // read once, at mount, like the dither specimen
		expect(await reloadsAsked(() => shim.setShownDensity(0.25)), "coarser needs nothing").toBe(0);
		expect(await reloadsAsked(() => shim.setShownDensity(1))).toBe(1);

		followsResize();
		expect(await reloadsAsked(() => shim.setShownDensity(2)), "a frame that follows resize redraws in place").toBe(0);
	});

	it("exports at the screen's density and goes back to the shown one after", async () => {
		await shim.setShownDensity(0.75);
		followsResize();
		const seen = await shim.atFullDensity(async () => window.devicePixelRatio);
		expect(seen).toBe(2);
		await sleep(50);
		expect(window.devicePixelRatio).toBe(0.75);
	});

	it("fails an export that would be softer than the screen, asking for the reload that makes it sharp", async () => {
		await shim.setShownDensity(0.75);
		void window.devicePixelRatio;
		let captured = false;
		const asked = await reloadsAsked(() =>
			shim.atFullDensity(async () => {
				captured = true;
			}),
		);
		expect(captured).toBe(false);
		expect(asked).toBe(1);
	});
});
