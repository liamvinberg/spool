import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { forgetResolvedProject, readRegistry, registerProject } from "../registry";
import { removeProject } from "../remove";
import { makeTempDir, until } from "../test-helpers";
import { readSession, registerAndOpenProject, updateSession, watchMachineState, writeSession } from "./session";
import { createMachineStateWatchHarness } from "./session-test-harness";

describe("app session", () => {
	it("surfaces a session path that cannot be read as a file", () => {
		const spoolDir = makeTempDir();
		const sessionFile = join(spoolDir, "session.json");
		mkdirSync(sessionFile);

		expect(() => readSession(spoolDir)).toThrow(`cannot read session at ${sessionFile}`);
	});

	it("does not unregister a project when its session cannot be read", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = realpathSync(makeTempDir());
		registerProject(spoolDir, root);
		mkdirSync(join(spoolDir, "session.json"));

		expect(() => removeProject(root, spoolDir)).toThrow(/cannot read session/);
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([root]);
	});

	it("does not register a project when the session cannot be read", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const kept = realpathSync(makeTempDir());
		const added = realpathSync(makeTempDir());
		registerProject(spoolDir, kept);
		const registryFile = join(spoolDir, "registry.json");
		const registryBefore = readFileSync(registryFile, "utf8");
		mkdirSync(join(spoolDir, "session.json"));

		expect(() => registerAndOpenProject(spoolDir, added)).toThrow(/cannot read session/);

		expect(readFileSync(registryFile, "utf8")).toBe(registryBefore);
	});

	it("does not prune the session when the registry is corrupt", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = realpathSync(makeTempDir());
		writeSession(spoolDir, { open: [root] });
		const sessionFile = join(spoolDir, "session.json");
		const sessionBefore = readFileSync(sessionFile, "utf8");
		writeFileSync(join(spoolDir, "registry.json"), "{broken");

		expect(() => removeProject(root, spoolDir)).toThrow(/corrupt registry/);

		expect(readFileSync(sessionFile, "utf8")).toBe(sessionBefore);
	});

	it("acknowledges exact removal snapshots without replaying or swallowing later writes", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const kept = realpathSync(makeTempDir());
		const gone = realpathSync(makeTempDir());
		registerProject(spoolDir, kept);
		registerProject(spoolDir, gone);
		updateSession(spoolDir, kept, true);
		updateSession(spoolDir, gone, true);
		const watchHarness = createMachineStateWatchHarness();
		const events: string[] = [];
		const watcher = watchMachineState(spoolDir, (event) => events.push(event.kind), {
			adapter: watchHarness.adapter,
		});
		onTestFinished(() => watcher.stop());

		const removal = forgetResolvedProject(spoolDir, gone);
		watcher.acknowledgeRegistry(removal.registry);
		watcher.acknowledgeSession(removal.session);
		watchHarness.changed("registry.json");
		watchHarness.changed("session.json");
		watchHarness.flush();
		expect(events).toEqual([]);

		const fresh = realpathSync(makeTempDir());
		registerProject(spoolDir, fresh);
		watchHarness.changed("registry.json");
		watchHarness.flush();
		expect(events).toEqual(["registry"]);

		expect(updateSession(spoolDir, kept, false)).toEqual({ kind: "written", session: { open: [] } });
		watchHarness.changed("session.json");
		watchHarness.flush();
		expect(events).toEqual(["registry", "session"]);
	});

	it("observes external register, open, and remove writes from an absent machine directory", {
		timeout: 20_000,
	}, async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = realpathSync(makeTempDir());
		const events: string[] = [];
		const watcher = watchMachineState(spoolDir, (event) => events.push(event.kind));
		onTestFinished(() => watcher.stop());
		expect(existsSync(spoolDir)).toBe(true);

		registerProject(spoolDir, root);
		await until(() => events.includes("registry"));

		events.length = 0;
		expect(updateSession(spoolDir, root, true)).toEqual({ kind: "written", session: { open: [root] } });
		await until(() => events.includes("session"));

		events.length = 0;
		expect(removeProject(root, spoolDir)).toEqual({ root, removed: true });
		await until(() => events.includes("registry") && events.includes("session"));
		expect(readRegistry(spoolDir).projects).toEqual([]);
		expect(readSession(spoolDir)).toEqual({ open: [] });
	});
});
