import type { FrameLocator, Page } from "playwright-core";
import { expect, it } from "vitest";
import type { SourceResult, UseOutcome } from "../source-edit";
import { originCanvas } from "./hand-origin-browser-helpers";

/** Layout acceptance (#303): the approved controls, the shared owner, the real uses. */
const owner = "shared/card.tsx";
const card =
	'export function Card({label}){return <section data-subject={label} className="flex gap-2 p-6 w-40"><span>{label}</span><span>·</span></section>}';
const frameSource =
	'import {Card} from "shared/card";export default function Frame(){return <main style={{padding:24}}><Card key="a" label="A"/><Card key="b" label="B"/></main>}';
type Canvas = Awaited<ReturnType<typeof originCanvas>>;

function reply(f: Canvas, action: string) {
	return f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === action,
	);
}

function field(f: Canvas, property: string) {
	return f.page.locator(`[data-properties-row="${property}"] input`).first();
}

/** What every use of the shared owner computes for one property. */
async function computed(frame: FrameLocator | Page, property: string) {
	return frame
		.locator("[data-subject]")
		.evaluateAll(
			(elements, name) => elements.map((element) => getComputedStyle(element).getPropertyValue(name)),
			property,
		);
}

async function everyUse(frames: (FrameLocator | Page)[], property: string, value: string) {
	for (const frame of frames)
		await expect.poll(() => computed(frame, property), { timeout: 15_000 }).toEqual([value, value]);
}

async function outcomes(f: Canvas) {
	return f.page.evaluate(() => Reflect.get(window, "originOutcomes")) as Promise<UseOutcome[]>;
}

/** Enter on a field: one commit, one saved file, one settled canvas. */
async function complete(f: Canvas, property: string, expected: string) {
	const committed = reply(f, "commit"),
		delivered = reply(f, "delivered");
	void delivered.catch(() => {});
	await field(f, property).press("Enter");
	const result = (await (await committed).json()) as SourceResult;
	expect(result.ok, JSON.stringify({ result, source: f.bytes()[owner] })).toBe(true);
	await delivered;
	await expect.poll(() => f.bytes()[owner]).toBe(expected);
	await f.settled();
}

async function inverse(f: Canvas, redo: boolean) {
	const response = reply(f, "inverse"),
		delivered = reply(f, "delivered");
	void delivered.catch(() => {});
	await f.history(redo);
	const result = (await (await response).json()) as SourceResult;
	expect(result.ok, JSON.stringify({ result, source: f.bytes()[owner] })).toBe(true);
	await delivered;
	await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
}

it("edits shared padding and a gap axis through the approved fields, and cancels without saving", {
	timeout: 120_000,
}, async () => {
	const f = await originCanvas({ [owner]: card }, frameSource, '[data-subject="A"]', true);
	const second = f.page.frameLocator('iframe[title="second"]');
	const frames = [f.frame, second];
	await everyUse(frames, "padding-left", "24px");

	// a cancelled edit previews on every use and saves nothing
	await f.select();
	await field(f, "padding").fill("10");
	await everyUse(frames, "padding-left", "40px");
	await field(f, "padding").press("Escape");
	await everyUse(frames, "padding-left", "24px");
	expect(f.bytes()[owner]).toBe(card);
	expect(f.writes).toEqual([]);

	// the same edit committed: the owner's own source, and every use with it
	await field(f, "padding").fill("8");
	const padded = card.replace("p-6", "p-8");
	await complete(f, "padding", padded);
	await everyUse(frames, "padding-left", "32px");

	// an independent axis: the gap changes and the padding stays where it was
	await f.select();
	await field(f, "gap").fill("4");
	const gapped = padded.replace("gap-2", "gap-4");
	await complete(f, "gap", gapped);
	await everyUse(frames, "column-gap", "16px");
	await everyUse(frames, "padding-left", "32px");

	// one gesture, one step back: the gap returns and the padding does not move
	await inverse(f, false);
	await expect.poll(() => f.bytes()[owner]).toBe(padded);
	await everyUse(frames, "column-gap", "8px");
	await everyUse(frames, "padding-left", "32px");
	await inverse(f, true);
	await expect.poll(() => f.bytes()[owner]).toBe(gapped);
	await everyUse(frames, "column-gap", "16px");
	expect(f.writes).toEqual(["commit", "commit", "inverse", "inverse"]);
});

it("sets a width mode and adds a constraint without touching the padding or the other axis", {
	timeout: 120_000,
}, async () => {
	const f = await originCanvas({ [owner]: card }, frameSource, '[data-subject="A"]', true);
	const second = f.page.frameLocator('iframe[title="second"]');
	const frames = [f.frame, second];
	await everyUse(frames, "width", "160px");

	// fill is the source's own meaning of the mode, not the box it happens to be
	await f.select();
	const committed = reply(f, "commit");
	await f.page.locator('button[aria-label="width mode"]').first().click();
	await f.page.locator('[data-menu-option="fill"]').first().click();
	expect(((await (await committed).json()) as SourceResult).ok).toBe(true);
	const filled = card.replace("w-40", "w-full");
	await expect.poll(() => f.bytes()[owner]).toBe(filled);
	await f.settled();
	await everyUse(frames, "padding-left", "24px");
	// each use fills its own frame: what was saved is the meaning, not a number
	await expect.poll(() => computed(f.frame, "width")).toEqual(["602px", "602px"]);
	await expect.poll(() => computed(second, "width")).toEqual(["402px", "402px"]);

	// a constraint opens at the box it already has, and only then constrains
	await f.select();
	const added = reply(f, "commit");
	await f.page.locator('button[aria-label="Add property"]').click();
	await f.page.locator('[data-menu-option="max-width"]').first().click();
	expect(((await (await added).json()) as SourceResult).ok).toBe(true);
	await expect.poll(() => f.bytes()[owner]).toContain("max-w-[602px]");
	await f.settled();
	await expect.poll(() => computed(f.frame, "width")).toEqual(["602px", "602px"]);
	await expect.poll(() => computed(second, "width")).toEqual(["402px", "402px"]);

	await f.select();
	await field(f, "max-width").fill("12");
	await complete(f, "max-width", filled.replace("w-full", "w-full max-w-12"));
	await everyUse(frames, "max-width", "48px");
	await everyUse(frames, "width", "48px");
	// the height rule and the padding are the ones nobody asked about
	await everyUse(frames, "padding-left", "24px");
	await expect.poll(() => f.bytes()[owner]).toContain("p-6");
});

it("hides an element through display and shows it again from the selection it kept", { timeout: 120_000 }, async () => {
	const f = await originCanvas({ [owner]: card }, frameSource, '[data-subject="A"]');
	await expect.poll(() => computed(f.frame, "display")).toEqual(["flex", "flex"]);
	await f.select();

	const hidden = reply(f, "commit");
	await f.page.locator('button[aria-label="display"]').first().click();
	await f.page.locator('[data-menu-option="hidden"]').first().click();
	expect(((await (await hidden).json()) as SourceResult).ok).toBe(true);
	await expect.poll(() => f.bytes()[owner]).toBe(card.replace("flex gap-2", "hidden gap-2"));
	await f.settled();
	await expect.poll(() => computed(f.frame, "display")).toEqual(["none", "none"]);

	// the source is still selected, so the same menu is the way back: there is
	// no separate browser of hidden elements to go looking in
	await expect.poll(() => f.page.locator('[data-properties-row="display"]').count()).toBe(1);
	const shown = reply(f, "commit");
	await f.page.locator('button[aria-label="display"]').first().click();
	await f.page.locator('[data-menu-option="flex"]').first().click();
	expect(((await (await shown).json()) as SourceResult).ok).toBe(true);
	await expect.poll(() => f.bytes()[owner]).toBe(card);
	await f.settled();
	await expect.poll(() => computed(f.frame, "display")).toEqual(["flex", "flex"]);

	await inverse(f, false);
	await expect.poll(() => computed(f.frame, "display")).toEqual(["none", "none"]);
	expect(f.writes).toEqual(["commit", "commit", "inverse"]);
	const latest = (await outcomes(f)).at(-1);
	expect.soft(latest, JSON.stringify(latest)).toBeDefined();
});

it("reads project spacing and measures a fixed width at reduced canvas zoom", { timeout: 120_000 }, async () => {
	// this project's own scale: one step is 8px, so `p-1` is 8px and `p-3` is 24px
	const theme = "@theme { --spacing: 8px; }";
	const scaled =
		'import "shared/tokens.css";export function Card({label}){return <section data-subject={label} className="flex justify-end p-1 w-[160px]"><span>{label}</span></section>}';
	const f = await originCanvas({ [owner]: scaled, "shared/tokens.css": theme }, frameSource, '[data-subject="A"]');
	await everyUse([f.frame], "padding-left", "8px");
	// held first, then zoomed out: a picture at 47% is a smaller picture of the
	// same element, and the rail keeps the rung it was already reading
	await f.select();
	const before = await f.target.boundingBox();
	if (!before) throw new Error("missing original bounds");
	await f.page.keyboard.press("ControlOrMeta+-");
	await f.page.keyboard.press("ControlOrMeta+-");
	await expect
		.poll(async () => (await f.target.boundingBox())?.width ?? before.width)
		.toBeLessThan(before.width * 0.9);

	// the canvas is smaller; what the project's scale says is not
	await expect.poll(() => field(f, "padding").inputValue()).toBe("1");
	await expect
		.poll(() => f.page.locator('[data-properties-row="padding"] .type-detail').last().textContent())
		.toBe("8px");
	await field(f, "padding").fill("3");
	await complete(f, "padding", scaled.replace("p-1", "p-3"));
	await everyUse([f.frame], "padding-left", "24px");

	// a fixed width measures the element's own box, never the zoomed picture of it
	const committed = reply(f, "commit");
	await f.page.locator('button[aria-label="width mode"]').first().click();
	await f.page.locator('[data-menu-option="fixed"]').first().click();
	expect(((await (await committed).json()) as SourceResult).ok).toBe(true);
	await expect.poll(() => f.bytes()[owner]).toContain("w-20");
	await f.settled();
	await everyUse([f.frame], "width", "160px");
});
