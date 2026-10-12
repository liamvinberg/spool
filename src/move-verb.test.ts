import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSettingsStore } from "./daemon/settings";
import { initTeamProject } from "./init";
import { runMove } from "./move-verb";
import { parseProjectLink } from "./team-project";
import { fakeTeam, TEAM_ORIGIN } from "./team-sync-test-harness";
import { makeApp, makeTempDir, until, writeFrame } from "./test-helpers";

/**
 * `spool move` as an agent or a person at a terminal runs it, against Ada's daemon and the fake team: it says what
 * the move does, asks, and only `--yes` moves without asking.
 */

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "Hands",
			GIT_AUTHOR_EMAIL: "hands@example.test",
			GIT_COMMITTER_NAME: "Hands",
			GIT_COMMITTER_EMAIL: "hands@example.test",
		},
	}).trim();
}

/** Ada, admin of Tidemark and editor in Northlight, with `site` in a checkout whose spool.json is committed. */
async function ada() {
	const cloud = fakeTeam("tidemark", "Tidemark");
	cloud.addTeam("northlight", "Northlight");
	const machine = cloud.machine("ada", "admin");
	cloud.role("ada", "editor", "northlight");
	cloud.machine("mira", "editor");
	const state = join(makeTempDir(), ".spool");
	mkdirSync(state, { recursive: true });
	createSettingsStore(state).write("projects.location", join(makeTempDir(), "spool"));
	const root = join(makeTempDir(), "site");
	mkdirSync(root);
	git(root, "init", "--quiet", "--initial-branch=main", ".");
	git(root, "config", "commit.gpgsign", "false");
	const { link } = await initTeamProject(realpathSync(root), state, {
		team: "tidemark",
		origin: TEAM_ORIGIN,
		request: machine.request,
		openSocket: machine.openSocket,
	});
	git(root, "add", "-A");
	git(root, "commit", "--quiet", "-m", "start");
	const daemon = makeApp(state, { cloud: machine.cloud, teamNotice: () => {} });
	writeFrame(root, "home", "export default () => <h1>Home</h1>;\n");
	await until(() => cloud.file("site", "frames/home/frame.tsx") !== undefined, 10_000);
	const printed: string[] = [];
	const deps = (confirm?: (question: string) => Promise<boolean>) => ({
		here: async () => ({ root: realpathSync(root), link }),
		request: async (path: string, init?: { method: string; body?: unknown }) =>
			await daemon.controlRequest(`/api/cloud${path}`, {
				method: init?.method ?? "GET",
				headers: { "content-type": "application/json" },
				...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
			}),
		confirm,
		print: (line: string) => void printed.push(line),
		cwd: root,
	});
	return { cloud, root: realpathSync(root), deps, printed };
}

describe("spool move", () => {
	it("says what the move does and asks, and moves nothing on a no", { timeout: 30_000 }, async () => {
		const { cloud, root, deps, printed } = await ada();
		const questions: string[] = [];
		await expect(
			runMove(
				{ team: "northlight" },
				deps(async (question) => {
					questions.push(question);
					return false;
				}),
			),
		).rejects.toThrow("nothing moved");
		expect(questions).toEqual(["Move?"]);
		expect(printed).toEqual([
			"moves tidemark/site to northlight: the same project, its history and shares kept; tidemark/site leads on to it",
			"mira isn't in northlight: their copies stop syncing and stay on their Macs as local projects",
			`spool.json changes in ${root}, in one commit on its current branch; nothing is pushed`,
		]);
		expect(cloud.moves).toEqual([]);
	});

	it("moves on a yes, and says what happened", { timeout: 30_000 }, async () => {
		const { cloud, root, deps, printed } = await ada();
		await runMove(
			{ team: "northlight", name: "tidemark-site" },
			deps(async () => true),
		);
		expect(cloud.moves).toEqual([{ from: "tidemark/site", to: "northlight/tidemark-site", by: "ada" }]);
		expect(printed.slice(-2)).toEqual([
			`moved tidemark/site to ${TEAM_ORIGIN}/northlight/tidemark-site`,
			`committed spool.json in ${root}`,
		]);
		const named = JSON.parse(readFileSync(join(root, "spool.json"), "utf8")) as { project: string };
		expect(parseProjectLink(named.project)?.team).toBe("northlight");
	});

	it("refuses without a terminal to ask at unless --yes says the person already said yes", {
		timeout: 30_000,
	}, async () => {
		const { cloud, deps } = await ada();
		await expect(runMove({ team: "northlight" }, deps())).rejects.toThrow(
			"nothing moved: spool move asks first. Ask the person, and run it again with --yes once they said yes",
		);
		expect(cloud.moves).toEqual([]);
		await runMove({ team: "northlight", yes: true }, deps());
		expect(cloud.moves).toEqual([{ from: "tidemark/site", to: "northlight/site", by: "ada" }]);
	});

	it("says why a move is refused before asking", { timeout: 30_000 }, async () => {
		const { cloud, deps } = await ada();
		cloud.lapse("northlight");
		await expect(runMove({ team: "northlight", yes: true }, deps())).rejects.toThrow(
			"northlight has no paid time left. It takes projects again once an admin pays for it.",
		);
		await expect(runMove({ team: "northlight", out: true }, deps())).rejects.toThrow(
			"say where it goes: one of `--team <address>`, `--out` and `--into <checkout>`",
		);
	});

	it("moves a project out of its team, and one not on this Mac by its name", { timeout: 30_000 }, async () => {
		const { cloud, root, deps, printed } = await ada();
		await runMove({ out: true, yes: true }, deps());
		expect(cloud.movedOut("tidemark/site")).toBe(true);
		expect(git(root, "log", "-1", "--format=%s")).toBe("spool: move site out of tidemark");
		expect(printed.slice(-2)).toEqual(["moved site out of tidemark", `committed design/ in ${root}`]);

		const other = join(makeTempDir(), "pitch");
		mkdirSync(other);
		const { cloud: again, deps: elsewhere, printed: said } = await ada();
		const machine = again.machine("sam", "editor");
		await initTeamProject(other, join(makeTempDir(), ".spool"), {
			team: "tidemark",
			origin: TEAM_ORIGIN,
			request: machine.request,
			openSocket: machine.openSocket,
		});
		await runMove({ project: "tidemark/pitch", team: "northlight", yes: true }, elsewhere());
		expect(again.forward("tidemark/pitch")).toBe("northlight/pitch");
		expect(said.at(-1)).toBe(`moved tidemark/pitch to ${TEAM_ORIGIN}/northlight/pitch`);
	});
});
