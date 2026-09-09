import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import { GESTURE_FEEDBACK_MS } from "../runtime/jsx-dev-runtime";
import { originCanvas } from "./hand-origin-browser-helpers";

const file = "shared/feedback.tsx";
const source = 'export function Label(){return <h1 id="label">Before</h1>}';
const consumer =
	'import {Label} from "shared/feedback";export default function Frame(){return <main style={{padding:40}}><Label/><h2 id="unrelated">Before</h2></main>}';
async function preview(beforeLoad?: (page: Page) => Promise<void>) {
	const f = await originCanvas({ [file]: source }, consumer, "#label", true, beforeLoad);
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

it("cancels native input before the shared preview echo arrives", { timeout: 120000 }, async () => {
	const source = 'export function Label(){return <h1 id="label">Before</h1>}';
	const f = await originCanvas(
		{ "shared/label.tsx": source },
		'import {Label} from "shared/label";export default function Frame(){return <main style={{padding:40}}><Label/></main>}',
		"#label",
		true,
	);
	await f.page.evaluate(() => {
		addEventListener(
			"message",
			(event) => {
				if (event.data?.spool === "source-preview") event.stopImmediatePropagation();
			},
			{ capture: true },
		);
	});
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Cancel me");
	expect(await f.target.textContent()).toBe("Cancel me");
	await f.page.keyboard.press("Escape");
	await expect.poll(() => f.target.getAttribute("contenteditable")).toBeNull();
	expect(f.bytes()).toEqual({ "shared/label.tsx": source });
	expect(f.writes).toEqual([]);
	expect(await f.target.textContent()).toBe("Before");
});

it.each(["primary", "secondary"])(
	"preserves an outside attribute-presence change in the %s preview",
	{ timeout: 120000 },
	async (target) => {
		const source = 'export function Label(){return <h1 id="label" title="">Before</h1>}';
		const f = await originCanvas({ [file]: source }, consumer, "#label", true);
		const second = f.page.frameLocator('iframe[title="second"]');
		await second.locator("#label").waitFor();
		await f.select();
		const title = f.page.getByRole("textbox", { name: "title", exact: true });
		await title.fill("Temporary");
		await expect.poll(() => second.locator("#label").getAttribute("title")).toBe("Temporary");
		await title.fill("");
		await expect.poll(() => second.locator("#label").getAttribute("title")).toBe("");
		const changed = target === "primary" ? f.target : second.locator("#label");
		const other = target === "primary" ? second.locator("#label") : f.target;
		await changed.evaluate((element) => element.removeAttribute("title"));
		await title.press("Escape");
		await expect.poll(() => other.getAttribute("title")).toBe("");
		expect(await changed.getAttribute("title")).toBeNull();
		expect(f.bytes()[file]).toBe(source);
		expect(f.writes).toEqual([]);
	},
);

it.each(["Escape", "selection change"])(
	"clears the post-save gesture outline immediately on %s",
	{ timeout: 120000 },
	async (action) => {
		const f = await preview(async (page) => {
			await page.addInitScript((gesture: number) => {
				const clears: boolean[] = [];
				Reflect.set(window, "feedbackClears", clears);
				// The gesture's own timer is held inside the frame documents for the
				// length of this case, so what it asks is which message reached the
				// runtime first rather than how fast the runner is. The product keeps
				// its interval; a frame is an iframe, so the canvas's own timers of
				// the same length are left alone.
				const held: (() => void)[] = [];
				Reflect.set(window, "heldGestureTimers", held);
				const schedule = window.setTimeout.bind(window);
				Reflect.set(window, "setTimeout", (handler: TimerHandler, delay?: number, ...rest: unknown[]) => {
					if (window.parent !== window && delay === gesture && typeof handler === "function") {
						held.push(handler as () => void);
						return 0;
					}
					return schedule(handler, delay, ...(rest as []));
				});
				addEventListener(
					"message",
					(event) => {
						if (event.data?.spool === "source-request" && event.data.action === "clear-feedback")
							clears.push(document.querySelector("#label")?.hasAttribute("data-spool-shared-use") ?? false);
					},
					{ capture: true },
				);
			}, GESTURE_FEEDBACK_MS);
		});
		await f.second.locator("#label").evaluate(() => Reflect.get(window, "feedbackClears").splice(0));
		const delivered = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
		);
		const saving = f.save();
		try {
			await f.page.waitForFunction(() => Reflect.get(window, "feedbackInstalled").length === 1, undefined, {
				timeout: 4000,
			});
			expect(await f.second.locator("#label").getAttribute("data-spool-shared-use")).toBe("");
			// the outline is on because the gesture is still running, and it is
			// still running because its one timer is the one being held
			expect(await f.second.locator("#label").evaluate(() => Reflect.get(window, "heldGestureTimers").length)).toBe(
				1,
			);
			if (action === "Escape") await f.page.keyboard.press("Escape");
			else {
				const box = await f.frame.locator("#unrelated").boundingBox();
				if (!box) throw new Error("unrelated heading has no box");
				await f.page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
				await f.page.mouse.click(box.x + 8, box.y + box.height / 2);
				await f.page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
			}
			await f.page.evaluate(
				() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
			);
			expect(await f.second.locator("#label").getAttribute("data-spool-shared-use")).toBeNull();
			// The native action reached the runtime while the gesture was still on.
			// Its own timeout is held, so nothing but this action can have cleared it.
			expect(await f.second.locator("#label").evaluate(() => Reflect.get(window, "feedbackClears"))).toEqual([true]);
		} finally {
			await saving;
			expect((await delivered).ok()).toBe(true);
		}
		expect(f.bytes()[file]).toContain("After");
		expect(f.writes).toEqual(["commit"]);
	},
);

it("does not echo older native text over the initiating frame's newer text and caret", {
	timeout: 120000,
}, async () => {
	const source = "export function Label({id}){return <h1 id={id}>Before</h1>}";
	const f = await originCanvas(
		{ [file]: source },
		'import {Label} from "shared/feedback";export default function Frame(){return <main style={{padding:40}}><Label id="label"/><Label id="peer"/></main>}',
		"#label",
		true,
	);
	const second = f.page.frameLocator('iframe[title="second"]');
	await second.locator("#label").waitFor();
	await f.page.evaluate(() => {
		Reflect.set(window, "heldNativePreviews", []);
		Reflect.set(window, "releaseNativePreview", false);
		addEventListener(
			"message",
			(event) => {
				if (event.data?.spool !== "source-preview" || Reflect.get(window, "releaseNativePreview")) return;
				Reflect.get(window, "heldNativePreviews").push(event.data);
				event.stopImmediatePropagation();
			},
			{ capture: true },
		);
	});
	await f.edit();
	for (const text of ["First", "Second"]) {
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText(text);
	}
	await expect.poll(() => f.page.evaluate(() => Reflect.get(window, "heldNativePreviews").length)).toBe(2);
	expect(await f.frame.locator("#peer").textContent()).toBe("Second");
	const selection = () =>
		f.target.evaluate((element) => {
			const selected = getSelection();
			return {
				anchor: selected?.anchorOffset,
				focus: selected?.focusOffset,
				inside: element.contains(selected?.anchorNode ?? null),
			};
		});
	const caret = await selection();
	expect(caret).toEqual({ anchor: 6, focus: 6, inside: true });
	const held = await f.page.evaluate(() => Reflect.get(window, "heldNativePreviews"));
	await f.page.evaluate(() => Reflect.set(window, "releaseNativePreview", true));
	await f.target.evaluate((_element, data) => parent.postMessage(data, "*"), held[0]);
	await expect.poll(() => second.locator("#label").textContent()).toBe("First");
	expect(await f.target.textContent()).toBe("Second");
	expect(await f.frame.locator("#peer").textContent()).toBe("Second");
	expect(await selection()).toEqual(caret);
	await f.target.evaluate((_element, data) => parent.postMessage(data, "*"), held[1]);
	await expect.poll(() => second.locator("#peer").textContent()).toBe("Second");
	await f.page.keyboard.press("Escape");
	await expect.poll(() => second.locator("#label").textContent()).toBe("Before");
	expect(await f.target.textContent()).toBe("Before");
	expect(await f.frame.locator("#peer").textContent()).toBe("Before");
	expect(f.bytes()[file]).toBe(source);
	expect(f.writes).toEqual([]);
});
