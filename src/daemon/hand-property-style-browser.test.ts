import { expect, it } from "vitest";
import { originCanvas } from "./hand-origin-browser-helpers";

const file = "shared/label.tsx";
const frame =
	'import {Label} from "shared/label";export default function Frame(){return <main style={{padding:40}}><Label/><input id="draft" defaultValue="initial"/></main>}';
const source = (style: string) =>
	`export function Label(){return <button id="subject" style={${style}} className="p-6 opacity-75 text-red-500">Hello</button>}`;

it.each([
	["accessor", "{get fontWeight(){window.styleReads=(window.styleReads||0)+1;return 550}}"],
	["prototype", "{__proto__:{unrelated:1},fontWeight:550}"],
])(
	"refuses %s style context without evaluating it during the property read",
	{ timeout: 120000 },
	async (_name, style) => {
		const original = source(style);
		const f = await originCanvas({ [file]: original }, frame, "#subject");
		const before = await f.frame.locator("#subject").evaluate(() => Reflect.get(window, "styleReads"));
		const described = f.page.waitForResponse(
			(response) =>
				response.url().endsWith("/source") &&
				response.request().postDataJSON()?.action === "describe" &&
				response.request().postDataJSON()?.operation?.property === "color",
		);
		await f.select();
		const refusal = await (await described).json();
		expect(refusal).toMatchObject({
			ok: false,
			reason: expect.stringMatching(/style.*(getter|key|literal|descriptor|object)/i),
		});
		expect(await f.page.getByRole("button", { name: "Choose color", exact: true }).isDisabled()).toBe(true);
		await expect
			.poll(() => f.page.getByRole("button", { name: "Choose color", exact: true }).getAttribute("title"))
			.toBe(refusal.reason);
		expect(await f.frame.locator("#subject").evaluate(() => Reflect.get(window, "styleReads"))).toBe(before);
		expect(f.bytes()[file]).toBe(original);
		expect(f.writes).toEqual([]);
	},
);

it("refuses a changed native style context and preserves that outside mutation on cancellation", {
	timeout: 120000,
}, async () => {
	const original = source("{fontWeight:550}");
	const f = await originCanvas({ [file]: original }, frame, "#subject");
	const input = await f.frame.locator("#draft").elementHandle();
	await f.frame.locator("#draft").fill("kept");
	await f.select();
	const field = f.page.locator('[data-properties-row="opacity"] input').first();
	await field.fill("50");
	await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.5");
	await f.target.evaluate((element) => {
		element.style.fontWeight = "700";
	});
	await field.press("Enter");
	await expect.poll(() => f.page.locator('[data-hand-notice="blocked"]').count()).toBe(1);
	await expect
		.poll(() => f.target.evaluate((element) => [getComputedStyle(element).opacity, element.style.fontWeight]))
		.toEqual(["0.75", "700"]);
	expect(f.bytes()[file]).toBe(original);
	expect(f.writes).toEqual([]);
	expect(await f.frame.locator("#draft").evaluate((element, original) => element === original, input)).toBe(true);
	expect(await f.frame.locator("#draft").inputValue()).toBe("kept");
});

/** Inline acceptance (#304): the member owns the property, and writes as itself. */
const owner = "shared/tile.tsx";
const tile = (style: string, className: string) =>
	`export function Tile({label}){return <section data-subject={label} style={${style}} className="${className}">{label}</section>}`;
const tiles =
	'import {Tile} from "shared/tile";export default function Frame(){return <main><Tile label="A"/><Tile label="B"/></main>}';
type Canvas = Awaited<ReturnType<typeof originCanvas>>;

function reply(f: Canvas, action: string) {
	return f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === action,
	);
}

function row(f: Canvas, property: string) {
	return f.page.locator(`[data-properties-row="${property}"] input`).first();
}

async function computed(f: Canvas, property: string) {
	return f.frame
		.locator("[data-subject]")
		.evaluateAll(
			(elements, name) => elements.map((element) => getComputedStyle(element).getPropertyValue(name)),
			property,
		);
}

async function complete(f: Canvas, property: string, expected: string) {
	const committed = reply(f, "commit"),
		delivered = reply(f, "delivered");
	void delivered.catch(() => {});
	await row(f, property).press("Enter");
	const result = await (await committed).json();
	expect(result.ok, JSON.stringify({ result, source: f.bytes()[owner] })).toBe(true);
	await delivered;
	await expect.poll(() => f.bytes()[owner]).toBe(expected);
	await f.settled();
	return result;
}

it("edits the property an inline member owns, on every use, and steps back", { timeout: 120_000 }, async () => {
	const original = tile("{{padding: 40, opacity: 0.75}}", "text-red-500");
	const f = await originCanvas({ [owner]: original }, tiles, '[data-subject="A"]');
	await expect.poll(() => computed(f, "padding-left")).toEqual(["40px", "40px"]);

	// a cancelled edit previews on both uses and writes nothing
	await f.select();
	await row(f, "padding").fill("24");
	await expect.poll(() => computed(f, "padding-left")).toEqual(["24px", "24px"]);
	await row(f, "padding").press("Escape");
	await expect.poll(() => computed(f, "padding-left")).toEqual(["40px", "40px"]);
	expect(f.bytes()[owner]).toBe(original);
	expect(f.writes).toEqual([]);

	// the same edit committed: the member itself changes, in the form it was
	// written in, and the class and the other member stay exactly as they are
	await row(f, "padding").fill("24");
	await complete(f, "padding", tile("{{padding: 24, opacity: 0.75}}", "text-red-500"));
	await expect.poll(() => computed(f, "padding-left")).toEqual(["24px", "24px"]);
	await expect.poll(() => computed(f, "opacity")).toEqual(["0.75", "0.75"]);

	// one step back returns the authored member, and nothing else moves
	const stepped = reply(f, "inverse");
	await f.history(false);
	expect((await (await stepped).json()).ok).toBe(true);
	await expect.poll(() => f.bytes()[owner]).toBe(original);
	await expect.poll(() => computed(f, "padding-left")).toEqual(["40px", "40px"]);
	await expect.poll(() => computed(f, "opacity")).toEqual(["0.75", "0.75"]);
});

it("edits the side the member owns while an important rule keeps the other side", { timeout: 120_000 }, async () => {
	const original = tile("{{padding: 40}}", "pt-8!");
	const f = await originCanvas({ [owner]: original }, tiles, '[data-subject="A"]');
	await expect.poll(() => computed(f, "padding-top")).toEqual(["32px", "32px"]);
	await expect.poll(() => computed(f, "padding-left")).toEqual(["40px", "40px"]);

	await f.select();
	await row(f, "padding-left").fill("12");
	await complete(f, "padding-left", tile("{{padding: 40, paddingLeft: 12}}", "pt-8!"));
	// the important declaration is still the one that decides the top
	await expect.poll(() => computed(f, "padding-top")).toEqual(["32px", "32px"]);
	await expect.poll(() => computed(f, "padding-left")).toEqual(["12px", "12px"]);
	await expect.poll(() => computed(f, "padding-right")).toEqual(["40px", "40px"]);

	const stepped = reply(f, "inverse");
	await f.history(false);
	expect((await (await stepped).json()).ok).toBe(true);
	await expect.poll(() => f.bytes()[owner]).toBe(original);
	await expect.poll(() => computed(f, "padding-left")).toEqual(["40px", "40px"]);
});
