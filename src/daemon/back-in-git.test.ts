import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initTeamProject } from "../init";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { makeApp, makeTempDir, until, writeFrame } from "../test-helpers";
import { createSettingsStore } from "./settings";

/**
 * Put design/ back in git (#198): a teammate's copy that ended or went local, in a checkout whose branch still tracks
 * spool.json, becomes an ordinary project in git again with one commit. Real git in scratch repos, the daemon against
 * a fake spool.page; assertions are on disk, on git and on what reached the team.
 */

const BACK_MESSAGE = "design: moved out of Spool Cloud";

const IDENTITY = {
	GIT_AUTHOR_NAME: "Hands",
	GIT_AUTHOR_EMAIL: "hands@example.test",
	GIT_COMMITTER_NAME: "Hands",
	GIT_COMMITTER_EMAIL: "hands@example.test",
};

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...IDENTITY } }).trim();
}

function status(root: string): string[] {
	return git(root, "status", "--porcelain", "--untracked-files=all").split("\n").filter(Boolean);
}

const json = { "content-type": "application/json", origin: "http://localhost:7766" };

/** Ana starts the team project in her checkout, commits its spool.json and pushes it to a bare remote. */
async function anaStarts(cloud: ReturnType<typeof fakeTeam>) {
	const ana = cloud.machine("ana", "admin");
	const remote = join(makeTempDir(), "remote.git");
	git(makeTempDir(), "init", "--quiet", "--bare", "--initial-branch=main", remote);
	const root = join(makeTempDir(), "app");
	mkdirSync(root);
	git(root, "init", "--quiet", "--initial-branch=main", ".");
	git(root, "remote", "add", "origin", remote);
	const state = join(makeTempDir(), ".spool");
	await initTeamProject(realpathSync(root), state, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: ana.request,
		openSocket: ana.openSocket,
	});
	git(root, "add", "spool.json");
	git(root, "commit", "--quiet", "-m", "spool: a team project");
	git(root, "push", "--quiet", "origin", "main");
	const daemon = makeApp(state, { cloud: ana.cloud, teamNotice: () => {} });
	writeFrame(root, "home", "export default () => <h1>Home</h1>;\n");
	await until(() => cloud.file("app", "frames/home/frame.tsx")?.includes("Home") === true, 10_000);
	return { root: realpathSync(root), daemon, remote };
}

/** A teammate's Mac: a clone of the repo, and the team's copy got into it, in step with the team. */
async function teammate(cloud: ReturnType<typeof fakeTeam>, name: string, remote: string) {
	const machine = cloud.machine(name);
	const state = join(makeTempDir(), ".spool");
	mkdirSync(state, { recursive: true });
	createSettingsStore(state).write("projects.location", join(makeTempDir(), "spool"));
	const daemon = makeApp(state, { cloud: machine.cloud, teamNotice: () => {} });
	const checkout = realpathSync(makeTempDir());
	git(checkout, "clone", "--quiet", remote, "app");
	const clone = join(checkout, "app");
	const got = await daemon.controlRequest("/api/cloud/teams/devosurf/projects/app/get", {
		method: "POST",
		headers: json,
		body: JSON.stringify({ where: "checkout", path: clone }),
	});
	expect(got.status, await got.clone().text()).toBe(200);
	await until(() => existsSync(join(clone, "design/frames/home/frame.tsx")), 10_000);
	// followed: its record knows whose it is, so a role change ends it rather than reading as another account's
	const record = join(clone, "design/.spool/sync.json");
	await until(() => existsSync(record) && JSON.parse(readFileSync(record, "utf8")).account === name, 10_000);
	return { daemon, clone, state };
}

/** What Home's cover and the canvas's notice offer for a copy. */
async function offered(daemon: ReturnType<typeof makeApp>, root: string) {
	const cards = (await (await daemon.request("/api/projects")).json()) as {
		projects: { root: string; name: string; backInGit?: boolean }[];
	};
	const card = cards.projects.find((project) => project.root === root);
	const sync = (await (await daemon.request(`/api/p/${card?.name}/sync`)).json()) as { backInGit?: boolean };
	return { cover: card?.backInGit === true, notice: sync.backInGit === true };
}

/** Put design/ back in git, as the notice and the cover menu ask for it: by the project's name on this Mac. */
async function putBack(daemon: ReturnType<typeof makeApp>, root: string) {
	const cards = (await (await daemon.request("/api/projects")).json()) as {
		projects: { root: string; name: string }[];
	};
	const name = cards.projects.find((project) => project.root === root)?.name;
	return daemon.controlRequest(`/api/p/${name}/back-in-git`, { method: "POST", headers: json });
}

const ended = (root: string) => readFileSync(join(root, "design/.gitignore"), "utf8") === ".spool/\n";

describe("Put design/ back in git", () => {
	it("makes one commit on the branch adding design/ and taking spool.json out, with no hook and no push", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = await anaStarts(cloud);
		const ben = await teammate(cloud, "ben", ana.remote);
		expect(await offered(ben.daemon, ben.clone)).toEqual({ cover: false, notice: false });

		cloud.role("ben", "viewer");
		await until(() => ended(ben.clone), 10_000);
		expect(await offered(ben.daemon, ben.clone)).toEqual({ cover: true, notice: true });
		const ran = join(makeTempDir(), "hooks-ran");
		for (const hook of ["pre-commit", "commit-msg", "post-commit", "pre-push", "reference-transaction"]) {
			const file = join(ben.clone, ".git", "hooks", hook);
			writeFileSync(file, `#!/bin/sh\necho ${hook} >> "${ran}"\n`);
			chmodSync(file, 0o755);
		}
		const before = git(ben.clone, "rev-parse", "HEAD");

		const put = await putBack(ben.daemon, ben.clone);
		expect(put.status, await put.clone().text()).toBe(200);
		expect(await put.json()).toEqual({ root: ben.clone, committed: true, commitWaiting: false });
		expect(git(ben.clone, "rev-list", "--count", `${before}..HEAD`)).toBe("1");
		expect(git(ben.clone, "log", "-1", "--format=%s")).toBe(BACK_MESSAGE);
		expect(git(ben.clone, "symbolic-ref", "--short", "HEAD")).toBe("main");
		const changes = git(ben.clone, "show", "--name-status", "--format=", "HEAD").split("\n");
		expect(changes).toContain("D\tspool.json");
		expect(changes).toContain("A\tdesign/.gitignore");
		expect(changes).toContain("A\tdesign/frames/home/frame.tsx");
		expect(changes.filter((change) => !change.startsWith("A\tdesign/") && change !== "D\tspool.json")).toEqual([]);
		expect(changes.some((change) => change.includes("design/.spool/"))).toBe(false);
		expect(git(ben.clone, "show", "HEAD:design/.gitignore")).toBe(".spool/");
		expect(existsSync(join(ben.clone, "spool.json"))).toBe(false);
		expect(status(ben.clone)).toEqual([]);
		expect(existsSync(ran)).toBe(false);
		expect(git(ana.remote, "rev-parse", "main")).toBe(before);
		// done: nothing more to offer
		expect(await offered(ben.daemon, ben.clone)).toEqual({ cover: false, notice: false });
	});

	it("isn't offered on a copy that moved out, whose commit comes by pull, nor on one in no repo", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = await anaStarts(cloud);
		const ben = await teammate(cloud, "ben", ana.remote);
		// Cara keeps hers on her Mac only, in no repo
		const cara = cloud.machine("cara");
		const caraState = join(makeTempDir(), ".spool");
		mkdirSync(caraState, { recursive: true });
		const location = join(makeTempDir(), "spool");
		createSettingsStore(caraState).write("projects.location", location);
		const caras = makeApp(caraState, { cloud: cara.cloud, teamNotice: () => {} });
		const got = await caras.controlRequest("/api/cloud/teams/devosurf/projects/app/get", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ where: "mac" }),
		});
		expect(got.status, await got.clone().text()).toBe(200);
		const caraRoot = ((await got.json()) as { root: string }).root;
		const caraRecord = join(caraRoot, "design/.spool/sync.json");
		await until(
			() => existsSync(caraRecord) && JSON.parse(readFileSync(caraRecord, "utf8")).account === "cara",
			10_000,
		);

		const out = await ana.daemon.controlRequest("/api/cloud/teams/devosurf/projects/app/out", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ path: ana.root }),
		});
		expect(out.status, await out.clone().text()).toBe(200);
		const record = (root: string) => JSON.parse(readFileSync(join(root, "design/.spool/sync.json"), "utf8"));
		// Ben's waits for the mover's commit by pull; Cara's, in no repo, just ends
		await until(() => record(ben.clone).movedOut === "Devosurf" && record(caraRoot).ended === true, 10_000);
		expect(await offered(ben.daemon, ben.clone)).toEqual({ cover: false, notice: false });
		expect(await offered(caras, caraRoot)).toEqual({ cover: false, notice: false });
		const refused = await putBack(ben.daemon, ben.clone);
		expect(refused.status).toBe(409);
		expect(existsSync(join(ben.clone, "spool.json"))).toBe(true);
	});

	it("ends a gone-local copy for good: it doesn't follow the team again once it pays", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = await anaStarts(cloud);
		const ben = await teammate(cloud, "ben", ana.remote);
		cloud.lapse();
		await until(
			() => JSON.parse(readFileSync(join(ben.clone, "design/.spool/sync.json"), "utf8")).goneLocal === "Devosurf",
			10_000,
		);
		expect(await offered(ben.daemon, ben.clone)).toEqual({ cover: true, notice: true });

		const put = await putBack(ben.daemon, ben.clone);
		expect(await put.json()).toMatchObject({ committed: true });
		expect(git(ben.clone, "log", "-1", "--format=%s")).toBe(BACK_MESSAGE);
		const record = JSON.parse(readFileSync(join(ben.clone, "design/.spool/sync.json"), "utf8"));
		expect(record.ended).toBe(true);
		expect(record.goneLocal).toBeUndefined();

		cloud.pay();
		// reading the teams is what sets a paid-again team's copies following it again
		await ben.daemon.controlRequest("/api/cloud/teams");
		writeFrame(ben.clone, "mine", "export default () => <h1>Mine</h1>;\n");
		await new Promise((wake) => setTimeout(wake, 1_000));
		expect(cloud.file("app", "frames/mine/frame.tsx")).toBeUndefined();
		expect(readFileSync(join(ben.clone, "design/.gitignore"), "utf8")).toBe(".spool/\n");
	});

	it("waits out a rebase and commits after; a detached HEAD is said and nothing changes", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = await anaStarts(cloud);
		const ben = await teammate(cloud, "ben", ana.remote);
		cloud.role("ben", null);
		await until(() => ended(ben.clone), 10_000);

		const head = git(ben.clone, "rev-parse", "HEAD");
		git(ben.clone, "checkout", "--quiet", "--detach");
		const detached = await putBack(ben.daemon, ben.clone);
		expect(detached.status).toBe(409);
		expect(((await detached.json()) as { error: string }).error).toContain("HEAD is detached");
		expect(existsSync(join(ben.clone, "spool.json"))).toBe(true);
		git(ben.clone, "checkout", "--quiet", "main");

		const rebasing = join(ben.clone, ".git", "rebase-merge");
		mkdirSync(rebasing);
		const put = await putBack(ben.daemon, ben.clone);
		expect(await put.json()).toEqual({ root: ben.clone, committed: false, commitWaiting: true });
		expect(git(ben.clone, "rev-parse", "HEAD")).toBe(head);
		rmSync(rebasing, { recursive: true });
		await until(() => git(ben.clone, "log", "-1", "--format=%s") === BACK_MESSAGE, 10_000);
		expect(git(ben.clone, "rev-list", "--count", `${head}..HEAD`)).toBe("1");
	});

	it("merges cleanly where two teammates each made the commit on the same files", { timeout: 30_000 }, async () => {
		const cloud = fakeTeam();
		const ana = await anaStarts(cloud);
		const ben = await teammate(cloud, "ben", ana.remote);
		const cara = await teammate(cloud, "cara", ana.remote);
		cloud.role("ben", "viewer");
		cloud.role("cara", "viewer");
		await until(() => ended(ben.clone) && ended(cara.clone), 10_000);
		expect(await (await putBack(ben.daemon, ben.clone)).json()).toMatchObject({ committed: true });
		expect(await (await putBack(cara.daemon, cara.clone)).json()).toMatchObject({ committed: true });

		git(ben.clone, "push", "--quiet", "origin", "main");
		git(cara.clone, "pull", "--quiet", "--no-rebase", "--no-edit", "origin", "main");
		expect(status(cara.clone)).toEqual([]);
		expect(git(cara.clone, "ls-files", "spool.json")).toBe("");
		expect(git(cara.clone, "show", "HEAD:design/frames/home/frame.tsx")).toContain("Home");
	});
});
