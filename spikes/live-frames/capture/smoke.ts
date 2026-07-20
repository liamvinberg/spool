// Throwaway boot QA: console errors, hydrate storm, ticks flowing, policy
// switches, self-capture path. Run: pnpm exec tsx capture/smoke.ts [url]

import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4311/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors: string[] = [];
page.on("console", (m) => {
	if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(url);
await page.waitForFunction(() => window.__rig !== undefined, undefined, { timeout: 15000 });
await page.waitForFunction(() => window.__rig !== undefined && window.__rig.loadedPending() === 0, undefined, { timeout: 30000 });
await page.waitForTimeout(2500);

const boot = await page.evaluate(() => {
	const s = window.__rig?.getStats();
	return { hydrate: s?.hydrate, counts: s?.counts, buckets: s?.buckets, heap: s?.heapMB };
});
console.log("boot:", JSON.stringify(boot));

// zoom to one frame so visible/offscreen buckets split
await page.evaluate(() => {
	const b = { x: 80, y: 80, w: 390, h: 844 };
	const k = 0.9;
	window.__rig?.setCamera({ k, x: 800 - (b.x + b.w / 2) * k, y: 500 - (b.y + b.h / 2) * k });
});
await page.waitForTimeout(2500);
console.log("zoomed-in buckets:", JSON.stringify(await page.evaluate(() => window.__rig?.getStats().buckets)));

// policy: viewport-snapshot → offscreen frames should capture + unmount
await page.evaluate(() => window.__rig?.setPolicy("viewport-snapshot"));
await page.waitForTimeout(4500);
const vs = await page.evaluate(() => {
	const s = window.__rig?.getStats();
	return { counts: s?.counts, shots: Object.keys(window.__rig?.getShots() ?? {}).length };
});
console.log("viewport-snapshot:", JSON.stringify(vs));

// back to all-live: hydrate storm should be measured
await page.evaluate(() => window.__rig?.setPolicy("all-live"));
await page.waitForFunction(() => window.__rig !== undefined && window.__rig.loadedPending() === 0, undefined, { timeout: 30000 });
await page.waitForTimeout(1000);
console.log("rehydrate:", JSON.stringify(await page.evaluate(() => window.__rig?.getStats().hydrate)));

// self-capture all
const cap = await page.evaluate(() => window.__rig?.captureAll());
console.log("captureAll:", JSON.stringify(cap));
const sampleLen = await page.evaluate(() => (window.__rig?.getShots()["f-00"] ?? "").length);
console.log("f-00 shot dataURL length:", sampleLen);

await page.screenshot({ path: "capture/smoke-fit.png" });
await page.evaluate(() => {
	const b = { x: 80, y: 80, w: 390, h: 844 };
	const k = 0.9;
	window.__rig?.setCamera({ k, x: 800 - (b.x + b.w / 2) * k, y: 500 - (b.y + b.h / 2) * k });
});
await page.waitForTimeout(600);
await page.screenshot({ path: "capture/smoke-zoom.png" });

console.log("console errors:", errors.length ? JSON.stringify(errors.slice(0, 10)) : "none");
await browser.close();

// --- interact mode: dblclick a frame, type into it ---------------------------
const b2 = await chromium.launch();
const p2 = await b2.newPage({ viewport: { width: 1600, height: 1000 } });
const errs2: string[] = [];
p2.on("pageerror", (e) => errs2.push(e.message));
await p2.goto(url);
await p2.waitForFunction(() => window.__rig !== undefined && window.__rig.loadedPending() === 0, undefined, { timeout: 30000 });
const { sceneFrames } = await import("../src/scene");
const todo = sceneFrames.find((f) => f.kind === "todo");
if (!todo) throw new Error("no todo frame");
await p2.evaluate((f) => {
	const k = 0.9;
	window.__rig?.setCamera({ k, x: 800 - (f.x + f.w / 2) * k, y: 500 - (f.y + f.h / 2) * k });
}, todo);
await p2.waitForTimeout(400);
await p2.mouse.dblclick(800, 500);
await p2.waitForTimeout(300);
const fl = p2.frameLocator(`[data-frame-id="${todo.id}"] iframe`);
await fl.locator("#inp").click();
await fl.locator("#inp").fill("typed from smoke test");
await fl.locator("#add").click();
const items = await fl.locator("#list > div").count();
console.log(`interact: typed + added → ${items} items (expect 3), pageerrors: ${errs2.length}`);
await p2.screenshot({ path: "capture/smoke-interact.png" });
await b2.close();
