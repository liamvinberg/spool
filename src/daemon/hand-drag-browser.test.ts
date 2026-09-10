import { expect, it } from "vitest";
import { apiRequests, handCanvas, VEIL_FILES, VEIL_PAGE } from "./hand-browser-helpers";

/**
 * Handles and gaps, DOM first, on a real landing page (#316).
 *
 * A person grabs the art block's side and pulls it in, grabs it again and
 * changes their mind, then widens the space between two marks. Every sample
 * lands on the element itself with nothing sent to the daemon; a release is
 * one class write and one step on the one stack; an Escape is nothing at all.
 */

it("drags a handle and a band without the daemon, and saves each once", { timeout: 240_000 }, async () => {
	const f = await handCanvas(VEIL_FILES, VEIL_PAGE, { w: 1100, h: 700 });
	const { page, frame } = f;
	const requests = apiRequests(page, f.project.name);
	const style = (selector: string, property: string) =>
		frame
			.locator(selector)
			.first()
			.evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property);
	const inline = (selector: string, property: string) =>
		frame
			.locator(selector)
			.first()
			.evaluate((el, name) => el.style.getPropertyValue(name), property);
	const fileHas = (snippet: string) => expect.poll(() => f.bytes().includes(snippet), { timeout: 15_000 }).toBe(true);
	/** Of everything the canvas sent, the asks a gesture could have made; the rest is the app's own life. */
	const aboutTheElement = (sent: readonly string[]) =>
		sent.filter((one) => /\/(class|rungs|theme|selection)$/.test(one));
	/** Grab one of the ring's targets and pull it, a sample at a time, with what each sample cost. */
	const pull = async (
		grip: string,
		selector: string,
		property: string,
		steps: readonly { dx: number; dy: number }[],
		release = true,
	) => {
		await expect.poll(() => page.locator(`[${grip}]`).count(), { timeout: 30_000 }).toBe(1);
		const knob = await page.locator(`[${grip}]`).boundingBox();
		if (knob === null) throw new Error(`the ring drew no ${grip}`);
		const from = { x: knob.x + knob.width / 2, y: knob.y + knob.height / 2 };
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		const drawn: { worn: string; sent: string[] }[] = [];
		for (const step of steps) {
			await page.mouse.move(from.x + step.dx, from.y + step.dy);
			await expect.poll(() => inline(selector, property)).not.toBe("");
			drawn.push({ worn: await inline(selector, property), sent: requests.taken() });
		}
		if (release) await page.mouse.up();
		return drawn;
	};

	// the frame is the one document throughout: nothing here reloads it
	await frame.locator("body").evaluate(() => Reflect.set(window, "sameDocument", true));
	const sameDocument = () => frame.locator("body").evaluate(() => Reflect.get(window, "sameDocument"));

	// --- the art block's side, pulled in ------------------------------------
	await f.select("div.veil-art", { x: 60, y: 45 });
	await requests.quiet();
	const wrote = page.waitForResponse((response) => response.url().endsWith("/class"));
	// the west side, because the properties rail stands over the east one
	const samples = await pull('data-element-handle="w"', "div.veil-art", "width", [
		{ dx: 97, dy: 0 },
		{ dx: 194, dy: 0 },
		{ dx: 291, dy: 0 },
	]);
	// every sample redrew the element itself, and not one of them asked the daemon
	expect(samples.map((sample) => sample.worn)).toEqual(["893px", "796px", "699px"]);
	expect(aboutTheElement(samples.flatMap((sample) => sample.sent))).toEqual([]);
	// the release is one write, and the file has the size the pointer left
	expect((await wrote).request().method()).toBe("POST");
	await fileHas('<div className="veil-art w-[699px]"></div>');
	expect(aboutTheElement(requests.taken()).filter((sent) => sent.endsWith("/class"))).toHaveLength(1);
	// the frame took the class, lifted the preview and was never reloaded
	await expect.poll(() => inline("div.veil-art", "width")).toBe("");
	expect(await frame.locator("div.veil-art").first().getAttribute("class")).toBe("veil-art w-[699px]");
	expect(await style("div.veil-art", "width")).toBe("699px");
	expect(await sameDocument()).toBe(true);

	// one drag is one step back: the file and the element both return
	await f.history();
	await fileHas('<div className="veil-art w-[990px]"></div>');
	await expect.poll(() => style("div.veil-art", "width")).toBe("990px");
	expect(await sameDocument()).toBe(true);

	// --- the same handle, let go of by Escape --------------------------------
	await requests.quiet();
	const before = f.bytes();
	await pull(
		'data-element-handle="w"',
		"div.veil-art",
		"width",
		[
			{ dx: 120, dy: 0 },
			{ dx: 240, dy: 0 },
		],
		false,
	);
	await page.keyboard.press("Escape");
	await page.mouse.up();
	// the element is as the file still has it, and nothing was written
	await expect.poll(() => inline("div.veil-art", "width")).toBe("");
	expect(await style("div.veil-art", "width")).toBe("990px");
	expect(f.bytes()).toBe(before);
	expect(aboutTheElement(requests.taken()).filter((sent) => sent.endsWith("/class"))).toEqual([]);

	// --- the space between two marks ----------------------------------------
	await f.select("#marks");
	await expect.poll(() => style("#marks", "column-gap")).toBe("16px");
	await requests.quiet();
	const gapWrote = page.waitForResponse((response) => response.url().endsWith("/class"));
	const bands = await pull('data-element-gap="0"', "#marks", "column-gap", [
		{ dx: 8, dy: 0 },
		{ dx: 16, dy: 0 },
	]);
	expect(bands.map((band) => band.worn)).toEqual(["24px", "32px"]);
	expect(aboutTheElement(bands.flatMap((band) => band.sent))).toEqual([]);
	await gapWrote;
	// the shorthand splits: the axis the band stood on takes the new value and
	// the other keeps what the shorthand lent it
	await fileHas('<div id="marks" className="flex gap-x-8 gap-y-4">');
	expect(aboutTheElement(requests.taken()).filter((sent) => sent.endsWith("/class"))).toHaveLength(1);
	await expect.poll(() => inline("#marks", "column-gap")).toBe("");
	expect(await style("#marks", "column-gap")).toBe("32px");
	// only the axis the band stood on: the shorthand still spaces the rows
	expect(await style("#marks", "row-gap")).toBe("16px");
	expect(await sameDocument()).toBe(true);
	requests.stop();
});
