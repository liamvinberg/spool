import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import * as atomicWrite from "../atomic-write";
import { initProject } from "../init";
import { mutateMachineState } from "../machine-state";
import { readRegistry } from "../registry";
import { fixtureAgentExecutor, makeApp, makeTempDir, until } from "../test-helpers";
import { putThread, readThread } from "./agent-threads";
import { readSession, writeSession } from "./session";

describe("rename a project", () => {
	it("supports changing only the capitalization of a folder name", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = projectFixture(spoolDir);
		const response = await rename(makeApp(spoolDir), root, name.toUpperCase());
		expect(response.status).toBe(200);
		expect(readRegistry(spoolDir).projects[0]?.root).toBe(join(dirname(root), name.toUpperCase()));
	});

	it("restores the folder and registry if the session cannot be written", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = projectFixture(spoolDir);
		const registry = readRegistry(spoolDir);
		const app = makeApp(spoolDir);
		const write = atomicWrite.writeAtomic;
		const failure = vi.spyOn(atomicWrite, "writeAtomic").mockImplementation((file, data) => {
			if (file === join(spoolDir, "session.json")) throw new Error("Session write failed");
			write(file, data);
		});
		onTestFinished(() => failure.mockRestore());
		const response = await rename(app, root, "coffee");
		expect(response.status).toBe(409);
		expect(existsSync(root)).toBe(true);
		expect(existsSync(join(dirname(root), "coffee"))).toBe(false);
		expect(readRegistry(spoolDir)).toEqual(registry);
	});

	it("waits for an active agent before moving its working directory", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = projectFixture(spoolDir);
		const agent = fixtureAgentExecutor(() => {});
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });
		const turn = await app.request(`/api/p/${name}/agent/turn`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ thread: "12345678-1234-4234-8234-123456789012", said: [{ prompt: "Design a home" }] }),
		});
		await until(() => (agent.spawned[0]?.inputs.length ?? 0) > 0);
		const response = await rename(app, root, "coffee");
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ error: expect.stringContaining("agent finish") });
		expect(existsSync(root)).toBe(true);
		await turn.body?.cancel();
	});
	it("moves the folder, saved settings, open tab and conversation history together", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = projectFixture(spoolDir);
		const other = projectFixture(spoolDir);
		writeSession(spoolDir, { open: [other.root, root] });
		mutateMachineState(spoolDir, { kind: "set-project-setting", root, path: ["agent", "effort"], value: "high" });
		const before = readRegistry(spoolDir).projects.find((project) => project.root === root);
		const thread = "12345678-1234-4234-8234-123456789012";
		putThread(spoolDir, root, thread, {
			ask: "Design a home",
			life: "read",
			at: 1,
			entries: [],
			kept: 0,
			plan: null,
			queued: [],
			draft: "",
		});
		writeFileSync(join(root, "keep.txt"), "project content");
		const app = makeApp(spoolDir);
		const renamed = join(dirname(root), "new name");
		const response = await rename(app, root, "new name");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ root: renamed, name: "new name" });
		expect(existsSync(root)).toBe(false);
		expect(readFileSync(join(renamed, "keep.txt"), "utf8")).toBe("project content");
		expect(readRegistry(spoolDir).projects).toContainEqual({ ...before, root: renamed });
		expect(readSession(spoolDir).open).toEqual([other.root, renamed]);
		expect(readThread(spoolDir, renamed, thread)?.id).toBe(thread);
		expect((await app.request("/api/p/new%20name/frames")).status).toBe(200);
		const restarted = makeApp(spoolDir);
		expect((await restarted.request("/api/p/new%20name/frames")).status).toBe(200);
	});

	it.each(["occupied folder", "occupied file", "occupied link"])(
		"preserves an %s and leaves the project unchanged",
		async (kind) => {
			const spoolDir = join(makeTempDir(), ".spool");
			const { root } = projectFixture(spoolDir);
			const target = join(dirname(root), "taken");
			if (kind === "occupied folder") mkdirSync(target);
			else if (kind === "occupied file") writeFileSync(target, "keep");
			else symlinkSync(join(dirname(root), "missing"), target);
			const registry = readRegistry(spoolDir);
			const session = readSession(spoolDir);
			const response = await rename(makeApp(spoolDir), root, "taken");
			expect(response.status).toBe(409);
			expect(existsSync(root)).toBe(true);
			expect(readRegistry(spoolDir)).toEqual(registry);
			expect(readSession(spoolDir)).toEqual(session);
		},
	);

	it.each(["", "../escape", "a/b", "a\\b", ".hidden", "bad\u0000name"])("rejects an invalid name %j", async (name) => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = projectFixture(spoolDir);
		expect((await rename(makeApp(spoolDir), root, name)).status).toBe(409);
		expect(existsSync(root)).toBe(true);
	});

	it("rejects names registered in another parent and roots outside the registry", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const project = projectFixture(spoolDir);
		const other = projectFixture(spoolDir);
		const app = makeApp(spoolDir);
		expect((await rename(app, project.root, other.name)).status).toBe(409);
		const unregistered = makeTempDir();
		expect((await rename(app, unregistered, "renamed")).status).toBe(409);
		expect(existsSync(unregistered)).toBe(true);
	});
});

function rename(app: ReturnType<typeof makeApp>, root: string, name: string) {
	return app.request("/api/projects/rename", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ root, name }),
	});
}

function projectFixture(spoolDir: string) {
	const parent = makeTempDir();
	const name = parent.slice(parent.lastIndexOf("/") + 1);
	const folder = join(parent, name);
	mkdirSync(folder);
	return { ...initProject(folder, spoolDir), name };
}
