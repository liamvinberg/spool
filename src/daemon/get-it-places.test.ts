import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanCheckouts } from "../checkout-scan";
import { cloudTeams } from "../cloud-teams";
import { initProject, initTeamProject } from "../init";
import { readRegistry } from "../registry";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { makeApp, makeTempDir, until, writeFrame } from "../test-helpers";
import { MOVE_MESSAGE } from "./history";
import { createSettingsStore } from "./settings";

/**
 * Get it finds the checkout and says what each place holds before anything happens (spool#193): the scan of a fake
 * home's code folders, folders picked before, the ranking, and each place's survey as the daemon answers the sheet.
 */

const IDENTITY = {
	GIT_AUTHOR_NAME: "Hands",
	GIT_AUTHOR_EMAIL: "hands@example.test",
	GIT_COMMITTER_NAME: "Hands",
	GIT_COMMITTER_EMAIL: "hands@example.test",
};

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...IDENTITY } }).trim();
}

/** A repository at `root` with an origin, made there. */
function repoAt(root: string, origin?: string): string {
	mkdirSync(root, { recursive: true });
	git(root, "init", "--quiet", "--initial-branch=main", ".");
	git(root, "config", "commit.gpgsign", "false");
	if (origin !== undefined) git(root, "remote", "add", "origin", origin);
	return realpathSync(root);
}

const json = { "content-type": "application/json", origin: "http://localhost:7766" };

/** Ana starts the team project in her checkout of github.com/devosurf/app and commits its spool.json. */
async function anaStarts(cloud: ReturnType<typeof fakeTeam>) {
	const ana = cloud.machine("ana");
	const state = join(makeTempDir(), ".spool");
	const { root } = await initTeamProject(
		repoAt(join(makeTempDir(), "app"), "git@github.com:Devosurf/app.git"),
		state,
		{ team: "devosurf", origin: TEAM_ORIGIN, request: ana.request, openSocket: ana.openSocket },
	);
	git(root, "add", "spool.json");
	git(root, "commit", "--quiet", "-m", "spool: a team project");
	writeFrame(root, "home", "export default () => <h1>Home</h1>;\n");
	writeFrame(root, "about", "export default () => <h1>About</h1>;\n");
	const daemon = makeApp(state, { cloud: ana.cloud, teamNotice: () => {} });
	await until(() => cloud.file("app", "frames/about/frame.tsx")?.includes("About") === true, 10_000);
	return { root, state, daemon };
}

/** Ben's Mac: a daemon on a fake home, his projects location somewhere temporary. */
function bensMac(cloud: ReturnType<typeof fakeTeam>) {
	const home = realpathSync(makeTempDir());
	const state = join(makeTempDir(), ".spool");
	const location = join(makeTempDir(), "spool");
	mkdirSync(state, { recursive: true });
	createSettingsStore(state).write("projects.location", location);
	const daemon = makeApp(state, { cloud: cloud.machine("ben").cloud, teamNotice: () => {}, home });
	const places = async () => {
		const response = await daemon.controlRequest("/api/cloud/teams/devosurf/projects/app/places");
		expect(response.status, await response.clone().text()).toBe(200);
		return (await response.json()) as {
			checkouts: { path: string; root: string; linked: boolean; survey: Record<string, unknown> }[];
			mac: { path: string; survey: Record<string, unknown> };
		};
	};
	const survey = async (path: string) => {
		const response = await daemon.controlRequest(
			`/api/cloud/teams/devosurf/projects/app/places/survey?${new URLSearchParams({ path })}`,
		);
		expect(response.status, await response.clone().text()).toBe(200);
		return (await response.json()) as { root: string; linked: boolean; survey: Record<string, unknown> };
	};
	const get = (path: string, signal?: AbortSignal) =>
		daemon.controlRequest("/api/cloud/teams/devosurf/projects/app/get", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ where: "checkout", path }),
			...(signal === undefined ? {} : { signal }),
		});
	return { home, state, daemon, places, survey, get };
}

/** A copy of Ana's design/ as it is now, without spool's own record: a folder spool never synced. */
function copyDesign(from: string, to: string): void {
	cpSync(join(from, "design"), join(to, "design"), {
		recursive: true,
		filter: (source) => !source.includes(`${join(from, "design", ".spool")}`),
	});
}

describe("the scan of the code folders", () => {
	it("finds checkouts in each code folder down to three levels, worktrees included, and never a guarded folder", {
		timeout: 30_000,
	}, async () => {
		const home = realpathSync(makeTempDir());
		const origin = "git@github.com:devosurf/app.git";
		const found = [
			repoAt(join(home, "code", "app"), origin),
			repoAt(join(home, "dev", "work", "app"), "https://github.com/devosurf/app.git"),
			repoAt(join(home, "Developer", "a", "b", "app"), origin),
			repoAt(join(home, "Projects", "app"), origin),
			repoAt(join(home, "src", "app"), origin),
			repoAt(join(home, "GitHub", "app"), origin),
		];
		// a worktree's .git is a file naming the repository's own folder
		git(found[0] as string, "commit", "--quiet", "--allow-empty", "-m", "start");
		mkdirSync(join(home, "repos"));
		git(found[0] as string, "worktree", "add", "--quiet", join(home, "repos", "app-feature"));
		// too deep, in a dot-folder, without an origin, and in every folder macOS guards
		repoAt(join(home, "code", "a", "b", "c", "app"), origin);
		repoAt(join(home, "code", ".hidden", "app"), origin);
		repoAt(join(home, "code", "local"));
		for (const guarded of ["Desktop", "Documents", "Downloads"]) repoAt(join(home, guarded, "app"), origin);
		// a link into a guarded folder is never followed
		symlinkSync(join(home, "Documents"), join(home, "code", "linked"));
		mkdirSync(join(home, "Library"));
		symlinkSync(join(home, "Documents"), join(home, "Library", "code"));

		const scanned = await scanCheckouts(home);
		expect(scanned).toEqual(
			[...found, realpathSync(join(home, "repos", "app-feature"))]
				.map((top) => ({ top, repo: "github.com/devosurf/app" }))
				.sort((a, b) => (a.top < b.top ? -1 : 1)),
		);
	});

	it("reads nothing at all when a code folder is a link into a guarded one", async () => {
		const home = realpathSync(makeTempDir());
		repoAt(join(home, "Documents", "code", "app"), "git@github.com:devosurf/app.git");
		symlinkSync(join(home, "Documents", "code"), join(home, "code"));
		expect(await scanCheckouts(home)).toEqual([]);
	});
});

describe("Get it's places", () => {
	it("offers a clone found in the code folders and a folder picked before, the linked checkout first, registering nothing", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = await anaStarts(cloud);
		const ben = bensMac(cloud);
		// a checkout of the repo from before spool.json, outside every code folder
		const picked = repoAt(join(makeTempDir(), "app-old"), "https://github.com/devosurf/app.git");
		writeFileSync(join(picked, "spool.json"), `${JSON.stringify({ project: `${TEAM_ORIGIN}/devosurf/other` })}\n`);
		const refused = await ben.get(picked);
		expect(refused.status).toBe(409);
		expect(((await refused.json()) as { error: string }).error).toContain("Already holds another team project");

		mkdirSync(join(ben.home, "code"));
		git(join(ben.home, "code"), "clone", "--quiet", ana.root, "app");
		const clone = join(ben.home, "code", "app");
		git(clone, "remote", "set-url", "origin", "https://github.com/devosurf/app.git");
		const places = await ben.places();
		expect(places.checkouts.map(({ path, linked, survey }) => ({ path, linked, kind: survey.kind }))).toEqual([
			{ path: clone, linked: true, kind: "empty" },
			{ path: picked, linked: false, kind: "other" },
		]);
		expect(places.checkouts[1]?.survey.why).toBe(`Already holds another team project, ${TEAM_ORIGIN}/devosurf/other`);
		expect(places.checkouts[0]).toEqual({
			path: clone,
			root: clone,
			linked: true,
			survey: { kind: "empty" },
			common: 0,
			usedAt: 0,
		});
		expect(places.mac.survey).toEqual({ kind: "empty" });
		expect(readRegistry(ben.state).projects).toEqual([]);
	});

	it("says what a design/ spool never synced holds, and takes one identical to the team's with no question", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = await anaStarts(cloud);
		const ben = bensMac(cloud);
		const same = repoAt(join(makeTempDir(), "app"), "https://github.com/devosurf/app.git");
		copyDesign(ana.root, same);

		const held = cloud.paths("app").filter((path) => cloud.file("app", path) !== null);
		expect((await ben.survey(same)).survey).toEqual({ kind: "identical", files: held.length });
		const got = await ben.get(same);
		expect(got.status, await got.clone().text()).toBe(200);
		expect(JSON.parse(readFileSync(join(same, "spool.json"), "utf8"))).toEqual({
			project: `${TEAM_ORIGIN}/devosurf/app`,
		});
		writeFrame(ana.root, "news", "export default () => <h1>News</h1>;\n");
		await until(() => existsSync(join(same, "design", "frames", "news", "frame.tsx")), 10_000);
		expect(cloud.saves("app").filter((save) => save.by === "ben")).toEqual([]);
	});

	it("counts the same, older, changed and new files of a design/ that differs", { timeout: 30_000 }, async () => {
		const cloud = fakeTeam();
		const ana = await anaStarts(cloud);
		const ben = bensMac(cloud);
		const here = repoAt(join(makeTempDir(), "app"), "https://github.com/devosurf/app.git");
		copyDesign(ana.root, here);
		// the team moves on from what was copied: about is older here
		writeFrame(ana.root, "about", "export default () => <h1>About us</h1>;\n");
		await until(() => cloud.file("app", "frames/about/frame.tsx")?.includes("About us") === true, 10_000);
		// home changed here, and two new frames
		writeFrame(here, "home", "export default () => <h1>Ben's home</h1>;\n");
		writeFrame(here, "pricing", "export default () => <h1>Pricing</h1>;\n");
		writeFrame(here, "faq", "export default () => <h1>FAQ</h1>;\n");

		// everything else the team holds is the same here, canvas.json aside: it is merged, never counted
		const held = cloud.paths("app").filter((path) => cloud.file("app", path) !== null);
		expect((await ben.survey(here)).survey).toEqual({
			kind: "design",
			counts: { same: held.length - 3, older: 1, changed: 1, only: 2 },
		});
	});

	it("dims another project's design/, sharing no frames with the team's, and won't use it", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		await anaStarts(cloud);
		const ben = bensMac(cloud);
		const other = repoAt(join(makeTempDir(), "tidemark-app"), "https://github.com/devosurf/app.git");
		initProject(other, join(makeTempDir(), ".spool"));
		writeFrame(other, "dashboard", "export default () => <h1>Dashboard</h1>;\n");

		expect((await ben.survey(other)).survey).toEqual({
			kind: "other",
			why: "Already holds its own project, tidemark-app",
		});
		const refused = await ben.get(other);
		expect(refused.status).toBe(409);
		expect(existsSync(join(other, "spool.json"))).toBe(false);
	});
});

describe("Get it in a design/ spool never synced (spool#196)", () => {
	/**
	 * Ben copied Ana's design/ a while ago. Since then the team edited about, deleted old, and made contact; Ben
	 * edited home, made pricing, and made a contact of his own.
	 */
	async function drifted(cloud: ReturnType<typeof fakeTeam>) {
		const ana = await anaStarts(cloud);
		writeFrame(ana.root, "old", "export default () => <h1>Old</h1>;\n");
		await until(() => cloud.file("app", "frames/old/frame.tsx")?.includes("Old") === true, 10_000);
		const ben = bensMac(cloud);
		const here = repoAt(join(makeTempDir(), "app"), "https://github.com/devosurf/app.git");
		copyDesign(ana.root, here);
		writeFrame(ana.root, "about", "export default () => <h1>About us</h1>;\n");
		rmSync(join(ana.root, "design", "frames", "old"), { recursive: true });
		writeFrame(ana.root, "contact", "export default () => <h1>Write to us</h1>;\n");
		await until(
			() =>
				cloud.file("app", "frames/about/frame.tsx")?.includes("About us") === true &&
				cloud.file("app", "frames/old/frame.tsx") === null &&
				cloud.file("app", "frames/contact/frame.tsx") !== undefined,
			10_000,
		);
		writeFrame(here, "home", "export default () => <h1>Ben's home</h1>;\n");
		writeFrame(here, "pricing", "export default () => <h1>Pricing</h1>;\n");
		writeFrame(here, "contact", "export default () => <h1>Call us</h1>;\n");
		return { ana, ben, here };
	}

	it("brings it level: older takes the team's, a deleted frame stays deleted, changed is set aside, new goes up", {
		timeout: 60_000,
	}, async () => {
		const cloud = fakeTeam();
		const { ben, here } = await drifted(cloud);
		const surveyed = (await ben.survey(here)).survey as { kind: string; counts: Record<string, number> };
		expect(surveyed.kind).toBe("design");
		expect(surveyed.counts).toMatchObject({ older: 2, changed: 2, only: 1 });

		const got = await ben.get(here);
		expect(got.status, await got.clone().text()).toBe(200);
		const frame = (name: string) => join(here, "design", "frames", name, "frame.tsx");
		await until(() => readFileSync(frame("about"), "utf8").includes("About us"), 10_000);
		await until(() => !existsSync(frame("old")), 10_000);
		await until(() => cloud.file("app", "frames/pricing/frame.tsx")?.includes("Pricing") === true, 10_000);
		await until(() => readFileSync(frame("contact"), "utf8").includes("Write to us"), 10_000);
		// home and contact differ from the team's own versions: the team's land, Ben's are set aside
		await until(() => readFileSync(frame("home"), "utf8").includes("<h1>Home</h1>"), 10_000);
		const bens = cloud.saves("app").filter((save) => save.by === "ben");
		expect(bens.filter((save) => save.outcome === "applied").map((save) => save.path)).toEqual([
			"frames/pricing/frame.tsx",
		]);
		expect(
			bens
				.filter((save) => save.outcome === "set_aside")
				.map((save) => save.path)
				.sort(),
		).toEqual(["frames/contact/frame.tsx", "frames/home/frame.tsx"]);
		expect(cloud.file("app", "frames/old/frame.tsx")).toBeNull();
		expect(cloud.file("app", "frames/about/frame.tsx")).toContain("About us");
	});

	it("asks in batches, and with a spool.page that can't say, goes up as its own work as before", {
		timeout: 60_000,
	}, async () => {
		const cloud = fakeTeam();
		const { ben, here } = await drifted(cloud);
		const files = Array.from({ length: 2_345 }, (_, at) => ({
			path: `frames/f${at}/frame.tsx`,
			hash: "0".repeat(64),
		}));
		const asked = await cloudTeams(ben.state, { ...cloud.machine("ben").request, origin: TEAM_ORIGIN }).seen(
			"devosurf",
			"app",
			files,
		);
		expect(asked.files).toHaveLength(2_345);
		expect(cloud.seenAsks.slice(-3)).toEqual([1_000, 1_000, 345]);
		cloud.withoutSeen();
		expect((await ben.survey(here)).survey).toEqual({ kind: "design", counts: null });
		const got = await ben.get(here);
		expect(got.status, await got.clone().text()).toBe(200);
		// blind, the older about goes up over the team's, and the deleted frame comes back
		await until(() => cloud.file("app", "frames/pricing/frame.tsx")?.includes("Pricing") === true, 10_000);
		await until(() => cloud.file("app", "frames/old/frame.tsx")?.includes("Old") === true, 10_000);
	});
});

describe("Get it on a branch from before the move", () => {
	it("names the move commit, its branch and the command, then carries on by itself once it is merged", {
		timeout: 60_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const remote = join(makeTempDir(), "remote.git");
		git(makeTempDir(), "init", "--quiet", "--bare", "--initial-branch=main", remote);
		const site = repoAt(join(makeTempDir(), "site"), "git@github.com:devosurf/site.git");
		git(site, "config", "user.name", "Ada");
		git(site, "config", "user.email", "ada@example.test");
		const anaState = join(makeTempDir(), ".spool");
		initProject(site, anaState, { history: true });
		writeFrame(site, "home", "export default () => <h1>Home</h1>;\n");
		git(site, "add", "-A");
		git(site, "commit", "--quiet", "-m", "start");
		git(site, "remote", "add", "pushed", remote);
		git(site, "push", "--quiet", "pushed", "main");

		// Ben's clone, on a branch of his own with a frame of his own, before he hears of the move
		const benRoot = realpathSync(makeTempDir());
		git(benRoot, "clone", "--quiet", remote, "site");
		const clone = join(benRoot, "site");
		git(clone, "switch", "--quiet", "-c", "feature/signup");
		writeFrame(clone, "signup", "export default () => <h1>Sign up</h1>;\n");
		git(clone, "add", "design");
		git(clone, "commit", "--quiet", "-m", "signup");

		const anaDaemon = makeApp(anaState, { cloud: ana.cloud, teamNotice: () => {} });
		const moved = await anaDaemon.controlRequest("/api/cloud/teams/devosurf/move", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ path: site }),
		});
		expect(moved.status, await moved.clone().text()).toBe(200);
		await until(() => git(site, "log", "-1", "--format=%s") === MOVE_MESSAGE, 10_000);
		git(site, "push", "--quiet", "pushed", "main");
		git(clone, "fetch", "--quiet", "origin");

		const home = realpathSync(makeTempDir());
		const state = join(makeTempDir(), ".spool");
		const ben = makeApp(state, { cloud: cloud.machine("ben").cloud, teamNotice: () => {}, home });
		const surveyed = (await (
			await ben.controlRequest(
				`/api/cloud/teams/devosurf/projects/site/places/survey?${new URLSearchParams({ path: clone })}`,
			)
		).json()) as { survey: Record<string, unknown> };
		const commit = git(site, "rev-parse", "HEAD");
		expect(surveyed.survey).toEqual({
			kind: "pre-move",
			commit,
			short: git(site, "rev-parse", "--short", "HEAD"),
			author: "Ada",
			branch: "feature/signup",
			base: "origin/main",
			command: "git merge origin/main",
		});

		let answered = false;
		const getting = Promise.resolve(
			ben.controlRequest("/api/cloud/teams/devosurf/projects/site/get", {
				method: "POST",
				headers: json,
				body: JSON.stringify({ where: "checkout", path: clone }),
			}),
		).then((response) => {
			answered = true;
			return response;
		});
		await new Promise((resolve) => setTimeout(resolve, 1_500));
		expect(answered).toBe(false);
		expect(existsSync(join(clone, "spool.json"))).toBe(false);

		git(clone, "merge", "--quiet", "--no-edit", "origin/main");
		const got = await getting;
		expect(got.status, await got.clone().text()).toBe(200);
		expect(await got.json()).toEqual({ root: clone, name: "site" });
		await until(() => cloud.file("site", "frames/signup/frame.tsx")?.includes("Sign up") === true, 10_000);
		expect(cloud.file("site", "frames/home/frame.tsx")).toContain("Home");
		expect(cloud.saves("site").filter((save) => save.by === "ben" && save.deleted)).toEqual([]);
	});
});
