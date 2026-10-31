// spool#219 fidelity harness: renders real design/ frames in Chromium (live), Servo (live, same TSX, via
// WebDriver) and Blitz (no JS: a DOM snapshot taken from Chromium after React rendered), then diffs each
// against Chromium. Throwaway spike; see README.md.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const ORIGIN = process.env.RUN_ORIGIN ?? "http://run.spool.localhost:7891";
const PROJECT = process.env.PROJECT ?? "proj";
const DESIGN = process.env.DESIGN ?? "/tmp/s219/proj/design";
const OUT = process.env.OUT ?? "/tmp/s219/out";
const SERVO_WD = process.env.SERVO_WD ?? "http://127.0.0.1:7893";
const BLITZ = process.env.BLITZ ?? "/tmp/s219/blitz/target/release/examples/s219_shot";
const BLITZ_JS = process.env.BLITZ_JS ?? "/tmp/s219/blitz/target/release/examples/s219_js_shot";
const WAIT = Number(process.env.WAIT ?? 4000);
const ENGINES = (process.env.ENGINES ?? "chromium,servo,blitz-js,blitz").split(",");

// every engine renders with CSS animations and transitions at their end state, so a still compares stills
export const STILL_CSS =
	"*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}";

const frames = process.argv.slice(2);
const url = (frame) => `${ORIGIN}/p/${PROJECT}/frames/${encodeURIComponent(frame)}`;
const size = (frame) => {
	const j = JSON.parse(readFileSync(join(DESIGN, "frames", frame, "frame.json"), "utf8"));
	return { w: j.w, h: Math.min(j.h, 1400) };
};

async function wd(method, path, body) {
	const r = await fetch(SERVO_WD + path, {
		method,
		headers: { "content-type": "application/json" },
		body: body ? JSON.stringify(body) : undefined,
	});
	return (await r.json()).value;
}

// the page side of the snapshot: the rendered DOM with every sheet's live rules, no scripts
function serialize({ canvases, still, base }) {
	const live = [...document.querySelectorAll("style")];
	const clone = document.documentElement.cloneNode(true);
	const styles = [...clone.querySelectorAll("style")];
	styles.forEach((el, i) => {
		// source text when there is some: CSSOM serializes `font: var(--x)` as empty longhands
		const sheet = live[i]?.sheet;
		if (sheet && el.textContent.trim() === "") el.textContent = [...sheet.cssRules].map((r) => r.cssText).join("\n");
	});
	for (const sheet of document.adoptedStyleSheets ?? []) {
		const el = document.createElement("style");
		el.textContent = [...sheet.cssRules].map((r) => r.cssText).join("\n");
		clone.querySelector("head").append(el);
	}
	for (const s of clone.querySelectorAll("script")) s.remove();
	// form state lives in properties, not attributes
	const liveInputs = document.querySelectorAll("input,textarea,select");
	clone.querySelectorAll("input,textarea,select").forEach((el, i) => {
		const src = liveInputs[i];
		if (!src) return;
		if (el.tagName === "TEXTAREA") el.textContent = src.value;
		else if (el.tagName === "INPUT") {
			el.setAttribute("value", src.value);
			if (src.checked) el.setAttribute("checked", "");
		}
	});
	// canvases become pictures of what they drew
	const liveCanvases = document.querySelectorAll("canvas");
	clone.querySelectorAll("canvas").forEach((el, i) => {
		const data = canvases[i];
		const r = liveCanvases[i].getBoundingClientRect();
		const img = document.createElement("img");
		for (const a of el.attributes) if (a.name !== "width" && a.name !== "height") img.setAttribute(a.name, a.value);
		if (data) img.setAttribute("src", `data:image/png;base64,${data}`);
		img.style.width = `${r.width}px`;
		img.style.height = `${r.height}px`;
		el.replaceWith(img);
	});
	const b = document.createElement("base");
	b.href = base;
	clone.querySelector("head").prepend(b);
	const st = document.createElement("style");
	st.textContent = still;
	clone.querySelector("head").append(st);
	return `<!doctype html>\n${clone.outerHTML}`;
}

async function chromiumPass(browser, frame, dir) {
	const { w, h } = size(frame);
	const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
	await page.addInitScript((css) => {
		addEventListener("DOMContentLoaded", () => {
			const s = document.createElement("style");
			s.textContent = css;
			document.head.append(s);
		});
	}, STILL_CSS);
	const t0 = Date.now();
	await page.goto(url(frame), { waitUntil: "load" });
	const loadMs = Date.now() - t0;
	await page.waitForTimeout(WAIT);
	await page.screenshot({ path: join(dir, "chromium.png") });
	const canvases = [];
	for (const c of await page.locator("canvas").all()) {
		try {
			const box = await c.boundingBox();
			canvases.push(box && box.width > 0 && box.height > 0 ? (await c.screenshot({ timeout: 3000 })).toString("base64") : null);
		} catch {
			canvases.push(null);
		}
	}
	const html = await page.evaluate(serialize, { canvases, still: STILL_CSS, base: url(frame) });
	writeFileSync(join(dir, "snapshot.html"), html);
	// the snapshot itself, back in Chromium: proves the snapshot is the frame before blaming Blitz
	const snap = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
	await snap.route("**/*", (route) =>
		route.request().url() === `${ORIGIN}/__snapshot`
			? route.fulfill({ contentType: "text/html", body: html })
			: route.continue(),
	);
	await snap.goto(`${ORIGIN}/__snapshot`, { waitUntil: "load" });
	await snap.evaluate(() => document.fonts.ready);
	await snap.waitForTimeout(2500);
	await snap.screenshot({ path: join(dir, "chromium-snapshot.png") });
	await snap.close();
	await page.close();
	return { loadMs };
}

async function servoPass(frame, dir) {
	const { w, h } = size(frame);
	const sid = (await wd("POST", "/session", { capabilities: {} })).sessionId;
	try {
		await wd("POST", `/session/${sid}/window/rect`, { width: w, height: h });
		const t0 = Date.now();
		await wd("POST", `/session/${sid}/url`, { url: url(frame) });
		const loadMs = Date.now() - t0;
		await new Promise((r) => setTimeout(r, WAIT));
		const errors = await wd("POST", `/session/${sid}/execute/sync`, {
			script: "return window.__s219errors || []",
			args: [],
		});
		const shot = await wd("GET", `/session/${sid}/screenshot`);
		writeFileSync(join(dir, "servo.png"), Buffer.from(shot, "base64"));
		return { loadMs, errors };
	} finally {
		await wd("DELETE", `/session/${sid}`);
	}
}

function blitzPass(frame, dir) {
	const { w, h } = size(frame);
	const out = execFileSync(BLITZ, [join(dir, "snapshot.html"), url(frame), String(w), String(h), join(dir, "blitz.png"), "1"], {
		encoding: "utf8",
		timeout: 120_000,
	});
	return JSON.parse(out.trim().split("\n").at(-1));
}

// the same frame document, scripts and all, run by Blitz's Boa engine (blitz-vibey-script)
function blitzJsPass(frame, dir) {
	const { w, h } = size(frame);
	const out = execFileSync(BLITZ_JS, [url(frame), String(w), String(h), join(dir, "blitz-js.png"), String(WAIT)], {
		encoding: "utf8",
		timeout: 300_000,
		stdio: ["ignore", "pipe", "pipe"],
	});
	return JSON.parse(out.trim().split("\n").at(-1));
}

const browser = ENGINES.includes("chromium") ? await chromium.launch() : null;
const results = {};
for (const frame of frames) {
	const dir = join(OUT, frame.replaceAll("/", "__"));
	mkdirSync(dir, { recursive: true });
	const r = { frame, ...size(frame) };
	for (const engine of ENGINES) {
		try {
			if (engine === "chromium") r.chromium = await chromiumPass(browser, frame, dir);
			if (engine === "servo") r.servo = await servoPass(frame, dir);
			if (engine === "blitz") r.blitz = blitzPass(frame, dir);
			if (engine === "blitz-js") r["blitz-js"] = blitzJsPass(frame, dir);
		} catch (e) {
			r[engine] = { error: String(e.message ?? e).slice(0, 400) };
		}
	}
	results[frame] = r;
	writeFileSync(join(dir, "run.json"), JSON.stringify(r, null, 2));
	console.log(JSON.stringify(r));
}
await browser?.close();
