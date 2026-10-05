import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
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
	const anaDaemon = makeApp(anaState, { teamSyncServices: { ...ana.services, notice: () => {} } });
	const benDaemon = makeApp(benState, { teamSyncServices: { ...ben.services, notice: () => {} } });
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
