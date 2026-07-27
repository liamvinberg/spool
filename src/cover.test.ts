import { describe, expect, it } from "vitest";
import { COVER_HEAL_RUNG, COVER_MAX_EDGE, COVER_RUNGS, coverRung, coverRungWidth, coverSizes } from "./cover";

describe("the ladder both writers make", () => {
	it("puts the top rung at the frame's long edge doubled", () => {
		expect(coverRungWidth(390, 844, 0)).toBe(780);
		expect(coverRungWidth(1200, 760, 0)).toBe(2400);
	});

	it("halves each rung below the top", () => {
		expect(coverRungWidth(390, 844, 1)).toBe(390);
		expect(coverRungWidth(390, 844, 2)).toBe(195);
	});

	it("never lets a rung exceed the cap on the long edge", () => {
		// a 5000 px wide frame doubles well past 4096, so the whole ladder scales down
		expect(coverRungWidth(5000, 2000, 0)).toBe(COVER_MAX_EDGE);
		expect(coverRungWidth(2000, 5000, 0)).toBe(Math.round(2000 * (COVER_MAX_EDGE / 5000)));
	});

	it("keeps every rung at least one pixel wide", () => {
		expect(coverRungWidth(1, 1, COVER_RUNGS - 1)).toBe(1);
	});

	it("names the bottom rung as the one a headless heal writes alone", () => {
		expect(COVER_HEAL_RUNG).toBe(COVER_RUNGS - 1);
	});
});

describe("the rung the camera asks for", () => {
	const widths = [780, 390, 195];

	it("takes the top rung at 100% zoom on a 2× display", () => {
		expect(coverRung(widths, 390, 1, 2)).toBe(780);
	});

	it("drops a rung per halving of the zoom", () => {
		expect(coverRung(widths, 390, 0.5, 2)).toBe(390);
		expect(coverRung(widths, 390, 0.25, 2)).toBe(195);
	});

	it("stays on the bottom rung however far the camera pulls back", () => {
		expect(coverRung(widths, 390, 0.02, 2)).toBe(195);
	});

	it("never asks for more than the top rung, because past 100% you go inside", () => {
		expect(coverRung(widths, 390, 4, 2)).toBe(780);
	});

	it("quantizes: every zoom inside one rung's band answers the same", () => {
		const band = [0.26, 0.35, 0.4, 0.49].map((k) => coverRung(widths, 390, k, 2));
		expect(new Set(band)).toEqual(new Set([390]));
	});

	it("reads the display, not just the zoom", () => {
		expect(coverRung(widths, 390, 1, 1)).toBe(390);
		expect(coverRung(widths, 390, 0.5, 1)).toBe(195);
	});

	it("has no answer for a cover with no rungs", () => {
		expect(coverRung([], 390, 1, 2)).toBeUndefined();
	});
});

describe("the sizes attribute the rung becomes", () => {
	const widths = [780, 390, 195];

	it("hands the browser the css width that reproduces the chosen rung", () => {
		expect(coverSizes(widths, 390, 1, 2)).toBe("390px");
		expect(coverSizes(widths, 390, 0.25, 2)).toBe("97.5px");
	});

	it("rounds down, so a display with an awkward ratio still lands on the rung", () => {
		const dpr = 2.625;
		const rung = coverRung(widths, 390, 0.25, dpr) as number;
		const px = Number(coverSizes(widths, 390, 0.25, dpr)?.replace("px", ""));
		// the browser multiplies back by the ratio: it must not land above the rung
		// it was aimed at, or it upgrades every frame to the one above
		expect(px * dpr).toBeLessThanOrEqual(rung);
		expect(px * dpr).toBeGreaterThan(rung - 1);
	});

	it("says nothing for a cover with no rungs", () => {
		expect(coverSizes([], 390, 1, 2)).toBeUndefined();
	});
});
