import type { Browser } from "playwright-core";
import { chromium } from "playwright-core";

/**
 * Headless frame shots on playwright-core (#12): only playwright-managed
 * builds, never a near-miss local Chrome. In #22 this is the thumbnail
 * fallback and it runs only when a pinned build is already on the machine —
 * the first launch failing marks shots unavailable for this daemon's life.
 * The narrated lazy fetch of the pinned headless-shell belongs to `spool
 * shot` (#25); when it lands, this module inherits the installed build.
 */

export interface ShotTarget {
	url: string;
	width: number;
	height: number;
}

export interface ShotTaker {
	capture(target: ShotTarget): Promise<Buffer | undefined>;
	close(): Promise<void>;
}

export function createShotTaker(): ShotTaker {
	let browser: Promise<Browser> | undefined;
	let unavailable = false;

	function boot(): Promise<Browser> {
		// headless-shell is the pinned target; a full playwright-managed
		// chromium (present when another tool fetched it) shoots identically
		browser ??= chromium
			.launch({ channel: "chromium-headless-shell", headless: true })
			.catch(() => chromium.launch({ headless: true }));
		return browser;
	}

	async function capture(target: ShotTarget): Promise<Buffer | undefined> {
		if (unavailable) return undefined;
		let live: Browser;
		try {
			live = await boot();
		} catch {
			unavailable = true;
			return undefined;
		}
		// everything past boot stays inside the try: a browser that died (or a
		// close() racing a queued heal) must resolve undefined, never reject
		let page: Awaited<ReturnType<Browser["newPage"]>> | undefined;
		try {
			page = await live.newPage({
				viewport: { width: Math.max(1, Math.round(target.width)), height: Math.max(1, Math.round(target.height)) },
				deviceScaleFactor: 2,
			});
			await page.goto(target.url, { timeout: 10_000, waitUntil: "domcontentloaded" });
			// frames are blank until React commits (#16) — wait for real content;
			// the string form keeps this file DOM-lib-free
			await page.waitForFunction("(document.getElementById('root')?.childElementCount ?? 0) > 0", undefined, {
				timeout: 5000,
			});
			await page.waitForTimeout(300);
			return await page.screenshot({ type: "png" });
		} catch {
			return undefined;
		} finally {
			await page?.close().catch(() => {});
		}
	}

	async function close(): Promise<void> {
		if (browser === undefined) return;
		await browser.then(
			(live) => live.close(),
			() => {},
		);
	}

	return { capture, close };
}
