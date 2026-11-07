import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * A mirror on the canvas (spool#232): one line re-exporting another frame
 * shows that frame, says whose it is in the Pages list, and keeps showing it
 * after the original is renamed and edited.
 */

const screen = (words: string) => `export default function Checkout() {\n\treturn <main>${words}</main>;\n}\n`;

it("shows its original, names it in the rail, and follows it through a rename", {
	timeout: 180_000,
}, async () => {
	const project = await serveProject({ uiDir: await builtUi() });
	writeFrame(project.root, "checkout", screen("pay"));
	writeDesignFile(project.root, "frames/checkout/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 600 }\n');
	writeFrame(project.root, "checkout-phone", 'export { default } from "../checkout/frame";\n');
	writeDesignFile(project.root, "frames/checkout-phone/frame.json", '{ "x": 450, "y": 0, "w": 320, "h": 600 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);

	const page = await (await testBrowser()).newPage({ viewport: { width: 1440, height: 900 } });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const mirror = page.frameLocator('iframe[title="checkout-phone"]').locator("main");
	await expect.poll(() => mirror.textContent(), { timeout: 60_000 }).toBe("pay");
	const row = page.getByRole("treeitem", { name: /checkout-phone/ });
	await expect.poll(() => row.textContent()).toContain("mirror of checkout");

	const renamed = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/frames/rename`, {
		method: "POST",
		headers: { "content-type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({ from: "checkout", to: "basket" }),
	});
	expect(renamed.status).toBe(204);
	writeFrame(project.root, "basket", screen("pay now"));

	await expect.poll(() => mirror.textContent(), { timeout: 60_000 }).toBe("pay now");
	await expect.poll(() => row.textContent()).toContain("mirror of basket");
	expect(errors).toEqual([]);
});
