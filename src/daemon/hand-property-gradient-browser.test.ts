import { expect, it } from "vitest";
import { originCanvas } from "./hand-origin-browser-helpers";

it.each(["direction", "position", "alpha"] as const)(
	"keeps fractional gradient %s in one original source gesture",
	{ timeout: 120_000 },
	async (mode) => {
		const file = "shared/label.tsx";
		const original = `export function Label(){return <button id="subject" className="bg-linear-45 from-brand${mode === "alpha" ? "/50" : ""} from-10% to-accent to-90% p-6">Hello</button>}`;
		const css =
			mode === "direction"
				? "linear-gradient(46.5deg, #123456 10%, #abcdef 90%)"
				: mode === "position"
					? "linear-gradient(45deg in oklab, #123456 13.5%, #abcdef 90%)"
					: "linear-gradient(45deg in oklab, color-mix(in oklab, #123456 26.5%, transparent) 10%, #abcdef 90%)";
		const frame = `import 'shared/tokens.css';import {Label} from 'shared/label';export default function Frame(){return <main className="p-10"><Label/><span id="reference" style={{backgroundImage:${JSON.stringify(css)}}}>Reference</span><input id="native" defaultValue="initial"/></main>}`;
		const f = await originCanvas(
			{ [file]: original, "shared/tokens.css": "@theme {--color-brand:#123456;--color-accent:#abcdef;}" },
			frame,
			"#subject",
			true,
		);
		const documents = [f.frame, f.page.frameLocator('iframe[title="second"]')];
		for (const document of documents)
			await document.locator("#native").evaluate((element) => {
				if (!(element instanceof HTMLInputElement)) throw new Error("missing native input");
				element.value = "kept gradient draft";
				element.setSelectionRange(2, 6);
				Reflect.set(window, "gradientInput", element);
			});
		const before = await f.target.evaluate((element) => getComputedStyle(element).backgroundImage);
		const expected = await f.frame
			.locator("#reference")
			.evaluate((element) => getComputedStyle(element).backgroundImage);
		await f.select();
		const field =
			mode === "direction"
				? f.page.locator('[data-properties-row="direction"] input').last()
				: mode === "position"
					? f.page.locator('[data-properties-row="from"] input').last()
					: f.page.locator('[data-properties-row="from"] input').first();
		await expect.poll(() => field.inputValue()).toBe(mode === "direction" ? "45" : mode === "position" ? "10" : "50");
		const firstPlan = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "preview",
		);
		await field.fill(mode === "direction" ? "45.5" : mode === "position" ? "12.5" : "25.5");
		expect(await (await firstPlan).json()).toMatchObject({ ok: true });
		await expect
			.poll(() => f.target.evaluate((element) => getComputedStyle(element).backgroundImage))
			.not.toBe(before);
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
			expect(await field.inputValue()).toBe(mode === "direction" ? "46.5" : mode === "position" ? "13.5" : "26.5");
			await expect.poll(() => waiting).toBe(true);
			expect(f.writes).toEqual([]);
			expect(f.bytes()[file]).toBe(original);
			for (const document of documents)
				await expect
					.poll(() =>
						document.locator("#subject").evaluate((element) => getComputedStyle(element).backgroundImage),
					)
					.toBe(expected);
			await field.press("Escape");
		} finally {
			release();
			await Promise.all(replies);
			await f.page.unroute("**/source");
		}
		for (const document of documents)
			await expect
				.poll(() => document.locator("#subject").evaluate((element) => getComputedStyle(element).backgroundImage))
				.toBe(before);
		expect(f.writes).toEqual([]);
		await field.fill(mode === "direction" ? "45.5" : mode === "position" ? "12.5" : "25.5");
		await field.press("ArrowUp");
		const saved = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
		);
		await field.press("Enter");
		expect(await (await saved).json()).toMatchObject({ ok: true });
		await f.settled();
		expect(f.bytes()[file]).toBe(
			mode === "direction"
				? original.replace("bg-linear-45", "bg-linear-[46.5deg]")
				: mode === "position"
					? original.replace("from-10%", "from-[13.5%]")
					: original.replace("from-brand/50", "from-brand/[26.5%]"),
		);
		await f.page.keyboard.press("ControlOrMeta+z");
		await f.settled();
		expect(f.bytes()[file]).toBe(original);
		expect(f.writes).toEqual(["commit", "inverse"]);
		for (const document of documents)
			expect(
				await document.locator("#native").evaluate((element) => {
					if (!(element instanceof HTMLInputElement)) throw new Error("missing native input");
					return [
						element === Reflect.get(window, "gradientInput"),
						element.value,
						element.selectionStart,
						element.selectionEnd,
					];
				}),
			).toEqual([true, "kept gradient draft", 2, 6]);
	},
);
