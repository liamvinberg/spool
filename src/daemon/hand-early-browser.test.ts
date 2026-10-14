import { expect, it } from "vitest";
import { handCanvas } from "./hand-browser.test-helpers";

/**
 * A gesture made before the selection's read has landed (DEV-299).
 *
 * Every click reads the element's file, and a write is measured against that
 * read. A person who clicks and presses ⌫ at once is ahead of it; the gesture
 * waits for the read rather than refusing that the file was never read. The
 * read is held back here so the press is surely ahead of it.
 */

const PAGE = `export default function Home() {
  return <main>
    <h1>Kept</h1>
    <p>Gone at once</p>
  </main>;
}
`;

it("deletes straight after a click, before the file's read lands", { timeout: 240_000 }, async () => {
	const f = await handCanvas({}, PAGE);
	const { page, frame } = f;
	let held = 0;
	await page.route("**/rungs", async (route) => {
		held += 1;
		await new Promise((resolve) => setTimeout(resolve, 1200));
		await route.continue();
	});
	await f.select("p");
	await page.keyboard.press("Backspace");
	await expect.poll(() => f.bytes().includes("Gone at once"), { timeout: 15_000 }).toBe(false);
	await expect.poll(() => frame.locator("p").count(), { timeout: 15_000 }).toBe(0);
	expect(await page.locator("[data-hand-refusal]").count()).toBe(0);
	expect(f.bytes()).toContain("<h1>Kept</h1>");
	expect(held).toBeGreaterThan(0);
});

it("saves words typed and committed before the file's read lands", { timeout: 240_000 }, async () => {
	const f = await handCanvas({}, PAGE);
	const { page, frame } = f;
	await page.keyboard.press("e");
	await page.route("**/rungs", async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 2500));
		await route.continue();
	});
	const held = await f.select("h1");
	await page.mouse.click(held.at.x, held.at.y);
	await expect.poll(() => frame.locator("h1").getAttribute("contenteditable")).toBe("plaintext-only");
	await page.keyboard.press("End");
	await page.keyboard.type(" too");
	await page.keyboard.press("Enter");
	await expect.poll(() => f.bytes().includes("<h1>Kept too</h1>"), { timeout: 15_000 }).toBe(true);
	expect(await page.locator("[data-hand-refusal]").count()).toBe(0);
	expect(await frame.locator("h1").textContent()).toBe("Kept too");
});
