import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Frame, type Page } from "playwright-core";
import { copyProject, freePort, prepareCurrentCovers, readPages, startDaemon, writeCamera } from "./harness.ts";

/**
 * Editing feel on a real project (task 141): how long each everyday hand
 * gesture takes, from the input to the moment it shows on screen, and to the
 * moment the file on disk has it. Run headed, on the machine being judged.
 *
 *   node bench/qa-editing.ts --project <path> --frame app/spool-home [--hud] [--pause 700] [--out run.json]
 *
 * `--hud` draws each figure on the canvas as it lands, for a recording.
 */

interface Options {
	project: string;
	frame: string;
	hud: boolean;
	pause: number;
	out: string | undefined;
	k: number;
	record: string | undefined;
}

function parseArgs(argv: string[]): Options {
	const o: Options = {
		project: "",
		frame: "app/spool-home",
		hud: false,
		pause: 0,
		out: undefined,
		k: 0.85,
		record: undefined,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--hud") {
			o.hud = true;
			continue;
		}
		const n = argv[i + 1];
		if (n === undefined) continue;
		if (a === "--project") o.project = n;
		else if (a === "--frame") o.frame = n;
		else if (a === "--pause") o.pause = Number(n);
		else if (a === "--out") o.out = n;
		else if (a === "--k") o.k = Number(n);
		else if (a === "--record") o.record = n;
		else continue;
		i++;
	}
	if (o.project === "") throw new Error("--project is required");
	return o;
}

const VIEW = { width: 1440, height: 810 };
const opts = parseArgs(process.argv.slice(2));
const results: Record<string, number[]> = {};
const notes: string[] = [];
/** Adds a value under a key, with no unit. */
const tally = (key: string, value: number) => {
	const list = results[key] ?? [];
	list.push(value);
	results[key] = list;
};
const record = (key: string, value: number) => {
	tally(key, value);
	process.stderr.write(`qa: ${key} ${value.toFixed(1)} ms\n`);
};
const note = (line: string) => {
	notes.push(line);
	process.stderr.write(`qa: ${line}\n`);
};
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Every source file under design/ with its modification time, to see which one a save wrote. */
function sourceTimes(root: string): Map<string, number> {
	const out = new Map<string, number>();
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name === ".spool" || entry.name === "node_modules") continue;
			const path = join(dir, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (/\.(tsx?|jsx?|css|json)$/.test(entry.name)) out.set(path, statSync(path).mtimeMs);
		}
	};
	walk(join(root, "design"));
	return out;
}

/** When a file under design/ next changes, in wall-clock ms, polled every 5 ms. */
async function nextWrite(
	root: string,
	before: Map<string, number>,
	timeout = 8000,
): Promise<{ at: number; path: string } | undefined> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		for (const [path, mtime] of sourceTimes(root)) {
			if (before.get(path) !== mtime) return { at: Date.now(), path };
		}
		await sleep(5);
	}
	return undefined;
}

async function hud(page: Page, line: string): Promise<void> {
	if (!opts.hud) return;
	await page.evaluate((text) => {
		let box = document.getElementById("qa-hud");
		if (box === null) {
			box = document.createElement("div");
			box.id = "qa-hud";
			box.style.cssText =
				"position:fixed;left:16px;bottom:16px;z-index:2147483647;pointer-events:none;font:600 15px/1.45 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.82);padding:12px 16px;border-radius:10px;max-width:640px;white-space:pre";
			document.body.appendChild(box);
		}
		const lines = (box.textContent ?? "").split("\n").filter(Boolean);
		lines.push(text);
		box.textContent = lines.slice(-9).join("\n");
	}, line);
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

/** Watch the selection ring: resolves the epoch ms of the first animation frame it differs from now. */
async function armRing(page: Page): Promise<void> {
	await page.evaluate(() => {
		const now = () => performance.timeOrigin + performance.now();
		const w = window as unknown as Record<string, unknown>;
		const read = () => {
			const ring = document.querySelector("[data-element-ring]");
			if (ring === null) return "none";
			const r = ring.getBoundingClientRect();
			return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
		};
		const before = read();
		w.__ringAt = undefined;
		w.__upAt = undefined;
		addEventListener(
			"pointerup",
			() => {
				w.__upAt = now();
			},
			{ capture: true, once: true },
		);
		const started = now();
		const tick = () => {
			if (read() !== before && read() !== "none") {
				w.__ringAt = now();
				return;
			}
			if (now() - started < 5000) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
}

async function ringLatency(page: Page): Promise<number | undefined> {
	for (let i = 0; i < 200; i++) {
		const got = await page.evaluate(() => {
			const w = window as unknown as Record<string, number | undefined>;
			return w.__ringAt !== undefined && w.__upAt !== undefined ? w.__ringAt - w.__upAt : undefined;
		});
		if (got !== undefined) return got;
		await sleep(25);
	}
	return undefined;
}

interface Candidate {
	index: number;
	tag: string;
	text: string;
	x: number;
	y: number;
}

/** Elements with words of their own, on screen, as page coordinates. */
async function candidates(page: Page, frame: Frame, name: string): Promise<Candidate[]> {
	const box = await (await page.$(`iframe[title="${name}"]`))?.boundingBox();
	if (!box) throw new Error("no iframe box");
	const inner = await frame.evaluate(() => {
		const w = window as unknown as { __qa?: Element[] };
		const found: Element[] = [];
		const out: { index: number; tag: string; text: string; x: number; y: number; w: number; h: number }[] = [];
		for (const el of Array.from(document.querySelectorAll("#root *"))) {
			const own = Array.from(el.childNodes)
				.filter((n) => n.nodeType === 3)
				.map((n) => n.textContent ?? "")
				.join("")
				.trim();
			if (own.length < 3 || own.length > 60) continue;
			const r = el.getBoundingClientRect();
			if (r.width < 24 || r.height < 10) continue;
			found.push(el);
			out.push({
				index: found.length - 1,
				tag: el.tagName.toLowerCase(),
				text: own,
				x: r.x,
				y: r.y,
				w: r.width,
				h: r.height,
			});
		}
		w.__qa = found;
		return { list: out, width: document.documentElement.clientWidth };
	});
	const scale = box.width / inner.width;
	return inner.list
		.map((c) => ({
			index: c.index,
			tag: c.tag,
			text: c.text,
			x: box.x + (c.x + Math.min(c.w / 2, 30)) * scale,
			y: box.y + (c.y + c.h / 2) * scale,
		}))
		.filter((c) => c.x > 40 && c.y > 70 && c.x < VIEW.width - 300 && c.y < VIEW.height - 40);
}

/** Whether the frame still shows the document marked before the gesture. */
async function stillHere(page: Page, name: string): Promise<boolean> {
	const f = await liveFrame(page, name).catch(() => undefined);
	return (
		(await f
			?.evaluate(() => (window as unknown as Record<string, unknown>).__marker === "still-here")
			.catch(() => false)) ?? false
	);
}

async function refusalShown(page: Page): Promise<string | undefined> {
	const refusal = page.locator("[data-hand-refusal]");
	if ((await refusal.count()) === 0) return undefined;
	return (await refusal.first().getAttribute("data-hand-refusal")) ?? "refused";
}

async function main(): Promise<void> {
	const { root, name, spoolDir } = copyProject(opts.project);
	const pageName = opts.frame.split("/").slice(0, -1).join("/");
	const pages = readPages(root);
	const onPage = pages.find((p) => p.page === pageName);
	const target = onPage?.frames.find((f) => f.name === opts.frame);
	if (!onPage || !target) throw new Error(`${opts.frame} is not on page ${pageName}`);
	const daemon = await startDaemon(spoolDir, root, await freePort());
	const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
	const browser = await chromium.launch({
		channel: "chromium",
		headless: false,
		args: ["--window-position=0,0", `--window-size=${VIEW.width},${VIEW.height + 90}`],
	});
	try {
		writeCamera(root, { x: 0, y: 0, k: 0.16 }, pageName);
		await prepareCurrentCovers(browser, daemon, url, root, onPage.frames);
		const k = opts.k;
		writeCamera(root, { x: VIEW.width / 2 - (target.x + target.w / 2) * k, y: 70 - target.y * k, k }, pageName);
		const context = await browser.newContext({
			viewport: VIEW,
			...(opts.record ? { recordVideo: { dir: "/tmp/qa141-video", size: VIEW } } : {}),
		});
		const page = await context.newPage();
		const api: { path: string; ms: number }[] = [];
		page.on("requestfinished", (request) => {
			const path = new URL(request.url()).pathname;
			if (!path.startsWith("/api/")) return;
			const t = request.timing();
			api.push({ path: `${request.method()} ${path.replace(/^\/api\/p\/[^/]+/, "")}`, ms: t.responseEnd });
		});
		const navStart = Date.now();
		await page.goto(url, { waitUntil: "domcontentloaded" });
		await page
			.locator(`[data-frame-label="${opts.frame}"]`)
			.first()
			.waitFor({ timeout: 30000 })
			.catch(() => undefined);
		const labelsAt = Date.now();
		await sleep(1500);
		await hud(page, `spool ${name} · ${opts.frame} · M1 Pro`);
		note(`canvas open to labels: ${labelsAt - navStart} ms`);

		// --- pan and zoom over the page, for the eye ------------------------
		const motion = async (label: string, drive: () => Promise<void>) => {
			await page.evaluate(() => {
				const w = window as unknown as { __iv: number[]; __on: boolean };
				w.__iv = [];
				w.__on = true;
				let last = performance.now();
				const tick = (t: number) => {
					w.__iv.push(t - last);
					last = t;
					if (w.__on) requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
			});
			await drive();
			const iv = (await page.evaluate(() => {
				const w = window as unknown as { __iv: number[]; __on: boolean };
				w.__on = false;
				return w.__iv.slice(2);
			})) as number[];
			const sorted = [...iv].sort((a, b) => a - b);
			const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? Number.NaN;
			const slow = iv.filter((v) => v > 12).length;
			record(`${label} frame interval p95`, p95);
			tally(`${label} intervals over 12 ms`, slow);
			note(
				`${label}: ${iv.length} frames, p95 ${p95.toFixed(1)} ms, ${slow} over 12 ms, worst ${(sorted.at(-1) ?? 0).toFixed(1)} ms`,
			);
			await hud(page, `${label.padEnd(5)} p95 ${p95.toFixed(1)} ms · ${slow}/${iv.length} frames over 12 ms`);
		};
		await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
		await hud(page, "1. pan and zoom (120 Hz screen: 8.3 ms per frame)");
		await motion("pan", async () => {
			for (let i = 0; i < 70; i++) {
				await page.mouse.wheel(i < 35 ? 26 : -26, 0);
				await sleep(16);
			}
		});
		await motion("zoom", async () => {
			await page.keyboard.down("Control");
			for (let i = 0; i < 50; i++) {
				await page.mouse.wheel(0, i < 25 ? 4 : -4);
				await sleep(16);
			}
			await page.keyboard.up("Control");
		});
		await sleep(800 + opts.pause);

		// --- Edit tool, first click on a frame -----------------------------
		await page.keyboard.press("e");
		await sleep(400);
		const mountedBefore = (await page.$(`iframe[title="${opts.frame}"]`)) !== null;
		note(`frame live before first click: ${mountedBefore}`);
		let frame: Frame;
		if (!mountedBefore) {
			const fb = { x: VIEW.width / 2, y: 70 + 120 * k };
			await armRing(page);
			const t0 = Date.now();
			await page.mouse.click(fb.x, fb.y);
			frame = await liveFrame(page, opts.frame);
			record("first click on a picture frame → live document", Date.now() - t0);
		} else {
			frame = await liveFrame(page, opts.frame);
		}
		await sleep(600);
		const list = await candidates(page, frame, opts.frame);
		note(`${list.length} elements with words of their own on screen`);
		if (list.length === 0) throw new Error("no candidates");

		// --- select ----------------------------------------------------------
		await hud(page, "2. Edit tool: click elements");
		for (const c of list.slice(0, 8)) {
			await armRing(page);
			await page.mouse.click(c.x, c.y);
			const t0 = Date.now();
			const read = page
				.waitForResponse((r) => r.url().endsWith("/rungs"), { timeout: 8000 })
				.then(() => Date.now() - t0)
				.catch(() => undefined);
			const ms = await ringLatency(page);
			const readMs = await read;
			if (readMs !== undefined) record("click → file read, edits allowed (POST /rungs)", readMs);
			if (ms !== undefined) {
				record("click → selection ring", ms);
				await hud(
					page,
					`click → ring ${ms.toFixed(0).padStart(3)} ms · file read ${readMs ?? "?"} ms  <${c.tag}> ${c.text.slice(0, 18)}`,
				);
			}
			await sleep(opts.pause || 120);
		}

		// --- words -----------------------------------------------------------
		await hud(page, "3. double-click words, type, Enter");
		let edits = 0;
		for (const c of list) {
			if (edits >= 3) break;
			frame = await liveFrame(page, opts.frame);
			const read = page.waitForResponse((r) => r.url().endsWith("/rungs"), { timeout: 8000 }).catch(() => undefined);
			await page.mouse.click(c.x, c.y);
			await read;
			await sleep(150);
			await frame.evaluate(
				({ index }) => {
					const now = () => performance.timeOrigin + performance.now();
					const w = window as unknown as Record<string, unknown> & { __qa: Element[] };
					const el = w.__qa[index];
					w.__openAt = undefined;
					w.__keys = [];
					w.__marker = "still-here";
					if (!el) return;
					new MutationObserver(() => {
						if (el.getAttribute("contenteditable") !== null && w.__openAt === undefined) w.__openAt = now();
					}).observe(el, { attributes: true });
					// the Edit tool holds the frame's own animation frames, so the
					// paint is read from Event Timing: a key's duration runs to the
					// next paint after it, and only keys of 16 ms or more are listed
					if (w.__observing !== true) {
						w.__observing = true;
						new PerformanceObserver((list) => {
							for (const entry of list.getEntries()) {
								if (entry.name === "keydown") (w.__keys as number[]).push(entry.duration);
								if (entry.name === "keydown" || entry.name === "keyup")
									w.__keyCount = ((w.__keyCount as number) ?? 0) + 0.5;
							}
						}).observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);
					}
					w.__keyCount = 0;
				},
				{ index: c.index },
			);
			await page.evaluate(() => {
				const now = () => performance.timeOrigin + performance.now();
				const w = window as unknown as Record<string, unknown>;
				addEventListener(
					"pointerup",
					() => {
						w.__upAt = now();
					},
					{ capture: true },
				);
			});
			await page.mouse.click(c.x, c.y);
			await sleep(400);
			const opened = await frame
				.evaluate(() => (window as unknown as Record<string, number | undefined>).__openAt)
				.catch(() => undefined);
			const refused = await refusalShown(page);
			if (opened === undefined || refused) {
				note(`words of <${c.tag}> "${c.text.slice(0, 30)}": ${refused ? `refused (${refused})` : "never opened"}`);
				await page.keyboard.press("Escape");
				await page.keyboard.press("Escape");
				await sleep(200);
				continue;
			}
			const up = (await page.evaluate(() => (window as unknown as Record<string, number>).__upAt)) as number;
			record("second click → caret in the words", opened - up);
			await page.keyboard.press("End");
			for (const ch of " QA") {
				await page.keyboard.type(ch);
				await sleep(opts.pause ? 140 : 60);
			}
			await sleep(300);
			const typed = (await frame.evaluate(() => {
				const w = window as unknown as { __keys: number[]; __keyCount: number };
				return { slow: w.__keys, count: w.__keyCount };
			})) as { slow: number[]; count: number };
			const keys = typed.slow;
			note(
				`4 keys typed, of them 16 ms or slower to the next paint: ${keys.length}${keys.length ? ` (${keys.map((k) => k.toFixed(0)).join(", ")} ms)` : ""}`,
			);
			for (const k of keys) record("keystroke → next paint (only those ≥16 ms are reported)", k);
			tally("keystrokes ≥16 ms to paint", keys.length);
			const before = sourceTimes(root);
			api.length = 0;
			const t0 = Date.now();
			await page.keyboard.press("Enter");
			const wrote = await nextWrite(root, before);
			if (wrote === undefined) {
				const r = await refusalShown(page);
				note(
					`words of <${c.tag}> "${c.text.slice(0, 30)}": Enter saved nothing within 8 s${r ? `, refused (${r})` : ""}`,
				);
				await page.keyboard.press("Escape");
				continue;
			}
			record("Enter → file saved", wrote.at - t0);
			await sleep(1500);
			const survived = await frame
				.evaluate(() => (window as unknown as Record<string, string>).__marker === "still-here")
				.catch(() => false);
			note(
				`words of <${c.tag}> "${c.text.slice(0, 30)}" → ${wrote.path.replace(root, "")}; document ${survived ? "kept (no reload)" : "replaced (reloaded)"}; api: ${api.map((a) => `${a.path} ${a.ms.toFixed(0)}ms`).join(", ")}`,
			);
			await hud(
				page,
				`edit words: caret ${(opened - up).toFixed(0)} ms · keys ${keys.length === 0 ? "<16" : Math.max(...keys).toFixed(0)} ms · saved ${wrote.at - t0} ms`,
			);
			edits++;
			await sleep(opts.pause);
		}

		// --- delete and undo ------------------------------------------------
		await hud(page, "4. Delete, then cmd-Z");
		let deletes = 0;
		let deleteTries = 0;
		frame = await liveFrame(page, opts.frame);
		const fresh = await candidates(page, frame, opts.frame);
		for (const c of fresh.slice().reverse()) {
			if (deletes >= 3) break;
			frame = await liveFrame(page, opts.frame);
			await page.keyboard.press("Escape");
			await armRing(page);
			const read = page.waitForResponse((r) => r.url().endsWith("/rungs"), { timeout: 8000 }).catch(() => undefined);
			await page.mouse.click(c.x, c.y);
			if ((await ringLatency(page)) === undefined) continue;
			await read;
			await sleep(opts.pause || 100);
			// the element the hand holds is the one the delete takes, and it may
			// be an ancestor of the candidate clicked or another element under
			// the point; the first element taken out of this document is it
			await frame.evaluate(() => {
				const now = () => performance.timeOrigin + performance.now();
				const w = window as unknown as Record<string, unknown>;
				w.__goneAt = undefined;
				w.__gone = undefined;
				w.__marker = "still-here";
				new MutationObserver((records, observer) => {
					const taken = records.flatMap((r) => [...r.removedNodes]).find((n) => n.nodeType === 1);
					if (taken === undefined) return;
					w.__goneAt = now();
					w.__gone = taken;
					observer.disconnect();
				}).observe(document, { childList: true, subtree: true });
			});
			const before = sourceTimes(root);
			const beforeBytes = new Map([...before.keys()].map((p) => [p, readFileSync(p, "utf8")]));
			api.length = 0;
			const t0 = Date.now();
			await page.keyboard.press("Backspace");
			let refusedAs: string | undefined;
			const watching = (async () => {
				for (let i = 0; i < 120 && refusedAs === undefined; i++) {
					refusedAs = await refusalShown(page);
					await sleep(25);
				}
			})();
			// what the screen does: the element leaves the document it is in, or
			// the frame's document is replaced by one without it
			let screen: { ms: number; how: string } | undefined;
			const looking = (async () => {
				const deadline = Date.now() + 6000;
				while (screen === undefined && refusedAs === undefined && Date.now() < deadline) {
					const handle = await page.$(`iframe[title="${opts.frame}"]`);
					const f = handle ? await handle.contentFrame() : null;
					const state = f
						? await f
								.evaluate(() => {
									const w = window as unknown as Record<string, unknown>;
									return {
										same: w.__marker === "still-here",
										gone: w.__goneAt as number | undefined,
										ready: (document.querySelector("#root")?.children.length ?? 0) > 0,
									};
								})
								.catch(() => undefined)
						: undefined;
					if (state?.same && state.gone !== undefined) screen = { ms: state.gone - t0, how: "removed in place" };
					else if (state && !state.same && state.ready) screen = { ms: Date.now() - t0, how: "document reloaded" };
					else await sleep(8);
				}
			})();
			const wrote = await nextWrite(root, before, 3000);
			await watching;
			await looking;
			if (wrote === undefined) {
				note(
					`delete <${c.tag}> "${c.text.slice(0, 30)}": ${refusedAs ? `refused (${refusedAs})` : "nothing saved, no refusal shown"}`,
				);
				await page.keyboard.press("Escape");
				if (++deleteTries >= 14) break;
				continue;
			}
			record("Delete → file saved", wrote.at - t0);
			await sleep(1200);
			if (screen !== undefined) record(`Delete → screen updated (${screen.how})`, screen.ms);
			// taken out in place and then reloaded anyway is a whole document
			// swapped in a moment after the press
			const kept = await stillHere(page, opts.frame);
			tally("Delete → document replaced after (1 = yes)", kept ? 0 : 1);
			note(
				`delete <${c.tag}> "${c.text.slice(0, 30)}" → ${wrote.path.replace(root, "")}; screen ${screen ? `${screen.ms.toFixed(0)} ms, ${screen.how}` : "not seen"}; document ${kept ? "kept" : "replaced"}; api: ${api.map((a) => `${a.path} ${a.ms.toFixed(0)}ms`).join(", ")}`,
			);
			await hud(
				page,
				`delete: on screen ${screen ? screen.ms.toFixed(0) : "?"} ms (${screen?.how ?? "?"}) · saved ${wrote.at - t0} ms`,
			);
			deletes++;
			await sleep(opts.pause);
			// undo
			const changed = wrote.path;
			const original = beforeBytes.get(changed);
			// the document on screen now is the one the undo is measured in: a
			// delete that reloaded already replaced the one marked above
			frame = await liveFrame(page, opts.frame);
			await frame.evaluate(() => Reflect.set(window, "__marker", "still-here"));
			const u0 = Date.now();
			await page.keyboard.press("ControlOrMeta+z");
			let restored: number | undefined;
			for (let i = 0; i < 1200 && restored === undefined; i++) {
				if (readFileSync(changed, "utf8") === original) restored = Date.now() - u0;
				else await sleep(5);
			}
			if (restored !== undefined) {
				record("Undo → file restored", restored);
				// the element the delete took back in this very document, or a new
				// document drawn from the file
				let back: { ms: number; how: string } | undefined;
				for (let i = 0; i < 400 && back === undefined; i++) {
					const f = await liveFrame(page, opts.frame).catch(() => undefined);
					const state = f
						? await f
								.evaluate(() => {
									const w = window as unknown as Record<string, unknown>;
									const gone = w.__gone as Element | undefined;
									return { same: w.__marker === "still-here", back: gone?.isConnected === true };
								})
								.catch(() => undefined)
						: undefined;
					if (state?.same && state.back) back = { ms: Date.now() - u0, how: "put back in place" };
					else if (state && !state.same) back = { ms: Date.now() - u0, how: "document reloaded" };
					else await sleep(8);
				}
				await sleep(1200);
				const keptUndo = await stillHere(page, opts.frame);
				tally("Undo → document replaced after (1 = yes)", keptUndo ? 0 : 1);
				note(
					`undo restored the file in ${restored} ms, on screen ${back ? `${back.ms} ms, ${back.how}` : "not seen within 4 s"} after ⌘Z; document ${keptUndo ? "kept" : "replaced"}`,
				);
				if (back !== undefined) record(`Undo → back on screen (${back.how})`, back.ms);
				await hud(page, `undo: file ${restored} ms · on screen ${back ? back.ms : "?"} ms`);
			} else note("undo did not restore the file within 6 s");
			await sleep(opts.pause || 300);
			frame = await liveFrame(page, opts.frame);
			await candidates(page, frame, opts.frame);
		}

		// --- summary ---------------------------------------------------------
		const summary: string[] = [];
		for (const [key, values] of Object.entries(results)) {
			const sorted = [...values].sort((a, b) => a - b);
			const med = sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
			summary.push(
				`${key}: median ${med.toFixed(0)} ms, worst ${(sorted.at(-1) ?? Number.NaN).toFixed(0)} ms (n=${values.length})`,
			);
		}
		await hud(page, "done: medians in the report");
		await sleep(opts.hud ? 5000 : 0);
		if (opts.record) {
			const video = page.video();
			await context.close();
			await video?.saveAs(opts.record);
		}
		process.stdout.write(`${summary.join("\n")}\n\n${notes.join("\n")}\n`);
		if (opts.out) writeFileSync(opts.out, JSON.stringify({ results, notes }, null, 2));
	} finally {
		await browser.close();
		daemon.stop();
	}
}

await main();
