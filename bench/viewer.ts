import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { type Browser, type CDPSession, chromium, type Page } from "playwright-core";
import { repoRoot } from "./harness.ts";

/**
 * The read-only canvas (spool.page, `src/ui/viewer`) on a synthetic page of
 * ~600 frames, a third of them with covers: what a pan and a zoom cost there,
 * and how many documents the canvas keeps and boots.
 *
 *   node bench/viewer.ts [--frames 600] [--covered 3] [--rounds 2] [--build <dir>[,<dir>...]] [--gpu vulkan|none]
 *
 * With no `--build` the checkout's viewer is built first. Several builds (an
 * older checkout's `vite build -c vite.viewer.config.ts`, say) take turns,
 * round by round, so a busy machine weighs on each of them alike.
 *
 * The package's own viewer build is served as Spool Cloud serves it, the
 * project read from a stand-in for spool.page, and every frame's document from
 * an origin of its own. Chromium draws on the machine's GPU where it has
 * one (`--gpu vulkan`, the Intel GPU on a Linux box); SwiftShader, its
 * software fallback, prices the picture layer's GPU work on the CPU, which no
 * person's browser does (`--gpu none`). A document boots like a small React frame would: a few
 * hundred elements, a burst of script, an animation, and the frame protocol's
 * loaded, arrived and freeze. The gestures are wheel events dispatched on the
 * field from the page's own animation frames, so the browser's pace is all
 * that is measured, never the bench's round trips.
 *
 * Printed per phase: frame intervals (p50, p95, max, and how many ran past
 * 33 ms), long tasks and their total, the page's main thread's CPU time and
 * the whole browser's (every process, the frames' documents and the GPU's
 * included), the iframes mounted when the camera rests, and every document
 * booted since the page opened. On a shared machine the CPU times are the
 * steadier numbers: the intervals and long tasks stretch with its load.
 */

const APP = "https://cloud.test";
const FRAMES = "https://frames.test/f/grant/";
const PATH = "/devosurf/bench";

interface Options {
	frames: number;
	covered: number;
	rounds: number;
	builds: string[];
	gpu: "vulkan" | "none";
}

function parseArgs(argv: string[]): Options {
	const o: Options = { frames: 600, covered: 3, rounds: 2, builds: [], gpu: "vulkan" };
	for (let i = 0; i < argv.length; i++) {
		const value = argv[i + 1];
		if (argv[i] === "--frames" && value !== undefined) o.frames = Number(value);
		else if (argv[i] === "--covered" && value !== undefined) o.covered = Number(value);
		else if (argv[i] === "--rounds" && value !== undefined) o.rounds = Number(value);
		else if (argv[i] === "--build" && value !== undefined) o.builds = value.split(",");
		else if (argv[i] === "--gpu" && (value === "vulkan" || value === "none")) o.gpu = value;
		else continue;
		i += 1;
	}
	return o;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

/** A cover as a member's daemon sends one: a frame-sized PNG with bands of colour, not one flat fill. */
function coverPng(width: number, height: number, seed: number): Buffer {
	const chunk = (type: string, data: Buffer) => {
		const header = Buffer.alloc(8);
		header.writeUInt32BE(data.length, 0);
		header.write(type, 4);
		const checksum = Buffer.alloc(4);
		checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 0);
		return Buffer.concat([header, data, checksum]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 2;
	const rows: Buffer[] = [];
	for (let y = 0; y < height; y += 1) {
		const row = Buffer.alloc(width * 3 + 1);
		for (let x = 0; x < width; x += 1) {
			const band = Math.floor(y / 40) + Math.floor(x / 120);
			row[1 + x * 3] = (seed * 37 + band * 23) % 256;
			row[2 + x * 3] = (seed * 91 + band * 7 + x) % 256;
			row[3 + x * 3] = (seed * 13 + y) % 256;
		}
		rows.push(row);
	}
	return Buffer.concat([
		Buffer.from("89504e470d0a1a0a", "hex"),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(Buffer.concat(rows))),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

/** A frame's document: some hundreds of elements, a boot's worth of script, an animation, and the frame protocol. */
function frameDocument(frame: string): string {
	return `<!doctype html><html><head><style>
body{margin:0;font:14px sans-serif;background:#fafafa}
.row{display:flex;gap:8px;padding:6px 12px;border-bottom:1px solid #ddd}
.spin{width:24px;height:24px;border-radius:50%;border:3px solid #999;border-top-color:transparent;animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
</style></head><body><h1>${frame}</h1><div class="spin"></div><div id="list"></div>
<script>
const FRAME = ${JSON.stringify(frame)};
const start = performance.now();
let html = "";
for (let i = 0; i < 300; i++) html += '<div class="row"><b>' + i + '</b><span>item ' + i + '</span><i>' + FRAME + '</i></div>';
document.getElementById("list").innerHTML = html;
while (performance.now() - start < 25) {}
let arrived = false;
addEventListener("message", (event) => {
	const m = event.data;
	if (m?.spool === "arrive" && !arrived) {
		arrived = true;
		setTimeout(() => parent.postMessage({ spool: "arrived", frame: FRAME }, "*"), 300);
	}
});
requestAnimationFrame(() => parent.postMessage({ spool: "loaded", frame: FRAME }, "*"));
</script></body></html>`;
}

function project(options: Options) {
	const columns = Math.ceil(Math.sqrt(options.frames * 1.5));
	const frames = Array.from({ length: options.frames }, (_, i) => {
		const phone = i % 7 === 3;
		return {
			name: `screens/s${i}`,
			x: (i % columns) * 1000,
			y: Math.floor(i / columns) * 1000,
			w: phone ? 390 : 800,
			h: phone ? 844 : 600,
		};
	});
	const covers = Object.fromEntries(
		frames.filter((_, i) => i % options.covered === 0).map((frame) => [frame.name, `/covers/${frame.name}.png`]),
	);
	return {
		team: { address: "devosurf", name: "Devosurf", logo: null },
		project: "bench",
		account: "vic@devosurf.com",
		canvas: { pages: [], places: {}, order: {}, frames },
		frames: FRAMES,
		covers,
		role: "viewer",
	};
}

interface Phase {
	name: string;
	intervals: number[];
	longTasks: number[];
	/** CPU milliseconds of the page's main thread, and of every process of the browser. */
	cpu: { main: number; browser: number };
	iframesAtRest: number;
	booted: number;
}

/** What the page records: animation frame times, long tasks, and every iframe it ever mounted. */
function installProbes(): void {
	const w = window as unknown as {
		__bench: { frames: number[]; long: number[]; booted: number; recording: boolean };
	};
	w.__bench = { frames: [], long: [], booted: 0, recording: false };
	new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) if (w.__bench.recording) w.__bench.long.push(entry.duration);
	}).observe({ type: "longtask", buffered: false });
	new MutationObserver((records) => {
		for (const record of records)
			for (const node of record.addedNodes) {
				if (!(node instanceof Element)) continue;
				w.__bench.booted += node.tagName === "IFRAME" ? 1 : node.querySelectorAll("iframe").length;
			}
	}).observe(document, { childList: true, subtree: true });
	const tick = (at: number) => {
		if (w.__bench.recording) w.__bench.frames.push(at);
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}

/** CPU milliseconds spent by every process under this one: the browser and all of its children. */
function browserCpu(): number {
	const parents = new Map<number, number>();
	const ticks = new Map<number, number>();
	for (const entry of readdirSync("/proc")) {
		if (!/^\d+$/.test(entry)) continue;
		try {
			const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
			const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
			parents.set(Number(entry), Number(fields[1]));
			ticks.set(Number(entry), Number(fields[11]) + Number(fields[12]));
		} catch {}
	}
	let total = 0;
	for (const [pid, own] of ticks) {
		let at: number | undefined = pid;
		while (at !== undefined && at !== process.pid && at > 1) at = parents.get(at);
		if (at === process.pid && pid !== process.pid) total += own;
	}
	return total * 10;
}

/** CPU milliseconds of the page's main thread. */
async function mainCpu(cdp: CDPSession): Promise<number> {
	const { metrics } = await cdp.send("Performance.getMetrics");
	return (metrics.find((metric) => metric.name === "ThreadTime")?.value ?? 0) * 1000;
}

/** Drive a gesture from the page's own frames: one wheel event a frame, for `steps` frames. */
async function gesture(page: Page, kind: "pan" | "zoom", steps: number, by: number): Promise<void> {
	await page.evaluate(
		({ kind, steps, by }) =>
			new Promise<void>((done) => {
				const field = document.querySelector("[data-viewer-field]");
				if (field === null) throw new Error("no field");
				const box = field.getBoundingClientRect();
				let left = steps;
				const step = () => {
					if (left-- <= 0) return done();
					field.dispatchEvent(
						new WheelEvent("wheel", {
							bubbles: true,
							cancelable: true,
							clientX: box.left + box.width / 2,
							clientY: box.top + box.height / 2,
							deltaX: kind === "pan" ? 2.4 * by : 0,
							deltaY: by,
							ctrlKey: kind === "zoom",
						}),
					);
					requestAnimationFrame(step);
				};
				requestAnimationFrame(step);
			}),
		{ kind, steps, by },
	);
}

async function measure(
	page: Page,
	cdp: CDPSession,
	name: string,
	run: () => Promise<void>,
	settle = 2500,
): Promise<Phase> {
	const cpu = { main: await mainCpu(cdp), browser: browserCpu() };
	await page.evaluate(() => {
		const bench = (window as unknown as { __bench: { frames: number[]; long: number[]; recording: boolean } })
			.__bench;
		bench.frames = [];
		bench.long = [];
		bench.recording = true;
	});
	await run();
	const moving = await page.evaluate(() => {
		const bench = (window as unknown as { __bench: { frames: number[]; recording: boolean } }).__bench;
		bench.recording = false;
		return bench.frames;
	});
	// long tasks and CPU go on being counted through the rest, where documents boot
	await page.evaluate(() => {
		(window as unknown as { __bench: { recording: boolean; frames: number[] } }).__bench.recording = true;
	});
	await page.waitForTimeout(settle);
	const after = await page.evaluate(() => {
		const bench = (window as unknown as { __bench: { long: number[]; booted: number; recording: boolean } }).__bench;
		bench.recording = false;
		return {
			long: bench.long,
			booted: bench.booted,
			iframes: document.querySelectorAll("iframe").length,
			zoom: document.querySelector("[data-viewer-zoom]")?.textContent ?? "",
		};
	});
	const intervals = moving.slice(1).map((at, i) => at - (moving[i] ?? at));
	return {
		name: `${name} (${after.zoom})`,
		intervals,
		longTasks: after.long,
		cpu: { main: (await mainCpu(cdp)) - cpu.main, browser: browserCpu() - cpu.browser },
		iframesAtRest: after.iframes,
		booted: after.booted,
	};
}

const percentile = (values: number[], p: number) => {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
};

function report(phase: Phase): string {
	const { intervals, longTasks } = phase;
	const f = (n: number) => n.toFixed(1);
	return [
		phase.name.padEnd(28),
		intervals.length === 0
			? "".padEnd(48)
			: `frames ${String(intervals.length).padStart(3)}  p50 ${f(percentile(intervals, 0.5))}  p95 ${f(percentile(intervals, 0.95))}  max ${f(Math.max(...intervals))}  >33ms ${String(intervals.filter((each) => each > 33.4).length).padStart(3)}`,
		`  long ${String(longTasks.length).padStart(3)} (${String(Math.round(longTasks.reduce((a, b) => a + b, 0))).padStart(5)} ms)`,
		`  cpu main ${String(Math.round(phase.cpu.main)).padStart(5)} all ${String(Math.round(phase.cpu.browser)).padStart(6)}`,
		`  iframes ${String(phase.iframesAtRest).padStart(2)}  booted ${phase.booted}`,
	].join("");
}

/** The viewer build's entry script and stylesheets, from its manifest. */
function entryOf(built: string): { file: string; css: string[] } {
	const manifest = JSON.parse(readFileSync(join(built, "manifest.json"), "utf8")) as Record<
		string,
		{ file: string; css?: string[]; imports?: string[] }
	>;
	const entry = manifest["index.html"];
	if (entry === undefined) throw new Error(`no index.html in the viewer build at ${built}`);
	const css = new Set(entry.css ?? []);
	for (const each of entry.imports ?? []) for (const sheet of manifest[each]?.css ?? []) css.add(sheet);
	return { file: entry.file, css: [...css] };
}

async function run(
	browser: Browser,
	built: string,
	served: ReturnType<typeof project>,
	covers: Map<string, Buffer>,
): Promise<Phase[]> {
	const entry = entryOf(built);
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await page.addInitScript(installProbes);
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.origin === APP && url.pathname.startsWith("/_viewer/")) {
			const file = join(built, url.pathname.slice("/_viewer/".length));
			const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "font/woff2";
			return route.fulfill({ body: readFileSync(file), contentType: type });
		}
		if (url.origin === APP && url.pathname === "/api/canvas") return route.fulfill({ json: served });
		if (url.origin === APP && url.pathname.startsWith("/covers/")) {
			const body = covers.get(url.pathname);
			if (body === undefined) return route.fulfill({ status: 404 });
			return route.fulfill({
				body,
				contentType: "image/png",
				headers: { "cache-control": "public, max-age=31536000, immutable" },
			});
		}
		if (url.origin === APP && url.pathname === PATH)
			return route.fulfill({
				contentType: "text/html",
				body: `<!doctype html><html><head>${entry.css.map((sheet) => `<link rel="stylesheet" href="/_viewer/${sheet}">`).join("")}
<script type="module" src="/_viewer/${entry.file}"></script></head><body>
<script id="spool-viewer" type="application/json">${JSON.stringify({ api: "/api/canvas", path: PATH })}</script>
<div id="root"></div></body></html>`,
			});
		if (url.href.startsWith(FRAMES))
			return route.fulfill({
				contentType: "text/html",
				body: frameDocument(decodeURIComponent(url.pathname.slice(new URL(FRAMES).pathname.length))),
			});
		return route.abort();
	});
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Performance.enable", { timeDomain: "threadTicks" });
	await page.goto(`${APP}${PATH}`);
	await page.locator("[data-viewer-field]").waitFor();
	const phases: Phase[] = [];
	phases.push(await measure(page, cdp, "open, fitted", async () => {}, 4000));
	phases.push(await measure(page, cdp, "overview pan", () => gesture(page, "pan", 120, 2)));
	phases.push(await measure(page, cdp, "overview pan back", () => gesture(page, "pan", 120, -2)));
	// 3% to about 25%, where a frame is a picture: 60 steps of 3 px at the wheel's 0.011 a pixel
	phases.push(await measure(page, cdp, "zoom in to pictures", () => gesture(page, "zoom", 60, -3), 4000));
	phases.push(await measure(page, cdp, "pictures pan", () => gesture(page, "pan", 120, 4), 4000));
	// on to about 65%, where an 800 px frame draws past the readable 400
	phases.push(await measure(page, cdp, "zoom in to readable", () => gesture(page, "zoom", 30, -3), 4000));
	phases.push(await measure(page, cdp, "readable pan", () => gesture(page, "pan", 120, 5), 4000));
	phases.push(await measure(page, cdp, "readable pan back", () => gesture(page, "pan", 120, -5), 4000));
	phases.push(await measure(page, cdp, "zoom out", () => gesture(page, "zoom", 90, 3), 4000));
	await page.close();
	return phases;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	let builds = options.builds;
	let made: string | undefined;
	if (builds.length === 0) {
		made = mkdtempSync(join(tmpdir(), "spool-viewer-bench-"));
		const { build } = await import("vite");
		await build({
			configFile: join(repoRoot, "vite.viewer.config.ts"),
			logLevel: "silent",
			build: { outDir: made, emptyOutDir: true },
		});
		builds = [made];
	}
	const served = project(options);
	// made before the page opens, so serving one never waits on making it
	const covers = new Map<string, Buffer>(
		Object.values(served.covers).map((path) => [
			path,
			coverPng(800, 600, Number(/s(\d+)\.png$/.exec(path)?.[1] ?? 0)),
		]),
	);
	const browser = await chromium.launch({
		channel: "chromium-headless-shell",
		headless: true,
		args:
			options.gpu === "vulkan"
				? ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=vulkan", "--enable-features=Vulkan"]
				: [],
	});
	try {
		for (let round = 0; round < options.rounds; round++) {
			for (const built of builds) {
				const phases = await run(browser, built, served, covers);
				console.log(`round ${round + 1}, ${built}`);
				for (const phase of phases) console.log(`  ${report(phase)}`);
			}
		}
	} finally {
		await browser.close();
		if (made !== undefined) rmSync(made, { recursive: true, force: true });
	}
}

await main();
