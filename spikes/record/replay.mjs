// Spike for spool#221: replay recorded pointer moves into a page frame by frame
// in the pinned headless-shell (virtual time + HeadlessExperimental.beginFrame),
// writing one PNG per frame. Throwaway.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [url = pathToFileURL(join(import.meta.dirname, "page.html")).href, movesFile, out = "/tmp/record-spike/frames"] =
	process.argv.slice(2);
const W = 1280, H = 720, FPS = 60, STEP = 1000 / FPS;
const shell = join(homedir(), ".cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell");

// Recorded moves: [{ t, type: "move" | "down" | "up", x, y }], t in ms from the start.
const moves = movesFile ? JSON.parse(readFileSync(movesFile, "utf8")) : synthetic();
const duration = moves.at(-1).t + 800;

function synthetic() {
	const m = [], path = (t0, t1, a, b) => {
		for (let t = t0; t <= t1; t += 8) {
			const p = (t - t0) / (t1 - t0), e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
			m.push({ t, type: "move", x: a[0] + (b[0] - a[0]) * e, y: a[1] + (b[1] - a[1]) * e });
		}
	};
	path(0, 900, [150, 600], [640, 360]);
	m.push({ t: 1500, type: "down", x: 640, y: 360 }, { t: 1620, type: "up", x: 640, y: 360 });
	m.push({ t: 2100, type: "down", x: 640, y: 360 }, { t: 2200, type: "up", x: 640, y: 360 });
	path(2600, 3400, [640, 360], [1100, 180]);
	return m;
}

const userDir = mkdtempSync(join(tmpdir(), "record-spike-"));
const proc = spawn(shell, [
	"--deterministic-mode", "--enable-begin-frame-control", "--run-all-compositor-stages-before-draw",
	"--disable-threaded-animation", "--disable-threaded-scrolling", "--disable-checker-imaging",
	"--allow-file-access-from-files", "--no-sandbox", `--user-data-dir=${userDir}`, "--remote-debugging-port=0", "about:blank",
]);
const wsUrl = await new Promise((resolve, reject) => {
	let buf = "";
	proc.stderr.on("data", (d) => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) resolve(m[0]); });
	proc.on("exit", (c) => reject(new Error(`shell exited ${c}\n${buf}`)));
});

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const pending = new Map(), listeners = [];
ws.addEventListener("message", (ev) => {
	const msg = JSON.parse(ev.data);
	if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); }
	else for (const l of listeners) l(msg);
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
	const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params, sessionId }));
});
const once = (method, sessionId) => new Promise((r) => { const l = (m) => { if (m.method === method && m.sessionId === sessionId) { listeners.splice(listeners.indexOf(l), 1); r(m.params); } }; listeners.push(l); });

const { targetId } = await send("Target.createTarget", { url: "about:blank", width: W, height: H, enableBeginFrameControl: true });
const { sessionId: s } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p) => send(m, p, s);
await S("Page.enable");
await S("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

// Load with virtual time paused until network is idle, pumping frames so layout runs.
console.log("attached"); const t0 = performance.now();
// BeginFrame clock in renderer TimeTicks (CLOCK_MONOTONIC ms on Linux, as process.hrtime)
let ticks = Number(process.hrtime.bigint() / 1000n) / 1000;
const loaded = once("Page.loadEventFired", s);
// load in real time; the clock pauses once it has loaded
S("Page.navigate", { url });
let isLoaded = false; loaded.then(() => { isLoaded = true; });
let pumps = 0; while (!isLoaded) { if (++pumps % 50 === 0) console.log("pump", pumps); await S("HeadlessExperimental.beginFrame", { frameTimeTicks: ticks, interval: STEP, noDisplayUpdates: true }); ticks += STEP; }
console.log("loaded"); ticks = Math.max(ticks, Number(process.hrtime.bigint() / 1000n) / 1000); await S("Emulation.setVirtualTimePolicy", { policy: "pause" });

rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const frames = Math.ceil(duration / STEP);
let next = 0, buttons = 0;
for (let i = 0; i < frames; i++) {
	const t = i * STEP;
	// Input due by this frame. Not awaited: the renderer handles it inside the next BeginFrame.
	const inputs = [];
	while (next < moves.length && moves[next].t <= t) {
		const m = moves[next++];
		if (m.type === "down") buttons = 1;
		if (m.type === "up") buttons = 0;
		inputs.push(S("Input.dispatchMouseEvent", {
			type: m.type === "move" ? "mouseMoved" : m.type === "down" ? "mousePressed" : "mouseReleased",
			x: m.x, y: m.y, button: m.type === "move" ? (buttons ? "left" : "none") : "left", buttons, clickCount: m.type === "move" ? 0 : 1,
		}));
	}
	// Advance JS time (timers, Date, performance.now) by one frame.
	const expired = once("Emulation.virtualTimeBudgetExpired", s);
	await S("Emulation.setVirtualTimePolicy", { policy: "advance", budget: STEP });
	await expired;
	ticks += STEP;
	const r = await S("HeadlessExperimental.beginFrame", { frameTimeTicks: ticks, interval: STEP, screenshot: { format: "png" } });
	await Promise.all(inputs);
	if (r.screenshotData) writeFileSync(join(out, `${String(i).padStart(5, "0")}.png`), Buffer.from(r.screenshotData, "base64"));
	else console.log(`frame ${i}: no damage, no screenshot`);
}
console.log(`${frames} frames of ${(duration / 1000).toFixed(2)} s rendered in ${((performance.now() - t0) / 1000).toFixed(2)} s`);
ws.close(); proc.kill(); rmSync(userDir, { recursive: true, force: true });
