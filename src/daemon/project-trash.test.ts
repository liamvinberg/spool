import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as systemTrash from "trash";
import { expect, it, onTestFinished, vi } from "vitest";
import { initProject } from "../init";
import * as registry from "../registry";
import { readRegistry } from "../registry";
import { fixtureAgentExecutor, makeApp, makeProject, makeTempDir, sseReader, until } from "../test-helpers";
import { readSession } from "./session";

vi.mock("trash", () => ({ default: vi.fn() }));

const post = (body: unknown): RequestInit => ({
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify(body),
});

it("moves the whole folder before forgetting it, closes its tab and tells other windows", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const kept = makeProject(spoolDir);
	const gone = makeProject(spoolDir);
	writeFileSync(join(gone.root, "outside-design.txt"), "keep me recoverable");
	const destination = join(makeTempDir(), "trashed-project");
	const moveToTrash = vi.fn(async (paths: string[]) => {
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toContain(gone.root);
		expect(readSession(spoolDir).open).toContain(gone.root);
		for (const path of paths) renameSync(path, destination);
	});
	const app = makeApp(spoolDir, { moveToTrash });
	const controller = new AbortController();
	onTestFinished(() => controller.abort());
	const events = sseReader(await app.request("/api/events", { signal: controller.signal }));
	expect((await events.next()).event).toBe("hello");

	expect((await app.request("/api/projects/trash", post({ root: gone.root }))).status).toBe(204);
	expect(moveToTrash).toHaveBeenCalledExactlyOnceWith([gone.root]);
	expect(existsSync(gone.root)).toBe(false);
	expect(readFileSync(join(destination, "outside-design.txt"), "utf8")).toBe("keep me recoverable");
	expect(existsSync(join(destination, "design", "canvas.json"))).toBe(true);
	expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([kept.root]);
	expect(readSession(spoolDir).open).toEqual([kept.root]);
	expect(await events.next()).toEqual({ event: "app", data: { kind: "registry" } });
	expect(await events.next()).toEqual({ event: "app", data: { kind: "session" } });
});

it("keeps a failed move registered and open, then permits a retry", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root } = makeProject(spoolDir);
	const moveToTrash = vi
		.fn<(paths: string[]) => Promise<void>>()
		.mockRejectedValueOnce(new Error("Trash unavailable"));
	const app = makeApp(spoolDir, { moveToTrash });
	const registry = readRegistry(spoolDir);
	const session = readSession(spoolDir);
	const response = await app.request("/api/projects/trash", post({ root }));
	expect(response.status).toBe(409);
	expect(await response.json()).toEqual({ error: "Could not trash the project: Trash unavailable" });
	expect(readRegistry(spoolDir)).toEqual(registry);
	expect(readSession(spoolDir)).toEqual(session);
	expect(existsSync(root)).toBe(true);
	moveToTrash.mockResolvedValueOnce();
	expect((await app.request("/api/projects/trash", post({ root }))).status).toBe(204);
});

it("reports when the folder moved but removing its listing failed", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root } = makeProject(spoolDir);
	const destination = join(makeTempDir(), "trashed-project");
	const app = makeApp(spoolDir, { moveToTrash: async () => renameSync(root, destination) });
	const forget = vi.spyOn(registry, "forgetResolvedProject").mockImplementation(() => {
		throw new Error("Registry is read-only");
	});
	onTestFinished(() => forget.mockRestore());
	const response = await app.request("/api/projects/trash", post({ root }));
	expect(response.status).toBe(409);
	expect(await response.json()).toMatchObject({ error: expect.stringContaining("The folder moved to the trash") });
	expect(existsSync(destination)).toBe(true);
	expect(existsSync(root)).toBe(false);
});

it.each([null, {}, { root: "" }, { root: 4 }])("rejects malformed requests: %j", async (body) => {
	const moveToTrash = vi.fn();
	const app = makeApp(join(makeTempDir(), ".spool"), { moveToTrash });
	expect((await app.request("/api/projects/trash", post(body))).status).toBe(400);
	expect(moveToTrash).not.toHaveBeenCalled();
});

it("requires app control and an exact registered root", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root } = makeProject(spoolDir);
	const moveToTrash = vi.fn();
	const app = makeApp(spoolDir, { moveToTrash });
	expect((await app.fetch("/api/projects/trash", post({ root }))).status).toBe(401);
	expect((await app.request("/api/projects/trash", post({ root: join(root, "design") }))).status).toBe(404);
	expect(moveToTrash).not.toHaveBeenCalled();
});

it("does not follow a replacement symlink or silently hide a missing folder", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root } = makeProject(spoolDir);
	const other = makeProject(spoolDir);
	const moveToTrash = vi.fn();
	const app = makeApp(spoolDir, { moveToTrash });
	rmSync(root, { recursive: true });
	expect((await app.request("/api/projects/trash", post({ root }))).status).toBe(409);
	symlinkSync(other.root, root, "dir");
	expect((await app.request("/api/projects/trash", post({ root }))).status).toBe(409);
	expect(moveToTrash).not.toHaveBeenCalled();
	expect(readRegistry(spoolDir).projects.map((project) => project.root)).toContain(root);
});

it("protects folders containing another registered project or Spool's app data", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root } = makeProject(spoolDir);
	const nested = join(root, "nested");
	mkdirSync(nested);
	initProject(nested, spoolDir);
	const moveToTrash = vi.fn();
	const app = makeApp(spoolDir, { moveToTrash });
	expect((await app.request("/api/projects/trash", post({ root }))).status).toBe(409);
	const containing = makeTempDir();
	const stateInside = join(containing, ".spool");
	const project = initProject(containing, stateInside);
	const insideApp = makeApp(stateInside, { moveToTrash });
	expect((await insideApp.request("/api/projects/trash", post({ root: project.root }))).status).toBe(409);
	expect(moveToTrash).not.toHaveBeenCalled();
});

it("rejects a duplicate trash and a rename while the operating system is still moving the folder", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	let finish: (() => void) | undefined;
	const moveToTrash = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	const app = makeApp(spoolDir, { moveToTrash });
	const pending = app.request("/api/projects/trash", post({ root }));
	await until(() => moveToTrash.mock.calls.length === 1);
	expect((await app.request("/api/projects/trash", post({ root }))).status).toBe(409);
	expect((await app.request("/api/projects/rename", post({ root, name: "renamed" }))).status).toBe(409);
	expect((await app.request(`/api/p/${name}/frames`)).status).toBe(409);
	finish?.();
	expect((await pending).status).toBe(204);
	expect(moveToTrash).toHaveBeenCalledOnce();
});

it("waits for an active agent before trashing its working folder", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	const agent = fixtureAgentExecutor(() => {});
	const moveToTrash = vi.fn();
	const app = makeApp(spoolDir, { moveToTrash, agentExecutor: agent.executor });
	const turn = await app.request(
		`/api/p/${name}/agent/turn`,
		post({
			thread: "12345678-1234-4234-8234-123456789012",
			said: [{ prompt: "Design a home" }],
		}),
	);
	await until(() => (agent.spawned[0]?.inputs.length ?? 0) > 0);
	const response = await app.request("/api/projects/trash", post({ root }));
	expect(response.status).toBe(409);
	expect(await response.json()).toMatchObject({ error: expect.stringContaining("agent finish") });
	expect(moveToTrash).not.toHaveBeenCalled();
	await turn.body?.cancel();
});

it("sends literal folder paths to the native trash without expanding wildcard characters", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const directory = join(makeTempDir(), "project[1]");
	mkdirSync(directory);
	const { root } = initProject(directory, spoolDir);
	const nativeTrash = vi.mocked(systemTrash.default).mockResolvedValue();
	const app = makeApp(spoolDir);
	expect((await app.request("/api/projects/trash", post({ root }))).status).toBe(204);
	expect(nativeTrash).toHaveBeenCalledExactlyOnceWith([root], { glob: false });
});
