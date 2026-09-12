import { expect, it } from "vitest";
import { handCanvas } from "./hand-browser-helpers";

/**
 * Several elements held at once (#323).
 *
 * ⇧-click has always added an element to the selection and then led nowhere:
 * ⌫ did nothing and the rail said only how many. Now the whole selection goes
 * as one write and one press of undo, which puts every one of them back and
 * holds them again, and the ring says what the selection is.
 */

const PAGE = `import './list.css';

export default function Work() {
  return <main id="top" className="p-6">
    <h2 id="head">Selected work</h2>
    <ul className="work">
      <li id="one">Material studies</li>
      <li id="two">A softer kind of digital</li>
      <li id="three">Ideas that stay</li>
      <li id="four">Room for the unexpected</li>
    </ul>
  </main>;
}
`;

const CSS = `.work { list-style: none; padding: 0; margin: 0; }
.work li { font-size: 18px; padding: 10px 0; border-bottom: 1px solid #ddd; }
#head { font-size: 24px; margin: 0 0 12px; }
`;

const FILES = { "shared/ui/list.css": CSS };
const PAGE_WITH_CSS = PAGE.replace("'./list.css'", "'../../shared/ui/list.css'");

it("deletes every held element as one write and puts them all back", { timeout: 240_000 }, async () => {
	const f = await handCanvas(FILES, PAGE_WITH_CSS, { w: 700, h: 400 });
	const { page, frame } = f;
	const shift = async (selector: string) => {
		const box = await frame.locator(selector).first().boundingBox();
		if (box === null) throw new Error(`${selector} has no box`);
		await page.keyboard.down("Shift");
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		await page.keyboard.up("Shift");
	};
	const picks = async () => {
		const response = await fetch(`${f.project.url}/api/p/${f.project.name}/selection`, {
			headers: { "X-Spool-Control": f.project.controlToken },
		});
		const body = (await response.json()) as { selection?: unknown[] };
		return (body.selection ?? []).length;
	};
	const items = () => frame.locator("ul.work li").count();

	await f.select("li#one");
	await shift("li#two");
	await shift("li#three");
	await expect.poll(picks, { timeout: 15_000 }).toBe(3);
	// the ring says what several held elements are, and wears no handle
	expect(await page.locator("[data-element-union]").count()).toBe(1);

	// ⌫ takes all three, in the frame and in the file, as one write
	const answered = page.waitForResponse((response) => response.url().endsWith("/element"));
	await page.keyboard.press("Backspace");
	const written = await answered;
	expect(written.status()).toBe(200);
	await expect.poll(items, { timeout: 15_000 }).toBe(1);
	const after = f.bytes();
	expect(after).not.toContain('id="one"');
	expect(after).not.toContain('id="two"');
	expect(after).not.toContain('id="three"');
	expect(after).toContain('id="four"');

	// one press of undo puts all three back, in the file and in the frame, and
	// holds them again
	await f.history();
	await expect.poll(() => f.bytes().includes('id="one"'), { timeout: 15_000 }).toBe(true);
	await expect.poll(items, { timeout: 15_000 }).toBe(4);
	expect(f.bytes()).toBe(PAGE_WITH_CSS);
	await expect.poll(picks, { timeout: 15_000 }).toBe(3);

	// and redo takes them away again, still as one step
	await f.history(true);
	await expect.poll(items, { timeout: 15_000 }).toBe(1);
	expect(f.bytes()).toBe(after);
});
