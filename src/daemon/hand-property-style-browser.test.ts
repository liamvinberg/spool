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
const sheet = "shared/tokens.css";
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

it("edits the side the member owns while an important rule keeps the other side", {
	timeout: 120_000,
}, async () => {
	const original = tile("{padding: 40, paddingLeft: 40, opacity: 0.75}", "tile");
	const css = "@theme {}\n.tile { padding-top: 32px !important }\n";
	const f = await originCanvas({ [owner]: original, [sheet]: css }, tiles, '[data-subject="A"]');
	// the important rule decides the top; the member decides every other side
	await expect.poll(() => computed(f, "padding-top")).toEqual(["32px", "32px"]);
	await expect.poll(() => computed(f, "padding-left")).toEqual(["40px", "40px"]);

	await f.select();
	// the box opens onto its own sides, because one row cannot write two sources
	await expect.poll(() => f.page.locator('[data-properties-row="padding-left"] input').count()).toBe(1);
	await row(f, "padding-left").fill("3");
	await complete(
		f,
		"padding-left",
		tile('{padding: 40, paddingLeft: "calc(var(--spacing) * 3)", opacity: 0.75}', "tile"),
	);
	// every use took it, and the important rule is still what decides the top
	await expect.poll(() => computed(f, "padding-left")).toEqual(["12px", "12px"]);
	await expect.poll(() => computed(f, "padding-top")).toEqual(["32px", "32px"]);
	await expect.poll(() => computed(f, "padding-right")).toEqual(["40px", "40px"]);
	expect(f.bytes()[sheet]).toBe(css);

	// an unrelated member edited after it, and both survive their own step back
	await f.select();
	await row(f, "opacity").fill("50");
	await complete(f, "opacity", tile('{padding: 40, paddingLeft: "calc(var(--spacing) * 3)", opacity: "50%"}', "tile"));
	await expect.poll(() => computed(f, "opacity")).toEqual(["0.5", "0.5"]);

	const opacity = reply(f, "inverse");
	await f.history(false);
	expect((await (await opacity).json()).ok).toBe(true);
	await expect
		.poll(() => f.bytes()[owner])
		.toBe(tile('{padding: 40, paddingLeft: "calc(var(--spacing) * 3)", opacity: 0.75}', "tile"));
	// the side edit is untouched by the step that took the opacity back
	await expect.poll(() => computed(f, "padding-left")).toEqual(["12px", "12px"]);

	const side = reply(f, "inverse");
	await f.history(false);
	expect((await (await side).json()).ok).toBe(true);
	await expect.poll(() => f.bytes()[owner]).toBe(original);
	await expect.poll(() => computed(f, "padding-left")).toEqual(["40px", "40px"]);
	await expect.poll(() => computed(f, "padding-top")).toEqual(["32px", "32px"]);
});

/** Scope acceptance (#304): the written scope, its activity, and its own rule. */
it("edits an inactive attribute rule, reports it inactive, and it applies when the state is real", {
	timeout: 120_000,
}, async () => {
	// an attribute condition is a state this document can really be put into,
	// unlike a pointer state a test cannot produce through the canvas overlay
	const original =
		'export function Tile({label}){return <section data-subject={label} className="text-base data-[open]:text-2xl md:text-3xl">{label}</section>}';
	const f = await originCanvas({ [owner]: original }, tiles, '[data-subject="A"]');
	await expect.poll(() => computed(f, "font-size")).toEqual(["16px", "16px"]);

	await f.select();
	const chip = f.page.locator("[data-scope-chip]", { hasText: "data-[open]:" }).first();
	await chip.click();
	await expect.poll(() => chip.getAttribute("aria-pressed")).toBe("true");
	// the written scope is selected while the element is not in that state
	await expect.poll(() => computed(f, "font-size")).toEqual(["16px", "16px"]);

	await row(f, "font-size").fill("30");
	await complete(f, "font-size", original.replace('md:text-3xl"', 'md:text-3xl data-[open]:text-[30px]"'));
	expect(f.bytes()[owner]).toContain("text-base");
	expect(f.bytes()[owner]).toContain("md:text-3xl");
	const settled = (await f.page.evaluate(() => Reflect.get(window, "originOutcomes"))) as {
		uses?: { rendered: string }[];
	}[];
	expect(
		settled.at(-1)?.uses?.map((use) => use.rendered),
		JSON.stringify(settled.at(-1)),
	).toEqual(["inactive", "inactive"]);

	// the rule it wrote is the rule the element runs once its condition is real
	await f.frame.locator('[data-subject="A"]').evaluate((element) => element.setAttribute("data-open", ""));
	await expect.poll(() => computed(f, "font-size")).toEqual(["30px", "16px"]);

	const stepped = reply(f, "inverse");
	await f.history(false);
	expect((await (await stepped).json()).ok).toBe(true);
	await expect.poll(() => f.bytes()[owner]).toBe(original);
	await expect.poll(() => computed(f, "font-size")).toEqual(["24px", "16px"]);
});

/** A real breakpoint rule, edited under its own written scope (#304, AC9). */
it("edits an existing responsive type rule under its own scope, and steps forward again", {
	timeout: 120_000,
}, async () => {
	const original =
		'export function Tile({label}){return <section data-subject={label} className="text-base sm:text-2xl">{label}</section>}';
	const f = await originCanvas({ [owner]: original }, tiles, '[data-subject="A"]');
	// the frame is 650px wide, so the sm: rule is the one applying
	await expect.poll(() => computed(f, "font-size")).toEqual(["24px", "24px"]);

	await f.select();
	await f.page.locator("[data-scope-chip]", { hasText: "sm:" }).first().click();
	await row(f, "font-size").fill("30");
	// the size token also carries the scope's leading, so it stays authored and
	// the exact size lands beside it as the override the compiler makes it
	await complete(f, "font-size", original.replace('sm:text-2xl"', 'sm:text-2xl sm:text-[30px]"'));
	expect(f.bytes()[owner]).toContain("text-base");
	await expect.poll(() => computed(f, "font-size")).toEqual(["30px", "30px"]);

	const stepped = reply(f, "inverse");
	await f.history(false);
	expect((await (await stepped).json()).ok).toBe(true);
	await expect.poll(() => f.bytes()[owner]).toBe(original);
	await expect.poll(() => computed(f, "font-size")).toEqual(["24px", "24px"]);

	const forward = reply(f, "inverse");
	await f.history(true);
	expect((await (await forward).json()).ok).toBe(true);
	await expect.poll(() => f.bytes()[owner]).toBe(original.replace('sm:text-2xl"', 'sm:text-2xl sm:text-[30px]"'));
	await expect.poll(() => computed(f, "font-size")).toEqual(["30px", "30px"]);
});

/** Authored declaration acceptance (#304): the project's own stylesheet is the source. */
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

it("leaves an unsatisfied condition alone and edits what the base row is running", {
	timeout: 120_000,
}, async () => {
	const css = "@theme {}\n@media (min-width: 5000px) { .tile { padding: 40px } }\n";
	const f = await originCanvas({ [owner]: carded, [sheet]: css }, tiles, '[data-subject="A"]');
	// the frame is narrower than the condition, so the utility is what it runs
	await expect.poll(() => computed(f, "padding-left")).toEqual(["24px", "24px"]);

	await f.select();
	// the row says the rule is there and under what, while the value beside it
	// stays the one the element is actually running
	await expect
		.poll(() => f.page.locator('[data-properties-row="padding"] span[title]').first().getAttribute("title"))
		.toBe("also written under @media (min-width: 5000px)");

	await row(f, "padding").fill("5");
	await complete(f, "padding", carded.replace("p-6", "p-5"));
	// the base row wrote the class it is running; the rule for a viewport this
	// frame is not at is exactly as it was
	expect(f.bytes()[sheet]).toBe(css);
	await expect.poll(() => computed(f, "padding-left")).toEqual(["20px", "20px"]);

	const stepped = reply(f, "inverse");
	await f.history(false);
	expect((await (await stepped).json()).ok).toBe(true);
	await expect.poll(() => f.bytes()[owner]).toBe(carded);
	await expect.poll(() => computed(f, "padding-left")).toEqual(["24px", "24px"]);

	// and forward again: one step each way, each taking its own edit
	const forward = reply(f, "inverse");
	await f.history(true);
	expect((await (await forward).json()).ok).toBe(true);
	await expect.poll(() => f.bytes()[owner]).toBe(carded.replace("p-6", "p-5"));
	expect(f.bytes()[sheet]).toBe(css);
});

/**
 * The two lifetimes (#304, AC8).
 *
 * A source receipt is about the source and its dependencies; a pending read is
 * about the interaction that opened it. Later ordinary work in the frame retires
 * the second and leaves the first alone, and a stylesheet write is no different
 * for being in another file.
 */
it("keeps a stylesheet Undo through later work that retires a pending read", { timeout: 120_000 }, async () => {
	const css = tokens("12px", "0.25");
	const f = await originCanvas({ [owner]: carded, [sheet]: css }, tiles, '[data-subject="A"]');
	await f.select();
	await row(f, "padding").fill("5");
	await complete(f, "padding", carded);
	await expect.poll(() => f.bytes()[sheet]).toBe(tokens("calc(var(--spacing) * 5)", "0.25"));

	// ordinary later work: another read is opened on the same source and given up,
	// which is the interaction context the first read was admitted in, changing
	await f.select();
	await row(f, "opacity").fill("50");
	await row(f, "opacity").press("Escape");
	await f.settled();

	// the receipt still holds: its source and dependencies are what it is about
	const stepped = reply(f, "inverse");
	await f.history(false);
	const back = await (await stepped).json();
	expect(back.ok, JSON.stringify(back)).toBe(true);
	await expect.poll(() => f.bytes()[sheet]).toBe(css);
	await expect.poll(() => computed(f, "padding-left")).toEqual(["12px", "12px"]);
});

/** The two refusals a declaration-owned row meets in the owner itself (#304, AC5). */
it("refuses a control whose sides its stylesheet declares one by one", { timeout: 120_000 }, async () => {
	const css = "@theme {}\n.tile { padding-top: 1px; padding-right: 2px; padding-bottom: 3px; padding-left: 4px }\n";
	const f = await originCanvas({ [owner]: carded, [sheet]: css }, tiles, '[data-subject="A"]');
	await expect.poll(() => computed(f, "padding-left")).toEqual(["4px", "4px"]);

	await f.select();
	const refused = reply(f, "commit");
	await row(f, "padding").fill("5");
	await row(f, "padding").press("Enter");
	expect(await (await refused).json()).toMatchObject({
		ok: false,
		reason: expect.stringMatching(/declared separately/),
	});
	expect(f.bytes()[sheet]).toBe(css);
	expect(f.bytes()[owner]).toBe(carded);
});

it("refuses removing a declaration its stylesheet owns", { timeout: 120_000 }, async () => {
	const css = "@theme {}\n.tile { padding: 12px }\n";
	const f = await originCanvas({ [owner]: carded, [sheet]: css }, tiles, '[data-subject="A"]');
	await expect.poll(() => computed(f, "padding-left")).toEqual(["12px", "12px"]);

	await f.select();
	const refused = reply(f, "commit");
	await row(f, "padding").fill("");
	await row(f, "padding").press("Enter");
	expect(await (await refused).json()).toMatchObject({
		ok: false,
		reason: expect.stringMatching(/removing an authored declaration/),
	});
	expect(f.bytes()[sheet]).toBe(css);
});
