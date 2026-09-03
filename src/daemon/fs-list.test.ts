import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../init";
import { makeTempDir } from "../test-helpers";
import { refreshIndex, searchDirectories } from "./fs-list";

/** A home to search: every path is a directory, `#` marks a spool project. */
function makeHome(paths: readonly string[]): string {
	const home = makeTempDir();
	for (const path of paths) {
		const project = path.endsWith("#");
		const full = join(home, project ? path.slice(0, -1) : path);
		mkdirSync(full, { recursive: true });
		if (!project) continue;
		mkdirSync(join(full, "design"), { recursive: true });
		writeFileSync(join(full, "design", "canvas.json"), JSON.stringify({ version: 1 }));
	}
	return home;
}

const names = (found: Awaited<ReturnType<typeof searchDirectories>>): string[] =>
	(found?.hits ?? []).map((hit) => hit.name);

describe("searchDirectories", () => {
	it("reaches a folder three levels down that browsing needs three clicks for", async () => {
		const home = makeHome(["personal/projects/gym-brute#", "Downloads", "work/clients/inwall"]);
		const found = await searchDirectories("gymbrute", { home, spoolDir: join(makeTempDir(), ".spool") });

		expect(names(found)).toEqual(["gym-brute"]);
		expect(found?.hits[0]?.path).toBe(join(realpathSync(home), "personal/projects/gym-brute"));
		expect(found?.hits[0]?.parent).toBe(join(realpathSync(home), "personal/projects"));
		expect(found?.hits[0]?.isProject).toBe(true);
	});

	it("reads a seam the same however the machine spells it", async () => {
		const home = makeHome(["work/clients/gym_brute_api", "notes/gymnasium-brutalism"]);
		expect(names(await searchDirectories("brute", { home, spoolDir: join(makeTempDir(), ".spool") }))[0]).toBe(
			"gym_brute_api",
		);
	});

	it("puts a spool project above the plain folder it ties with, then the shallower one", async () => {
		const home = makeHome(["a/kaffe", "kaffe#", "deep/deeper/deepest/kaffe"]);
		const found = await searchDirectories("kaffe", { home, spoolDir: join(makeTempDir(), ".spool") });

		const real = realpathSync(home);
		expect(found?.hits.map((hit) => hit.path)).toEqual([
			join(real, "kaffe"),
			join(real, "a/kaffe"),
			join(real, "deep/deeper/deepest/kaffe"),
		]);
		expect(found?.hits[0]?.isProject).toBe(true);
	});

	it("answers a registered project with what the registry knows", async () => {
		const home = makeTempDir();
		const spoolDir = join(makeTempDir(), ".spool");
		const root = join(home, "projects", "kaffe");
		mkdirSync(root, { recursive: true });
		initProject(root, spoolDir);
		mkdirSync(join(root, "design", "frames", "checkout"), { recursive: true });
		writeFileSync(join(root, "design", "frames", "checkout", "frame.tsx"), "export default () => null\n");

		const found = await searchDirectories("kaffe", { home, spoolDir });
		expect(found?.hits[0]?.frames).toBe(1);
		expect(found?.hits[0]?.openedAt).toEqual(expect.any(String));
	});

	it("hides dotfolders and does not descend the folders nobody searches", async () => {
		const home = makeHome([".config/nvim", "app/node_modules/lodash", "app/dist/assets", "app/src"]);
		const found = await searchDirectories("s", { home, spoolDir: join(makeTempDir(), ".spool") });

		expect(names(found)).toContain("src");
		// a project can be named `build` or `vendor`, so the folder is listed — what is
		// under it is what nobody is searching for
		expect(names(await searchDirectories("dist", { home, spoolDir: join(makeTempDir(), ".spool") }))).toEqual([
			"dist",
		]);
		expect(names(found)).not.toContain("assets");
		expect(names(found)).not.toContain("lodash");
		expect(names(found)).not.toContain("nvim");
		// app, node_modules, dist, src — and nothing from inside the two never entered
		expect(found?.total).toBe(4);
	});

	it("stops at the depth cap rather than walking a home to the bottom", async () => {
		const home = makeHome(["a/b/c/d/e/f/g/deepest"]);
		expect(names(await searchDirectories("deepest", { home, spoolDir: join(makeTempDir(), ".spool") }))).toEqual([]);
	});

	it("is nothing at all for an empty query: that is the browse, not a search", async () => {
		const home = makeHome(["personal/projects/gym-brute#"]);
		expect(await searchDirectories("  ", { home, spoolDir: join(makeTempDir(), ".spool") })).toMatchObject({
			hits: [],
		});
	});

	it("stands its index until asked to walk again rather than watching a home directory", async () => {
		const home = makeHome(["projects/kaffe"]);
		const spoolDir = join(makeTempDir(), ".spool");

		await searchDirectories("kaffe", { home, spoolDir });
		mkdirSync(join(home, "projects", "ruter"));
		expect(names(await searchDirectories("ruter", { home, spoolDir }))).toEqual([]);

		await refreshIndex({ home, spoolDir });
		expect(names(await searchDirectories("ruter", { home, spoolDir }))).toEqual(["ruter"]);
	});

	it("shares one walk between everyone who asks while it runs", async () => {
		const home = makeHome(["projects/kaffe"]);
		const spoolDir = join(makeTempDir(), ".spool");

		const first = refreshIndex({ home, spoolDir });
		expect(refreshIndex({ home, spoolDir })).toBe(first);
		await first;
		expect(refreshIndex({ home, spoolDir })).not.toBe(first);
	});

	it("answers under the folder asked for, out of the same index", async () => {
		const home = makeHome(["work/clients/kaffe-api", "personal/projects/kaffe#", "personal/kaffe-notes"]);
		const spoolDir = join(makeTempDir(), ".spool");
		const real = realpathSync(home);

		const under = await searchDirectories("kaffe", { home, spoolDir, under: join(home, "personal") });
		expect(under?.hits.map((hit) => hit.path)).toEqual([
			join(real, "personal/projects/kaffe"),
			join(real, "personal/kaffe-notes"),
		]);
		// projects, kaffe, its design, kaffe-notes: the count is the folder's, not home's
		expect(under?.total).toBe(4);

		const everywhere = await searchDirectories("kaffe", { home, spoolDir });
		expect(names(everywhere)).toEqual(["kaffe", "kaffe-notes", "kaffe-api"]);
	});

	it("answers nothing at all for a folder outside home", async () => {
		const home = makeHome(["projects/kaffe"]);
		const elsewhere = makeTempDir();
		mkdirSync(join(elsewhere, "kaffe"));
		expect(
			await searchDirectories("kaffe", { home, spoolDir: join(makeTempDir(), ".spool"), under: elsewhere }),
		).toBe(undefined);
	});

	it("never follows a symlink out of home", async () => {
		const outside = makeTempDir();
		mkdirSync(join(outside, "secret-elsewhere"), { recursive: true });
		const home = makeHome(["personal"]);
		symlinkSync(outside, join(home, "personal", "escape"));

		const found = await searchDirectories("elsewhere", { home, spoolDir: join(makeTempDir(), ".spool") });
		expect(found?.hits).toEqual([]);
		expect(names(await searchDirectories("escape", { home, spoolDir: join(makeTempDir(), ".spool") }))).toEqual([]);
	});

	it("follows a symlink that stays inside home, once", async () => {
		const home = makeHome(["projects/kaffe", "shortcuts"]);
		symlinkSync(join(home, "projects"), join(home, "shortcuts", "projects"));

		const found = await searchDirectories("kaffe", { home, spoolDir: join(makeTempDir(), ".spool") });
		expect(names(found)).toEqual(["kaffe"]);
	});
});
