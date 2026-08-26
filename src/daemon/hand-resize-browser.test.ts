import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * Resize by handle on a real canvas (#259).
 *
 * The whole gesture end to end: descend to an element, grab the corner cube
 * the ring wears, drag, and let go — the file on disk gains the tokens the
 * drag meant. And the half no static analysis can promise: a width written
 * onto a `flex-1` child compiles, lands and does nothing, so the measurement
 * that follows puts it back and the canvas says so.
 */

const CART = `export default function Frame() {
	return (
		<div className="flex h-full flex-col gap-4 p-6">
			<p className="w-40 bg-black text-sm">two items</p>
			<div className="flex w-64">
				<span className="flex-1 bg-black text-sm">stretched</span>
			</div>
		</div>
	);
}
`;

it("drags an element wider, and puts back a width layout would not take", { timeout: 240_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });

	writeFrame(project.root, "cart", CART);
	writeDesignFile(project.root, "frames/cart/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 600 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);
	const file = join(project.root, "design", "frames", "cart", "frame.tsx");

	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await expect.poll(() => page.locator('iframe[title="cart"]').count(), { timeout: 60_000 }).toBe(1);
	await expect.poll(() => page.frameLocator('iframe[title="cart"]').locator("p").count()).toBe(1);

	const held = async (): Promise<string> => {
		const res = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/selection`, {
			headers: { "X-Spool-Control": project.controlToken },
		});
		const body = (await res.json()) as { selection?: { kind: string; selector?: string }[] };
		const [only] = body.selection ?? [];
		return only === undefined ? "nothing" : (only.selector ?? only.kind);
	};
	/**
	 * Down the ladder to a rung, by kinship (#254): ⌘⏎ takes the first child,
	 * Tab the next sibling. The pointer no longer descends, so a walk that
	 * wants the second child asks for the first and steps sideways.
	 */
	const descendTo = async (walk: readonly { step: "child" | "next"; rung: string }[]): Promise<void> => {
		// the label, rather than the body: inside an open scope a body click keeps
		// moving the pick at that depth, and this walk starts from the frame
		await page.locator('[data-frame-label="cart"]').click();
		await expect.poll(held, { timeout: 20_000 }).toBe("frame");
		for (const { step, rung } of walk) {
			await page.keyboard.press(step === "child" ? "ControlOrMeta+Enter" : "Tab");
			await expect.poll(held, { timeout: 20_000 }).toBe(rung);
		}
	};
	const settled = async (): Promise<void> => {
		await expect.poll(() => page.locator('iframe[title="cart (held)"]').count(), { timeout: 30_000 }).toBe(0);
	};
	/** Grab the corner cube the ring wears and drag it, in the canvas's own space. */
	const dragCorner = async (dx: number, dy: number): Promise<void> => {
		await expect.poll(() => page.locator('[data-element-handle="se"]').count(), { timeout: 30_000 }).toBe(1);
		const knob = await page.locator('[data-element-handle="se"]').boundingBox();
		if (knob === null) throw new Error("the ring drew no corner");
		const from = { x: knob.x + knob.width / 2, y: knob.y + knob.height / 2 };
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		await page.mouse.move(from.x + dx / 2, from.y + dy / 2);
		await page.mouse.move(from.x + dx, from.y + dy);
		await page.mouse.up();
	};

	// the width the drag meant, in the file: 160 + 64 is a whole step, so it is
	// the bare class the frame's author would have written
	await descendTo([
		{ step: "child", rung: "div" },
		{ step: "child", rung: "div > p" },
	]);
	await dragCorner(64, 0);
	await expect.poll(() => readFileSync(file, "utf8"), { timeout: 30_000 }).toContain("w-56");
	// everything else about the literal is untouched, and the height the corner
	// wrote is the one the element already had
	expect(readFileSync(file, "utf8")).toContain("bg-black text-sm");
	await settled();
	await expect
		.poll(async () => (await page.frameLocator('iframe[title="cart"]').locator("p").boundingBox())?.width, {
			timeout: 20_000,
		})
		.toBe(224);

	// and one press puts it back, because a patch is its own inverse
	await page.keyboard.press("ControlOrMeta+z");
	await expect.poll(() => readFileSync(file, "utf8"), { timeout: 30_000 }).toContain("w-40");
	await settled();

	// the half static analysis cannot promise: the span is a flex item, so the
	// class compiles, lands, and the box does not follow it
	const before = readFileSync(file, "utf8");
	await descendTo([
		{ step: "child", rung: "div" },
		{ step: "child", rung: "div > p" },
		{ step: "next", rung: "div > div" },
		{ step: "child", rung: "div > div > span" },
	]);
	await dragCorner(80, 0);
	await expect.poll(() => page.locator('[data-hand-notice="clamped"]').count(), { timeout: 30_000 }).toBe(1);
	await expect.poll(() => readFileSync(file, "utf8"), { timeout: 30_000 }).toBe(before);
});
