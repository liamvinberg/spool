import { chromium } from "playwright-core";
import { expect, it, onTestFinished } from "vitest";
import { closeAfterTest } from "../test-helpers";

it.skipIf(process.platform === "win32")(
	"waits for the owned browser to exit when graceful shutdown exceeds ten seconds",
	async () => {
		const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
		const session = await browser.newBrowserCDPSession();
		const processInfo = await session.send("SystemInfo.getProcessInfo");
		const pid = processInfo.processInfo.find((process) => process.type === "browser")?.id;
		if (pid === undefined) throw new Error("the owned browser process was not identified");
		await session.detach();
		let resume: ReturnType<typeof setTimeout> | undefined;
		// Also release this test's process after an intentionally failing old hook.
		onTestFinished(async () => {
			clearTimeout(resume);
			try {
				process.kill(pid, "SIGCONT");
			} catch {}
			await browser.close();
		}, 35_000);
		closeAfterTest({
			close: async () => {
				const started = performance.now();
				resume = setTimeout(() => process.kill(pid, "SIGCONT"), 11_000);
				await browser.close();
				clearTimeout(resume);
				expect(performance.now() - started).toBeGreaterThanOrEqual(10_000);
				expect(browser.isConnected()).toBe(false);
				expect(() => process.kill(pid, 0)).toThrow();
			},
		});
		// This is the real process, not a replacement close promise. Chromium
		// cannot acknowledge Browser.close while the OS has paused its execution.
		process.kill(pid, "SIGSTOP");
	},
);
