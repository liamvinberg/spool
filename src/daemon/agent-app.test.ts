import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { makeApp, makeProject, makeTempDir } from "../test-helpers";
import { createAgentAppLauncher } from "./agent-app";
import { createSettingsStore } from "./settings";

it("opens one literal project argument through the local CLI", async () => {
	const run = vi.fn().mockResolvedValue(undefined);
	const launcher = createAgentAppLauncher({
		platform: "darwin",
		path: "/bin:/tools",
		home: "/home/person",
		exists: (path) => path === "/home/person/Applications/ChatGPT.app",
		runnable: (path) => path === "/tools/codex",
		run,
	});
	expect(launcher.available()).toBe(true);
	const root = "/projects/it's $(not-a-command)";
	await launcher.open(root);
	expect(run).toHaveBeenCalledExactlyOnceWith("/tools/codex", ["app", root], root);
});

it.each(["linux", "win32", "darwin"] as const)(
	"does not spawn or install an unavailable app on %s",
	async (platform) => {
		const run = vi.fn();
		const launcher = createAgentAppLauncher({
			platform,
			path: "/tools",
			exists: () => false,
			runnable: () => true,
			run,
		});
		expect(launcher.available()).toBe(false);
		await expect(launcher.open("/project")).rejects.toThrow("Copy the project path");
		expect(run).not.toHaveBeenCalled();
	},
);

it("rechecks the app at launch and never runs a project-local codex", async () => {
	let installed = true;
	const run = vi.fn();
	const launcher = createAgentAppLauncher({
		platform: "darwin",
		path: ".::/tools",
		exists: () => installed,
		runnable: () => true,
		run,
	});
	expect(launcher.available()).toBe(true);
	installed = false;
	await expect(launcher.open("/project")).rejects.toThrow();
	expect(run).not.toHaveBeenCalled();
	const relative = createAgentAppLauncher({
		platform: "darwin",
		path: ".:",
		exists: () => true,
		runnable: () => true,
		run,
	});
	expect(relative.available()).toBe(false);
});

it("requires the control capability and resolves the registered folder instead of accepting one from the browser", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	const open = vi.fn().mockResolvedValue(undefined);
	const app = makeApp(spoolDir, { agentAppLauncher: { available: () => true, open } });
	const url = `/api/p/${name}/agent-app`;
	expect((await app.fetch(url, { method: "POST" })).status).toBe(401);
	expect(open).not.toHaveBeenCalled();
	expect((await app.request("/api/p/unknown/agent-app", { method: "POST" })).status).toBe(404);
	expect((await app.request(url)).status).toBe(200);
	const response = await app.request(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ root: "/unrelated" }),
	});
	expect(response.status).toBe(204);
	expect(open).toHaveBeenCalledExactlyOnceWith(root);
	open.mockRejectedValue(new Error("No app"));
	expect((await app.request(url, { method: "POST" })).status).toBe(409);
});

it("remembers the introduction across projects and daemon restarts without writing into either project", () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const first = makeProject(spoolDir);
	const second = makeProject(spoolDir);
	const store = createSettingsStore(spoolDir);
	expect(store.write("agent.introductionSeen", true).ok).toBe(true);
	const restarted = createSettingsStore(spoolDir);
	for (const { root } of [first, second]) {
		expect(restarted.read(root).entries.find((entry) => entry.key === "agent.introductionSeen")).toMatchObject({
			value: true,
			scope: "machine",
			source: "file",
		});
	}
});
