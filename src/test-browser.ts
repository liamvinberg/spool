import type { Browser } from "playwright-core";
import { onTestFinished } from "vitest";

let browser: Browser | undefined;

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
		browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
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
