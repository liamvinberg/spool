import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { makeTempDir } from "../test-helpers";
import { createUpdateChecker, isNewer, readUpdateCache, writeUpdateCache } from "./update-check";

describe("isNewer", () => {
	it("orders release triples", () => {
		expect(isNewer("0.1.1", "0.1.0")).toBe(true);
		expect(isNewer("0.2.0", "0.1.9")).toBe(true);
		expect(isNewer("1.0.0", "0.9.9")).toBe(true);
		expect(isNewer("0.1.0", "0.1.0")).toBe(false);
		expect(isNewer("0.1.0", "0.1.1")).toBe(false);
	});

	it("ranks a release above its prereleases, never below", () => {
		expect(isNewer("0.2.0", "0.2.0-beta.1")).toBe(true);
		expect(isNewer("0.2.0-beta.1", "0.2.0")).toBe(false);
		expect(isNewer("0.2.0-beta.2", "0.2.0-beta.1")).toBe(true);
		expect(isNewer("0.2.0-beta.2", "0.2.0-beta.10")).toBe(false);
		expect(isNewer("0.2.0-beta.10", "0.2.0-beta.2")).toBe(true);
		expect(isNewer("0.2.0-beta.1", "0.2.0-beta.alpha")).toBe(false);
	});

	it("treats malformed versions as never newer", () => {
		expect(isNewer("latest", "0.1.0")).toBe(false);
		expect(isNewer("0.2.0", "not-a-version")).toBe(false);
	});
});

describe("update cache", () => {
	it("round-trips and reads corruption as absent", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		expect(readUpdateCache(spoolDir)).toBeUndefined();

		writeUpdateCache(spoolDir, { latest: "0.2.0", checkedAt: "2026-07-22T00:00:00.000Z" });
		expect(readUpdateCache(spoolDir)).toEqual({ latest: "0.2.0", checkedAt: "2026-07-22T00:00:00.000Z" });

		writeUpdateCache(spoolDir, { latest: "0.3.0", checkedAt: "2026-07-23T00:00:00.000Z" });
		expect(readUpdateCache(spoolDir)?.latest).toBe("0.3.0");
	});
});

describe("createUpdateChecker", () => {
	it("checks immediately when the cache is stale and announces a newer release", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const fetchLatest = vi.fn().mockResolvedValue("0.2.0");
		const onUpdate = vi.fn();
		const checker = createUpdateChecker({ spoolDir, version: "0.1.0", onUpdate, fetchLatest, intervalMs: 60_000 });

		checker.start();
		await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith("0.2.0"));

		expect(checker.available()).toBe("0.2.0");
		expect(readUpdateCache(spoolDir)?.latest).toBe("0.2.0");
		checker.stop();
	});

	it("never re-asks inside a fresh cache window, but still offers from it", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		writeUpdateCache(spoolDir, { latest: "0.2.0", checkedAt: new Date().toISOString() });
		const fetchLatest = vi.fn().mockResolvedValue("0.9.9");
		const checker = createUpdateChecker({
			spoolDir,
			version: "0.1.0",
			onUpdate: () => {},
			fetchLatest,
			intervalMs: 60_000,
		});

		checker.start();
		expect(checker.available()).toBe("0.2.0");
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(fetchLatest).not.toHaveBeenCalled();
		checker.stop();
	});

	it("schedules the next ask from the cached check time, not the boot time", async () => {
		vi.useFakeTimers();
		try {
			const spoolDir = join(makeTempDir(), ".spool");
			writeUpdateCache(spoolDir, { latest: "0.1.0", checkedAt: new Date(Date.now() - 45_000).toISOString() });
			const fetchLatest = vi.fn().mockResolvedValue("0.2.0");
			const checker = createUpdateChecker({
				spoolDir,
				version: "0.1.0",
				onUpdate: () => {},
				fetchLatest,
				intervalMs: 60_000,
			});

			checker.start();
			await vi.advanceTimersByTimeAsync(14_999);
			expect(fetchLatest).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(fetchLatest).toHaveBeenCalledTimes(1);
			checker.stop();
		} finally {
			vi.useRealTimers();
		}
	});

	it("re-asks on the interval and announces each distinct newer latest once", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		writeUpdateCache(spoolDir, { latest: "0.1.0", checkedAt: new Date().toISOString() });
		const fetchLatest = vi.fn().mockResolvedValue("0.2.0");
		const onUpdate = vi.fn();
		const checker = createUpdateChecker({ spoolDir, version: "0.1.0", onUpdate, fetchLatest, intervalMs: 20 });

		checker.start();
		await vi.waitFor(() => expect(fetchLatest.mock.calls.length).toBeGreaterThanOrEqual(2));
		expect(onUpdate).toHaveBeenCalledTimes(1);
		checker.stop();
	});

	it("stays silent on failure: no cache write, no announcement", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const fetchLatest = vi.fn().mockResolvedValue(undefined);
		const onUpdate = vi.fn();
		const checker = createUpdateChecker({ spoolDir, version: "0.1.0", onUpdate, fetchLatest, intervalMs: 60_000 });

		checker.start();
		await vi.waitFor(() => expect(fetchLatest).toHaveBeenCalled());
		expect(onUpdate).not.toHaveBeenCalled();
		expect(readUpdateCache(spoolDir)).toBeUndefined();
		expect(checker.available()).toBeUndefined();
		checker.stop();
	});

	it("stays silent when the cache cannot be written", async () => {
		const spoolDir = join(makeTempDir(), "not-a-directory");
		writeFileSync(spoolDir, "blocked");
		const fetchLatest = vi.fn().mockResolvedValue("0.2.0");
		const onUpdate = vi.fn();
		const checker = createUpdateChecker({ spoolDir, version: "0.1.0", onUpdate, fetchLatest, intervalMs: 60_000 });

		checker.start();
		await vi.waitFor(() => expect(fetchLatest).toHaveBeenCalled());
		expect(onUpdate).not.toHaveBeenCalled();
		expect(checker.available()).toBeUndefined();
		checker.stop();
	});

	it("never offers what is not newer than the running daemon", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		// a stale cache from before this daemon was released
		writeUpdateCache(spoolDir, { latest: "0.1.0", checkedAt: "2020-01-01T00:00:00.000Z" });
		const checker = createUpdateChecker({
			spoolDir,
			version: "0.2.0",
			onUpdate: () => {
				throw new Error("0.1.0 is not an update for 0.2.0");
			},
			fetchLatest: async () => "0.1.0",
			intervalMs: 60_000,
		});

		checker.start();
		expect(checker.available()).toBeUndefined();
		await new Promise((resolve) => setTimeout(resolve, 30));
		checker.stop();
	});
});
