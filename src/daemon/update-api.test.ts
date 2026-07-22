import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { makeApp, makeTempDir, sseReader } from "../test-helpers";
import { createDaemonApp } from "./app";
import { writeUpdateCache } from "./update-check";

describe("POST /api/upgrade", () => {
	it("spawns the orchestrator and answers 202", async () => {
		const upgrade = vi.fn().mockReturnValue({ ok: true });
		const app = makeApp(join(makeTempDir(), ".spool"), { upgrade });

		const res = await app.request("/api/upgrade", { method: "POST" });

		expect(res.status).toBe(202);
		expect(await res.json()).toEqual({ started: true });
		expect(upgrade).toHaveBeenCalledTimes(1);
	});

	it("relays a refusal as 409 so the toast can say why", async () => {
		const app = makeApp(join(makeTempDir(), ".spool"), {
			upgrade: () => ({ ok: false, error: "the running spool is the development checkout — update it with git" }),
		});

		const res = await app.request("/api/upgrade", { method: "POST" });

		expect(res.status).toBe(409);
		expect(((await res.json()) as { error: string }).error).toContain("checkout");
	});
});

describe("update availability over SSE", () => {
	it("hello carries the cached latest when the check is opted in", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		writeUpdateCache(spoolDir, { latest: "9.9.9", checkedAt: new Date().toISOString() });
		const app = makeApp(spoolDir, { updateCheck: true });

		const events = sseReader(await app.request("/api/events"));
		const hello = await events.next();

		expect(hello.event).toBe("hello");
		expect(hello.data).toEqual({ name: "spool", version: "0.0.0-test", latest: "9.9.9" });
	});

	it("hello stays silent about the cache when the owner opted out", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		writeUpdateCache(spoolDir, { latest: "9.9.9", checkedAt: new Date().toISOString() });
		const app = makeApp(spoolDir); // updateCheck absent = off

		const events = sseReader(await app.request("/api/events"));
		const hello = await events.next();

		expect(hello.data).toEqual({ name: "spool", version: "0.0.0-test", latest: null });
	});

	it("a check learning of a newer release reaches connected pages as an app event", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const daemon = createDaemonApp({
			spoolDir,
			version: "0.0.0-test",
			updateCheck: true,
			fetchLatest: async () => "9.9.9",
		});
		onTestFinished(() => daemon.close());

		const events = sseReader(await daemon.app.request("/api/events"));
		expect((await events.next()).event).toBe("hello");

		daemon.startUpdateCheck();
		const update = await events.next();

		expect(update.event).toBe("app");
		expect(update.data).toEqual({ kind: "update", latest: "9.9.9" });
	});

	it("never starts checking when opted out, even if asked", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const fetchLatest = vi.fn().mockResolvedValue("9.9.9");
		const daemon = createDaemonApp({ spoolDir, version: "0.0.0-test", fetchLatest });
		onTestFinished(() => daemon.close());

		daemon.startUpdateCheck();
		await new Promise((resolve) => setTimeout(resolve, 30));

		expect(fetchLatest).not.toHaveBeenCalled();
	});
});
