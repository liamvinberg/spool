import { readFileSync } from "node:fs";
import type { JSHandle } from "playwright-core";
import { expect, it } from "vitest";
import type { SourceResult } from "../source-edit";
import { originCanvas } from "./hand-origin-browser-helpers";

const source = 'export function Label(){return <h1 id="label">Before</h1>}';
const consumer = `import {useState} from 'react';import {Label} from 'shared/label';export default function Frame(){const [count,setCount]=useState(0);return <main style={{padding:40}}><Label/><input id="draft" defaultValue="native"/><button id="counter" onClick={()=>setCount(n=>n+1)}>{count}</button><button id="outside" onClick={()=>{document.getElementById('label').textContent='Outside'}}>Outside</button></main>}`;

it.each([false, true])(
	"removes expired shared previews while preserving outside mutation=%s",
	{ timeout: 120000 },
	async (outside) => {
		let expires = 0;
		let checked = false;
		const f = await originCanvas({ "shared/label.tsx": source }, consumer, "#label", true, async (page) => {
			await page.route("**/source", async (route) => {
				const body = route.request().postDataJSON();
				if (body.action === "commit") {
					const response = await route.fetch();
					const result = (await response.json()) as SourceResult;
					if (!result.ok || !result.publication) throw new Error("the actual saved publication is missing");
					expires = result.publication.admission.expires;
					await route.fulfill({ response });
				} else if (body.action === "current" && expires > Date.now()) {
					const response = await route.fetch();
					expect(await response.json()).toEqual({ current: true });
					checked = true;
					if (outside)
						await page
							.frameLocator('iframe[title="second"]')
							.locator("#outside")
							.evaluate((element) => {
								if (!(element instanceof HTMLButtonElement)) throw new Error("missing authored outside action");
								element.click();
							});
					// Hold the real current reply past its own issued admission, not a changed native budget.
					await new Promise((resolve) => setTimeout(resolve, Math.max(0, expires - Date.now() + 1)));
					await route.fulfill({ response });
				} else await route.continue();
			});
		});
		const second = f.page.frameLocator('iframe[title="second"]');
		await second.locator("#label").waitFor();
		const native: JSHandle[] = [];
		for (const frame of [f.frame, second]) {
			await frame.locator("#counter").evaluate((element) => {
				if (!(element instanceof HTMLButtonElement)) throw new Error("missing counter");
				element.click();
			});
			await expect.poll(() => frame.locator("#counter").textContent()).toBe("1");
			await frame.locator("#draft").fill("independent input");
			await frame.locator("#draft").evaluate((element) => {
				if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
				element.setSelectionRange(2, 5);
			});
			native.push(await frame.locator("#draft").evaluateHandle((element) => element));
		}
		await f.edit();
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText("After");
		const saved = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
		);
		const delivered = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
		);
		await f.page.keyboard.press("Enter");
		expect(await (await saved).json()).toMatchObject({ ok: true, source: "saved" });
		expect(await (await delivered).json()).toEqual({ ok: true });
		await f.settled();
		expect(checked).toBe(true);
		expect(readFileSync(f.file("shared/label.tsx"), "utf8")).toBe(source.replace("Before", "After"));
		expect(f.writes).toHaveLength(1);
		expect(await f.page.evaluate(() => Reflect.get(window, "originOutcomes"))).toEqual([
			expect.objectContaining({
				installation: "refused",
				rendered: "unverified",
				reason: "the source installation lease expired or was revoked",
			}),
			expect.objectContaining({
				installation: "refused",
				rendered: "unverified",
				reason: "the source installation lease expired or was revoked",
			}),
		]);
		expect(await f.target.textContent()).toBe("Before");
		expect(await second.locator("#label").textContent()).toBe(outside ? "Outside" : "Before");
		for (const [index, frame] of [f.frame, second].entries()) {
			expect(
				await frame.locator("#draft").evaluate((element, original) => element === original, native[index]!),
			).toBe(true);
			expect(
				await frame.locator("#draft").evaluate((element) => {
					if (!(element instanceof HTMLInputElement)) throw new Error("missing retained input");
					return [element.value, element.selectionStart, element.selectionEnd];
				}),
			).toEqual(["independent input", 2, 5]);
			expect(await frame.locator("#counter").textContent()).toBe("1");
		}
	},
);
