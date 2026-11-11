import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type CloudTeamProject, cloudTeams } from "./cloud-teams";
import { historyEnabled } from "./daemon/history";
import { readSession } from "./daemon/session";
import { git, repo } from "./daemon/team-sync-editors";
import { SpoolError } from "./errors";
import { initProject, initTeamProject, joinOrStart } from "./init";
import { readRegistry } from "./registry";
import { fakeTeam, TEAM_ORIGIN, teamWriter } from "./team-sync-test-harness";
import { FORMAT_VERSION } from "./templates";
import { makeTempDir, markProject } from "./test-helpers";

function listTree(base: string): string[] {
	const out: string[] = [];
	const walk = (rel: string) => {
		for (const entry of readdirSync(join(base, rel), { withFileTypes: true })) {
			const relPath = join(rel, entry.name);
			if (entry.isDirectory()) {
				out.push(`${relPath}/`);
				walk(relPath);
			} else {
				out.push(relPath);
			}
		}
	};
	walk("design");
	return out.sort();
}

function readDesign(root: string, rel: string): string {
	return readFileSync(join(root, "design", rel), "utf8");
}

describe("initProject", () => {
	it("scaffolds exactly the spec's design/ layout", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		expect(listTree(root)).toEqual([
			"design/.gitignore",
			"design/AGENTS.md",
			"design/CLAUDE.md",
			"design/canvas.json",
			"design/frames/",
			"design/shared/",
			"design/shared/assets/",
			"design/shared/assets/fonts/",
			"design/shared/fonts.css",
			"design/shared/importmap.json",
			"design/shared/lib/",
			"design/shared/lib/utils.ts",
			"design/shared/scenarios/",
			"design/shared/scenarios/default.json",
			"design/shared/tokens.css",
			"design/shared/transitions.css",
			"design/shared/ui/",
		]);
	});

	it("stamps the format version in canvas.json, and leaves history off (#158)", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		expect(JSON.parse(readDesign(root, "canvas.json"))).toEqual({ format: FORMAT_VERSION, history: false });
	});

	it("writes the flag on when the caller opted in", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"), { history: true });

		expect(JSON.parse(readDesign(root, "canvas.json"))).toEqual({ format: FORMAT_VERSION, history: true });
	});

	it("writes both signposts", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		expect(readDesign(root, "AGENTS.md")).toContain("spool skill");
		expect(readDesign(root, "AGENTS.md")).toContain("frames/<name>/frame.tsx");
		expect(readDesign(root, "AGENTS.md")).toContain("Topics: `spool skill frames|flows|scenarios|styling|verbs`.");
		expect(readDesign(root, "AGENTS.md")).toContain("never write app-owned files");
		expect(readDesign(root, "CLAUDE.md")).toBe("@AGENTS.md\n");
	});

	it("pins clsx, tailwind-merge, class-variance-authority and motion in the import map", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		const imports = JSON.parse(readDesign(root, "shared/importmap.json")).imports;
		for (const name of ["clsx", "tailwind-merge", "class-variance-authority", "motion", "motion/react"]) {
			expect(imports[name]).toMatch(/^https:\/\/esm\.sh\/.+@\d+\.\d+\.\d+/);
		}
	});

	it("seeds a default scenario of empty state", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		expect(JSON.parse(readDesign(root, "shared/scenarios/default.json"))).toEqual({ state: {} });
	});

	it("gitignores .spool/ inside design/", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		expect(readDesign(root, ".gitignore")).toBe(".spool/\n");
	});

	it("ships cn() in shared/lib/utils.ts", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		const utils = readDesign(root, "shared/lib/utils.ts");
		expect(utils).toContain("export function cn(");
		expect(utils).toContain("twMerge(clsx(inputs))");
	});

	it("registers the project and returns the realpathed root", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const dir = makeTempDir();

		const { root } = initProject(dir, spoolDir);

		expect(root).toBe(realpathSync(dir));
		expect(readRegistry(spoolDir).projects.map((p) => p.root)).toEqual([root]);
		expect(readSession(spoolDir)).toEqual({ open: [root] });
	});

	it("refuses when design/ already exists and is not a spool project", () => {
		const root = makeTempDir();
		mkdirSync(join(root, "design"));
		writeFileSync(join(root, "design", "logo.svg"), "<svg/>");
		const spoolDir = join(makeTempDir(), ".spool");

		expect(() => initProject(root, spoolDir)).toThrow(SpoolError);
		expect(() => initProject(root, spoolDir)).toThrow(/design\/ already exists/);
		expect(existsSync(join(root, "design", "canvas.json"))).toBe(false);
	});

	it("points at spool open when the project is already initialized", () => {
		const root = makeTempDir();
		markProject(root);

		expect(() => initProject(root, join(makeTempDir(), ".spool"))).toThrow(/spool open/);
	});

	it("makes a project beside another tool's spool.json, leaving it as it was, with history as asked", () => {
		const root = makeTempDir();
		writeFileSync(join(root, "spool.json"), '{ "threads": 4 }\n');
		initProject(root, join(makeTempDir(), ".spool"), { history: true });
		expect(readFileSync(join(root, "spool.json"), "utf8")).toBe('{ "threads": 4 }\n');
		expect(historyEnabled(root)).toBe(true);
	});

	it("refuses when the target directory does not exist", () => {
		const missing = join(makeTempDir(), "missing");

		expect(() => initProject(missing, join(makeTempDir(), ".spool"))).toThrow(/no such directory/);
	});
});

describe("joinOrStart (spool#295)", () => {
	const repo = "github.com/devosurf/sandbox";
	const project = (name: string, of: string | null): CloudTeamProject => ({
		id: name,
		name,
		team: "devosurf",
		url: `https://spool.page/devosurf/${name}`,
		repo: of,
	});
	const fromRepo = { name: "sandbox", from: "repo" } as const;

	it("joins a project of this name and repo, anywhere", () => {
		const projects = [project("sandbox", repo), project("lab", repo)];
		expect(joinOrStart(projects, fromRepo, repo)).toMatchObject({ kind: "join", project: { name: "sandbox" } });
		expect(joinOrStart(projects, { name: "lab", from: "folder" }, repo)).toMatchObject({
			kind: "join",
			project: { name: "lab" },
		});
	});

	it("at a checkout's top, joins the repo's only project whatever its name, and a project of its name with no repo", () => {
		expect(joinOrStart([project("lab", repo)], fromRepo, repo)).toMatchObject({
			kind: "join",
			why: "repo",
			project: { name: "lab" },
		});
		expect(joinOrStart([project("sandbox", null)], fromRepo, repo)).toMatchObject({ kind: "join", why: "repaired" });
	});

	it("in a subfolder joins by repo alone never: sandbox/docs/ starts docs beside the repo's lab", () => {
		const docs = { name: "docs", from: "folder" } as const;
		expect(joinOrStart([project("lab", repo)], docs, repo)).toEqual({ kind: "start" });
		expect(joinOrStart([project("docs", null)], docs, repo)).toMatchObject({ kind: "taken" });
	});

	it("refuses a name another repo's project holds, and starts beside a repo's several projects", () => {
		expect(joinOrStart([project("sandbox", "github.com/else/sandbox")], fromRepo, repo)).toMatchObject({
			kind: "taken",
		});
		expect(joinOrStart([project("lab", repo), project("docs", repo)], fromRepo, repo)).toEqual({ kind: "start" });
	});

	it("starts a free `--name` even where the repo has its project, and refuses one that is taken", () => {
		expect(joinOrStart([project("sandbox", repo)], { name: "other", from: "flag" }, repo)).toEqual({ kind: "start" });
		expect(joinOrStart([project("other", null)], { name: "Other", from: "flag" }, repo)).toMatchObject({
			kind: "taken",
		});
	});
});

describe("initTeamProject against the team's projects (spool#295)", () => {
	const ORIGIN = "https://github.com/liamvinberg/learn-harness.git";

	/** A checkout of learn-harness, or of `origin`, with one commit, so worktrees can be added. */
	function checkout(name = "learn-harness", origin: string | null = ORIGIN): string {
		const root = repo(name);
		if (origin !== null) git(root, "remote", "add", "origin", origin);
		git(root, "commit", "--quiet", "--allow-empty", "-m", "start");
		return realpathSync(root);
	}

	/** A linked worktree of `main`, in a folder named after a task. */
	function worktree(main: string, name: string): string {
		const at = join(makeTempDir(), name);
		git(main, "worktree", "add", "--quiet", "-b", name, at);
		return realpathSync(at);
	}

	function team() {
		const cloud = fakeTeam();
		const init = (root: string, who = cloud.machine(`m${Math.random()}`), name?: string) =>
			initTeamProject(root, join(makeTempDir(), ".spool"), {
				team: "devosurf",
				origin: TEAM_ORIGIN,
				request: who.request,
				openSocket: who.openSocket,
				...(name === undefined ? {} : { name }),
			});
		return { cloud, init };
	}

	it("names it after the repo from a worktree, and a second worktree joins it, uploading nothing", async () => {
		const { cloud, init } = team();
		const main = checkout();
		const made = await init(worktree(main, "588-some-task"));
		expect(made).toMatchObject({ started: "made", uploaded: true, named: { name: "learn-harness", from: "repo" } });
		expect(made.link.url).toBe(`${TEAM_ORIGIN}/devosurf/learn-harness`);
		expect(cloud.repo("learn-harness")).toBe("github.com/liamvinberg/learn-harness");
		// the team's canvas moves on from the scaffold, so a join that scaffolded would show
		const ana = await teamWriter(cloud, cloud.machine("ana"), "learn-harness");
		await ana.save("frames/home/frame.tsx", "export default () => <h1>Home</h1>;\n");
		await ana.save("AGENTS.md", "The team's own rules.\n");
		ana.close();
		const saves = cloud.saves("learn-harness").length;

		const second = worktree(main, "601-another-task");
		const joined = await init(second);
		expect(joined).toMatchObject({ started: "joined", why: "repo", link: { project: "learn-harness" } });
		expect(readFileSync(join(second, "design/frames/home/frame.tsx"), "utf8")).toBe(
			"export default () => <h1>Home</h1>;\n",
		);
		expect(readFileSync(join(second, "design/AGENTS.md"), "utf8")).toBe("The team's own rules.\n");
		expect(JSON.parse(readFileSync(join(second, "spool.json"), "utf8"))).toEqual({ project: made.link.url });
		expect(cloud.saves("learn-harness")).toHaveLength(saves);
		expect(cloud.has("588-some-task") || cloud.has("601-another-task")).toBe(false);
	});

	it("joins a project of the repo's name with no repo, and records the repo on it", async () => {
		const { cloud, init } = team();
		// started from a temp folder, as agents dodged the bug: no checkout, so no repo
		const dodge = join(makeTempDir(), "learn-harness");
		mkdirSync(dodge);
		await init(dodge);
		expect(cloud.repo("learn-harness")).toBeNull();

		const joined = await init(checkout());
		expect(joined).toMatchObject({ started: "joined", why: "repaired" });
		expect(cloud.repo("learn-harness")).toBe("github.com/liamvinberg/learn-harness");
	});

	it("refuses the name another repo's project holds, pointing at --name, and --name starts one beside it", async () => {
		const { cloud, init } = team();
		await init(checkout("learn-harness", "https://github.com/else/learn-harness.git"));
		const mine = checkout();
		await expect(init(mine)).rejects.toThrow(/already has a project called "learn-harness".*`--name <name>`/u);
		expect(existsSync(join(mine, "design"))).toBe(false);
		expect(existsSync(join(mine, "spool.json"))).toBe(false);

		const other = await init(mine, undefined, "other");
		expect(other).toMatchObject({ started: "made", link: { project: "other" } });
		expect(cloud.repo("other")).toBe("github.com/liamvinberg/learn-harness");
	});

	it("leaves neither design/ nor spool.json when the join's fetch fails, and uploads nothing", async () => {
		const { cloud, init } = team();
		const ana = cloud.machine("ana");
		// the team has the repo's project, but nothing in it yet to fetch
		await cloudTeams(join(makeTempDir(), ".spool"), ana.request).createProject(
			"devosurf",
			"learn-harness",
			"github.com/liamvinberg/learn-harness",
		);
		const root = checkout();
		await expect(init(root)).rejects.toThrow(/has no files yet/u);
		expect(existsSync(join(root, "design"))).toBe(false);
		expect(existsSync(join(root, "spool.json"))).toBe(false);
		expect(cloud.paths("learn-harness")).toEqual([]);
		expect(cloud.saves("learn-harness")).toEqual([]);
	});

	it("decides again when the project is made between the read and the create", async () => {
		const { cloud, init } = team();
		const first = await init(checkout());
		const ben = cloud.machine("ben");
		let hidden = true;
		// the first read misses the project, as one made a moment later would be missed
		const late = {
			...ben,
			request: {
				...ben.request,
				fetch: (async (input, options) => {
					const response = await (ben.request.fetch as typeof fetch)(input, options);
					const request = new Request(input, options);
					if (!hidden || request.method !== "GET" || !request.url.endsWith("/api/teams/devosurf/projects"))
						return response;
					hidden = false;
					return Response.json({ projects: [] });
				}) as typeof fetch,
			},
		};
		const joined = await init(checkout(), late);
		expect(hidden).toBe(false);
		expect(joined).toMatchObject({ started: "joined", link: { url: first.link.url } });
	});
});
