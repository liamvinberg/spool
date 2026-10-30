import type { Browser, BrowserContext, Page } from "playwright-core";
import { onTestFinished } from "vitest";

let browser: Browser | undefined;

/**
 * SPOOL_TEST_CPU_THROTTLE=4 slows every page's main thread fourfold, through
 * Chromium's own emulation: what a loaded CI runner does to frame timing, on
 * demand, so a case that only holds on a quick machine fails where it can be
 * read rather than once a week in CI.
 */
const throttle = Number(process.env.SPOOL_TEST_CPU_THROTTLE ?? 1);

async function throttled(page: Page): Promise<void> {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
}

function throttling(launched: Browser): Browser {
	const watch = (context: BrowserContext) => context.on("page", (page) => void throttled(page).catch(() => {}));
	const newContext = launched.newContext.bind(launched);
	const newPage = launched.newPage.bind(launched);
	launched.newContext = async (options) => {
		const context = await newContext(options);
		watch(context);
		return context;
	};
	launched.newPage = async (options) => {
		const page = await newPage(options);
		await throttled(page);
		watch(page.context());
		return page;
	};
	return launched;
}

/**
 * One Chromium per test file, shared by its cases. Each case still gets fresh
 * contexts: `browser.newPage()` opens its own context, and every context the
 * case opened is closed when the case finishes, which is what closing the whole
 * browser used to do for it. The browser itself closes with the file, from
 * `test-setup.ts`.
 */
export async function testBrowser(): Promise<Browser> {
	if (browser === undefined) {
		const { chromium } = await import("playwright-core");
		const launched = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
		browser = throttle > 1 ? throttling(launched) : launched;
	}
	const shared = browser;
	onTestFinished(async () => {
		for (const context of shared.contexts()) await context.close();
	}, 35_000);
	return shared;
}

export async function closeTestBrowser(): Promise<void> {
	const open = browser;
	browser = undefined;
	await open?.close();
}
