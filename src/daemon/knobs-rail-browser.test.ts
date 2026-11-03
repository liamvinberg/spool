import { expect, it } from "vitest";
import { handCanvas } from "./hand-browser.test-helpers";

/**
 * The Knobs section, end to end (#220): a frame's `ui.knobs` call shows under
 * its geometry, a drag on a row moves the frame live and writes nothing,
 * letting go writes the literal once, and ⌘Z puts the file and the frame back.
 */
const TUNED = `import { ui } from "spool";

const k = ui.knobs({ card: { radius: { type: "slider", value: 20, min: 0, max: 40 } } });

export default function Home() {
  return <main><div id="card" style={{ borderRadius: k.card.radius, width: 200, height: 120, background: "#c96a3c" }} /></main>;
}
`;

it("tunes a knob live, writes its literal on release, and undoes it", { timeout: 120_000 }, async () => {
	const { page, frame, bytes, history } = await handCanvas({}, TUNED);
	const radius = () => frame.locator("#card").evaluate((card) => getComputedStyle(card).borderTopLeftRadius);
	await page.locator('[data-frame-label="home"]').click();
	const row = page.locator('[data-knob="card.radius"] [data-knob-head]');
	await row.waitFor({ timeout: 15_000 });
	expect(await radius()).toBe("20px");

	const box = await row.boundingBox();
	if (!box) throw new Error("the radius row has no box");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	// four pixels a unit: twenty pixels right is five
	await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 5 });
	await expect.poll(radius).toBe("25px");
	await expect.poll(() => page.locator("[data-knobs-status]").textContent()).toContain("radius 20 → 25");
	expect(bytes()).toContain("value: 20,");

	await page.mouse.up();
	await expect.poll(() => bytes()).toContain("value: 25,");
	await expect.poll(() => page.locator("[data-knobs-status]").textContent()).toContain("frame.tsx:3 radius 20 → 25");
	expect(await radius()).toBe("25px");

	await history();
	await expect.poll(() => bytes()).toContain("value: 20,");
	await expect.poll(radius).toBe("20px");
});
