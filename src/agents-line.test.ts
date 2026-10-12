import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENTS_LINE, addAgentsLine } from "./agents-line";
import { initTeamProject } from "./init";
import { fakeTeam, TEAM_ORIGIN } from "./team-sync-test-harness";
import { makeApp, makeTempDir } from "./test-helpers";

/** The AGENTS.md line (task 136): where it goes, once, whenever spool puts spool.json in a repo. */

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

function repo(name: string): string {
	const root = join(makeTempDir(), name);
	mkdirSync(root);
	git(root, "init", "--quiet", "--initial-branch=main", ".");
	return realpathSync(root);
}

describe("The AGENTS.md line", () => {
	it("goes into AGENTS.md, else CLAUDE.md, else a new AGENTS.md, once, and never into a file git ignores", async () => {
		const agents = repo("a");
		writeFileSync(join(agents, "AGENTS.md"), "# a");
		writeFileSync(join(agents, "CLAUDE.md"), "@AGENTS.md\n");
		expect(await addAgentsLine(agents)).toBe(join(agents, "AGENTS.md"));
		expect(await addAgentsLine(agents)).toBeUndefined();
		expect(readFileSync(join(agents, "AGENTS.md"), "utf8")).toBe(`# a\n\n${AGENTS_LINE}\n`);
		expect(readFileSync(join(agents, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");

		const claude = repo("c");
		writeFileSync(
			join(claude, "CLAUDE.md"),
			"# c\n\nsee the canvas:\ndesign/ is a spool canvas: run `spool skill` before working there",
		);
		expect(await addAgentsLine(claude)).toBe(join(claude, "CLAUDE.md"));
		// a line that only looks like it is no match: the exact line goes in after it
		expect(readFileSync(join(claude, "CLAUDE.md"), "utf8").endsWith(`working there\n\n${AGENTS_LINE}\n`)).toBe(true);
		expect(existsSync(join(claude, "AGENTS.md"))).toBe(false);

		const neither = repo("n");
		expect(await addAgentsLine(neither)).toBe(join(neither, "AGENTS.md"));
		expect(readFileSync(join(neither, "AGENTS.md"), "utf8")).toBe(`${AGENTS_LINE}\n`);

		const ignoring = repo("i");
		writeFileSync(join(ignoring, ".gitignore"), "AGENTS.md\n");
		expect(await addAgentsLine(ignoring)).toBeUndefined();
		expect(existsSync(join(ignoring, "AGENTS.md"))).toBe(false);
	});

	it("rides spool init of a team project in a checkout, at the checkout's root, and a Get it that writes spool.json", {
		timeout: 30_000,
	}, async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const state = join(makeTempDir(), ".spool");
		const checkout = repo("app");
		mkdirSync(join(checkout, "web"));
		const started = await initTeamProject(join(checkout, "web"), state, {
			team: "devosurf",
			origin: TEAM_ORIGIN,
			request: ana.request,
			openSocket: ana.openSocket,
		});
		expect(started.agents).toBe(join(checkout, "AGENTS.md"));
		expect(readFileSync(join(checkout, "AGENTS.md"), "utf8")).toBe(`${AGENTS_LINE}\n`);
		expect(existsSync(join(checkout, "web", "AGENTS.md"))).toBe(false);

		const ben = makeApp(join(makeTempDir(), ".spool"), { cloud: cloud.machine("ben").cloud, teamNotice: () => {} });
		const picked = repo("picked");
		const got = await ben.controlRequest("/api/cloud/teams/devosurf/projects/web/get", {
			method: "POST",
			headers: { "content-type": "application/json", origin: "http://localhost:7766" },
			body: JSON.stringify({ where: "checkout", path: picked }),
		});
		expect(got.status, await got.clone().text()).toBe(200);
		expect(readFileSync(join(picked, "AGENTS.md"), "utf8")).toBe(`${AGENTS_LINE}\n`);
	});
});
