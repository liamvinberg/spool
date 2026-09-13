import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { fakeOpeners, spool, spoolAsync } from "./cli-test-helpers";
import { serveDaemon } from "./daemon/server";
import { makeTempDir, markProject } from "./test-helpers";

// Each case runs the real CLI in an isolated home. Separate files let CI share the process startup work.
describe("spool cli projects", { timeout: 30_000 }, () => {
	it("init scaffolds, registers, announces history and prints the root-config pointer", () => {
		const home = makeTempDir();
		const target = makeTempDir();

		const result = spool(["init", target], home);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`initialized spool project at ${realpathSync(target)}`);
		// #78: history is never silent, and the line says how to turn it on
		expect(result.stdout).toContain("history is off");
		expect(result.stdout).toContain('"history": true');
		expect(result.stdout).toContain("design/ is a spool canvas");
		expect(JSON.parse(readFileSync(join(target, "design", "canvas.json"), "utf8")).history).toBe(false);
		const registry = JSON.parse(readFileSync(join(home, ".spool", "registry.json"), "utf8"));
		expect(registry.projects[0].root).toBe(realpathSync(target));
	});

	it("init --history starts a project spool commits for", () => {
		const home = makeTempDir();
		const target = makeTempDir();

		const result = spool(["init", "--history", target], home);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("history is on");
		expect(JSON.parse(readFileSync(join(target, "design", "canvas.json"), "utf8")).history).toBe(true);
	});

	it("open resolves by walk-up from the cwd", () => {
		const home = makeTempDir();
		const repo = makeTempDir();
		markProject(repo);
		const nested = join(repo, "src");
		mkdirSync(nested);

		const result = spool(["open"], home, nested);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(realpathSync(repo));
	});

	it("bare spool registers the project, opens its tab, and prints the canvas url", async () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const repo = makeTempDir();
		markProject(repo);
		const nested = join(repo, "src");
		mkdirSync(nested);
		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());

		const result = await spoolAsync([], home, nested);

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`canvas: ${daemon.url}/p/${basename(realpathSync(repo))}\n`);
		expect(JSON.parse(readFileSync(join(spoolDir, "registry.json"), "utf8")).projects).toMatchObject([
			{ root: realpathSync(repo) },
		]);
		expect(JSON.parse(readFileSync(join(spoolDir, "session.json"), "utf8"))).toMatchObject({
			open: [realpathSync(repo)],
		});
	});

	/**
	 * A bare `spool` from an agent's shell or a script is exactly what it always
	 * was: the url printed, nothing opened (#239). Storybook shipped auto-open
	 * unguarded and is walking it back; the guard is the whole point.
	 */
	it("bare spool opens no browser when stdin is not a terminal", async () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const repo = makeTempDir();
		markProject(repo);
		const openers = fakeOpeners();
		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());

		const result = await spoolAsync([], home, repo, { PATH: openers.path });

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`canvas: ${daemon.url}/p/${basename(realpathSync(repo))}\n`);
		expect(openers.launched()).toEqual([]);
	});

	it("--no-open is the bare verb with the browser left alone", async () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const repo = makeTempDir();
		markProject(repo);
		const openers = fakeOpeners();
		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());

		const result = await spoolAsync(["--no-open"], home, repo, { PATH: openers.path });

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`canvas: ${daemon.url}/p/${basename(realpathSync(repo))}\n`);
		expect(openers.launched()).toEqual([]);
		expect(JSON.parse(readFileSync(join(spoolDir, "registry.json"), "utf8")).projects).toMatchObject([
			{ root: realpathSync(repo) },
		]);
	});

	it("names the opt-out in help, where someone can find it", () => {
		const result = spool(["--help"], makeTempDir());

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("--no-open");
	});

	it("bare spool outside a project points at init and scaffolds nothing", async () => {
		const home = makeTempDir();
		const elsewhere = makeTempDir();

		const result = await spoolAsync([], home, elsewhere);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("run `spool init`");
		expect(existsSync(join(elsewhere, "design"))).toBe(false);
		expect(existsSync(join(home, ".spool"))).toBe(false);
	});

	it("remove forgets a live project without deleting its files", () => {
		const home = makeTempDir();
		const project = makeTempDir();
		spool(["init", project], home);

		const result = spool(["remove", project], home);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`removed ${realpathSync(project)}`);
		expect(existsSync(join(project, "design", "canvas.json"))).toBe(true);
		expect(JSON.parse(readFileSync(join(home, ".spool", "registry.json"), "utf8")).projects).toEqual([]);
	});

	it("remove forgets an absolute registered root after its folder vanished", () => {
		const home = makeTempDir();
		const project = makeTempDir();
		spool(["init", project], home);
		const registeredRoot = realpathSync(project);
		rmSync(project, { recursive: true });

		const result = spool(["remove", registeredRoot], home);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`removed ${registeredRoot}`);
		expect(JSON.parse(readFileSync(join(home, ".spool", "registry.json"), "utf8")).projects).toEqual([]);
	});

	it("remove treats an unknown root as an honest goal-state success", () => {
		const project = makeTempDir();

		const result = spool(["remove", project], makeTempDir());

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`${realpathSync(project)} was not registered`);
	});

	it("remove leaves an ancestor registered when its nested path is named", () => {
		const home = makeTempDir();
		const project = makeTempDir();
		const nested = join(project, "src");
		mkdirSync(nested);
		spool(["init", project], home);

		const result = spool(["remove", nested], home);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`${realpathSync(nested)} was not registered`);
		expect(JSON.parse(readFileSync(join(home, ".spool", "registry.json"), "utf8")).projects).toMatchObject([
			{ root: realpathSync(project) },
		]);
	});

	it("open registers a project again after remove", () => {
		const home = makeTempDir();
		const project = makeTempDir();
		spool(["init", project], home);
		expect(spool(["remove", project], home).status).toBe(0);

		const result = spool(["open", project], home);

		expect(result.status).toBe(0);
		expect(JSON.parse(readFileSync(join(home, ".spool", "registry.json"), "utf8")).projects).toMatchObject([
			{ root: realpathSync(project) },
		]);
	});

	it("remove prunes the project from the machine session", () => {
		const home = makeTempDir();
		const project = makeTempDir();
		const other = makeTempDir();
		spool(["init", project], home);
		spool(["init", other], home);
		writeFileSync(
			join(home, ".spool", "session.json"),
			JSON.stringify({ open: [realpathSync(project), realpathSync(other)] }),
		);

		const result = spool(["remove", project], home);

		expect(result.status).toBe(0);
		expect(JSON.parse(readFileSync(join(home, ".spool", "session.json"), "utf8"))).toEqual({
			open: [realpathSync(other)],
		});
	});

	it("remove prunes an unknown project left open in the machine session", () => {
		const home = makeTempDir();
		const project = realpathSync(makeTempDir());
		mkdirSync(join(home, ".spool"));
		writeFileSync(join(home, ".spool", "session.json"), JSON.stringify({ open: [project] }));

		const result = spool(["remove", project], home);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`${project} was not registered`);
		expect(JSON.parse(readFileSync(join(home, ".spool", "session.json"), "utf8"))).toEqual({ open: [] });
	});
});
