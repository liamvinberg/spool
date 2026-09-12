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
.work li { font-size: 18px; line-height: 26px; padding: 10px 0; border-bottom: 1px solid #ddd; }
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

it("shows what several held elements share, says Mixed, and writes to them all", { timeout: 240_000 }, async () => {
	const f = await handCanvas(FILES, PAGE_WITH_CSS, { w: 700, h: 400 });
	const { page, frame } = f;
	const row = (name: string) => page.locator(`[data-properties-row="${name}"]`);
	const field = (name: string) => row(name).locator("input").first();
	const style = (selector: string, property: string) =>
		frame
			.locator(selector)
			.first()
			.evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property);
	const shift = async (selector: string) => {
		const box = await frame.locator(selector).first().boundingBox();
		if (box === null) throw new Error(`${selector} has no box`);
		await page.keyboard.down("Shift");
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		await page.keyboard.up("Shift");
	};
	const commit = async () => {
		const answered = page.waitForResponse((response) => response.url().endsWith("/class"));
		await page.keyboard.press("Enter");
		await answered;
	};

	// one of them wearing a size of its own is what makes a row disagree
	await f.select("li#one");
	await expect.poll(() => field("font-size").count(), { timeout: 15_000 }).toBe(1);
	await field("font-size").fill("24");
	await commit();
	await expect.poll(() => style("li#one", "font-size"), { timeout: 15_000 }).toBe("24px");

	// two held: a row they share shows the value, and one they do not says Mixed
	await shift("li#two");
	await expect.poll(() => field("font-size").inputValue(), { timeout: 15_000 }).toBe("");
	await expect.poll(() => field("font-size").getAttribute("placeholder")).toBe("Mixed");
	// line-height is the stylesheet's on both of them, so it is not mixed
	expect(await field("line-height").inputValue()).toBe("26");

	// a value typed over a mixed row goes to every element held, as one write
	const before = f.bytes();
	await field("font-size").fill("30");
	await commit();
	await expect.poll(() => style("li#one", "font-size"), { timeout: 15_000 }).toBe("30px");
	await expect.poll(() => style("li#two", "font-size"), { timeout: 15_000 }).toBe("30px");
	const after = f.bytes();
	expect(after).toContain('className="text-[30px]" id="one"');
	expect(after).toContain('className="text-[30px]" id="two"');

	// and one press of undo puts both back
	await f.history();
	await expect.poll(() => f.bytes(), { timeout: 15_000 }).toBe(before);
	await expect.poll(() => style("li#one", "font-size"), { timeout: 15_000 }).toBe("24px");
	await expect.poll(() => style("li#two", "font-size"), { timeout: 15_000 }).toBe("18px");
});
