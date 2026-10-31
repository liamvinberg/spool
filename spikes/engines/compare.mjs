// spool#219: diffs each engine's render of a frame against Chromium's, and lays them side by side
// on a labelled board (an HTML page screenshotted by Chromium). Throwaway spike.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

const OUT = process.env.OUT ?? "/tmp/s219/out";
const ENGINES = ["chromium-snapshot", "servo", "blitz-js", "blitz"];

function load(path) {
	return PNG.sync.read(readFileSync(path));
}
// crop or pad b onto a's size so a short or wide screenshot still compares
function fit(img, w, h) {
	const out = new PNG({ width: w, height: h });
	out.data.fill(255);
	for (let y = 0; y < Math.min(h, img.height); y++)
		for (let x = 0; x < Math.min(w, img.width); x++) {
			const s = (y * img.width + x) * 4,
				d = (y * w + x) * 4;
			for (let k = 0; k < 4; k++) out.data[d + k] = img.data[s + k];
		}
	return out;
}

const rows = [];
for (const name of readdirSync(OUT).sort()) {
	const dir = join(OUT, name);
	if (!existsSync(join(dir, "chromium.png"))) continue;
	const base = load(join(dir, "chromium.png"));
	const { width: w, height: h } = base;
	const row = { frame: name.replaceAll("__", "/"), w, h };
	for (const e of ENGINES) {
		const p = join(dir, `${e}.png`);
		if (!existsSync(p)) continue;
		const img = fit(load(p), w, h);
		const diff = new PNG({ width: w, height: h });
		const n = pixelmatch(base.data, img.data, diff.data, w, h, { threshold: 0.15, includeAA: false });
		writeFileSync(join(dir, `${e}.diff.png`), PNG.sync.write(diff));
		row[e] = +((100 * n) / (w * h)).toFixed(2);
	}
	const run = existsSync(join(dir, "run.json")) ? JSON.parse(readFileSync(join(dir, "run.json"), "utf8")) : {};
	row.servoErrors = run.servo?.errors ?? run.servo?.error;
	row.blitzError = run.blitz?.error;
	rows.push(row);
	writeFileSync(join(dir, "diff.json"), JSON.stringify(row, null, 2));
}
writeFileSync(join(OUT, "fidelity.json"), JSON.stringify(rows, null, 2));
for (const r of rows)
	console.log(
		`${r.frame.padEnd(44)} snap ${String(r["chromium-snapshot"]).padStart(6)}%  servo ${String(r.servo).padStart(6)}%  blitz-js ${String(r["blitz-js"]).padStart(6)}%  blitz ${String(r.blitz).padStart(6)}%`,
	);

// boards: one per frame, Chromium | Servo | Blitz
const browser = await chromium.launch();
for (const r of rows) {
	const dir = join(OUT, r.frame.replaceAll("/", "__"));
	const cols = [
		["Chromium (today)", "chromium.png", null],
		["Servo 0.7, same TSX", "servo.png", r.servo],
		["Blitz + Boa JS, same TSX", "blitz-js.png", r["blitz-js"]],
		["Blitz, HTML/CSS only", "blitz.png", r.blitz],
	].filter(([, f]) => existsSync(join(dir, f)));
	const colW = r.w > 1000 ? 640 : 330;
	const html = `<!doctype html><html><body style="margin:0;background:#18181b;font:15px/1.3 Inter,system-ui,sans-serif;color:#e4e4e7">
<div style="padding:16px 20px 8px;font-size:18px;color:#fff">${r.frame}</div>
<div style="display:flex;gap:16px;padding:0 20px 20px">${cols
		.map(
			([label, f, pct]) => `<div style="width:${colW}px"><div style="padding:6px 0 8px">${label}${
				pct == null ? "" : ` <span style="color:#a1a1aa">· ${pct}% pixels off</span>`
			}</div><img src="file://${join(dir, f)}" style="width:${colW}px;display:block;outline:1px solid #3f3f46"></div>`,
		)
		.join("")}</div></body></html>`;
	writeFileSync(join(dir, "board.html"), html);
	const page = await browser.newPage({ viewport: { width: 40 + cols.length * (colW + 16), height: 400 }, deviceScaleFactor: 1 });
	await page.goto(`file://${join(dir, "board.html")}`);
	await page.screenshot({ path: join(dir, "board.png"), fullPage: true });
	await page.close();
}
await browser.close();
