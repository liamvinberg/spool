// Thumbnail path B: a local Playwright renders every frame's HTML standalone and
// screenshots it at 2x — the "runtime asks a local browser for thumbs" architecture.
// Writes public/shots/<id>.png + manifest.json (the app's thumbnail toggle reads these),
// and prints timing so the verdict can compare against in-page self-capture.
//
// Run: pnpm shots   (dev server not required)

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { DOCS } from "../src/docs";
import { sceneFrames } from "../src/scene";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "shots");
mkdirSync(outDir, { recursive: true });

const t0 = performance.now();
const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 2 });
const page = await context.newPage();

// group by size so viewport changes are rare
const frames = [...sceneFrames].sort((a, b) => a.w - b.w || a.h - b.h);

const perFrame: Record<string, { ms: number; w: number; h: number }> = {};
let lastW = 0;
let lastH = 0;

for (const f of frames) {
	const t = performance.now();
	if (f.w !== lastW || f.h !== lastH) {
		await page.setViewportSize({ width: f.w, height: f.h });
		lastW = f.w;
		lastH = f.h;
	}
	const doc = DOCS[f.id];
	if (!doc) continue;
	await page.setContent(doc, { waitUntil: "load" });
	await page.waitForTimeout(350); // let entry animations & first sim frames land
	await page.screenshot({ path: join(outDir, `${f.id}.png`), clip: { x: 0, y: 0, width: f.w, height: f.h } });
	perFrame[f.id] = { ms: Math.round(performance.now() - t), w: f.w, h: f.h };
}

await browser.close();

const totalMs = Math.round(performance.now() - t0);
const times = Object.values(perFrame).map((p) => p.ms);
const avg = Math.round(times.reduce((a, v) => a + v, 0) / Math.max(1, times.length));

writeFileSync(
	join(outDir, "manifest.json"),
	JSON.stringify({ generatedAt: new Date().toISOString(), totalMs, avgMsPerFrame: avg, count: times.length, perFrame }, null, "\t"),
);

console.log(`playwright shots: ${times.length} frames in ${totalMs} ms (avg ${avg} ms/frame, incl. 350 ms settle each)`);
console.log(`→ ${outDir}`);
console.log("reload the app — the playwright thumbnail toggle is now enabled");
