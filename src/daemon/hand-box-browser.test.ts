import { expect, it } from "vitest";
import { handCanvas } from "./hand-browser-helpers";

/**
 * The box an element is drawn in, and the furniture round it (#324).
 *
 * The fixture is the one the fourth hand test found all of this on: a heading
 * wearing a width a drag wrote under the width its own word needs, with
 * `line-height: 1`, at the very corner of the frame. Opening its words must
 * not move it, a drag must not take it narrower still, and the ring it wears
 * must be a whole ring at any zoom and in any corner.
 */

const CSS = `.site { font-family: system-ui, sans-serif; color: #1a1a1a; background: #f5f2ee; }
.brand { font-size: 36px; line-height: 1; font-weight: 500; letter-spacing: -1.5px; margin: 0; width: 101px; }
.plate { width: 100px; height: 100px; background: #c96a3c; }
.blurb { width: 240px; font-size: 15px; line-height: 24px; margin: 0; }
`;

const PAGE = `import '../../shared/ui/site.css';

export default function Page() {
  return <main className="site" id="top">
    <h3 className="brand" id="brand">Rodebjer</h3>
    <div className="plate" id="plate"></div>
    <p className="blurb" id="blurb">
      Brand strategy, marketing
      and communication, with
      Sara from Stockholm.
    </p>
  </main>;
}
`;

const FILES = { "shared/ui/site.css": CSS };

/** The element's own box inside its frame, to the tenth of a pixel. */
async function boxOf(frame: ReturnType<typeof handCanvas> extends Promise<infer F> ? F : never, selector: string) {
	return frame.frame
		.locator(selector)
		.first()
		.evaluate((el) => {
			const rect = el.getBoundingClientRect();
			return [Math.round(rect.width * 10), Math.round(rect.height * 10)];
		});
}

it("holds the box while the words are open", { timeout: 240_000 }, async () => {
	const f = await handCanvas(FILES, PAGE, { w: 600, h: 420 });
	const { page, frame } = f;
	const editable = (selector: string) => frame.locator(selector).first().getAttribute("contenteditable");
	const open = async (selector: string, position?: { x: number; y: number }) => {
		const held = await f.select(selector, position);
		await page.mouse.click(held.at.x, held.at.y);
		await expect.poll(() => editable(selector), { timeout: 15_000 }).toBe("plaintext-only");
	};

	// the heading is narrower than the one word in it, which is what used to
	// make the caret's arrival break "Rode / bjer" across two lines
	const before = await boxOf(f, "#brand");
	expect(before[0]).toBe(1010);
	await open("#brand", { x: 8, y: 10 });
	expect(await boxOf(f, "#brand")).toEqual(before);
	await page.keyboard.press("Escape");
	await expect.poll(() => editable("#brand"), { timeout: 15_000 }).toBeNull();
	expect(await boxOf(f, "#brand")).toEqual(before);

	// and a paragraph whose words are written across three lines of the file:
	// the engine's pre-wrap has no source line break left to draw
	const blurb = await boxOf(f, "#blurb");
	// three lines of 24, which is what it is drawn as and must stay
	expect(blurb).toEqual([2400, 720]);
	await open("#blurb", { x: 8, y: 8 });
	expect(await boxOf(f, "#blurb")).toEqual(blurb);
	await page.keyboard.press("Escape");
	await expect.poll(() => editable("#blurb"), { timeout: 15_000 }).toBeNull();
	expect(await boxOf(f, "#blurb")).toEqual(blurb);
});

it("will not size a word narrower than the word", { timeout: 240_000 }, async () => {
	const f = await handCanvas(FILES, PAGE, { w: 600, h: 420 });
	const { page, frame } = f;
	const inline = () =>
		frame
			.locator("#brand")
			.first()
			.evaluate((el) => (el as HTMLElement).style.width);

	// what the word needs, which is wider than the box the file says
	const needed = await frame
		.locator("#brand")
		.first()
		.evaluate((el) => el.scrollWidth);
	expect(needed).toBeGreaterThan(101);

	await f.select("#brand", { x: 8, y: 10 });
	// the ring says the box is smaller than what is in it, on the side it spills
	await expect.poll(() => page.locator('[data-ring-spill="right"]').count(), { timeout: 20_000 }).toBe(1);

	await expect.poll(() => page.locator('[data-element-handle="e"]').count(), { timeout: 20_000 }).toBe(1);
	const knob = await page.locator('[data-element-handle="e"]').boundingBox();
	if (knob === null) throw new Error("the ring drew no east handle");
	const wrote = page.waitForResponse((response) => response.url().endsWith("/class"));
	await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
	await page.mouse.down();
	// far past the left edge of the element: nothing about the pointer says stop
	await page.mouse.move(knob.x - 90, knob.y + knob.height / 2);
	await expect.poll(inline, { timeout: 15_000 }).not.toBe("");
	const floored = await inline();
	// the drag asked for 11px and got the width the word needs, not one under it
	expect(Number.parseInt(floored, 10)).toBeGreaterThanOrEqual(needed - 1);
	await page.mouse.up();
	await wrote;
	// the file says a width, and it is the one the word needs rather than the
	// eleven pixels the pointer asked for
	await expect.poll(() => /w-\[(\d+(?:\.\d+)?)px\]/.exec(f.bytes())?.[1] ?? null, { timeout: 15_000 }).not.toBeNull();
	const written = Number(/w-\[(\d+(?:\.\d+)?)px\]/.exec(f.bytes())?.[1]);
	expect(written).toBeGreaterThanOrEqual(needed - 1);
});

it("keeps a small element's corners at a zoom that leaves it no room", { timeout: 240_000 }, async () => {
	// zoomed out to 0.4, and wide enough that the frame is still a document:
	// the 100px plate is 40 × 40 on screen, which used to wear nothing at all
	const f = await handCanvas(FILES, PAGE, { w: 1100, h: 700 }, { x: 200, y: 200, k: 0.4 });
	const { page } = f;
	const handles = (name: string) => page.locator(`[data-element-handle="${name}"]`).count();

	await f.select("#plate");
	await expect.poll(() => handles("nw"), { timeout: 20_000 }).toBe(1);
	expect(await handles("se")).toBe(1);
	// 40 on screen: room for a strip along each side, none for a rotate zone
	expect(await handles("n")).toBe(1);
	expect(await page.locator("[data-element-rotate]").count()).toBe(0);
});

it("wears a whole ring in the frame's own corner, and rotates at full size", { timeout: 240_000 }, async () => {
	const f = await handCanvas(FILES, PAGE, { w: 600, h: 420 });
	const { page, frame } = f;
	const handles = (name: string) => page.locator(`[data-element-handle="${name}"]`).count();

	// the same plate at 1.0 wears everything: corners, strips and rotate zones
	await f.select("#plate");
	await expect.poll(() => handles("nw"), { timeout: 20_000 }).toBe(1);
	expect(await handles("n")).toBe(1);
	expect(await page.locator("[data-element-rotate]").count()).toBe(4);

	// the heading sits at the frame's own top-left, and wears its whole ring:
	// the line 2px out on every side, and the corner target beyond that
	await f.select("#brand", { x: 8, y: 10 });
	await expect.poll(() => handles("nw"), { timeout: 20_000 }).toBe(1);
	const ring = await page.locator("[data-element-ring]").first().boundingBox();
	const corner = await page.locator('[data-element-handle="nw"]').boundingBox();
	const box = await page.locator('iframe[title="home"]').boundingBox();
	const own = await frame.locator("#brand").first().boundingBox();
	if (ring === null || corner === null || box === null || own === null) throw new Error("nothing drawn");
	expect(own.x - box.x).toBeLessThan(2);
	// the ring is whole: it starts outside the frame rather than being cut by it
	expect(ring.x).toBeLessThan(box.x);
	expect(ring.y).toBeLessThan(box.y);
	expect(Math.round(ring.width)).toBeGreaterThanOrEqual(Math.round(own.width));
	expect(Math.round(ring.height)).toBeGreaterThanOrEqual(Math.round(own.height));
	// and the corner target is whole rather than half of one
	expect(Math.round(corner.width)).toBe(16);
	expect(Math.round(corner.height)).toBe(16);
});
