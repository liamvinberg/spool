import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { serveDaemon } from "./daemon/server";
import { readRegistry, registerProject } from "./registry";
import { forgetProject } from "./remove";
import { makeTempDir } from "./test-helpers";

describe("spool remove with a daemon running", () => {
	it("forgets through it, and when it can't, says so and leaves the project registered (#243)", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = realpathSync(makeTempDir());
		registerProject(spoolDir, root);
		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());
		const recorded = readFileSync(join(spoolDir, "daemon.json"), "utf8");
		// a daemon that refuses: the registry alone would be read by it only after the cleanup had gone on
		writeFileSync(
			join(spoolDir, "daemon.json"),
			recorded.replace(/"controlToken":\s*"[^"]+"/, '"controlToken": "wrong"'),
		);

		await expect(forgetProject(root, spoolDir)).rejects.toThrow(/couldn't forget/);
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([root]);

		writeFileSync(join(spoolDir, "daemon.json"), recorded);
		expect(await forgetProject(root, spoolDir)).toEqual({ root, removed: true });
		expect(readRegistry(spoolDir).projects).toEqual([]);
	});
});
