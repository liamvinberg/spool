import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { registerProject } from "../registry";
import { makeTempDir, markProject } from "../test-helpers";
import { type FindingDeps, findOpenable } from "./open-finding";

function world(overrides: Partial<FindingDeps> = {}) {
	const home = realpathSync(makeTempDir());
	const spoolDir = join(home, ".spool");
	mkdirSync(spoolDir);
	const deps: FindingDeps = {
		spoolDir,
		home,
		location: join(home, "spool"),
		origin: "https://spool.page",
		team: async () => "missing",
		remote: async () => undefined,
		...overrides,
	};
	return { home, deps, find: (given: string) => findOpenable(given, deps) };
}

const git = (cwd: string, ...args: string[]) =>
	execFileSync("git", args, { cwd, env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined } });

it("opens a project from its folder or from anything inside it, however the path was written", async () => {
	const { home, find } = world();
	const kaffe = join(home, "spool", "kaffe bar");
	markProject(kaffe);
	mkdirSync(join(kaffe, "design", "frames", "cart"), { recursive: true });
	writeFileSync(join(kaffe, "design", "frames", "cart", "frame.tsx"), "");
	const opens = { kind: "project", root: kaffe, name: "kaffe bar" };
	expect(await find(kaffe)).toEqual(opens);
	expect(await find("~/spool/kaffe bar/")).toEqual(opens);
	expect(await find(`file://${kaffe.replaceAll(" ", "%20")}/design/frames/`)).toEqual(opens);
	expect(await find(` "${join(kaffe, "design", "frames", "cart", "frame.tsx")}" `)).toEqual(opens);
});

it("offers to design in a folder: at the top of its checkout beside the code, or inside a plain one", async () => {
	const { home, find } = world();
	const kvitt = join(home, "code", "kvitt");
	mkdirSync(join(kvitt, "app"), { recursive: true });
	writeFileSync(join(kvitt, "package.json"), "{}");
	git(kvitt, "init", "-q", "-b", "main");
	expect(await find(join(kvitt, "app"))).toEqual({
		kind: "folder",
		path: kvitt,
		name: "kvitt",
		code: true,
		branch: "main",
		items: 2,
	});
	const moodboard = join(home, "Desktop", "moodboard");
	mkdirSync(moodboard, { recursive: true });
	for (const n of [1, 2, 3]) writeFileSync(join(moodboard, `ferry-${n}.jpg`), "");
	expect(await find(moodboard)).toMatchObject({
		kind: "folder",
		path: moodboard,
		code: false,
		branch: null,
		items: 3,
	});
	mkdirSync(join(moodboard, "design"));
	expect(await find(moodboard)).toMatchObject({ kind: "nothing", says: expect.stringContaining("isn't spool's") });
	expect(await find(home)).toMatchObject({ kind: "nothing" });
});

it("imports a .spool file into the projects location, and says plainly when nothing is at a path", async () => {
	const { home, find } = world();
	writeFileSync(join(home, "kaffe-menu.spool"), "zip");
	expect(await find(join(home, "kaffe-menu.spool"))).toEqual({
		kind: "file",
		path: join(home, "kaffe-menu.spool"),
		name: "kaffe-menu.spool",
		bytes: 3,
		into: join(home, "spool"),
	});
	expect(await find(join(home, "gone.spool"))).toEqual({ kind: "nothing", says: "There is no file at this path." });
	expect(await find("~/nowhere")).toEqual({ kind: "nothing", says: "There is no folder at this path." });
	writeFileSync(join(home, "notes.txt"), "");
	expect(await find(join(home, "notes.txt"))).toMatchObject({ kind: "nothing" });
	expect(await find("a coffee shop")).toMatchObject({ kind: "nothing" });
});

it("clones a git link that answers into the projects location, and reads a clone already there", async () => {
	const asked: string[] = [];
	const { home, find } = world({
		remote: async (url) => {
			asked.push(url);
			return url.includes("tide-tables") ? { branch: "main" } : undefined;
		},
	});
	const repo = {
		kind: "repo",
		url: "https://github.com/tidemark/tide-tables",
		name: "tide-tables",
		repo: "github.com/tidemark/tide-tables",
		branch: "main",
		into: join(home, "spool", "tide-tables"),
	};
	expect(await find("https://github.com/tidemark/tide-tables/tree/main/src")).toEqual(repo);
	expect(await find("github.com/tidemark/tide-tables.git")).toEqual(repo);
	expect(await find("git@github.com:tidemark/tide-tables.git")).toMatchObject({
		kind: "repo",
		url: "git@github.com:tidemark/tide-tables.git",
		into: repo.into,
	});
	expect(await find("https://github.com/tidemark/tide-table")).toEqual({
		kind: "nothing",
		says: "Nothing answers at this link.",
	});
	expect(await find("https://example.com/somewhere")).toEqual({
		kind: "nothing",
		says: "Nothing answers at this link.",
	});

	// a folder of that name from another repo is left alone; the clone already there is read as a folder
	mkdirSync(repo.into, { recursive: true });
	expect(await find(repo.url)).toMatchObject({ kind: "repo", into: `${repo.into}-2` });
	git(repo.into, "init", "-q", "-b", "main");
	git(repo.into, "remote", "add", "origin", "git@github.com:tidemark/tide-tables.git");
	const before = asked.length;
	expect(await find(repo.url)).toMatchObject({ kind: "folder", path: repo.into, code: true });
	expect(asked.length).toBe(before);
});

it("opens a team's project from its spool.page link: this Mac's copy, or one to get when this account edits it", async () => {
	const standings: Record<string, "editor" | "viewer" | "missing" | "signed-out"> = {
		"tidemark/tidemark-app": "editor",
		"tidemark/pitch": "viewer",
		"tidemark/gone": "missing",
		"other/thing": "signed-out",
	};
	const { home, deps, find } = world({ team: async (team, project) => standings[`${team}/${project}`] ?? "missing" });
	expect(await find("https://spool.page/tidemark/tidemark-app")).toEqual({
		kind: "team",
		team: "tidemark",
		project: "tidemark-app",
		url: "https://spool.page/tidemark/tidemark-app",
		checkout: null,
	});
	expect(await find("spool.page/tidemark/pitch/")).toMatchObject({
		kind: "nothing",
		says: expect.stringContaining("view"),
	});
	expect(await find("https://spool.page/tidemark/gone")).toEqual({
		kind: "nothing",
		says: "Nothing answers at this link.",
	});
	expect(await find("https://spool.page/other/thing")).toMatchObject({
		kind: "nothing",
		says: expect.stringContaining("Sign in"),
	});

	const onboarding = join(home, "spool", "tidemark", "onboarding");
	markProject(onboarding);
	writeFileSync(join(onboarding, "spool.json"), JSON.stringify({ project: "https://spool.page/tidemark/onboarding" }));
	registerProject(deps.spoolDir, onboarding);
	expect(await find("https://spool.page/tidemark/onboarding")).toEqual({
		kind: "project",
		root: onboarding,
		name: "onboarding",
	});

	// a checkout holding the team project's spool.json, its design/ not fetched yet
	const checkout = join(home, "code", "tidemark-app");
	mkdirSync(join(checkout, "src"), { recursive: true });
	writeFileSync(join(checkout, "spool.json"), JSON.stringify({ project: "https://spool.page/tidemark/tidemark-app" }));
	expect(await find(join(checkout, "src"))).toMatchObject({ kind: "team", project: "tidemark-app", checkout });
});
