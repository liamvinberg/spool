import { expect, it } from "vitest";
import { originCanvas } from "./hand-origin-browser-helpers";

it.each(["color", "background-color"] as const)(
	"preserves custom %s alpha through preview, cancel, save and reference Undo",
	{ timeout: 120_000 },
	async (property) => {
		const file = "shared/label.tsx";
		const prefix = property === "color" ? "text" : "bg";
		const original = `export function Label(){return <button id="subject" className="${prefix}-brand p-6">Hello</button>}`;
		const frame = `import 'shared/tokens.css';import {Label} from 'shared/label';export default function Frame(){return <main className="p-10"><Label/><input id="native" defaultValue="initial"/></main>}`;
		const f = await originCanvas(
			{ [file]: original, "shared/tokens.css": "@theme { --color-brand: #123456; }" },
			frame,
			"#subject",
			true,
		);
		const documents = [f.frame, f.page.frameLocator('iframe[title="second"]')];
		for (const document of documents)
			await document.locator("#native").evaluate((element) => {
				if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
				element.value = "alpha state";
				element.setSelectionRange(1, 4);
				Reflect.set(window, "alphaInput", element);
			});
		await f.select();
		const trigger = f.page.getByRole("button", { name: `Choose ${property}`, exact: true });
		const native = async (value: string) => {
			for (const document of documents)
				await expect
					.poll(() =>
						document
							.locator("#subject")
							.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), property),
					)
					.toBe(value);
		};
		await trigger.click();
		const detached = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
		);
		await f.page.getByRole("button", { name: "Use custom value", exact: true }).click();
		expect(await (await detached).json()).toMatchObject({ ok: true });
		await f.settled();
		const custom = f.bytes()[file];
		await trigger.click();
		const field = f.page.getByRole("textbox", { name: property, exact: true });
		await field.fill("rgb(18 52 86 / 25%)");
		await native("rgba(18, 52, 86, 0.25)");
		expect(f.bytes()[file]).toBe(custom);
		expect(f.writes).toEqual(["commit"]);
		await field.press("Escape");
		await native("rgb(18, 52, 86)");
		await expect.poll(() => trigger.getAttribute("title")).toBe("Custom value");
		await trigger.click();
		await field.fill("rgb(18 52 86 / 25%)");
		const saved = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
		);
		await field.press("Enter");
		expect(await (await saved).json()).toMatchObject({ ok: true });
		await f.settled();
		expect(f.bytes()[file]).toBe(original.replace(`${prefix}-brand`, `${prefix}-[rgb(18_52_86_/_25%)]`));
		await native("rgba(18, 52, 86, 0.25)");
		await f.page.keyboard.press("Escape");
		await f.page.keyboard.press("ControlOrMeta+z");
		await f.settled();
		expect(f.bytes()[file]).toBe(custom);
		await f.page.keyboard.press("ControlOrMeta+z");
		await f.settled();
		expect(f.bytes()[file]).toBe(original);
		expect(f.writes).toEqual(["commit", "commit", "inverse", "inverse"]);
		await native("rgb(18, 52, 86)");
		for (const document of documents)
			expect(
				await document.locator("#native").evaluate((element) => {
					if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
					return [
						element === Reflect.get(window, "alphaInput"),
						element.value,
						element.selectionStart,
						element.selectionEnd,
					];
				}),
			).toEqual([true, "alpha state", 1, 4]);
	},
);

it("previews fractional reference alpha and repeated arrows as one cancellable edit", {
	timeout: 120_000,
}, async () => {
	const file = "shared/label.tsx";
	const original = 'export function Label(){return <button id="subject" className="bg-brand/50 p-6">Hello</button>}';
	const frame = `import 'shared/tokens.css';import {Label} from 'shared/label';export default function Frame(){return <main className="p-10"><Label/><span id="reference" style={{backgroundColor:'color-mix(in oklab, #123456 26.5%, transparent)'}}>Reference</span></main>}`;
	const f = await originCanvas(
		{ [file]: original, "shared/tokens.css": "@theme { --color-brand: #123456; }" },
		frame,
		"#subject",
		true,
	);
	const documents = [f.frame, f.page.frameLocator('iframe[title="second"]')];
	const before = await f.target.evaluate((element) => getComputedStyle(element).backgroundColor);
	const expected = await f.frame
		.locator("#reference")
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	await f.select();
	const field = f.page.locator('[data-properties-row="background"] input').first();
	await expect.poll(() => field.inputValue()).toBe("50");
	await field.fill("25.5");
	await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(before);
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let waiting = false;
	const replies: Promise<void>[] = [];
	await f.page.route("**/source", async (route) => {
		if (route.request().postDataJSON()?.action !== "preview") return route.continue();
		const response = await route.fetch();
		waiting = true;
		const reply = held.then(() => route.fulfill({ response }));
		replies.push(reply);
		await reply;
	});
	try {
		await field.press("ArrowUp");
		expect(await field.inputValue()).toBe("26.5");
		await expect.poll(() => waiting).toBe(true);
		expect(f.writes).toEqual([]);
		expect(f.bytes()[file]).toBe(original);
		for (const document of documents)
			await expect
				.poll(() => document.locator("#subject").evaluate((element) => getComputedStyle(element).backgroundColor))
				.toBe(expected);
		await field.press("Escape");
	} finally {
		release();
		await Promise.all(replies);
		await f.page.unroute("**/source");
	}
	for (const document of documents)
		await expect
			.poll(() => document.locator("#subject").evaluate((element) => getComputedStyle(element).backgroundColor))
			.toBe(before);
	expect(f.writes).toEqual([]);
	await field.fill("25.5");
	await field.press("Shift+ArrowUp");
	expect(await field.inputValue()).toBe("35.5");
	const saved = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
	);
	await field.press("Enter");
	expect(await (await saved).json()).toMatchObject({ ok: true });
	await f.settled();
	expect(f.bytes()[file]).toBe(original.replace("bg-brand/50", "bg-brand/[35.5%]"));
	await expect
		.poll(() => f.page.getByRole("button", { name: "Choose background-color", exact: true }).getAttribute("title"))
		.toBe("Linked to --color-brand");
	await f.page.keyboard.press("ControlOrMeta+z");
	await f.settled();
	expect(f.bytes()[file]).toBe(original);
	expect(f.writes).toEqual(["commit", "inverse"]);
	for (const document of documents)
		expect(await document.locator("#subject").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
			before,
		);
});
