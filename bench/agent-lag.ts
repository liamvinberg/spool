import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Browser, type CDPSession, chromium, type Page } from "playwright-core";
import {
	copyProject,
	freePort,
	namedPage,
	planCamera,
	prepareCurrentCovers,
	quantile,
	repoRoot,
	startDaemon,
	writeCamera,
} from "./harness.ts";

/**
 * What an agent turn in flight costs the canvas (task 169): the canvas's main thread while a
 * turn streams and writes frames, against the same canvas with no turn, both still and under
 * a zoom and pan. The agent is bench/fake-claude.mjs, which streams prose and Write inputs on
 * a real turn's wire and writes real frames, so the daemon, the rail and the canvas do what
 * they do for a real one.
 *
 *   node bench/agent-lag.ts --project <path> --page character [--writes cue-edit,shelf] [--k 0.16]
 *     [--rail open|shut] [--seconds 20] [--profile <dir>]
 *
 * `--writes` are the frame folders the agent writes, on another page than the one watched by
 * default, since the lag shows on any page.
 */

const VIEW = { width: 1512, height: 945 };
const args = process.argv.slice(2);
const arg = (name: string, fallback?: string) => {
	const at = args.indexOf(name);
	return at === -1 ? fallback : args[at + 1];
};
const project = arg("--project");
if (project === undefined) throw new Error("--project is required");
const pageName = arg("--page", "character") as string;
const writes = arg("--writes", "cue-edit,cue-mono,diorama") as string;
const k = Number(arg("--k", "0.16"));
const rail = arg("--rail", "open") as "open" | "shut";
const seconds = Number(arg("--seconds", "20"));
const profileDir = arg("--profile");
const traceDir = arg("--trace");
const headed = args.includes("--headed");
const throttle = Number(arg("--throttle", "1"));

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

interface Window {
	frames: number[];
	loafs: { t: number; duration: number; blocking: number; scripts: string[] }[];
}

/** a rAF interval loop and long-animation-frame log, read by time window */
const COLLECT = () => {
	if (window !== window.top) return;
	const state = { raf: [] as [number, number][], loaf: [] as Window["loafs"] };
	(globalThis as unknown as { __lag: typeof state }).__lag = state;
	let last = performance.now();
	const tick = (now: number) => {
		state.raf.push([now, now - last]);
		last = now;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			const loaf = entry as PerformanceEntry & {
				blockingDuration?: number;
				scripts?: { sourceFunctionName?: string; invoker?: string; duration: number }[];
			};
			state.loaf.push({
				t: entry.startTime,
				duration: entry.duration,
				blocking: loaf.blockingDuration ?? 0,
				scripts: (loaf.scripts ?? [])
					.filter((s) => s.duration > 5)
					.map((s) => `${s.invoker ?? "?"}:${s.sourceFunctionName ?? "?"} ${s.duration.toFixed(0)}`),
			});
		}
	}).observe({ type: "long-animation-frame", buffered: true });
};

async function windowOf(page: Page, from: number, to: number): Promise<Window> {
	return await page.evaluate(
		([a, b]) => {
			const s = (globalThis as unknown as { __lag: { raf: [number, number][]; loaf: Window["loafs"] } }).__lag;
			return {
				frames: s.raf.filter(([t]) => t >= a && t <= b).map(([, d]) => d),
				loafs: s.loaf.filter((l) => l.t >= a && l.t <= b),
			};
		},
		[from, to] as const,
	);
}

function summary(label: string, w: Window): string {
	const sorted = [...w.frames].sort((a, b) => a - b);
	const over = (ms: number) => sorted.filter((d) => d > ms).length;
	const blocking = w.loafs.reduce((sum, l) => sum + l.blocking, 0);
	const busy = w.loafs.reduce((sum, l) => sum + l.duration, 0);
	return `${label.padEnd(18)} frames ${String(sorted.length).padStart(5)}  p50 ${quantile(sorted, 0.5).toFixed(1).padStart(5)}  p95 ${quantile(sorted, 0.95).toFixed(1).padStart(5)}  p99 ${quantile(sorted, 0.99).toFixed(1).padStart(6)}  worst ${(sorted.at(-1) ?? 0).toFixed(0).padStart(4)}  >20ms ${String(over(20)).padStart(4)}  >50ms ${String(over(50)).padStart(3)}  loafs ${String(w.loafs.length).padStart(4)} busy ${busy.toFixed(0).padStart(5)}ms blocking ${blocking.toFixed(0).padStart(5)}ms`;
}

/**
 * A trackpad's pinch and pan: wheel events, the pinch's with ctrl held on the event and no
 * key pressed, which is how Chrome delivers one. Pressing Control first would also hold the
 * canvas's accelerator and draw its hover preview, which a pinch never does.
 */
async function gesture(page: Page, ms: number): Promise<void> {
	const cdp = await page.context().newCDPSession(page);
	const x = VIEW.width / 2;
	const y = VIEW.height / 2;
	await page.mouse.move(x, y);
	const end = Date.now() + ms;
	let step = 0;
	while (Date.now() < end) {
		const phase = Math.floor(step / 40) % 4;
		const [deltaX, deltaY] = phase === 0 ? [0, -5] : phase === 1 ? [0, 5] : phase === 2 ? [24, 0] : [-24, 0];
		await cdp.send("Input.dispatchMouseEvent", {
			type: "mouseWheel",
			x,
			y,
			deltaX,
			deltaY,
			modifiers: phase < 2 ? 2 : 0,
		});
		step++;
		await sleep(16);
	}
	await cdp.detach();
}

async function measure(page: Page, label: string, results: string[]): Promise<void> {
	const t0 = await page.evaluate(() => performance.now());
	if (traceDir !== undefined) {
		mkdirSync(traceDir, { recursive: true });
		await page
			.context()
			.browser()
			?.startTracing(page, {
				path: join(traceDir, `${label.replace(/ /g, "-")}.json`),
				categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink", "cc", "v8.execute"],
			});
	}
	await sleep((seconds * 1000) / 2);
	if (traceDir !== undefined) await page.context().browser()?.stopTracing();
	const t1 = await page.evaluate(() => performance.now());
	await gesture(page, (seconds * 1000) / 2);
	const t2 = await page.evaluate(() => performance.now());
	const still = await windowOf(page, t0, t1);
	const moving = await windowOf(page, t1, t2);
	results.push(summary(`${label} still`, still), summary(`${label} gesture`, moving));
	process.stdout.write(`${results.at(-2)}\n${results.at(-1)}\n`);
	const worst = [...still.loafs, ...moving.loafs].sort((a, b) => b.blocking - a.blocking).slice(0, 5);
	for (const l of worst)
		process.stdout.write(
			`    loaf ${l.duration.toFixed(0)}ms blocking ${l.blocking.toFixed(0)} ${l.scripts.join(" | ")}\n`,
		);
}

async function main(): Promise<void> {
	const { root, name, spoolDir } = copyProject(resolve(project as string));
	const bin = join(spoolDir, "fake-bin");
	mkdirSync(bin, { recursive: true });
	const fake = join(repoRoot, "bench", "fake-claude.mjs");
	chmodSync(fake, 0o755);
	symlinkSync(fake, join(bin, "claude"));
	process.env.PATH = `${bin}:${process.env.PATH}`;
	process.env.FAKE_FRAMES = writes;
	process.env.FAKE_TURN_MS = String(seconds * 1000 + 15_000);
	const onPage = namedPage(root, pageName);
	const daemon = await startDaemon(spoolDir, root, await freePort());
	const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
	const browser: Browser = await chromium.launch(
		headed
			? { channel: "chromium", headless: false }
			: { channel: "chromium-headless-shell", headless: true, args: ["--site-per-process"] },
	);
	const results: string[] = [];
	try {
		writeCamera(root, { x: 0, y: 0, k: 0.16 }, pageName);
		await prepareCurrentCovers(browser, daemon, url, root, onPage.frames);
		writeCamera(root, planCamera(onPage.frames, VIEW.width, VIEW.height, k), pageName);
		const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
		await context.addInitScript(COLLECT);
		const page = await context.newPage();
		if (throttle > 1) {
			const cpu = await context.newCDPSession(page);
			await cpu.send("Emulation.setCPUThrottlingRate", { rate: throttle });
		}
		await page.goto(url, { waitUntil: "domcontentloaded" });
		await page.locator("[data-frame-label]").first().waitFor({ timeout: 30_000 });
		await sleep(4000);
		process.stdout.write(`agent-lag: page ${pageName}, k ${k}, writes ${writes}, rail ${rail}\n`);
		await measure(page, "no turn", results);

		// a turn, started the way a hand starts one
		const tab = page.locator('[data-pane-tab="agent"]');
		await tab.waitFor({ state: "attached", timeout: 30_000 });
		const open = await tab.evaluate((element) => element.closest("aside[data-side-open]") !== null);
		if (!open) await page.locator('[data-rail-icon="agent"]').click();
		else if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
		const field = page.locator("[data-agent-rail] textarea");
		await field.waitFor();
		await field.fill("rework the hero on the edit frames");
		await field.press("Enter");
		if (rail === "shut") {
			await sleep(300);
			await page.locator('[data-rail-icon="agent"]').click();
		}
		await sleep(3000);
		let cdp: CDPSession | undefined;
		if (profileDir !== undefined) {
			cdp = await context.newCDPSession(page);
			await cdp.send("Profiler.enable");
			await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
			await cdp.send("Profiler.start");
		}
		await measure(page, "turn", results);
		const said = await page.locator("[data-agent-rail] [data-agent-turn]").count();
		const working = await page.locator("[data-frame-agents]").count();
		process.stdout.write(`    turn rows ${said}, working marks ${working}\n`);
		if (cdp !== undefined && profileDir !== undefined) {
			const { profile } = await cdp.send("Profiler.stop");
			mkdirSync(profileDir, { recursive: true });
			writeFileSync(join(profileDir, `turn-${pageName}-${rail}.cpuprofile`), JSON.stringify(profile));
		}
	} finally {
		await browser.close();
		daemon.stop();
	}
}

await main();
