import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

const frame = (title: string, extra = "") => `import { useState } from "react";
import { Badge } from "shared/badge";
export default function Frame() {
	const [count, setCount] = useState(0);
	return (
		<main>
			<h1>${title}</h1>
			<Badge />
			<button onClick={() => setCount((n) => n + 1)}>count {count}</button>
		</main>
	);
}
${extra}`;

it("swaps a saved frame into its open document with its state kept, and reloads what React refuses", {
	timeout: 180_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir, experiments: ["fast-refresh"] });
	// a shared component over a module that is no boundary: a store that must keep its one instance
	writeDesignFile(project.root, "shared/store.ts", "export const born = String(Math.random());\n");
	const badge = (label: string) =>
		`import { born } from "./store";\nexport function Badge() { return <p data-born={born}>${label}</p>; }\n`;
	writeDesignFile(project.root, "shared/badge.tsx", badge("one"));
	writeFrame(project.root, "counter", frame("first"));
	writeDesignFile(project.root, "frames/counter/frame.json", '{ "x": 0, "y": 0, "w": 600, "h": 400 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const doc = page.frameLocator('iframe[title="counter"]');
	await expect.poll(() => doc.locator("h1").textContent(), { timeout: 60_000 }).toBe("first");
	const button = await doc.locator("button").boundingBox();
	if (button === null) throw new Error("the frame drew no button");
	// entered, so a click reaches into the document
	await page.mouse.dblclick(button.x + 8, button.y + button.height / 2);
	await expect
		.poll(() => page.locator('iframe[title="counter"]').evaluate((el) => getComputedStyle(el).pointerEvents))
		.toBe("auto");
	await expect.poll(() => doc.locator("button").textContent()).toMatch(/^count \d$/);
	const start = Number((await doc.locator("button").textContent())?.slice(6));
	// clicked where it is once the camera has settled on the entered frame
	for (let i = 0; i < 2 - start; i++) await doc.locator("button").click();
	await expect.poll(() => doc.locator("button").textContent()).toBe("count 2");

	// a component's text changed: swapped in, the count kept
	writeFrame(project.root, "counter", frame("second"));
	await expect.poll(() => doc.locator("h1").textContent(), { timeout: 30_000 }).toBe("second");
	expect(await doc.locator("button").textContent()).toBe("count 2");

	// a shared component changed: it alone runs again, so the store it imports keeps its instance
	const born = await doc.locator("p").getAttribute("data-born");
	writeDesignFile(project.root, "shared/badge.tsx", badge("two"));
	await expect.poll(() => doc.locator("p").textContent(), { timeout: 30_000 }).toBe("two");
	expect(await doc.locator("p").getAttribute("data-born")).toBe(born);
	expect(await doc.locator("button").textContent()).toBe("count 2");

	// asks that overlap in one document coalesce into the latest: nothing throws, and the next save still swaps
	await page.evaluate(() => {
		const errors: unknown[] = [];
		(window as unknown as { frameErrors: unknown[] }).frameErrors = errors;
		addEventListener("message", (event) => {
			if ((event.data as { spool?: unknown } | null)?.spool === "error") errors.push(event.data);
		});
	});
	await page.locator('iframe[title="counter"]').evaluate((el) => {
		const target = (el as HTMLIFrameElement).contentWindow;
		target?.postMessage({ spool: "hot", id: 90_001 }, "*");
		target?.postMessage({ spool: "hot", id: 90_002 }, "*");
	});
	writeFrame(project.root, "counter", frame("overlapped"));
	await expect.poll(() => doc.locator("h1").textContent(), { timeout: 30_000 }).toBe("overlapped");
	expect(await doc.locator("button").textContent()).toBe("count 2");
	expect(await page.evaluate(() => (window as unknown as { frameErrors: unknown[] }).frameErrors)).toEqual([]);

	// an export that is no component: React Refresh can't keep it, so the document reloads
	writeFrame(project.root, "counter", frame("third", "export const items = [1];\n"));
	await expect.poll(() => doc.locator("h1").textContent(), { timeout: 30_000 }).toBe("third");
	await expect.poll(() => doc.locator("button").textContent()).toBe("count 0");
});
