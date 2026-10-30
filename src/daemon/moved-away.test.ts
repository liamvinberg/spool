import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectCard } from "../daemon/projection";
import { initProject } from "../init";
import { openProject } from "../open";
import { fakeTeam } from "../team-sync-test-harness";
import { makeApp, makeTempDir, until, writeFrame } from "../test-helpers";
import { MOVE_MESSAGE } from "./history";

/**
 * Someone outside the team pulls the commit that moved a project into it (spool#194): Home's cover says where design/
 * went and who moved it, from git's move commit, and a sheet says what this account can do, by its standing alone.
 */

const json = { "content-type": "application/json", origin: "http://localhost:7766" };

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Ada's project in git, pushed, moved into devosurf by her daemon and pushed again: the move commit is hers. */
async function adaMoves(cloud: ReturnType<typeof fakeTeam>, before: (remote: string) => string) {
	const remote = join(makeTempDir(), "remote.git");
	git(makeTempDir(), "init", "--quiet", "--bare", "--initial-branch=main", remote);
	const root = join(makeTempDir(), "kaffe");
	mkdirSync(root);
	git(root, "init", "--quiet", "--initial-branch=main", ".");
	git(root, "config", "user.email", "ada@example.test");
	git(root, "config", "user.name", "Ada Lind");
	git(root, "config", "commit.gpgsign", "false");
	const state = join(makeTempDir(), ".spool");
	initProject(root, state);
	writeFrame(root, "home", "export default () => <h1>Home</h1>;\n");
	git(root, "add", "-A");
	git(root, "commit", "--quiet", "-m", "start");
	git(root, "remote", "add", "origin", remote);
	git(root, "push", "--quiet", "origin", "main");
	const theirs = before(remote);
	const ada = makeApp(state, { cloud: cloud.machine("ada").cloud, teamNotice: () => {} });
	const moved = await ada.controlRequest("/api/cloud/teams/devosurf/move", {
		method: "POST",
		headers: json,
		body: JSON.stringify({ path: realpathSync(root) }),
	});
	expect(moved.status, await moved.clone().text()).toBe(200);
	await until(() => git(root, "log", "-1", "--format=%s") === MOVE_MESSAGE, 10_000);
	git(root, "push", "--quiet", "origin", "main");
	return { root: realpathSync(root), theirs };
}

/** Ben's clone, from before the move, opened on his Mac, with a frame he never committed. */
function bensClone(remote: string): { root: string; state: string } {
	const parent = realpathSync(makeTempDir());
	git(parent, "clone", "--quiet", remote, "kaffe");
	const root = join(parent, "kaffe");
	git(root, "config", "user.email", "ben@example.test");
	git(root, "config", "user.name", "Ben");
	const state = join(makeTempDir(), ".spool");
	openProject(root, state);
	writeFrame(root, "sketch", "export default () => <h1>Ben's sketch</h1>;\n");
	return { root, state };
}

type MovedCard = ProjectCard & {
	moved?: {
		team: string;
		url: string;
		standing: string;
		commit: { hash: string; author: string; date: string } | null;
		leftover: string[];
	};
};

async function cardOf(daemon: ReturnType<typeof makeApp>, root: string): Promise<MovedCard | undefined> {
	const body = (await (await daemon.controlRequest("/api/projects")).json()) as { projects: MovedCard[] };
	return body.projects.find((project) => project.root === root);
}

/** Wait for what Home reads of a card to hold. */
async function cardUntil(condition: () => Promise<boolean>): Promise<void> {
	const start = Date.now();
	while (!(await condition())) {
		if (Date.now() - start > 10_000) throw new Error("condition never held");
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

describe("design/ moved away", () => {
	it("says on the cover where design/ went and who moved it, from git, to someone outside the team, until it is removed", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ben = cloud.machine("ben", null);
		const asked: string[] = [];
		const { root: ada, theirs } = await adaMoves(cloud, (remote) => JSON.stringify(bensClone(remote)));
		const clone = JSON.parse(theirs) as { root: string; state: string };
		const daemon = makeApp(clone.state, {
			cloud: {
				...ben.cloud,
				fetch: (input, init) => {
					asked.push(new Request(input, init).url);
					return ben.cloud.fetch(input, init);
				},
			},
			teamNotice: () => {},
		});

		git(clone.root, "pull", "--quiet", "--ff-only", "origin", "main");
		await cardUntil(async () => (await cardOf(daemon, clone.root))?.moved !== undefined);
		const card = await cardOf(daemon, clone.root);
		expect(card?.moved).toEqual({
			team: "devosurf",
			url: "https://cloud.test/devosurf/kaffe",
			standing: "outside",
			commit: {
				hash: git(ada, "rev-parse", "HEAD"),
				author: "Ada Lind",
				date: git(ada, "log", "-1", "--format=%aI"),
			},
			leftover: ["sketch"],
		});
		// the canvas's sync says it too, for the sheet over an open canvas
		const sync = (await (await daemon.controlRequest("/api/p/kaffe/sync")).json()) as { moved: unknown };
		expect(sync.moved).toEqual(card?.moved);
		// the frame never committed stays, unsent
		expect(readFileSync(join(clone.root, "design/frames/sketch/frame.tsx"), "utf8")).toContain("sketch");
		expect(cloud.file("kaffe", "frames/sketch/frame.tsx")).toBeUndefined();
		// spool.page was asked only about this account and the project (its covers too), never who is in the team
		expect(asked.length).toBeGreaterThan(0);
		for (const url of asked)
			expect(new URL(url).pathname).toMatch(/^\/api\/(me|teams|teams\/devosurf\/projects\/kaffe(\/covers)?)$/u);

		// removed, it leaves Home, and the frame never committed stays on disk
		const forgot = await daemon.controlRequest("/api/projects/forget", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ root: clone.root }),
		});
		expect(forgot.ok).toBe(true);
		expect(await cardOf(daemon, clone.root)).toBeUndefined();
		expect(existsSync(join(clone.root, "design/frames/sketch/frame.tsx"))).toBe(true);
	});

	it("fills the copy in by itself once the account is made an editor, sending the frames never committed", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ben = cloud.machine("ben", null);
		const { theirs } = await adaMoves(cloud, (remote) => JSON.stringify(bensClone(remote)));
		const clone = JSON.parse(theirs) as { root: string; state: string };
		const daemon = makeApp(clone.state, { cloud: ben.cloud, teamNotice: () => {}, movedAskMs: 200 });
		git(clone.root, "pull", "--quiet", "--ff-only", "origin", "main");
		await cardUntil(async () => (await cardOf(daemon, clone.root))?.moved !== undefined);

		cloud.role("ben", "editor");
		await until(() => existsSync(join(clone.root, "design/frames/home/frame.tsx")), 10_000);
		await until(() => cloud.file("kaffe", "frames/sketch/frame.tsx")?.includes("sketch") === true, 10_000);
		await cardUntil(async () => (await cardOf(daemon, clone.root))?.moved === undefined);
		expect(git(clone.root, "status", "--porcelain")).toBe("");
	});

	it("says a viewer is one, and a signed-out Mac is signed out", { timeout: 30_000 }, async () => {
		const cloud = fakeTeam();
		const vera = cloud.machine("vera", "viewer");
		const clones: { root: string; state: string }[] = [];
		await adaMoves(cloud, (remote) => {
			clones.push(bensClone(remote), bensClone(remote));
			return "";
		});
		const [viewer, signedOut] = clones as [{ root: string; state: string }, { root: string; state: string }];
		const viewing = makeApp(viewer.state, { cloud: vera.cloud, teamNotice: () => {} });
		const out = makeApp(signedOut.state, {
			cloud: { ...vera.cloud, vault: { read: async () => undefined } },
			teamNotice: () => {},
		});
		git(viewer.root, "pull", "--quiet", "--ff-only", "origin", "main");
		git(signedOut.root, "pull", "--quiet", "--ff-only", "origin", "main");
		await cardUntil(async () => (await cardOf(viewing, viewer.root))?.moved?.standing === "viewer");
		await cardUntil(async () => (await cardOf(out, signedOut.root))?.moved?.standing === "signed-out");
		expect((await cardOf(out, signedOut.root))?.moved?.commit?.author).toBe("Ada Lind");
	});
});
