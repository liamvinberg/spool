import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * The element tree in the pages rail (#342), on a real canvas.
 *
 * E opens the frame's elements under its row and V folds them away; a row
 * and a canvas click are the same selection; a hidden element is a row like
 * any other, so the tree is how a hand reaches it; and the tree reads the
 * frame again after a write, so it follows what the hand did.
 */

const FRAME = `import { Finishes } from "shared/finishes";

function Hero() {
	return <h1>A canvas for <em>working</em> things out.</h1>;
}

export default function Frame() {
	return (
		<main>
			<Hero />
			<Finishes />
			<p style={{ display: "none" }}>fine print</p>
		</main>
	);
}
`;

const FINISHES = `export function Finishes() {
	return (
		<div className="finishes">
			{["aluminium", "oxblood"].map((finish) => (
				<button type="button" key={finish}>{finish}</button>
			))}
		</div>
	);
}
`;

it("opens the frame's elements under its row in Edit, and reads as one selection with the canvas", {
	timeout: 180_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "store", FRAME);
	writeDesignFile(project.root, "shared/finishes.tsx", FINISHES);
	writeDesignFile(project.root, "frames/store/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 600 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const store = page.frameLocator('iframe[title="store"]');
	await expect.poll(() => store.locator("button").count(), { timeout: 60_000 }).toBe(2);

	const held = async (): Promise<string> => {
		const res = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/selection`, {
			headers: { "X-Spool-Control": project.controlToken },
		});
		const body = (await res.json()) as { selection?: { kind: string; selector?: string }[] };
		const all = body.selection ?? [];
		return all.length === 0 ? "nothing" : all.map((one) => one.selector ?? one.kind).join(", ");
	};
	const rail = page.locator("aside").first();
	const rows = rail.locator("[data-element-row]");
	const row = (selector: string) => rail.locator(`[data-element-row="${selector}"]`);
	const lines = async () => (await rows.allInnerTexts()).map((text) => text.replace(/\s+/g, " ").trim());

	// Select: the frame, and a rail of frames alone
	const oxblood = await store.locator("button").nth(1).boundingBox();
	if (oxblood === null) throw new Error("the store drew no finishes");
	await page.mouse.click(oxblood.x + 4, oxblood.y + oxblood.height / 2);
	await expect.poll(held).toBe("frame");
	const plain = await rail.innerText();
	expect(await rows.count()).toBe(0);

	// E opens the tree under the frame's row, the frame's own elements first
	await page.keyboard.press("e");
	await expect
		.poll(lines)
		.toEqual([
			"<Frame> frame.tsx",
			"<Hero> A canvas for working things out.",
			"<em> working",
			"<Finishes> finishes.tsx",
			"1 <button> aluminium",
			"2 <button> oxblood",
			"<p> fine print",
		]);
	expect((await rail.innerText()).replace(/\s+/g, " ")).toContain(".map ×2 1 <button> aluminium 2 <button> oxblood");

	// a canvas click selects the deepest element, and its row is the one lit
	await page.mouse.click(oxblood.x + 4, oxblood.y + oxblood.height / 2);
	await expect.poll(held).toBe("main > div > button:nth-of-type(2)");
	await expect.poll(() => row("main > div > button:nth-of-type(2)").getAttribute("aria-selected")).toBe("true");

	// hovering a row outlines its element and takes nothing
	await row("main > h1").hover();
	await expect.poll(() => page.locator(".border-thread.opacity-50").count()).toBe(1);
	expect(await held()).toBe("main > div > button:nth-of-type(2)");

	// a row click selects; the keyboard stays the canvas's, so the keys walk from it
	await row("main > h1").locator("button").nth(1).click();
	await expect.poll(held).toBe("main > h1");
	await page.keyboard.press("Tab");
	await expect.poll(held).toBe("main > div");
	await page.keyboard.press("Escape");
	await expect.poll(held).toBe("main");

	// the hidden paragraph is a row, and ⌫ on it deletes it from the file,
	// measured against the file as the selection read it; the tree reads the
	// frame again and the row goes with it
	const read = page.waitForResponse((response) => response.url().endsWith("/rungs"));
	await row("main > p").locator("button").nth(1).click();
	await expect.poll(held).toBe("main > p");
	await read;
	await page.keyboard.press("Backspace");
	await expect
		.poll(() => readFileSync(join(project.root, "design", "frames", "store", "frame.tsx"), "utf8"), {
			timeout: 10_000,
		})
		.not.toContain("fine print");
	await expect.poll(() => row("main > p").count(), { timeout: 10_000 }).toBe(0);

	// V folds it away, and the rail is what it was
	await page.keyboard.press("v");
	await expect.poll(() => rows.count()).toBe(0);
	await page.mouse.click(oxblood.x + 4, oxblood.y + oxblood.height / 2);
	await expect.poll(held).toBe("frame");
	expect(await rail.innerText()).toBe(plain);
});
