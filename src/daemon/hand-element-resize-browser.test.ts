import type { FrameLocator, Page } from "playwright-core";
import { expect, it } from "vitest";
import type { SourceResult, UseOutcome } from "../source-edit";
import { originCanvas } from "./hand-origin-browser-helpers";

/**
 * Resize acceptance (#305): the ring's own gesture, on a real canvas.
 *
 * A person grabs an approved handle, the running layout follows the pointer in
 * every use of that source, and letting go saves once. The two halves no
 * simulated DOM can establish are here: the reflow is the frame's own, and a
 * use whose parent decides its width reports constrained rather than a
 * mismatch.
 */
const owner = "shared/card.tsx";
const card =
	'import {useState} from "react";export function Card({label}){const [count,setCount]=useState(0);return <section data-subject={label} className="w-40 h-24 bg-black/5"><button onClick={()=>setCount(count+1)}>{label}:{count}</button></section>}';
const frameSource =
	'import {Card} from "shared/card";export default function Frame(){return <main style={{padding:24}}><Card key="a" label="A"/><Card key="b" label="B"/></main>}';

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

/** Grab one of the ring's approved targets and drag it, in the canvas's own space. */
async function dragHandle(
	f: Canvas,
	handle: string,
	dx: number,
	dy: number,
	options: { release?: boolean; modifiers?: string[] } = {},
): Promise<void> {
	await expect.poll(() => f.page.locator(`[data-element-handle="${handle}"]`).count(), { timeout: 30_000 }).toBe(1);
	const knob = await f.page.locator(`[data-element-handle="${handle}"]`).boundingBox();
	if (knob === null) throw new Error(`the ring drew no ${handle} target`);
	const from = { x: knob.x + knob.width / 2, y: knob.y + knob.height / 2 };
	for (const key of options.modifiers ?? []) await f.page.keyboard.down(key);
	await f.page.mouse.move(from.x, from.y);
	await f.page.mouse.down();
	await f.page.mouse.move(from.x + dx / 2, from.y + dy / 2);
	await f.page.mouse.move(from.x + dx, from.y + dy);
	if (options.release !== false) await f.page.mouse.up();
	for (const key of options.modifiers ?? []) await f.page.keyboard.up(key);
}

it("drags a corner through the running layout, saves once and takes one step back", {
	timeout: 120_000,
}, async () => {
	const f = await originCanvas({ [owner]: card }, frameSource, '[data-subject="A"]', true);
	const second = f.page.frameLocator('iframe[title="second"]');
	await expect.poll(() => computed(f.frame, "width")).toEqual(["160px", "160px"]);
	for (const frame of [f.frame, second]) await count(frame);

	// the other frame is pushed off the far edge: a use nobody can see still has
	// to move when the source does
	const viewport = f.page.viewportSize();
	const away = await f.page.locator('iframe[title="second"]').boundingBox();
	if (!viewport || !away) throw new Error("the canvas has no viewport");
	await f.page.mouse.move(700, 400);
	await f.page.mouse.wheel(away.x - viewport.width - 16, 0);
	await expect
		.poll(async () => (await f.page.locator('iframe[title="second"]').boundingBox())?.x ?? 0)
		.toBeGreaterThan(viewport.width);

	await f.select();
	const committed = reply(f, "commit");
	await dragHandle(f, "se", 40, 24);
	await saved(f, committed);

	// 160 + 40 is a whole step and 96 + 24 is another, so both land as the bare
	// classes this project's author would have written
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(card.replace("w-40 h-24", "w-50 h-30"));
	await f.settled();
	await expect.poll(() => computed(f.frame, "width")).toEqual(["200px", "200px"]);
	await expect.poll(() => computed(second, "width")).toEqual(["200px", "200px"]);
	await expect.poll(() => computed(f.frame, "height")).toEqual(["120px", "120px"]);
	// the uses reflowed where they stood: no reload, so every count is still there
	for (const frame of [f.frame, second])
		expect(await frame.locator("[data-subject] button").allTextContents()).toEqual(["A:1", "B:1"]);
	const settled = (await outcomes(f)).at(-1);
	expect(settled?.uses?.map((use) => use.rendered), JSON.stringify(settled)).toEqual(["verified", "verified"]);

	// one drag is one save and one step back, though it wrote two properties
	const undone = reply(f, "inverse");
	await f.history(false);
	await saved(f, undone);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(card);
	await expect.poll(() => computed(f.frame, "width")).toEqual(["160px", "160px"]);
	const redone = reply(f, "inverse");
	await f.history(true);
	await saved(f, redone);
	await expect.poll(() => computed(f.frame, "width")).toEqual(["200px", "200px"]);
	// the counters survived both inverses: undo changes the source, not the app
	expect(await f.frame.locator("[data-subject] button").allTextContents()).toEqual(["A:1", "B:1"]);
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it("aligns the initiating use to 200px while the shared uses stay constrained to 120px", {
	timeout: 120_000,
}, async () => {
	// two of the three uses sit in a box narrower than the card asks for, so the
	// flexible box algorithm decides their width instead of the edit
	const constrained =
		'import {Card} from "shared/card";export default function Frame(){return <main style={{padding:24}}><Card key="a" label="A"/><div style={{display:"flex",width:120}}><Card key="b" label="B"/></div><div style={{display:"flex",width:120}}><Card key="c" label="C"/></div></main>}';
	const f = await originCanvas({ [owner]: card }, constrained, '[data-subject="A"]');
	await expect.poll(() => computed(f.frame, "width")).toEqual(["160px", "120px", "120px"]);

	await f.select();
	const committed = reply(f, "commit");
	await dragHandle(f, "e", 40, 0);
	await saved(f, committed);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(card.replace("w-40", "w-50"));
	await f.settled();

	// the source says 200px; two uses cannot be that wide, and each one says which
	await expect.poll(() => computed(f.frame, "width")).toEqual(["200px", "120px", "120px"]);
	const settled = (await outcomes(f)).at(-1);
	expect(settled?.uses?.map((use) => use.rendered), JSON.stringify(settled)).toEqual([
		"verified",
		"constrained",
		"constrained",
	]);
	await expect.poll(() => f.page.locator('[data-hand-notice="constrained"]').count()).toBe(1);
	expect(f.writes).toEqual(["commit"]);
});

it("previews every use while the pointer is down and saves nothing when Escape cancels", {
	timeout: 120_000,
}, async () => {
	const f = await originCanvas({ [owner]: card }, frameSource, '[data-subject="A"]', true);
	const second = f.page.frameLocator('iframe[title="second"]');
	await f.select();

	await dragHandle(f, "e", 60, 0, { release: false });
	// the running layout followed the pointer, in the other frame's use too
	await expect.poll(() => computed(f.frame, "width"), { timeout: 30_000 }).toEqual(["220px", "220px"]);
	await expect.poll(() => computed(second, "width"), { timeout: 30_000 }).toEqual(["220px", "220px"]);
	expect(f.bytes()[owner]).toBe(card);

	await f.page.keyboard.press("Escape");
	// every preview the gesture owned is put back, and nothing was saved
	await expect.poll(() => computed(f.frame, "width"), { timeout: 30_000 }).toEqual(["160px", "160px"]);
	await expect.poll(() => computed(second, "width"), { timeout: 30_000 }).toEqual(["160px", "160px"]);

	// the release the pointer still owes cannot revive the cancelled gesture
	await f.page.mouse.up();
	await f.page.waitForTimeout(500);
	expect(f.bytes()[owner]).toBe(card);
	expect(f.writes).toEqual([]);
});
