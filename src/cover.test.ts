import { describe, expect, it } from "vitest";
import { captureRasterSize, coverCaptureScale, LIVE_MIN_CSS_PX } from "./cover";

describe("the live threshold", () => {
	it("is 400 CSS pixels", () => {
		expect(LIVE_MIN_CSS_PX).toBe(400);
	});

	it("keeps a portrait still sharp at the threshold on a 2× display", () => {
		const [width, height] = [390, 844];
		const scale = coverCaptureScale(width);
		expect([Math.round(width * scale), Math.round(height * scale)]).toEqual([800, 1731]);
	});

	it("accepts a tall still below the shared output-pixel budget", () => {
		expect(captureRasterSize(40, 1000, coverCaptureScale(40))).toEqual({ width: 800, height: 20_000 });
	});

	it("rejects a tall still above the shared output-pixel budget", () => {
		expect(captureRasterSize(40, 10_000, coverCaptureScale(40))).toBeUndefined();
	});

	it("rejects fractional source or reply dimensions", () => {
		expect(captureRasterSize(40.5, 1000, 1)).toBeUndefined();
		expect(captureRasterSize(40, 1000.5, 1)).toBeUndefined();
	});
});
