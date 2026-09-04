import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir } from "../test-helpers";
import { createSettingsStore } from "./settings";

const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

describe("settings store", () => {
	it("reads every setting at its default, and says so", () => {
		const store = createSettingsStore(join(makeTempDir(), ".spool"));
		const { entries } = store.read();
		expect(entries.map((entry) => entry.key)).toContain("theme.thread");
		expect(entries.every((entry) => entry.source === "default")).toBe(true);
		expect(entries.find((entry) => entry.key === "history")?.value).toBe(false);
	});

	it("writes a project setting into canvas.json and keeps the rest of the file", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const store = createSettingsStore(spoolDir);

		const written = store.write("history", true, root);

		expect(written).toMatchObject({ ok: true, reading: { key: "history", value: true, source: "file" } });
		expect(readJson(join(root, "design", "canvas.json"))).toEqual({ format: 1, history: true });
		expect(store.read(root).entries.find((entry) => entry.key === "history")?.value).toBe(true);
	});

	it("keeps a local setting on the project's registry entry, never in the repo", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const store = createSettingsStore(spoolDir);

		expect(store.write("agent.permissions", "bypass", root).ok).toBe(true);

		const registry = readJson(join(spoolDir, "registry.json")) as { projects: Record<string, unknown>[] };
		expect(registry.projects[0]).toMatchObject({ root, settings: { agent: { permissions: "bypass" } } });
		expect(readJson(join(root, "design", "canvas.json"))).toEqual({ format: 1, history: false });
		expect(store.agentPermissions(root)).toBe("bypass");
		expect(store.agentPermissions(makeTempDir())).toBe("ask");
	});

	it("writes a machine setting into config.json by its dotted key, carrying the other keys through", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const file = join(spoolDir, "config.json");
		writeFileSync(file, '{\n\t"port": 7769,\n\t"history": false\n}\n');
		const store = createSettingsStore(spoolDir);

		expect(store.write("theme.thread", "#2F6FE0").ok).toBe(true);
		expect(store.write("updateCheck", false).ok).toBe(true);

		expect(readJson(file)).toEqual({ port: 7769, history: false, theme: { thread: "#2f6fe0" }, updateCheck: false });
		const entries = store.read(root).entries;
		expect(entries.find((entry) => entry.key === "theme.thread")).toMatchObject({ value: "#2f6fe0", source: "file" });
		expect(entries.find((entry) => entry.key === "theme.bg")).toMatchObject({ value: "#0e0e0e", source: "default" });
	});

	it("refuses to write a config.json it cannot read, and reads it as defaults", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		mkdirSync(spoolDir);
		const file = join(spoolDir, "config.json");
		writeFileSync(file, "{ not json");
		const store = createSettingsStore(spoolDir);

		const written = store.write("updateCheck", false);

		expect(written).toMatchObject({ ok: false, status: 409 });
		expect(readFileSync(file, "utf8")).toBe("{ not json");
		expect(store.read().entries.find((entry) => entry.key === "updateCheck")?.value).toBe(true);
	});

	it("refuses a key it does not know, a value the shape refuses, and a project setting with no project", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const store = createSettingsStore(spoolDir);

		expect(store.write("theme.mark", "#000000", root)).toMatchObject({ ok: false, status: 404 });
		expect(store.write("history", "yes", root)).toMatchObject({ ok: false, status: 400 });
		expect(store.write("history", true)).toMatchObject({ ok: false, status: 400 });
		expect(store.write("agent.permissions", "bypass", makeTempDir())).toMatchObject({ ok: false, status: 404 });
	});

	it("reads a hand edit the shape refuses as the default", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		mkdirSync(spoolDir);
		writeFileSync(join(spoolDir, "config.json"), '{ "theme": { "thread": "red" } }');
		const store = createSettingsStore(spoolDir);

		expect(store.read().entries.find((entry) => entry.key === "theme.thread")).toMatchObject({
			value: "#f5391a",
			source: "default",
		});
	});
});
