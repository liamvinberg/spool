import { execFileSync } from "node:child_process";
import {
	appendFileSync,
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
import { createServer, type Socket } from "node:net";
import { dirname, join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { chooseInitTarget, describeChoice, initDestination, initTeamProject } from "../init";
import { fetchLocalCopy, openProject } from "../open";
import { readRegistry, registerProject, teamProjects } from "../registry";
import { removeProject } from "../remove";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { SOLO_GITIGNORE } from "../templates";
import { makeApp, makeTempDir, sseReader, until, writeDesignFile, writeFrame } from "../test-helpers";
import { resolveRegisteredProject } from "../verbs";
import { historyEnabled } from "./history";
import { openWebSocket } from "./team-sync";
import { watchFolder } from "./watch-tree";

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
const encode = (text: string) => new TextEncoder().encode(text);
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
	// what each daemon says, as its owner would read it
	const said = { ana: [] as string[], ben: [] as string[] };
	const anaDaemon = makeApp(anaState, {
		cloud: ana.cloud,
		teamNotice: (message) => said.ana.push(message),
	});
	const benDaemon = makeApp(benState, {
		cloud: ben.cloud,
		teamNotice: (message) => said.ben.push(message),
	});
	return {
		cloud,
		link,
		said,
		ana: { root: anaRoot, daemon: anaDaemon, state: anaState, machine: ana },
		ben: { root: benRoot, daemon: benDaemon, state: benState, machine: ben },
	};
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
		// another tool's spool.json is never written over
		const foreign = repo();
		writeFileSync(join(foreign, "spool.json"), '{ "threads": 4 }\n');
		const ana = cloud.machine("ana");
		await expect(
			initTeamProject(foreign, join(makeTempDir(), ".spool"), {
				team: "devosurf",
				origin: TEAM_ORIGIN,
				request: ana.request,
				openSocket: ana.openSocket,
			}),
		).rejects.toThrow(/spool\.json that isn't a team project's/u);
		expect(readFileSync(join(foreign, "spool.json"), "utf8")).toBe('{ "threads": 4 }\n');
		expect(existsSync(join(foreign, "design"))).toBe(false);
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

describe("a fetch that can't", () => {
	it("tells someone signed out to sign in, and a cloud agent that it can't yet", async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const anaRoot = repo();
		await initTeamProject(anaRoot, join(makeTempDir(), ".spool"), {
			team: "devosurf",
			origin: TEAM_ORIGIN,
			request: ana.request,
			openSocket: ana.openSocket,
		});
		const clone = repo();
		copyFileSync(join(anaRoot, "spool.json"), join(clone, "spool.json"));
		const fetching = (options: Partial<Parameters<typeof fetchLocalCopy>[2]>) =>
			fetchLocalCopy(clone, join(makeTempDir(), ".spool"), {
				origin: TEAM_ORIGIN,
				request: ana.request,
				openSocket: ana.openSocket,
				env: {},
				...options,
			});
		await expect(
			fetching({ request: { origin: TEAM_ORIGIN, vault: { read: async () => undefined } } }),
		).rejects.toThrow(
			"https://cloud.test/devosurf/checkout is a team project; run `spool login` to fetch its design/",
		);
		const noWayIn = { origin: TEAM_ORIGIN, vault: { read: async () => undefined } };
		await expect(fetching({ request: noWayIn, env: { CLAUDE_CODE_REMOTE: "true" } })).rejects.toThrow(
			"Claude Code on the web can't fetch a team project's design/ yet",
		);
		// a local agent, on a Mac or a Linux box over SSH, runs where someone can sign spool in
		await expect(fetching({ request: noWayIn, env: { CODEX_THREAD_ID: "1" } })).rejects.toThrow(
			"https://cloud.test/devosurf/checkout is a team project; run `spool login` to fetch its design/",
		);
		expect(existsSync(join(clone, "design"))).toBe(false);
	});
});

describe("local copies", () => {
	it("are filled by any verb in a new worktree, and one team project holds them all", async () => {
		const { cloud, link, ana, ben } = await twoEditors();
		git(ana.root, "add", "spool.json");
		git(ana.root, "commit", "--quiet", "-m", "spool.json");
		const lane = join(dirname(ana.root), "lane");
		git(ana.root, "worktree", "add", "--quiet", "-b", "lane", lane);
		expect(existsSync(join(lane, "design"))).toBe(false);

		// what every verb runs first, from anywhere in the lane
		mkdirSync(join(lane, "src"));
		const fetched = await fetchLocalCopy(join(lane, "src"), ana.state, {
			origin: TEAM_ORIGIN,
			request: ana.machine.request,
			openSocket: ana.machine.openSocket,
		});
		expect(fetched).toEqual({ root: realpathSync(lane), fetched: true });
		expect(resolveRegisteredProject(ana.state, join(lane, "src")).root).toBe(realpathSync(lane));
		expect(cloud.paths("checkout").every((path) => same(ana.root, lane, path))).toBe(true);
		expect(status(lane)).toEqual([]);
		expect(teamProjects(ana.state)).toEqual([{ link, copies: [realpathSync(lane), ana.root] }]);
		const cards = (await (await ana.daemon.request("/api/projects")).json()) as {
			projects: { root: string; team?: { url: string } }[];
		};
		expect(cards.projects.map((card) => [card.root, card.team?.url])).toEqual([
			[realpathSync(lane), link.url],
			[ana.root, link.url],
		]);

		// both copies on this Mac are in step with the team, and with each other
		writeFrame(lane, "lane", "from the lane\n");
		await until(() => same(lane, ben.root, "frames/lane/frame.tsx"));
		await until(() => same(lane, ana.root, "frames/lane/frame.tsx"));
		writeFrame(ben.root, "home", "from ben\n");
		await until(
			() => same(ben.root, lane, "frames/home/frame.tsx") && same(ben.root, ana.root, "frames/home/frame.tsx"),
		);
	});

	it("is forgotten by spool remove without touching the team, and a lane erased after it deletes nothing", async () => {
		const { cloud, ana, ben } = await twoEditors();
		git(ana.root, "add", "spool.json");
		git(ana.root, "commit", "--quiet", "-m", "spool.json");
		const lane = join(dirname(ana.root), "lane");
		git(ana.root, "worktree", "add", "--quiet", "-b", "lane", lane);
		await fetchLocalCopy(lane, ana.state, {
			origin: TEAM_ORIGIN,
			request: ana.machine.request,
			openSocket: ana.machine.openSocket,
		});
		writeFrame(lane, "lane", "from the lane\n");
		await until(() => same(lane, ben.root, "frames/lane/frame.tsx"));
		const team = cloud.paths("checkout").map((path) => [path, cloud.file("checkout", path)]);
		const saves = cloud.saves("checkout").length;

		expect(removeProject(lane, ana.state)).toEqual({ root: realpathSync(lane), removed: true });
		expect(teamProjects(ana.state).map((project) => project.copies)).toEqual([[ana.root]]);
		expect(existsSync(join(lane, "design/frames/lane/frame.tsx"))).toBe(true);
		git(ana.root, "worktree", "remove", "--force", lane);
		await new Promise((wake) => setTimeout(wake, 300));
		expect(cloud.saves("checkout").length).toBe(saves);
		expect(cloud.paths("checkout").map((path) => [path, cloud.file("checkout", path)])).toEqual(team);

		// the copy that stays is still the team's
		writeFrame(ben.root, "home", "from ben\n");
		await until(() => same(ben.root, ana.root, "frames/home/frame.tsx"));
	});

	it("keeps design/ out of git from the moment it is followed, whatever .gitignore it had", async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const state = join(makeTempDir(), ".spool");
		const { root } = await initTeamProject(repo(), state, {
			team: "devosurf",
			origin: TEAM_ORIGIN,
			request: ana.request,
			openSocket: ana.openSocket,
		});
		// as a teammate's design/ that survived pulling the move commit keeps the solo one
		writeFileSync(join(root, "design/.gitignore"), SOLO_GITIGNORE);
		makeApp(state, { cloud: ana.cloud, teamNotice: () => {} });
		await until(() => readFileSync(join(root, "design/.gitignore"), "utf8") === "*\n");
		expect(status(root)).toEqual(["?? spool.json"]);
	});

	it("is never deleted for the team when its folder is erased while still registered", async () => {
		const { cloud, ana, ben } = await twoEditors();
		git(ana.root, "add", "spool.json");
		git(ana.root, "commit", "--quiet", "-m", "spool.json");
		const lane = join(dirname(ana.root), "lane");
		git(ana.root, "worktree", "add", "--quiet", "-b", "lane", lane);
		await fetchLocalCopy(lane, ana.state, {
			origin: TEAM_ORIGIN,
			request: ana.machine.request,
			openSocket: ana.machine.openSocket,
		});
		writeFrame(lane, "lane", "from the lane\n");
		await until(() => same(lane, ben.root, "frames/lane/frame.tsx"));
		const saves = cloud.saves("checkout").length;

		git(ana.root, "worktree", "remove", "--force", lane);
		await new Promise((wake) => setTimeout(wake, 300));
		writeFrame(ben.root, "home", "from ben\n");
		await until(() => same(ben.root, ana.root, "frames/home/frame.tsx"));
		expect(cloud.saves("checkout").length).toBe(saves + 1);
		expect(cloud.file("checkout", "frames/lane/frame.tsx")).toBe("from the lane\n");
		expect(existsSync(lane)).toBe(false);
	});
});

describe("New project in the app, while a team is chosen", () => {
	it("starts a team project in a new folder, uploaded to the team", async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const state = join(makeTempDir(), ".spool");
		const daemon = makeApp(state, {
			cloud: ana.cloud,
			teamNotice: () => {},
		});
		const parent = join(makeTempDir(), "devosurf");
		const start = (name: string, path = parent) =>
			daemon.controlRequest("/api/cloud/teams/devosurf/projects", {
				method: "POST",
				headers: { "content-type": "application/json", origin: "http://localhost:7766" },
				body: JSON.stringify({ path, name }),
			});

		const named = await start("Checkout");
		expect(named.status).toBe(200);
		const root = join(realpathSync(parent), "Checkout");
		expect(await named.json()).toEqual({ root, name: "Checkout" });
		expect(JSON.parse(readFileSync(join(root, "spool.json"), "utf8"))).toEqual({
			project: `${TEAM_ORIGIN}/devosurf/checkout`,
		});
		expect(cloud.paths("checkout")).toContain("canvas.json");
		expect(readRegistry(state).projects.map((project) => project.root)).toEqual([root]);

		// no name is the next untitled the team doesn't have yet
		mkdirSync(join(parent, "untitled"));
		expect(await (await start("")).json()).toMatchObject({ name: "untitled-2" });
		expect(cloud.paths("untitled-2")).toContain("canvas.json");

		const elsewhere = makeTempDir();
		const taken = await start("checkout", elsewhere);
		expect(taken.status).toBe(409);
		expect(await taken.json()).toEqual({
			error: 'Devosurf already has a project called "checkout"; start this one in a folder with another name',
		});
		expect(existsSync(join(elsewhere, "checkout"))).toBe(false);
	});
});

describe("spool init with no flag", () => {
	it("stays on this Mac, asking nothing, for someone signed out or editing in no team", async () => {
		const cloud = fakeTeam();
		const requests: string[] = [];
		const signedOut = { origin: TEAM_ORIGIN, vault: { read: async () => undefined } };
		const viewer = cloud.machine("vera", "viewer").request;
		const watched = {
			...viewer,
			fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
				requests.push(String(input));
				return (viewer.fetch ?? fetch)(input, init);
			},
		};
		for (const request of [signedOut, watched, cloud.machine("olaf", null).request])
			expect(await initDestination(makeTempDir(), { origin: TEAM_ORIGIN, setting: "ask", request })).toEqual({
				kind: "local",
			});
		expect(requests).toEqual([`${TEAM_ORIGIN}/api/teams`]);
	});

	it("names the choice for an editor, and a terminal picks it", async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const destination = () =>
			initDestination(makeTempDir(), { origin: TEAM_ORIGIN, setting: "ask", request: ana.request });
		expect(await destination()).toEqual({ kind: "choose", teams: ["Devosurf"] });
		await expect(chooseInitTarget({ local: false }, destination)).rejects.toThrow(
			"You're in Devosurf. Run again with `--team <name>`, or `--local`.",
		);
		expect(describeChoice(["Tidemark", "Devosurf"])).toBe(
			"You're in Tidemark and Devosurf. Run again with `--team <name>`, or `--local`.",
		);
		expect(await chooseInitTarget({ local: false }, destination, async () => ({ team: "Devosurf" }))).toEqual({
			kind: "team",
			team: "Devosurf",
		});
		expect(await chooseInitTarget({ local: false }, destination, async () => "local")).toEqual({ kind: "local" });
		await expect(chooseInitTarget({ local: false }, destination, async () => undefined)).rejects.toThrow(
			/nothing was started/u,
		);
	});

	it("takes --local and --team without asking, and the machine setting's answer", async () => {
		const asked = async () => {
			throw new Error("asked spool.page");
		};
		expect(await chooseInitTarget({ local: true }, asked)).toEqual({ kind: "local" });
		expect(await chooseInitTarget({ team: "devosurf", local: false }, asked)).toEqual({
			kind: "team",
			team: "devosurf",
		});
		await expect(chooseInitTarget({ team: "devosurf", local: true }, asked)).rejects.toThrow(/choose one/u);
		const unreachable = {
			origin: TEAM_ORIGIN,
			vault: { read: async () => "token" },
			fetch: async () => {
				throw new TypeError("fetch failed");
			},
		};
		for (const [setting, expected] of [
			["local", { kind: "local" }],
			["devosurf", { kind: "team", team: "devosurf" }],
			["ask", { kind: "unknown" }],
		] as const)
			expect(await initDestination(makeTempDir(), { origin: TEAM_ORIGIN, setting, request: unreachable })).toEqual(
				expected,
			);
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

	it("goes up though macOS dropped its folder event while another watch started", { timeout: 20_000 }, async () => {
		const { cloud, ana } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => <h1>Home</h1>;\n");
		await until(() => cloud.file("checkout", "frames/home/frame.tsx") !== undefined);
		for (let gap = 0; gap < 5; gap += 1) {
			// every folder watch the daemon starts restarts macOS's one stream of folder events, dropping what lands then
			const elsewhere = watchFolder(makeTempDir(), { recursive: true });
			onTestFinished(() => elsewhere.close());
			writeFrame(ana.root, `gap-${gap}`, `export default () => <h1>${gap}</h1>;\n`);
		}
		for (let gap = 0; gap < 5; gap += 1)
			await until(() => cloud.file("checkout", `frames/gap-${gap}/frame.tsx`) !== undefined, 10_000);
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
	it("puts the team's version back over an old branch's design/, sends teammates nothing, and deletes nothing", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
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
		// a file the team never had stays as git left it, unsent, and Ben is told once
		await until(() => said.ben.some((message) => message.startsWith("frames/legacy/frame.tsx didn't travel: git")));
		expect(read(ben.root, "frames/legacy/frame.tsx").toString()).toBe("legacy\n");
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
		expect(said.ben.filter((message) => message.startsWith("frames/legacy"))).toHaveLength(1);
	});

	it("keeps syncing while a pre-team branch is out, keeps no history there, and sends nothing git did", async () => {
		const { cloud, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "team's home\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		writeDesignFile(ana.root, "canvas.json", '{ "history": true }\n');
		await until(() => read(ben.root, "canvas.json").toString().includes("history"));
		git(ben.root, "add", "spool.json");
		git(ben.root, "commit", "--quiet", "-m", "spool.json");
		// a branch from before the move: it tracks some of design/ and has no spool.json
		git(ben.root, "branch", "old", commitFiles(ben.root, { "design/frames/home/frame.tsx": "old home\n" }));
		/** Anything that changes the registry has the daemon look again at which copies it follows. */
		const registryChanges = () => registerProject(ben.state, makeTempDir());
		const saves = cloud.saves("checkout").length;

		git(ben.root, "checkout", "--quiet", "old");
		await until(() => read(ben.root, "frames/home/frame.tsx").toString() === "team's home\n");
		// with no spool.json, the copy is still followed: a teammate's save arrives, and git is no place for it
		registryChanges();
		expect(historyEnabled(ben.root)).toBe(false);
		await new Promise((wake) => setTimeout(wake, 500));
		writeFrame(ana.root, "while", "while ben was on old\n");
		await until(() => same(ana.root, ben.root, "frames/while/frame.tsx"), 10_000);
		const listed = (await (await ben.daemon.request("/api/projects")).json()) as {
			projects: { root: string; team?: unknown }[];
		};
		expect(listed.projects.find((project) => project.root === ben.root)?.team).toBeDefined();

		// back on main, git takes away what the old branch tracked, and the team's version comes back
		git(ben.root, "checkout", "--quiet", "--force", "main");
		registryChanges();
		await until(() => existsSync(join(ben.root, "design/frames/home/frame.tsx")), 10_000);
		expect(read(ben.root, "frames/home/frame.tsx").toString()).toBe("team's home\n");
		await new Promise((wake) => setTimeout(wake, 500));
		expect(cloud.file("checkout", "frames/home/frame.tsx")).toBe("team's home\n");
		expect(read(ana.root, "frames/home/frame.tsx").toString()).toBe("team's home\n");
		expect(
			cloud
				.saves("checkout")
				.slice(saves)
				.filter((save) => save.by === "ben"),
		).toEqual([]);
	}, 30_000);

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

describe("what travels", () => {
	it("keeps a symlink, a foreign dot-folder and a file over 25 MB on the machine that wrote them, which says so", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const events = sseReader(await ana.daemon.request("/api/p/checkout/events", { signal: controller.signal }));
		expect((await events.next()).event).toBe("hello");

		const outside = join(makeTempDir(), "elsewhere");
		mkdirSync(outside);
		writeFileSync(join(outside, "frame.tsx"), "export default () => <h1>Not ours</h1>;\n");
		// once a frame has reached Ben, Ana's copy is caught up and watching
		writeFrame(ana.root, "home", "export default () => <h1>Home</h1>;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		symlinkSync("/etc/hosts", join(ana.root, "design/frames/home/hosts.txt"));
		symlinkSync(outside, join(ana.root, "design/frames/linked"));
		writeDesignFile(ana.root, ".git/config", "[core]\n\tsshCommand = touch /tmp/owned\n");
		writeDesignFile(ana.root, ".claude/settings.json", "{}\n");
		mkdirSync(join(ana.root, "design/shared/assets"), { recursive: true });
		writeFileSync(join(ana.root, "design/shared/assets/film.mov"), Buffer.alloc(26_000_000, 1));

		const stayed = {
			"frames/home/hosts.txt": "symlinks stay on this Mac",
			"frames/linked": "symlinks stay on this Mac",
			".git/config": "only canvas.json, AGENTS.md, CLAUDE.md, frames/ and shared/ sync",
			".claude/settings.json": "only canvas.json, AGENTS.md, CLAUDE.md, frames/ and shared/ sync",
			"shared/assets/film.mov": "it's over 25 MB",
		};
		for (const [path, why] of Object.entries(stayed))
			await until(() => said.ana.includes(`${path} didn't travel: ${why}`));
		for (const path of [...Object.keys(stayed), "frames/linked/frame.tsx"]) {
			expect(existsSync(join(ben.root, "design", path)), path).toBe(false);
			expect(cloud.file("checkout", path), path).toBeUndefined();
		}
		// each is said once, and on the canvas too
		expect(said.ana.filter((message) => message.startsWith("shared/assets/film.mov"))).toHaveLength(1);
		const told: unknown[] = [];
		for (let at = 0; at < 20 && !told.some((data) => JSON.stringify(data).includes("film.mov")); at += 1)
			told.push((await events.next()).data);
		expect(told).toContainEqual({ kind: "sync", message: "shared/assets/film.mov didn't travel: it's over 25 MB" });
		// and a canvas opened later still lists them
		const { held } = (await syncState(ana.daemon)) as { held: { path: string; why: string }[] };
		expect(Object.fromEntries(held.map(({ path, why }) => [path, why]))).toEqual({
			...stayed,
			"frames/linked/frame.tsx": "symlinks stay on this Mac",
		});

		// a file that shrinks under the limit travels after all
		writeFileSync(join(ana.root, "design/shared/assets/film.mov"), Buffer.alloc(1_000, 1));
		await until(() => same(ana.root, ben.root, "shared/assets/film.mov"));
		expect(JSON.stringify(await syncState(ana.daemon))).not.toContain("film.mov");
	});

	it("lets a big file finish being written before it travels, so no first part of it does", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => null;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		mkdirSync(join(ana.root, "design/shared/assets"), { recursive: true });
		const film = join(ana.root, "design/shared/assets/film.mov");
		writeFileSync(film, Buffer.alloc(10_000_000, 1));
		await new Promise((wake) => setTimeout(wake, 200));
		appendFileSync(film, Buffer.alloc(16_000_000, 1));
		await until(() => said.ana.includes("shared/assets/film.mov didn't travel: it's over 25 MB"));
		expect(cloud.file("checkout", "shared/assets/film.mov")).toBeUndefined();
		expect(existsSync(join(ben.root, "design/shared/assets/film.mov"))).toBe(false);
	});

	it("writes no team file through a symlink or over 25 MB", async () => {
		const { cloud, ana } = await twoEditors();
		writeFrame(ana.root, "real", "export default () => null;\n");
		symlinkSync(join(ana.root, "design/frames/real"), join(ana.root, "design/frames/alias"));
		cloud.forge(
			"checkout",
			{ type: "file", path: "frames/alias/frame.tsx", version: 98, deleted: false },
			encode("x"),
		);
		cloud.forge(
			"checkout",
			{ type: "file", path: "shared/assets/huge.bin", version: 99, deleted: false },
			new Uint8Array(26_000_000),
		);
		writeFrame(ana.root, "home", "export default () => null;\n");
		await until(() => cloud.file("checkout", "frames/home/frame.tsx") !== undefined);
		expect(read(ana.root, "frames/real/frame.tsx").toString()).toBe("export default () => null;\n");
		expect(existsSync(join(ana.root, "design/shared/assets/huge.bin"))).toBe(false);
	});
});

/** What a canvas opened on the project now is told of its sync: an ending, a pause, and what didn't travel. */
async function syncState(daemon: ReturnType<typeof makeApp>, project = "checkout") {
	return (await daemon.request(`/api/p/${project}/sync`)).json();
}

describe("a limit", () => {
	it("pauses sync with the reason, keeps changes on this machine, and resumes when it lifts", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		cloud.limit("rate_limited", 1);
		writeFrame(ana.root, "home", "export default () => <h1>Home</h1>;\n");
		await until(() =>
			said.ana.includes(
				"Sync paused: this project took 120 saves in the last minute. Changes stay on this Mac until it lifts.",
			),
		);
		writeFrame(ana.root, "about", "export default () => <h1>About</h1>;\n");
		await new Promise((wake) => setTimeout(wake, 300));
		expect(existsSync(join(ben.root, "design/frames/home"))).toBe(false);
		expect(cloud.file("checkout", "frames/about/frame.tsx")).toBeUndefined();
		// a canvas opened now still says so, for as long as it lasts
		expect(await syncState(ana.daemon)).toEqual({
			ended: null,
			paused: "this project took 120 saves in the last minute",
			held: [],
		});

		cloud.lift();
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"), 5_000);
		await until(() => same(ana.root, ben.root, "frames/about/frame.tsx"), 5_000);
		await until(() => said.ana.includes("Sync resumed."));
		expect(await syncState(ana.daemon)).toEqual({ ended: null, paused: null, held: [] });
	});
});

describe("when a team project ends for a machine", () => {
	for (const [change, act] of [
		["is made a viewer", (cloud: ReturnType<typeof fakeTeam>) => cloud.role("ben", "viewer")],
		["is removed from the team", (cloud: ReturnType<typeof fakeTeam>) => cloud.role("ben", null)],
		["finds the project removed", (cloud: ReturnType<typeof fakeTeam>) => cloud.removeProject("checkout")],
	] as const)
		it(`stops syncing and leaves an ordinary local project when its editor ${change}`, async () => {
			const { cloud, said, ana, ben } = await twoEditors();
			writeFrame(ana.root, "home", "export default () => <h1>Home</h1>;\n");
			await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
			const link = readFileSync(join(ben.root, "spool.json"), "utf8");

			act(cloud);
			await until(() =>
				said.ben.includes("No longer synced with devosurf. This is now a project on this Mac only."),
			);
			expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe(".spool/\n");
			expect(readFileSync(join(ben.root, "spool.json"), "utf8")).toBe(link);
			// said where it lasts: on the project's canvas whenever it opens, and on its cover at Home
			expect(await syncState(ben.daemon)).toEqual({ ended: "devosurf", paused: null, held: [] });
			const listed = (await (await ben.daemon.request("/api/projects")).json()) as {
				projects: { root: string; ended?: string }[];
			};
			expect(listed.projects.find((project) => project.root === ben.root)?.ended).toBe("devosurf");
			// git is left alone: design/ shows up to be committed if Ben wants it, and nothing was committed for him
			expect(status(ben.root)).toEqual(expect.arrayContaining(["?? design/frames/home/frame.tsx", "?? spool.json"]));
			expect(git(ben.root, "rev-list", "--all", "--count").trim()).toBe("0");

			// nothing travels either way any more, and every file stays
			writeFrame(ben.root, "mine", "export default () => <h1>Mine</h1>;\n");
			writeFrame(ana.root, "home", "export default () => <h1>Ana again</h1>;\n");
			await new Promise((wake) => setTimeout(wake, 300));
			expect(cloud.file("checkout", "frames/mine/frame.tsx")).toBeUndefined();
			expect(read(ben.root, "frames/home/frame.tsx").toString()).toContain("<h1>Home</h1>");
		});

	it("is found on reconnect when the change was made while the copy was offline", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => null;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		// the line drops first, so nothing reaches Ben's copy until it tries again and is refused
		cloud.disconnect("checkout");
		cloud.role("ben", null);
		await until(() => said.ben.includes("No longer synced with devosurf. This is now a project on this Mac only."));
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe(".spool/\n");
		// Ana's copy is still an editor's, and carries on
		writeFrame(ana.root, "about", "export default () => null;\n");
		await until(() => cloud.file("checkout", "frames/about/frame.tsx") !== undefined);
		expect(said.ana).toEqual([]);
	});

	it("ends the copy whatever branch is checked out, and a branch alone never ends it", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => null;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		// a pre-team branch has no spool.json: that by itself is no ending
		const link = readFileSync(join(ben.root, "spool.json"), "utf8");
		rmSync(join(ben.root, "spool.json"));
		await new Promise((wake) => setTimeout(wake, 300));
		expect(said.ben.filter((message) => message.startsWith("No longer synced"))).toEqual([]);

		cloud.role("ben", null);
		await until(() => said.ben.includes("No longer synced with devosurf. This is now a project on this Mac only."));
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe(".spool/\n");
		// back on a branch with spool.json, the copy stays ended
		writeFileSync(join(ben.root, "spool.json"), link);
		expect(JSON.parse(readFileSync(join(ben.root, "design/.spool/sync.json"), "utf8"))).toMatchObject({
			ended: true,
		});
	});

	it("is a project to get again once its editor is back, and getting it follows the copy again", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => <h1>Home</h1>;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		cloud.role("ben", "viewer");
		await until(() => said.ben.includes("No longer synced with devosurf. This is now a project on this Mac only."));
		// the ended copy is no local copy: Home shows the project not here, and the folder as Ben's own
		expect(teamProjects(ben.state)).toEqual([]);
		const listed = (await (await ben.daemon.request("/api/projects")).json()) as {
			projects: { root: string; team?: unknown }[];
		};
		expect(listed.projects.find((project) => project.root === ben.root)?.team).toBeUndefined();

		cloud.role("ben", "editor");
		writeFrame(ana.root, "news", "export default () => <h1>News</h1>;\n");
		const got = await ben.daemon.controlRequest("/api/cloud/teams/devosurf/projects/checkout/get", {
			method: "POST",
			headers: { "content-type": "application/json", origin: "http://localhost:7766" },
			body: JSON.stringify({ where: "checkout", path: ben.root }),
		});
		expect(got.status, await got.clone().text()).toBe(200);
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe("*\n");
		expect(teamProjects(ben.state).map(({ copies }) => copies)).toEqual([[ben.root]]);
		await until(() => same(ana.root, ben.root, "frames/news/frame.tsx"), 10_000);
		writeFrame(ben.root, "back", "export default () => <h1>Back</h1>;\n");
		await until(() => cloud.file("checkout", "frames/back/frame.tsx") !== undefined, 10_000);
	}, 30_000);

	it("is not an ending when the machine is signed out: it waits for `spool login`", async () => {
		const { cloud, said, ben } = await twoEditors();
		cloud.revoke("ben");
		await until(() => said.ben.some((message) => message.includes("signed out; run `spool login`")));
		await new Promise((wake) => setTimeout(wake, 300));
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe("*\n");
		expect(said.ben.filter((message) => message.includes("signed out"))).toHaveLength(1);
	});
});

describe("the sync socket", () => {
	it("drops what is said while spool.page has yet to answer the handshake, rather than taking the daemon down", async () => {
		// a handshake that never finishes, as one does on a network that dropped while the Mac slept
		const held: Socket[] = [];
		const server = createServer((connection) => held.push(connection));
		await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));
		onTestFinished(() => {
			for (const connection of held) connection.destroy();
			server.close();
		});
		const { port } = server.address() as { port: number };
		const socket = openWebSocket(`ws://127.0.0.1:${port}/sync`, "token", {
			open: () => {},
			message: () => {},
			close: () => {},
		});
		await until(() => held.length === 1);
		expect(() => socket.send("ping")).not.toThrow();
		socket.close();
	});
});
