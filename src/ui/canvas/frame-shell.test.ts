import { describe, expect, it } from "vitest";
import { coverPlan } from "./frame-shell";

/**
 * The cover law (#8, #28): a boot is covered until its loaded report; a
 * standard boot wears the veil + "booting" badge, a walk arrival never does —
 * it holds the freshest still, uncovered, so the screen settles into life
 * instead of visibly reloading.
 */

describe("coverPlan", () => {
	it("covers a hibernated frame with its thumbnail, no badge", () => {
		expect(coverPlan({ state: "hibernated", ready: false, hasThumb: true, walk: null })).toEqual({
			cover: true,
			image: "thumb",
			badge: false,
		});
	});

	it("badges a standard boot over the stale thumbnail", () => {
		expect(coverPlan({ state: "live", ready: false, hasThumb: true, walk: null })).toEqual({
			cover: true,
			image: "thumb",
			badge: true,
		});
	});

	it("holds the just-taken still for a walk boot, no veil, no badge", () => {
		expect(coverPlan({ state: "live", ready: false, hasThumb: true, walk: { still: "data:," } })).toEqual({
			cover: true,
			image: "still",
			badge: false,
		});
	});

	it("falls back to the thumbnail when a walk arrival had no still to take", () => {
		// a hibernated target cannot answer a capture — its cached thumb is the still
		expect(coverPlan({ state: "live", ready: false, hasThumb: true, walk: {} })).toEqual({
			cover: true,
			image: "thumb",
			badge: false,
		});
	});

	it("stays quiet even down to the placeholder on a walk boot", () => {
		expect(coverPlan({ state: "live", ready: false, hasThumb: false, walk: {} })).toEqual({
			cover: true,
			image: "placeholder",
			badge: false,
		});
	});

	it("uncovers once the boot reports loaded, walk or not", () => {
		expect(coverPlan({ state: "live", ready: true, hasThumb: true, walk: null }).cover).toBe(false);
		expect(coverPlan({ state: "live", ready: true, hasThumb: true, walk: { still: "data:," } }).cover).toBe(false);
	});

	it("never badges a frame that is not mounted", () => {
		expect(coverPlan({ state: "hibernated", ready: false, hasThumb: false, walk: null })).toEqual({
			cover: true,
			image: "placeholder",
			badge: false,
		});
	});
});
