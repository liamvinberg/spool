import { beforeEach, describe, expect, it, vi } from "vitest";

const playwright = vi.hoisted(() => ({
	launch: vi.fn(),
	newPage: vi.fn(),
}));

vi.mock("playwright-core", () => ({
	chromium: {
		launch: playwright.launch,
	},
}));

const { createShotTaker } = await import("./shots");

describe("headless cover output budget", () => {
	beforeEach(() => {
		playwright.launch.mockReset();
		playwright.newPage.mockReset();
		playwright.newPage.mockResolvedValue({
			goto: vi.fn(),
			waitForFunction: vi.fn(),
			waitForTimeout: vi.fn(),
			screenshot: vi.fn(async () => Buffer.from([0xff, 0xd8, 0xff])),
			close: vi.fn(async () => {}),
		});
		playwright.launch.mockResolvedValue({
			newPage: playwright.newPage,
			close: vi.fn(),
		});
	});

	it("allocates an accepted tall still at its worked output size", async () => {
		const shots = createShotTaker();

		await expect(shots.capture({ url: "http://render.test/frame", width: 40, height: 1000 })).resolves.toEqual(
			Buffer.from([0xff, 0xd8, 0xff]),
		);
		expect(playwright.newPage).toHaveBeenCalledWith({
			viewport: { width: 40, height: 1000 },
			deviceScaleFactor: 20,
		});
	});

	it("rejects an oversized still before launching Playwright", async () => {
		const shots = createShotTaker();

		await expect(
			shots.capture({ url: "http://render.test/frame", width: 40, height: 10_000 }),
		).resolves.toBeUndefined();
		expect(playwright.launch).not.toHaveBeenCalled();
	});
});
