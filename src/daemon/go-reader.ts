import type { Browser } from "playwright-core";
import { chromium } from "playwright-core";
import type { RenderedTarget } from "./resolved-targets";

/**
 * Reading resolved `data-go` attributes off a real render (#34), on the same
 * playwright-core footing as the shot taker: only playwright-managed builds,
 * and the first launch failing marks reading unavailable for this daemon's
 * life. On a machine with no pinned build this is a quiet no-op — the map keeps
 * whatever the parser could read and names the rest, which is the pre-render
 * behavior exactly.
 *
 * Nothing is injected into the frame. The attribute is read from the DOM React
 * already produced, so a frame behaves identically whether or not this ran —
 * the parity law holds by construction rather than by care.
 */

export interface ReadTarget {
	/** The frame document's URL, scenario already named on it. */
	url: string;
	width: number;
	height: number;
}

export interface GoReader {
	/** Every `[data-go]` carrier the render produced; undefined when unavailable. */
	read(target: ReadTarget): Promise<RenderedTarget[] | undefined>;
	close(): Promise<void>;
}

/**
 * Collect every carrier's resolved attribute with the stamp of the element
 * carrying it. Runs as a string so this module stays DOM-lib-free, the same
 * convention the shot taker's readiness probe uses.
 */
const COLLECT = `Array.from(document.querySelectorAll('[data-go]')).flatMap((el) => {
	const target = el.getAttribute('data-go');
	const stamp = el.getAttribute('data-spool-source');
	if (typeof target !== 'string' || target === '' || typeof stamp !== 'string') return [];
	const at = stamp.lastIndexOf(':');
	const before = stamp.lastIndexOf(':', at - 1);
	if (at < 1 || before < 1) return [];
	const line = Number(stamp.slice(before + 1, at));
	const col = Number(stamp.slice(at + 1));
	if (!Number.isInteger(line) || !Number.isInteger(col)) return [];
	return [{ target, path: stamp.slice(0, before), line, col }];
})`;

export function createGoReader(): GoReader {
	let browser: Promise<Browser> | undefined;
	let unavailable = false;

	function boot(): Promise<Browser> {
		browser ??= chromium
			.launch({ channel: "chromium-headless-shell", headless: true })
			.catch(() => chromium.launch({ headless: true }));
		return browser;
	}

	async function read(target: ReadTarget): Promise<RenderedTarget[] | undefined> {
		if (unavailable) return undefined;
		let live: Browser;
		try {
			live = await boot();
		} catch {
			unavailable = true;
			return undefined;
		}
		let page: Awaited<ReturnType<Browser["newPage"]>> | undefined;
		try {
			page = await live.newPage({
				viewport: { width: Math.max(1, Math.round(target.width)), height: Math.max(1, Math.round(target.height)) },
			});
			await page.goto(target.url, { timeout: 10_000, waitUntil: "domcontentloaded" });
			// frames are blank until React commits (#16) — the same wait the shot
			// taker uses, for the same reason
			await page.waitForFunction("(document.getElementById('root')?.childElementCount ?? 0) > 0", undefined, {
				timeout: 5000,
			});
			const found = await page.evaluate<RenderedTarget[]>(COLLECT);
			return Array.isArray(found) ? found : [];
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

	return { read, close };
}
