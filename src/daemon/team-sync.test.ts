import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { initTeamProject } from "../init";
import { fetchLocalCopy, openProject } from "../open";
import { readRegistry } from "../registry";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { makeApp, makeTempDir, until, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * Team sync as an editor sees it: two machines, each its own state folder and repo, each a daemon, against
 * one fake spool.page. Every assertion is on disk, on git, on what reached the team, or on what a canvas
 * reads, never on the protocol's messages.
 */

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/** A fresh repository with a folder named for the project, as a product checkout is. */
function repo(name = "checkout"): string {
	const root = join(makeTempDir(), name);
	mkdirSync(root);
	git(root, "init", "--quiet", "--initial-branch=main", ".");
	git(root, "config", "user.email", "hands@example.test");
	git(root, "config", "user.name", "Hands");
	git(root, "config", "commit.gpgsign", "false");
	return root;
}

function status(root: string): string[] {
	return git(root, "status", "--porcelain", "--untracked-files=all").split("\n").filter(Boolean);
}

const read = (root: string, path: string) => readFileSync(join(root, "design", path));
const same = (a: string, b: string, path: string) =>
	existsSync(join(b, "design", path)) && read(a, path).equals(read(b, path));

/** Ana starts the team project; Ben's clone fetches it; both daemons follow their local copies. */
async function twoEditors() {
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
	const anaDaemon = makeApp(anaState, {
		teamSyncServices: { ...ana.services, notice: () => {} },
		cloudTeamsRequest: ana.request,
	});
	const benDaemon = makeApp(benState, {
		teamSyncServices: { ...ben.services, notice: () => {} },
		cloudTeamsRequest: ben.request,
	});
	return { cloud, link, ana: { root: anaRoot, daemon: anaDaemon }, ben: { root: benRoot, daemon: benDaemon } };
}

describe("spool init --team", () => {
	it("starts the project in the team, tracks only spool.json, and uploads the scaffold", async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, link, uploaded } = await initTeamProject(repo("checkout"), spoolDir, {
			team: "Devosurf",
			origin: TEAM_ORIGIN,
			request: ana.request,
			openSocket: ana.openSocket,
		});

		expect(link.url).toBe(`${TEAM_ORIGIN}/devosurf/checkout`);
		expect(JSON.parse(readFileSync(join(root, "spool.json"), "utf8"))).toEqual({ project: link.url });
		expect(readFileSync(join(root, "design/.gitignore"), "utf8")).toBe("*\n");
		expect(JSON.parse(readFileSync(join(root, "design/canvas.json"), "utf8"))).toMatchObject({ history: false });
		expect(status(root)).toEqual(["?? spool.json"]);
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([root]);
		expect(uploaded).toBe(true);
		expect(cloud.paths("checkout")).toEqual([
			"AGENTS.md",
			"CLAUDE.md",
			"canvas.json",
			"shared/fonts.css",
			"shared/importmap.json",
			"shared/lib/utils.ts",
			"shared/scenarios/default.json",
			"shared/tokens.css",
			"shared/transitions.css",
		]);
	});

	it("says why it can't, and writes nothing", async () => {
		const cloud = fakeTeam();
		const cases = [
			{ who: cloud.machine("olaf", null), team: "devosurf", says: /not in a team called "devosurf"/u },
			{ who: cloud.machine("vera", "viewer"), team: "devosurf", says: /viewer of Devosurf/u },
			{ who: cloud.machine("ana"), team: "tidemark", says: /not in a team called "tidemark"; you're in Devosurf/u },
		];
		for (const { who, team, says } of cases) {
			const root = repo();
			await expect(
				initTeamProject(root, join(makeTempDir(), ".spool"), {
					team,
					origin: TEAM_ORIGIN,
					request: who.request,
					openSocket: who.openSocket,
				}),
			).rejects.toThrow(says);
			expect(existsSync(join(root, "design"))).toBe(false);
			expect(existsSync(join(root, "spool.json"))).toBe(false);
		}
		const signedOut = repo();
		await expect(
			initTeamProject(signedOut, join(makeTempDir(), ".spool"), {
				team: "devosurf",
				origin: TEAM_ORIGIN,
				request: { origin: TEAM_ORIGIN, vault: { read: async () => undefined } },
			}),
		).rejects.toThrow(/run `spool login`/u);
	});
});

describe("fetching a local copy", () => {
	it("fills a clone's missing design/ from the team, out of git", async () => {
		const { cloud, ana, ben } = await twoEditors();
		expect(cloud.paths("checkout").every((path) => same(ana.root, ben.root, path))).toBe(true);
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe("*\n");
		expect(status(ben.root)).toEqual(["?? spool.json"]);
	});

	it("tells a viewer and a non-member what to do instead", async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const anaRoot = repo();
		await initTeamProject(anaRoot, join(makeTempDir(), ".spool"), {
			team: "devosurf",
			origin: TEAM_ORIGIN,
			request: ana.request,
			openSocket: ana.openSocket,
		});
		for (const [who, says] of [
			[cloud.machine("vera", "viewer"), /viewer of devosurf; open https:\/\/cloud\.test\/devosurf\/checkout/u],
			[cloud.machine("olaf", null), /ask an admin of devosurf to invite you/u],
		] as const) {
			const clone = repo();
			copyFileSync(join(anaRoot, "spool.json"), join(clone, "spool.json"));
			await expect(
				fetchLocalCopy(clone, join(makeTempDir(), ".spool"), {
					origin: TEAM_ORIGIN,
					request: who.request,
					openSocket: who.openSocket,
				}),
			).rejects.toThrow(says);
			expect(existsSync(join(clone, "design"))).toBe(false);
		}
	});
});

describe("a save", () => {
	it("reaches a teammate's design/ as the same bytes, and their canvas", async () => {
		const { ana, ben } = await twoEditors();
		const tsx = "export default function Home() {\n\treturn <h1>Home</h1>;\n}\n";
		writeFrame(ana.root, "home", tsx);
		writeDesignFile(ana.root, "frames/home/frame.json", '{ "x": 40, "y": 80, "w": 390, "h": 844 }\n');

		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		await until(() => same(ana.root, ben.root, "frames/home/frame.json"));
		const frames = (await (await ben.daemon.request("/api/p/checkout/frames")).json()) as {
			frames: { name: string; x: number; y: number }[];
		};
		expect(frames.frames).toMatchObject([{ name: "home", x: 40, y: 80 }]);

		// and back the other way, edits and deletes alike
		writeFrame(ben.root, "home", tsx.replace("Home</h1>", "Welcome</h1>"));
		await until(() => read(ana.root, "frames/home/frame.tsx").toString().includes("Welcome"));
		rmSync(join(ben.root, "design/frames/home"), { recursive: true });
		await until(() => !existsSync(join(ana.root, "design/frames/home")));
	});

	it("carries layout and binary assets, and keeps camera, caches and foreign files on the machine", async () => {
		const { cloud, ana, ben } = await twoEditors();
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3, 255, 254, 0]);
		writeDesignFile(ana.root, ".spool/camera.json", '{ "x": 1 }\n');
		writeDesignFile(ana.root, ".spool/compiled/home.js", "cache\n");
		writeDesignFile(ana.root, ".claude/settings.json", "{}\n");
		writeDesignFile(ana.root, "frames/home/.env", "SECRET=1\n");
		writeDesignFile(ana.root, "notes.txt", "mine\n");
		writeFileSync(join(ana.root, "design/.gitignore"), "*\n# mine\n");
		mkdirSync(join(ana.root, "design/shared/assets"), { recursive: true });
		writeFileSync(join(ana.root, "design/shared/assets/hero.png"), png);
		writeFrame(ana.root, "home", "export default () => <img src={hero} />;\n");
		symlinkSync("/etc/hosts", join(ana.root, "design/frames/home/hosts.txt"));
		const canvas = JSON.parse(read(ana.root, "canvas.json").toString());
		writeDesignFile(
			ana.root,
			"canvas.json",
			`${JSON.stringify({ ...canvas, order: { "": ["home"] } }, null, "\t")}\n`,
		);

		await until(() => same(ana.root, ben.root, "shared/assets/hero.png"));
		await until(() => same(ana.root, ben.root, "canvas.json"));
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		expect(read(ben.root, "shared/assets/hero.png").equals(png)).toBe(true);
		for (const local of [
			".spool/camera.json",
			".spool/compiled/home.js",
			".claude/settings.json",
			"frames/home/.env",
			"notes.txt",
			"frames/home/hosts.txt",
		]) {
			expect(existsSync(join(ben.root, "design", local)), local).toBe(false);
			expect(cloud.file("checkout", local), local).toBeUndefined();
		}
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe("*\n");
	});

	it("is never sent back by the machine it arrived on", async () => {
		const { cloud, ana, ben } = await twoEditors();
		const before = cloud.saves("checkout").length;
		writeFrame(ana.root, "home", "export default () => <h1>Home</h1>;\n");
		writeFrame(ana.root, "about", "export default () => <h1>About</h1>;\n");
		await until(() => same(ana.root, ben.root, "frames/about/frame.tsx"));
		await new Promise((wake) => setTimeout(wake, 300));
		expect(cloud.saves("checkout").slice(before)).toMatchObject([
			{ by: "ana", outcome: "applied" },
			{ by: "ana", outcome: "applied" },
		]);
	});

	it("writes nothing a forged team message names outside the layout", async () => {
		const { cloud, ana } = await twoEditors();
		const evil = new TextEncoder().encode("[core]\n\tsshCommand = touch /tmp/owned\n");
		for (const path of ["../.git/config", ".claude/settings.json", "frames/../../escape", ".gitignore"])
			cloud.forge("checkout", { type: "file", path, version: 99, deleted: false }, evil);
		writeFrame(ana.root, "home", "export default () => null;\n");
		await until(() => cloud.file("checkout", "frames/home/frame.tsx") !== undefined);
		expect(existsSync(join(dirname(ana.root), "escape"))).toBe(false);
		expect(existsSync(join(ana.root, "design/.claude"))).toBe(false);
		expect(readFileSync(join(ana.root, "design/.gitignore"), "utf8")).toBe("*\n");
		expect(readFileSync(join(ana.root, ".git/config"), "utf8")).not.toContain("sshCommand");
	});

	it("made while disconnected goes up on reconnect, and one built on an old version takes the team's", async () => {
		const { cloud, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "first\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));

		cloud.disconnect("checkout");
		writeFrame(ana.root, "home", "ana offline\n");
		writeFrame(ana.root, "about", "about\n");
		await new Promise((wake) => setTimeout(wake, 100));
		writeFrame(ben.root, "home", "ben online\n");
		// whichever reaches the team first stands; the other machine's disk takes it
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"), 10_000);
		await until(() => same(ana.root, ben.root, "frames/about/frame.tsx"), 10_000);
		expect(cloud.file("checkout", "frames/home/frame.tsx")).toBe(read(ana.root, "frames/home/frame.tsx").toString());
		expect(cloud.saves("checkout").filter((save) => save.path === "frames/home/frame.tsx")).toEqual(
			expect.arrayContaining([expect.objectContaining({ outcome: "set_aside" })]),
		);
	});
});

interface Mark {
	id: string;
	path: string;
	kind: string;
	deleted: boolean;
	frames: string[];
	by: string | null;
	file: string | null;
	together: number;
}

async function marks(daemon: ReturnType<typeof makeApp>): Promise<Mark[]> {
	return ((await (await daemon.request("/api/p/checkout/set-aside")).json()) as { marks: Mark[] }).marks;
}

const text = (root: string, path: string) =>
	existsSync(join(root, "design", path)) ? read(root, path).toString() : undefined;

describe("a collision", () => {
	it("keeps the first save, sets the second aside, and gives its machine the team's version and a mark", async () => {
		const { cloud, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "first\n");
		await until(() => text(ben.root, "frames/home/frame.tsx") === "first\n");

		// both build on "first"; Ana's reaches the team while Ben's machine is away
		const back = cloud.offline("ben");
		writeFrame(ben.root, "home", "ben's\n");
		writeFrame(ana.root, "home", "ana's\n");
		await until(() => cloud.file("checkout", "frames/home/frame.tsx") === "ana's\n");
		back();
		await until(() => text(ben.root, "frames/home/frame.tsx") === "ana's\n", 10_000);
		expect(
			cloud
				.saves("checkout")
				.filter((save) => save.path === "frames/home/frame.tsx")
				.slice(-2),
		).toMatchObject([
			{ by: "ana", outcome: "applied" },
			{ by: "ben", outcome: "set_aside" },
		]);
		await until(() => existsSync(join(ben.root, "design/.spool/set-aside/marks.json")));
		const [mark] = await marks(ben.daemon);
		expect(mark).toMatchObject({
			path: "frames/home/frame.tsx",
			kind: "set-aside",
			deleted: false,
			frames: ["home"],
			by: "ana@devosurf.com",
		});
		expect(readFileSync(join(ben.root, mark?.file ?? ""), "utf8")).toBe("ben's\n");
		// the editor whose save won isn't told
		expect(await marks(ana.daemon)).toEqual([]);

		const compared = await (await ben.daemon.request(`/api/p/checkout/set-aside/${mark?.id}`)).json();
		expect(compared).toEqual({
			path: "frames/home/frame.tsx",
			mine: { text: "ben's\n", size: 6 },
			team: { text: "ana's\n", size: 6 },
		});

		// putting it back is an ordinary new save on top, which reaches Ana
		const put = await ben.daemon.request(`/api/p/checkout/set-aside/${mark?.id}/put-back`, { method: "POST" });
		expect(put.status).toBe(200);
		await until(() => text(ana.root, "frames/home/frame.tsx") === "ben's\n");
		expect(await marks(ben.daemon)).toEqual([]);
		expect(cloud.saves("checkout").at(-1)).toMatchObject({ by: "ben", outcome: "applied" });
	});

	it("lets an edit beat a delete: the file comes back for everyone, and the deleter is marked", async () => {
		const { cloud, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "first\n");
		await until(() => text(ben.root, "frames/home/frame.tsx") === "first\n");

		const back = cloud.offline("ana");
		writeFrame(ana.root, "home", "ana kept going\n");
		rmSync(join(ben.root, "design/frames/home"), { recursive: true });
		await until(() => cloud.file("checkout", "frames/home/frame.tsx") === null);
		back();
		await until(() => text(ben.root, "frames/home/frame.tsx") === "ana kept going\n", 10_000);
		expect(text(ana.root, "frames/home/frame.tsx")).toBe("ana kept going\n");
		await until(() => existsSync(join(ben.root, "design/.spool/set-aside/marks.json")));
		expect(await marks(ben.daemon)).toMatchObject([
			{ path: "frames/home/frame.tsx", kind: "restored", deleted: true, frames: ["home"], by: "ana@devosurf.com" },
		]);
		expect(await marks(ana.daemon)).toEqual([]);

		// putting the delete back is an ordinary delete on top of the edit
		const [mark] = await marks(ben.daemon);
		await ben.daemon.request(`/api/p/checkout/set-aside/${mark?.id}/put-back`, { method: "POST" });
		await until(() => !existsSync(join(ana.root, "design/frames/home")));
	});

	it("leaves a losing rename's old path beside the new one", async () => {
		const { cloud, ana, ben } = await twoEditors();
		writeFrame(ana.root, "cart", "cart\n");
		await until(() => text(ben.root, "frames/cart/frame.tsx") === "cart\n");

		const back = cloud.offline("ana");
		renameSync(join(ana.root, "design/frames/cart"), join(ana.root, "design/frames/basket"));
		writeFrame(ben.root, "cart", "ben's cart\n");
		await until(() => cloud.file("checkout", "frames/cart/frame.tsx") === "ben's cart\n");
		back();
		await until(() => text(ben.root, "frames/basket/frame.tsx") === "cart\n", 10_000);
		await until(() => text(ana.root, "frames/cart/frame.tsx") === "ben's cart\n", 10_000);
		expect(text(ben.root, "frames/cart/frame.tsx")).toBe("ben's cart\n");
		expect(text(ana.root, "frames/basket/frame.tsx")).toBe("cart\n");
	});

	it("never happens to canvas.json: changes to different keys both land", async () => {
		const { cloud, ana, ben } = await twoEditors();
		const canvas = (root: string) => JSON.parse(read(root, "canvas.json").toString()) as Record<string, unknown>;
		const write = (root: string, change: Record<string, unknown>) =>
			writeDesignFile(root, "canvas.json", `${JSON.stringify({ ...canvas(root), ...change }, null, "\t")}\n`);
		write(ana.root, { places: { home: { x: 0, y: 0 } } });
		await until(() => same(ana.root, ben.root, "canvas.json"));

		const back = cloud.offline("ben");
		write(ana.root, { places: { home: { x: 0, y: 900 } } });
		write(ben.root, { order: { frames: { "": ["cart", "home"] } } });
		await until(() => (cloud.file("checkout", "canvas.json") ?? "").includes("900"));
		back();
		for (const root of [ana.root, ben.root])
			await until(() => {
				const fields = canvas(root);
				return JSON.stringify(fields.places).includes("900") && fields.order !== undefined;
			}, 10_000);
		expect(canvas(ana.root)).toEqual(canvas(ben.root));
		expect(await marks(ben.daemon)).toEqual([]);
	});

	it("after a while offline, catches up without overwriting teammates' newer work, as one batch", async () => {
		const { cloud, ana, ben } = await twoEditors();
		const names = ["a", "b", "c", "d", "e"];
		for (const name of names) writeFrame(ana.root, name, `${name} first\n`);
		await until(() => names.every((name) => text(ben.root, `frames/${name}/frame.tsx`) === `${name} first\n`));

		const back = cloud.offline("ben");
		for (const name of names) writeFrame(ben.root, name, `${name} by ben\n`);
		writeFrame(ben.root, "new", "new by ben\n");
		for (const name of names.slice(0, 4)) writeFrame(ana.root, name, `${name} by ana\n`);
		await until(() => cloud.file("checkout", "frames/d/frame.tsx") === "d by ana\n");
		back();
		await until(() => text(ana.root, "frames/new/frame.tsx") === "new by ben\n", 10_000);
		await until(() => text(ana.root, "frames/e/frame.tsx") === "e by ben\n", 10_000);
		for (const name of names.slice(0, 4)) {
			await until(() => text(ben.root, `frames/${name}/frame.tsx`) === `${name} by ana\n`, 10_000);
			expect(text(ana.root, `frames/${name}/frame.tsx`)).toBe(`${name} by ana\n`);
		}
		await until(() =>
			readFileSync(join(ben.root, "design/.spool/set-aside/marks.json"), "utf8").includes("frames/d"),
		);
		const set = await marks(ben.daemon);
		expect(set.map((mark) => mark.path).sort()).toEqual(names.slice(0, 4).map((name) => `frames/${name}/frame.tsx`));
		expect(set.map((mark) => mark.together)).toEqual([4, 4, 4, 4]);
	});
});

/** Run git with extra environment and input, as plumbing that never touches the work tree needs. */
function plumb(cwd: string, env: Record<string, string>, input: string | undefined, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env }, input }).trim();
}

/** A commit of exactly these files, made beside the work tree and index so nothing on disk moves. */
function commitFiles(root: string, files: Record<string, string>, parent?: string): string {
	const index = { GIT_INDEX_FILE: join(makeTempDir(), "index") };
	for (const [path, content] of Object.entries(files)) {
		const blob = plumb(root, {}, content, "hash-object", "-w", "--stdin");
		plumb(root, index, undefined, "update-index", "--add", "--cacheinfo", `100644,${blob},${path}`);
	}
	const tree = plumb(root, index, undefined, "write-tree");
	return plumb(root, {}, undefined, "commit-tree", tree, ...(parent === undefined ? [] : ["-p", parent]), "-m", "old");
}

describe("the git guard", () => {
	it("puts the team's version back over an old branch's design/, and sends teammates nothing", async () => {
		const { cloud, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "team's home\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		git(ben.root, "add", "spool.json");
		git(ben.root, "commit", "--quiet", "-m", "spool.json");
		// a branch from before the project moved to the team: it tracks design/ and has no spool.json
		const old = commitFiles(ben.root, {
			"design/canvas.json": "{}\n",
			"design/frames/home/frame.tsx": "old home\n",
			"design/frames/legacy/frame.tsx": "legacy\n",
		});
		git(ben.root, "branch", "old", old);
		const saves = cloud.saves("checkout").length;
		const canvas = read(ana.root, "canvas.json").toString();

		git(ben.root, "checkout", "--quiet", "old");

		await until(() => read(ben.root, "frames/home/frame.tsx").toString() === "team's home\n");
		await until(() => read(ben.root, "canvas.json").toString() === canvas);
		await until(() => !existsSync(join(ben.root, "design/frames/legacy")));
		await new Promise((wake) => setTimeout(wake, 300));
		expect(cloud.saves("checkout").length).toBe(saves);
		expect(cloud.file("checkout", "frames/home/frame.tsx")).toBe("team's home\n");
		expect(read(ana.root, "frames/home/frame.tsx").toString()).toBe("team's home\n");
		expect(read(ana.root, "canvas.json").toString()).toBe(canvas);
		expect(existsSync(join(ana.root, "design/frames/legacy"))).toBe(false);
		// git's files never reached the team, so nothing collided: no set-aside mark on either machine
		expect(await marks(ben.daemon)).toEqual([]);
		expect(await marks(ana.daemon)).toEqual([]);

		// and a save after it, made by a person, still travels
		writeFrame(ben.root, "home", "ben's home\n");
		await until(() => read(ana.root, "frames/home/frame.tsx").toString() === "ben's home\n");
	});

	it("refills design/ when a pull takes it out of git, instead of deleting it for the team", async () => {
		const { cloud, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "team's home\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		// Ben's branch still tracks design/ as it was before the move, and the move commit takes it out
		git(ben.root, "add", "spool.json");
		git(ben.root, "add", "--force", "design/canvas.json", "design/frames", "design/shared");
		git(ben.root, "commit", "--quiet", "-m", "before the move");
		await new Promise((wake) => setTimeout(wake, 200));
		const index = { GIT_INDEX_FILE: join(makeTempDir(), "index") };
		plumb(ben.root, index, undefined, "read-tree", "HEAD");
		plumb(ben.root, index, undefined, "rm", "-r", "--quiet", "--cached", "design");
		const tree = plumb(ben.root, index, undefined, "write-tree");
		const moved = plumb(
			ben.root,
			{},
			undefined,
			"commit-tree",
			tree,
			"-p",
			"HEAD",
			"-m",
			"design: moved to Spool Cloud",
		);
		const saves = cloud.saves("checkout").length;

		git(ben.root, "merge", "--quiet", "--ff-only", moved);

		await until(() => existsSync(join(ben.root, "design/canvas.json")));
		await until(() => cloud.paths("checkout").every((path) => same(ana.root, ben.root, path)));
		await new Promise((wake) => setTimeout(wake, 300));
		expect(cloud.saves("checkout").length).toBe(saves);
		expect(cloud.file("checkout", "frames/home/frame.tsx")).toBe("team's home\n");
		expect(existsSync(join(ana.root, "design/frames/home/frame.tsx"))).toBe(true);
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe("*\n");
		expect(status(ben.root)).toEqual([]);
	});

	it("refills a design/ that vanished whole, and keeps following it", async () => {
		const { cloud, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "team's home\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		const saves = cloud.saves("checkout").length;

		rmSync(join(ben.root, "design"), { recursive: true });

		await until(() => cloud.paths("checkout").every((path) => same(ana.root, ben.root, path)));
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe("*\n");
		await new Promise((wake) => setTimeout(wake, 300));
		expect(cloud.saves("checkout").length).toBe(saves);
		writeFrame(ben.root, "home", "ben's home\n");
		await until(() => read(ana.root, "frames/home/frame.tsx").toString() === "ben's home\n");
	});
});
