import { describe, expect, it } from "vitest";
import { captureRasterSize, coverCaptureScale, coverShape, openingShape } from "./cover";

describe("the live threshold", () => {
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

describe("a slide's opening still", () => {
	// full screen on a Retina laptop draws a slide 3024 device pixels wide, a 4K projector 3840: a still any smaller
	// flies in stretched there
	it("is made to fill a 4K screen, whatever the talk's size and shape", () => {
		const raster = (w: number, h: number) => openingShape(coverShape(w, h) ?? expect.unreachable())?.raster;
		expect(raster(1280, 720)).toEqual({ width: 3840, height: 2160 });
		expect(raster(1920, 1080)).toEqual({ width: 3840, height: 2160 });
		expect(raster(1024, 768)).toEqual({ width: 2880, height: 2160 });
	});

	it("is never made smaller than the talk", () => {
		expect(openingShape(coverShape(5120, 2880) ?? expect.unreachable())?.raster).toEqual({
			width: 5120,
			height: 2880,
		});
	});
});
