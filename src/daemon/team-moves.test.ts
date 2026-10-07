import { execFileSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { initProject, initTeamProject } from "../init";
import { type MoveProgress, moveIntoTeam } from "../move-in";
import { openProject } from "../open";
import { CLOSE_NOT_EDITOR, CLOSE_SIGNED_OUT } from "../team-sync-protocol";
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
		cloud: machine.cloud,
		teamNotice: () => {},
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
		cloud: ana.cloud,
		teamNotice: () => {},
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
			cloud: ana.cloud,
			teamNotice: () => {},
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

	it("names what won't travel before it moves, and leaves those files in git for teammates", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const project = existingProject();
		writeFileSync(join(project.root, "design", "README.md"), "# how we design\n");
		symlinkSync("../home", join(project.root, "design", "frames", "alias"));
		git(project.root, "add", "-A");
		git(project.root, "commit", "--quiet", "-m", "notes");
		const daemon = makeApp(project.state, {
			cloud: ana.cloud,
			teamNotice: () => {},
		});

		const asked = await daemon.controlRequest(`/api/cloud/move/stays?${new URLSearchParams({ path: project.root })}`);
		expect(await asked.json()).toEqual({
			stays: [
				{ path: "README.md", why: "only canvas.json, AGENTS.md, CLAUDE.md, frames/ and shared/ sync" },
				{ path: "frames/alias", why: "symlinks stay on this Mac" },
			],
		});

		const moved = await daemon.controlRequest("/api/cloud/teams/devosurf/move", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ path: project.root }),
		});
		expect(await moved.json()).toMatchObject({ commit: "committed" });
		// what doesn't travel stays tracked, so a teammate who pulls keeps it
		expect(git(project.root, "ls-tree", "-r", "--name-only", "HEAD", "design").split("\n")).toEqual([
			"design/README.md",
			"design/frames/alias",
		]);
		expect(cloud.file("site", "README.md")).toBeUndefined();
		expect(status(project.root)).toEqual([]);
	});

	it("carries a solo project's shares over to the team project, so links already sent keep working", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const project = existingProject();
		const solo = "a".repeat(32);
		mkdirSync(join(project.root, "design", ".spool"), { recursive: true });
		writeFileSync(
			join(project.root, "design", ".spool", "share.json"),
			`${JSON.stringify({ origin: TEAM_ORIGIN, project: solo })}\n`,
		);
		const daemon = makeApp(project.state, { cloud: ana.cloud, teamNotice: () => {} });
		const moved = await daemon.controlRequest("/api/cloud/teams/devosurf/move", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ path: project.root }),
		});
		expect(moved.status, await moved.clone().text()).toBe(200);
		expect(cloud.soloMoves).toEqual([{ solo, team: "devosurf", project: "site", by: "ana" }]);
		expect(existsSync(join(project.root, "design", ".spool", "share.json"))).toBe(false);
	});

	it("refuses a detached HEAD before it uploads anything", { timeout: 30_000 }, async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const project = existingProject();
		git(project.root, "checkout", "--quiet", "--detach");
		const daemon = makeApp(project.state, {
			cloud: ana.cloud,
			teamNotice: () => {},
		});
		const refused = await daemon.controlRequest("/api/cloud/teams/devosurf/move", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ path: project.root }),
		});
		expect(refused.status).toBe(409);
		expect(((await refused.json()) as { error: string }).error).toContain("Check out a branch");
		expect(cloud.paths("site")).toEqual([]);
		expect(existsSync(join(project.root, "spool.json"))).toBe(false);
	});

	it("gives up on a commit git never lets it make, and makes it when spool next starts", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const project = existingProject();
		const before = git(project.root, "rev-parse", "HEAD");
		// a git that crashed left its lock behind
		const lock = join(project.root, ".git", "index.lock");
		writeFileSync(lock, "");
		const moved = await moveIntoTeam(project.root, project.state, {
			team: "devosurf",
			origin: TEAM_ORIGIN,
			request: ana.request,
			openSocket: ana.openSocket,
			wait: async () => {},
		});
		expect(await moved.commit).toEqual({ kind: "failed" });
		expect(git(project.root, "rev-parse", "HEAD")).toBe(before);

		rmSync(lock);
		makeApp(project.state, {
			cloud: ana.cloud,
			teamNotice: () => {},
		});
		await until(() => git(project.root, "log", "-1", "--format=%s") === MOVE_MESSAGE, 10_000);
		expect(git(project.root, "rev-parse", "HEAD~1")).toBe(before);
		await until(() => status(project.root).length === 0, 10_000);
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
			cloud: viewer.cloud,
			teamNotice: () => {},
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
			cloud: benMachine.cloud,
			teamNotice: () => {},
		});
		const anaDaemon = makeApp(project.state, {
			cloud: ana.cloud,
			teamNotice: () => {},
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

		writeFrame(project.root, "news", "export default () => <h1>News</h1>;\n");
		await until(() => text(ben, "frames/news/frame.tsx")?.includes("News") === true, 10_000);
		writeFrame(ben, "from-ben", "export default () => <h1>Ben</h1>;\n");
		await until(() => text(project.root, "frames/from-ben/frame.tsx") !== undefined, 10_000);
	});

	it("sends a teammate's own new frames to the team when their branch had diverged from the move", {
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
		const benMachine = cloud.machine("ben");
		makeApp(benState, {
			cloud: benMachine.cloud,
			teamNotice: () => {},
		});
		// Ben's own work, committed on his branch as his history does, before he hears of the move
		writeFrame(ben, "bens", "export default () => <h1>Ben's</h1>;\n");
		git(ben, "add", "design");
		git(ben, "commit", "--quiet", "-m", "design: 1 new");
		const anaDaemon = makeApp(project.state, {
			cloud: ana.cloud,
			teamNotice: () => {},
		});
		await anaDaemon.controlRequest("/api/cloud/teams/devosurf/move", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ path: project.root }),
		});
		git(project.root, "push", "--quiet", "pushed", "main");

		// the pull is a merge: the move takes design/ out of git, and Ben's new frame stays tracked
		git(ben, "pull", "--quiet", "--no-rebase", "--no-edit", "origin", "main");
		await until(() => cloud.file("site", "frames/bens/frame.tsx")?.includes("Ben's") === true, 10_000);
		await until(() => text(project.root, "frames/bens/frame.tsx")?.includes("Ben's") === true, 10_000);
		expect(text(ben, "frames/bens/frame.tsx")).toContain("Ben's");
		expect(text(ben, "frames/home/frame.tsx")).toContain("Home");
		expect(cloud.file("site", "frames/home/frame.tsx")).toContain("Home");
		expect(cloud.saves("site").filter((save) => save.by === "ben" && save.deleted)).toEqual([]);
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
			cloud: ana.cloud,
			teamNotice: () => {},
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
			cloud: benMachine.cloud,
			teamNotice: () => {},
		});
		await until(() => text(ben, "frames/home/frame.tsx")?.includes("Home") === true, 10_000);
		await new Promise((resolve) => setTimeout(resolve, 1_000));
		expect(cloud.saves("site").filter((save) => save.by === "ben")).toEqual([]);
		expect(cloud.file("site", "frames/home/frame.tsx")).toContain("Home");
		expect(status(ben)).toEqual([]);
	});
});

describe("Move to team under the save limit", () => {
	/** An existing project with this many more frames than it started with, each one save. */
	function bigProject(frames: number) {
		const project = existingProject();
		for (let at = 0; at < frames; at++) writeFrame(project.root, `f${at}`, `export default () => <p>${at}</p>;\n`);
		return project;
	}

	it("waits out a cloud taking 120 saves a minute and moves 500 files in one go, saying how far it got", {
		timeout: 60_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const project = bigProject(500);
		let now = 0;
		cloud.rateLimit(120, 60_000, () => now);
		const slept: number[] = [];
		const progress: MoveProgress[] = [];

		const moved = await moveIntoTeam(project.root, project.state, {
			team: "devosurf",
			origin: TEAM_ORIGIN,
			request: ana.request,
			openSocket: ana.openSocket,
			wait: async (ms) => {
				slept.push(ms);
				now += ms;
			},
			onProgress: (at) => progress.push(at),
		});

		expect(await moved.commit).toMatchObject({ kind: "committed" });
		expect(cloud.paths("site")).toContain("frames/f499/frame.tsx");
		expect(cloud.paths("site").length).toBeGreaterThan(500);
		// four waits of up to a minute: 120 files in each minute
		expect(slept.filter((ms) => ms >= 1_000)).toHaveLength(4);
		const last = progress.at(-1);
		expect(last).toEqual({ up: last?.total, total: cloud.paths("site").length, paused: null });
		expect(progress.find((at) => at.paused !== null)?.paused?.why).toBe(
			"this project took 120 saves in the last minute",
		);
		expect(progress.some((at) => at.up > 0 && at.up < at.total && at.paused === null)).toBe(true);
	});

	for (const [reason, said] of [
		["project_full", "site didn't move: the team's design/ is at its 1 GB limit. Nothing changed here."],
		[
			"monthly_limit",
			"site didn't move: you've made 30,000 saves to this project this month. It lifts on 1 June. Nothing changed here.",
		],
	] as const)
		it(`stops on ${reason} and says so, changing nothing here`, { timeout: 30_000 }, async () => {
			vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-05-20T12:00:00Z") });
			onTestFinished(() => void vi.useRealTimers());
			const cloud = fakeTeam();
			const ana = cloud.machine("ana");
			const project = existingProject();
			const before = git(project.root, "rev-parse", "HEAD");
			// a month's saves lift at the turn of the month, twelve days on
			cloud.limit(reason, 12 * 86_400);
			const slept: number[] = [];

			await expect(
				moveIntoTeam(project.root, project.state, {
					team: "devosurf",
					origin: TEAM_ORIGIN,
					request: ana.request,
					openSocket: ana.openSocket,
					wait: async (ms) => void slept.push(ms),
				}),
			).rejects.toThrow(said);
			expect(slept).toEqual([]);
			expect(existsSync(join(project.root, "spool.json"))).toBe(false);
			expect(git(project.root, "rev-parse", "HEAD")).toBe(before);
		});

	it("tells the move sheet how far the move has got and what it is waiting out, while it runs", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const project = bigProject(3);
		const daemon = makeApp(project.state, { cloud: ana.cloud, teamNotice: () => {} });
		const progress = async () =>
			(
				(await (
					await daemon.controlRequest(`/api/cloud/move/progress?${new URLSearchParams({ path: project.root })}`)
				).json()) as { progress: MoveProgress | null }
			).progress;
		expect(await progress()).toBeNull();
		cloud.limit("rate_limited", 1);

		const moving = daemon.controlRequest("/api/cloud/teams/devosurf/move", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ path: project.root }),
		});
		let seen = await progress();
		for (const start = Date.now(); seen?.paused == null && Date.now() - start < 10_000; seen = await progress())
			await new Promise((resolve) => setTimeout(resolve, 25));
		expect(seen).toMatchObject({ up: 0, paused: { why: "this project took 120 saves in the last minute" } });
		expect(seen?.total).toBeGreaterThanOrEqual(5);
		cloud.lift();

		expect((await moving).status).toBe(200);
		expect(await progress()).toBeNull();
	});

	/** Ana's move of a project, against this cloud, with these options on top. */
	const moveAs = (
		cloud: ReturnType<typeof fakeTeam>,
		project: ReturnType<typeof existingProject>,
		options: Partial<Parameters<typeof moveIntoTeam>[2]> = {},
	) => {
		const ana = cloud.machine("ana");
		return moveIntoTeam(project.root, project.state, {
			team: "devosurf",
			origin: TEAM_ORIGIN,
			request: ana.request,
			openSocket: ana.openSocket,
			...options,
		});
	};
	/** Nothing here changed: no spool.json, no commit. */
	const unchanged = (project: ReturnType<typeof existingProject>, before: string) => {
		expect(existsSync(join(project.root, "spool.json"))).toBe(false);
		expect(git(project.root, "rev-parse", "HEAD")).toBe(before);
	};

	it("waits out spool.page saying it can't check saves", { timeout: 30_000 }, async () => {
		const cloud = fakeTeam();
		const project = existingProject();
		cloud.limit("unavailable", 2);
		const slept: number[] = [];
		const moved = await moveAs(cloud, project, {
			wait: async (ms) => {
				slept.push(ms);
				cloud.lift();
			},
		});
		expect(await moved.commit).toMatchObject({ kind: "committed" });
		expect(slept).toEqual([2_000]);
	});

	it("waits out spool.page closing the sync connection as unavailable, a little longer each time", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const project = existingProject();
		const undo = cloud.refuseSync(1011);
		const slept: number[] = [];
		const progress: MoveProgress[] = [];
		const moved = await moveAs(cloud, project, {
			wait: async (ms) => {
				slept.push(ms);
				if (slept.length === 3) undo();
			},
			onProgress: (at) => progress.push(at),
		});
		expect(await moved.commit).toMatchObject({ kind: "committed" });
		expect(slept).toEqual([2_000, 4_000, 8_000]);
		expect(progress.find((at) => at.paused !== null)?.paused?.why).toBe("spool.page is unavailable");
	});

	it("waits out a dropped connection, and gives up after ten tries in a row that get nothing up", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const project = existingProject();
		const before = git(project.root, "rev-parse", "HEAD");
		cloud.offline("ana");
		const slept: number[] = [];
		await expect(moveAs(cloud, project, { wait: async (ms) => void slept.push(ms) })).rejects.toThrow(
			"site didn't move: the connection to spool.page dropped. Nothing changed here; try again.",
		);
		expect(slept).toHaveLength(9);
		expect(Math.max(...slept)).toBeLessThanOrEqual(30_000);
		unchanged(project, before);
	});

	it("says a move stopped because this Mac was signed out", { timeout: 30_000 }, async () => {
		const cloud = fakeTeam();
		const project = existingProject();
		const before = git(project.root, "rev-parse", "HEAD");
		cloud.limit("rate_limited", 1);
		await expect(
			moveAs(cloud, project, {
				// signed out while the move waits: spool.page closes the next connection as signed out
				wait: async () => void cloud.refuseSync(CLOSE_SIGNED_OUT),
			}),
		).rejects.toThrow("site didn't move: not signed in; run `spool login`. Nothing changed here.");
		unchanged(project, before);
	});

	it("says a move stopped because this Mac no longer edits the team project", { timeout: 30_000 }, async () => {
		const cloud = fakeTeam();
		const project = existingProject();
		cloud.limit("rate_limited", 1);
		await expect(
			moveAs(cloud, project, { wait: async () => void cloud.refuseSync(CLOSE_NOT_EDITOR) }),
		).rejects.toThrow("site didn't move: you can't edit this team project. Nothing changed here.");
	});

	it("stops waiting when spool closes, even when it closed before the wait began", { timeout: 10_000 }, async () => {
		const cloud = fakeTeam();
		const project = existingProject();
		const before = git(project.root, "rev-parse", "HEAD");
		cloud.limit("rate_limited", 3_600);
		const closing = new AbortController();
		await expect(
			moveAs(cloud, project, {
				signal: closing.signal,
				// spool closes as the pause is said, before the sleep starts: no real hour is slept
				onProgress: (at) => {
					if (at.paused !== null) closing.abort();
				},
			}),
		).rejects.toThrow("spool closed before site moved. Nothing changed here; move it again.");
		unchanged(project, before);
	});

	it("uploads nothing when spool is already closing", { timeout: 10_000 }, async () => {
		const cloud = fakeTeam();
		const project = existingProject();
		const before = git(project.root, "rev-parse", "HEAD");
		await expect(moveAs(cloud, project, { signal: AbortSignal.abort() })).rejects.toThrow("spool closed before");
		expect(cloud.saves("site")).toEqual([]);
		unchanged(project, before);
	});

	it("names what stopped the shares going over", { timeout: 30_000 }, async () => {
		const cloud = fakeTeam();
		const project = existingProject();
		mkdirSync(join(project.root, "design", ".spool"), { recursive: true });
		writeFileSync(
			join(project.root, "design", ".spool", "share.json"),
			JSON.stringify({ origin: TEAM_ORIGIN, project: "nowhere" }),
		);
		await expect(moveAs(cloud, project)).rejects.toThrow(
			/^site's shares didn't move: spool\.page refused: \w+\. Nothing changed here; try again\.$/,
		);
	});
});
