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
	const original = tile("{padding: 40, opacity: 0.75}", "text-red-500");
	const f = await originCanvas({ [owner]: original }, tiles, '[data-subject="A"]');
	await expect.poll(() => computed(f, "padding-left")).toEqual(["40px", "40px"]);

	// a cancelled edit previews on both uses and writes nothing
	await f.select();
	await row(f, "padding").fill("6");
	await expect.poll(() => computed(f, "padding-left")).toEqual(["24px", "24px"]);
	await row(f, "padding").press("Escape");
	await expect.poll(() => computed(f, "padding-left")).toEqual(["40px", "40px"]);
	expect(f.bytes()[owner]).toBe(original);
	expect(f.writes).toEqual([]);

	// the same edit committed: the member itself changes, in the form it was
	// written in, and the class and the other member stay exactly as they are
	await row(f, "padding").fill("6");
	await complete(f, "padding", tile('{padding: "calc(var(--spacing) * 6)", opacity: 0.75}', "text-red-500"));
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

it("refuses the control whose sides an important rule and a member own separately", {
	timeout: 120_000,
}, async () => {
	const original = tile("{padding: 40}", "pt-8! pb-6");
	const f = await originCanvas({ [owner]: original }, tiles, '[data-subject="A"]');
	// the important rule decides the top; the member decides every other side
	await expect.poll(() => computed(f, "padding-top")).toEqual(["32px", "32px"]);
	await expect.poll(() => computed(f, "padding-left")).toEqual(["40px", "40px"]);

	await f.select();
	// one control cannot be told which of two sources to write, so it refuses
	// before saving instead of picking one
	const refused = reply(f, "commit");
	await row(f, "padding").fill("6");
	await row(f, "padding").press("Enter");
	expect(await (await refused).json()).toMatchObject({
		ok: false,
		reason: expect.stringMatching(/different sources/),
	});
	expect(f.bytes()[owner]).toBe(original);
	await expect.poll(() => computed(f, "padding-top")).toEqual(["32px", "32px"]);
	await expect.poll(() => computed(f, "padding-left")).toEqual(["40px", "40px"]);
});

/** Scope acceptance (#304): the written scope, its activity, and its own rule. */
it("edits an inactive state rule, reports it inactive, and it applies when the state is real", {
	timeout: 120_000,
}, async () => {
	const original =
		'export function Tile({label}){return <section data-subject={label} className="text-base hover:text-2xl md:text-3xl">{label}</section>}';
	const f = await originCanvas({ [owner]: original }, tiles, '[data-subject="A"]');
	await expect.poll(() => computed(f, "font-size")).toEqual(["16px", "16px"]);

	await f.select();
	const chip = f.page.locator("[data-scope-chip]", { hasText: "hover:" }).first();
	await chip.click();
	// what the scope applies under is the chip's own line; what the viewport is
	// doing to this element right now is still the base value
	await expect.poll(() => chip.getAttribute("aria-pressed")).toBe("true");
	expect(await chip.getAttribute("title")).toBe(":hover");
	await expect.poll(() => computed(f, "font-size")).toEqual(["16px", "16px"]);

	await row(f, "font-size").fill("30");
	// the size token also carries the scope's leading, so it stays authored and
	// the exact size lands beside it as the override the compiler makes it
	await complete(f, "font-size", original.replace('md:text-3xl"', 'md:text-3xl hover:text-[30px]"'));
	// the other scopes are exactly as they were written
	expect(f.bytes()[owner]).toContain("text-base");
	expect(f.bytes()[owner]).toContain("md:text-3xl");
	const settled = (await f.page.evaluate(() => Reflect.get(window, "originOutcomes"))) as {
		uses?: { rendered: string }[];
	}[];
	expect(
		settled.at(-1)?.uses?.map((use) => use.rendered),
		JSON.stringify(settled.at(-1)),
	).toEqual(["inactive", "inactive"]);

	// the rule it wrote is a real hover rule in the document it wrote it into;
	// that it applies once the condition is real is measured natively in
	// property-outcome.test.ts, where the condition can actually be made true
	await expect.poll(() => f.bytes()[owner]).toContain("hover:text-[30px]");

	const stepped = reply(f, "inverse");
	await f.history(false);
	expect((await (await stepped).json()).ok).toBe(true);
	await expect.poll(() => f.bytes()[owner]).toBe(original);
});

/** Authored declaration acceptance (#304): the project's own stylesheet is the source. */
const sheet = "shared/tokens.css";
const tokens = (padding: string, opacity: string) =>
	`@theme {}\n.tile { padding: ${padding} }\n@media (min-width: 5000px) { .tile { opacity: ${opacity} } }\n`;
const carded =
	'export function Tile({label}){return <section data-subject={label} className="tile p-6 opacity-75">{label}</section>}';

it("edits the project's own declaration in its own stylesheet, and steps back", { timeout: 120_000 }, async () => {
	const css = tokens("12px", "0.25");
	const f = await originCanvas({ [owner]: carded, [sheet]: css }, tiles, '[data-subject="A"]');
	// the unlayered project rule is what the element runs, not the utility
	await expect.poll(() => computed(f, "padding-left")).toEqual(["12px", "12px"]);

	await f.select();
	// the field's own unit is the theme's spacing step, and the declaration keeps
	// the reference that step compiles to rather than a flattened pixel value
	await row(f, "padding").fill("5");
	const committed = reply(f, "commit"),
		delivered = reply(f, "delivered");
	void delivered.catch(() => {});
	await row(f, "padding").press("Enter");
	const result = await (await committed).json();
	expect(result.ok, JSON.stringify({ result, css: f.bytes()[sheet] })).toBe(true);
	await delivered;
	// only the declaration's value moved: the selector, the condition and the
	// element's own source are exactly as they were
	await expect.poll(() => f.bytes()[sheet]).toBe(tokens("calc(var(--spacing) * 5)", "0.25"));
	expect(f.bytes()[owner]).toBe(carded);
	await expect.poll(() => computed(f, "padding-left")).toEqual(["20px", "20px"]);

	const stepped = reply(f, "inverse");
	await f.history(false);
	const back = await (await stepped).json();
	expect(back.ok, JSON.stringify(back)).toBe(true);
	await expect.poll(() => f.bytes()[sheet]).toBe(css);
	await expect.poll(() => computed(f, "padding-left")).toEqual(["12px", "12px"]);
});

it("edits an inactive conditional declaration and reports it inactive", { timeout: 120_000 }, async () => {
	const css = tokens("12px", "0.25");
	const f = await originCanvas({ [owner]: carded, [sheet]: css }, tiles, '[data-subject="A"]');
	// the frame is narrower than the condition, so the utility is what it runs
	await expect.poll(() => computed(f, "opacity")).toEqual(["0.75", "0.75"]);

	await f.select();
	await row(f, "opacity").fill("40");
	const committed = reply(f, "commit"),
		delivered = reply(f, "delivered");
	void delivered.catch(() => {});
	await row(f, "opacity").press("Enter");
	const result = await (await committed).json();
	expect(result.ok, JSON.stringify({ result, css: f.bytes()[sheet] })).toBe(true);
	await delivered;
	await expect.poll(() => f.bytes()[sheet]).toBe(tokens("12px", "40%"));
	const settled = (await f.page.evaluate(() => Reflect.get(window, "originOutcomes"))) as {
		uses?: { rendered: string }[];
	}[];
	expect(
		settled.at(-1)?.uses?.map((use) => use.rendered),
		JSON.stringify(settled.at(-1)),
	).toEqual(["inactive", "inactive"]);
	// the viewport still applies the utility, which the edit did not touch
	await expect.poll(() => computed(f, "opacity")).toEqual(["0.75", "0.75"]);

	const stepped = reply(f, "inverse");
	await f.history(false);
	expect((await (await stepped).json()).ok).toBe(true);
	await expect.poll(() => f.bytes()[sheet]).toBe(css);
});
