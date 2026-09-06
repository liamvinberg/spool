import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import { changedPaths, checksForPaths } from "./ci-scope.ts";

describe("CI change scope", () => {
	it("runs design checks for canvas saves without rerunning product tests", () => {
		expect(checksForPaths(["design/canvas.json", "design/shared/tokens.css"])).toEqual({
			full: false,
			design: true,
			desktop: false,
		});
	});

	it("keeps shipped skill prose and release manifests under the full gate", () => {
		for (const path of ["src/skill/frames.md", "package.json", "pnpm-lock.yaml", ".changeset/checker.md"]) {
			expect(checksForPaths([path]).full, path).toBe(true);
		}
	});

	it("does not let accompanying docs or design changes hide product changes", () => {
		expect(checksForPaths(["docs/releases.md", "design/canvas.json", "src/check.ts"]).full).toBe(true);
		expect(checksForPaths(["docs/releases.md"]).full).toBe(false);
	});

	it("checks desktop changes and changes to how CI executes them", () => {
		for (const path of ["desktop/src/index.ts", "desktop/pnpm-lock.yaml", ".github/workflows/ci.yml"]) {
			expect(checksForPaths([path]).desktop, path).toBe(true);
		}
	});

	it("requires full validation for a manual run or a push without a base", () => {
		expect(changedPaths("workflow_dispatch", "", "")).toBeNull();
		expect(changedPaths("push", "0".repeat(40), "a".repeat(40))).toBeNull();
	});

	it("checks all commits in a push even when its final commit only saves design", () => {
		const repo = repository();
		const before = repo.commit("README.md");
		repo.commit("src/skill/frames.md");
		const after = repo.commit("design/canvas.json");
		expect(repo.scope("push", { before, after })).toContain("full=true\n");
	});

	it("compares PR changes from the branch point rather than including changes on main", () => {
		const repo = repository();
		repo.commit("README.md");
		repo.git("checkout", "-b", "feature");
		const head = repo.commit("docs/releases.md");
		repo.git("checkout", "main");
		const base = repo.commit("src/check.ts");
		expect(repo.scope("pull_request", { pull_request: { base: { sha: base }, head: { sha: head } } })).toBe(
			"full=false\ndesign=false\ndesktop=false\n",
		);
	});

	it("still checks a removed source file when Git recognizes it as a move into docs", () => {
		const repo = repository();
		repo.commit("docs/notes.md");
		const before = repo.commit("src/check.ts");
		repo.git("mv", "src/check.ts", "docs/check.md");
		repo.git("commit", "-am", "test: move source into docs");
		expect(repo.scope("push", { before, after: repo.git("rev-parse", "HEAD") })).toContain("full=true\n");
	});
});

function repository() {
	const root = mkdtempSync(join(tmpdir(), "spool-ci-scope-"));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const git = (...args: string[]) =>
		execFileSync(
			"git",
			["-c", "user.name=CI test", "-c", "user.email=ci@example.test", "-c", "commit.gpgsign=false", ...args],
			{
				cwd: root,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			},
		).trim();
	git("init", "--initial-branch=main");
	return {
		git,
		commit(path: string) {
			mkdirSync(dirname(join(root, path)), { recursive: true });
			writeFileSync(join(root, path), "test\n");
			git("add", "--", path);
			git("commit", "-m", "test: change a file");
			return git("rev-parse", "HEAD");
		},
		scope(name: string, event: unknown) {
			const eventFile = join(root, "event.json");
			const output = join(root, "output");
			writeFileSync(eventFile, JSON.stringify(event));
			execFileSync(
				process.execPath,
				["--experimental-strip-types", fileURLToPath(new URL("./ci-scope.ts", import.meta.url))],
				{
					cwd: root,
					env: { ...process.env, GITHUB_EVENT_NAME: name, GITHUB_EVENT_PATH: eventFile, GITHUB_OUTPUT: output },
				},
			);
			return readFileSync(output, "utf8");
		},
	};
}
