import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { realDesignDir } from "./design-path";

/**
 * History (#78, #157): the git record of `design/` the daemon keeps by
 * committing canvas work on an idle debounce.
 *
 * Canvas work has two authors and neither of them commits. An agent writes
 * frame files and forgets to; the hands dragging frames write geometry
 * sidecars that no agent rule could catch. So the daemon watches `design/`,
 * and when the folder has been quiet for the idle window everything that
 * changed lands as one commit scoped to `design/` on the checked-out branch.
 *
 * The batch is derived from git rather than from bookkeeping: change events
 * only schedule the save, and what gets committed is read off the working tree
 * at fire time. That makes the catch-up case free — a `design/` left dirty by a
 * daemon that was down is just a batch pending its first window.
 *
 * A save is built from a temporary index, so a half-staged unrelated change is
 * never swept in. The real index is refreshed for `design/` paths alone, which
 * is what leaves the tree clean rather than showing the save back as a staged
 * revert. Nothing here pushes, nothing here runs a hook, and no failure
 * reaches the daemon: a batch that cannot commit rides into the next window.
 */

/** The trailing quiet a batch waits out before it commits. Fixed in v1 (#78). */
export const HISTORY_IDLE_MS = 45_000;

/** The one line every save commits under until #159 gives it counts. */
export const HISTORY_MESSAGE = "design: save";

/** Git's empty tree — an unborn branch with nothing in `design/` writes this one. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** How long one git invocation may take before it is killed and the batch skipped. */
const GIT_TIMEOUT_MS = 15_000;

/**
 * Whether this project keeps history.
 *
 * Hardwired on: #158 replaces this with the `canvas.json` project flag and the
 * per-user off switch that beats it, and the seam is here so that lands as one
 * function body rather than a rewrite.
 */
export function historyEnabled(_root: string): boolean {
	return true;
}

/**
 * The message one save commits under.
 *
 * Fixed: #159 widens this to the batch's own one-line summary
 * (`design: 3 frames, 1 moved`), which is why the message is built here rather
 * than written into the commit call.
 */
export function historyMessage(): string {
	return HISTORY_MESSAGE;
}

export interface HistoryTimer {
	cancel(): void;
}

/**
 * The idle window's timer, injectable so tests never sleep through one. `fire`
 * settles when the batch it ran has finished, which is what lets a test drive a
 * whole save without waiting on a real clock.
 */
export interface HistoryClock {
	schedule(fire: () => Promise<void>, delayMs: number): HistoryTimer;
}

const nodeHistoryClock: HistoryClock = {
	schedule: (fire, delayMs) => {
		const timer = setTimeout(() => void fire(), delayMs);
		timer.unref?.();
		return { cancel: () => clearTimeout(timer) };
	},
};

export interface HistoryDeps {
	/**
	 * Announce `design/` changes for one project and hand back the release.
	 * Production passes the change hub's subscription — history is a second
	 * reader of the one recursive watcher a project already has, never a
	 * second watcher.
	 */
	watch(root: string, changed: () => void): () => void;
	clock?: HistoryClock;
	/** Where the one notice a disabled project earns is written. */
	notice?: (message: string) => void;
}

export interface History {
	/**
	 * The projects history keeps. An arrival gets its catch-up batch, a
	 * departure is dropped, and everything else is left exactly as it was.
	 */
	keeping(roots: readonly string[]): void;
	close(): void;
}

/** What one fire did, which is the whole of whether the next one is armed. */
type Outcome =
	/** committed */
	| { kind: "saved" }
	/** nothing to commit */
	| { kind: "clean" }
	/** the gate said not now — retry next window */
	| { kind: "skipped" }
	/** there is no git here — stop asking, and say so once */
	| { kind: "disabled"; reason: string };

interface Kept {
	release: () => void;
	timer: HistoryTimer | undefined;
	saving: boolean;
	off: boolean;
}

export function createHistory(deps: HistoryDeps): History {
	const clock = deps.clock ?? nodeHistoryClock;
	const notice = deps.notice ?? ((message: string) => console.error(`spool: ${message}`));
	const kept = new Map<string, Kept>();
	let closed = false;

	function arm(root: string): void {
		const project = kept.get(root);
		if (closed || project === undefined || project.off) return;
		project.timer?.cancel();
		project.timer = clock.schedule(async () => {
			project.timer = undefined;
			await fire(root);
		}, HISTORY_IDLE_MS);
	}

	async function fire(root: string): Promise<void> {
		const project = kept.get(root);
		if (closed || project === undefined || project.off) return;
		// a save already in flight owns the working tree; wait the window out again
		if (project.saving) {
			arm(root);
			return;
		}
		project.saving = true;
		let outcome: Outcome;
		try {
			outcome = await saveDesign(root);
		} catch {
			// a batch is never worth a daemon: an unreadable tree, a vanished
			// project, a git that died — all of them are the next window's problem
			outcome = { kind: "skipped" };
		}
		project.saving = false;
		if (closed || kept.get(root) !== project) return;
		if (outcome.kind === "skipped") arm(root);
		if (outcome.kind === "disabled") {
			project.off = true;
			project.timer?.cancel();
			project.timer = undefined;
			notice(`history is off for ${root} — ${outcome.reason}`);
		}
	}

	function drop(project: Kept): void {
		project.timer?.cancel();
		project.timer = undefined;
		project.release();
	}

	return {
		keeping: (roots) => {
			if (closed) return;
			const wanted = new Set(roots.filter((root) => historyEnabled(root)));
			for (const [root, project] of kept) {
				if (wanted.has(root)) continue;
				drop(project);
				kept.delete(root);
			}
			for (const root of wanted) {
				if (kept.has(root)) continue;
				const project: Kept = { release: () => {}, timer: undefined, saving: false, off: false };
				kept.set(root, project);
				project.release = deps.watch(root, () => arm(root));
				// a project arrives with whatever the daemon missed already pending
				arm(root);
			}
		},
		close: () => {
			closed = true;
			for (const project of kept.values()) drop(project);
			kept.clear();
		},
	};
}

const run = promisify(execFile);

type GitRun = { ok: true; stdout: string } | { ok: false; missing: boolean };

/**
 * One git invocation, with the daemon's own git environment taken off it: a
 * daemon started from a hook can be carrying `GIT_DIR`, `GIT_WORK_TREE` or an
 * inherited `GIT_INDEX_FILE`, and every one of them would aim a save somewhere
 * else. Nothing here ever prompts and nothing here ever waits forever.
 */
async function git(cwd: string, args: readonly string[], indexFile?: string): Promise<GitRun> {
	const env: Record<string, string | undefined> = {
		...process.env,
		GIT_DIR: undefined,
		GIT_WORK_TREE: undefined,
		GIT_INDEX_FILE: indexFile,
		GIT_TERMINAL_PROMPT: "0",
	};
	try {
		const { stdout } = await run("git", [...args], { cwd, env, timeout: GIT_TIMEOUT_MS, windowsHide: true });
		return { ok: true, stdout };
	} catch (error) {
		return { ok: false, missing: (error as NodeJS.ErrnoException | null)?.code === "ENOENT" };
	}
}

/**
 * The gate, checked at fire time rather than remembered: a repo mid-merge,
 * mid-rebase, on a detached HEAD, or with its index locked by somebody else is
 * a repo a save has no business writing to.
 */
function blocked(gitDir: string): boolean {
	return (
		existsSync(join(gitDir, "MERGE_HEAD")) ||
		existsSync(join(gitDir, "rebase-merge")) ||
		existsSync(join(gitDir, "rebase-apply")) ||
		existsSync(join(gitDir, "index.lock"))
	);
}

/** One batch: everything `design/` has that HEAD does not, as one commit. */
async function saveDesign(root: string): Promise<Outcome> {
	let designDir: string;
	try {
		designDir = realDesignDir(root);
	} catch {
		// design/ is gone or unreadable this instant, which a project being moved
		// looks like — not a reason to stop asking
		return { kind: "skipped" };
	}

	const top = await git(designDir, ["rev-parse", "--show-toplevel"]);
	if (!top.ok) {
		return {
			kind: "disabled",
			reason: top.missing ? "git is not on PATH" : "design/ is not inside a git work tree",
		};
	}
	const repo = top.stdout.trim();
	const dir = await git(repo, ["rev-parse", "--absolute-git-dir"]);
	if (!dir.ok) return { kind: "disabled", reason: "design/ is not inside a git work tree" };
	if (blocked(dir.stdout.trim())) return { kind: "skipped" };
	// an unborn branch is still a branch; only a HEAD pointing at no ref is detached
	const branch = await git(repo, ["symbolic-ref", "--quiet", "HEAD"]);
	if (!branch.ok) return { kind: "skipped" };

	const scope = designPath(repo, designDir);
	// the real index first, and for design/ paths only: it is what makes the tree
	// read clean afterwards, and it leaves every other staged path exactly as it
	// was found
	if (!(await stageDesign(repo, scope))) return { kind: "skipped" };

	const head = await git(repo, ["rev-parse", "--verify", "--quiet", "HEAD"]);
	const parent = head.ok ? head.stdout.trim() : undefined;

	const scratch = mkdtempSync(join(tmpdir(), "spool-history-"));
	try {
		const index = join(scratch, "index");
		if (parent !== undefined) {
			const read = await git(repo, ["read-tree", parent], index);
			if (!read.ok) return { kind: "skipped" };
		}
		if (!(await stageDesign(repo, scope, index))) return { kind: "skipped" };
		const written = await git(repo, ["write-tree"], index);
		if (!written.ok) return { kind: "skipped" };
		const tree = written.stdout.trim();

		if (parent === undefined) {
			if (tree === EMPTY_TREE) return { kind: "clean" };
		} else {
			const headTree = await git(repo, ["rev-parse", "--verify", `${parent}^{tree}`]);
			if (!headTree.ok) return { kind: "skipped" };
			if (headTree.stdout.trim() === tree) return { kind: "clean" };
		}

		const message = historyMessage();
		// commit-tree runs no hook and takes no editor, and signing is turned off
		// because a save must never stop at a passphrase prompt
		const commit = await git(repo, [
			"-c",
			"commit.gpgsign=false",
			"commit-tree",
			tree,
			...(parent === undefined ? [] : ["-p", parent]),
			"-m",
			message,
		]);
		if (!commit.ok) return { kind: "skipped" };
		// compare-and-swap on the branch HEAD names: a commit that landed under us
		// loses the save rather than overwriting it
		const moved = await git(repo, ["update-ref", "-m", message, "HEAD", commit.stdout.trim(), parent ?? ""]);
		return moved.ok ? { kind: "saved" } : { kind: "skipped" };
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

/** The design folder as one git pathspec, relative to the repository root. */
function designPath(repo: string, designDir: string): string {
	const rel = relative(repo, designDir).split(sep).join("/");
	return rel === "" ? "." : rel;
}

/**
 * Stage everything `design/` has into one index, and take `.spool/` back out.
 *
 * `.spool/` is gitignored by `spool init`, so `git add` skips it on its own —
 * but a project that dropped that rule must still not get its camera
 * committed, and naming the folder in an `:(exclude)` pathspec is not the way
 * to say so: git answers a pathspec matching only ignored paths with a
 * non-zero exit, which would read as a failed batch on every single save.
 * Adding and then un-staging says the same thing and always succeeds.
 */
async function stageDesign(repo: string, design: string, indexFile?: string): Promise<boolean> {
	const added = await git(repo, ["add", "-A", "--", design], indexFile);
	if (!added.ok) return false;
	const spool = design === "." ? ".spool" : `${design}/.spool`;
	const dropped = await git(
		repo,
		["rm", "-r", "--cached", "--force", "--quiet", "--ignore-unmatch", "--", spool],
		indexFile,
	);
	return dropped.ok;
}
