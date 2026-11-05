import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
const p = await b.newPage();
await p.goto("http://127.0.0.1:8931/page.html");
console.log(await p.evaluate(async () => {
  const out = {};
  for (const codec of ["mp4a.40.2", "opus"]) out[codec] = (await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 })).supported;
  return out;
}));
await b.close();
