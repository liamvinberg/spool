import { expect, it } from "vitest";
import { originCanvas } from "./hand-origin-browser-helpers";

const file = "shared/label.tsx";
const theme = "@theme { --text-tiny: 8px; --text-display: 24px; }";
const frame = `import {useState} from 'react';import 'shared/tokens.css';import {Label} from 'shared/label';export default function Frame(){const [count,setCount]=useState(0);return <main style={{padding:40}}><Label/><button id="counter" onClick={()=>setCount(count+1)}>{count}</button><input id="native" defaultValue="initial"/></main>}`;

it.each(["reference", "custom at reduced zoom"] as const)(
	"keeps numeric token choice authority, metadata and native state: %s",
	{ timeout: 120_000 },
	async (mode) => {
		const custom = mode === "custom at reduced zoom";
		const original = `export function Label(){return <button id="subject" className="${custom ? "text-[8px]" : "text-tiny"} leading-6 text-red-500 p-6">Hello</button>}`;
		const f = await originCanvas({ [file]: original, "shared/tokens.css": theme }, frame, "#subject", true);
		const second = f.page.frameLocator('iframe[title="second"]');
		const targets = [f.target, second.locator("#subject")];
		for (const document of [f.frame, second]) {
			await document.locator("#counter").evaluate((element) => {
				if (!(element instanceof HTMLButtonElement)) throw new Error("missing counter");
				element.click();
			});
			await expect.poll(() => document.locator("#counter").textContent()).toBe("1");
			await document.locator("#native").evaluate((element) => {
				if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
				element.value = "retained choice draft";
				element.setSelectionRange(2, 5);
				Reflect.set(window, "choiceInput", element);
			});
		}
		if (custom) {
			const before = await f.target.boundingBox();
			if (!before) throw new Error("missing original bounds");
			await f.page.keyboard.press("ControlOrMeta+-");
			await f.page.keyboard.press("ControlOrMeta+-");
			await expect
				.poll(async () => (await f.target.boundingBox())?.width ?? before.width)
				.toBeLessThan(before.width * 0.9);
		}
		await f.select();
		const field = f.page.getByRole("textbox", { name: "font-size", exact: true });
		const trigger = f.page.getByRole("button", { name: "font-size token", exact: true });
		await expect.poll(() => field.inputValue()).toBe("8");
		await expect.poll(() => trigger.textContent()).toContain(custom ? "Custom value" : "--text-tiny");
		for (const target of targets)
			expect(await target.evaluate((element) => getComputedStyle(element).fontSize)).toBe("8px");
		if (custom) {
			await field.fill("7.999");
			for (const target of targets)
				await expect.poll(() => target.evaluate((element) => getComputedStyle(element).fontSize)).toBe("7.999px");
			expect(await field.inputValue()).toBe("7.999");
			await field.press("Escape");
			for (const target of targets)
				await expect.poll(() => target.evaluate((element) => getComputedStyle(element).fontSize)).toBe("8px");
		}
		await trigger.click();
		const menu = f.page.getByRole("listbox");
		const tiny = menu.locator('[data-menu-option="tiny"]');
		expect(await tiny.getAttribute("aria-selected")).toBe(String(!custom));
		expect(await tiny.textContent()).toContain("8px");
		const search = menu.getByPlaceholder("find");
		await search.fill("missing-font-choice");
		expect(await menu.getByRole("option").count()).toBe(0);
		await search.fill("display");
		await search.press("ArrowDown");
		expect(f.bytes()[file]).toBe(original);
		expect(f.writes).toEqual([]);
		await search.press("Escape");
		expect(await menu.count()).toBe(0);
		expect(await trigger.evaluate((element) => document.activeElement === element)).toBe(true);
		for (const target of targets)
			expect(await target.evaluate((element) => getComputedStyle(element).fontSize)).toBe("8px");
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		let waiting = false;
		const replies: Promise<void>[] = [];
		await f.page.route("**/source", async (route) => {
			if (route.request().postDataJSON()?.action !== "read") return route.continue();
			const response = await route.fetch();
			expect(await response.json()).toMatchObject({
				ok: true,
				read: { operation: { kind: "property", property: "font-size", scope: "" } },
			});
			waiting = true;
			const reply = held.then(() => route.fulfill({ response }));
			replies.push(reply);
			await reply;
		});
		await trigger.click();
		await menu.getByPlaceholder("find").fill("display");
		expect(await menu.locator('[data-menu-option="display"]').textContent()).toContain("24px");
		const saved = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
		);
		try {
			await menu.getByPlaceholder("find").press("Enter");
			await expect.poll(() => waiting).toBe(true);
			expect(f.bytes()[file]).toBe(original);
			expect(f.writes).toEqual([]);
			for (const target of targets)
				expect(await target.evaluate((element) => getComputedStyle(element).fontSize)).toBe("8px");
		} finally {
			release();
			await Promise.all(replies);
		}
		expect(await (await saved).json()).toMatchObject({ ok: true });
		await f.settled();
		expect(f.writes).toEqual(["commit"]);
		expect(f.bytes()[file]).toBe(original.replace(custom ? "text-[8px]" : "text-tiny", "text-display"));
		for (const target of targets) {
			expect(await target.evaluate((element) => getComputedStyle(element).fontSize)).toBe("24px");
			expect(await target.evaluate((element) => getComputedStyle(element).lineHeight)).toBe("24px");
		}
		await expect.poll(() => trigger.textContent()).toContain("--text-display");
		await f.page.keyboard.press("ControlOrMeta+z");
		await f.settled();
		expect(f.bytes()[file]).toBe(original);
		expect(f.writes).toEqual(["commit", "inverse"]);
		await expect.poll(() => trigger.textContent()).toContain(custom ? "Custom value" : "--text-tiny");
		for (const document of [f.frame, second]) {
			expect(await document.locator("#subject").evaluate((element) => getComputedStyle(element).fontSize)).toBe(
				"8px",
			);
			expect(await document.locator("#counter").textContent()).toBe("1");
			expect(
				await document.locator("#native").evaluate((element) => {
					if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
					return [
						element === Reflect.get(window, "choiceInput"),
						element.value,
						element.selectionStart,
						element.selectionEnd,
					];
				}),
			).toEqual([true, "retained choice draft", 2, 5]);
		}
	},
);

it("preserves a bound reference without a proved step scale until explicit custom typing", {
	timeout: 120_000,
}, async () => {
	const original =
		'export function Label(){return <button id="subject" className="text-tiny leading-6 p-6">Hello</button>}';
	const f = await originCanvas({ [file]: original, "shared/tokens.css": theme }, frame, "#subject", true);
	await f.select();
	const field = f.page.getByRole("textbox", { name: "font-size", exact: true });
	const trigger = f.page.getByRole("button", { name: "font-size token", exact: true });
	await expect.poll(() => field.inputValue()).toBe("8");
	await field.focus();
	await field.press("ArrowUp");
	expect(await field.inputValue()).toBe("8");
	await field.press("Enter");
	expect(f.bytes()[file]).toBe(original);
	expect(f.writes).toEqual([]);
	await expect.poll(() => trigger.textContent()).toContain("--text-tiny");
	await field.fill("9.25");
	await field.press("ArrowUp");
	expect(await field.inputValue()).toBe("10.25");
	const saved = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
	);
	await field.press("Enter");
	expect(await (await saved).json()).toMatchObject({ ok: true });
	await f.settled();
	expect(f.bytes()[file]).toBe(original.replace("text-tiny", "text-[10.25px]"));
	for (const document of [f.frame, f.page.frameLocator('iframe[title="second"]')])
		expect(await document.locator("#subject").evaluate((element) => getComputedStyle(element).fontSize)).toBe(
			"10.25px",
		);
	await f.page.keyboard.press("ControlOrMeta+z");
	await f.settled();
	expect(f.bytes()[file]).toBe(original);
	expect(f.writes).toEqual(["commit", "inverse"]);
	await expect.poll(() => trigger.textContent()).toContain("--text-tiny");
	for (const document of [f.frame, f.page.frameLocator('iframe[title="second"]')])
		expect(await document.locator("#subject").evaluate((element) => getComputedStyle(element).fontSize)).toBe("8px");
});
