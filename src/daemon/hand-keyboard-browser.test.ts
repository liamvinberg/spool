import { readFileSync } from "node:fs";
import type { FrameLocator } from "playwright-core";
import { expect, it } from "vitest";
import type { SourceResult, UseOutcome } from "../source-edit";
import { originCanvas } from "./hand-origin-browser-helpers";

/**
 * Keyboard movement acceptance (#308): the arrow keys on a real canvas.
 *
 * A person holds one element and presses an arrow. What that means is the
 * document's own answer: an element the file already places freely moves by a
 * pixel, an element its parent lays out changes places with the sibling beside
 * it, and siblings without stable identities refuse before anything is saved.
 * The two halves no simulated DOM can establish are here: the running app keeps
 * each item's own state through the move, and the source says exactly what
 * changed.
 */

const COUNTER =
	"import {useState} from 'react';\nfunction Counter({name}){const [count,setCount]=useState(0);return <button data-name={name} onClick={()=>setCount(count+1)}>{name}:{count}</button>}\n";

const row = (a: string, b: string) =>
	`${COUNTER}export default function Frame(){return <main style={{padding:40,display:'flex',gap:8}}>${a}${b}</main>}`;

const A = '<Counter key="a" name="A"/>',
	B = '<Counter key="b" name="B"/>';

type Canvas = Awaited<ReturnType<typeof originCanvas>>;

function reply(f: Canvas, action: string) {
	return f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === action,
	);
}

async function saved(pending: ReturnType<typeof reply>): Promise<SourceResult> {
	const result = (await (await pending).json()) as SourceResult;
	expect(result.ok, JSON.stringify(result)).toBe(true);
	return result;
}

/** The order the running app actually draws, from the parent's own children. */
async function order(frame: FrameLocator): Promise<string[]> {
	return frame
		.locator("main [data-name]")
		.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-name") ?? ""));
}

async function outcomes(f: Canvas): Promise<UseOutcome[]> {
	return f.page.evaluate(() => Reflect.get(window, "originOutcomes")) as Promise<UseOutcome[]>;
}

it("moves one keyed sibling past the next, keeping each item's own state", { timeout: 120_000 }, async () => {
	const source = row(A, B);
	const file = "frames/home/frame.tsx";
	const f = await originCanvas({}, source, '[data-name="A"]');
	const sibling = f.frame.locator('[data-name="B"]');
	await sibling.evaluate((element) => {
		(element as HTMLElement).click();
		Reflect.set(window, "survivor", element);
	});
	await f.target.evaluate((element) => {
		(element as HTMLElement).click();
		(element as HTMLElement).click();
		Reflect.set(window, "moved", element);
	});
	await expect.poll(() => order(f.frame)).toEqual(["A", "B"]);
	expect(await f.frame.locator("main [data-name]").allTextContents()).toEqual(["A:2", "B:1"]);

	await f.select();
	const committed = reply(f, "commit");
	await f.page.keyboard.press("ArrowRight");
	await saved(committed);

	// the source says the move and nothing else; the two units keep their bytes
	await expect.poll(() => readFileSync(f.file(file), "utf8"), { timeout: 30_000 }).toBe(row(B, A));
	await expect.poll(() => order(f.frame)).toEqual(["B", "A"]);
	// each count stayed with the item it belonged to, on the same native node
	expect(await f.frame.locator("main [data-name]").allTextContents()).toEqual(["B:1", "A:2"]);
	expect(await sibling.evaluate((element) => Reflect.get(window, "survivor") === element)).toBe(true);
	expect(await f.target.evaluate((element) => Reflect.get(window, "moved") === element)).toBe(true);
	await f.settled();
	expect((await outcomes(f)).at(-1), JSON.stringify(await outcomes(f))).toMatchObject({
		installation: "installed",
		rendered: "verified",
	});
	expect(f.writes).toEqual(["commit"]);

	// one press is one step back: the order returns and no state moves with it
	const undone = reply(f, "inverse");
	await f.history();
	await saved(undone);
	await expect.poll(() => readFileSync(f.file(file), "utf8"), { timeout: 30_000 }).toBe(source);
	await expect.poll(() => order(f.frame)).toEqual(["A", "B"]);
	expect(await f.frame.locator("main [data-name]").allTextContents()).toEqual(["A:2", "B:1"]);
	expect(await sibling.evaluate((element) => Reflect.get(window, "survivor") === element)).toBe(true);
});

it("moves the shared definition's own children, in every use of it", { timeout: 120_000 }, async () => {
	const owner = "shared/list.tsx";
	const list = `${COUNTER}export function List(){return <main style={{padding:40,display:'flex',gap:8}}>${A}${B}</main>}`;
	const f = await originCanvas(
		{ [owner]: list },
		'import {List} from "shared/list";export default function Frame(){return <List/>}',
		'[data-name="A"]',
		true,
	);
	const second = f.page.frameLocator('iframe[title="second"]');
	await expect.poll(() => order(second)).toEqual(["A", "B"]);

	await f.select();
	const committed = reply(f, "commit");
	await f.page.keyboard.press("ArrowRight");
	await saved(committed);

	// one definition, two uses: the move is disclosed and verified in each
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toBe(list.replace(`${A}${B}`, `${B}${A}`));
	await expect.poll(() => order(f.frame)).toEqual(["B", "A"]);
	await expect.poll(() => order(second)).toEqual(["B", "A"]);
	await f.settled();
	const settled = (await outcomes(f)).at(-1);
	expect(
		settled?.uses?.map((use) => use.rendered),
		JSON.stringify(settled),
	).toEqual(["verified", "verified"]);
	expect(f.writes).toEqual(["commit"]);
});

it("counts a held arrow as one move, one save and one step back", { timeout: 120_000 }, async () => {
	const source = row(A, `${B}<Counter key="c" name="C"/>`);
	const f = await originCanvas({}, source, '[data-name="A"]');
	await expect.poll(() => order(f.frame)).toEqual(["A", "B", "C"]);

	await f.select();
	const committed = reply(f, "commit");
	// held, not pressed twice: one gesture from the first press to the release
	await f.page.keyboard.down("ArrowRight");
	await f.page.keyboard.down("ArrowRight");
	await f.page.keyboard.up("ArrowRight");
	await saved(committed);

	await expect.poll(() => order(f.frame), { timeout: 30_000 }).toEqual(["B", "C", "A"]);
	expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(row(B, `<Counter key="c" name="C"/>${A}`));
	expect(f.writes).toEqual(["commit"]);

	const undone = reply(f, "inverse");
	await f.history();
	await saved(undone);
	await expect.poll(() => order(f.frame), { timeout: 30_000 }).toEqual(["A", "B", "C"]);
	expect(f.writes).toEqual(["commit", "inverse"]);

	// a unit already at the end has no move to make, and says so rather than
	// saving a change with nothing in it
	await f.select();
	const refused = reply(f, "read");
	await f.page.keyboard.press("ArrowLeft");
	expect((await (await refused).json()).reason).toContain("already the first");
	await expect.poll(() => f.page.locator('[data-hand-notice="blocked"]').count()).toBe(1);
	expect(f.writes).toEqual(["commit", "inverse"]);
});

it("refuses a move between siblings with no stable identity, and prepares the ask", {
	timeout: 120_000,
}, async () => {
	const source = row('<Counter name="A"/>', '<Counter name="B"/>');
	const f = await originCanvas({}, source, '[data-name="A"]');
	await f.select();
	const refused = reply(f, "read");
	await f.page.keyboard.press("ArrowRight");
	const result = (await (await refused).json()) as { ok: boolean; reason?: string };
	expect(result.ok).toBe(false);
	expect(result.reason).toContain("stable authored keys");

	const notice = f.page.locator('[data-hand-notice="blocked"]');
	await expect.poll(() => notice.count()).toBe(1);
	expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
	expect(f.writes).toEqual([]);

	// the refusal prepares the ask; only the person sends it
	const sends: string[] = [];
	f.page.on("request", (request) => {
		if (request.url().endsWith("/agent/turn")) sends.push(request.url());
	});
	await notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	const composer = f.page.locator("[data-agent-rail] textarea");
	await expect.poll(() => composer.inputValue()).toContain("move this element after its neighbour");
	const asked = await composer.inputValue();
	expect(asked).toContain("stable authored keys");
	expect(asked).toContain("Requested move: 1 place later among its authored siblings.");
	expect(asked).toContain("frames/home/frame.tsx");
	expect(sends).toEqual([]);
	expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
});

it("nudges an already free element, one pixel a press and ten with shift", { timeout: 120_000 }, async () => {
	const owner = "shared/card.tsx";
	const card =
		'export function Card({label}){return <section data-subject={label} className="absolute left-8 top-8 w-40 h-24 bg-black/5">{label}</section>}';
	const source =
		'import {Card} from "shared/card";export default function Frame(){return <main style={{position:"relative",padding:24,height:400}}><Card key="a" label="A"/></main>}';
	const f = await originCanvas({ [owner]: card }, source, '[data-subject="A"]');
	const left = () => f.frame.locator("[data-subject]").evaluate((element) => getComputedStyle(element).left);
	await expect.poll(left).toBe("32px");

	await f.select();
	const committed = reply(f, "commit");
	await f.page.keyboard.down("ArrowRight");
	await f.page.keyboard.down("ArrowRight");
	await f.page.keyboard.up("ArrowRight");
	await saved(committed);

	// two presses of one gesture: one save, in the element's own placement
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toContain("left-[34px]");
	expect(f.bytes()[owner]).toContain("w-40 h-24");
	await expect.poll(left).toBe("34px");
	expect(f.writes).toEqual(["commit"]);

	const shifted = reply(f, "commit");
	await f.page.keyboard.press("Shift+ArrowDown");
	await saved(shifted);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toContain("top-[42px]");
	await expect
		.poll(() => f.frame.locator("[data-subject]").evaluate((element) => getComputedStyle(element).top))
		.toBe("42px");

	const undone = reply(f, "inverse");
	await f.history();
	await saved(undone);
	await expect.poll(() => f.bytes()[owner], { timeout: 30_000 }).toContain("top-8");
});

it("puts the preview back and saves nothing when Escape retires a held arrow", {
	timeout: 120_000,
}, async () => {
	const owner = "shared/card.tsx";
	const card =
		'export function Card({label}){return <section data-subject={label} className="absolute left-8 top-8 w-40 h-24 bg-black/5">{label}</section>}';
	const source =
		'import {Card} from "shared/card";export default function Frame(){return <main style={{position:"relative",padding:24,height:400}}><Card key="a" label="A"/></main>}';
	const f = await originCanvas({ [owner]: card }, source, '[data-subject="A"]');
	const left = () => f.frame.locator("[data-subject]").evaluate((element) => getComputedStyle(element).left);

	await f.select();
	await f.page.keyboard.down("ArrowRight");
	await expect.poll(left, { timeout: 30_000 }).toBe("33px");
	await f.page.keyboard.press("Escape");
	await f.page.keyboard.up("ArrowRight");

	// the preview the gesture owned is put back and nothing is written
	await expect.poll(left, { timeout: 30_000 }).toBe("32px");
	expect(f.bytes()[owner]).toBe(card);
	expect(f.writes).toEqual([]);
});

it("leaves the arrow keys to a focused field inside the running app", { timeout: 120_000 }, async () => {
	const source = `${COUNTER}export default function Frame(){return <main style={{padding:40,display:'flex',gap:8}}><input data-name="field" defaultValue="abcd"/>${B}</main>}`;
	const f = await originCanvas({}, source, '[data-name="field"]');
	await f.select();
	await f.target.evaluate((element) => {
		const field = element as HTMLInputElement;
		field.focus();
		field.setSelectionRange(4, 4);
	});
	await f.page.keyboard.press("ArrowLeft");
	await f.page.keyboard.press("ArrowLeft");

	// the field's own caret moved and no source was read for a move
	await expect.poll(() => f.target.evaluate((element) => (element as HTMLInputElement).selectionStart)).toBe(2);
	expect(f.writes).toEqual([]);
	expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
});
