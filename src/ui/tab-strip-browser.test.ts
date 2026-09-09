import { build } from "esbuild";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";

it("focuses projects across the tab surface while keeping close and drag separate", async () => {
	const bundle = await build({
		stdin: {
			contents: `
				import { createElement, useState } from "react";
				import { createRoot } from "react-dom/client";
				import { TabStrip } from "./src/ui/tab-strip";
				function App() {
					const [focused, setFocused] = useState("/w/alpha");
					return createElement(TabStrip, {
						tabs: [
							{ root: "/w/alpha", name: "alpha" },
							{ root: "/w/spool", name: "spool" },
						],
						focused,
						onFocus: (root) => {
							setFocused(root);
							document.body.dataset.focuses = String(Number(document.body.dataset.focuses ?? 0) + 1);
						},
						onClose: (root) => { document.body.dataset.closed = root; },
						onReorder: () => {},
						onPick: () => {},
					});
				}
				createRoot(document.getElementById("root")).render(createElement(App));
			`,
			resolveDir: process.cwd(),
		},
		bundle: true,
		write: false,
		outfile: "tabs.js",
		format: "iife",
		jsx: "automatic",
		define: { "process.env.NODE_ENV": '"production"' },
	});
	const browser = await testBrowser();
	const page = await browser.newPage({ reducedMotion: "reduce" });
	await page.setContent(`<style>
		* { box-sizing: border-box; }
		body { margin: 0; font-family: sans-serif; }
		button { padding: 0; border: 0; background: transparent; font: inherit; }
		#root { height: 44px; }
	</style><div id="root"></div>`);
	for (const file of bundle.outputFiles) {
		if (file.path.endsWith(".css")) await page.addStyleTag({ content: file.text });
		else await page.addScriptTag({ content: file.text });
	}
	const tab = page.locator('[data-tab="/w/spool"]');
	await tab.waitFor();
	const box = await tab.boundingBox();
	if (box === null) throw new Error("missing tab box");
	const focuses = () => page.locator("body").getAttribute("data-focuses");
	const points = [
		{ name: "label", x: 20, y: 18 },
		{ name: "space after the name", x: box.width - 34, y: 18 },
		{ name: "above close", x: box.width - 16, y: 3 },
		{ name: "below close", x: box.width - 16, y: box.height - 3 },
		{ name: "right edge", x: box.width - 2, y: 18 },
		{ name: "bottom edge", x: box.width / 2, y: box.height + 2 },
	];
	let count = 0;
	for (const point of points) {
		await page.getByRole("button", { name: "alpha", exact: true }).click();
		count += 1;
		for (const state of ["inactive", "active"]) {
			await page.mouse.click(box.x + point.x, box.y + point.y);
			count += 1;
			expect(await focuses(), `${state}: ${point.name}`).toBe(String(count));
			expect(await tab.locator(".project-tab-label").getAttribute("aria-current")).toBe("page");
		}
	}

	await tab.getByRole("button", { name: "Close spool" }).click();
	expect(await page.locator("body").getAttribute("data-closed")).toBe("/w/spool");
	expect(await focuses()).toBe(String(count));

	await page.mouse.move(box.x + box.width - 34, box.y + 18);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width - 54, box.y + 18, { steps: 5 });
	await page.mouse.up();
	expect(await focuses()).toBe(String(count));

	await tab.locator(".project-tab-label").focus();
	await page.keyboard.press("Enter");
	expect(await focuses()).toBe(String(count + 1));
});
