import { expect, it } from "vitest";
import { originCanvas } from "./hand-origin-browser-helpers";

const file = "shared/card.tsx";
const card = `import {useState} from 'react';export function Card(){const [count,setCount]=useState(0);return <section id="subject" className="p-6 brightness-75 grayscale"><button id="counter" onClick={()=>setCount(count+1)}>{count}</button><input id="native" defaultValue="initial"/></section>}`;
const frame =
	'import {Card} from "shared/card";export default function Frame(){return <main style={{padding:40}}><Card/></main>}';

it.each(["latest sample", "cancel"] as const)(
	"keeps compiler-composed brightness and independent grayscale during held plans: %s",
	{ timeout: 120000 },
	async (boundary) => {
		const f = await originCanvas({ [file]: card }, frame, "#subject", true);
		const second = f.page.frameLocator('iframe[title="second"]');
		const targets = [f.target, second.locator("#subject")];
		for (const document of [f.frame, second]) {
			await document.locator("#counter").evaluate((element) => (element as HTMLButtonElement).click());
			await expect.poll(() => document.locator("#counter").textContent()).toBe("1");
			await document.locator("#native").evaluate((element) => {
				if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
				element.value = "retained draft";
				element.setSelectionRange(2, 5);
				Reflect.set(window, "composedNative", element);
			});
		}
		for (const target of targets)
			expect(await target.evaluate((element) => getComputedStyle(element).filter)).toBe(
				"brightness(0.75) grayscale(1)",
			);
		await f.select();
		await expect
			.poll(async () => {
				const response = await fetch(`${f.project.url}/api/p/${f.project.name}/selection`, {
					headers: { "X-Spool-Control": f.project.controlToken },
				});
				const body = await response.json();
				return body.selection?.[0]?.selector;
			})
			.toBe("#subject");
		const scrub = f.page.locator('[data-properties-row="brightness"] > span').first();
		await expect.poll(() => scrub.count()).toBe(1);
		await scrub.scrollIntoViewIfNeeded();
		const box = await scrub.boundingBox();
		if (!box) throw new Error("brightness scrub has no native box");
		const x = box.x + 5,
			y = box.y + box.height / 2;
		await f.page.mouse.move(x, y);
		await f.page.mouse.down();
		await f.page.mouse.move(x + 8, y);
		for (const target of targets)
			await expect
				.poll(() => target.evaluate((element) => getComputedStyle(element).filter))
				.toBe("brightness(0.77) grayscale(1)");
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		let waiting = 0;
		const replies: Promise<void>[] = [];
		await f.page.route("**/source", async (route) => {
			if (route.request().postDataJSON()?.action !== "preview") return route.continue();
			const response = await route.fetch();
			waiting++;
			const reply = held.then(() => route.fulfill({ response }));
			replies.push(reply);
			await reply;
		});
		try {
			await f.page.mouse.move(x + 16, y);
			await expect.poll(() => waiting).toBe(1);
			if (boundary === "latest sample")
				for (const target of targets)
					await expect
						.poll(() => target.evaluate((element) => getComputedStyle(element).filter))
						.toBe("brightness(0.79) grayscale(1)");
			expect(f.writes).toEqual([]);
			expect(f.bytes()[file]).toBe(card);
		} finally {
			await f.page.keyboard.press("Escape");
			await f.page.mouse.up();
			release();
			await Promise.all(replies);
		}
		for (const target of targets)
			await expect
				.poll(() => target.evaluate((element) => getComputedStyle(element).filter))
				.toBe("brightness(0.75) grayscale(1)");
		for (const document of [f.frame, second]) {
			expect(await document.locator("#counter").textContent()).toBe("1");
			expect(
				await document.locator("#native").evaluate((element) => {
					if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
					return [
						element === Reflect.get(window, "composedNative"),
						element.value,
						element.selectionStart,
						element.selectionEnd,
					];
				}),
			).toEqual([true, "retained draft", 2, 5]);
		}
		expect(f.bytes()[file]).toBe(card);
		expect(f.writes).toEqual([]);
	},
);
