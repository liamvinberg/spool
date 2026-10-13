import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENTS_LINE } from "../agents-line";
import { initTeamProject } from "../init";
import { readRegistry } from "../registry";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { makeApp, makeTempDir, until, writeFrame } from "../test-helpers";
import { createSettingsStore } from "./settings";

/**
 * Moving a team project on (task 136), as the people on each Mac see it: Ada, an admin of Tidemark and an editor in
 * Northlight, moves a project to Northlight, out of Tidemark, or into a checkout, through her daemon's routes; Sam is
 * in both teams, Mira only in Tidemark. Assertions are on disk, on git, on what the team holds, and on Home's covers.
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

function repo(name: string, origin?: string): string {
	const root = join(makeTempDir(), name);
	mkdirSync(root);
	git(root, "init", "--quiet", "--initial-branch=main", ".");
	git(root, "config", "user.email", "hands@example.test");
	git(root, "config", "user.name", "Hands");
	git(root, "config", "commit.gpgsign", "false");
	if (origin !== undefined) git(root, "remote", "add", "origin", origin);
	writeFileSync(join(root, "README.md"), `# ${name}\n`);
	git(root, "add", "README.md");
	git(root, "commit", "--quiet", "-m", "start");
	return realpathSync(root);
}

function status(root: string): string[] {
	return git(root, "status", "--porcelain", "--untracked-files=all").split("\n").filter(Boolean);
}

const text = (root: string, path: string) =>
	existsSync(join(root, "design", path)) ? readFileSync(join(root, "design", path), "utf8") : undefined;

const link = (root: string) =>
	(JSON.parse(readFileSync(join(root, "spool.json"), "utf8")) as { project: string }).project;

/** The account a copy's record says it synced as. */
function syncedAs(root: string): string | undefined {
	try {
		return (JSON.parse(readFileSync(join(root, "design", ".spool", "sync.json"), "utf8")) as { account?: string })
			.account;
	} catch {
		return undefined;
	}
}

const json = { "content-type": "application/json", origin: "http://localhost:7766" };

type Cloud = ReturnType<typeof fakeTeam>;

/** Tidemark and Northlight, and who is in which. */
function teams() {
	const cloud = fakeTeam("tidemark", "Tidemark");
	cloud.addTeam("northlight", "Northlight");
	return cloud;
}

/** One person's Mac: their daemon against the fake spool.page, with its projects location somewhere temporary. */
type Role = "admin" | "editor" | "viewer";

function mac(cloud: Cloud, who: string, roles: { tidemark?: Role; northlight?: Role }) {
	const machine = cloud.machine(who, roles.tidemark ?? null);
	if (roles.northlight !== undefined) cloud.role(who, roles.northlight, "northlight");
	const state = join(makeTempDir(), ".spool");
	const location = join(makeTempDir(), "spool");
	mkdirSync(state, { recursive: true });
	mkdirSync(location, { recursive: true });
	createSettingsStore(state).write("projects.location", location);
	const trashed: string[] = [];
	const daemon = makeApp(state, {
		cloud: machine.cloud,
		teamNotice: () => {},
		moveToTrash: async (paths) => void trashed.push(...paths),
	});
	const call = async (method: string, path: string, body?: unknown) => {
		const response = await daemon.controlRequest(`/api/cloud${path}`, {
			method,
			headers: json,
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		return { status: response.status, body: (await response.json()) as Record<string, unknown> };
	};
	const cards = async () =>
		((await (await daemon.controlRequest("/api/projects")).json()) as { projects: Record<string, unknown>[] })
			.projects;
	return { machine, state, location: realpathSync(location), daemon, call, cards, trashed };
}

/** Ada starts `site` in Tidemark in her checkout of github.com/tidemark/site, commits its spool.json, and pushes. */
async function adaStarts(cloud: Cloud, ada: ReturnType<typeof mac>) {
	const remote = join(makeTempDir(), "remote.git");
	git(makeTempDir(), "init", "--quiet", "--bare", "--initial-branch=main", remote);
	const root = repo("site", "git@github.com:tidemark/site.git");
	await initTeamProject(root, ada.state, {
		team: "tidemark",
		origin: TEAM_ORIGIN,
		request: ada.machine.request,
		openSocket: ada.machine.openSocket,
	});
	git(root, "add", "-A");
	git(root, "commit", "--quiet", "-m", "spool: a team project");
	git(root, "remote", "add", "pushed", remote);
	git(root, "push", "--quiet", "pushed", "main");
	writeFrame(root, "home", "export default () => <h1>Home</h1>;\n");
	await until(() => cloud.file("site", "frames/home/frame.tsx")?.includes("Home") === true, 10_000);
	return { root, remote };
}

/** Someone's clone of Ada's pushed repo, opened on their Mac: a working copy once the daemon fetches design/. */
async function cloneOf(remote: string, person: ReturnType<typeof mac>, name = "site") {
	const parent = realpathSync(makeTempDir());
	git(parent, "clone", "--quiet", remote, name);
	const root = join(parent, name);
	git(root, "config", "user.email", "hands@example.test");
	git(root, "config", "user.name", "Hands");
	git(root, "config", "commit.gpgsign", "false");
	const got = await person.call("POST", `/teams/tidemark/projects/site/get`, { where: "checkout", path: root });
	expect(got.status, JSON.stringify(got.body)).toBe(200);
	await until(() => text(root, "frames/home/frame.tsx") !== undefined, 10_000);
	// followed live and caught up: the copy knows whose it is, which is what lets a move end it
	await until(() => syncedAs(root) !== undefined, 10_000);
	return root;
}

describe("Move to team, from one team to another", () => {
	it("previews who loses it, the commit it makes and the folder it moves, and what refuses it", {
		timeout: 30_000,
	}, async () => {
		const cloud = teams();
		const ada = mac(cloud, "ada", { tidemark: "admin", northlight: "editor" });
		mac(cloud, "jonas", { tidemark: "editor" });
		mac(cloud, "mira", { tidemark: "editor" });
		// a viewer loses nothing, and neither does anyone in both teams
		cloud.machine("vic", "viewer");
		mac(cloud, "sam", { tidemark: "editor", northlight: "viewer" });
		const { root } = await adaStarts(cloud, ada);

		const preview = await ada.call("GET", "/teams/tidemark/projects/site/move?to=northlight");
		expect(preview).toEqual({
			status: 200,
			body: {
				losing: [
					{ name: "jonas", email: "jonas@devosurf.com" },
					{ name: "mira", email: "mira@devosurf.com" },
				],
				refusal: null,
				commits: [root],
				folder: null,
			},
		});

		// Northlight already has a site: the name is refused in place
		const theirs = join(makeTempDir(), "site");
		mkdirSync(theirs);
		await initTeamProject(theirs, ada.state, {
			team: "northlight",
			origin: TEAM_ORIGIN,
			request: ada.machine.request,
			openSocket: ada.machine.openSocket,
		});
		expect((await ada.call("GET", "/teams/tidemark/projects/site/move?to=northlight")).body.refusal).toBe(
			"name_taken",
		);
		expect(
			(await ada.call("GET", "/teams/tidemark/projects/site/move?to=northlight&name=tidemark-site")).body.refusal,
		).toBeNull();
		const refused = await ada.call("POST", "/teams/tidemark/projects/site/move", { to: "northlight" });
		expect(refused).toEqual({
			status: 409,
			body: { error: "northlight already has a project called site. Pick another name.", code: "name_taken" },
		});
		expect(link(root)).toBe(`${TEAM_ORIGIN}/tidemark/site`);

		cloud.lapse("northlight");
		expect((await ada.call("GET", "/teams/tidemark/projects/site/move?to=northlight")).body.refusal).toBe("unpaid");
		expect((await ada.call("POST", "/teams/tidemark/projects/site/move", { to: "northlight" })).body.code).toBe(
			"unpaid",
		);
	});

	it("rewrites spool.json in one commit on the current branch, and keeps syncing the same project there", {
		timeout: 30_000,
	}, async () => {
		const cloud = teams();
		const ada = mac(cloud, "ada", { tidemark: "admin", northlight: "editor" });
		const { root } = await adaStarts(cloud, ada);
		const before = git(root, "rev-parse", "HEAD");
		const saves = cloud.saves("site").length;

		const moved = await ada.call("POST", "/teams/tidemark/projects/site/move", {
			to: "northlight",
			name: "tidemark-site",
		});
		expect(moved).toEqual({
			status: 200,
			body: {
				team: "northlight",
				name: "tidemark-site",
				url: `${TEAM_ORIGIN}/northlight/tidemark-site`,
				roots: [root],
				committed: [root],
				commitWaiting: [],
				losing: [],
			},
		});
		expect(cloud.forward("tidemark/site")).toBe("northlight/tidemark-site");
		expect(link(root)).toBe(`${TEAM_ORIGIN}/northlight/tidemark-site`);
		expect(git(root, "rev-parse", "HEAD~1")).toBe(before);
		expect(git(root, "log", "-1", "--format=%s")).toBe("spool: move site to northlight");
		expect(git(root, "show", "--name-only", "--format=", "HEAD")).toBe("spool.json");
		expect(git(root, "symbolic-ref", "--short", "HEAD")).toBe("main");
		expect(status(root)).toEqual([]);

		// the same project: nothing went up again, and a save reaches it at its new address
		writeFrame(root, "news", "export default () => <h1>News</h1>;\n");
		await until(
			() => cloud.file("northlight/tidemark-site", "frames/news/frame.tsx")?.includes("News") === true,
			10_000,
		);
		expect(
			cloud
				.saves("northlight/tidemark-site")
				.slice(saves)
				.map((save) => save.path),
		).toEqual(["frames/news/frame.tsx"]);
		const [card] = await ada.cards();
		expect(card?.team).toEqual({
			url: `${TEAM_ORIGIN}/northlight/tidemark-site`,
			team: "northlight",
			project: "tidemark-site",
			inRepo: true,
		});
	});

	it("moves a copy kept just on this Mac to the new team's folder, and it keeps syncing there", {
		timeout: 30_000,
	}, async () => {
		const cloud = teams();
		const sam = mac(cloud, "sam", { tidemark: "editor", northlight: "editor" });
		const ada = mac(cloud, "ada", { tidemark: "admin", northlight: "editor" });
		const { root: samRoot } = await adaStarts(cloud, sam);
		const got = await ada.call("POST", "/teams/tidemark/projects/site/get", { where: "mac" });
		const old = join(ada.location, "tidemark", "site");
		expect(got.body.root).toBe(old);

		const preview = await ada.call("GET", "/teams/tidemark/projects/site/move?to=northlight");
		const moved = join(ada.location, "northlight", "site");
		expect(preview.body).toMatchObject({ commits: [], folder: { from: old, to: moved } });
		const answer = await ada.call("POST", "/teams/tidemark/projects/site/move", { to: "northlight" });
		expect(answer.body).toMatchObject({ roots: [moved], committed: [], commitWaiting: [] });
		expect(existsSync(old)).toBe(false);
		expect(link(moved)).toBe(`${TEAM_ORIGIN}/northlight/site`);
		expect(readRegistry(ada.state).projects.map((project) => project.root)).toEqual([moved]);
		expect(text(moved, "frames/home/frame.tsx")).toContain("Home");

		writeFrame(samRoot, "from-sam", "export default () => <h1>Sam</h1>;\n");
		await until(() => text(moved, "frames/from-sam/frame.tsx") !== undefined, 10_000);
	});

	it("leads a teammate's copy on to the new address without touching its spool.json, until they pull", {
		timeout: 30_000,
	}, async () => {
		const cloud = teams();
		const ada = mac(cloud, "ada", { tidemark: "admin", northlight: "editor" });
		const sam = mac(cloud, "sam", { tidemark: "editor", northlight: "editor" });
		const { root, remote } = await adaStarts(cloud, ada);
		const clone = await cloneOf(remote, sam);

		const moved = await ada.call("POST", "/teams/tidemark/projects/site/move", { to: "northlight" });
		expect(moved.status).toBe(200);

		// Sam's copy follows: his saves reach Northlight's project and Ada's reach him, his spool.json as it was
		writeFrame(clone, "from-sam", "export default () => <h1>Sam</h1>;\n");
		await until(() => cloud.file("northlight/site", "frames/from-sam/frame.tsx")?.includes("Sam") === true, 10_000);
		writeFrame(root, "from-ada", "export default () => <h1>Ada</h1>;\n");
		await until(() => text(clone, "frames/from-ada/frame.tsx") !== undefined, 10_000);
		expect(link(clone)).toBe(`${TEAM_ORIGIN}/tidemark/site`);
		expect(status(clone)).toEqual([]);
		const [card] = await sam.cards();
		expect(card?.team).toMatchObject({ url: `${TEAM_ORIGIN}/northlight/site`, team: "northlight" });

		// the pull brings the spool.json that names it, and nothing changes for the copy
		git(root, "push", "--quiet", "pushed", "main");
		git(clone, "pull", "--quiet", "--ff-only", "origin", "main");
		expect(link(clone)).toBe(`${TEAM_ORIGIN}/northlight/site`);
		writeFrame(clone, "after-pull", "export default () => <h1>Pulled</h1>;\n");
		await until(() => cloud.file("northlight/site", "frames/after-pull/frame.tsx") !== undefined, 10_000);
	});

	it("ends the copy of a teammate who isn't in the new team, as being removed does", { timeout: 30_000 }, async () => {
		const cloud = teams();
		const ada = mac(cloud, "ada", { tidemark: "admin", northlight: "editor" });
		const mira = mac(cloud, "mira", { tidemark: "editor" });
		const { remote } = await adaStarts(cloud, ada);
		const clone = await cloneOf(remote, mira);

		const moved = await ada.call("POST", "/teams/tidemark/projects/site/move", { to: "northlight" });
		expect(moved.body.losing).toEqual([{ name: "mira", email: "mira@devosurf.com" }]);

		await untilAsync(async () => (await mira.cards())[0]?.ended === "tidemark");
		const [card] = await mira.cards();
		expect(card?.team).toBeUndefined();
		expect(readFileSync(join(clone, "design", ".gitignore"), "utf8")).toBe(".spool/\n");
		expect(text(clone, "frames/home/frame.tsx")).toContain("Home");
	});
});

describe("Move out of a team", () => {
	it("commits design/ back into git and ends everyone else's copy, whose .gitignore goes once they pull", {
		timeout: 45_000,
	}, async () => {
		const cloud = teams();
		const ada = mac(cloud, "ada", { tidemark: "admin" });
		const mira = mac(cloud, "mira", { tidemark: "editor" });
		const { root, remote } = await adaStarts(cloud, ada);
		const clone = await cloneOf(remote, mira);
		// a save of Mira's not yet on Ada's Mac: the move out waits until Ada's copy has it
		writeFrame(clone, "miras", "export default () => <h1>Mira</h1>;\n");
		await until(() => cloud.file("site", "frames/miras/frame.tsx") !== undefined, 10_000);
		const before = git(root, "rev-parse", "HEAD");

		const out = await ada.call("POST", "/teams/tidemark/projects/site/out", {});
		expect(out).toEqual({ status: 200, body: { root, committed: true, commitWaiting: false } });
		expect(cloud.movedOut("tidemark/site")).toBe(true);
		expect(git(root, "rev-parse", "HEAD~1")).toBe(before);
		expect(git(root, "log", "-1", "--format=%s")).toBe("spool: move site out of tidemark");
		const changes = git(root, "show", "--name-status", "--format=", "HEAD").split("\n");
		expect(changes).toContain("D\tspool.json");
		expect(changes).toContain("A\tdesign/frames/miras/frame.tsx");
		expect(changes).toContain("A\tdesign/canvas.json");
		expect(changes).toContain("A\tdesign/.gitignore");
		expect(changes.some((change) => change.includes(".spool/"))).toBe(false);
		expect(existsSync(join(root, "spool.json"))).toBe(false);
		expect(readFileSync(join(root, "design", ".gitignore"), "utf8")).toBe(".spool/\n");
		expect(status(root)).toEqual([]);
		const [adas] = await ada.cards();
		expect(adas?.team).toBeUndefined();
		expect(adas?.ended).toBeUndefined();

		// Mira's copy ends still out of git, saying so, until the pull brings design/ back over it
		await untilAsync(async () => (await mira.cards())[0]?.movedOut === "Tidemark");
		expect((await mira.cards())[0]).toMatchObject({ ended: "tidemark", movedOut: "Tidemark" });
		expect(readFileSync(join(clone, "design", ".gitignore"), "utf8")).toBe("*\n");
		git(root, "push", "--quiet", "pushed", "main");
		git(clone, "pull", "--quiet", "--ff-only", "origin", "main");
		expect(existsSync(join(clone, "spool.json"))).toBe(false);
		await untilAsync(async () => (await mira.cards())[0]?.movedOut === undefined);
		expect(readFileSync(join(clone, "design", ".gitignore"), "utf8")).toBe(".spool/\n");
		expect(status(clone)).toEqual([]);
	});

	it("takes the team's .gitignore away once design/ is tracked again, if it is still the team's", {
		timeout: 45_000,
	}, async () => {
		const cloud = teams();
		const ada = mac(cloud, "ada", { tidemark: "admin" });
		const mira = mac(cloud, "mira", { tidemark: "editor" });
		const { root, remote } = await adaStarts(cloud, ada);
		const clone = await cloneOf(remote, mira);
		const out = await ada.call("POST", "/teams/tidemark/projects/site/out", {});
		expect(out.status).toBe(200);
		await untilAsync(async () => (await mira.cards())[0]?.movedOut === "Tidemark");

		// someone commits design/ back without a .gitignore of its own
		git(root, "rm", "--quiet", "--cached", "design/.gitignore");
		git(root, "commit", "--quiet", "-m", "no ignore");
		git(root, "push", "--quiet", "pushed", "main");
		git(clone, "pull", "--quiet", "--ff-only", "origin", "main");
		await untilAsync(async () => (await mira.cards())[0]?.movedOut === undefined);
		expect(existsSync(join(clone, "design", ".gitignore"))).toBe(false);
	});

	it("is an admin's alone", { timeout: 30_000 }, async () => {
		const cloud = teams();
		const ada = mac(cloud, "ada", { tidemark: "admin" });
		const sam = mac(cloud, "sam", { tidemark: "editor" });
		const { remote } = await adaStarts(cloud, ada);
		const clone = await cloneOf(remote, sam);
		const refused = await sam.call("POST", "/teams/tidemark/projects/site/out", { path: clone });
		expect(refused).toEqual({
			status: 409,
			body: { error: "Only an admin of Tidemark can move a project out of it.", code: "admin_required" },
		});
		expect(existsSync(join(clone, "spool.json"))).toBe(true);
		expect(cloud.movedOut("tidemark/site")).toBe(false);
	});
});

describe("Move into a checkout", () => {
	/** Ada's pitch, kept just on her Mac under ~/spool, and her clone of the repo it belongs in. */
	async function pitch(cloud: Cloud, ada: ReturnType<typeof mac>) {
		const got = await initTeamProject(
			(() => {
				const dir = join(ada.location, "tidemark", "pitch");
				mkdirSync(dir, { recursive: true });
				return dir;
			})(),
			ada.state,
			{ team: "tidemark", origin: TEAM_ORIGIN, request: ada.machine.request, openSocket: ada.machine.openSocket },
		);
		writeFrame(got.root, "cover", "export default () => <h1>Cover</h1>;\n");
		await until(() => cloud.file("pitch", "frames/cover/frame.tsx") !== undefined, 10_000);
		return { root: got.root, clone: repo("pitch-deck", "git@github.com:tidemark/pitch-deck.git") };
	}

	it("moves design/ into the clone, commits spool.json and the AGENTS.md line, and syncs on without going up again", {
		timeout: 30_000,
	}, async () => {
		const cloud = teams();
		const ada = mac(cloud, "ada", { tidemark: "admin" });
		const { root, clone } = await pitch(cloud, ada);
		const before = git(clone, "rev-parse", "HEAD");
		const saves = cloud.saves("pitch").length;

		const into = await ada.call("POST", "/teams/tidemark/projects/pitch/into", { path: root, checkout: clone });
		expect(into).toEqual({ status: 200, body: { root: clone, committed: true, commitWaiting: false } });
		expect(ada.trashed).toEqual([root]);
		expect(text(clone, "frames/cover/frame.tsx")).toContain("Cover");
		expect(link(clone)).toBe(`${TEAM_ORIGIN}/tidemark/pitch`);
		expect(readFileSync(join(clone, "AGENTS.md"), "utf8")).toBe(`${AGENTS_LINE}\n`);
		expect(git(clone, "rev-parse", "HEAD~1")).toBe(before);
		expect(git(clone, "log", "-1", "--format=%s")).toBe("spool: bring pitch into this repo");
		expect(git(clone, "show", "--name-only", "--format=", "HEAD").split("\n").sort()).toEqual([
			"AGENTS.md",
			"spool.json",
		]);
		expect(status(clone)).toEqual([]);
		expect(cloud.repo("pitch")).toBe("github.com/tidemark/pitch-deck");
		expect(readRegistry(ada.state).projects.map((project) => project.root)).toEqual([clone]);

		writeFrame(clone, "next", "export default () => <h1>Next</h1>;\n");
		await until(() => cloud.file("pitch", "frames/next/frame.tsx") !== undefined, 10_000);
		expect(
			cloud
				.saves("pitch")
				.slice(saves)
				.map((save) => save.path),
		).toEqual(["frames/next/frame.tsx"]);
		const [card] = await ada.cards();
		expect(card?.team).toMatchObject({ inRepo: true });
	});

	it("refuses a checkout with a design/ of its own, a folder that isn't one, and a copy already in a repo", {
		timeout: 30_000,
	}, async () => {
		const cloud = teams();
		const ada = mac(cloud, "ada", { tidemark: "admin" });
		const { root, clone } = await pitch(cloud, ada);
		mkdirSync(join(clone, "design"));
		const taken = await ada.call("POST", "/teams/tidemark/projects/pitch/into", { path: root, checkout: clone });
		expect(taken).toEqual({
			status: 409,
			body: {
				error: `${clone} already has a design/ folder. Choose another checkout.`,
				code: "checkout_has_design",
			},
		});
		expect(text(root, "frames/cover/frame.tsx")).toContain("Cover");
		expect(existsSync(join(clone, "spool.json"))).toBe(false);

		const loose = realpathSync(makeTempDir());
		expect(
			(await ada.call("POST", "/teams/tidemark/projects/pitch/into", { path: root, checkout: loose })).body.code,
		).toBe("not_a_checkout");
		const [card] = await ada.cards();
		expect(card?.team).toMatchObject({ inRepo: false });
	});
});

/** Wait for an asynchronous condition, a look every 50 ms. */
async function untilAsync(condition: () => Promise<boolean>, ms = 10_000): Promise<void> {
	const deadline = Date.now() + ms;
	while (!(await condition())) {
		if (Date.now() > deadline) throw new Error("timed out");
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}
