import { expect, it } from "vitest";
import { apiRequests, handCanvas, VEIL_FILES, VEIL_PAGE } from "./hand-browser-helpers";

/**
 * Entering and moving between elements, on a real landing page (#321).
 *
 * The fixture is the shaders veil page. A person picks the edit tool and walks
 * into the page the way they would in a design tool: a click on the section, a
 * double-click on the heading, another on its words. Nothing on that walk hands
 * the prototype the pointer, the ring tells the truth about the box it is
 * drawn round, and the rail's numbers take a drag.
 */

/** The rung the canvas last told the daemon it is pointing at: its tag, or the frame. */
async function heldTag(project: { url: string; name: string; controlToken: string }): Promise<string> {
	const response = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/selection`, {
		headers: { "X-Spool-Control": project.controlToken },
	});
	const body = (await response.json()) as { selection?: { kind: string; name?: string }[] };
	const [only] = body.selection ?? [];
	return only === undefined ? "nothing" : (only.name ?? only.kind);
}

it("walks into the page and never hands it the pointer", { timeout: 240_000 }, async () => {
	// shorter than the page it draws, so its root is a wrapper over the whole
	// frame — the rung a first click has to go past
	const f = await handCanvas(VEIL_FILES, VEIL_PAGE, { w: 1100, h: 400 });
	const { page, frame } = f;
	const held = () => heldTag(f.project);
	const label = () => page.locator('[data-frame-label="home"]').innerText();
	const pointerEvents = () =>
		page.locator('iframe[title="home"]').evaluate((element) => getComputedStyle(element).pointerEvents);

	const root = await frame.locator("main.landing").boundingBox();
	const heading = await frame.locator("h1").boundingBox();
	if (root === null || heading === null) throw new Error("the veil page drew nothing");
	expect(root.height).toBeGreaterThanOrEqual(400);
	// on the first line of the heading's own words
	const at = { x: heading.x + 24, y: heading.y + 14 };

	await page.getByRole("button", { name: "edit", exact: true }).click();

	// one click goes past the wrapper and lands on the section, the top-level
	// child under the pointer, exactly as it does in Figma
	await page.mouse.click(at.x, at.y);
	await expect.poll(held, { timeout: 15_000 }).toBe("section");

	// a double-click steps one rung down, onto the heading itself
	await page.mouse.dblclick(at.x, at.y);
	await expect.poll(held, { timeout: 15_000 }).toBe("h1");

	// and another opens its words, rather than cancelling the edit it opened
	await page.mouse.dblclick(at.x, at.y);
	await expect
		.poll(() => frame.locator("h1").first().getAttribute("contenteditable"), { timeout: 15_000 })
		.toBe("plaintext-only");
	expect(
		await frame
			.locator("h1")
			.first()
			.evaluate((el) => el.ownerDocument.activeElement === el),
	).toBe(true);
	// the words take the pointer and nothing else in the document does: the
	// canvas keeps the rest of the frame behind four bands of its own
	await expect.poll(pointerEvents, { timeout: 15_000 }).toBe("auto");
	expect(await page.locator("[data-edit-band]").count()).toBe(4);

	// Escape lets the words go, and the frame's pointer with them
	await page.keyboard.press("Escape");
	await expect.poll(() => frame.locator("h1").first().getAttribute("contenteditable"), { timeout: 15_000 }).toBe(null);
	await expect.poll(pointerEvents, { timeout: 15_000 }).toBe("none");
	expect(await page.locator("[data-edit-band]").count()).toBe(0);

	// then it climbs the rungs the pointer came down
	await page.keyboard.press("Escape");
	await expect.poll(held, { timeout: 15_000 }).toBe("section");
	await page.keyboard.press("Escape");
	await expect.poll(held, { timeout: 15_000 }).toBe("main");
	await page.keyboard.press("Escape");
	await expect.poll(held, { timeout: 15_000 }).toBe("frame");

	// ⏎ walks the same rungs the pointer walked: the branch it rests on is the
	// one it descends, which is the ring the hover is already drawing
	await page.mouse.move(at.x + 2, at.y);
	await expect.poll(() => page.locator(".opacity-50").count(), { timeout: 15_000 }).toBeGreaterThan(0);
	await page.keyboard.press("Enter");
	await expect.poll(held, { timeout: 15_000 }).toBe("section");
	await page.keyboard.press("Enter");
	await expect.poll(held, { timeout: 15_000 }).toBe("h1");
	await page.keyboard.press("Shift+Enter");
	await expect.poll(held, { timeout: 15_000 }).toBe("section");

	// none of that went inside, and neither does the label's own double-click
	expect(await label()).not.toContain("esc exits");
	await page.locator('[data-frame-label="home"]').dblclick();
	expect(await label()).not.toContain("esc exits");
	expect(await pointerEvents()).toBe("none");

	// Select still goes inside, and picking Edit while it is live comes back out
	await page.getByRole("button", { name: "select", exact: true }).click();
	await page.mouse.dblclick(at.x, at.y);
	await expect.poll(label, { timeout: 15_000 }).toContain("esc exits");
	await page.getByRole("button", { name: "edit", exact: true }).click();
	await expect.poll(label, { timeout: 15_000 }).not.toContain("esc exits");
	await expect.poll(pointerEvents, { timeout: 15_000 }).toBe("none");
	await expect.poll(held, { timeout: 15_000 }).toBe("frame");
});

it("keeps its targets off a small element, its ring on the box, and scrubs unbounded", {
	timeout: 240_000,
}, async () => {
	const f = await handCanvas(VEIL_FILES, VEIL_PAGE, { w: 1100, h: 700 });
	const { page, frame } = f;
	const requests = apiRequests(page, f.project.name);
	const inline = (selector: string, property: string) =>
		frame
			.locator(selector)
			.first()
			.evaluate((el, name) => el.style.getPropertyValue(name), property);
	/** What owns the pixel out on the canvas: one of the ring's targets, or the frame under them all. */
	const owns = (x: number, y: number) =>
		page.evaluate(
			(at) => {
				const el = document.elementFromPoint(at.x, at.y);
				const target = el?.closest("[data-element-rotate],[data-element-handle],[data-hand-refusal]") ?? null;
				return target === null ? "frame" : (target.getAttribute("data-element-rotate") ?? "handle");
			},
			{ x, y },
		);

	// --- a small element wears none of the ring's targets ---------------------
	await f.select("a.brand");
	const brand = await frame.locator("a.brand").boundingBox();
	if (brand === null) throw new Error("the veil page drew no brand");
	expect(brand.height).toBeLessThan(24);
	await expect.poll(() => page.locator("[data-element-ring]").count(), { timeout: 15_000 }).toBe(1);
	expect(await page.locator("[data-element-rotate]").count()).toBe(0);
	expect(await page.locator("[data-element-handle]").count()).toBe(0);
	// every point on it, and on the words above and below it, is the frame's
	for (const point of [
		{ x: brand.x + 1, y: brand.y + 1 },
		{ x: brand.x + brand.width - 1, y: brand.y + 1 },
		{ x: brand.x + 1, y: brand.y + brand.height - 1 },
		{ x: brand.x + brand.width - 1, y: brand.y + brand.height - 1 },
		{ x: brand.x + brand.width / 2, y: brand.y + brand.height / 2 },
		{ x: brand.x + brand.width / 2, y: brand.y - 10 },
		{ x: brand.x + brand.width / 2, y: brand.y + brand.height + 10 },
	]) {
		expect(await owns(point.x, point.y), `${point.x},${point.y} is not the frame's`).toBe("frame");
	}

	// --- the ring is the box the element has, not the one it had --------------
	await f.select("div.veil-art", { x: 60, y: 45 });
	await expect.poll(() => page.locator('[data-element-handle="w"]').count(), { timeout: 30_000 }).toBe(1);
	const knob = await page.locator('[data-element-handle="w"]').boundingBox();
	if (knob === null) throw new Error("the ring drew no west handle");
	const wrote = page.waitForResponse((response) => response.url().endsWith("/class"));
	await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
	await page.mouse.down();
	await page.mouse.move(knob.x + knob.width / 2 + 291, knob.y + knob.height / 2);
	await expect.poll(() => inline("div.veil-art", "width"), { timeout: 15_000 }).toBe("699px");
	await page.mouse.up();
	await wrote;
	await expect.poll(() => f.bytes().includes("w-[699px]"), { timeout: 15_000 }).toBe(true);
	// the ring follows the write with no second click: it hugs the new box
	await expect
		.poll(
			async () => {
				const ring = await page.locator("[data-element-ring]").first().boundingBox();
				const box = await frame.locator("div.veil-art").first().boundingBox();
				return ring === null || box === null ? null : Math.round(Math.abs(ring.width - box.width));
			},
			{ timeout: 15_000 },
		)
		.toBeLessThanOrEqual(6);

	// --- the width, scrubbed off the end of the field -------------------------
	const field = page.locator('[data-properties-row="width"] input').first();
	await expect.poll(() => field.count(), { timeout: 15_000 }).toBe(1);
	const spot = await field.boundingBox();
	if (spot === null) throw new Error("the rail drew no width field");
	const from = { x: spot.x + spot.width / 2, y: spot.y + spot.height / 2 };
	await requests.quiet();
	// this browser is a headless shell and grants no pointer lock, so what a
	// case can see of it is the asking: the field takes the pointer at the
	// first whole step, and from there the drag is worth what the hand moved
	await page.evaluate(() => {
		Reflect.set(window, "__lock", []);
		const real = Element.prototype.requestPointerLock;
		Element.prototype.requestPointerLock = function asked(this: Element) {
			(Reflect.get(window, "__lock") as string[]).push(this.tagName.toLowerCase());
			return real.call(this);
		};
	});
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	const drawn: string[] = [];
	// the last of these is past the right edge of the window, let alone the field
	for (const dx of [24, 120, 400, 900]) {
		await page.mouse.move(from.x + dx, from.y);
		await expect.poll(() => inline("div.veil-art", "width"), { timeout: 15_000 }).not.toBe("");
		drawn.push(await inline("div.veil-art", "width"));
	}
	expect(await page.evaluate(() => Reflect.get(window, "__lock"))).toEqual(["input"]);
	// every sample drew, each one wider than the last, and none of them wrote
	expect(new Set(drawn).size).toBe(drawn.length);
	expect(drawn.map((width) => Number.parseInt(width, 10))).toEqual(
		[...drawn.map((w) => Number.parseInt(w, 10))].sort((a, b) => a - b),
	);
	expect(Number.parseInt(drawn[drawn.length - 1] ?? "0", 10)).toBeGreaterThan(699);
	expect(requests.taken().filter((sent) => sent.endsWith("/class"))).toEqual([]);

	// the rail keeps its rows and the ring its handles across the write
	await page.evaluate(() => {
		Reflect.set(window, "__blank", 0);
		Reflect.set(window, "__stop", false);
		const tick = () => {
			const row = document.querySelector('[data-properties-row="width"] input');
			const blank = row === null || (row as HTMLInputElement).value === "";
			const bare = document.querySelectorAll("[data-element-handle]").length === 0;
			if (blank || bare) Reflect.set(window, "__blank", (Reflect.get(window, "__blank") as number) + 1);
			if (Reflect.get(window, "__stop") !== true) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	const saved = page.waitForResponse((response) => response.url().endsWith("/class"));
	const reread = page.waitForResponse((response) => response.url().endsWith("/rungs"));
	await page.mouse.up();
	await saved;
	await reread;
	await expect.poll(() => f.bytes().includes(`w-[${drawn[drawn.length - 1]}]`), { timeout: 15_000 }).toBe(true);
	await page.evaluate(() => Reflect.set(window, "__stop", true));
	expect(await page.evaluate(() => Reflect.get(window, "__blank"))).toBe(0);
	// one write for the whole gesture, however many samples it drew
	expect(requests.taken().filter((sent) => sent.endsWith("/class"))).toHaveLength(1);
});

it("picks the block under the pointer before it opens any words", { timeout: 240_000 }, async () => {
	const f = await handCanvas(VEIL_FILES, VEIL_PAGE, { w: 1100, h: 600 });
	const { page, frame } = f;
	const held = () => heldTag(f.project);
	const editable = () => frame.locator("[contenteditable]").count();
	const pointerEvents = () =>
		page.locator('iframe[title="home"]').evaluate((element) => getComputedStyle(element).pointerEvents);

	const words = await frame.locator("#details h2").boundingBox();
	if (words === null) throw new Error("the veil page drew no work heading");
	const at = { x: words.x + 30, y: words.y + 14 };

	await page.getByRole("button", { name: "edit", exact: true }).click();

	await page.mouse.click(at.x, at.y);
	await expect.poll(held, { timeout: 15_000 }).toBe("section");

	// a click on the section it is already holding is not the words gesture: a
	// container has no words of its own, and an edit opened on one would hand
	// the page the pointer everywhere inside it (#322)
	await page.mouse.click(at.x, at.y);
	await page.waitForTimeout(600);
	expect(await editable()).toBe(0);
	expect(await pointerEvents()).toBe("none");
	await expect.poll(held, { timeout: 15_000 }).toBe("section");

	// with the section held, the two clicks mean the rung under the pointer —
	// the block the heading sits in — and never the words at the bottom of it
	await page.mouse.dblclick(at.x, at.y);
	await expect.poll(held, { timeout: 15_000 }).toBe("div");
	expect(await editable()).toBe(0);

	await page.mouse.dblclick(at.x, at.y);
	await expect.poll(held, { timeout: 15_000 }).toBe("h2");
	expect(await editable()).toBe(0);

	// only on the element already held, and only where it has words of its own
	await page.mouse.dblclick(at.x, at.y);
	await expect
		.poll(() => frame.locator("#details h2").getAttribute("contenteditable"), { timeout: 15_000 })
		.toBe("plaintext-only");

	// and ⌫ on the held heading takes it out of the file
	await page.keyboard.press("Escape");
	await expect.poll(() => frame.locator("#details h2").getAttribute("contenteditable"), { timeout: 15_000 }).toBe(null);
	await expect.poll(held, { timeout: 15_000 }).toBe("h2");
	// the frame holds the keyboard until its own answer lands, so ⌫ waits
	await expect
		.poll(() => page.evaluate(() => document.activeElement?.getAttribute("role") ?? "none"), { timeout: 15_000 })
		.toBe("application");
	await page.keyboard.press("Backspace");
	await expect.poll(() => frame.locator("#details h2").count(), { timeout: 15_000 }).toBe(0);
	await expect.poll(() => f.bytes().includes("Ideas stay"), { timeout: 15_000 }).toBe(false);
});
