import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cloneInto, cloneProgressOf, remoteHead } from "./git-clone";
import { makeTempDir } from "./test-helpers";

const git = (cwd: string, ...args: string[]) =>
	execFileSync("git", args, {
		cwd,
		env: {
			...process.env,
			GIT_DIR: undefined,
			GIT_WORK_TREE: undefined,
			GIT_AUTHOR_NAME: "a",
			GIT_AUTHOR_EMAIL: "a@b",
			GIT_COMMITTER_NAME: "a",
			GIT_COMMITTER_EMAIL: "a@b",
		},
	});

it("clones a repo that answers with its branch, and leaves nothing behind when the clone fails", async () => {
	const dir = makeTempDir();
	const source = join(dir, "tide-tables");
	mkdirSync(source);
	git(source, "init", "-q", "-b", "trunk");
	writeFileSync(join(source, "README.md"), "tides\n");
	git(source, "add", ".");
	git(source, "commit", "-q", "-m", "first");
	const url = `file://${source}`;
	expect(await remoteHead(url)).toEqual({ branch: "trunk" });
	expect(await remoteHead(`file://${join(dir, "nothing")}`)).toBeUndefined();

	const seen: (number | null)[] = [];
	await cloneInto(url, join(dir, "spool", "tide-tables"), { progress: (progress) => seen.push(progress.done) });
	expect(readFileSync(join(dir, "spool", "tide-tables", "README.md"), "utf8")).toBe("tides\n");
	expect(seen.length).toBeGreaterThan(0);

	await expect(cloneInto(`file://${join(dir, "nothing")}`, join(dir, "spool", "gone"))).rejects.toThrow();
	expect(existsSync(join(dir, "spool", "gone"))).toBe(false);
});

it("reads how far a clone has got from what git prints", () => {
	expect(cloneProgressOf("Receiving objects:  46% (460/1000), 1.2 MiB | 2 MiB/s")).toEqual({
		line: "receiving objects:  46%",
		done: 0.46 * 0.9,
	});
	expect(cloneProgressOf("Resolving deltas: 100% (20/20), done.").done).toBe(1);
	expect(cloneProgressOf("remote: Counting objects: 12, done.")).toEqual({
		line: "counting objects: 12, done.",
		done: null,
	});
});
