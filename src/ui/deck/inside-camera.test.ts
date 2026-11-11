import { expect, it } from "vitest";
import { insideCamera, outCamera } from "./inside-camera";

const slot = (index: number) => ({ x: index * 1440, y: 0, w: 1280, h: 720 });

it("fills the view with the slide gone into, its label's room above it and a margin around", () => {
	// a wide view: the height decides, the slide centred across
	const wide = insideCamera(slot(2), 1600, 784);
	expect(wide.k).toBe(1);
	expect({ x: wide.x + 2880 * wide.k, y: wide.y }).toEqual({ x: 160, y: 40 });
	// a tall view: the width decides, 24 either side, the slide centred down under its label's room
	const tall = insideCamera(slot(0), 688, 900);
	expect(tall.k).toBe(0.5);
	expect({ x: tall.x, y: tall.y }).toEqual({ x: 24, y: 40 + (900 - 64 - 360) / 2 });
});

it("comes out to the camera it went in from on the same slide, else to its zoom and height across the slide ended on", () => {
	const before = { camera: { x: -300, y: 210, k: 0.2 }, from: "deck/b" };
	expect(outCamera(before, { slide: "deck/b", slot: slot(1) }, 1000)).toBe(before.camera);
	expect(outCamera(before, { slide: "deck/d", slot: slot(3) }, 1000)).toEqual({
		k: 0.2,
		y: 210,
		x: 500 - (3 * 1440 + 640) * 0.2,
	});
});
