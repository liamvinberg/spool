import { expect, it } from "vitest";
import { originCanvas } from "./hand-origin-browser-helpers";

it.each([
	["opacity", "opacity-75", "75", "77", "0.77"],
	["border-width", "border-2", "2", "4", "4px"],
] as const)(
	"keeps repeated %s arrows in one cancellable source gesture",
	{ timeout: 120_000 },
	async (property, token, start, next, native) => {
		const file = "shared/label.tsx";
		const original = `export function Label(){return <button id="subject" className="${token} p-6">Hello</button>}`;
		const frame = `import {Label} from 'shared/label';export default function Frame(){return <main className="p-10"><Label/></main>}`;
		const f = await originCanvas({ [file]: original }, frame, "#subject", true);
		await f.select();
		const field = f.page.locator(`[data-properties-row="${property}"] input`).first();
		await expect.poll(() => field.inputValue()).toBe(start);
		await field.focus();
		await field.press("ArrowUp");
		await field.press("ArrowUp");
		expect(await field.inputValue()).toBe(next);
		expect(f.writes).toEqual([]);
		expect(f.bytes()[file]).toBe(original);
		for (const document of [f.frame, f.page.frameLocator('iframe[title="second"]')])
			await expect
				.poll(() =>
					document
						.locator("#subject")
						.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), property),
				)
				.toBe(native);
		await field.press("Escape");
		expect(f.writes).toEqual([]);
		expect(f.bytes()[file]).toBe(original);
		await field.focus();
		await field.press("ArrowUp");
		await field.press("ArrowUp");
		const saved = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
		);
		await field.press("Enter");
		expect(await (await saved).json()).toMatchObject({ ok: true });
		await f.settled();
		expect(f.writes).toEqual(["commit"]);
		expect(f.bytes()[file]).toBe(original.replace(token, property === "opacity" ? "opacity-77" : "border-4"));
		await f.page.keyboard.press("ControlOrMeta+z");
		await f.settled();
		expect(f.bytes()[file]).toBe(original);
		expect(f.writes).toEqual(["commit", "inverse"]);
	},
);
