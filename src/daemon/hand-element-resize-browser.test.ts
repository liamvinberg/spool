import { rmSync } from "node:fs";
import { join } from "node:path";
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

/**
 * A mark on the document itself, which only a fresh one loses.
 *
 * A lost count says the application's state went; it does not say whether the
 * document went with it. This separates the two, so a failure names the thing
 * that actually happened.
 */
async function mark(frame: FrameLocator | Page): Promise<void> {
	await frame.locator("body").evaluate(() => {
		Reflect.set(window, "sameDocument", true);
	});
}

async function stillTheSameDocument(frame: FrameLocator | Page): Promise<boolean> {
	return frame.locator("body").evaluate(() => Reflect.get(window, "sameDocument") === true);
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
	for (const frame of [f.frame, second]) {
		await count(frame);
		await mark(frame);
	}
	for (const frame of [f.frame, second])
		await expect.poll(() => frame.locator("[data-subject] button").allTextContents()).toEqual(["A:1", "B:1"]);

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
	// classes this project's author would have written. The writer replaces the
	// exact characters each token occupied and leaves every other byte alone, so
	// the space the two tokens were separated by is still there in front of them
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(card.replace("w-40 h-24", " w-50 h-30"));
	await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count(), { timeout: 30_000 }).toBe(0);
	await expect.poll(() => computed(f.frame, "width")).toEqual(["200px", "200px"]);
	await expect.poll(() => computed(second, "width")).toEqual(["200px", "200px"]);
	await expect.poll(() => computed(f.frame, "height")).toEqual(["120px", "120px"]);
	// the use that stayed on screen reflowed where it stood: the same document,
	// so both of its counts are still there. The mark is asserted first, because
	// a lost count on a fresh document is a different fact from a lost count on
	// this one.
	//
	// The frame wheeled off the far edge makes no such promise. The canvas keeps
	// only so many documents live, and one nobody can see is a document it may
	// let go of and build again from the source that was saved — which is why
	// the assertion about that use is the reflow above, not its counters.
	expect(await stillTheSameDocument(f.frame), "the frame the drag was made in reloaded").toBe(true);
	expect(await f.frame.locator("[data-subject] button").allTextContents()).toEqual(["A:1", "B:1"]);
	const settled = (await outcomes(f)).at(-1);
	expect(
		settled?.uses?.map((use) => use.rendered),
		JSON.stringify(settled),
	).toEqual(["verified", "verified"]);

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
	expect(
		settled?.uses?.map((use) => use.rendered),
		JSON.stringify(settled),
	).toEqual(["verified", "constrained", "constrained"]);
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

it("turns an element from the ring's rotate zone and saves it the same way", { timeout: 120_000 }, async () => {
	const f = await originCanvas({ [owner]: card }, frameSource, '[data-subject="A"]');
	await f.select();
	await expect.poll(() => f.page.locator('[data-element-rotate="ne"]').count(), { timeout: 30_000 }).toBe(1);
	const box = await f.target.boundingBox();
	const zone = await f.page.locator('[data-element-rotate="ne"]').boundingBox();
	if (!box || !zone) throw new Error("the ring drew no rotate zone");

	// a quarter turn about the element's own centre, measured from wherever the
	// zone actually sits, and snapped to 15° under shift
	const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	const grab = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
	const from = Math.atan2(grab.y - centre.y, grab.x - centre.x);
	const turnTo = (angle: number) =>
		f.page.mouse.move(centre.x + Math.cos(angle) * 140, centre.y + Math.sin(angle) * 140);
	const committed = reply(f, "commit");
	await f.page.mouse.move(grab.x, grab.y);
	await f.page.mouse.down();
	await f.page.keyboard.down("Shift");
	await turnTo(from + Math.PI / 4);
	await turnTo(from + Math.PI / 2);
	await f.page.mouse.up();
	await f.page.keyboard.up("Shift");
	await saved(f, committed);

	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toContain("rotate-90");
	await f.settled();
	await expect.poll(() => computed(f.frame, "rotate")).toEqual(["90deg", "90deg"]);
	expect(f.writes).toEqual(["commit"]);
});

it("centers an already free element under option, and moves the placement with it", {
	timeout: 120_000,
}, async () => {
	const placed =
		'export function Card({label}){return <section data-subject={label} className="absolute left-8 top-8 w-40 h-24 bg-black/5">{label}</section>}';
	const source =
		'import {Card} from "shared/card";export default function Frame(){return <main style={{position:"relative",padding:24,height:400}}><Card key="a" label="A"/></main>}';
	const f = await originCanvas({ [owner]: placed }, source, '[data-subject="A"]');
	await expect.poll(() => computed(f.frame, "left")).toEqual(["32px"]);

	// ⌥ on an element the file already places: the box grows from its centre,
	// and the placement it already had moves with it
	await f.select();
	const committed = reply(f, "commit");
	await dragHandle(f, "e", 20, 0, { modifiers: ["Alt"] });
	await saved(f, committed);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toContain("w-50");
	expect(f.bytes()[owner]).toContain("left-3");
	await expect.poll(() => computed(f.frame, "width")).toEqual(["200px"]);
	await expect.poll(() => computed(f.frame, "left")).toEqual(["12px"]);
});

it("writes the size alone for an element the layout places, option or not", { timeout: 120_000 }, async () => {
	// nothing here makes a near edge movable, so ⌥ neither doubles the drag nor
	// finds a placement to move: the parent still puts this element where it is
	const flowed = card.replace("data-subject={label}", "data-subject={label} data-flow");
	const f = await originCanvas({ [owner]: flowed }, frameSource, '[data-subject="A"]');
	const before = await f.target.boundingBox();
	await f.select();

	const committed = reply(f, "commit");
	await dragHandle(f, "e", 20, 0, { modifiers: ["Alt"] });
	await saved(f, committed);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(flowed.replace("w-40", "w-45"));
	expect(f.bytes()[owner]).not.toContain("left-");
	expect(f.bytes()[owner]).not.toContain("top-");
	await expect.poll(() => computed(f.frame, "width")).toEqual(["180px", "180px"]);
	const after = await f.target.boundingBox();
	expect(before && after && Math.round(after.x)).toBe(before && Math.round(before.x));
});

it("keeps the proportions the box started with while shift is held", { timeout: 120_000 }, async () => {
	const f = await originCanvas({ [owner]: card }, frameSource, '[data-subject="A"]');
	await f.select();

	// one edge, both axes: 160 to 200 is a fifth wider, so 96 becomes 120
	const committed = reply(f, "commit");
	await dragHandle(f, "e", 40, 0, { modifiers: ["Shift"] });
	await saved(f, committed);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(card.replace("w-40 h-24", " w-50 h-30"));
	await expect.poll(() => computed(f.frame, "width")).toEqual(["200px", "200px"]);
	await expect.poll(() => computed(f.frame, "height")).toEqual(["120px", "120px"]);
});

it("refuses a size the layout decides, and keeps one authored in rem in rem", { timeout: 120_000 }, async () => {
	const filled = card.replace("w-40 h-24", "w-full h-24");
	const f = await originCanvas({ [owner]: filled }, frameSource, '[data-subject="A"]');
	await f.select();

	// `w-full` is an answer about the containing block; a drag has no honest way
	// to say it as a length, so it says so instead of writing pixels
	await dragHandle(f, "e", 40, 0);
	await expect.poll(() => f.page.locator('[data-hand-refusal="authored-unit"]').count(), { timeout: 30_000 }).toBe(1);
	expect(await f.page.locator('[data-hand-refusal="authored-unit"]').textContent()).toBe(
		"w-full is what the layout decides, not a length a drag can move",
	);
	expect(f.bytes()[owner]).toBe(filled);
	expect(f.writes).toEqual([]);
});

it("writes a width authored in rem back in rem", { timeout: 120_000 }, async () => {
	const inRem = card.replace("w-40", "w-[10rem]");
	const f = await originCanvas({ [owner]: inRem }, frameSource, '[data-subject="A"]');
	await expect.poll(() => computed(f.frame, "width")).toEqual(["160px", "160px"]);
	await f.select();

	const committed = reply(f, "commit");
	await dragHandle(f, "e", 40, 0);
	await saved(f, committed);
	// 200px on a 16px root is 12.5rem, and pixels would be a different promise
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(inRem.replace("w-[10rem]", "w-[12.5rem]"));
	await expect.poll(() => computed(f.frame, "width")).toEqual(["200px", "200px"]);
});

/** Every way a drag ends without a save, on the served canvas. */
const INTERRUPTIONS = [
	{
		name: "pointer cancellation",
		interrupt: (f: Canvas) => f.page.locator('[role="application"]').dispatchEvent("pointercancel"),
	},
	{
		name: "lost capture",
		interrupt: (f: Canvas) => f.page.locator('[role="application"]').dispatchEvent("lostpointercapture"),
	},
	{
		name: "a window that loses focus",
		interrupt: (f: Canvas) => f.page.evaluate(() => window.dispatchEvent(new Event("blur"))),
	},
	{ name: "a scrolled canvas", interrupt: (f: Canvas) => f.page.mouse.wheel(0, 120) },
];

it.each(INTERRUPTIONS)(
	"puts every preview back when $name interrupts the drag",
	{
		timeout: 120_000,
	},
	async ({ interrupt }) => {
		const f = await originCanvas({ [owner]: card }, frameSource, '[data-subject="A"]', true);
		const second = f.page.frameLocator('iframe[title="second"]');
		await f.select();

		await dragHandle(f, "e", 60, 0, { release: false });
		await expect.poll(() => computed(f.frame, "width"), { timeout: 30_000 }).toEqual(["220px", "220px"]);
		await expect.poll(() => computed(second, "width"), { timeout: 30_000 }).toEqual(["220px", "220px"]);

		await interrupt(f);
		// every use the gesture previewed is back where the source still says
		await expect.poll(() => computed(f.frame, "width"), { timeout: 30_000 }).toEqual(["160px", "160px"]);
		await expect.poll(() => computed(second, "width"), { timeout: 30_000 }).toEqual(["160px", "160px"]);
		await f.page.mouse.up();
		await f.page.waitForTimeout(500);
		expect(f.bytes()[owner]).toBe(card);
		expect(f.writes).toEqual([]);
	},
);

it("takes a shared edit back after the frame that made it is gone", { timeout: 120_000 }, async () => {
	const f = await originCanvas({ [owner]: card }, frameSource, '[data-subject="A"]', true);
	const second = f.page.frameLocator('iframe[title="second"]');
	await f.select();
	const committed = reply(f, "commit");
	await dragHandle(f, "e", 40, 0);
	await saved(f, committed);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(card.replace("w-40", "w-50"));
	await expect.poll(() => computed(second, "width"), { timeout: 30_000 }).toEqual(["200px", "200px"]);

	// the frame the drag was made in is deleted; the receipt belongs to the
	// source, so the other use can still take the edit back
	rmSync(join(f.project.root, "design", "frames", "home"), { recursive: true, force: true });
	await expect.poll(() => f.page.locator('iframe[title="home"]').count(), { timeout: 30_000 }).toBe(0);

	const undone = reply(f, "inverse");
	await f.history(false);
	await saved(f, undone);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(card);
	await expect.poll(() => computed(second, "width"), { timeout: 30_000 }).toEqual(["160px", "160px"]);
});

it("resizes a rung the keyboard reached, on the project's own scale", { timeout: 120_000 }, async () => {
	// one step is 8px here, so what a drag lands is this project's own class
	const nested =
		'import "shared/tokens.css";export function Card({label}){return <section data-subject={label} className="p-6"><div data-inner className="w-40 h-24 bg-black/10">{label}</div></section>}';
	const f = await originCanvas(
		{ [owner]: nested, "shared/tokens.css": "@theme { --spacing: 8px; }" },
		frameSource,
		'[data-subject="A"]',
	);
	const inner = f.page.frameLocator('iframe[title="home"]').locator("[data-inner]").first();
	// `w-40` on an 8px step is 320px, which is the whole point of asking the theme
	await expect.poll(() => inner.evaluate((element) => getComputedStyle(element).width)).toBe("320px");

	// down the ladder by kinship rather than by pointer (#254), then resize it
	await f.select();
	await f.page.keyboard.press("ControlOrMeta+Enter");
	await expect.poll(() => f.page.locator('[data-element-handle="e"]').count(), { timeout: 30_000 }).toBe(1);

	const committed = reply(f, "commit");
	await dragHandle(f, "e", 40, 0);
	await saved(f, committed);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(nested.replace("w-40", "w-45"));
	await expect.poll(() => inner.evaluate((element) => getComputedStyle(element).width)).toBe("360px");
	// the padding the section wears is nobody else's to change
	expect(f.bytes()[owner]).toContain("p-6");
});
