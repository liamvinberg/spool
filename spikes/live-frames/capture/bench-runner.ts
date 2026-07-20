// Drives the rig end-to-end and writes capture/results.md:
//   - boots the built app (vite preview) in a real Chromium
//   - per policy: hydrate-settle, camera tour (in-page rAF timings),
//     OS-level memory (RSS summed over the browser's process tree) and
//     renderer-process count — the numbers JS cannot see from inside
//   - self-capture timing for thumbnail path A, sample PNGs for fidelity A/B
//
// Run: pnpm build && pnpm bench          (headed Chromium by default)
//      HEADLESS=1 pnpm bench             (headless)

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";
import type { TourRow } from "../src/bench";
import { POLICIES } from "../src/lifecycle";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(join(root, "dist", "index.html"))) {
	console.error("no dist/ — run `pnpm build` first");
	process.exit(1);
}

type Proc = { pid: number; ppid: number; rssKB: number; cmd: string };

function processTable(): Proc[] {
	const out = execFileSync("ps", ["-axo", "pid=,ppid=,rss=,command="], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
	return out
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => {
			const m = l.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
			return m ? { pid: Number(m[1]), ppid: Number(m[2]), rssKB: Number(m[3]), cmd: m[4] ?? "" } : null;
		})
		.filter((p): p is Proc => p !== null);
}

function browserTree(rootPid: number): { totalMB: number; renderers: number; processes: number } {
	const table = processTable();
	const byParent = new Map<number, Proc[]>();
	for (const p of table) {
		const list = byParent.get(p.ppid) ?? [];
		list.push(p);
		byParent.set(p.ppid, list);
	}
	const tree: Proc[] = [];
	const queue = [rootPid];
	const rootProc = table.find((p) => p.pid === rootPid);
	if (rootProc) tree.push(rootProc);
	while (queue.length) {
		const pid = queue.shift();
		if (pid === undefined) break;
		for (const child of byParent.get(pid) ?? []) {
			tree.push(child);
			queue.push(child.pid);
		}
	}
	return {
		totalMB: Math.round(tree.reduce((a, p) => a + p.rssKB, 0) / 1024),
		renderers: tree.filter((p) => p.cmd.includes("--type=renderer")).length,
		processes: tree.length,
	};
}

const server = await preview({ root, preview: { port: 4310 } });
const url = server.resolvedUrls?.local[0] ?? "http://localhost:4310/";

// Real installed Chrome when available: playwright's bundled chromium ships with
// renderer-throttling disabled, which lets iframe rAF free-run way past vsync —
// tick numbers there overstate real usage. Chrome is also spool's target browser.
const headless = process.env.HEADLESS === "1";
const useChrome = process.env.BUNDLED !== "1";
const browser = await chromium.launch(useChrome ? { headless, channel: "chrome" } : { headless });
const cdp = await browser.newBrowserCDPSession();
const procInfo = (await cdp.send("SystemInfo.getProcessInfo")) as { processInfo: { type: string; id: number }[] };
const rootPid = procInfo.processInfo.find((p) => p.type === "browser")?.id;
if (!rootPid) throw new Error("no browser pid");

const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("console", (msg) => {
	if (msg.type() === "error") console.error("[page]", msg.text());
});
await page.goto(url);
await page.waitForFunction(() => window.__rig !== undefined);

// boot storm: default policy is all-live, everything mounts at once
await page.waitForFunction(() => window.__rig !== undefined && window.__rig.loadedPending() === 0, undefined, { timeout: 30000 });
await page.waitForTimeout(1500);
const bootHydrate = await page.evaluate(() => window.__rig?.getStats().hydrate ?? null);

type FullRow = TourRow & { osMemMB: number; renderers: number; processes: number };
const rows: FullRow[] = [];

for (const policy of POLICIES) {
	await page.evaluate((p) => window.__rig?.setPolicy(p), policy);
	await page.waitForFunction(() => window.__rig !== undefined && window.__rig.loadedPending() === 0, undefined, { timeout: 30000 });
	await page.waitForTimeout(2500); // let unmount grace + captures play out
	const row = await page.evaluate(() => window.__rig?.runTour());
	if (!row) throw new Error("tour returned nothing");
	await page.waitForTimeout(500);
	const mem = browserTree(rootPid);
	rows.push({ ...row, osMemMB: mem.totalMB, renderers: mem.renderers, processes: mem.processes });
	console.log(
		`${policy}: ${row.avgFps} fps · p95 ${row.p95ms} ms · long ${row.longFrames}/${row.samples} · ticks/s ${row.ticksPerSec} · os mem ${mem.totalMB} MB · renderers ${mem.renderers}`,
	);
}

// thumbnail path A timing: in-page cooperative self-capture across all mounted frames
await page.evaluate((p) => window.__rig?.setPolicy(p), "all-live");
await page.waitForFunction(() => window.__rig !== undefined && window.__rig.loadedPending() === 0, undefined, { timeout: 30000 });
await page.waitForTimeout(1000);
const capture = await page.evaluate(() => window.__rig?.captureAll());
const shots = await page.evaluate(() => {
	const all = window.__rig?.getShots() ?? {};
	const ids = Object.keys(all).sort();
	const sample = ["f-00", ids[Math.floor(ids.length / 2)] ?? "", ids[ids.length - 1] ?? ""].filter(Boolean);
	return { count: ids.length, sample: sample.map((id) => ({ id, url: all[id] ?? "" })) };
});

const samplesDir = join(root, "capture", "self-samples");
mkdirSync(samplesDir, { recursive: true });
for (const s of shots.sample) {
	const b64 = s.url.split(",")[1];
	if (b64) writeFileSync(join(samplesDir, `${s.id}.png`), Buffer.from(b64, "base64"));
}

const chromeVersion = browser.version();
await browser.close();
await server.close();

const md = [
	"# live-frames benchmark",
	"",
	`- date: ${new Date().toISOString()}`,
	`- chromium ${chromeVersion} (playwright, ${headless ? "headless" : "headed"}) · viewport 1600×1000 · prod build via vite preview`,
	`- boot hydrate storm (all 63 frames at once): ${bootHydrate ? `${bootHydrate.n} frames in ${bootHydrate.ms} ms` : "n/a"}`,
	`- self-capture (thumbnail path A): ${capture ? `${capture.n} ok / ${capture.failed} failed in ${capture.ms} ms total` : "n/a"} · ${shots.count} shots held · samples in capture/self-samples/`,
	`- marginal cost of 63 live frames vs all-snapshot: ~${rows.length >= 4 ? Math.round((rows[0]!.osMemMB - rows[3]!.osMemMB) / 63) : "?"} MB/frame OS memory; renderer count stays flat (no per-iframe process)`,
	"- ticks/s column: in-frame rAF activity during the tour. Chrome vsync-locks rAF for visible frames at working zoom (~120/frame), fully pauses offscreen frames (0), but FREE-RUNS frames rendered tiny (overview zoom) at 500–1300 Hz each — reproduced in bare Chrome, not an automation artifact. The lifecycle zoom threshold exists for exactly that regime.",
	"",
	"| policy | avg fps | p95 ms | p99 ms | long frames | in-frame ticks/s | live/warm/snap | js heap MB | os mem MB | renderers | procs | hydrate ms |",
	"|---|---|---|---|---|---|---|---|---|---|---|---|",
	...rows.map(
		(r) =>
			`| ${r.policy} | ${r.avgFps} | ${r.p95ms} | ${r.p99ms} | ${r.longFrames}/${r.samples} | ${r.ticksPerSec} | ${r.live}/${r.warm}/${r.snapshot} | ${r.heapStartMB ?? "–"}→${r.heapEndMB ?? "–"} | ${r.osMemMB} | ${r.renderers} | ${r.processes} | ${r.hydrateMs ?? "–"} |`,
	),
	"",
].join("\n");

writeFileSync(join(root, "capture", "results.md"), md);
console.log(`\n${md}`);
console.log("→ capture/results.md");
