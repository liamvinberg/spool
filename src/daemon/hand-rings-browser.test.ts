import { expect, it } from "vitest";
import { handCanvas } from "./hand-browser-helpers";

/**
 * The rings are the frame's, not the canvas's (#323).
 *
 * A frame is a window on a document that is usually taller than it. An element
 * laid out past the frame's height still reports its rect, so a ring drawn
 * against the viewport landed out on the canvas, over whatever happened to sit
 * beside the frame. Everything an element overlay draws now lives inside the
 * frame's own clipped box, and an edge a pick runs past wears a bar saying so.
 */

const PAGE = `export default function Tall() {
  return <main id="top" className="bg-white">
    <p id="near" className="p-4 text-sm">At the top of the page.</p>
    <div id="filler" className="h-[900px]"></div>
    <p id="far" className="p-4 text-sm">Laid out below what the frame draws.</p>
  </main>;
}
`;

it("clips a ring to the frame and marks the edge it runs past", { timeout: 240_000 }, async () => {
	// a frame far shorter than the page it draws: #far is laid out at y ≈ 950
	const f = await handCanvas({}, PAGE, { w: 600, h: 300 });
	const { page } = f;
	const bars = (edge: string) => page.locator(`[data-ring-clipped="${edge}"]`).count();
	const ringsInside = () => page.locator("[data-frame-clip='home'] [data-element-ring]").count();

	// the element inside the frame draws its ring inside the frame's own box,
	// and nothing says it was cut
	await f.select("p#near");
	await expect.poll(ringsInside, { timeout: 15_000 }).toBeGreaterThan(0);
	expect(await bars("bottom")).toBe(0);
	expect(await bars("top")).toBe(0);

	// walking down the row reaches the one below the frame's height: the ring is
	// still inside the frame's box, and the bottom edge says the element goes on
	await page.keyboard.press("Tab");
	await page.keyboard.press("Tab");
	await expect.poll(() => bars("bottom"), { timeout: 15_000 }).toBe(1);
	expect(await ringsInside()).toBeGreaterThan(0);
	expect(await bars("top")).toBe(0);
	expect(await bars("left")).toBe(0);
});
