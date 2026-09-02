import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { SPOOL_DEVELOPMENT_THREAD, SPOOL_MARK_PATH, SPOOL_THREAD } from "../../src/brand.ts";

/**
 * Draws the app icon and the menu bar mark from the identity export, and hands
 * the icon set to iconutil. Run it when the mark or the accent colour moves, and
 * commit what it writes: the build copies these files rather than making them, so
 * a release never depends on a browser being able to draw.
 *
 *     desktop/scripts/icon.sh
 *
 * The geometry is imported from src/brand.ts rather than copied, which is the one
 * thing the Swift app could not do and the reason it needed a generator to keep a
 * second copy in step. The renderer is the pinned headless Chromium the repo
 * already fetches for shots, because SVG is the format the mark is exported in
 * and a browser is the thing that reads it correctly.
 */

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "..", "assets");

/** The canvas's ground, from src/ui/ui.css. If it moves there, move it here. */
const GROUND = "#0e0e0e";

/** The identity's viewBox, and the box the ribbon is fitted into inside it. */
const VIEW_BOX = "250 182 524 660";

/**
 * Apple's icon grid, as ratios of the 1024 canvas: the rounded square is 824
 * wide, centred, with a corner radius of 185.4. That is what makes the icon look
 * like it belongs beside the ones Apple ships rather than a square someone
 * pasted in. The ribbon fills 68% of it — an open, airy shape carries a larger
 * box than a solid glyph would.
 */
const PLATE_INSET = 100;
const PLATE_SIDE = 824;
const PLATE_RADIUS = 185.4;
const MARK_SHARE = 0.68;

const ICONSET: readonly (readonly [string, number])[] = [
	["icon_16x16", 16],
	["icon_16x16@2x", 32],
	["icon_32x32", 32],
	["icon_32x32@2x", 64],
	["icon_128x128", 128],
	["icon_128x128@2x", 256],
	["icon_256x256", 256],
	["icon_256x256@2x", 512],
	["icon_512x512", 512],
	["icon_512x512@2x", 1024],
];

function appIcon(pixels: number, thread: string): string {
	const side = PLATE_SIDE * MARK_SHARE;
	const offset = 512 - side / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 1024 1024">
	<rect x="${PLATE_INSET}" y="${PLATE_INSET}" width="${PLATE_SIDE}" height="${PLATE_SIDE}" rx="${PLATE_RADIUS}" ry="${PLATE_RADIUS}" fill="${GROUND}"/>
	<svg x="${offset}" y="${offset}" width="${side}" height="${side}" viewBox="${VIEW_BOX}" preserveAspectRatio="xMidYMid meet">
		<path d="${SPOOL_MARK_PATH}" fill="${thread}" fill-rule="evenodd"/>
	</svg>
</svg>`;
}

/**
 * The menu bar glyph, black on nothing. A template image, so macOS tints it for
 * the appearance it is in: a status item that keeps its own colour is the mark of
 * an app that does not belong in the bar.
 *
 * The development lane is the one exception, and it takes the cost knowingly: it
 * is drawn in the development blue and used untinted, because two identical marks
 * in one menu bar is a status item nobody can aim at.
 */
function trayMark(pixels: number, fill = "#000000"): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="${VIEW_BOX}" preserveAspectRatio="xMidYMid meet">
	<path d="${SPOOL_MARK_PATH}" fill="${fill}" fill-rule="evenodd"/>
</svg>`;
}

async function main(): Promise<void> {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	const iconset = join(here, "..", ".build", "AppIcon.iconset");
	rmSync(iconset, { recursive: true, force: true });
	mkdirSync(iconset, { recursive: true });
	mkdirSync(assets, { recursive: true });

	try {
		const page = await browser.newPage();
		const shoot = async (svg: string, pixels: number, file: string): Promise<void> => {
			await page.setViewportSize({ width: pixels, height: pixels });
			await page.setContent(`<style>html,body{margin:0;padding:0}svg{display:block}</style>${svg}`);
			writeFileSync(file, await page.screenshot({ omitBackground: true }));
		};

		for (const [name, pixels] of ICONSET) {
			await shoot(appIcon(pixels, SPOOL_THREAD), pixels, join(iconset, `${name}.png`));
		}
		await shoot(trayMark(16), 16, join(assets, "markTemplate.png"));
		await shoot(trayMark(32), 32, join(assets, "markTemplate@2x.png"));

		// The lane's set. Not an iconset: the bundle has one icon and this one is
		// handed to the Dock at runtime, so a single large raster is all it needs.
		await shoot(appIcon(1024, SPOOL_DEVELOPMENT_THREAD), 1024, join(assets, "iconDev.png"));
		await shoot(trayMark(16, SPOOL_DEVELOPMENT_THREAD), 16, join(assets, "markDev.png"));
		await shoot(trayMark(32, SPOOL_DEVELOPMENT_THREAD), 32, join(assets, "markDev@2x.png"));
	} finally {
		await browser.close();
	}

	process.stdout.write(`${iconset}\n`);
}

main().catch((error: unknown) => {
	process.stderr.write(`${(error as Error).message}\n`);
	process.exit(1);
});
