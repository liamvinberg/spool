import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject } from "../test-helpers";

/** A card on Home says when at rest, and turns to where the project lives under the pointer and on focus. */
it("swaps a card's quiet line for where it lives under the pointer and on keyboard focus", {
	timeout: 120_000,
}, async () => {
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
	await page.goto(project.url);
	const card = page.getByRole("button", { name: `Open ${project.name}`, exact: true });
	await card.waitFor();
	const shown = (which: "when" | "where") =>
		card.locator(`[data-line="${which}"]`).evaluate((node) => getComputedStyle(node).opacity);
	expect(await card.locator('[data-line="where"]').textContent()).toContain(project.root);
	await expect.poll(() => shown("when")).toBe("1");
	expect(await shown("where")).toBe("0");

	await card.hover();
	await expect.poll(() => shown("where")).toBe("1");
	expect(await shown("when")).toBe("0");

	await page.mouse.move(2, 790);
	await expect.poll(() => shown("when")).toBe("1");
	await card.focus();
	await expect.poll(() => shown("where")).toBe("1");
	expect(await shown("when")).toBe("0");
});
