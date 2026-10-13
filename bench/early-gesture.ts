import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Frame, type Page } from "playwright-core";
import { copyProject, freePort, prepareCurrentCovers, readPages, startDaemon, writeCamera } from "./harness.ts";

/**
 * The selection's read and the gestures that wait on it (DEV-299): how long a
 * click takes to POST /rungs answered, idle and straight after a save, and
 * what a ⌫ pressed straight after a click does — saves, or refuses `unread`.
 *
 *   node bench/early-gesture.ts --project <path> --frame app/spool-player [--out run.json]
 */

const VIEW = { width: 1440, height: 810 };
const K = 0.85;
const args = process.argv.slice(2);
const arg = (name: string, fallback?: string) => {
	const at = args.indexOf(name);
	return at === -1 ? fallback : args[at + 1];
};
const project = arg("--project");
const frameName = arg("--frame", "app/spool-player") as string;
const out = arg("--out");
if (project === undefined) throw new Error("--project is required");

const results: Record<string, number[]> = {};
const notes: string[] = [];
const record = (key: string, value: number) => {
	const list = results[key] ?? [];
	list.push(value);
	results[key] = list;
	process.stderr.write(`early: ${key} ${value.toFixed(0)} ms\n`);
};
const note = (line: string) => {
	notes.push(line);
	process.stderr.write(`early: ${line}\n`);
};
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function sourceTimes(root: string): Map<string, number> {
	const found = new Map<string, number>();
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name === ".spool" || entry.name === "node_modules") continue;
			const path = join(dir, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) found.set(path, statSync(path).mtimeMs);
		}
	};
	walk(join(root, "design"));
	return found;
}

async function nextWrite(root: string, before: Map<string, number>, timeout: number) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		for (const [path, mtime] of sourceTimes(root)) if (before.get(path) !== mtime) return { at: Date.now(), path };
		await sleep(5);
	}
	return undefined;
}

async function liveFrame(page: Page): Promise<Frame> {
	const deadline = Date.now() + 15000;
	while (Date.now() < deadline) {
		const frame = await (await page.$(`iframe[title="${frameName}"]`))?.contentFrame();
		if (
			frame &&
			(await frame.evaluate(() => (document.querySelector("#root")?.children.length ?? 0) > 0).catch(() => false))
		)
			return frame;
		await sleep(30);
	}
	throw new Error(`${frameName} never mounted a live document`);
}

/** Elements with words of their own, on screen, as page points; marked in the frame by index. */
async function candidates(page: Page, frame: Frame) {
	const box = await (await page.$(`iframe[title="${frameName}"]`))?.boundingBox();
	if (!box) throw new Error("no iframe box");
	const inner = await frame.evaluate(() => {
		const w = window as unknown as { __qa?: Element[] };
		const found: Element[] = [];
		const list: { index: number; text: string; x: number; y: number; w: number; h: number }[] = [];
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
			list.push({ index: found.length - 1, text: own, x: r.x, y: r.y, w: r.width, h: r.height });
		}
		w.__qa = found;
		return { list, width: document.documentElement.clientWidth };
	});
	const scale = box.width / inner.width;
	return inner.list
		.map((c) => ({
			index: c.index,
			text: c.text,
			x: box.x + (c.x + Math.min(c.w / 2, 30)) * scale,
			y: box.y + (c.y + c.h / 2) * scale,
		}))
		.filter((c) => c.x > 40 && c.y > 70 && c.x < VIEW.width - 300 && c.y < VIEW.height - 40);
}

const refusal = async (page: Page) => {
	const shown = page.locator("[data-hand-refusal]");
	return (await shown.count()) === 0
		? undefined
		: ((await shown.first().getAttribute("data-hand-refusal")) ?? "refused");
};

/** Click and time POST /rungs from the click to its answer. */
async function clickRead(page: Page, at: { x: number; y: number }): Promise<number | undefined> {
	const read = page.waitForResponse((r) => r.url().endsWith("/rungs"), { timeout: 8000 }).catch(() => undefined);
	const t0 = Date.now();
	await page.mouse.click(at.x, at.y);
	return (await read) === undefined ? undefined : Date.now() - t0;
}

async function main(): Promise<void> {
	const { root, name, spoolDir } = copyProject(project as string);
	const pageName = frameName.split("/").slice(0, -1).join("/");
	const onPage = readPages(root).find((p) => p.page === pageName);
	const target = onPage?.frames.find((f) => f.name === frameName);
	if (!onPage || !target) throw new Error(`${frameName} is not on page ${pageName}`);
	const daemon = await startDaemon(spoolDir, root, await freePort());
	const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
	const browser = await chromium.launch({ channel: "chromium", headless: false, args: ["--window-position=0,0"] });
	try {
		writeCamera(root, { x: 0, y: 0, k: 0.16 }, pageName);
		await prepareCurrentCovers(browser, daemon, url, root, onPage.frames);
		writeCamera(root, { x: VIEW.width / 2 - (target.x + target.w / 2) * K, y: 70 - target.y * K, k: K }, pageName);
		const page = await (await browser.newContext({ viewport: VIEW })).newPage();
		await page.goto(url, { waitUntil: "domcontentloaded" });
		await page.locator(`[data-frame-label="${frameName}"]`).first().waitFor({ timeout: 30000 });
		await sleep(1500);
		await page.keyboard.press("e");
		await sleep(400);
		await page.mouse.click(VIEW.width / 2, 70 + 120 * K);
		let frame = await liveFrame(page);
		await sleep(800);
		const list = await candidates(page, frame);
		note(`${list.length} candidates`);
		if (list.length < 6) throw new Error("too few candidates");

		// idle: one click after another, each read let land
		for (const c of list.slice(0, 8)) {
			const ms = await clickRead(page, c);
			if (ms !== undefined) record("click → POST /rungs answered, idle", ms);
			await sleep(300);
		}

		// straight after a save: type into one element, Enter, then click the next
		for (let round = 0; round < 4; round++) {
			const c = list[round % list.length];
			const next = list[(round + 3) % list.length];
			if (c === undefined || next === undefined) break;
			await page.keyboard.press("Escape");
			await clickRead(page, c);
			await sleep(200);
			await page.mouse.click(c.x, c.y);
			await sleep(300);
			await page.keyboard.press("End");
			await page.keyboard.type(" Q");
			const before = sourceTimes(root);
			await page.keyboard.press("Enter");
			const wrote = await nextWrite(root, before, 8000);
			if (wrote === undefined) {
				note(`round ${round}: Enter saved nothing (${(await refusal(page)) ?? "no refusal"})`);
				continue;
			}
			const ms = await clickRead(page, next);
			if (ms !== undefined) record("click → POST /rungs answered, straight after a save", ms);
			await sleep(1500);
		}

		// ⌫ straight after a click, with no wait for the read
		let saved = 0;
		let refused = 0;
		frame = await liveFrame(page);
		const fresh = await candidates(page, frame);
		for (const c of fresh.slice().reverse().slice(0, 4)) {
			await page.keyboard.press("Escape");
			await sleep(300);
			const before = sourceTimes(root);
			const t0 = Date.now();
			await page.mouse.click(c.x, c.y);
			await page.keyboard.press("Backspace");
			const wrote = await nextWrite(root, before, 6000);
			const said = await refusal(page);
			if (wrote !== undefined) {
				saved++;
				record("click then ⌫ at once → file saved", wrote.at - t0);
				await sleep(600);
				await page.keyboard.press("ControlOrMeta+z");
				await sleep(1500);
			} else {
				if (said === "unread") refused++;
				note(
					`⌫ straight after a click on "${c.text.slice(0, 24)}": ${said ? `refused (${said})` : "nothing saved"}`,
				);
			}
		}
		note(`⌫ straight after a click: ${saved} saved, ${refused} refused unread`);

		const summary = Object.entries(results).map(([key, values]) => {
			const sorted = [...values].sort((a, b) => a - b);
			return `${key}: median ${sorted[Math.floor(sorted.length / 2)]?.toFixed(0)} ms, range ${sorted[0]?.toFixed(0)}–${sorted.at(-1)?.toFixed(0)} ms (n=${values.length})`;
		});
		process.stdout.write(`${summary.join("\n")}\n\n${notes.join("\n")}\n`);
		if (out) writeFileSync(out, JSON.stringify({ results, notes }, null, 2));
	} finally {
		await browser.close();
		daemon.stop();
	}
}

await main();
