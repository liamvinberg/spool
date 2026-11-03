import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import { handCanvas } from "./hand-browser.test-helpers";

/**
 * The Knobs section, end to end (#220): a frame's `ui.knobs` calls show under
 * its geometry; a scrub of a knob's name moves the frame live and writes
 * nothing, letting go writes the literal once without reloading the frame,
 * and ⌘Z puts the file and the frame back. A knob declared in a shared file
 * moves every frame rendering it, and Save as variant copies the frame.
 */
const KAFFE = `import { ui } from "spool";

export const kaffe = ui.knobs({ gap: { type: "slider", value: 10, min: 0, max: 40 } });
`;

const TUNED = `import { ui } from "spool";
import { kaffe } from "../../shared/knobs/kaffe";

const k = ui.knobs({ card: { radius: { type: "slider", value: 20, min: 0, max: 40 } } });

export default function Home() {
  return <main><div id="card" style={{ borderRadius: k.card.radius, padding: kaffe.gap, width: 200, height: 120, background: "#c96a3c" }} /></main>;
}
`;

const OTHER = `import { kaffe } from "../../shared/knobs/kaffe";

export default function Other() {
  return <main><div id="card" style={{ padding: kaffe.gap }}>other</div></main>;
}
`;

/** a scrub from a knob's name, held until the caller lets go */
async function scrub(page: Page, path: string, px: number) {
	const name = page.locator(`[data-knob="${path}"] [data-knob-head]`).getByText(path.split(".").at(-1) ?? path, {
		exact: true,
	});
	const box = await name.boundingBox();
	if (!box) throw new Error(`${path} has no name to scrub`);
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + px, box.y + box.height / 2, { steps: 10 });
}

it("tunes a knob live, writes its literal on release, and undoes it", { timeout: 120_000 }, async () => {
	const files = {
		"shared/knobs/kaffe.ts": KAFFE,
		"frames/other/frame.tsx": OTHER,
		"frames/other/frame.json": JSON.stringify({ x: 440, y: 0, w: 400, h: 300 }),
	};
	const { page, frame, bytes, history } = await handCanvas(files, TUNED, { w: 400, h: 300 });
	const other = page.frameLocator('iframe[title="other"]');
	const style = (where: typeof frame, property: "borderTopLeftRadius" | "paddingTop") =>
		where.locator("#card").evaluate((card, key) => getComputedStyle(card)[key], property);
	const mark = (set: boolean) =>
		frame.locator("#card").evaluate((_, on) => {
			const held = window as unknown as { tuned?: true };
			if (on) held.tuned = true;
			return held.tuned === true;
		}, set);
	await expect.poll(() => other.locator("#card").count(), { timeout: 30_000 }).toBe(1);
	await page.locator('[data-frame-label="home"]').click();
	await page.locator('[data-knob="card.radius"]').waitFor({ timeout: 15_000 });
	expect(await style(frame, "borderTopLeftRadius")).toBe("20px");

	await scrub(page, "card.radius", 30);
	await expect.poll(() => style(frame, "borderTopLeftRadius")).not.toBe("20px");
	const tuned = Number.parseInt(await style(frame, "borderTopLeftRadius"), 10);
	await expect.poll(() => page.locator("[data-knobs-status]").textContent()).toContain(`radius 20 → ${tuned}`);
	expect(bytes()).toContain("value: 20,");
	await mark(true);
	await page.mouse.up();
	await expect.poll(() => bytes()).toContain(`value: ${tuned},`);
	await expect
		.poll(() => page.locator("[data-knobs-status]").textContent())
		.toContain(`frame.tsx:4 radius 20 → ${tuned}`);
	// the frame shows what was written already: its own write's echo reloads nothing
	expect(await mark(false)).toBe(true);

	await history();
	await expect.poll(() => bytes()).toContain("value: 20,");
	await expect.poll(() => style(frame, "borderTopLeftRadius")).toBe("20px");

	// one value for every frame that renders the shared file, written there
	await scrub(page, "gap", 30);
	await expect.poll(() => style(other, "paddingTop")).not.toBe("10px");
	const gap = Number.parseInt(await style(other, "paddingTop"), 10);
	expect(await style(frame, "paddingTop")).toBe(`${gap}px`);
	await page.mouse.up();
	await expect.poll(() => bytes("shared/knobs/kaffe.ts")).toContain(`value: ${gap},`);
	// written, and said so: the foot counts the frames it reached
	await expect.poll(() => page.locator("[data-knobs-status]").textContent()).toContain("2 frames");
	await history();
	await expect.poll(() => bytes("shared/knobs/kaffe.ts")).toContain("value: 10,");
	await expect.poll(() => style(other, "paddingTop")).toBe("10px");
	await expect.poll(() => style(frame, "paddingTop")).toBe("10px");

	await page.getByRole("button", { name: "Save as variant" }).click();
	await expect.poll(() => page.locator('[data-frame-label="home--b"]').count()).toBe(1);
	await expect.poll(() => page.locator("[data-properties-rail]").textContent()).toContain("home--b");
});
