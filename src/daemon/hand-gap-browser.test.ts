import type { FrameLocator, Page } from "playwright-core";
import { expect, it } from "vitest";
import type { SourceResult, UseOutcome } from "../source-edit";
import { originCanvas } from "./hand-origin-browser-helpers";

/**
 * Gap acceptance (#306): the band over a real gap, on a real canvas.
 *
 * A person grabs the space between a flex container's children, the running
 * layout follows the pointer in every use of that source, and letting go saves
 * once. The halves no simulated DOM can establish are here: the reflow is the
 * frame's own, the axis comes from the layout the browser actually performed,
 * and a container whose geometry does not identify a gap has to draw nothing
 * while its rail row stays exactly where it was.
 */
const owner = "shared/row.tsx";

/** A flex row with a 16px gap between two boxes, and a counter to prove no remount. */
const rowSource =
	'import {useState} from "react";export function Row({label}){const [count,setCount]=useState(0);return <section data-subject={label} className="flex gap-4"><button className="block h-10 w-20" onClick={()=>setCount(count+1)}>{label}:{count}</button><span className="block h-10 w-20" /></section>}';

const frameSource =
	'import {Row} from "shared/row";export default function Frame(){return <main style={{padding:24}}><Row key="a" label="A"/><Row key="b" label="B"/></main>}';

type Canvas = Awaited<ReturnType<typeof originCanvas>>;

function reply(f: Canvas, action: string) {
	return f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === action,
	);
}

async function saved(f: Canvas, pending: ReturnType<typeof reply>): Promise<SourceResult> {
	const result = (await (await pending).json()) as SourceResult;
	expect(result.ok, JSON.stringify({ result, source: f.bytes()[owner] })).toBe(true);
	return result;
}

async function computed(frame: FrameLocator | Page, property: string) {
	return frame
		.locator("[data-subject]")
		.evaluateAll(
			(elements, name) => elements.map((element) => getComputedStyle(element).getPropertyValue(name)),
			property,
		);
}

async function outcomes(f: Canvas) {
	return f.page.evaluate(() => Reflect.get(window, "originOutcomes")) as Promise<UseOutcome[]>;
}

/** Click each use's own counter, so a remount would show up as a lost count. */
async function count(frame: FrameLocator | Page): Promise<void> {
	await frame.locator("[data-subject] button").first().waitFor();
	await frame.locator("body").evaluate(() => {
		for (const button of document.querySelectorAll("[data-subject] button")) (button as HTMLElement).click();
	});
}

/** Grab the band over one gap and drag it, in the canvas's own space. */
async function dragBand(
	f: Canvas,
	index: number,
	dx: number,
	dy: number,
	options: { release?: boolean } = {},
): Promise<void> {
	await expect.poll(() => f.page.locator(`[data-element-gap="${index}"]`).count(), { timeout: 30_000 }).toBe(1);
	const band = await f.page.locator(`[data-element-gap="${index}"]`).boundingBox();
	if (band === null) throw new Error(`the ring drew no band over gap ${index}`);
	const from = { x: band.x + band.width / 2, y: band.y + band.height / 2 };
	await f.page.mouse.move(from.x, from.y);
	await f.page.mouse.down();
	await f.page.mouse.move(from.x + dx / 2, from.y + dy / 2);
	await f.page.mouse.move(from.x + dx, from.y + dy);
	if (options.release !== false) await f.page.mouse.up();
}

it("drags a horizontal gap through the running layout, saves once and takes one step back", {
	timeout: 120_000,
}, async () => {
	const f = await originCanvas({ [owner]: rowSource }, frameSource, '[data-subject="A"]', true);
	const second = f.page.frameLocator('iframe[title="second"]');
	await expect.poll(() => computed(f.frame, "column-gap")).toEqual(["16px", "16px"]);
	for (const frame of [f.frame, second]) await count(frame);

	await f.select();
	const committed = reply(f, "commit");
	await dragBand(f, 0, 16, 0);
	await saved(f, committed);

	// 16 document pixels on this project's four-pixel scale is four steps along
	// it, and the shorthand folds into the one axis the row's gap actually is
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(rowSource.replace("gap-4", "gap-4 gap-x-8"));
	await f.settled();
	await expect.poll(() => computed(f.frame, "column-gap")).toEqual(["32px", "32px"]);
	await expect.poll(() => computed(second, "column-gap")).toEqual(["32px", "32px"]);
	// the other axis is what the shorthand left it, in both frames
	await expect.poll(() => computed(f.frame, "row-gap")).toEqual(["16px", "16px"]);
	// the uses reflowed where they stood: no reload, so every count is still there
	for (const frame of [f.frame, second])
		expect(await frame.locator("[data-subject] button").allTextContents()).toEqual(["A:1", "B:1"]);
	const settled = (await outcomes(f)).at(-1);
	expect(
		settled?.uses?.map((use) => use.rendered),
		JSON.stringify(settled),
	).toEqual(["verified", "verified"]);

	// one drag is one save and one step back
	const undone = reply(f, "inverse");
	await f.history(false);
	await saved(f, undone);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(rowSource);
	await expect.poll(() => computed(f.frame, "column-gap")).toEqual(["16px", "16px"]);
	const redone = reply(f, "inverse");
	await f.history(true);
	await saved(f, redone);
	await expect.poll(() => computed(f.frame, "column-gap")).toEqual(["32px", "32px"]);
	expect(await f.frame.locator("[data-subject] button").allTextContents()).toEqual(["A:1", "B:1"]);
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it("drags a column's own axis and a right-to-left row's the way each one flows", { timeout: 120_000 }, async () => {
	const stacked = rowSource.replace('className="flex gap-4"', 'className="flex flex-col gap-4"');
	const f = await originCanvas({ [owner]: stacked }, frameSource, '[data-subject="A"]');
	await expect.poll(() => computed(f.frame, "row-gap")).toEqual(["16px", "16px"]);

	await f.select();
	const committed = reply(f, "commit");
	await dragBand(f, 0, 0, 16);
	await saved(f, committed);
	// a column changes its row gap, and the column gap is left as the shorthand set it
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(stacked.replace("gap-4", "gap-4 gap-y-8"));
	await f.settled();
	await expect.poll(() => computed(f.frame, "row-gap")).toEqual(["32px", "32px"]);
	await expect.poll(() => computed(f.frame, "column-gap")).toEqual(["16px", "16px"]);
	expect(f.writes).toEqual(["commit"]);
});

it("makes a reversed right-to-left row's gap bigger by dragging along its flow", { timeout: 120_000 }, async () => {
	// right-to-left and reversed at once: the flow runs left to right again, so
	// the pointer moving right is what makes this gap bigger
	const turned = rowSource.replace('className="flex gap-4"', 'dir="rtl" className="flex flex-row-reverse gap-4"');
	const f = await originCanvas({ [owner]: turned }, frameSource, '[data-subject="A"]');
	await f.select();
	const committed = reply(f, "commit");
	await dragBand(f, 0, 16, 0);
	await saved(f, committed);

	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(turned.replace("gap-4", "gap-4 gap-x-8"));
	await f.settled();
	await expect.poll(() => computed(f.frame, "column-gap")).toEqual(["32px", "32px"]);
	expect(f.writes).toEqual(["commit"]);
});

it("opens the band's own exact value and takes a fraction of a pixel", { timeout: 120_000 }, async () => {
	const f = await originCanvas({ [owner]: rowSource }, frameSource, '[data-subject="A"]');
	await f.select();
	await expect.poll(() => f.page.locator('[data-element-gap="0"]').count(), { timeout: 30_000 }).toBe(1);

	// a press that never became a drag means the value rather than the space
	const band = await f.page.locator('[data-element-gap="0"]').boundingBox();
	if (band === null) throw new Error("the ring drew no band");
	await f.page.mouse.click(band.x + band.width / 2, band.y + band.height / 2);
	await expect.poll(() => f.page.locator("[data-gap-popover]").count(), { timeout: 30_000 }).toBe(1);
	// the popover reads the value the file spells, on this project's own scale
	await expect.poll(() => f.page.locator("[data-gap-popover] input").inputValue()).toBe("4");

	const committed = reply(f, "commit");
	await f.page.locator("[data-gap-popover] input").fill("13.5px");
	await f.page.keyboard.press("Enter");
	await saved(f, committed);

	// an exact fraction stays an exact fraction: no scale reference is invented
	await expect
		.poll(() => f.bytes()[owner], { timeout: 30_000 })
		.toBe(rowSource.replace("gap-4", "gap-4 gap-x-[13.5px]"));
	await f.settled();
	await expect.poll(() => computed(f.frame, "column-gap")).toEqual(["13.5px", "13.5px"]);
	expect(f.writes).toEqual(["commit"]);
});

it("previews every use while the pointer is down and saves nothing when Escape cancels", {
	timeout: 120_000,
}, async () => {
	const f = await originCanvas({ [owner]: rowSource }, frameSource, '[data-subject="A"]', true);
	const second = f.page.frameLocator('iframe[title="second"]');
	await f.select();

	await dragBand(f, 0, 24, 0, { release: false });
	// the running layout followed the pointer, in the other frame's use too
	await expect.poll(() => computed(f.frame, "column-gap"), { timeout: 30_000 }).toEqual(["40px", "40px"]);
	await expect.poll(() => computed(second, "column-gap"), { timeout: 30_000 }).toEqual(["40px", "40px"]);
	expect(f.bytes()[owner]).toBe(rowSource);

	await f.page.keyboard.press("Escape");
	// every preview the gesture owned is put back, and nothing was saved
	await expect.poll(() => computed(f.frame, "column-gap"), { timeout: 30_000 }).toEqual(["16px", "16px"]);
	await expect.poll(() => computed(second, "column-gap"), { timeout: 30_000 }).toEqual(["16px", "16px"]);

	// the release the pointer still owes cannot revive the cancelled gesture
	await f.page.mouse.up();
	await f.page.waitForTimeout(500);
	expect(f.bytes()[owner]).toBe(rowSource);
	expect(f.writes).toEqual([]);
});

it("draws no band on a wrapped or a tiny gap, and keeps the rail's own row", { timeout: 120_000 }, async () => {
	const wrapped = rowSource.replace('className="flex gap-4"', 'className="flex flex-wrap gap-4"');
	const f = await originCanvas({ [owner]: wrapped }, frameSource, '[data-subject="A"]');
	await f.select();
	// the rail lands with the element, and its gap row is the honest route
	await expect.poll(() => f.page.locator('[data-properties-row="gap"]').count(), { timeout: 30_000 }).toBe(1);
	await f.page.waitForTimeout(500);
	expect(await f.page.locator("[data-element-gap]").count()).toBe(0);
});

it("draws no band over a gap too thin to grab", { timeout: 120_000 }, async () => {
	const thin = rowSource.replace('className="flex gap-4"', 'className="flex gap-px"');
	const f = await originCanvas({ [owner]: thin }, frameSource, '[data-subject="A"]');
	await f.select();
	await expect.poll(() => f.page.locator('[data-properties-row="gap"]').count(), { timeout: 30_000 }).toBe(1);
	await f.page.waitForTimeout(500);
	expect(await f.page.locator("[data-element-gap]").count()).toBe(0);
	await expect.poll(() => computed(f.frame, "column-gap")).toEqual(["1px", "1px"]);
});
