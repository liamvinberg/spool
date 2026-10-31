// Renders a TSX frame written for the own-engine spike and saves a PNG.
// usage: node own/shot.mjs <frame.tsx> <width> <height> <out.png> [wait ms]
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const [entry, w, h, out, wait = "1500", ...clicks] = process.argv.slice(2);
const width = Number(w),
	height = Number(h);
const t0 = Date.now();
const bundle = await build({
	stdin: {
		contents: `import Frame from ${JSON.stringify(resolve(entry))};
import { mount } from "own";
import { createElement } from "react";
mount(document.getElementById("c"), createElement(Frame), { width: ${width}, height: ${height}, dpr: 1,
  fonts: { "Inter": "/fonts/Inter.ttf", "Instrument Sans": "/fonts/InstrumentSans.ttf", "Fragment Mono": "/fonts/FragmentMono.ttf" },
  onFrameStats: (s) => { window.__stats = { ...s }; } })
  .then(() => { window.__mounted = true; }, (e) => { window.__error = String(e && e.stack || e); });`,
		resolveDir: here,
		loader: "tsx",
	},
	bundle: true,
	write: false,
	format: "esm",
	jsx: "automatic",
	alias: { own: join(here, "renderer.jsx") },
	define: { "process.env.NODE_ENV": '"production"' },
	logLevel: "error",
});
const buildMs = Date.now() - t0;
const files = {
	"/": ["text/html", `<!doctype html><html><body style="margin:0;background:#fff"><canvas id="c"></canvas><script src="/ck/canvaskit.js"></script><script type="module" src="/bundle.js"></script></body></html>`],
	"/bundle.js": ["text/javascript", bundle.outputFiles[0].text],
	"/ck/canvaskit.js": ["text/javascript", readFileSync(join(here, "../node_modules/canvaskit-wasm/bin/canvaskit.js"))],
	"/ck/canvaskit.wasm": ["application/wasm", readFileSync(join(here, "../node_modules/canvaskit-wasm/bin/canvaskit.wasm"))],
	"/fonts/Inter.ttf": ["font/ttf", readFileSync(join(here, "fonts/Inter.ttf"))],
	"/fonts/InstrumentSans.ttf": ["font/ttf", readFileSync(join(here, "fonts/InstrumentSans.ttf"))],
	"/fonts/FragmentMono.ttf": ["font/ttf", readFileSync(join(here, "fonts/FragmentMono.ttf"))],
};
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.route("http://own.local/**", (route) => {
	const path = new URL(route.request().url()).pathname;
	const f = files[path];
	return f ? route.fulfill({ contentType: f[0], body: f[1] }) : route.fulfill({ status: 404, body: "" });
});
await page.goto("http://own.local/");
await page.waitForFunction(() => window.__mounted || window.__error, null, { timeout: 30000 }).catch(() => {});
// clicks spread over the wait, like the RSX preview
const slice = Number(wait) / (clicks.length + 1);
for (const c of clicks) {
	await page.waitForTimeout(slice);
	const [x, y] = c.split(",").map(Number);
	await page.mouse.move(x, y);
	await page.mouse.click(x, y);
}
await page.waitForTimeout(slice);
await page.screenshot({ path: out });
const state = await page.evaluate(() => ({ error: window.__error, stats: window.__stats }));
console.log(JSON.stringify({ buildMs, ...state, logs: logs.slice(0, 20) }));
await browser.close();
