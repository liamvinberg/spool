import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
const p = await b.newPage();
await p.goto("http://127.0.0.1:8931/page.html"); console.log("secure", await p.evaluate(() => isSecureContext));
console.log(await p.evaluate(async () => {
  const out = {};
  for (const [name, codec] of [["h264 high", "avc1.640028"], ["h264 baseline", "avc1.42001f"], ["vp9", "vp09.00.40.08"], ["av1", "av01.0.08M.08"]]) {
    for (const hw of ["prefer-software", "no-preference"]) {
      try { out[`${name} ${hw}`] = (await VideoEncoder.isConfigSupported({ codec, width: 1920, height: 1080, framerate: 60, bitrate: 8e6, hardwareAcceleration: hw })).supported; }
      catch (e) { out[`${name} ${hw}`] = String(e); }
    }
  }
  return out;
}));
await b.close();
