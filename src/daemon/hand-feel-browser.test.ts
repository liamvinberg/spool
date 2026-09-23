import { expect, it } from "vitest";
import { handCanvas, VEIL_FILES, VEIL_PAGE } from "./hand-browser-helpers";

/**
 * The Edit tool on a real landing page (#321, #339).
 *
 * The fixture is the shaders veil page. A person picks the edit tool and
 * clicks: the click lands on the deepest element under the pointer, the keys
 * step from there, and a double-click opens the words. Nothing on that walk
 * hands the prototype the pointer, and the ring tells the truth about the box
 * it is drawn round.
 */

/** What the canvas last told the daemon it is pointing at: each tag, or the frame. */
async function heldTag(project: { url: string; name: string; controlToken: string }): Promise<string> {
	const response = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/selection`, {
		headers: { "X-Spool-Control": project.controlToken },
	});
	const body = (await response.json()) as { selection?: { kind: string; name?: string }[] };
	const all = body.selection ?? [];
	return all.length === 0 ? "nothing" : all.map((one) => one.name ?? one.kind).join(", ");
}

it("lands on the deepest element and never hands the page the pointer", { timeout: 240_000 }, async () => {
	// shorter than the page it draws, so its root is a wrapper over the whole frame
	const f = await handCanvas(VEIL_FILES, VEIL_PAGE, { w: 1100, h: 400 });
	const { page, frame } = f;
	const held = () => heldTag(f.project);
	const label = () => page.locator('[data-frame-label="home"]').innerText();
	const pointerEvents = () =>
		page.locator('iframe[title="home"]').evaluate((element) => getComputedStyle(element).pointerEvents);

	const heading = await frame.locator("h1").boundingBox();
	if (heading === null) throw new Error("the veil page drew nothing");
	// on the first line of the heading's own words
	const at = { x: heading.x + 24, y: heading.y + 14 };

	await page.getByRole("button", { name: "edit", exact: true }).click();

	// one click, and it is the heading: the element the words are in
	await page.mouse.click(at.x, at.y);
	await expect.poll(held, { timeout: 15_000 }).toBe("h1");
	await expect.poll(() => page.locator("[data-name-label]").textContent(), { timeout: 15_000 }).toBe("Heading");

	// a double-click opens its words
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
	// canvas keeps the rest of the frame behind four bands of its own, and the
	// outline is the only cue — no label while the caret is in
	await expect.poll(pointerEvents, { timeout: 15_000 }).toBe("auto");
	expect(await page.locator("[data-edit-band]").count()).toBe(4);
	expect(await page.locator("[data-name-label]").count()).toBe(0);

	// Escape finishes the words, and the frame's pointer goes with them
	await page.keyboard.press("Escape");
	await expect.poll(() => frame.locator("h1").first().getAttribute("contenteditable"), { timeout: 15_000 }).toBe(null);
	await expect.poll(pointerEvents, { timeout: 15_000 }).toBe("none");
	expect(await page.locator("[data-edit-band]").count()).toBe(0);

	// then it climbs to each parent in turn, and to the frame at the top
	await page.keyboard.press("Escape");
	await expect.poll(held, { timeout: 15_000 }).toBe("section");
	await page.keyboard.press("Escape");
	await expect.poll(held, { timeout: 15_000 }).toBe("main");
	await page.keyboard.press("Escape");
	await expect.poll(held, { timeout: 15_000 }).toBe("frame");

	// ⏎ goes back down: the frame's top-level element, then all its children
	await page.keyboard.press("Enter");
	await expect.poll(held, { timeout: 15_000 }).toBe("main");
	await page.keyboard.press("Enter");
	await expect.poll(held, { timeout: 15_000 }).toMatch(/^header, section, div, div, span, div, a, section, footer$/);

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

/**
 * A page that counts everything done to it: hovers, presses, keys, focus and
 * its own animation frames, each onto its own window. Built to show the Edit
 * tool is inert (#339): with it on, none of the first four move and the last
 * stops; with it off, all of them are the page's again.
 */
const COUNTING = `export default function Frame() {
	const count = (name: string) => () => {
		const held = window as unknown as Record<string, number>;
		held[name] = (held[name] ?? 0) + 1;
	};
	return (
		<main style={{ padding: 24, fontFamily: "system-ui" }}>
			<button
				id="go"
				style={{ fontSize: 24, padding: 16 }}
				onPointerEnter={count("hovered")}
				onMouseOver={count("hovered")}
				onClick={count("clicked")}
				onFocus={count("focused")}
			>
				Press me
			</button>
			<p
				ref={(el) => {
					if (el === null) return;
					const view = el.ownerDocument.defaultView as unknown as Record<string, unknown> | null;
					if (view === null || view.spun !== undefined) return;
					view.spun = 0;
					const loop = () => {
						(view.spun as number)++;
						(view.requestAnimationFrame as (cb: () => void) => void)(loop);
					};
					(view.requestAnimationFrame as (cb: () => void) => void)(loop);
					el.ownerDocument.addEventListener("keydown", count("typed"));
					el.ownerDocument.addEventListener("keyup", count("typed"));
				}}
			>
				spinning
			</p>
		</main>
	);
}
`;

it("keeps every pointer and key off the page while Edit is on, and holds its animation", {
	timeout: 240_000,
}, async () => {
	const f = await handCanvas({}, COUNTING, { w: 700, h: 400 });
	const { page, frame } = f;
	const held = () => heldTag(f.project);
	const counted = (name: string) =>
		frame
			.locator("main")
			.evaluate((el, key) => (el.ownerDocument.defaultView as unknown as Record<string, number>)[key] ?? 0, name);
	/** How many animation frames the page ran over a third of a second. */
	const ran = async () => {
		const before = await counted("spun");
		await page.waitForTimeout(300);
		return (await counted("spun")) - before;
	};
	const button = await frame.locator("#go").boundingBox();
	if (button === null) throw new Error("the counting page drew no button");
	const at = { x: button.x + button.width / 2, y: button.y + button.height / 2 };

	await expect.poll(ran, { timeout: 30_000 }).toBeGreaterThan(4);

	await page.keyboard.press("e");
	await expect.poll(ran, { timeout: 15_000 }).toBe(0);

	// hover, click, a double-click on its words, and typing: the canvas hears
	// all of it and the page none of it
	await page.mouse.move(at.x - 10, at.y);
	await page.mouse.move(at.x, at.y);
	await page.mouse.click(at.x, at.y);
	await expect.poll(held, { timeout: 15_000 }).toBe("button");
	await page.keyboard.type("xyz");
	await page.mouse.dblclick(at.x, at.y);
	await expect
		.poll(() => frame.locator("#go").getAttribute("contenteditable"), { timeout: 15_000 })
		.toBe("plaintext-only");
	await page.mouse.move(at.x + 4, at.y + 2);
	await page.keyboard.press("Escape");
	await expect.poll(() => frame.locator("#go").getAttribute("contenteditable"), { timeout: 15_000 }).toBe(null);
	// ⏎ opens them from the canvas, and its release, which lands after the
	// focus has gone into the frame, is still the canvas's
	await expect
		.poll(() => page.evaluate(() => document.activeElement?.getAttribute("role") ?? "none"), { timeout: 15_000 })
		.toBe("application");
	await page.keyboard.press("Enter");
	await expect
		.poll(() => frame.locator("#go").getAttribute("contenteditable"), { timeout: 15_000 })
		.toBe("plaintext-only");
	await page.keyboard.press("Escape");
	await expect.poll(() => frame.locator("#go").getAttribute("contenteditable"), { timeout: 15_000 }).toBe(null);
	for (const name of ["hovered", "clicked", "focused", "typed"]) expect(await counted(name), name).toBe(0);
	// and the page stayed held the whole way through
	expect(await ran()).toBe(0);

	// putting the tool down gives the page its animation back
	await page.keyboard.press("v");
	await expect.poll(ran, { timeout: 15_000 }).toBeGreaterThan(4);
});

it("puts the ring back on the element a step was about", { timeout: 240_000 }, async () => {
	const f = await handCanvas(VEIL_FILES, VEIL_PAGE, { w: 1100, h: 700 });
	const { page, frame } = f;
	const held = () => heldTag(f.project);
	/** How far the ring is from the box of the element it is drawn round. */
	const hugging = async () => {
		const ring = await page.locator("[data-element-ring]").first().boundingBox();
		const box = await frame.locator("div.veil-art").first().boundingBox();
		return ring === null || box === null ? null : Math.round(Math.abs(ring.width - box.width));
	};

	await f.select("div.veil-art", { x: 60, y: 45 });
	await expect.poll(held, { timeout: 30_000 }).toBe("div");
	await expect.poll(hugging, { timeout: 15_000 }).toBeLessThanOrEqual(6);

	// a step that takes the element away leaves nothing to point at, while the
	// step that brings it back is picked again
	const deleted = page.waitForResponse((response) => response.url().endsWith("/element"));
	await page.keyboard.press("Backspace");
	await (await deleted).finished();
	await expect.poll(() => frame.locator("div.veil-art").count(), { timeout: 15_000 }).toBe(0);
	await expect.poll(held, { timeout: 15_000 }).toBe("frame");
	await f.history();
	await expect.poll(() => frame.locator("div.veil-art").count(), { timeout: 15_000 }).toBe(1);
	await expect.poll(held, { timeout: 15_000 }).toBe("div");
	await expect.poll(hugging, { timeout: 15_000 }).toBeLessThanOrEqual(6);
	await f.history(true);
	await expect.poll(() => frame.locator("div.veil-art").count(), { timeout: 15_000 }).toBe(0);
	await expect.poll(held, { timeout: 15_000 }).toBe("frame");
});
