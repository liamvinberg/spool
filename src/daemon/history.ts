import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { readCanvasFields } from "./canvas-file";
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

/** The line a save falls back to when its batch counts nothing nameable. */
export const HISTORY_MESSAGE = "design: save";

/**
 * The entry filenames that make a folder a frame; the kind is the filename
 * (#42), and a folder under `frames/` without one is a page (#231). This is how
 * a batch's paths are read back into frames: `frames/agent/chat/frame.json` is
 * a sidecar of the frame `agent/chat` only because `agent/chat` holds an entry.
 */
const FRAME_ENTRIES = new Set(["frame.tsx", "term.tsx"]);

/** The one file the hands own (#3). A frame that wrote only this one moved. */
const GEOMETRY_SIDECAR = "frame.json";

/** Git's empty tree — an unborn branch with nothing in `design/` writes this one. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** How long one git invocation may take before it is killed and the batch skipped. */
const GIT_TIMEOUT_MS = 15_000;

/**
 * Whether this project keeps history: the `history` flag in its canvas.json
 * (#158).
 *
 * The flag is in the project file rather than in per-machine state because the
 * choice belongs to the team — it is committed and cloned, so a teammate who
 * pulls gets the same posture without configuring anything.
 *
 * Absent means off, and that is the whole upgrade story: a project that existed
 * before history did keeps a canvas.json without the key, and installing a
 * newer spool must never start writing commits into somebody's repository
 * because they updated a tool. Anything that is not exactly `true` — a missing
 * file, a broken one, a string, a project whose design/ is gone this instant —
 * reads the same way, because every one of them is spool being unable to say
 * yes.
 */
export function historyEnabled(root: string): boolean {
	return readCanvasFields(root).history === true;
}

/** What git's name-status said happened to one path in a batch. */
export type HistoryChangeKind = "added" | "changed" | "removed";

/** One path a save touched, spelled relative to the design folder. */
export interface HistoryChange {
	path: string;
	kind: HistoryChangeKind;
}

/**
 * One batch as the message reads it: what the save touched, and where the tree
 * it wrote holds frames. The second half is the part paths alone cannot answer
 * — a page folder and a frame folder look identical until you see the entry
 * file inside one of them.
 */
export interface HistoryBatch {
	changes: readonly HistoryChange[];
	/** Frame folders in the saved tree, design-relative (`frames/agent/chat`). */
	frames: ReadonlySet<string>;
}

/**
 * The one line a save commits under: `design: <counts>` (#159).
 *
 * Counting is by frame rather than by file, because a frame is what the hands
 * and the agents both think in — writing a frame touches its entry, its
 * sidecar, and whatever else lives in the folder, and reading "5 files" back
 * off that tells you nothing. Each clause names one thing that happened:
 *
 *     design: 2 new, 3 frames, 1 removed, 4 moved, 2 files
 *
 * `frames` is the bare noun because a changed frame is the ordinary case and
 * the ordinary case earns the plain word; `new`, `removed` and `moved` say what
 * else happened to one. A frame whose whole batch is its geometry sidecar has
 * moved, not changed — that is the hands dragging it, and it reads that way in
 * the log. `files` is everything else under `design/` (`shared/` above all),
 * counted plainly by file since it has no frame to belong to.
 */
export function historyMessage(batch: HistoryBatch): string {
	// a frame whose entry file went away is in no tree the save wrote, so the
	// deletion is the only thing left that names its folder
	const folders = new Set(batch.frames);
	for (const change of batch.changes) {
		if (change.kind === "removed" && isFrameEntry(change.path)) folders.add(parentFolder(change.path));
	}

	interface Tally {
		/** an entry file arrived: the folder became a frame in this batch */
		born: boolean;
		/** an entry file went away */
		gone: boolean;
		/** something other than the geometry sidecar changed */
		content: boolean;
	}
	const frames = new Map<string, Tally>();
	let files = 0;
	for (const change of batch.changes) {
		const folder = owningFrame(folders, change.path);
		if (folder === undefined) {
			files += 1;
			continue;
		}
		const tally = frames.get(folder) ?? { born: false, gone: false, content: false };
		const within = change.path.slice(folder.length + 1);
		if (FRAME_ENTRIES.has(within)) {
			if (change.kind === "added") tally.born = true;
			if (change.kind === "removed") tally.gone = true;
		}
		if (within !== GEOMETRY_SIDECAR) tally.content = true;
		frames.set(folder, tally);
	}

	let added = 0;
	let changed = 0;
	let removed = 0;
	let moved = 0;
	for (const [folder, tally] of frames) {
		// a frame that swapped one entry kind for the other is still there
		if (tally.born) added += 1;
		else if (tally.gone && !batch.frames.has(folder)) removed += 1;
		else if (tally.content) changed += 1;
		else moved += 1;
	}

	const parts: string[] = [];
	if (added > 0) parts.push(`${added} new`);
	if (changed > 0) parts.push(`${changed} ${changed === 1 ? "frame" : "frames"}`);
	if (removed > 0) parts.push(`${removed} removed`);
	if (moved > 0) parts.push(`${moved} moved`);
	if (files > 0) parts.push(`${files} ${files === 1 ? "file" : "files"}`);
	return parts.length === 0 ? HISTORY_MESSAGE : `design: ${parts.join(", ")}`;
}

function isFrameEntry(path: string): boolean {
	return FRAME_ENTRIES.has(path.slice(path.lastIndexOf("/") + 1));
}

function parentFolder(path: string): string {
	return path.slice(0, Math.max(path.lastIndexOf("/"), 0));
}

/**
 * The frame one path belongs to, or nothing if it belongs to none. The
 * shallowest frame folder on the path wins, which is the same rule discovery
 * walks by: the walk stops at the first folder holding an entry, so everything
 * below it — nested folders included — is that frame's.
 */
function owningFrame(folders: ReadonlySet<string>, path: string): string | undefined {
	for (let cut = path.indexOf("/"); cut !== -1; cut = path.indexOf("/", cut + 1)) {
		const folder = path.slice(0, cut);
		if (folders.has(folder)) return folder;
	}
	return undefined;
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
	/**
	 * The per-user switch (#158): `history: false` in ~/.spool/config.json turns
	 * history off on this machine and beats every project flag. Absent means on,
	 * because the per-user setting is a refusal — it exists so a contributor is
	 * never committed on against their will, and it has nothing to say when
	 * nobody wrote it.
	 */
	enabled?: boolean;
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
	// the per-user refusal is machine-wide and never revisited: a project cannot
	// argue with it, so a daemon told no keeps nothing at all
	const allowed = deps.enabled ?? true;
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
		// the flag can be edited while the daemon runs, and a project turned off
		// between windows must not have git run for it: the window that would have
		// saved it lets it go instead, subscription and all
		if (!historyEnabled(root)) {
			drop(project);
			kept.delete(root);
			return;
		}
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
			const wanted = new Set(allowed ? roots.filter((root) => historyEnabled(root)) : []);
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

		let before = EMPTY_TREE;
		if (parent !== undefined) {
			const headTree = await git(repo, ["rev-parse", "--verify", `${parent}^{tree}`]);
			if (!headTree.ok) return { kind: "skipped" };
			before = headTree.stdout.trim();
		}
		if (before === tree) return { kind: "clean" };

		const batch = await readBatch(repo, scope, before, tree);
		if (batch === undefined) return { kind: "skipped" };
		const message = historyMessage(batch);
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

/**
 * The batch the message reads, taken from the two trees the save is already
 * built from rather than from anything the watcher remembered. One diff for
 * what moved, and one listing of the saved tree for where the frames are —
 * both scoped to `design/`, both answering for exactly the commit about to
 * land, which is what makes the same batch always read the same way.
 */
async function readBatch(
	repo: string,
	scope: string,
	before: string,
	after: string,
): Promise<HistoryBatch | undefined> {
	// --no-renames: a renamed frame is a frame gone and a frame arrived, and
	// counting it that way needs no guess about how alike two folders are
	const diff = await git(repo, ["diff-tree", "-r", "-z", "--no-renames", "--name-status", before, after, "--", scope]);
	if (!diff.ok) return undefined;
	const listed = await git(repo, ["ls-tree", "-r", "-z", "--name-only", after, "--", scope]);
	if (!listed.ok) return undefined;

	// -z pairs the fields flat: status, path, status, path
	const fields = diff.stdout.split("\0").filter((field) => field !== "");
	const changes: HistoryChange[] = [];
	for (let at = 0; at + 1 < fields.length; at += 2) {
		const path = designRelative(scope, fields[at + 1] ?? "");
		if (path !== undefined) changes.push({ path, kind: changeKind(fields[at] ?? "") });
	}

	const frames = new Set<string>();
	for (const entry of listed.stdout.split("\0")) {
		const path = designRelative(scope, entry);
		// only under frames/: a file called frame.tsx in shared/ui is a component
		if (path === undefined || !path.startsWith("frames/")) continue;
		if (isFrameEntry(path)) frames.add(parentFolder(path));
	}
	return { changes, frames };
}

/** Git's status letter, where everything that is not an arrival or a departure is an edit. */
function changeKind(status: string): HistoryChangeKind {
	if (status.startsWith("A")) return "added";
	if (status.startsWith("D")) return "removed";
	return "changed";
}

/** A repository-relative path respelled against the design folder, or nothing if it is outside. */
function designRelative(scope: string, path: string): string | undefined {
	if (path === "") return undefined;
	if (scope === ".") return path;
	return path.startsWith(`${scope}/`) ? path.slice(scope.length + 1) : undefined;
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
