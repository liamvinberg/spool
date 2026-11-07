import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { SPOOL_MARK_PATH, SPOOL_THREAD } from "../src/brand.ts";

/**
 * Draws the extension's icons from the identity export into extension/icons, which are committed (as the Mac app's
 * are, desktop/scripts/icon.ts) so a build never needs a browser to draw. Run it when the mark moves:
 *
 *     pnpm extension:icons
 *
 * The toolbar's 16 and 32 are the ribbon alone, which reads on a light toolbar and a dark one. The 48 and the 128
 * (the extensions page, the install prompt, the Web Store) are the Mac app's icon: the ribbon on the dark plate, the
 * 128 a 96 plate on 16 px of clear space, as Chrome's icon guidance asks.
 */

const here = dirname(fileURLToPath(import.meta.url));
const VIEW_BOX = "250 182 524 660";
/** the canvas's ground and the plate's shape, as desktop/scripts/icon.ts draws the app icon */
const GROUND = "#0e0e0e";
const PLATE_RADIUS = 185.4 / 824;
const MARK_SHARE = 0.68;

function mark(pixels: number): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="${VIEW_BOX}" preserveAspectRatio="xMidYMid meet">
	<path d="${SPOOL_MARK_PATH}" fill="${SPOOL_THREAD}" fill-rule="evenodd"/>
</svg>`;
}

function plate(pixels: number): string {
	const pad = pixels / 8;
	const side = pixels - pad * 2;
	const art = side * MARK_SHARE;
	const at = (pixels - art) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${pixels} ${pixels}">
	<rect x="${pad}" y="${pad}" width="${side}" height="${side}" rx="${side * PLATE_RADIUS}" fill="${GROUND}"/>
	<svg x="${at}" y="${at}" width="${art}" height="${art}" viewBox="${VIEW_BOX}" preserveAspectRatio="xMidYMid meet">
		<path d="${SPOOL_MARK_PATH}" fill="${SPOOL_THREAD}" fill-rule="evenodd"/>
	</svg>
</svg>`;
}

const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
try {
	const out = join(here, "icons");
	mkdirSync(out, { recursive: true });
	const page = await browser.newPage();
	for (const [pixels, svg] of [
		[16, mark(16)],
		[32, mark(32)],
		[48, plate(48)],
		[128, plate(128)],
	] as const) {
		await page.setViewportSize({ width: pixels, height: pixels });
		await page.setContent(`<style>html,body{margin:0;padding:0}svg{display:block}</style>${svg}`);
		writeFileSync(join(out, `${pixels}.png`), await page.screenshot({ omitBackground: true }));
	}
	console.log(`wrote ${out}`);
} finally {
	await browser.close();
}
