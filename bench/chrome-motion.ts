import { writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";
import {
	type Box,
	copyProject,
	freePort,
	prepareCurrentCovers,
	readPages,
	startDaemon,
	writeCamera,
} from "./harness.ts";

/**
 * The canvas chrome while the camera moves (DEV-301): how far the selected
 * frame's label, its play button and its ring stand from the frame they
 * belong to, sampled every drawn frame of a zoom and a pan, and then a
 * walkthrough for the eye: hover across frames, select them in turn, enter
 * and leave one live, and click elements in turn with the Edit tool.
 *
 *   node bench/chrome-motion.ts --project <path> [--frame app/spool-home--picker] [--k 0.18] [--record run.webm] [--hud]
 *
 * Off by more than a pixel is jitter you can see: the play button sits at
 * the label's far end, so a label width trailing its zoom moves it while the
 * frame's edge stays put.
 */

const VIEW = { width: 1440, height: 810 };
/** Where on screen the canvas between the side panels is, roughly. */
const SPOT = { x: 700, y: 300 };
const CLEAR = { left: 270, right: VIEW.width - 330, top: 80, bottom: VIEW.height - 160 };
const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
	const i = argv.indexOf(name);
	return i === -1 ? undefined : argv[i + 1];
};
const opts = {
	project: arg("--project") ?? "",
	frame: arg("--frame") ?? "app/spool-home--picker",
	k: Number(arg("--k") ?? 0.18),
	record: arg("--record"),
	hud: argv.includes("--hud"),
	out: arg("--out"),
};
if (opts.project === "") throw new Error("--project is required");
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const lines: string[] = [];
const say = (line: string) => {
	lines.push(line);
	process.stderr.write(`chrome: ${line}\n`);
};

async function hud(page: Page, line: string): Promise<void> {
	if (!opts.hud) return;
	await page.evaluate((text) => {
		let box = document.getElementById("qa-hud");
		if (box === null) {
			box = document.createElement("div");
			box.id = "qa-hud";
			box.style.cssText =
				"position:fixed;left:16px;bottom:16px;z-index:2147483647;pointer-events:none;font:600 15px/1.45 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.82);padding:12px 16px;border-radius:10px;max-width:760px;white-space:pre";
			document.body.appendChild(box);
		}
		const kept = (box.textContent ?? "").split("\n").filter(Boolean);
		kept.push(text);
		box.textContent = kept.slice(-8).join("\n");
	}, line);
}

/** Where a world box is on screen, by the camera the field is drawn with. */
async function onScreen(page: Page, box: Box): Promise<Box> {
	return page.evaluate((b) => {
		const field = document.querySelector<HTMLElement>("[data-canvas-camera]");
		const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(field?.style.transform ?? "");
		if (m === null) throw new Error("no camera on the field");
		const [x, y, k] = [Number(m[1]), Number(m[2]), Number(m[3])];
		const origin = (field?.offsetParent ?? document.body).getBoundingClientRect();
		return { x: origin.x + x + b.x * k, y: origin.y + y + b.y * k, w: b.w * k, h: b.h * k };
	}, box);
}

/** Start sampling, every animation frame, the selected frame's chrome against the frame itself. */
async function arm(page: Page, name: string, box: Box): Promise<void> {
	await page.evaluate(
		({ name, b }) => {
			const w = window as unknown as { __chrome: number[][]; __chromeOn: boolean };
			w.__chrome = [];
			w.__chromeOn = true;
			const leaf = name.split("/").at(-1) ?? name;
			const tick = () => {
				const field = document.querySelector<HTMLElement>("[data-canvas-camera]");
				const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(field?.style.transform ?? "");
				const origin = (field?.offsetParent ?? document.body).getBoundingClientRect();
				const play = document.querySelector(`button[aria-label="Play ${leaf}"]`)?.getBoundingClientRect();
				const label = document.querySelector(`[data-frame-label="${name}"]`)?.getBoundingClientRect();
				const ring = document.querySelector(`[data-frame-ring="${name}"]`)?.getBoundingClientRect();
				if (m !== null && play !== undefined && label !== undefined) {
					const k = Number(m[3]);
					const fx = origin.x + Number(m[1]) + b.x * k;
					const right = fx + b.w * k;
					w.__chrome.push([
						play.right - right,
						label.left - fx,
						ring === undefined ? Number.NaN : ring.right - right - 3,
					]);
				}
				if (w.__chromeOn) requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		},
		{ name, b: box },
	);
}

async function collect(page: Page, what: string): Promise<string> {
	const rows = (await page.evaluate(() => {
		const w = window as unknown as { __chrome: number[][]; __chromeOn: boolean };
		w.__chromeOn = false;
		return w.__chrome;
	})) as number[][];
	const stat = (i: number) => {
		const off = rows.map((row) => Math.abs(row[i] ?? Number.NaN)).filter(Number.isFinite);
		if (off.length === 0) return "—";
		const worst = Math.max(...off);
		const over = off.filter((v) => v > 1).length;
		return `worst ${worst.toFixed(1)} px, ${over}/${off.length} frames off by > 1 px`;
	};
	const line = `${what}: play button ${stat(0)} · label ${stat(1)} · ring ${stat(2)}`;
	say(line);
	return line;
}

async function main(): Promise<void> {
	const { root, name, spoolDir } = copyProject(opts.project);
	const pageName = opts.frame.split("/").slice(0, -1).join("/");
	const onPage = readPages(root).find((p) => p.page === pageName);
	const target = onPage?.frames.find((f) => f.name === opts.frame);
	if (onPage === undefined || target === undefined) throw new Error(`${opts.frame} is not on page ${pageName}`);
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
		const cx = target.x + target.w / 2;
		const cy = target.y + target.h / 2;
		// the middle of what the side panels leave of the window
		writeCamera(root, { x: SPOT.x - cx * k, y: SPOT.y - cy * k, k }, pageName);
		const context = await browser.newContext({
			viewport: VIEW,
			deviceScaleFactor: 2,
			...(opts.record ? { recordVideo: { dir: "/tmp/dev301-video", size: VIEW } } : {}),
		});
		const page = await context.newPage();
		await page.goto(url, { waitUntil: "domcontentloaded" });
		await page.locator(`[data-frame-label="${opts.frame}"]`).first().waitFor({ timeout: 30000 });
		await sleep(1500);
		await hud(page, `spool ${name} · ${opts.frame} · M1 Pro`);

		// select the frame where its body is, with the Select tool
		await page.keyboard.press("v");
		const here = await onScreen(page, target);
		await page.mouse.click(here.x + here.w / 2, here.y + Math.min(here.h / 2, 120));
		await page.locator(`button[aria-label="Play ${opts.frame.split("/").at(-1)}"]`).waitFor({ timeout: 5000 });
		await sleep(600);

		await hud(page, "1. zoom with a frame selected (watch the play button)");
		// zoomed about a point near the label, so the label stays in sight
		await page.mouse.move(here.x + here.w * 0.4, here.y + here.h * 0.12);
		await arm(page, opts.frame, target);
		await page.keyboard.down("Control");
		for (let round = 0; round < 2; round++) {
			for (let i = 0; i < 50; i++) {
				await page.mouse.wheel(0, i < 25 ? -4 : 4);
				await sleep(16);
			}
		}
		await page.keyboard.up("Control");
		await sleep(300);
		await hud(page, await collect(page, "zoom"));

		await hud(page, "2. pan with a frame selected");
		await arm(page, opts.frame, target);
		for (let i = 0; i < 60; i++) {
			await page.mouse.wheel(i < 30 ? 14 : -14, i < 30 ? 6 : -6);
			await sleep(16);
		}
		await sleep(300);
		await hud(page, await collect(page, "pan"));
		await sleep(600);

		// the target's neighbours on screen, nearest first
		const neighbours: { name: string; at: Box }[] = [];
		for (const frame of [...onPage.frames]
			.filter((one) => one.name !== target.name)
			.sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))) {
			const at = await onScreen(page, frame);
			const mid = { x: at.x + at.w / 2, y: at.y + Math.min(at.h / 2, 80) };
			if (mid.x > CLEAR.left && mid.x < CLEAR.right && mid.y > CLEAR.top && mid.y < CLEAR.bottom)
				neighbours.push({ name: frame.name, at });
			if (neighbours.length === 5) break;
		}

		await hud(page, "3. hover across frames");
		for (const { at } of neighbours) {
			await page.mouse.move(at.x + at.w / 2, at.y + Math.min(at.h / 2, 80), { steps: 14 });
			await sleep(350);
		}
		await hud(page, "4. select frames in turn");
		for (const { name: frame, at } of [...neighbours, { name: target.name, at: here }]) {
			await page.mouse.click(at.x + at.w / 2, at.y + Math.min(at.h / 2, 80));
			await hud(page, `   ${frame}`);
			await sleep(700);
		}
		await page.keyboard.press("Escape");
		await sleep(500);

		await hud(page, "5. enter one live, then leave");
		// entering flies the camera to it, so it is the one the Edit tool works on after
		const first = neighbours[0];
		const edited = onPage.frames.find((frame) => frame.name === first?.name) ?? target;
		if (first !== undefined) {
			await page.mouse.dblclick(first.at.x + first.at.w / 2, first.at.y + Math.min(first.at.h / 2, 80));
			await sleep(1500);
			await page.keyboard.press("Escape");
			await sleep(1200);
		}

		await hud(page, "6. Edit tool: click elements in turn");
		// closer, so elements are big enough to aim at
		const far = await onScreen(page, edited);
		await page.mouse.move(far.x + far.w * 0.3, far.y + far.h * 0.2);
		await page.keyboard.down("Control");
		for (let i = 0; i < 25; i++) {
			await page.mouse.wheel(0, -4);
			await sleep(16);
		}
		await page.keyboard.up("Control");
		await sleep(400);
		await page.keyboard.press("e");
		await sleep(400);
		const live = await onScreen(page, edited);
		await page.mouse.click(live.x + live.w / 2, Math.max(live.y + 40, CLEAR.top));
		await sleep(1200);
		const handle = await page.$(`iframe[title="${edited.name}"]`);
		const doc = handle === null ? null : await handle.contentFrame();
		const box = handle === null ? null : await handle.boundingBox();
		if (doc !== null && box !== null) {
			const inner = await doc.evaluate(() => {
				const out: { x: number; y: number; w: number; h: number }[] = [];
				for (const el of Array.from(document.querySelectorAll("#root *"))) {
					const own = Array.from(el.childNodes)
						.filter((n) => n.nodeType === 3)
						.map((n) => (n.textContent ?? "").trim())
						.join("");
					if (own.length < 3) continue;
					const r = el.getBoundingClientRect();
					if (r.width < 24 || r.height < 10) continue;
					out.push({ x: r.x, y: r.y, w: r.width, h: r.height });
				}
				return { out, width: document.documentElement.clientWidth };
			});
			const scale = box.width / inner.width;
			const spots = inner.out
				.map((r) => ({ x: box.x + (r.x + Math.min(r.w / 2, 30)) * scale, y: box.y + (r.y + r.h / 2) * scale }))
				.filter((p) => p.x > CLEAR.left && p.y > CLEAR.top && p.x < CLEAR.right && p.y < CLEAR.bottom)
				.slice(0, 8);
			for (const spot of spots) {
				await page.mouse.move(spot.x, spot.y, { steps: 8 });
				await sleep(250);
				await page.mouse.click(spot.x, spot.y);
				await sleep(650);
			}
			await page.keyboard.press("Escape");
		}
		await hud(page, "done");
		await sleep(2000);
		if (opts.record) {
			const video = page.video();
			await context.close();
			await video?.saveAs(opts.record);
		}
		process.stdout.write(`${lines.join("\n")}\n`);
		if (opts.out) writeFileSync(opts.out, `${lines.join("\n")}\n`);
	} finally {
		await browser.close();
		daemon.stop();
	}
}

await main();
