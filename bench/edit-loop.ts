import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join, resolve } from "node:path";
import { type Browser, chromium, type Frame, type Page } from "playwright-core";
import {
	type BenchState,
	collector,
	copyProject,
	type Daemon,
	freePort,
	median,
	namedPage,
	oneMinuteLoad,
	planCamera,
	prepareCurrentCovers,
	startDaemon,
	VIEWPORT,
	writeCamera,
} from "./harness.ts";

/**
 * An edit landing in a live frame (spool#218's "edit" and "cold" rows): what
 * a person inside a frame sees when the agent writes its TSX, and what the
 * first live frame of a cold start costs.
 *
 * `--measure edit` (the default) writes a fixture frame of its own into the
 * private copy, on a page of its own (`frames/edit-bench/edit-fixture/`). It
 * imports a real primitive of the subject (`shared/system/ui/primitives/actions`
 * on spool-real, Tailwind and shared imports and all), a shared caption this
 * bench writes into the copy (`shared/edit-bench/caption.tsx`), and a probe
 * (`shared/edit-bench/probe.ts`) that, every animation frame, looks at the
 * marked text nodes and posts the first frame each new text is in the DOM,
 * with the frame's state as that frame paints it. The canvas is opened on that
 * page and the frame entered. Each round puts state into it (a useState
 * counter clicked to 3, an input typed into, a scroll container at 300 px, a
 * rAF counter running) and then writes, as an agent's Write tool does, first
 * the frame's own file and then the shared caption:
 *
 *   save_to_pixels_ms         write (epoch, node) to the first rAF in the frame's
 *                             document whose DOM holds the new text (epoch,
 *                             performance.timeOrigin + rAF timestamp)
 *   save_to_loaded_ms         write to the frame's loaded report reaching the canvas
 *                             (absent when the edit did not reload the document)
 *   state_kept_count          of the four states, how many the painted frame still
 *                             holds: counter 3, input text, scroll 300, rAF count
 *                             not reset (0 to 4)
 *   shared_*                  the same for the edit to the shared caption
 *
 * Then, with the canvas closed, it times the daemon's compile from outside:
 * each round writes the frame (and the caption), and at once fetches the
 * frame's document from the render host, as the iframe would; that answer
 * must say `x-spool-cache: miss`. A second fetch is the warm answer:
 *
 *   compile_ms / shared_compile_ms   the missing fetch, write to its last byte
 *   document_hit_ms                  the warm fetch of the same document
 *
 * The photo booth retakes the fixture's cover after every write, as it does on
 * a person's machine; each round waits for that cover before the next.
 *
 * `--measure cold` starts a daemon on a fresh SPOOL_DIR and copy with no
 * covers (the browser already up), opens the canvas on `--cold-page` at
 * `--cold-zoom` in a fresh browser context, and times, from the spawn:
 *
 *   daemon_up_ms        the daemon answering the canvas URL
 *   canvas_ready_ms     the first frame label in the canvas
 *   cold_first_live_ms  the first live frame's loaded report
 *
 * the median of `--cold-runs` starts.
 *
 * `--boot-busy-ms <n>` makes the fixture's module spin that long on boot: a
 * frame made slower on purpose, to see save_to_pixels move with it.
 *
 *   pnpm build && node bench/edit-loop.ts --project ~/dev/scratch/spool-real-324 --out edit.json
 *   node bench/edit-loop.ts --project ~/dev/scratch/spool-real-324 --measure cold --out cold.json
 *
 * Run it with node's own type stripping, not tsx (see bench/harness.ts).
 */

interface Options {
	project: string;
	out: string;
	measure: "edit" | "cold";
	rounds: number;
	k: number;
	coldPage: string;
	coldZoom: number;
	coldRuns: number;
	bootBusyMs: number;
}

function parseArgs(argv: string[]): Options {
	const o: Options = {
		project: "",
		out: "",
		measure: "edit",
		rounds: 5,
		k: 0.6,
		coldPage: "app",
		coldZoom: 0.45,
		coldRuns: 3,
		bootBusyMs: 0,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (next === undefined) throw new Error(`${arg} takes a value`);
		if (arg === "--project") o.project = resolve(next);
		else if (arg === "--out") o.out = resolve(next);
		else if (arg === "--measure" && (next === "edit" || next === "cold")) o.measure = next;
		else if (arg === "--rounds") o.rounds = Number(next);
		else if (arg === "--k") o.k = Number(next);
		else if (arg === "--cold-page") o.coldPage = next;
		else if (arg === "--cold-zoom") o.coldZoom = Number(next);
		else if (arg === "--cold-runs") o.coldRuns = Number(next);
		else if (arg === "--boot-busy-ms") o.bootBusyMs = Number(next);
		else throw new Error(`unknown argument ${arg}`);
		i++;
	}
	if (o.project === "") throw new Error("--project <spool project root> is required");
	if (o.out === "") throw new Error("--out <file> is required");
	return o;
}

const log = (line: string): void => {
	process.stderr.write(`edit-loop: ${line}\n`);
};
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

const PAGE = "edit-bench";
const FIXTURE = `${PAGE}/edit-fixture`;
const BOX = { x: 0, y: 0, w: 1200, h: 800 };
const PRIMITIVE = "shared/system/ui/primitives/actions";
const MARK_TIMEOUT_MS = 20_000;

/** The fixture frame, plain React state the way an agent writes it. */
function fixtureSource(mark: string, withPrimitive: boolean, bootBusyMs: number): string {
	return `import { useEffect, useState } from "react";
${withPrimitive ? `import { Button } from "${PRIMITIVE}";\n` : ""}import { Caption } from "shared/edit-bench/caption";
import "shared/edit-bench/probe";
${bootBusyMs > 0 ? `\nconst until = performance.now() + ${bootBusyMs};\nwhile (performance.now() < until) {}\n` : ""}
function Ticks() {
	const [ticks, setTicks] = useState(0);
	useEffect(() => {
		let id = requestAnimationFrame(function step() {
			setTicks((n) => n + 1);
			id = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(id);
	}, []);
	return <span data-edit-ticks>{ticks}</span>;
}

export default function Frame() {
	const [count, setCount] = useState(0);
	const [text, setText] = useState("");
	return (
		<main style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, padding: 40 }}>
			<h1 className="text-2xl font-semibold" data-edit-mark="frame">${mark}</h1>
			<Caption />
			<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
				${withPrimitive ? "<Button" : "<button"} data-edit-counter onClick={() => setCount((n) => n + 1)}>
					Count
				${withPrimitive ? "</Button>" : "</button>"}
				<span data-edit-count>{count}</span>
			</div>
			<input data-edit-input style={{ width: 256, border: "1px solid #999", padding: "4px 8px" }} value={text} onChange={(event) => setText(event.target.value)} />
			<div data-edit-scroll style={{ height: 192, width: 384, overflow: "auto", border: "1px solid #999" }}>
				{Array.from({ length: 60 }, (_, i) => (
					<p key={i} style={{ margin: 0, padding: "4px 8px" }}>Row {i + 1}</p>
				))}
			</div>
			<p>animation frames: <Ticks /></p>
		</main>
	);
}
`;
}

const captionSource = (mark: string): string => `export function Caption() {
	return <p className="text-sm text-gray-600" data-edit-mark="shared">${mark}</p>;
}
`;

/**
 * Every animation frame, the marked texts in the DOM; the first frame a text is
 * there, posted with the state that frame paints. Imported, never edited, so a
 * module-level engine that keeps unedited modules keeps this one running too.
 */
const PROBE = `const w = window as unknown as { __editProbe?: boolean };
if (!w.__editProbe) {
	w.__editProbe = true;
	const seen = new Set<string>();
	const step = (t: number) => {
		for (const el of document.querySelectorAll("[data-edit-mark]")) {
			const key = el.getAttribute("data-edit-mark") + "\\u0000" + el.textContent;
			if (seen.has(key)) continue;
			seen.add(key);
			const q = (s: string) => document.querySelector(s);
			window.parent.postMessage(
				{
					__editBench: {
						kind: el.getAttribute("data-edit-mark"),
						mark: el.textContent,
						at: performance.timeOrigin + t,
						count: q("[data-edit-count]")?.textContent ?? null,
						input: (q("[data-edit-input]") as HTMLInputElement | null)?.value ?? null,
						scroll: (q("[data-edit-scroll]") as HTMLElement | null)?.scrollTop ?? null,
						ticks: Number(q("[data-edit-ticks]")?.textContent ?? "NaN"),
					},
				},
				"*",
			);
		}
		requestAnimationFrame(step);
	};
	requestAnimationFrame(step);
}
export {};
`;

interface Painted {
	kind: string;
	mark: string;
	at: number;
	count: string | null;
	input: string | null;
	scroll: number | null;
	ticks: number;
}

/** The top document's ear for the probe, installed beside the harness's collector. */
function listenForMarks(): void {
	if (window !== window.top) return;
	const marks: Painted[] = [];
	(globalThis as unknown as { __editMarks: Painted[] }).__editMarks = marks;
	addEventListener("message", (event: MessageEvent) => {
		const data = (event.data as { __editBench?: Painted } | null)?.__editBench;
		if (data !== undefined) marks.push(data);
	});
}

interface Fixture {
	frameFile: string;
	captionFile: string;
	thumbs: string;
	withPrimitive: boolean;
	bootBusyMs: number;
	version: number;
}

function writeFixture(root: string, bootBusyMs: number): Fixture {
	const design = join(root, "design");
	const withPrimitive = (() => {
		try {
			return statSync(join(design, `${PRIMITIVE}.tsx`)).isFile();
		} catch {
			return false;
		}
	})();
	const dir = join(design, "frames", PAGE, "edit-fixture");
	mkdirSync(dir, { recursive: true });
	mkdirSync(join(design, "shared", "edit-bench"), { recursive: true });
	writeFileSync(join(dir, "frame.json"), `${JSON.stringify(BOX, null, "\t")}\n`);
	const fixture: Fixture = {
		frameFile: join(dir, "frame.tsx"),
		captionFile: join(design, "shared", "edit-bench", "caption.tsx"),
		thumbs: join(design, ".spool", "thumbs", encodeURIComponent(FIXTURE)),
		withPrimitive,
		bootBusyMs,
		version: 0,
	};
	writeFileSync(join(design, "shared", "edit-bench", "probe.ts"), PROBE);
	writeFileSync(fixture.captionFile, captionSource("shared-v0"));
	writeFileSync(fixture.frameFile, fixtureSource("frame-v0", withPrimitive, bootBusyMs));
	return fixture;
}

/** An agent's write: the whole file, new text in it. Returns the epoch it was made at and the text to look for. */
function agentWrite(fixture: Fixture, kind: "frame" | "shared"): { at: number; mark: string } {
	fixture.version++;
	const mark = `${kind}-v${fixture.version}`;
	const source =
		kind === "frame" ? fixtureSource(mark, fixture.withPrimitive, fixture.bootBusyMs) : captionSource(mark);
	const at = Date.now();
	writeFileSync(kind === "frame" ? fixture.frameFile : fixture.captionFile, source);
	return { at, mark };
}

/** Until the booth has stored a cover of the fixture newer than `since`, or the bound. */
async function coverAfter(fixture: Fixture, since: number, boundMs = 20_000): Promise<boolean> {
	const deadline = Date.now() + boundMs;
	while (Date.now() < deadline) {
		try {
			for (const file of readdirSync(fixture.thumbs)) {
				if (/\.(jpg|png)$/.test(file) && statSync(join(fixture.thumbs, file)).mtimeMs > since) return true;
			}
		} catch {
			// not yet
		}
		await sleep(100);
	}
	return false;
}

async function fixtureFrame(page: Page, timeout = 15_000): Promise<Frame> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const handle = await page.$(`iframe[title=${JSON.stringify(FIXTURE)}]`);
		const frame = handle ? await handle.contentFrame() : null;
		if (frame !== null) {
			const ready = await frame
				.evaluate(() => document.querySelector("[data-edit-counter]") !== null)
				.catch(() => false);
			if (ready) return frame;
		}
		await sleep(30);
	}
	throw new Error(`${FIXTURE} never mounted a live document`);
}

const isEntered = (page: Page): Promise<boolean> =>
	page.evaluate((name) => {
		const el = document.querySelector(`iframe[title=${JSON.stringify(name)}]`);
		return el !== null && getComputedStyle(el).pointerEvents === "auto";
	}, FIXTURE);

async function enter(page: Page): Promise<void> {
	const box = await page.locator(`[data-frame-label=${JSON.stringify(FIXTURE)}]`).evaluate((label) => {
		const bounds = label.parentElement?.getBoundingClientRect();
		return bounds === undefined ? null : { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height };
	});
	if (box === null) throw new Error("the fixture has no box on the canvas");
	await page.mouse.dblclick(Math.round(box.x + box.w / 2), Math.round(box.y + box.h / 2));
	await page.waitForFunction(
		(name) => {
			const el = document.querySelector(`iframe[title=${JSON.stringify(name)}]`);
			return el !== null && getComputedStyle(el).pointerEvents === "auto";
		},
		FIXTURE,
		{ timeout: 20_000 },
	);
	// entering flies the camera; let it land
	await sleep(1200);
}

/**
 * A real click on an element of the frame, at its point on screen. The canvas
 * draws the iframe scaled by the camera, and playwright's own click into an
 * out-of-process frame aims at the unscaled point, which lands on something else.
 */
async function clickIn(page: Page, frame: Frame, selector: string): Promise<void> {
	const iframe = await page.locator(`iframe[title=${JSON.stringify(FIXTURE)}]`).evaluate((el) => {
		const r = el.getBoundingClientRect();
		return { x: r.x, y: r.y, w: r.width };
	});
	const inner = await frame.evaluate((sel) => {
		const el = document.querySelector(sel);
		if (el === null) return null;
		const r = el.getBoundingClientRect();
		return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: innerWidth };
	}, selector);
	if (inner === null) throw new Error(`no ${selector} in the fixture`);
	const scale = iframe.w / inner.width;
	await page.mouse.click(iframe.x + inner.x * scale, iframe.y + inner.y * scale);
	await sleep(60);
}

const STATE = { count: "3", input: "kept", scroll: 300 };

/** A person's state in the frame: three clicks, some typing, a scroll, and the animation left running. */
async function putState(page: Page): Promise<{ ticks: number }> {
	if (!(await isEntered(page))) await enter(page);
	const frame = await fixtureFrame(page);
	for (let i = 0; i < 3; i++) await clickIn(page, frame, "[data-edit-counter]");
	await clickIn(page, frame, "[data-edit-input]");
	await page.keyboard.type(STATE.input);
	await frame.locator("[data-edit-scroll]").evaluate((el, top) => {
		el.scrollTop = top;
	}, STATE.scroll);
	await sleep(1500);
	const now = await frame.evaluate(() => ({
		count: document.querySelector("[data-edit-count]")?.textContent ?? null,
		input: (document.querySelector("[data-edit-input]") as HTMLInputElement | null)?.value ?? null,
		scroll: (document.querySelector("[data-edit-scroll]") as HTMLElement | null)?.scrollTop ?? null,
		ticks: Number(document.querySelector("[data-edit-ticks]")?.textContent ?? "NaN"),
	}));
	// the readers have to see the state they are about to judge, or a kept 0 means nothing
	if (now.count !== STATE.count || now.input !== STATE.input || now.scroll !== STATE.scroll || !(now.ticks > 30)) {
		throw new Error(`the fixture did not take its state: ${JSON.stringify(now)}`);
	}
	return { ticks: now.ticks };
}

/** What `--out` gets: the loop's metrics, and the samples behind them. */
type Report = { metrics: Record<string, number> } & Record<string, unknown>;

interface EditSample {
	kind: "frame" | "shared";
	pixelsMs: number;
	loadedMs: number | null;
	kept: number;
	painted: Painted;
	reentered: boolean;
}

async function editOnce(page: Page, fixture: Fixture, kind: "frame" | "shared"): Promise<EditSample> {
	const before = await putState(page);
	const write = agentWrite(fixture, kind);
	const deadline = Date.now() + MARK_TIMEOUT_MS;
	let painted: Painted | undefined;
	while (painted === undefined) {
		if (Date.now() > deadline) throw new Error(`"${write.mark}" never painted in ${MARK_TIMEOUT_MS / 1000} s`);
		await sleep(20);
		painted = await page.evaluate(
			(mark) => (globalThis as unknown as { __editMarks: Painted[] }).__editMarks.find((m) => m.mark === mark),
			write.mark,
		);
	}
	// the loaded report, when the edit reloaded the document, comes after or with the paint
	await sleep(1000);
	const loaded = await page.evaluate(
		({ frame, after }) => {
			const state = (globalThis as unknown as { __bench: BenchState }).__bench;
			const hit = state.loaded.find((entry) => entry.frame === frame && performance.timeOrigin + entry.t >= after);
			return hit === undefined ? null : performance.timeOrigin + hit.t;
		},
		{ frame: FIXTURE, after: write.at },
	);
	const kept =
		Number(painted.count === STATE.count) +
		Number(painted.input === STATE.input) +
		Number(painted.scroll === STATE.scroll) +
		Number(painted.ticks >= before.ticks);
	const reentered = !(await isEntered(page));
	const sample: EditSample = {
		kind,
		pixelsMs: painted.at - write.at,
		loadedMs: loaded === null ? null : loaded - write.at,
		kept,
		painted,
		reentered,
	};
	log(
		`${kind} edit: pixels ${sample.pixelsMs.toFixed(0)} ms, loaded ${sample.loadedMs?.toFixed(0) ?? "-"} ms, ` +
			`state kept ${kept}/4 (${JSON.stringify({ count: painted.count, input: painted.input, scroll: painted.scroll, ticks: painted.ticks, before: before.ticks })})` +
			`${reentered ? ", the frame was left" : ""}`,
	);
	if (!(await coverAfter(fixture, write.at))) log("the booth stored no new cover within its bound");
	await sleep(500);
	return sample;
}

/** One GET of the fixture's document from the render host, as the iframe asks for it. */
function fetchDocument(daemon: Daemon, project: string): Promise<{ ms: number; cache: string; status: number }> {
	const { port } = new URL(daemon.url);
	const started = performance.now();
	return new Promise((done, fail) => {
		const req = request(
			{
				host: "127.0.0.1",
				port,
				path: `/p/${encodeURIComponent(project)}/frames/${encodeURIComponent(FIXTURE)}`,
				headers: { host: `run.spool.localhost:${port}` },
			},
			(res) => {
				res.resume();
				res.once("end", () =>
					done({
						ms: performance.now() - started,
						cache: String(res.headers["x-spool-cache"] ?? ""),
						status: res.statusCode ?? 0,
					}),
				);
			},
		);
		req.once("error", fail);
		req.end();
	});
}

async function compileRounds(daemon: Daemon, project: string, fixture: Fixture, rounds: number) {
	const out = { frame: [] as number[], shared: [] as number[], hit: [] as number[], notMissed: 0 };
	for (let round = 0; round < rounds; round++) {
		for (const kind of ["frame", "shared"] as const) {
			const write = agentWrite(fixture, kind);
			const miss = await fetchDocument(daemon, project);
			const hit = await fetchDocument(daemon, project);
			if (miss.status !== 200) throw new Error(`the fixture's document answered ${miss.status}`);
			if (miss.cache !== "miss") {
				out.notMissed++;
				log(`${kind} compile: the first fetch after the write was a ${miss.cache}, not counted`);
			} else out[kind].push(miss.ms);
			out.hit.push(hit.ms);
			log(`${kind} compile: miss ${miss.ms.toFixed(0)} ms, warm ${hit.ms.toFixed(1)} ms (${hit.cache})`);
			await coverAfter(fixture, write.at);
			await sleep(500);
		}
	}
	return out;
}

async function measureEdit(browser: Browser, o: Options): Promise<Report> {
	const { root, name, spoolDir } = copyProject(o.project);
	const fixture = writeFixture(root, o.bootBusyMs);
	log(`fixture ${FIXTURE} in ${root}, importing ${fixture.withPrimitive ? PRIMITIVE : "no subject primitive"}`);
	const daemon = await startDaemon(spoolDir, root, await freePort());
	const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
	try {
		const camera = {
			x: VIEWPORT.width / 2 - (BOX.x + BOX.w / 2) * o.k,
			y: VIEWPORT.height / 2 - (BOX.y + BOX.h / 2) * o.k,
			k: o.k,
		};
		writeCamera(root, camera, PAGE);
		await prepareCurrentCovers(browser, daemon, url, root, namedPage(root, PAGE).frames);
		writeCamera(root, camera, PAGE);
		const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
		const samples: EditSample[] = [];
		try {
			await context.addInitScript(collector);
			await context.addInitScript(listenForMarks);
			const page = await context.newPage();
			page.on("pageerror", (error) => log(`page error: ${String(error).slice(0, 200)}`));
			await page.goto(url, { waitUntil: "domcontentloaded" });
			await page.waitForSelector(`[data-frame-label=${JSON.stringify(FIXTURE)}]`, { timeout: 30_000 });
			await sleep(1500);
			await enter(page);
			// one edit untimed: the first reload pays for what the open did not
			await editOnce(page, fixture, "frame");
			for (let round = 0; round < o.rounds; round++) {
				samples.push(await editOnce(page, fixture, "frame"));
				samples.push(await editOnce(page, fixture, "shared"));
			}
		} finally {
			await context.close();
		}
		await sleep(1500);
		const compile = await compileRounds(daemon, name, fixture, o.rounds);
		const of = (kind: "frame" | "shared") => samples.filter((s) => s.kind === kind);
		const loadedOf = (kind: "frame" | "shared") =>
			of(kind)
				.map((s) => s.loadedMs)
				.filter((v): v is number => v !== null);
		const metrics: Record<string, number> = {
			save_to_pixels_ms: median(of("frame").map((s) => s.pixelsMs)),
			shared_save_to_pixels_ms: median(of("shared").map((s) => s.pixelsMs)),
			state_kept_count: median(of("frame").map((s) => s.kept)),
			shared_state_kept_count: median(of("shared").map((s) => s.kept)),
			compile_ms: median(compile.frame),
			shared_compile_ms: median(compile.shared),
			document_hit_ms: median(compile.hit),
		};
		// only an edit that reloaded the document has a loaded report to time
		if (loadedOf("frame").length > 0) metrics.save_to_loaded_ms = median(loadedOf("frame"));
		if (loadedOf("shared").length > 0) metrics.shared_save_to_loaded_ms = median(loadedOf("shared"));
		for (const [key, value] of Object.entries(metrics)) if (!Number.isFinite(value)) delete metrics[key];
		return { metrics, samples, compile, primitive: fixture.withPrimitive ? PRIMITIVE : null };
	} finally {
		daemon.stop();
		await Promise.race([daemon.exited, sleep(15_000)]);
	}
}

async function coldOnce(browser: Browser, o: Options) {
	const { root, name, spoolDir } = copyProject(o.project);
	// cold: no covers, seeded or not
	rmSync(join(root, "design", ".spool", "thumbs"), { recursive: true, force: true });
	const frames = namedPage(root, o.coldPage).frames;
	writeCamera(root, planCamera(frames, VIEWPORT.width, VIEWPORT.height, o.coldZoom), o.coldPage);
	const port = await freePort();
	const spawned = Date.now();
	const daemon = await startDaemon(spoolDir, root, port);
	const up = Date.now();
	const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
	try {
		await context.addInitScript(collector);
		const page = await context.newPage();
		await page.goto(`${daemon.url}/p/${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded" });
		await page.waitForSelector("[data-frame-label]", { state: "attached", timeout: 60_000 });
		const ready = Date.now();
		await page.waitForFunction(
			() => (globalThis as unknown as { __bench: BenchState }).__bench.loaded.length > 0,
			undefined,
			{ timeout: 60_000, polling: 50 },
		);
		const first = await page.evaluate(() => {
			const state = (globalThis as unknown as { __bench: BenchState }).__bench;
			const entry = state.loaded[0] as { frame: string; t: number };
			return { frame: entry.frame, at: performance.timeOrigin + entry.t };
		});
		const run = {
			daemonUpMs: up - spawned,
			canvasReadyMs: ready - spawned,
			firstLiveMs: first.at - spawned,
			frame: first.frame,
		};
		log(
			`cold: daemon up ${run.daemonUpMs} ms, canvas ${run.canvasReadyMs} ms, first live ${run.firstLiveMs.toFixed(0)} ms (${run.frame})`,
		);
		return run;
	} finally {
		await context.close();
		daemon.stop();
		await Promise.race([daemon.exited, sleep(15_000)]);
	}
}

async function measureCold(browser: Browser, o: Options): Promise<Report> {
	const runs = [];
	for (let i = 0; i < o.coldRuns; i++) runs.push(await coldOnce(browser, o));
	return {
		metrics: {
			daemon_up_ms: median(runs.map((r) => r.daemonUpMs)),
			canvas_ready_ms: median(runs.map((r) => r.canvasReadyMs)),
			cold_first_live_ms: median(runs.map((r) => r.firstLiveMs)),
		},
		runs,
	};
}

async function main(): Promise<void> {
	const o = parseArgs(process.argv.slice(2));
	const loadBefore = oneMinuteLoad();
	const started = Date.now();
	const browser = await chromium.launch({ channel: "chromium", headless: false });
	try {
		const report = o.measure === "edit" ? await measureEdit(browser, o) : await measureCold(browser, o);
		const out = {
			...report,
			measure: o.measure,
			loadBefore,
			loadAfter: oneMinuteLoad(),
			tookMs: Date.now() - started,
		};
		writeFileSync(o.out, `${JSON.stringify(out, null, "\t")}\n`);
		process.stdout.write(`${JSON.stringify(out.metrics)}\n`);
	} finally {
		await browser.close();
	}
}

await main();
