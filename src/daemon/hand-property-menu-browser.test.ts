import { expect, it } from "vitest";
import { originCanvas } from "./hand-origin-browser-helpers";

const file = "shared/label.tsx";
const source =
	'export function Label(){return <button id="subject" className="p-6 text-brand text-lg leading-6 font-medium">Hello</button>}';
const theme = "@theme { --color-brand: #123456; }";
const frame =
	'import {useState} from "react";import "shared/tokens.css";import {Label} from "shared/label";export default function Frame(){const [count,setCount]=useState(0);return <main style={{padding:40,color:"rgb(9, 8, 7)"}}><Label/><button id="counter" onClick={()=>setCount(count+1)}>{count}</button><input id="native" defaultValue="initial"/></main>}';

async function sharedMenu(original = source) {
	const f = await originCanvas({ [file]: original, "shared/tokens.css": theme }, frame, "#subject", true);
	const documents = [f.frame, f.page.frameLocator('iframe[title="second"]')];
	const targets = documents.map((document) => document.locator("#subject"));
	for (const document of documents) {
		await document.locator("#counter").evaluate((element) => {
			if (!(element instanceof HTMLButtonElement)) throw new Error("missing counter");
			element.click();
		});
		await expect.poll(() => document.locator("#counter").textContent()).toBe("1");
		await document.locator("#native").evaluate((element) => {
			if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
			element.value = "retained menu state";
			element.setSelectionRange(2, 5);
			Reflect.set(window, "menuInput", element);
		});
	}
	const native = async (color: string, weight: string) => {
		for (const target of targets)
			await expect
				.poll(() =>
					target.evaluate((element) => {
						const style = getComputedStyle(element);
						return {
							color: style.color,
							weight: style.fontWeight,
							size: style.fontSize,
							leading: style.lineHeight,
						};
					}),
				)
				.toEqual({ color, weight, size: "18px", leading: "24px" });
	};
	const retained = async () => {
		for (const document of documents) {
			expect(await document.locator("#counter").textContent()).toBe("1");
			expect(
				await document.locator("#native").evaluate((element) => {
					if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
					return [
						element === Reflect.get(window, "menuInput"),
						element.value,
						element.selectionStart,
						element.selectionEnd,
					];
				}),
			).toEqual([true, "retained menu state", 2, 5]);
		}
	};
	const reply = (action: "read" | "commit" | "inverse") =>
		f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === action,
		);
	await f.select();
	return { ...f, native, retained, reply };
}

it("removes shared color through its actual control and restores its reference with source Undo", {
	timeout: 120_000,
}, async () => {
	const f = await sharedMenu();
	await f.native("rgb(18, 52, 86)", "500");
	const trigger = f.page.getByRole("button", { name: "Choose color", exact: true });
	await expect.poll(() => trigger.getAttribute("title")).toBe("Linked to --color-brand");
	await trigger.click();
	const remove = f.page.getByRole("button", { name: "Remove color", exact: true });
	await expect.poll(() => remove.count()).toBe(1);
	await f.page.keyboard.press("Escape");
	expect(f.writes).toEqual([]);
	expect(f.bytes()[file]).toBe(source);
	await f.native("rgb(18, 52, 86)", "500");
	await trigger.click();
	const read = f.reply("read");
	const saved = f.reply("commit");
	await remove.click();
	expect(await (await read).json()).toMatchObject({
		ok: true,
		read: { operation: { kind: "property", property: "color", scope: "" } },
	});
	expect(await (await saved).json()).toMatchObject({ ok: true, source: "saved" });
	await f.settled();
	expect(f.writes).toEqual(["commit"]);
	expect(f.bytes()[file]).toBe(source.replace("text-brand", ""));
	await f.native("rgb(9, 8, 7)", "500");
	await f.retained();
	const inverse = f.reply("inverse");
	await f.history();
	expect(await (await inverse).json()).toMatchObject({ ok: true, source: "saved" });
	await f.settled();
	expect(f.bytes()[file]).toBe(source);
	expect(f.writes).toEqual(["commit", "inverse"]);
	await f.native("rgb(18, 52, 86)", "500");
	await f.select();
	await expect.poll(() => trigger.getAttribute("title")).toBe("Linked to --color-brand");
	await f.retained();
});

it("chooses shared font weight through the retained menu without changing color or other typography", {
	timeout: 120_000,
}, async () => {
	const f = await sharedMenu();
	await f.native("rgb(18, 52, 86)", "500");
	const trigger = f.page.getByRole("button", { name: "font-weight", exact: true });
	await trigger.click();
	const menu = f.page.getByRole("listbox");
	expect(await menu.locator('[data-menu-option="font-medium"]').getAttribute("aria-selected")).toBe("true");
	const search = menu.getByPlaceholder("find");
	await search.fill("font-bold");
	await search.press("Escape");
	expect(await menu.count()).toBe(0);
	expect(await trigger.evaluate((element) => document.activeElement === element)).toBe(true);
	expect(f.writes).toEqual([]);
	expect(f.bytes()[file]).toBe(source);
	await f.native("rgb(18, 52, 86)", "500");
	await trigger.click();
	await search.fill("font-bold");
	const read = f.reply("read");
	const saved = f.reply("commit");
	await menu.locator('[data-menu-option="font-bold"]').click();
	expect(await (await read).json()).toMatchObject({
		ok: true,
		read: { operation: { kind: "property", property: "font-weight", scope: "" } },
	});
	expect(await (await saved).json()).toMatchObject({ ok: true, source: "saved" });
	await f.settled();
	expect(f.bytes()[file]).toBe(source.replace("font-medium", "font-bold"));
	expect(f.writes).toEqual(["commit"]);
	await f.native("rgb(18, 52, 86)", "700");
	await f.retained();
	for (const redo of [false, true]) {
		const inverse = f.reply("inverse");
		await f.history(redo);
		expect(await (await inverse).json()).toMatchObject({ ok: true, source: "saved" });
		await f.settled();
		expect(f.bytes()[file]).toBe(redo ? source.replace("font-medium", "font-bold") : source);
		await f.native("rgb(18, 52, 86)", redo ? "700" : "500");
		await f.select();
		await trigger.click();
		expect(
			await menu.locator(`[data-menu-option="font-${redo ? "bold" : "medium"}"]`).getAttribute("aria-selected"),
		).toBe("true");
		await f.page.keyboard.press("Escape");
	}
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
	await f.retained();
});

it("writes the weight into the member that pins it, and leaves the colour alone", {
	timeout: 120_000,
}, async () => {
	const original = source.replace('id="subject"', 'id="subject" style={{fontWeight:550}}');
	const f = await sharedMenu(original);
	await f.native("rgb(18, 52, 86)", "550");
	await f.page.getByRole("button", { name: "font-weight", exact: true }).click();
	const menu = f.page.getByRole("listbox");
	await menu.getByPlaceholder("find").fill("font-bold");
	const committed = f.reply("commit");
	await menu.locator('[data-menu-option="font-bold"]').click();
	const saved = await (await committed).json();
	expect(saved.ok, JSON.stringify({ saved, source: f.bytes()[file] })).toBe(true);
	// the member is the source that decides this property, so the member changes
	// and the class literal stays exactly as it was; the token's own reference
	// goes into the member rather than the pixels it happens to resolve to
	await expect
		.poll(() => f.bytes()[file])
		.toBe(original.replace("fontWeight:550", 'fontWeight:"var(--font-weight-bold)"'));
	await f.native("rgb(18, 52, 86)", "700");
	const color = f.page.getByRole("button", { name: "Choose color", exact: true });
	await color.click();
	expect(await f.page.getByRole("group", { name: "color options", exact: true }).count()).toBe(1);
	await f.page.keyboard.press("Escape");

	const inverse = f.reply("inverse");
	await f.history(false);
	expect(await (await inverse).json()).toMatchObject({ ok: true });
	await expect.poll(() => f.bytes()[file]).toBe(original);
	await f.native("rgb(18, 52, 86)", "550");
	await f.retained();
});
