import { chromium } from "playwright-core";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "rp-")), { channel: "chromium-headless-shell", headless: true, viewport: null,
  args: ["--deterministic-mode", "--enable-begin-frame-control", "--run-all-compositor-stages-before-draw", "--disable-threaded-animation", "--disable-threaded-scrolling", "--disable-checker-imaging"] });
const first = ctx.pages()[0] ?? await ctx.newPage();
console.log("first page ok");
const s0 = await ctx.newCDPSession(first);
const pageP = ctx.waitForEvent("page", { timeout: 5000 });
const { targetId } = await s0.send("Target.createTarget", { url: "about:blank", width: 800, height: 600, enableBeginFrameControl: true });
const page = await pageP; console.log("got page", targetId.slice(0, 6));
const s = await ctx.newCDPSession(page);
const r = await s.send("HeadlessExperimental.beginFrame", { interval: 16.6, screenshot: { format: "png" } });
console.log("beginFrame ok, screenshot", !!r.screenshotData);
await ctx.close();
