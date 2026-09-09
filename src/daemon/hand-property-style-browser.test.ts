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
