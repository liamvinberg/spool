import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Frame, type Page } from "playwright-core";
import {
	copyProject,
	freePort,
	prepareCurrentCovers,
	readPages,
	repoRoot,
	startDaemon,
	writeCamera,
} from "./harness.ts";

/**
 * What a hand save to a shared file costs everybody after it (DEV-300): the
 * daemon's event loop over the seconds after the write, and the requests a
 * hand makes next (a click's PUT /selection and POST /rungs, the canvas's
 * GET /flows) against the same requests idle. A canvas is open on the edited
 * frame at working zoom, so its live frames reload and the photo booth retakes
 * every frame that renders the file, as they do on Liam's Mac.
 *
 *   node bench/save-busy.ts --project <path> [--frame app/spool-home] [--shared shared/…tsx] [--rounds 6] [--cpu-prof <dir>]
 *
 * The edited file is the shared one the frame's own words come from, unless
 * `--shared` names one. Each round changes those words on disk the way the
 * hand lane's write does, and the next round puts them back. `--cpu-prof`
 * writes the daemon's CPU profile there when it stops.
 */

interface Options {
	project: string;
	frame: string;
	shared: string | undefined;
	rounds: number;
	k: number;
	cpuProf: string | undefined;
	out: string | undefined;
}

function parseArgs(argv: string[]): Options {
	const o: Options = {
		project: "",
		frame: "app/spool-home",
		shared: undefined,
		rounds: 6,
		k: 0.85,
		cpuProf: undefined,
		out: undefined,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const n = argv[i + 1];
		if (n === undefined) continue;
		if (a === "--project") o.project = n;
		else if (a === "--frame") o.frame = n;
		else if (a === "--shared") o.shared = n;
		else if (a === "--rounds") o.rounds = Number(n);
		else if (a === "--k") o.k = Number(n);
		else if (a === "--cpu-prof") o.cpuProf = n;
		else if (a === "--out") o.out = n;
		else continue;
		i++;
	}
	if (o.project === "") throw new Error("--project is required");
	return o;
}

const VIEW = { width: 1440, height: 810 };
const opts = parseArgs(process.argv.slice(2));
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
// stdout, because the m1 desktop session hands back nothing else
const log = (line: string) => process.stdout.write(`save-busy: ${line}\n`);

/** The late ticks the daemon's loop wrote (bench/loop-lag.ts), as [epoch ms, ms late]. */
function lateTicks(file: string): [number, number][] {
	if (!existsSync(file)) return [];
	return readFileSync(file, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => line.split(" ").map(Number) as [number, number]);
}

/** How the loop fared over a window: the worst stall, the time spent stalled, the last stall's end. */
function loopOver(file: string, from: number, to: number) {
	const ticks = lateTicks(file).filter(([at]) => at >= from && at <= to);
	const stalls = ticks.filter(([, late]) => late >= 50);
	return {
		worst: Math.max(0, ...ticks.map(([, late]) => late)),
		over50: stalls.length,
		stalled: stalls.reduce((sum, [, late]) => sum + late, 0),
		busyUntil: stalls.length === 0 ? 0 : Math.max(...stalls.map(([at]) => at)) - from,
	};
}

/** The frame's live document, once the canvas has mounted one. */
async function liveFrame(page: Page, name: string, timeout = 15000): Promise<Frame> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const handle = await page.$(`iframe[title="${name}"]`);
		const frame = handle ? await handle.contentFrame() : null;
		if (frame) {
			const ready = await frame
				.evaluate(() => (document.querySelector("#root")?.children.length ?? 0) > 0)
				.catch(() => false);
			if (ready) return frame;
		}
		await sleep(30);
	}
	throw new Error(`${name} never mounted a live document`);
}

/** An element whose own words are written in a shared file, and the stamps up to it, root first. */
async function sharedWords(frame: Frame, only: string | undefined) {
	return await frame.evaluate((only) => {
		for (const el of Array.from(document.querySelectorAll("#root [data-spool-source]"))) {
			const source = el.getAttribute("data-spool-source") ?? "";
			if (!source.startsWith(only ?? "shared/")) continue;
			const own = Array.from(el.childNodes)
				.filter((n) => n.nodeType === 3)
				.map((n) => n.textContent ?? "")
				.join("")
				.trim();
			if (own.length < 4 || own.length > 60) continue;
			const sources: string[] = [];
			for (let at: Element | null = el; at !== null; at = at.parentElement) {
				const stamp = at.getAttribute("data-spool-source");
				if (stamp !== null) sources.unshift(stamp);
			}
			return { source, sources, text: own };
		}
		return undefined;
	}, only);
}

async function main(): Promise<void> {
	const { root, name, spoolDir } = copyProject(opts.project);
	const pageName = opts.frame.split("/").slice(0, -1).join("/");
	const onPage = readPages(root).find((p) => p.page === pageName);
	const target = onPage?.frames.find((f) => f.name === opts.frame);
	if (!onPage || !target) throw new Error(`${opts.frame} is not on page ${pageName}`);
	const loopFile = join(spoolDir, "loop-lag.txt");
	process.env.SPOOL_BENCH_LOOP = loopFile;
	const nodeArgs = ["--import", join(repoRoot, "bench", "loop-lag.ts")];
	if (opts.cpuProf !== undefined) {
		mkdirSync(opts.cpuProf, { recursive: true });
		nodeArgs.push("--cpu-prof", `--cpu-prof-dir=${opts.cpuProf}`);
	}
	const daemon = await startDaemon(spoolDir, root, await freePort(), undefined, nodeArgs);
	const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
	const token = (JSON.parse(readFileSync(join(spoolDir, "daemon.json"), "utf8")) as { controlToken: string })
		.controlToken;
	const api = async (method: string, path: string, body?: unknown): Promise<number> => {
		const t0 = performance.now();
		const response = await fetch(`${daemon.url}/api/p/${encodeURIComponent(name)}${path}`, {
			method,
			headers: { "content-type": "application/json", "X-Spool-Control": token },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		await response.arrayBuffer();
		if (!response.ok) log(`${method} ${path} answered ${response.status}`);
		return performance.now() - t0;
	};
	const browser = await chromium.launch({
		channel: "chromium",
		headless: false,
		args: ["--window-position=0,0", `--window-size=${VIEW.width},${VIEW.height + 90}`],
	});
	const report: Record<string, unknown> = { frame: opts.frame, rounds: [] as unknown[] };
	try {
		writeCamera(root, { x: 0, y: 0, k: 0.16 }, pageName);
		await prepareCurrentCovers(browser, daemon, url, root, onPage.frames);
		const k = opts.k;
		writeCamera(root, { x: VIEW.width / 2 - (target.x + target.w / 2) * k, y: 70 - target.y * k, k }, pageName);
		const page = await (await browser.newContext({ viewport: VIEW })).newPage();
		await page.goto(url, { waitUntil: "domcontentloaded" });
		await page.locator(`[data-frame-label="${opts.frame}"]`).first().waitFor({ timeout: 30000 });
		await sleep(1500);
		if ((await page.$(`iframe[title="${opts.frame}"]`)) === null) {
			await page.keyboard.press("e");
			await sleep(300);
			await page.mouse.click(VIEW.width / 2, 70 + 120 * k);
		}
		const frame = await liveFrame(page, opts.frame);
		await sleep(1000);
		const words = await sharedWords(frame, opts.shared);
		if (words === undefined) throw new Error(`${opts.frame} shows no words written in ${opts.shared ?? "shared/"}`);
		const sharedPath = words.source.replace(/:\d+:\d+$/, "");
		const file = join(root, "design", sharedPath);
		const original = readFileSync(file, "utf8");
		if (!original.includes(words.text)) throw new Error(`"${words.text}" is not written as such in ${sharedPath}`);
		const edited = original.replace(words.text, `${words.text} QA`);
		log(`editing "${words.text}" in ${sharedPath}`);
		report.shared = sharedPath;
		const rungs = { frame: opts.frame, sources: words.sources };
		const selection = { frames: [opts.frame] };
		/** One hand's next gesture: a click's selection and read, and the canvas's flows read, all at once. */
		const gesture = async () => {
			const [sel, read, flows] = await Promise.all([
				api("PUT", "/selection", selection),
				api("POST", "/rungs", rungs),
				api("GET", "/flows"),
			]);
			return { selection: sel, rungs: read, flows };
		};
		/** Until the loop has run quiet for two seconds, or a minute has gone. */
		const settle = async () => {
			const deadline = Date.now() + 60_000;
			while (Date.now() < deadline) {
				await sleep(500);
				if (loopOver(loopFile, Date.now() - 2500, Date.now()).worst < 30) return;
			}
			log("the daemon never went quiet");
		};

		await settle();
		const idle: { selection: number; rungs: number; flows: number }[] = [];
		for (let i = 0; i < 5; i++) {
			idle.push(await gesture());
			await sleep(200);
		}
		report.idle = idle;
		log(
			`idle: ${idle.map((g) => `sel ${g.selection.toFixed(0)} rungs ${g.rungs.toFixed(0)} flows ${g.flows.toFixed(0)}`).join(" | ")}`,
		);
		const rounds: unknown[] = [];
		for (let round = 0; round < opts.rounds; round++) {
			await settle();
			const at = Date.now();
			writeFileSync(file, round % 2 === 0 ? edited : original);
			await sleep(150);
			const first = await gesture();
			await sleep(400);
			const second = await gesture();
			await sleep(5000);
			const loop = loopOver(loopFile, at, at + 5500);
			rounds.push({ first, second, loop });
			log(
				`save ${round + 1}: loop worst ${loop.worst.toFixed(0)} ms, ${loop.over50} stalls ≥50 ms totalling ${loop.stalled.toFixed(0)} ms, last ends +${loop.busyUntil.toFixed(0)} ms · +150 ms: sel ${first.selection.toFixed(0)} rungs ${first.rungs.toFixed(0)} flows ${first.flows.toFixed(0)} · next: sel ${second.selection.toFixed(0)} rungs ${second.rungs.toFixed(0)} flows ${second.flows.toFixed(0)}`,
			);
		}
		report.rounds = rounds;
		if (opts.rounds % 2 === 1) writeFileSync(file, original);
	} finally {
		await browser.close().catch(() => undefined);
		daemon.stop();
		await Promise.race([daemon.exited, sleep(15_000)]);
	}
	if (opts.cpuProf !== undefined) log(`profiles: ${readdirSync(opts.cpuProf).join(", ")}`);
	if (opts.out !== undefined) writeFileSync(opts.out, `${JSON.stringify(report, null, "\t")}\n`);
	process.stdout.write(`${JSON.stringify(report)}\n`);
}

try {
	await main();
} catch (error) {
	log(`failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
	process.exitCode = 1;
}
