import type { FrameLocator, Page } from "playwright-core";
import { expect, it } from "vitest";
import type { SourceResult, UseOutcome } from "../source-edit";
import { originCanvas } from "./hand-origin-browser-helpers";

/** Layout acceptance (#303): the approved controls, the shared owner, the real uses. */
const owner = "shared/card.tsx";
const card =
	'import {useState} from "react";export function Card({label}){const [count,setCount]=useState(0);return <section data-subject={label} className="flex gap-2 p-6 w-40"><button onClick={()=>setCount(count+1)}>{label}:{count}</button><span>·</span></section>}';
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

/** Click each use's own counter, so a remount would be visible as a lost count. */
async function counted(frame: FrameLocator | Page): Promise<string[]> {
	return frame.locator("[data-subject] button").allTextContents();
}

async function count(frame: FrameLocator | Page): Promise<void> {
	// through the document rather than the canvas: a real click inside a frame
	// is a selection, and this is about the state the use is already holding
	await frame.locator("[data-subject] button").first().waitFor();
	await frame.locator("body").evaluate(() => {
		for (const button of document.querySelectorAll("[data-subject] button")) (button as HTMLElement).click();
	});
}

async function outcomes(f: Canvas) {
	return f.page.evaluate(() => Reflect.get(window, "originOutcomes")) as Promise<UseOutcome[]>;
}

/** One source answer, checked the same way wherever a gesture makes one. */
async function saved(f: Canvas, pending: ReturnType<typeof reply>): Promise<SourceResult> {
	const result = (await (await pending).json()) as SourceResult;
	expect(result.ok, JSON.stringify({ result, source: f.bytes()[owner] })).toBe(true);
	return result;
}

/** A menu in the rail, and the option this gesture chooses from it. */
async function choose(f: Canvas, label: string, option: string): Promise<SourceResult> {
	const committed = reply(f, "commit");
	await f.page.locator(`button[aria-label="${label}"]`).first().click();
	await f.page.locator(`[data-menu-option="${option}"]`).first().click();
	return saved(f, committed);
}

/** Enter on a field: one commit, one saved file, one settled canvas. */
/**
 * Enter on a field: one commit, one saved file, one settled canvas.
 *
 * `mounted` is how many uses can answer with an installation. It is every use
 * by default, and fewer only where the case has deliberately taken a frame off
 * screen: the canvas keeps a bounded number of documents live, so a use nobody
 * can see may have no document at all to install into, and waiting for its
 * reply is waiting for something that is not coming.
 */
async function complete(f: Canvas, property: string, expected: string, mounted = true) {
	const committed = reply(f, "commit"),
		delivered = reply(f, "delivered");
	void delivered.catch(() => {});
	await field(f, property).press("Enter");
	await saved(f, committed);
	await delivered;
	await expect.poll(() => f.bytes()[owner]).toBe(expected);
	if (mounted) await f.settled();
	else await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count(), { timeout: 15_000 }).toBe(0);
}

async function inverse(f: Canvas, redo: boolean) {
	const response = reply(f, "inverse"),
		delivered = reply(f, "delivered");
	void delivered.catch(() => {});
	await f.history(redo);
	await saved(f, response);
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
	for (const frame of frames) await count(frame);

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
	// both uses took the save into the document they were already running
	const settled = (await outcomes(f)).at(-1);
	expect(
		settled?.uses?.map((use) => use.installation),
		JSON.stringify(settled),
	).toEqual(["installed", "installed"]);
	// every use is measured, not merely delivered: the frame really laid the padding out
	expect(
		settled?.uses?.map((use) => use.rendered),
		JSON.stringify(settled),
	).toEqual(["verified", "verified"]);
	await everyUse(frames, "padding-left", "32px");
	// the uses reflowed where they stood: no reload, so every count is still there
	for (const frame of frames) expect(await counted(frame)).toEqual(["A:1", "B:1"]);

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
	await choose(f, "width mode", "fill");
	const filled = card.replace("w-40", "w-full");
	await expect.poll(() => f.bytes()[owner]).toBe(filled);
	await f.settled();
	await everyUse(frames, "padding-left", "24px");
	// each use fills its own frame: what was saved is the meaning, not a number
	await expect.poll(() => computed(f.frame, "width")).toEqual(["602px", "602px"]);
	await expect.poll(() => computed(second, "width")).toEqual(["402px", "402px"]);

	// a constraint opens at the box it already has, and only then constrains
	await f.select();
	await choose(f, "Add property", "max-width");
	// added at the constraint's own initial value: nothing moves in either use
	await expect.poll(() => f.bytes()[owner]).toBe(filled.replace("w-full", "w-full max-w-none"));
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

	await choose(f, "display", "hidden");
	await expect.poll(() => f.bytes()[owner]).toBe(card.replace("flex gap-2", "hidden gap-2"));
	await f.settled();
	await expect.poll(() => computed(f.frame, "display")).toEqual(["none", "none"]);

	// the source is still selected, so the same menu is the way back: there is
	// no separate browser of hidden elements to go looking in
	await expect.poll(() => f.page.locator('[data-properties-row="display"]').count()).toBe(1);
	await choose(f, "display", "flex");
	await expect.poll(() => f.bytes()[owner]).toBe(card);
	await f.settled();
	await expect.poll(() => computed(f.frame, "display")).toEqual(["flex", "flex"]);

	await inverse(f, false);
	await expect.poll(() => computed(f.frame, "display")).toEqual(["none", "none"]);
	expect(f.writes).toEqual(["commit", "commit", "inverse"]);
	const latest = (await outcomes(f)).at(-1);
	expect(latest, JSON.stringify(latest)).toMatchObject({ rendered: "verified" });
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
	await choose(f, "width mode", "fixed");
	await expect.poll(() => f.bytes()[owner]).toContain("w-20");
	await f.settled();
	await everyUse([f.frame], "width", "160px");
});

it("changes both alignment properties as one save, and takes them back as one", { timeout: 120_000 }, async () => {
	const aligned = card.replace("flex gap-2", "flex items-start justify-start gap-2");
	const f = await originCanvas({ [owner]: aligned }, frameSource, '[data-subject="A"]', true);
	const second = f.page.frameLocator('iframe[title="second"]');
	const frames = [f.frame, second];
	await everyUse(frames, "align-items", "flex-start");

	await f.select();
	const committed = reply(f, "commit");
	await f.page.locator('button[title="items-center justify-end"]').first().click();
	await saved(f, committed);
	// the writer replaces the exact characters those two tokens occupied and
	// leaves every other byte where it was, including the space between them
	const placed = aligned.replace("flex items-start justify-start", "flex  items-center justify-end");
	await expect.poll(() => f.bytes()[owner]).toBe(placed);
	await f.settled();
	await everyUse(frames, "align-items", "center");
	await everyUse(frames, "justify-content", "flex-end");

	// the direction is its own control and its own save
	await f.select();
	await f.page.locator('[data-properties-row="flex-direction"] button').nth(1).click();
	await expect.poll(() => f.bytes()[owner]).toContain("flex-col");
	await f.settled();
	await everyUse(frames, "flex-direction", "column");

	// one gesture, one step back, both properties together
	await inverse(f, false);
	await expect.poll(() => f.bytes()[owner]).toBe(placed);
	await everyUse(frames, "flex-direction", "row");
	await inverse(f, false);
	await expect.poll(() => f.bytes()[owner]).toBe(aligned);
	await everyUse(frames, "align-items", "flex-start");
	await everyUse(frames, "justify-content", "flex-start");
	expect(f.writes).toEqual(["commit", "commit", "inverse", "inverse"]);
});

it("reflows a use that is off screen and mounts a cold frame from the saved source", {
	timeout: 120_000,
}, async () => {
	const f = await originCanvas(
		{ [owner]: card, "frames/cold-page/cold/frame.tsx": frameSource },
		frameSource,
		'[data-subject="A"]',
		true,
	);
	const second = f.page.frameLocator('iframe[title="second"]');
	await expect.poll(() => computed(second, "padding-left")).toEqual(["24px", "24px"]);
	expect(await f.page.locator('iframe[title="cold"]').count()).toBe(0);

	// the second frame is mounted and then pushed off the far edge of the
	// viewport, while the frame being edited stays where it can be held: it is a
	// use nobody can see, and it still has to move when the source does
	const viewport = f.page.viewportSize();
	const away = await f.page.locator('iframe[title="second"]').boundingBox();
	if (!viewport || !away) throw new Error("the canvas has no viewport");
	await f.page.mouse.move(700, 400);
	// exactly far enough to put the other frame past the near edge of the screen
	await f.page.mouse.wheel(away.x - viewport.width - 16, 0);
	await expect
		.poll(async () => (await f.page.locator('iframe[title="second"]').boundingBox())?.x ?? 0)
		.toBeGreaterThan(viewport.width);
	const home = await f.page.locator('iframe[title="home"]').boundingBox();
	expect(home && home.x >= 0 && home.x + home.width <= viewport.width, JSON.stringify(home)).toBe(true);

	await f.select();
	await field(f, "padding").fill("8");
	const padded = card.replace("p-6", "p-8");
	// the frame off the far edge may have no live document to install into, so
	// its installation reply is not a signal to wait on. What it has to prove is
	// the line below: asked for again, the use it holds is on the saved source
	await complete(f, "padding", padded, false);
	await expect.poll(() => computed(second, "padding-left"), { timeout: 30_000 }).toEqual(["32px", "32px"]);
	await expect.poll(() => computed(f.frame, "padding-left")).toEqual(["32px", "32px"]);

	// the cold frame was never mounted while the edit was made; it opens on the
	// source that was saved, not on the source it would have had before
	await f.select();
	await field(f, "padding").focus();
	await f.page.getByRole("button", { name: "Show affected uses", exact: true }).click();
	const panel = f.page.locator("[data-source-uses]");
	await expect.poll(() => panel.textContent()).toContain("1 unmounted source-dependent frame");
	await panel.getByRole("button", { name: "cold not mounted ↗", exact: true }).click();
	const cold = f.page.frameLocator('iframe[title="cold"]');
	await expect.poll(() => computed(cold, "padding-left"), { timeout: 30_000 }).toEqual(["32px", "32px"]);
	expect(f.writes).toEqual(["commit"]);
});

it("reports a width its flexible parent decided, apart from a height nothing constrains", {
	timeout: 120_000,
}, async () => {
	// two cards in a row narrower than they ask for: the parent decides the width
	const row =
		'import {Card} from "shared/card";export default function Frame(){return <main style={{padding:24,display:"flex",width:260}}><Card key="a" label="A"/><Card key="b" label="B"/></main>}';
	const sized =
		'export function Card({label}){return <section data-subject={label} className="w-40">{label}</section>}';
	const f = await originCanvas({ [owner]: sized }, row, '[data-subject="A"]');

	await f.select();
	await field(f, "width").fill("240px");
	await complete(f, "width", sized.replace("w-40", "w-[240px]"));
	// the source says 240px and the row gives it less, so the save is reported
	// as constrained rather than as a mismatch or as unverified
	await expect.poll(() => f.page.locator('[data-hand-notice="constrained"]').count()).toBe(1);
	expect(await f.page.locator('[data-hand-notice="constrained"] strong').textContent()).toBe(
		"Saved · result constrained",
	);
	expect((await outcomes(f)).at(-1)).toMatchObject({ rendered: "constrained" });
	await expect.poll(async () => Number.parseFloat((await computed(f.frame, "width"))[0] ?? "0")).toBeLessThan(240);

	// the cross axis is nobody else's to decide, so the same kind of edit verifies
	await f.select();
	await field(f, "height").fill("40px");
	await complete(f, "height", sized.replace("w-40", "w-[240px] h-[40px]"));
	await expect.poll(() => computed(f.frame, "height")).toEqual(["40px", "40px"]);
	expect((await outcomes(f)).at(-1)).toMatchObject({ rendered: "verified" });
	await expect.poll(() => f.page.locator('[data-hand-notice="constrained"]').count()).toBe(0);
});
