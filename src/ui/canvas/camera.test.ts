import { describe, expect, it } from "vitest";
import {
	type Box,
	cameraPath,
	entryCamera,
	fitBand,
	fitCamera,
	moveCamera,
	noneOnScreen,
	nudgeCamera,
	revealCamera,
	SMALL_PAGE_FLOOR,
	zoomAt,
	zoomFloor,
} from "./camera";

/** A tall page: taller than any viewport, the frame the old fit hurt most. */
const page: Box = { x: 0, y: 0, w: 800, h: 6000 };
const VW = 1200;
const VH = 800;

describe("entryCamera", () => {
	it("fits when the frame is smaller on screen than a fit would make it", () => {
		const far = { x: 0, y: 0, k: 0.05 };
		expect(entryCamera(far, page, VW, VH)).toEqual(fitCamera(page, VW, VH));
	});

	it("leaves the camera alone when already zoomed past a fit", () => {
		const fit = fitCamera(page, VW, VH);
		const read = { x: -100, y: -4000, k: fit.k * 8 };
		expect(entryCamera(read, page, VW, VH)).toBe(read);
	});

	it("does not move when already centered at the fit", () => {
		const fit = fitCamera(page, VW, VH);
		expect(entryCamera(fit, page, VW, VH)).toEqual(fit);
	});

	it.each([0.64, 0.68, VH / 1050])("centers a neighboring frame at zoom %s without zooming out", (k) => {
		const neighbor: Box = { x: 1500, y: 0, w: 1400, h: 1050 };
		const camera = { x: 0, y: 40, k };
		const entered = entryCamera(camera, neighbor, VW, VH);
		expect(entered.k).toBe(k);
		expect((neighbor.x + neighbor.w / 2) * k + entered.x).toBeCloseTo(VW / 2);
		expect((neighbor.y + neighbor.h / 2) * k + entered.y).toBeCloseTo(VH / 2);
	});

	it.each([
		{ w: 1400, h: 1050, k: VH / 1050 + 0.01 },
		{ w: 6000, h: 600, k: 0.3 },
	])("keeps a close-up when the frame exceeds the viewport on either axis: %o", ({ w, h, k }) => {
		const frame = { x: 0, y: 0, w, h };
		const camera = { x: -100, y: -100, k };
		expect(entryCamera(camera, frame, VW, VH)).toBe(camera);
	});

	it("centers a small frame at actual size without enlarging it", () => {
		const chip: Box = { x: 900, y: 700, w: 120, h: 90 };
		expect(entryCamera({ x: 0, y: 0, k: 1 }, chip, VW, VH)).toEqual({ x: -360, y: -345, k: 1 });
	});

	it("pans at the current zoom when the target is off screen entirely", () => {
		const fit = fitCamera(page, VW, VH);
		const elsewhere = { x: 40_000, y: 40_000, k: fit.k * 4 };
		const entered = entryCamera(elsewhere, page, VW, VH);
		expect(entered.k).toBe(elsewhere.k);
		// centered: the frame's middle sits at the viewport's middle
		expect((page.x + page.w / 2) * entered.k + entered.x).toBeCloseTo(VW / 2);
		expect((page.y + page.h / 2) * entered.k + entered.y).toBeCloseTo(VH / 2);
	});

	it("still fits a small frame entered from far out, never past 100%", () => {
		const chip: Box = { x: 900, y: 900, w: 120, h: 90 };
		const entered = entryCamera({ x: 0, y: 0, k: 0.1 }, chip, VW, VH);
		expect(entered.k).toBe(1);
	});
});

describe("moveCamera", () => {
	/** A design-system page beside the one live: 1440 wide, 4000 tall, 160 apart. */
	const next: Box = { x: 1600, y: 0, w: 1440, h: 4000 };
	const onScreen = (camera: { x: number; y: number; k: number }, box: Box) => ({
		left: box.x * camera.k + camera.x,
		top: box.y * camera.k + camera.y,
		right: (box.x + box.w) * camera.k + camera.x,
	});

	it("brings a tall neighbour in that entryCamera would leave where it is", () => {
		// reading the first page close up, the next one's edge on screen
		const reading = { x: -900, y: -1200, k: 0.5 };
		expect(entryCamera(reading, next, VW, VH)).toBe(reading);
		const moved = moveCamera(reading, next, VW, VH);
		expect(moved.k).toBe(0.5);
		const at = onScreen(moved, next);
		// across: centered, it fits at this zoom; down: its top a fit's margin in
		expect((at.left + at.right) / 2).toBeCloseTo(VW / 2);
		expect(at.top).toBeCloseTo(64);
	});

	it("aligns the left edge of a target wider than the view", () => {
		const moved = moveCamera({ x: 0, y: 0, k: 1 }, next, VW, VH);
		expect(onScreen(moved, next)).toMatchObject({ left: 64, top: 64 });
	});

	it("zooms in to fit from further out, as entering does", () => {
		const far = { x: 0, y: 0, k: 0.02 };
		expect(moveCamera(far, next, VW, VH)).toEqual(fitCamera(next, VW, VH));
	});

	it("centers a target that fits at the current zoom", () => {
		const phone: Box = { x: 600, y: 300, w: 390, h: 844 };
		const moved = moveCamera({ x: 0, y: 0, k: 0.8 }, phone, VW, VH);
		expect(moved.k).toBe(0.8);
		expect((phone.x + phone.w / 2) * 0.8 + moved.x).toBeCloseTo(VW / 2);
		expect((phone.y + phone.h / 2) * 0.8 + moved.y).toBeCloseTo(VH / 2);
	});
});

describe("revealCamera", () => {
	const camera = { x: 0, y: 0, k: 0.5 };

	it("leaves the camera alone when the box is wholly on screen", () => {
		expect(revealCamera(camera, { x: 100, y: 100, w: 400, h: 300 }, 800, 600)).toBe(camera);
	});

	it("pans to center a box cut by the edge, keeping the zoom", () => {
		expect(revealCamera(camera, { x: 1500, y: 100, w: 400, h: 300 }, 800, 600)).toEqual({
			k: 0.5,
			x: 400 - 1700 * 0.5,
			y: 300 - 250 * 0.5,
		});
	});
});

describe("zoomFloor", () => {
	it("is where the whole page fits the view with a fit's margin", () => {
		const page: Box = { x: -4000, y: 200, w: 20000, h: 6000 };
		const floor = zoomFloor(page, 1200, 800);
		expect(floor).toBeCloseTo((1200 - 128) / 20000);
		expect(floor).toBe(fitCamera(page, 1200, 800).k);
	});

	it("still lets a small page zoom out to a fixed level", () => {
		expect(zoomFloor({ x: 0, y: 0, w: 390, h: 844 }, 1200, 800)).toBe(SMALL_PAGE_FLOOR);
	});

	it("never goes below 2%, however large the page", () => {
		expect(zoomFloor({ x: 0, y: 0, w: 1e6, h: 1e6 }, 1200, 800)).toBe(0.02);
	});

	it("is 2% on an empty page or a view too small to fit anything", () => {
		expect(zoomFloor(null, 1200, 800)).toBe(0.02);
		expect(zoomFloor({ x: 0, y: 0, w: 0, h: 0 }, 1200, 800)).toBe(0.02);
		expect(zoomFloor({ x: 0, y: 0, w: 400, h: 400 }, 100, 100)).toBe(0.02);
	});
});

describe("zoomAt with a floor", () => {
	it("stops zooming out at the floor, the pinned point staying put", () => {
		const camera = { x: 100, y: 50, k: 0.3 };
		const out = zoomAt(camera, 400, 300, 0.5, 0.25);
		expect(out.k).toBe(0.25);
		// the world point under (400, 300) is still under it
		expect((400 - out.x) / out.k).toBeCloseTo((400 - camera.x) / camera.k);
		expect((300 - out.y) / out.k).toBeCloseTo((300 - camera.y) / camera.k);
	});

	it("zooms in freely and never snaps a camera already further out", () => {
		const below = { x: 0, y: 0, k: 0.1 };
		expect(zoomAt(below, 0, 0, 0.5, 0.25).k).toBe(0.1);
		expect(zoomAt(below, 0, 0, 2, 0.25).k).toBe(0.2);
	});

	it("keeps the 2% floor without one, or with a lower one", () => {
		expect(zoomAt({ x: 0, y: 0, k: 0.03 }, 0, 0, 0.5).k).toBe(0.02);
		expect(zoomAt({ x: 0, y: 0, k: 0.03 }, 0, 0, 0.5, 0.001).k).toBe(0.02);
	});
});

describe("a deck page fitted (spool#299)", () => {
	const talk = { w: 1280, h: 720 };
	/** a talk of `n` slides, its band from the page's left, and a grid of loose frames under it */
	const field = (n: number): Box => ({ x: 0, y: 0, w: n * 1440 - 160, h: 2000 });

	it("fits five slides' worth across the view, and never draws a slide under 120 px, opening at the band's left end", () => {
		const short = fitBand({ talk, slides: 3 }, field(3), 1440, 900);
		expect(short.k).toBeCloseTo((1440 - 72) / (5 * 1440 - 160));
		expect(short.x).toBe(36);
		const long = fitBand({ talk, slides: 100 }, field(100), 1440, 900);
		expect(long.k * talk.w).toBe(120);
		expect(long.x).toBe(36);
	});

	it("opens with a slide chosen in view, and leaves the band at its end when the slide is already there", () => {
		const k = 120 / talk.w;
		const sixtieth: Box = { x: 59 * 1440, y: 0, ...talk };
		const shown = fitBand({ talk, slides: 100 }, field(100), 1440, 900, sixtieth);
		const left = shown.x + sixtieth.x * k;
		expect(left).toBeGreaterThan(0);
		expect(left + talk.w * k).toBeLessThan(1440);
		expect(fitBand({ talk, slides: 100 }, field(100), 1440, 900, { x: 1440, y: 0, ...talk }).x).toBe(36);
	});

	it("brings a slide chosen off the view just inside its edge, moving no further than that and no other way", () => {
		const camera = { x: 36, y: 200, k: 0.1 };
		const tenth: Box = { x: 9 * 1440, y: 0, ...talk };
		const nudged = nudgeCamera(camera, tenth, 1200, 800, 48);
		expect(nudged.x + (tenth.x + tenth.w) * 0.1).toBe(1200 - 48);
		expect(nudged.y).toBe(200);
		expect(nudgeCamera(camera, { x: 1440, y: 0, ...talk }, 1200, 800, 48)).toBe(camera);
		// panned off below the band: it comes back down to the view's top
		const above = nudgeCamera({ ...camera, y: -500 }, { x: 1440, y: 0, ...talk }, 1200, 800, 48);
		expect(above.y).toBe(48);
		expect(above.x).toBe(36);
	});
});

describe("noneOnScreen", () => {
	const boxes: Box[] = [
		{ x: 0, y: 0, w: 400, h: 300 },
		{ x: 2000, y: 0, w: 400, h: 300 },
	];

	it("is true only once every box is off the view, and never for an empty page", () => {
		expect(noneOnScreen({ x: 0, y: 0, k: 1 }, boxes, VW, VH)).toBe(false);
		// a sliver of the second frame at the right edge still counts as in view
		expect(noneOnScreen({ x: -1000, y: 0, k: 1 }, boxes, VW, VH)).toBe(false);
		expect(noneOnScreen({ x: 0, y: -5000, k: 1 }, boxes, VW, VH)).toBe(true);
		expect(noneOnScreen({ x: 0, y: -5000, k: 1 }, [], VW, VH)).toBe(false);
	});
});

describe("cameraPath", () => {
	it("leaves from where the camera is, lands exactly where it was aimed, and zooms out on the way across", () => {
		const from = { x: -6000, y: -3000, k: 0.6 };
		const to = { x: 200, y: 100, k: 0.6 };
		const path = cameraPath(from, to, VW, VH);
		const start = path.at(0);
		expect(start.x).toBeCloseTo(from.x);
		expect(start.y).toBeCloseTo(from.y);
		expect(start.k).toBeCloseTo(from.k);
		expect(path.at(1)).toBe(to);
		expect(path.at(0.5).k).toBeLessThan(0.6 / 2);
	});

	it("is a pure zoom when the view's middle stays put, as long as the zoom is far", () => {
		const from = { x: 0, y: 0, k: 1 };
		const to = { x: VW / 2 - (VW / 2) * 4, y: VH / 2 - (VH / 2) * 4, k: 4 };
		const path = cameraPath(from, to, VW, VH);
		expect(path.length).toBeCloseTo(Math.log(4) / Math.SQRT2);
		expect(path.at(0.5).k).toBeCloseTo(2);
		expect(path.at(0.5).x).toBeCloseTo(VW / 2 - (VW / 2) * 2);
	});

	it("is longer the further it goes", () => {
		const to = { x: 0, y: 0, k: 1 };
		const near = cameraPath({ x: -1200, y: 0, k: 1 }, to, VW, VH);
		const far = cameraPath({ x: -12000, y: 0, k: 1 }, to, VW, VH);
		expect(far.length).toBeGreaterThan(near.length);
	});
});
