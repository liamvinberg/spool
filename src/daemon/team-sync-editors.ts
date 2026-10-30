import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { initTeamProject } from "../init";
import { fetchLocalCopy, openProject } from "../open";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { makeApp, makeTempDir } from "../test-helpers";

/**
 * Two editors on one fake spool.page, as the team sync suites set them up: each machine its own state folder,
 * repo and daemon.
 */

export function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/** A fresh repository with a folder named for the project, as a product checkout is. */
export function repo(name = "checkout"): string {
	const root = join(makeTempDir(), name);
	mkdirSync(root);
	git(root, "init", "--quiet", "--initial-branch=main", ".");
	git(root, "config", "user.email", "hands@example.test");
	git(root, "config", "user.name", "Hands");
	git(root, "config", "commit.gpgsign", "false");
	return root;
}

export function status(root: string): string[] {
	return git(root, "status", "--porcelain", "--untracked-files=all").split("\n").filter(Boolean);
}

export const read = (root: string, path: string) => readFileSync(join(root, "design", path));
export const encode = (text: string) => new TextEncoder().encode(text);
export const same = (a: string, b: string, path: string) =>
	existsSync(join(b, "design", path)) && read(a, path).equals(read(b, path));

/** Ana starts the team project; Ben's clone fetches it; both daemons follow their local copies. */
export async function twoEditors(options: Partial<Parameters<typeof makeApp>[1]> = {}) {
	const cloud = fakeTeam();
	const ana = cloud.machine("ana");
	const ben = cloud.machine("ben");
	const anaState = join(makeTempDir(), ".spool");
	const benState = join(makeTempDir(), ".spool");
	const { root: anaRoot, link } = await initTeamProject(repo(), anaState, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: ana.request,
		openSocket: ana.openSocket,
	});
	const benRoot = realpathSync(repo());
	copyFileSync(join(anaRoot, "spool.json"), join(benRoot, "spool.json"));
	await fetchLocalCopy(benRoot, benState, { origin: TEAM_ORIGIN, request: ben.request, openSocket: ben.openSocket });
	openProject(benRoot, benState);
	// what each daemon says, as its owner would read it
	const said = { ana: [] as string[], ben: [] as string[] };
	const anaDaemon = makeApp(anaState, {
		cloud: ana.cloud,
		teamNotice: (message) => said.ana.push(message),
		...options,
	});
	const benDaemon = makeApp(benState, {
		cloud: ben.cloud,
		teamNotice: (message) => said.ben.push(message),
		...options,
	});
	return {
		cloud,
		link,
		said,
		ana: { root: anaRoot, daemon: anaDaemon, state: anaState, machine: ana },
		ben: { root: benRoot, daemon: benDaemon, state: benState, machine: ben },
	};
}

export interface Mark {
	id: string;
	path: string;
	kind: string;
	deleted: boolean;
	frames: string[];
	by: string | null;
	file: string | null;
	together: number;
}

export async function marks(daemon: ReturnType<typeof makeApp>): Promise<Mark[]> {
	return ((await (await daemon.request("/api/p/checkout/set-aside")).json()) as { marks: Mark[] }).marks;
}

export const text = (root: string, path: string) =>
	existsSync(join(root, "design", path)) ? read(root, path).toString() : undefined;

/** Run git with extra environment and input, as plumbing that never touches the work tree needs. */
export function plumb(cwd: string, env: Record<string, string>, input: string | undefined, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env }, input }).trim();
}

/** A commit of exactly these files, made beside the work tree and index so nothing on disk moves. */
export function commitFiles(root: string, files: Record<string, string>, parent?: string): string {
	const index = { GIT_INDEX_FILE: join(makeTempDir(), "index") };
	for (const [path, content] of Object.entries(files)) {
		const blob = plumb(root, {}, content, "hash-object", "-w", "--stdin");
		plumb(root, index, undefined, "update-index", "--add", "--cacheinfo", `100644,${blob},${path}`);
	}
	const tree = plumb(root, index, undefined, "write-tree");
	return plumb(root, {}, undefined, "commit-tree", tree, ...(parent === undefined ? [] : ["-p", parent]), "-m", "old");
}

/** What a canvas opened on the project now is told of its sync: an ending, a pause, and what didn't travel. */
export async function untold(daemon: ReturnType<typeof makeApp>, project = "checkout"): Promise<string[]> {
	return (
		(await (await daemon.request(`/api/p/${project}/sync/untold`, { method: "POST" })).json()) as { lines: string[] }
	).lines;
}

export async function syncState(daemon: ReturnType<typeof makeApp>, project = "checkout") {
	return (await daemon.request(`/api/p/${project}/sync`)).json();
}
