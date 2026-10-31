// spool#219: idle and after-click shots of each designer arm, rendered the same way.
import { chromium } from "playwright-core";
const [url, w, h, x, y, out] = process.argv.slice(2);
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(url); await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}-idle.png` });
await p.mouse.move(+x, +y); await p.waitForTimeout(300); await p.mouse.click(+x, +y); await p.waitForTimeout(1800);
await p.screenshot({ path: `${out}-after.png` });
await b.close();
