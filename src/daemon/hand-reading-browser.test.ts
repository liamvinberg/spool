import { expect, it } from "vitest";
import { handCanvas, PLAIN_FILES, PLAIN_PAGE } from "./hand-browser-helpers";

/**
 * Every rail row reads what the frame draws (#323).
 *
 * The rail has two sources and never a stylesheet scan: the class literal
 * parsed at the stamp, and the frame's own answer for the element picked. Width
 * and height were the only rows that ever had the second one, so on a project
 * styled by plain CSS classes every typography and appearance row read as an
 * empty field beside a unit it never had.
 */

it("fills every row from the frame where the literal says nothing", { timeout: 240_000 }, async () => {
	const f = await handCanvas(PLAIN_FILES, PLAIN_PAGE, { w: 900, h: 600 });
	const { page } = f;
	const row = (name: string) => page.locator(`[data-properties-row="${name}"]`);
	const field = (name: string) => row(name).locator("input").first();
	const says = (name: string) => row(name).innerText();

	await f.select("p.byline");
	await expect.poll(() => field("font-size").count(), { timeout: 15_000 }).toBe(1);

	// the class literal is `byline` and nothing else, so every one of these is
	// the frame's own answer
	expect(await field("font-size").inputValue()).toBe("14");
	expect(await field("line-height").inputValue()).toBe("26");
	expect(await field("border-radius").inputValue()).toBe("6");
	await expect.poll(() => says("width")).toContain("px");
	await expect.poll(() => says("padding")).toContain("12px");
	await expect.poll(() => says("opacity")).toContain("50%");
	// the colour row wears the paint the stylesheet set rather than an empty swatch
	await expect
		.poll(() =>
			row("color")
				.locator(".ep-swatch")
				.evaluate((el) => getComputedStyle(el).backgroundColor),
		)
		.toBe("rgb(51, 51, 51)");
	// the unit is the one the frame reports, and the field is not the empty
	// state it used to be: a unit with no number beside it
	expect(await says("font-size")).toContain("px");

	// a token in the literal still wins the field, with the frame's value beside it
	const answered = page.waitForResponse((response) => response.url().endsWith("/class"));
	await field("font-size").fill("20");
	await page.keyboard.press("Enter");
	await answered;
	await expect.poll(() => f.bytes().includes('className="byline text-[20px]"'), { timeout: 15_000 }).toBe(true);
	await expect.poll(() => field("font-size").inputValue(), { timeout: 15_000 }).toBe("20");
});
