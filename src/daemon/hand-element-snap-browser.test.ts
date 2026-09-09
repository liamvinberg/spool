import { writeFileSync } from "node:fs";
import type { FrameLocator, Page } from "playwright-core";
import { expect, it } from "vitest";
import type { SourceResult } from "../source-edit";
import { writeDesignFile } from "../test-helpers";
import { originCanvas } from "./hand-origin-browser-helpers";

/**
 * Resize snapping acceptance (#311), on a real canvas.
 *
 * The half no simulated DOM can establish is the whole of this: the stops are
 * the running layout's own boxes, the correction is written as a class and
 * reflowed by the engine, and the guide is only drawn once the box that came
 * back is measured against the boundary it was chosen for. A stop the layout
 * rounds away, refuses or moves while answering leaves the pointer's own size
 * and no guide at all.
 */
const owner = "shared/card.tsx";
const card =
	'export function Card({label}){return <section data-subject={label} className="w-40 h-24 bg-black/5">{label}</section>}';

/** A card above a sibling whose right edge is a stop the drag can reach. */
const beside = (siblingWidth: number, extra = "") =>
	`import {Card} from "shared/card";export default function Frame(){return <main style={{padding:24,display:"flex",flexDirection:"column",alignItems:"flex-start",gap:16}}>${extra}<Card key="a" label="A"/><div data-sibling style={{width:${siblingWidth},height:40,background:"#0001"}}/></main>}`;

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

async function widths(frame: FrameLocator | Page): Promise<string[]> {
	return frame
		.locator("[data-subject]")
		.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).width));
}

/** Grab one of the ring's targets and drag it, in the canvas's own space. */
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
	// a drag the caller keeps hold of keeps its modifiers too, and lets them go
	// itself: the bypass is read off each move, so releasing it here would be a
	// different gesture from the one the case means
	if (options.release !== false) {
		await f.page.mouse.up();
		for (const key of options.modifiers ?? []) await f.page.keyboard.up(key);
	}
}

const guides = (f: Canvas) => f.page.locator("[data-element-guide]").count();

/** The key the bypass is held with, which is the platform's own. */
const ACCEL = process.platform === "darwin" ? "Meta" : "Control";

it("pulls the dragged edge onto a sibling's and saves the size it drew", { timeout: 120_000 }, async () => {
	// the card is 160 wide beside a 208 sibling, so a drag of 45 asks for 205:
	// three short of the sibling's right edge, and inside the six
	const f = await originCanvas({ [owner]: card }, beside(208), '[data-subject="A"]');
	await expect.poll(() => widths(f.frame)).toEqual(["160px"]);
	await f.select();

	await dragHandle(f, "e", 45, 0, { release: false });
	// the correction is the layout's own: the element really is 208 wide, and
	// the guide says so only because the box that came back was measured
	await expect.poll(() => widths(f.frame), { timeout: 30_000 }).toEqual(["208px"]);
	await expect.poll(() => guides(f), { timeout: 30_000 }).toBe(1);

	const committed = reply(f, "commit");
	await f.page.mouse.up();
	await saved(f, committed);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(card.replace("w-40", "w-52"));
	// the guide belongs to the gesture, and goes with it
	await expect.poll(() => guides(f)).toBe(0);
	await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count(), { timeout: 30_000 }).toBe(0);

	// one gesture, one save, one step back
	const undone = reply(f, "inverse");
	await f.history(false);
	await saved(f, undone);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(card);
	await expect.poll(() => widths(f.frame)).toEqual(["160px"]);
	const redone = reply(f, "inverse");
	await f.history(true);
	await saved(f, redone);
	await expect.poll(() => widths(f.frame)).toEqual(["208px"]);
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it("keeps the size the pointer asked for while the bypass is held", { timeout: 120_000 }, async () => {
	const f = await originCanvas({ [owner]: card }, beside(208), '[data-subject="A"]');
	await f.select();

	// ⌘/Ctrl drops the whole pool: a dense layout has to let a size be anything
	await dragHandle(f, "e", 45, 0, { release: false, modifiers: [ACCEL] });
	await expect.poll(() => widths(f.frame), { timeout: 30_000 }).toEqual(["205px"]);
	expect(await guides(f)).toBe(0);

	const committed = reply(f, "commit");
	await f.page.mouse.up();
	await f.page.keyboard.up(ACCEL);
	await saved(f, committed);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(card.replace("w-40", "w-[205px]"));
});

/** The stop is the same six screen pixels away at every canvas zoom. */
const ZOOMS = [
	{ zoom: 0.5, near: 18.5, far: 17.5, missed: "195px" },
	{ zoom: 1, near: 43, far: 41, missed: "201px" },
	{ zoom: 2, near: 92, far: 88, missed: "204px" },
];

it.each(ZOOMS)(
	"measures the six pixels on the screen at $zoom zoom",
	{ timeout: 120_000 },
	async ({ zoom, near, far, missed }) => {
		// a side under 72 screen pixels wears no strip, so the card this case
		// grabs is square: at half zoom a 96-tall one has no east target at all
		const tall = card.replace("h-24", "h-40");
		const f = await originCanvas({ [owner]: tall }, beside(208), '[data-subject="A"]', false, undefined, undefined, {
			x: 60,
			y: 60,
			k: zoom,
		});
		await f.select();

		await dragHandle(f, "e", near, 0, { release: false });
		await expect.poll(() => widths(f.frame), { timeout: 30_000 }).toEqual(["208px"]);
		expect(await guides(f)).toBe(1);
		await f.page.keyboard.press("Escape");
		await f.page.mouse.up();

		await dragHandle(f, "e", far, 0, { release: false });
		await expect.poll(() => widths(f.frame), { timeout: 30_000 }).toEqual([missed]);
		expect(await guides(f)).toBe(0);
		await f.page.keyboard.press("Escape");
		await f.page.mouse.up();
		expect(f.writes).toEqual([]);
	},
);

/** A card alone in a box that reserves a scrollbar and is scrolled off its top. */
const inside = (width: string) =>
	`import {Card} from "shared/card";export default function Frame(){return <main style={{padding:24}}><div data-parent style={{width:${width},height:180,padding:"10px 12.25px",border:"1px solid #ccc",overflowY:"auto"}}><Card key="a" label="A"/><div style={{height:400}}/></div></main>}`;

/**
 * How far the card's right edge is from the parent's content edge, derived from
 * the parent's own client box rather than from the reading the canvas takes, so
 * the two are independent statements about the same boundary.
 */
function shortOfContent(f: Canvas) {
	return f.frame.locator("[data-parent]").evaluate((parent) => {
		const style = getComputedStyle(parent);
		const held = parent.querySelector("[data-subject]");
		// this browser draws overlay scrollbars, so nothing is reserved beside the
		// padding; the edge is the border box less its own border and padding
		const edge =
			parent.getBoundingClientRect().right -
			Number.parseFloat(style.borderRightWidth) -
			Number.parseFloat(style.paddingRight);
		return edge - (held?.getBoundingClientRect().right ?? 0);
	});
}

it("aligns to the content edge of the scrolled box it sits in", { timeout: 120_000 }, async () => {
	// fractional padding puts every edge in this box off the pixel grid, and a
	// real scrollbar is reserved out of the content the card is measured against
	const f = await originCanvas({ [owner]: card }, inside('"300px"'), '[data-subject="A"]');
	await f.frame.locator("[data-parent]").evaluate((parent) => {
		// the box keeps its fractional outside and is nudged until the inside of
		// it lands on a whole pixel, which is where a whole-pixel drag can reach
		const style = getComputedStyle(parent);
		const width = parent.getBoundingClientRect().width;
		const content =
			width -
			Number.parseFloat(style.borderLeftWidth) -
			Number.parseFloat(style.borderRightWidth) -
			Number.parseFloat(style.paddingLeft) -
			Number.parseFloat(style.paddingRight);
		parent.style.width = `${width + (Math.ceil(content) - content)}px`;
		parent.scrollTop = 24;
	});
	// the padding puts the card's own edges off the pixel grid
	const left = await f.frame.locator('[data-subject="A"]').evaluate((element) => element.getBoundingClientRect().left);
	expect(Number.isInteger(left)).toBe(false);
	const gap = await shortOfContent(f);

	await f.select();
	const scrolled = await f.frame.locator("[data-parent]").evaluate((parent) => parent.scrollTop);
	expect(scrolled).toBeGreaterThan(0);
	// three pixels short of the content edge, which is inside the six
	await dragHandle(f, "e", gap - 3, 0, { release: false });
	await expect.poll(() => guides(f), { timeout: 30_000 }).toBe(1);
	expect(Math.abs(await shortOfContent(f))).toBeLessThan(0.05);
	// the box was read where it stands, and the drag left it standing there
	expect(await f.frame.locator("[data-parent]").evaluate((parent) => parent.scrollTop)).toBe(scrolled);

	await f.page.keyboard.press("Escape");
	await f.page.mouse.up();
	expect(f.writes).toEqual([]);
});

it("leaves a fractional stop a whole-pixel drag cannot land on", { timeout: 120_000 }, async () => {
	// the same box, sized as a fraction of the frame: its content edge is not on
	// a whole pixel, and a width written in whole pixels never lands there. The
	// size the pointer asked for stands, with nothing drawn over it
	const f = await originCanvas({ [owner]: card }, inside('"50.3%"'), '[data-subject="A"]');
	const gap = await shortOfContent(f);
	expect(Number.isInteger(gap)).toBe(false);

	await f.select();
	await dragHandle(f, "e", gap - 3, 0, { release: false });
	await expect.poll(() => widths(f.frame), { timeout: 30_000 }).not.toEqual(["160px"]);
	expect(await guides(f)).toBe(0);
	expect(Math.abs((await shortOfContent(f)) - 3)).toBeLessThan(0.6);

	await f.page.keyboard.press("Escape");
	await f.page.mouse.up();
	expect(f.writes).toEqual([]);
});

/** One element's box, in its own document's coordinates. */
async function edgesOf(f: Canvas, selector: string) {
	return f.frame
		.locator(selector)
		.first()
		.evaluate((element) => {
			const rect = element.getBoundingClientRect();
			return {
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom,
				w: rect.width,
				h: rect.height,
			};
		});
}

/** A card above a sibling the layout will not move when the card grows. */
const pinned =
	'import {Card} from "shared/card";export default function Frame(){return <main style={{padding:24,position:"relative",height:400}}><Card key="a" label="A"/><div data-sibling style={{position:"absolute",left:24,top:160,width:208,height:40}}/></main>}';

it("corrects both axes of a corner, each on its own stop", { timeout: 120_000 }, async () => {
	const f = await originCanvas({ [owner]: card }, pinned, '[data-subject="A"]');
	const stop = await edgesOf(f, "[data-sibling]");
	const held = await edgesOf(f, '[data-subject="A"]');
	await f.select();

	// three short of the sibling's right edge across, and of its top edge down
	await dragHandle(f, "se", stop.right - held.right - 3, stop.top - held.bottom - 3, { release: false });
	await expect.poll(() => guides(f), { timeout: 30_000 }).toBe(2);
	const landed = await edgesOf(f, '[data-subject="A"]');
	expect(Math.abs(landed.right - stop.right)).toBeLessThan(0.05);
	expect(Math.abs(landed.bottom - stop.top)).toBeLessThan(0.05);

	await f.page.keyboard.press("Escape");
	await f.page.mouse.up();
	expect(f.writes).toEqual([]);
});

it("keeps the proportions ⇧ holds while one axis takes the stop", { timeout: 120_000 }, async () => {
	const f = await originCanvas({ [owner]: card }, pinned, '[data-subject="A"]');
	const stop = await edgesOf(f, "[data-sibling]");
	const held = await edgesOf(f, '[data-subject="A"]');
	await f.select();

	await dragHandle(f, "e", stop.right - held.right - 3, 0, { release: false, modifiers: ["Shift"] });
	await expect.poll(() => guides(f), { timeout: 30_000 }).toBe(1);
	const landed = await edgesOf(f, '[data-subject="A"]');
	expect(Math.abs(landed.right - stop.right)).toBeLessThan(0.05);
	// 5:3 to start with, and the height is what that shape then makes it
	expect(Math.abs(landed.h - Math.round((landed.w * held.h) / held.w))).toBeLessThan(0.05);

	await f.page.keyboard.press("Escape");
	await f.page.mouse.up();
});

it("leaves a near edge the layout owns to the layout", { timeout: 120_000 }, async () => {
	const f = await originCanvas({ [owner]: card }, beside(208), '[data-subject="A"]');
	await f.select();

	// the sibling's left edge is exactly where this drag's west edge already is,
	// and no width the card writes can move it: the parent decides that corner
	await dragHandle(f, "w", -45, 0, { release: false });
	await expect.poll(() => widths(f.frame), { timeout: 30_000 }).toEqual(["205px"]);
	expect(await guides(f)).toBe(0);
	await f.page.keyboard.press("Escape");
	await f.page.mouse.up();
});

it("draws no guide over a size the element's own maximum refuses", { timeout: 120_000 }, async () => {
	const capped = card.replace("w-40 h-24", "w-40 h-24 max-w-[206px]");
	const f = await originCanvas({ [owner]: capped }, beside(208), '[data-subject="A"]');
	await f.select();

	// the stop is at 208 and the element cannot be wider than 206, so there is
	// no alignment to draw and the pointer's own size stands
	await dragHandle(f, "e", 45, 0, { release: false });
	await expect.poll(() => widths(f.frame), { timeout: 30_000 }).toEqual(["205px"]);
	expect(await guides(f)).toBe(0);
	await f.page.keyboard.press("Escape");
	await f.page.mouse.up();
});

it("keeps no guide over a target the correction itself moved", { timeout: 120_000 }, async () => {
	// the sibling sits four pixels along the same row, so every pixel the card
	// takes takes the stop with it: an alignment that runs away from the box
	// that landed is not one, and the size the pointer asked for stands
	const chasing =
		'import {Card} from "shared/card";export default function Frame(){return <main style={{padding:24,display:"flex",flexWrap:"wrap",width:400,gap:4,alignItems:"flex-start"}}><Card key="a" label="A"/><div data-sibling style={{width:190,height:40}}/></main>}';
	const f = await originCanvas({ [owner]: card }, chasing, '[data-subject="A"]');
	await f.select();

	await dragHandle(f, "e", 45, 0, { release: false });
	await expect.poll(() => widths(f.frame), { timeout: 30_000 }).toEqual(["205px"]);
	expect(await guides(f)).toBe(0);
	await f.page.keyboard.press("Escape");
	await f.page.mouse.up();
	expect(f.writes).toEqual([]);
});

/** Geometry this path refuses rather than guessing an inverse for. */
const REFUSED = [
	{
		name: "a rotated sibling",
		frame: beside(208).replace("height:40,", 'height:40,transform:"rotate(4deg)",'),
	},
	{
		name: "a turned ancestor",
		frame: beside(208).replace("padding:24,", 'padding:24,rotate:"4deg",'),
	},
	{
		name: "a skewed ancestor",
		frame: beside(208).replace("padding:24,", 'padding:24,transform:"skewX(4deg)",'),
	},
];

it.each(REFUSED)("takes no alignment from $name", { timeout: 120_000 }, async ({ frame }) => {
	const f = await originCanvas({ [owner]: card }, frame, '[data-subject="A"]');
	await f.select();

	// the stop is right there and nothing takes it: no guide, and no size that
	// landed on it. A turned box is not the box it is drawn as, so the drag's
	// own reading of it is distorted too, which is exactly why this refuses
	await dragHandle(f, "e", 45, 0, { release: false });
	await expect.poll(() => f.page.locator("[data-element-readout]").count(), { timeout: 30_000 }).toBe(1);
	expect(await widths(f.frame)).not.toEqual(["208px"]);
	expect(await guides(f)).toBe(0);
	await f.page.keyboard.press("Escape");
	await f.page.mouse.up();
	expect(f.writes).toEqual([]);
});

/** The card the shared case uses, whose every use carries its own field. */
const carded =
	'export function Card({label}){return <section data-subject={label} className="w-40 h-24 bg-black/5">{label}<input data-input style={{width:24}} defaultValue=""/></section>}';

/** One use aligned by hand, two the layout will not let follow it. */
const constrained =
	'import {Card} from "shared/card";export default function Frame(){return <main style={{padding:24}}><Card key="a" label="A"/><div data-sibling style={{width:200,height:20}}/><div style={{display:"flex",width:120}}><Card key="b" label="B"/></div><div style={{display:"flex",width:120}}><Card key="c" label="C"/></div></main>}';

async function outcomes(f: Canvas) {
	return f.page.evaluate(() => Reflect.get(window, "originOutcomes")) as Promise<{ uses?: { rendered: string }[] }[]>;
}

/** What the field in the third use holds, and where its caret is. */
function typing(f: Canvas) {
	return f.frame.locator('[data-subject="C"] input').evaluate((element) => {
		const field = element as HTMLInputElement;
		return { value: field.value, caret: field.selectionStart, focused: document.activeElement === field };
	});
}

it("aligns the initiating use to 200 while the shared uses stay at 120", { timeout: 120_000 }, async () => {
	const f = await originCanvas({ [owner]: carded }, constrained, '[data-subject="A"]');
	await expect.poll(() => widths(f.frame)).toEqual(["160px", "120px", "120px"]);

	// unrelated typing in a use nobody is dragging, caret left where it was put
	await f.frame.locator('[data-subject="C"] input').evaluate((element) => {
		const field = element as HTMLInputElement;
		field.focus();
		field.value = "kept";
		field.setSelectionRange(2, 2);
	});
	expect(await typing(f)).toEqual({ value: "kept", caret: 2, focused: true });

	const stop = await edgesOf(f, "[data-sibling]");
	const held = await edgesOf(f, '[data-subject="A"]');
	await f.select();
	await dragHandle(f, "e", stop.right - held.right - 3, 0, { release: false });
	await expect.poll(() => widths(f.frame), { timeout: 30_000 }).toEqual(["200px", "120px", "120px"]);
	expect(await guides(f)).toBe(1);

	const committed = reply(f, "commit");
	await f.page.mouse.up();
	await saved(f, committed);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(carded.replace("w-40", "w-50"));
	await f.settled();

	// the source says 200; two uses cannot be that wide, and each one says so.
	// the guide was about the use that was dragged, not about the declaration
	await expect.poll(() => widths(f.frame)).toEqual(["200px", "120px", "120px"]);
	const settled = (await outcomes(f)).at(-1);
	expect(
		settled?.uses?.map((use) => use.rendered),
		JSON.stringify(settled),
	).toEqual(["verified", "constrained", "constrained"]);
	expect(f.writes).toEqual(["commit"]);
	// the field in the third use kept its words and its caret across the save
	// that changed the source it is rendered from. The focus ring is the
	// canvas's now, because holding an element and dragging it is a click out here
	expect(await typing(f)).toMatchObject({ value: "kept", caret: 2 });

	// a frame that opens after the save reads the aligned size from the source
	writeDesignFile(f.project.root, "frames/cold/frame.tsx", constrained);
	writeDesignFile(f.project.root, "frames/cold/frame.json", '{"x":0,"y":600,"w":650,"h":500}');
	await expect.poll(() => f.page.locator('iframe[title="cold"]').count(), { timeout: 30_000 }).toBe(1);
	const cold = f.page.frameLocator('iframe[title="cold"]');
	await expect.poll(() => widths(cold), { timeout: 30_000 }).toEqual(["200px", "120px", "120px"]);

	// the inverse is the source's, and the typing in the other use is nobody's
	const undone = reply(f, "inverse");
	await f.history(false);
	await saved(f, undone);
	await expect.poll(() => widths(f.frame), { timeout: 30_000 }).toEqual(["160px", "120px", "120px"]);
	// the words and the caret are the use's own through the inverse; the focus
	// ring moved because taking it back is a click and a chord on the canvas
	expect(await typing(f)).toMatchObject({ value: "kept", caret: 2 });
	const redone = reply(f, "inverse");
	await f.history(true);
	await saved(f, redone);
	await expect.poll(() => widths(f.frame), { timeout: 30_000 }).toEqual(["200px", "120px", "120px"]);
	expect(await typing(f)).toMatchObject({ value: "kept", caret: 2 });
});

/** Every way a snapped drag ends without a save. */
const INTERRUPTIONS = [
	{ name: "Escape", interrupt: (f: Canvas) => f.page.keyboard.press("Escape") },
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
	"puts the snapped preview back and saves nothing when $name interrupts",
	{ timeout: 120_000 },
	async ({ interrupt }) => {
		const f = await originCanvas({ [owner]: card }, beside(208), '[data-subject="A"]', true);
		const second = f.page.frameLocator('iframe[title="second"]');
		await f.select();

		await dragHandle(f, "e", 45, 0, { release: false });
		await expect.poll(() => widths(f.frame), { timeout: 30_000 }).toEqual(["208px"]);
		await expect.poll(() => widths(second), { timeout: 30_000 }).toEqual(["208px"]);
		await expect.poll(() => guides(f), { timeout: 30_000 }).toBe(1);

		await interrupt(f);
		// every use the gesture previewed is back, and the guide with it
		await expect.poll(() => widths(f.frame), { timeout: 30_000 }).toEqual(["160px"]);
		await expect.poll(() => widths(second), { timeout: 30_000 }).toEqual(["160px"]);
		await expect.poll(() => guides(f)).toBe(0);
		await f.page.mouse.up();
		await f.page.waitForTimeout(500);
		expect(f.bytes()[owner]).toBe(card);
		expect(f.writes).toEqual([]);
	},
);

it("refuses the old inverse after a competing edit to the same source", { timeout: 120_000 }, async () => {
	const f = await originCanvas({ [owner]: card }, beside(208), '[data-subject="A"]');
	await f.select();
	const committed = reply(f, "commit");
	await dragHandle(f, "e", 45, 0, { release: false });
	await expect.poll(() => widths(f.frame), { timeout: 30_000 }).toEqual(["208px"]);
	await f.page.mouse.up();
	await saved(f, committed);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(card.replace("w-40", "w-52"));

	// somebody else writes the same declaration; the receipt is about bytes that
	// are no longer there, so taking it back is refused rather than guessed at
	await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count(), { timeout: 30_000 }).toBe(0);
	writeFileSync(f.file(owner), card.replace("w-40", "w-64"), "utf8");

	const refused = reply(f, "inverse");
	await f.history(false);
	const result = (await (await refused).json()) as SourceResult;
	expect(result.ok).toBe(false);
	expect(f.bytes()[owner]).toBe(card.replace("w-40", "w-64"));
});
