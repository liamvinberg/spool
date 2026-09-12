import { expect, it } from "vitest";
import { handCanvas, PLAIN_FILES, PLAIN_PAGE } from "./hand-browser-helpers";

/**
 * A utility the hand wrote wins over the project's own stylesheet (#323).
 *
 * The fixture is the shape every plain-CSS project has and neither the veil
 * page nor spool's own design/ had: a class rule in a `.css` file the frame
 * imports, with no `@layer` anywhere near it. An unlayered declaration outranks
 * every layered one whatever its specificity, so a `text-[20px]` the rail
 * wrote — which Tailwind emits inside `@layer utilities` — used to preview
 * correctly and then snap back the moment the file's class landed.
 */

it("lets a rail write beat the project's own stylesheet", { timeout: 240_000 }, async () => {
	const f = await handCanvas(PLAIN_FILES, PLAIN_PAGE, { w: 900, h: 600 });
	const { page, frame } = f;
	const row = (name: string) => page.locator(`[data-properties-row="${name}"]`);
	const field = (name: string) => row(name).locator("input").first();
	const style = (selector: string, property: string) =>
		frame
			.locator(selector)
			.first()
			.evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property);
	const commit = async () => {
		const answered = page.waitForResponse((response) => response.url().endsWith("/class"));
		await page.keyboard.press("Enter");
		await answered;
	};
	const selectRow = async (selector: string, name: string) => {
		await f.select(selector);
		await expect.poll(() => field(name).count(), { timeout: 15_000 }).toBe(1);
	};

	// the project's rule is what the frame draws before anything is touched,
	// preflight's own `* { margin: 0; padding: 0 }` included: the project's
	// layer sits above base and below utilities, not under both
	expect(await style("p.byline", "font-size")).toBe("14px");
	expect(await style("p.byline", "padding-top")).toBe("12px");
	expect(await style("div.art", "margin-left")).toBe("24px");

	// a size typed in the rail previews at once and stays there once the file
	// has it: no snap-back to the stylesheet's 14px
	await selectRow("p.byline", "font-size");
	await field("font-size").fill("20");
	await expect.poll(() => style("p.byline", "font-size")).toBe("20px");
	await commit();
	expect(f.bytes()).toContain('<p className="byline text-[20px]">');
	await expect.poll(() => style("p.byline", "font-size"), { timeout: 15_000 }).toBe("20px");

	// and a length the stylesheet also sets, which is the shape the veil art
	// block refused in
	await selectRow("div.art", "height");
	await field("height").fill("120");
	await commit();
	expect(f.bytes()).toContain('<div className="art h-[120px]"></div>');
	await expect.poll(() => style("div.art", "height"), { timeout: 15_000 }).toBe("120px");

	// a project that writes its own layers keeps them, one level in, and a
	// utility still outranks them
	await selectRow("p.note", "font-size");
	await field("font-size").fill("22");
	await commit();
	expect(f.bytes()).toContain('<p className="note text-[22px]">');
	await expect.poll(() => style("p.note", "font-size"), { timeout: 15_000 }).toBe("22px");
});
