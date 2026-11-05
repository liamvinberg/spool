// Spike: encode the replayed PNGs to H.264 with WebCodecs inside the same headless-shell.
import { chromium } from "playwright-core";
import { readdirSync, readFileSync } from "node:fs";
const dir = "/tmp/record-spike/frames";
const files = readdirSync(dir).sort();
const b = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
const p = await b.newPage();
await p.goto("http://127.0.0.1:8931/page.html");
await p.evaluate(() => {
  window.chunks = []; window.bytes = 0;
  window.enc = new VideoEncoder({ output: (c) => { window.chunks.push(c.type); window.bytes += c.byteLength; }, error: (e) => { window.err = String(e); } });
  enc.configure({ codec: "avc1.640028", width: 1280, height: 720, framerate: 60, bitrate: 8e6, avc: { format: "avc" } });
});
const t0 = performance.now();
for (let i = 0; i < files.length; i++) {
  const b64 = readFileSync(`${dir}/${files[i]}`).toString("base64");
  await p.evaluate(async ([b64, i]) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const f = new VideoFrame(bmp, { timestamp: Math.round(i * 1e6 / 60), duration: Math.round(1e6 / 60) });
    enc.encode(f, { keyFrame: i % 120 === 0 }); f.close(); bmp.close();
  }, [b64, i]);
}
const r = await p.evaluate(async () => { await enc.flush(); return { n: chunks.length, keys: chunks.filter((t) => t === "key").length, bytes, err: window.err }; });
console.log(files.length, "frames ->", r, `in ${((performance.now() - t0) / 1000).toFixed(2)} s`);
await b.close();
