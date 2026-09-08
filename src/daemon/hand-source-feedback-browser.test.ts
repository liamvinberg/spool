import { expect, it } from "vitest";
import { originCanvas } from "./hand-origin-browser-helpers";

const file = "shared/feedback.tsx";
const source = 'export function Label(){return <h1 id="label">Before</h1>}';
const consumer =
	'import {Label} from "shared/feedback";export default function Frame(){return <main style={{padding:40}}><Label/><h2 id="unrelated">Before</h2></main>}';
async function preview() {
	const f = await originCanvas({ [file]: source }, consumer, "#label", true);
	const second = f.page.frameLocator('iframe[title="second"]');
	await second.locator("#label").waitFor();
	await f.page.evaluate(() => {
		Reflect.set(window, "feedbackInstalled", []);
		addEventListener("message", (event) => {
			const data = event.data;
			if (data?.spool === "source-reply" && data.frame === "second" && data.result?.installation === "installed")
				Reflect.get(window, "feedbackInstalled").push(performance.timeOrigin + performance.now());
		});
	});
	await second.locator("#label").evaluate((el) => {
		const samples: { at: number; on: boolean }[] = [];
		Reflect.set(window, "feedbackSamples", samples);
		const observer = new MutationObserver(() =>
			samples.push({ at: performance.timeOrigin + performance.now(), on: el.hasAttribute("data-spool-shared-use") }),
		);
		observer.observe(el, { attributes: true, attributeFilter: ["data-spool-shared-use"] });
	});
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("After");
	await expect.poll(() => second.locator("#label").getAttribute("data-spool-shared-use")).toBe("");
	expect(await f.target.getAttribute("data-spool-shared-use")).toBeNull();
	expect(await second.locator("#unrelated").getAttribute("data-spool-shared-use")).toBeNull();
	const save = async () => {
		await f.page.keyboard.press("Enter");
		await expect.poll(() => f.bytes()[file]).toContain("After");
		await f.settled();
	};
	return { ...f, second, save };
}

it("keeps shared gesture feedback for 450 ms after the actual retained installation", { timeout: 120000 }, async () => {
	const f = await preview();
	await f.save();
	await expect.poll(() => f.second.locator("#label").getAttribute("data-spool-shared-use")).toBeNull();
	const installed = await f.page.evaluate(() => Reflect.get(window, "feedbackInstalled")[0] as number);
	const samples = await f.second
		.locator("#label")
		.evaluate(() => Reflect.get(window, "feedbackSamples") as { at: number; on: boolean }[]);
	const cleared = samples.filter((sample) => !sample.on).at(-1)?.at;
	expect(installed).toBeTypeOf("number");
	expect(cleared).toBeTypeOf("number");
	// The reply follows the actual installation by one timer turn. Real browser
	// scheduling gets a small tolerance; no clock, timer or runtime is replaced.
	expect(cleared! - installed).toBeGreaterThanOrEqual(350);
	expect(cleared! - installed).toBeLessThan(1500);
	expect(await f.second.locator("#unrelated").getAttribute("data-spool-shared-use")).toBeNull();
});

it("does not let disclosure hover erase an active shared edit outline", { timeout: 120000 }, async () => {
	const f = await preview();
	await f.page.getByRole("button", { name: "Show affected uses", exact: true }).hover();
	await f.page.mouse.move(5, 5);
	expect(await f.second.locator("#label").getAttribute("data-spool-shared-use")).toBe("");
	expect(await f.target.getAttribute("data-spool-shared-use")).toBeNull();
	await f.page.keyboard.press("Escape");
	await expect.poll(() => f.second.locator("#label").getAttribute("data-spool-shared-use")).toBeNull();
	expect(f.bytes()[file]).toBe(source);
});

it("keeps open disclosure feedback beyond the gesture interval and clears it with Escape", {
	timeout: 120000,
}, async () => {
	const f = await preview();
	await f.save();
	await f.page.getByRole("button", { name: "Show affected uses", exact: true }).click();
	await f.page.mouse.move(5, 5);
	await f.page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 650)));
	expect(await f.second.locator("#label").getAttribute("data-spool-shared-use")).toBe("");
	expect(await f.target.getAttribute("data-spool-shared-use")).toBeNull();
	expect(await f.second.locator("#unrelated").getAttribute("data-spool-shared-use")).toBeNull();
	await f.page.keyboard.press("Escape");
	await expect.poll(() => f.second.locator("#label").getAttribute("data-spool-shared-use")).toBeNull();
});
