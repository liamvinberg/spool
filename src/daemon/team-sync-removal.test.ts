import { execFile } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmdirSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { fetchLocalCopy } from "../open";
import { readRegistry } from "../registry";
import { TEAM_ORIGIN } from "../team-sync-test-harness";
import { until, writeDesignFile } from "../test-helpers";
import { git, same, twoEditors } from "./team-sync-editors";

/**
 * A followed copy's folder removed, as an agent's worktree is when its task closes (#243): however it goes, the team
 * loses nothing, the removal isn't stopped by a write into it, and the copy is no longer followed. A person's deletes
 * inside a copy that stays whole still reach the team.
 */

const sleep = (ms: number) => new Promise((wake) => setTimeout(wake, ms));
/** Longer than a copy holds what went from disk before it judges the folder. */
const JUDGED_MS = 1_500;

/** A worktree of Ana's checkout the daemon follows as a local copy, holding the team's 140 shared parts. */
async function followedLane() {
	const editors = await twoEditors({ leftLookMs: 100 });
	const { cloud, ana, ben } = editors;
	git(ana.root, "add", "spool.json");
	git(ana.root, "commit", "--quiet", "-m", "spool.json");
	for (let at = 0; at < 140; at++) writeDesignFile(ben.root, `shared/ui/spool/part-${at}.tsx`, `part ${at}\n`);
	await until(() => cloud.paths("checkout").filter((path) => path.startsWith("shared/ui/spool/")).length === 140);
	const lane = join(dirname(ana.root), "lane");
	git(ana.root, "worktree", "add", "--quiet", "-b", "lane", lane);
	await fetchLocalCopy(lane, ana.state, {
		origin: TEAM_ORIGIN,
		request: ana.machine.request,
		openSocket: ana.machine.openSocket,
	});
	await until(() => same(ben.root, lane, "shared/ui/spool/part-139.tsx"));
	writeDesignFile(lane, "frames/lane/frame.tsx", "from the lane\n");
	await until(() => cloud.file("checkout", "frames/lane/frame.tsx") === "from the lane\n");
	const team = () => cloud.paths("checkout").map((path) => [path, cloud.file("checkout", path)]);
	return { ...editors, lane, team: team(), saves: cloud.saves("checkout").length, teamNow: team };
}

/** Whether this machine still knows the lane: in its registry, or among the copies it has synced. */
function known(state: string, lane: string): boolean {
	const synced = JSON.parse(readFileSync(join(state, "synced-copies.json"), "utf8")) as Record<string, string>;
	return readRegistry(state).projects.some((project) => project.root === lane) || Object.hasOwn(synced, lane);
}

/** Run a command beside the daemon, as a cleanup does: a synchronous one would hold its watcher till it is over. */
function run(command: string, args: string[], cwd: string): Promise<string | undefined> {
	return new Promise((done) => execFile(command, args, { cwd }, (error) => done(error?.message)));
}

/** Every path under a folder, files and folders alike. */
function listing(dir: string): string[] {
	return readdirSync(dir, { recursive: true, encoding: "utf8" })
		.map((path) => relative(dir, join(dir, path)))
		.sort();
}

/**
 * Remove a folder depth first, a pause after each entry of its top two levels, as a loaded machine walks a big tree;
 * `first` is the order this disk lists the names it holds. Stops at `stopAt`, as a removal that fails half way.
 */
async function removeSlowly(dir: string, first: string[], stopAt: string, depth = 0): Promise<boolean> {
	const names = readdirSync(dir);
	const ordered = [...first.filter((name) => names.includes(name)), ...names.filter((name) => !first.includes(name))];
	for (const name of ordered) {
		const path = join(dir, name);
		if (path === stopAt) return false;
		if (statSync(path).isDirectory()) {
			if (!(await removeSlowly(path, first, stopAt, depth + 1))) return false;
		} else unlinkSync(path);
		if (depth < 2) await sleep(100);
	}
	rmdirSync(dir);
	return true;
}

describe("a followed copy's folder removed", () => {
	it("by git worktree remove --force takes nothing from the team, and the copy is forgotten", async () => {
		const { cloud, ana, ben, lane, team, saves, teamNow } = await followedLane();
		// a worktree's bulk beside design/, which git walks on through after design/ has gone
		for (let at = 0; at < 20_000; at++) {
			const file = join(lane, `pkg-${at % 40}`, `file-${at}.js`);
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, "x\n");
		}

		expect(await run("git", ["worktree", "remove", "--force", lane], ana.root)).toBeUndefined();

		await until(() => !known(ana.state, lane));
		writeDesignFile(ben.root, "frames/after/frame.tsx", "after the lane\n");
		await until(() => same(ben.root, ana.root, "frames/after/frame.tsx"));
		await sleep(JUDGED_MS);
		expect(teamNow().filter(([path]) => path !== "frames/after/frame.tsx")).toEqual(team);
		expect(cloud.saves("checkout").length).toBe(saves + 1);
		expect(existsSync(lane)).toBe(false);
	}, 60_000);

	it("by rm -rf of its root takes nothing from the team, and the copy is forgotten", async () => {
		const { cloud, ana, lane, team, saves } = await followedLane();

		expect(await run("rm", ["-rf", lane], ana.root)).toBeUndefined();

		await until(() => !known(ana.state, lane));
		await sleep(JUDGED_MS);
		expect(cloud.paths("checkout").map((path) => [path, cloud.file("checkout", path)])).toEqual(team);
		expect(cloud.saves("checkout").length).toBe(saves);
	});

	it("half way, the removal stopping, takes nothing, writes nothing into what is left, and goes once the rest does", async () => {
		const { cloud, ana, ben, lane, team, saves } = await followedLane();
		// devobee's order: what stood before design/, then design/ as its disk lists it, stopped before canvas.json
		const order = [
			".git",
			"spool.json",
			"design",
			".gitignore",
			"shared",
			"ui",
			"frames",
			"CLAUDE.md",
			"canvas.json",
		];
		expect(await removeSlowly(lane, order, join(lane, "design", "canvas.json"))).toBe(false);
		const left = listing(lane);

		writeDesignFile(ben.root, "frames/after/frame.tsx", "after the lane\n");
		await until(() => same(ben.root, ana.root, "frames/after/frame.tsx"));
		await sleep(JUDGED_MS);
		expect(
			cloud
				.paths("checkout")
				.filter((path) => path !== "frames/after/frame.tsx")
				.map((path) => [path, cloud.file("checkout", path)]),
		).toEqual(team);
		expect(cloud.saves("checkout").length).toBe(saves + 1);
		expect(listing(lane)).toEqual(left);
		expect(known(ana.state, lane)).toBe(true);

		rmSync(lane, { recursive: true });
		await until(() => !known(ana.state, lane));
		expect(cloud.saves("checkout").length).toBe(saves + 1);
	});
});

describe("deletes in a copy that stays whole", () => {
	it("all reach the team, fifty at once", async () => {
		const { cloud, ben, lane } = await followedLane();
		const parts = Array.from({ length: 50 }, (_, at) => `shared/ui/spool/part-${at}.tsx`);

		for (const path of parts) rmSync(join(lane, "design", path));

		await until(() => parts.every((path) => cloud.file("checkout", path) === null));
		await until(() => parts.every((path) => !existsSync(join(ben.root, "design", path))));
		expect(cloud.file("checkout", "shared/ui/spool/part-50.tsx")).toBe("part 50\n");
	});
});
