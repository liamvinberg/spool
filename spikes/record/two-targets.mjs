// Spike: in a deterministic-mode shell, does an ordinary second target run WebCodecs normally?
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
const shell = join(homedir(), ".cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell");
const proc = spawn(shell, ["--deterministic-mode", "--enable-begin-frame-control", "--run-all-compositor-stages-before-draw", "--no-sandbox", `--user-data-dir=${mkdtempSync(join(tmpdir(), "rs-"))}`, "--remote-debugging-port=0", "about:blank"]);
const wsUrl = await new Promise((r) => { let b = ""; proc.stderr.on("data", (d) => { b += d; const m = b.match(/ws:\/\/\S+/); if (m) r(m[0]); }); });
const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params, sessionId })); });
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Page.navigate", { url: "http://127.0.0.1:8931/page.html" }, sessionId);
await new Promise((r) => setTimeout(r, 1000));
const t = performance.now();
const r = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `(async () => {
  const c = new OffscreenCanvas(1920, 1080), g = c.getContext("2d"); let n = 0, bytes = 0;
  const enc = new VideoEncoder({ output: (ch) => { n++; bytes += ch.byteLength; }, error: (e) => { throw e; } });
  enc.configure({ codec: "avc1.640028", width: 1920, height: 1080, framerate: 60, bitrate: 8e6 });
  for (let i = 0; i < 120; i++) { g.fillStyle = "hsl(" + i * 3 + ",70%,50%)"; g.fillRect(0, 0, 1920, 1080); const f = new VideoFrame(c, { timestamp: i * 16667 }); enc.encode(f); f.close(); }
  await enc.flush(); return { n, bytes, secure: isSecureContext };
})()` }, sessionId);
console.log(JSON.stringify(r.result.value), `${(performance.now() - t).toFixed(0)} ms`);
ws.close(); proc.kill();
