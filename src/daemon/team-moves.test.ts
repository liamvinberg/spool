import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initProject, initTeamProject } from "../init";
import { openProject } from "../open";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { makeApp, makeTempDir, until, writeFrame } from "../test-helpers";
import { commitMoveIn, MOVE_MESSAGE } from "./history";
import { createSettingsStore } from "./settings";

/**
 * "Get it" and "Move to team…" as an editor sees them: a team project put on a Mac in each of the three places, and
 * an existing project moved into the team with its one commit, which a teammate then pulls. Assertions are on disk,
 * on git and on what reached the team.
 */

/** Clones carry no config, so every commit here names its author through the environment, as a bare CI runner needs. */
const IDENTITY = {
	GIT_AUTHOR_NAME: "Hands",
	GIT_AUTHOR_EMAIL: "hands@example.test",
	GIT_COMMITTER_NAME: "Hands",
	GIT_COMMITTER_EMAIL: "hands@example.test",
};

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...IDENTITY } }).trim();
}

/** A fresh repository with a folder named for the project, as a product checkout is. */
function repo(name = "app", origin?: string): string {
	const root = join(makeTempDir(), name);
	mkdirSync(root);
	git(root, "init", "--quiet", "--initial-branch=main", ".");
	git(root, "config", "user.email", "hands@example.test");
	git(root, "config", "user.name", "Hands");
	git(root, "config", "commit.gpgsign", "false");
	if (origin !== undefined) git(root, "remote", "add", "origin", origin);
	return realpathSync(root);
}

function status(root: string): string[] {
	return git(root, "status", "--porcelain", "--untracked-files=all").split("\n").filter(Boolean);
}

const text = (root: string, path: string) =>
	existsSync(join(root, "design", path)) ? readFileSync(join(root, "design", path), "utf8") : undefined;

const json = { "content-type": "application/json", origin: "http://localhost:7766" };

/** A daemon for one person on one Mac, against the fake team, with its projects location somewhere temporary. */
function daemonFor(machine: ReturnType<ReturnType<typeof fakeTeam>["machine"]>, state = join(makeTempDir(), ".spool")) {
	const location = join(makeTempDir(), "spool");
	mkdirSync(state, { recursive: true });
	createSettingsStore(state).write("projects.location", location);
	const daemon = makeApp(state, {
		teamSyncServices: { ...machine.services, notice: () => {} },
		cloudTeamsRequest: machine.request,
	});
	const post = (path: string, body: unknown) =>
		daemon.controlRequest(`/api/cloud${path}`, { method: "POST", headers: json, body: JSON.stringify(body) });
	return { daemon, state, location, post };
}

/** Ana starts the team project in her checkout of github.com/devosurf/app and commits its spool.json. */
async function anaStarts(cloud: ReturnType<typeof fakeTeam>) {
	const ana = cloud.machine("ana");
	const state = join(makeTempDir(), ".spool");
	const { root } = await initTeamProject(repo("app", "git@github.com:Devosurf/app.git"), state, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: ana.request,
		openSocket: ana.openSocket,
	});
	git(root, "add", "spool.json");
	git(root, "commit", "--quiet", "-m", "spool: a team project");
	writeFrame(root, "home", "export default () => <h1>Home</h1>;\n");
	const daemon = makeApp(state, {
		teamSyncServices: { ...ana.services, notice: () => {} },
		cloudTeamsRequest: ana.request,
	});
	await until(() => cloud.file("app", "frames/home/frame.tsx")?.includes("Home") === true, 10_000);
	return { root, state, daemon };
}

/** Ben's clone of Ana's repo, its origin in the https form, known on his Mac by a solo project he keeps in it. */
function bensClone(from: string, state: string): string {
	const checkout = realpathSync(makeTempDir());
	git(checkout, "clone", "--quiet", from, "app");
	const clone = join(checkout, "app");
	git(clone, "remote", "set-url", "origin", "https://github.com/devosurf/app.git");
	mkdirSync(join(clone, "docs"));
	initProject(join(clone, "docs"), state);
	git(clone, "add", "docs");
	git(clone, "commit", "--quiet", "-m", "docs");
	return clone;
}

/** A local copy that works: registered, shown as the project's copy, and in step with the team both ways. */
async function works(
	cloud: ReturnType<typeof fakeTeam>,
	ana: string,
	root: string,
	daemon: ReturnType<typeof makeApp>,
) {
	const listed = (await (await daemon.controlRequest("/api/cloud/teams/devosurf/projects")).json()) as {
		projects: { copies: string[] }[];
	};
	expect(listed.projects[0]?.copies).toEqual([root]);
	// macOS restarts its one stream of folder events for every new watch, and drops what lands meanwhile
	await new Promise((resolve) => setTimeout(resolve, 1_000));
	writeFrame(ana, "news", "export default () => <h1>News</h1>;\n");
	await until(() => text(root, "frames/news/frame.tsx")?.includes("News") === true, 10_000);
	writeFrame(root, "from-ben", "export default () => <h1>Ben</h1>;\n");
	await until(() => cloud.file("app", "frames/from-ben/frame.tsx")?.includes("Ben") === true, 10_000);
	await until(() => text(ana, "frames/from-ben/frame.tsx") !== undefined, 10_000);
}

describe("Get it", () => {
	it("records the repo the project was started in, from its origin", { timeout: 30_000 }, async () => {
		const cloud = fakeTeam();
		await anaStarts(cloud);
		expect(cloud.repo("app")).toBe("github.com/devosurf/app");
	});

	it("lists the team's projects with their repo, its clone command, and the checkouts here that hold it", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = await anaStarts(cloud);
		const ben = daemonFor(cloud.machine("ben"));
		const clone = bensClone(ana.root, ben.state);
		const listed = (await (await ben.daemon.controlRequest("/api/cloud/teams/devosurf/projects")).json()) as {
			projects: unknown[];
		};
		expect(listed.projects).toEqual([
			{
				name: "app",
				url: `${TEAM_ORIGIN}/devosurf/app`,
				repo: "github.com/devosurf/app",
				clone: "git clone https://github.com/devosurf/app.git",
				copies: [],
				checkouts: [clone],
				home: join(ben.location, "devosurf", "app"),
			},
		]);
	});

	it("puts it in a known checkout, where its tracked spool.json is, as a working local copy", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = await anaStarts(cloud);
		const ben = daemonFor(cloud.machine("ben"));
		const clone = bensClone(ana.root, ben.state);

		const got = await ben.post("/teams/devosurf/projects/app/get", { where: "checkout", path: clone });
		expect(got.status, await got.clone().text()).toBe(200);
		expect(await got.json()).toEqual({ root: clone, name: "app" });
		expect(text(clone, "frames/home/frame.tsx")).toContain("Home");
		expect(status(clone)).toEqual([]);
		await works(cloud, ana.root, clone, ben.daemon);
	});

	it("puts it in a folder picked by hand, beside a new spool.json", { timeout: 30_000 }, async () => {
		const cloud = fakeTeam();
		const ana = await anaStarts(cloud);
		const ben = daemonFor(cloud.machine("ben"));
		const picked = realpathSync(makeTempDir());

		const got = await ben.post("/teams/devosurf/projects/app/get", { where: "checkout", path: picked });
		expect(got.status, await got.clone().text()).toBe(200);
		expect(JSON.parse(readFileSync(join(picked, "spool.json"), "utf8"))).toEqual({
			project: `${TEAM_ORIGIN}/devosurf/app`,
		});
		expect(text(picked, "canvas.json")).toBe(text(ana.root, "canvas.json"));
		await works(cloud, ana.root, picked, ben.daemon);
	});

	it("puts it just on this Mac, under the projects location by team and project", { timeout: 30_000 }, async () => {
		const cloud = fakeTeam();
		const ana = await anaStarts(cloud);
		const ben = daemonFor(cloud.machine("ben"));

		const got = await ben.post("/teams/devosurf/projects/app/get", { where: "mac" });
		expect(got.status, await got.clone().text()).toBe(200);
		const home = join(realpathSync(ben.location), "devosurf", "app");
		expect(await got.json()).toEqual({ root: home, name: "app" });
		expect(text(home, "frames/home/frame.tsx")).toContain("Home");
		await works(cloud, ana.root, home, ben.daemon);
	});

	it("is a viewer's once they're made an editor, and leaves nothing behind before", { timeout: 30_000 }, async () => {
		const cloud = fakeTeam();
		await anaStarts(cloud);
		const vera = daemonFor(cloud.machine("vera", "viewer"));
		const refused = await vera.post("/teams/devosurf/projects/app/get", { where: "mac" });
		expect(refused.status).toBe(409);
		expect(((await refused.json()) as { error: string }).error).toContain("viewer of devosurf");
		expect(existsSync(join(vera.location, "devosurf"))).toBe(false);

		cloud.role("vera", "editor");
		const got = await vera.post("/teams/devosurf/projects/app/get", { where: "mac" });
		expect(got.status, await got.clone().text()).toBe(200);
		expect(text(join(realpathSync(vera.location), "devosurf", "app"), "frames/home/frame.tsx")).toContain("Home");
	});
});

/** Ana's existing project: design/ in git with history, a pushed remote, and hooks that would say if they ran. */
function existingProject() {
	const remote = join(makeTempDir(), "remote.git");
	git(makeTempDir(), "init", "--quiet", "--bare", "--initial-branch=main", remote);
	const root = repo("site", "git@github.com:devosurf/site.git");
	const state = join(makeTempDir(), ".spool");
	initProject(root, state, { history: true });
	writeFrame(root, "home", "export default () => <h1>Home</h1>;\n");
	writeFileSync(join(root, "README.md"), "# site\n");
	git(root, "add", "-A");
	git(root, "commit", "--quiet", "-m", "start");
	git(root, "remote", "add", "pushed", remote);
	git(root, "push", "--quiet", "pushed", "main");
	const ran = join(makeTempDir(), "hooks-ran");
	for (const hook of ["pre-commit", "commit-msg", "post-commit", "pre-push", "reference-transaction"]) {
		const file = join(root, ".git", "hooks", hook);
		writeFileSync(file, `#!/bin/sh\necho ${hook} >> "${ran}"\n`);
		chmodSync(file, 0o755);
	}
	return { root, state, remote, ran };
}

describe("Move to team", () => {
	it("uploads the whole folder, then makes exactly one commit taking design/ out of git, with no hook and no push", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const project = existingProject();
		const tracked = git(project.root, "ls-files", "design").split("\n");
		const before = git(project.root, "rev-parse", "HEAD");
		const daemon = makeApp(project.state, {
			teamSyncServices: { ...ana.services, notice: () => {} },
			cloudTeamsRequest: ana.request,
		});

		const moved = await daemon.controlRequest("/api/cloud/teams/devosurf/move", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ path: project.root }),
		});
		expect(moved.status, await moved.clone().text()).toBe(200);
		expect(await moved.json()).toEqual({ root: project.root, name: "site", commit: "committed" });

		// The team has every file that travels, as it is on disk.
		for (const path of tracked.map((file) => file.slice("design/".length)).filter((path) => path !== ".gitignore"))
			expect(cloud.file("site", path), path).toBe(text(project.root, path));
		expect(cloud.repo("site")).toBe("github.com/devosurf/site");

		// One commit, on main, on top of what was there: design/ out (files kept), spool.json in, nothing else.
		expect(git(project.root, "rev-list", "--count", `${before}..HEAD`)).toBe("1");
		expect(git(project.root, "rev-parse", "HEAD~1")).toBe(before);
		expect(git(project.root, "log", "-1", "--format=%s")).toBe(MOVE_MESSAGE);
		expect(git(project.root, "symbolic-ref", "--short", "HEAD")).toBe("main");
		const changes = git(project.root, "show", "--name-status", "--format=", "HEAD").split("\n").sort();
		expect(changes).toEqual([...tracked.map((file) => `D\t${file}`), "A\tspool.json"].sort());
		expect(git(project.root, "show", "HEAD:spool.json")).toBe(
			JSON.stringify({ project: `${TEAM_ORIGIN}/devosurf/site` }, null, "\t"),
		);
		for (const file of tracked.filter((file) => file !== "design/.gitignore"))
			expect(existsSync(join(project.root, file)), file).toBe(true);
		expect(readFileSync(join(project.root, "design/.gitignore"), "utf8")).toBe("*\n");
		expect(status(project.root)).toEqual([]);

		// History before the move stays in git; no hook ran, and nothing was pushed.
		expect(git(project.root, "ls-tree", "-r", "--name-only", "HEAD~1", "design")).toContain(
			"design/frames/home/frame.tsx",
		);
		expect(existsSync(project.ran)).toBe(false);
		expect(git(project.remote, "rev-parse", "main")).toBe(before);

		// It is a local copy now: a save reaches the team, and the daemon commits nothing more.
		writeFrame(project.root, "news", "export default () => <h1>News</h1>;\n");
		await until(() => cloud.file("site", "frames/news/frame.tsx")?.includes("News") === true, 10_000);
		expect(git(project.root, "rev-list", "--count", `${before}..HEAD`)).toBe("1");
	});

	it("waits out a merge before it commits", { timeout: 30_000 }, async () => {
		const project = existingProject();
		writeFileSync(join(project.root, "spool.json"), '{ "project": "https://cloud.test/devosurf/site" }\n');
		const merging = join(project.root, ".git", "MERGE_HEAD");
		writeFileSync(merging, `${git(project.root, "rev-parse", "HEAD")}\n`);
		let waited = 0;
		const commit = await commitMoveIn(project.root, {
			wait: async () => {
				waited += 1;
				expect(git(project.root, "log", "-1", "--format=%s")).toBe("start");
				rmSync(merging);
			},
		});
		expect(waited).toBe(1);
		expect(commit.kind).toBe("committed");
		expect(git(project.root, "log", "-1", "--format=%s")).toBe(MOVE_MESSAGE);
	});

	it("changes nothing here when the team refuses it", { timeout: 30_000 }, async () => {
		const cloud = fakeTeam();
		const project = existingProject();
		const before = git(project.root, "rev-parse", "HEAD");
		const viewer = cloud.machine("vera", "viewer");
		const vera = makeApp(project.state, {
			teamSyncServices: { ...viewer.services, notice: () => {} },
			cloudTeamsRequest: viewer.request,
		});
		const refused = await vera.controlRequest("/api/cloud/teams/devosurf/move", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ path: project.root }),
		});
		expect(refused.status).toBe(409);
		expect(existsSync(join(project.root, "spool.json"))).toBe(false);
		expect(git(project.root, "rev-parse", "HEAD")).toBe(before);
		expect(status(project.root)).toEqual([]);
	});

	it("refills a teammate's folder when they pull the move commit, and it syncs from then on", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const project = existingProject();
		const benRoot = realpathSync(join(makeTempDir()));
		git(benRoot, "clone", "--quiet", project.remote, "site");
		const ben = join(benRoot, "site");
		git(ben, "config", "user.email", "ben@example.test");
		git(ben, "config", "user.name", "Ben");
		const benState = join(makeTempDir(), ".spool");
		openProject(ben, benState);
		const benMachine = cloud.machine("ben");
		makeApp(benState, {
			teamSyncServices: { ...benMachine.services, notice: () => {} },
			cloudTeamsRequest: benMachine.request,
		});
		const anaDaemon = makeApp(project.state, {
			teamSyncServices: { ...ana.services, notice: () => {} },
			cloudTeamsRequest: ana.request,
		});
		await anaDaemon.controlRequest("/api/cloud/teams/devosurf/move", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ path: project.root }),
		});
		git(project.root, "push", "--quiet", "pushed", "main");

		git(ben, "pull", "--quiet", "--ff-only", "origin", "main");
		await until(() => text(ben, "frames/home/frame.tsx")?.includes("Home") === true, 10_000);
		expect(text(ben, "canvas.json")).toBe(text(project.root, "canvas.json"));
		expect(readFileSync(join(ben, "design/.gitignore"), "utf8")).toBe("*\n");
		expect(status(ben)).toEqual([]);
		// nothing of Ben's went up as a delete
		expect(cloud.saves("site").filter((save) => save.by === "ben")).toEqual([]);
		await new Promise((resolve) => setTimeout(resolve, 1_000));

		writeFrame(project.root, "news", "export default () => <h1>News</h1>;\n");
		await until(() => text(ben, "frames/news/frame.tsx")?.includes("News") === true, 10_000);
		writeFrame(ben, "from-ben", "export default () => <h1>Ben</h1>;\n");
		await until(() => text(project.root, "frames/from-ben/frame.tsx") !== undefined, 10_000);
	});

	it("refills a teammate whose spool was off when they pulled the move, at its next start, sending no delete", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const project = existingProject();
		const benRoot = realpathSync(join(makeTempDir()));
		git(benRoot, "clone", "--quiet", project.remote, "site");
		const ben = join(benRoot, "site");
		const benState = join(makeTempDir(), ".spool");
		openProject(ben, benState);
		const anaDaemon = makeApp(project.state, {
			teamSyncServices: { ...ana.services, notice: () => {} },
			cloudTeamsRequest: ana.request,
		});
		await anaDaemon.controlRequest("/api/cloud/teams/devosurf/move", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ path: project.root }),
		});
		git(project.root, "push", "--quiet", "pushed", "main");
		// the pull lands while Ben's spool is off: git takes design/ away and nothing watches
		git(ben, "pull", "--quiet", "--ff-only", "origin", "main");
		expect(existsSync(join(ben, "design", "canvas.json"))).toBe(false);

		const benMachine = cloud.machine("ben");
		makeApp(benState, {
			teamSyncServices: { ...benMachine.services, notice: () => {} },
			cloudTeamsRequest: benMachine.request,
		});
		await until(() => text(ben, "frames/home/frame.tsx")?.includes("Home") === true, 10_000);
		await new Promise((resolve) => setTimeout(resolve, 1_000));
		expect(cloud.saves("site").filter((save) => save.by === "ben")).toEqual([]);
		expect(cloud.file("site", "frames/home/frame.tsx")).toContain("Home");
		expect(status(ben)).toEqual([]);
	});
});
