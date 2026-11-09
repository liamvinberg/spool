import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { type BrowserContext, chromium, type Page, type Worker } from "playwright-core";
import { buildExtension } from "./build";

/**
 * How close a reference comes to the site it was taken from, site by site: each page is sent whole through the real
 * extension to a spool of its own, then the live page and the reference are read the same way and compared.
 *
 *     pnpm extension:bench                       # every site in extension/bench-sites.txt
 *     pnpm extension:bench --only linear,stripe  # those whose address holds one of these
 *
 * Scores, out of 100, the worst first: text (each piece of visible text where it was, in its font, size and colour),
 * look (the first screen, block by block), images (none broken), video (what played plays), fonts (each face the site
 * loaded) and hover (what changed under the pointer on the site changes in the reference). The hover pass touches the
 * site before the picker opens, so what the reference does again is what the picker found by itself. Results and a
 * side-by-side page go to --out (/tmp/spool-bench).
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const VIEW = { width: 1440, height: 900 };
const UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const WEIGHTS = { text: 35, look: 25, images: 10, video: 10, fonts: 10, hover: 10 } as const;
type Part = keyof typeof WEIGHTS;

const { values } = parseArgs({
	options: {
		sites: { type: "string", default: join(here, "bench-sites.txt") },
		only: { type: "string" },
		out: { type: "string", default: "/tmp/spool-bench" },
		"no-gpu": { type: "boolean", default: false },
	},
});
const out = values.out;
/** a blank page of its own to compare images in, out of reach of any site's policy */
let scratch: Page;

/** what one page shows, read the same way on the site and in the reference */
interface Reading {
	/** each piece of visible text: what it says, where it sits on the page, its font, size and colour */
	text: Array<[string, number, number, string, string, string]>;
	images: number;
	broken: string[];
	videos: number;
	playing: number;
	fonts: string[];
}

const READ = `(() => {
	const text = [];
	const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
	// a run of text split by comments (a framework's markers, which a reference drops) is one text, as the reference has it
	const split = (n) => n !== null && (n.nodeType === 3 || n.nodeType === 8);
	for (let n = walk.nextNode(); n !== null && text.length < 4000; n = walk.nextNode()) {
		let before = n.previousSibling;
		while (before !== null && before.nodeType === 8) before = before.previousSibling;
		if (before !== null && before.nodeType === 3) continue;
		let last = n;
		let data = n.data;
		while (split(last.nextSibling)) {
			last = last.nextSibling;
			if (last.nodeType === 3) data += last.data;
		}
		const said = data.replace(/\\s+/g, " ").trim();
		const p = n.parentElement;
		if (said.length < 2 || p === null || p.closest("script, style, noscript, template, spool-picker")) continue;
		const s = getComputedStyle(p);
		if (s.visibility !== "visible" || Number(s.opacity) === 0) continue;
		const range = document.createRange();
		range.setStart(n, 0);
		range.setEnd(last, last.nodeType === 3 ? last.data.length : 0);
		const r = range.getBoundingClientRect();
		if (r.width < 1 || r.height < 1) continue;
		text.push([said.slice(0, 80), Math.round(r.left + scrollX), Math.round(r.top + scrollY), s.fontFamily.split(",")[0].replace(/["']/g, "").trim(), s.fontSize, s.color]);
	}
	const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
	const imgs = [...document.querySelectorAll("img")].filter(shown);
	const vids = [...document.querySelectorAll("video")].filter(shown);
	const fonts = new Set();
	for (const f of document.fonts) if (f.status === "loaded") fonts.add(f.family.replace(/["']/g, "") + " " + f.weight + " " + f.style);
	return {
		text,
		images: imgs.length,
		broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => (i.currentSrc || i.src).slice(0, 120)),
		videos: vids.length,
		playing: vids.filter((v) => !v.paused).length,
		fonts: [...fonts],
	};
})()`;

/** where the pointer becomes a hand, outermost and largest first, in the first screen */
const HOVERABLE = `(() => {
	const found = [];
	for (const el of document.body.querySelectorAll("*")) {
		if (el.closest("svg") && el.localName !== "svg") continue;
		if (getComputedStyle(el).cursor !== "pointer") continue;
		if (el.parentElement && getComputedStyle(el.parentElement).cursor === "pointer") continue;
		const r = el.getBoundingClientRect();
		if (r.width < 24 || r.height < 16 || r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) continue;
		found.push([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]);
	}
	return found.sort((a, b) => b[2] * b[3] - a[2] * a[3]).slice(0, 6);
})()`;

interface Result {
	url: string;
	frame?: string;
	error?: string;
	ms?: number;
	score: number;
	parts: Partial<Record<Part, number>>;
	detail: Record<string, unknown>;
	shots: { live: string; ref?: string };
}

async function main(): Promise<void> {
	let sites = readFileSync(values.sites, "utf8")
		.split("\n")
		.map((line) => line.replace(/#.*/, "").trim())
		.filter(Boolean);
	if (values.only !== undefined) {
		const only = values.only.split(",");
		sites = sites.filter((site) => only.some((one) => site.includes(one)));
	}
	rmSync(out, { recursive: true, force: true });
	const project = join(out, "project");
	mkdirSync(project, { recursive: true });
	mkdirSync(join(out, "shots"), { recursive: true });

	const port = await freePort();
	const env = { ...process.env, SPOOL_DIR: join(out, "state"), SPOOL_PORT: String(port) };
	await cli(["init", "--local"], env, project);
	await cli(["open", project], env);
	await cli(["serve"], env);
	const ext = join(out, "ext");
	await buildExtension({ test: true, out: ext });
	// a browser that dies on one site (out of memory, a GPU fault) is started again for the next
	let ctx: BrowserContext | undefined;
	let sw: Worker | undefined;
	let alive = false;
	const start = async (): Promise<[BrowserContext, Worker]> => {
		if (alive && ctx !== undefined && sw !== undefined) return [ctx, sw];
		await ctx?.close().catch(() => {});
		ctx = await chromium.launchPersistentContext(join(out, "profile"), {
			headless: true,
			channel: "chromium",
			viewport: VIEW,
			userAgent: UA,
			args: [
				...(values["no-gpu"]
					? []
					: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=vulkan", "--enable-features=Vulkan"]),
				`--disable-extensions-except=${ext}`,
				`--load-extension=${ext}`,
			],
		});
		alive = true;
		ctx.on("close", () => {
			alive = false;
		});
		sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
		await sw.evaluate((p) => chrome.storage.local.set({ ports: [p] }), port);
		scratch = await ctx.newPage();
		return [ctx, sw];
	};
	const results: Result[] = [];
	try {
		for (const [i, url] of sites.entries()) {
			const [context, worker] = await start();
			const result = await bench(context, worker, url, i, project, port).catch(
				(e: unknown): Result => ({
					url,
					error: String(e).split("\n")[0]?.slice(0, 200) ?? "failed",
					score: 0,
					parts: {},
					detail: {},
					shots: { live: "" },
				}),
			);
			results.push(result);
			console.log(line(result));
		}
	} finally {
		await ctx?.close();
		await cli(["stop"], env).catch(() => {});
	}
	results.sort((a, b) => a.score - b.score);
	writeFileSync(join(out, "results.json"), JSON.stringify(results, null, "\t"));
	writeFileSync(join(out, "index.html"), report(results));
	const mean = results.reduce((sum, r) => sum + r.score, 0) / Math.max(1, results.length);
	console.log(`\n${results.length} sites, mean ${mean.toFixed(1)}; worst first in ${join(out, "index.html")}`);
	for (const r of results) console.log(line(r));
}

async function bench(
	ctx: BrowserContext,
	sw: Worker,
	url: string,
	i: number,
	project: string,
	port: number,
): Promise<Result> {
	const key = `${String(i).padStart(2, "0")}-${new URL(url).host.replace(/^www\./, "")}`;
	const page = await ctx.newPage();
	try {
		await page.goto(url, { waitUntil: "load", timeout: 45_000 });
		await page.waitForTimeout(3500);
		await page.mouse.move(VIEW.width - 2, VIEW.height - 2);
		const liveShot = `shots/${key}-live.png`;
		const live = (await page.evaluate(READ)) as Reading;
		const liveLook = await page.screenshot({ path: join(out, liveShot) });
		const spots = (await page.evaluate(HOVERABLE)) as Array<[number, number, number, number]>;
		const liveHover = await hovering(page, spots, 0, 0);
		await page.evaluate("scrollTo(0, 0)");

		const frames = join(project, "design", "frames", "references");
		mkdirSync(frames, { recursive: true });
		const before = new Set(readdirSync(frames));
		const started = Date.now();
		await page.bringToFront();
		await sw.evaluate(async (at) => {
			const [tab] = await chrome.tabs.query({ url: at });
			if (tab?.id === undefined) throw new Error(`no tab at ${at}`);
			await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["picker.js"] });
		}, page.url());
		await page.waitForSelector("spool-picker", { state: "attached" });
		await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
		await page.keyboard.press("Control+Enter");
		let said = "";
		while (!/references\/|Try again/.test(said) && Date.now() - started < 90_000) {
			await page.waitForTimeout(200);
			said = await page.evaluate(
				`document.querySelector("spool-picker")?.shadowRoot?.textContent?.replace(/\\s+/g, " ") ?? ""`,
			);
		}
		const ms = Date.now() - started;
		const frame = readdirSync(frames).find((name) => !before.has(name) && statSync(join(frames, name)).isDirectory());
		if (frame === undefined) throw new Error(`not sent: ${said.slice(0, 120) || "no answer"}`);
		const notes = /Left out: ([^\n]*)/.exec(readFileSync(join(frames, frame, "frame.tsx"), "utf8"))?.[1];

		const ref = await ctx.newPage();
		try {
			await ref.goto(
				`http://run.spool.localhost:${port}/p/project/frames/${encodeURIComponent(`references/${frame}`)}`,
				{
					waitUntil: "load",
					timeout: 45_000,
				},
			);
			await ref.waitForTimeout(3500);
			const inner = ref.frames().find((f) => f !== ref.mainFrame());
			if (inner === undefined) throw new Error("the reference drew no page");
			const box = await (await inner.frameElement()).boundingBox();
			const reading = (await inner.evaluate(READ)) as Reading;
			const refShot = `shots/${key}-ref.png`;
			const refLook = await ref.screenshot({ path: join(out, refShot) });
			const refHover = await hovering(ref, spots, box?.x ?? 0, box?.y ?? 0);
			writeFileSync(join(out, `shots/${key}-readings.json`), JSON.stringify({ live, ref: reading }));
			const parts = compare(live, reading);
			parts.look = 1 - (await difference(liveLook, refLook, 16));
			const reacting = liveHover.filter(Boolean).length;
			if (reacting > 0) parts.hover = liveHover.filter((r, n) => r && refHover[n]).length / reacting;
			return {
				url,
				frame,
				ms,
				score: total(parts),
				parts,
				detail: {
					text: `${live.text.length} pieces`,
					misplaced: misplaced(live, reading).slice(0, 6),
					broken: reading.broken.slice(0, 4),
					videos: `${reading.playing}/${live.playing} playing`,
					fontsMissing: live.fonts.filter((f) => !reading.fonts.includes(f)).slice(0, 6),
					hovers: `${liveHover.map((r, n) => (r ? (refHover[n] ? "✓" : "✗") : "·")).join("")}`,
					notes,
					size: dirSize(join(frames, frame)),
				},
				shots: { live: liveShot, ref: refShot },
			};
		} finally {
			await ref.close();
		}
	} finally {
		await page.close();
	}
}

/** for each spot, whether the pointer resting on it changes what it shows */
async function hovering(
	page: Page,
	spots: Array<[number, number, number, number]>,
	dx: number,
	dy: number,
): Promise<boolean[]> {
	const changed: boolean[] = [];
	for (const [x, y, w, h] of spots) {
		const clip = { x: x + dx, y: y + dy, width: w, height: h };
		await page.mouse.move(VIEW.width - 2, VIEW.height - 2);
		await page.waitForTimeout(400);
		const rest = await page.screenshot({ clip });
		await page.mouse.move(clip.x + w / 2, clip.y + h / 2, { steps: 3 });
		await page.waitForTimeout(700);
		const under = await page.screenshot({ clip });
		changed.push((await difference(rest, under)) > 0.02);
	}
	await page.mouse.move(VIEW.width - 2, VIEW.height - 2);
	return changed;
}

/** text in place, styled the same, and the media and fonts kept; each 0 to 1, or absent where the site has none */
function compare(live: Reading, ref: Reading): Partial<Record<Part, number>> {
	const parts: Partial<Record<Part, number>> = {};
	if (live.text.length > 0) {
		const { placed, styled } = matchText(live, ref);
		parts.text = (placed + styled) / (2 * live.text.length);
	}
	if (live.images > 0) parts.images = Math.max(0, 1 - ref.broken.length / Math.max(1, ref.images));
	if (live.playing > 0) parts.video = Math.min(1, ref.playing / live.playing);
	if (live.fonts.length > 0) parts.fonts = live.fonts.filter((f) => ref.fonts.includes(f)).length / live.fonts.length;
	return parts;
}

function matchText(live: Reading, ref: Reading): { placed: number; styled: number; off: string[] } {
	const pool = new Map<string, Reading["text"]>();
	for (const one of ref.text) pool.set(one[0], [...(pool.get(one[0]) ?? []), one]);
	let placed = 0;
	let styled = 0;
	const off: string[] = [];
	for (const one of live.text) {
		const same = pool.get(one[0]) ?? [];
		let best = -1;
		let bestAt = Number.POSITIVE_INFINITY;
		for (const [n, other] of same.entries()) {
			const d = Math.max(Math.abs(other[1] - one[1]), Math.abs(other[2] - one[2]));
			if (d < bestAt) {
				bestAt = d;
				best = n;
			}
		}
		const match = same[best];
		if (match === undefined) {
			off.push(`missing "${one[0].slice(0, 30)}"`);
			continue;
		}
		same.splice(best, 1);
		if (bestAt <= 4) placed++;
		else off.push(`"${one[0].slice(0, 30)}" ${bestAt}px off`);
		if (match[3] === one[3] && match[4] === one[4] && match[5] === one[5]) styled++;
		else
			off.push(
				`"${one[0].slice(0, 30)}" styled ${match[3]} ${match[4]} ${match[5]} for ${one[3]} ${one[4]} ${one[5]}`,
			);
	}
	return { placed, styled, off };
}

function misplaced(live: Reading, ref: Reading): string[] {
	return matchText(live, ref).off;
}

/** the share of blocks that differ between two images of one size (a script: tsx's helpers don't reach a page) */
const DIFFER = `async (one, two, size) => {
	const load = async (b64) => createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob());
	const [x, y] = await Promise.all([load(one), load(two)]);
	const w = Math.min(x.width, y.width);
	const h = Math.min(x.height, y.height);
	const cw = Math.max(1, Math.floor(w / size));
	const ch = Math.max(1, Math.floor(h / size));
	const px = (img) => {
		const c = new OffscreenCanvas(cw, ch);
		const g = c.getContext("2d");
		g.drawImage(img, 0, 0, w, h, 0, 0, cw, ch);
		return g.getImageData(0, 0, cw, ch).data;
	};
	const p = px(x);
	const q = px(y);
	let off = 0;
	for (let i = 0; i < p.length; i += 4) {
		if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 36) off++;
	}
	return off / (cw * ch);
}`;

async function difference(a: Buffer, b: Buffer, block = 4): Promise<number> {
	const args = [a.toString("base64"), b.toString("base64"), block].map((v) => JSON.stringify(v)).join(", ");
	return (await scratch.evaluate(`(${DIFFER})(${args})`)) as number;
}

function total(parts: Partial<Record<Part, number>>): number {
	let sum = 0;
	let weight = 0;
	for (const [part, w] of Object.entries(WEIGHTS) as Array<[Part, number]>) {
		const v = parts[part];
		if (v === undefined) continue;
		sum += v * w;
		weight += w;
	}
	return weight === 0 ? 0 : Math.round((1000 * sum) / weight) / 10;
}

function line(r: Result): string {
	const host = new URL(r.url).host.replace(/^www\./, "").padEnd(22);
	if (r.error !== undefined) return `${host}  failed  ${r.error}`;
	const parts = (Object.keys(WEIGHTS) as Part[])
		.map((p) => `${p} ${r.parts[p] === undefined ? "  -" : String(Math.round((r.parts[p] ?? 0) * 100)).padStart(3)}`)
		.join("  ");
	return `${host}  ${r.score.toFixed(1).padStart(5)}  ${parts}  ${((r.ms ?? 0) / 1000).toFixed(1)}s`;
}

function report(results: Result[]): string {
	const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
	const rows = results
		.map(
			(r) => `<section><h2>${r.score.toFixed(1)} <a href="${esc(r.url)}">${esc(r.url)}</a></h2>
<pre>${esc(r.error ?? line(r))}\n${esc(JSON.stringify(r.detail, null, 1))}</pre>
<div class="pair"><img src="${r.shots.live}" alt="live"><img src="${r.shots.ref ?? ""}" alt="reference"></div></section>`,
		)
		.join("\n");
	return `<!doctype html><html><head><meta charset="utf-8"><title>Reference bench</title>
<meta name="description" content="How close each reference came to its site, worst first">
<style>body{font:14px system-ui;margin:24px;background:#fafafa}section{margin-bottom:40px}pre{white-space:pre-wrap;font-size:12px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pair img{width:100%;border:1px solid #ccc}</style></head>
<body><h1>Reference bench: live on the left, reference on the right, worst first</h1>${rows}</body></html>`;
}

function dirSize(dir: string): string {
	let bytes = 0;
	const walk = (d: string) => {
		for (const e of readdirSync(d, { withFileTypes: true })) {
			if (e.isDirectory()) walk(join(d, e.name));
			else bytes += statSync(join(d, e.name)).size;
		}
	};
	walk(dir);
	return `${(bytes / 1e6).toFixed(1)} MB`;
}

function cli(args: string[], env: NodeJS.ProcessEnv, cwd = root): Promise<void> {
	return new Promise((done, fail) => {
		const child: ChildProcess = spawn("npx", ["tsx", join(root, "src/cli.ts"), ...args], {
			env,
			cwd,
			stdio: "ignore",
		});
		child.on("exit", (code) => (code === 0 ? done() : fail(new Error(`spool ${args[0]} exited ${code}`))));
	});
}

function freePort(): Promise<number> {
	return new Promise((done) => {
		const s = createServer();
		s.listen(0, "127.0.0.1", () => {
			const at = s.address();
			s.close(() => done(typeof at === "object" && at !== null ? at.port : 0));
		});
	});
}

await main();
