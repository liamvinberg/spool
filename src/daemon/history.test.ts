import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../init";
import { makeApp, makeProject, makeTempDir, until, writeFrame, writePageFrame } from "../test-helpers";
import { HISTORY_IDLE_MS, type HistoryClock, type HistoryTimer } from "./history";

/**
 * History (#157) as the outside sees it: real temporary git repositories, the
 * daemon app seam, and the idle window driven by hand so nothing waits out
 * forty-five real seconds.
 *
 * Every assertion is on the repository — the log, the tree, the staging area —
 * never on the watcher or the timer. The clock is the one injected boundary,
 * and it is injected because the alternative is a sleeping test.
 */

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function writeFile(root: string, rel: string, content: string): void {
	const file = join(root, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
}

/** A registered spool project inside a real repository, with one commit behind it. */
function gitProject(spoolDir: string): string {
	const dir = makeTempDir();
	git(dir, "init", "--quiet", "--initial-branch=main", ".");
	git(dir, "config", "user.email", "hands@example.test");
	git(dir, "config", "user.name", "Hands");
	git(dir, "config", "commit.gpgsign", "false");
	const { root } = initProject(dir, spoolDir);
	writeFrame(root, "home", "export default () => <main>home</main>;\n");
	writeFile(root, "src/product.ts", "export const one = 1;\n");
	git(root, "add", "-A");
	git(root, "commit", "--quiet", "-m", "init");
	return root;
}

/** The subjects in the log, newest first. */
function log(root: string): string[] {
	return git(root, "log", "--format=%s").trim().split("\n").filter(Boolean);
}

/** Porcelain status lines, whose leading two columns are the whole point. */
function status(root: string): string[] {
	return git(root, "status", "--porcelain").split("\n").filter(Boolean);
}

/** What one commit touched, as sorted `<status>\t<path>` lines. */
function touched(root: string): string[] {
	return git(root, "show", "--name-status", "--format=", "HEAD").trim().split("\n").filter(Boolean).sort();
}

/**
 * The idle window as a handle: nothing fires until a test says so, and firing
 * settles when the batch it ran has finished.
 */
function testClock() {
	let pending: (() => Promise<void>)[] = [];
	let armings = 0;
	const windows: number[] = [];
	const clock: HistoryClock = {
		schedule: (fire, delayMs): HistoryTimer => {
			pending.push(fire);
			armings += 1;
			windows.push(delayMs);
			return {
				cancel: () => {
					pending = pending.filter((each) => each !== fire);
				},
			};
		},
	};
	return {
		clock,
		/** How many windows have been armed — a change heard is a window re-armed. */
		armings: () => armings,
		/** How long each armed window waits. */
		windows,
		async fire(): Promise<void> {
			const due = pending;
			pending = [];
			for (const fire of due) await fire();
		},
	};
}

type Clock = ReturnType<typeof testClock>;

/** Wait until the design/ watcher has heard something and re-armed the window. */
async function heard(clock: Clock): Promise<void> {
	const before = clock.armings();
	await until(() => clock.armings() > before);
}

/**
 * Make one change and know it was heard.
 *
 * macOS arms a recursive watcher asynchronously, so the first write after a
 * project opens can land before anything is listening. The write is idempotent
 * and repeated until a window arms, which is the same probe the SSE tests use —
 * here it can be the real change rather than a throwaway, because a batch is
 * read off the working tree at fire time and the clock has not fired yet.
 */
async function change(clock: Clock, write: () => void): Promise<void> {
	for (let attempt = 0; attempt < 40; attempt++) {
		const before = clock.armings();
		write();
		const armed = await until(() => clock.armings() > before, 300).then(
			() => true,
			() => false,
		);
		if (armed) return;
	}
	throw new Error("the design/ watcher never armed");
}

describe("history saves design/ on an idle window", () => {
	it("commits everything a burst changed as one save, and leaves the tree clean", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = gitProject(spoolDir);
		const clock = testClock();
		makeApp(spoolDir, { historyClock: clock.clock });

		await change(clock, () => writeFrame(root, "home", "export default () => <main>home, again</main>;\n"));
		writeFrame(root, "about", "export default () => <main>about</main>;\n");
		await heard(clock);
		await clock.fire();

		expect(log(root)).toEqual(["design: 1 new, 1 frame", "init"]);
		expect(touched(root)).toEqual(["A\tdesign/frames/about/frame.tsx", "M\tdesign/frames/home/frame.tsx"]);
		expect(status(root)).toEqual([]);
	});

	it("saves only design/ paths, on the checked-out branch, and never .spool/", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = gitProject(spoolDir);
		const clock = testClock();
		makeApp(spoolDir, { historyClock: clock.clock });

		writeFile(root, "src/product.ts", "export const one = 2;\n");
		writeFile(root, "design/.spool/state.json", '{"camera":{"x":1,"y":2,"k":1}}\n');
		await change(clock, () => writeFrame(root, "home", "export default () => <main>moved on</main>;\n"));
		await clock.fire();

		expect(touched(root)).toEqual(["M\tdesign/frames/home/frame.tsx"]);
		expect(git(root, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("main");
		// the product edit is still exactly where the hands left it
		expect(status(root)).toEqual([" M src/product.ts"]);
	});

	it("leaves a half-staged change outside design/ staged and uncommitted", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = gitProject(spoolDir);
		const clock = testClock();
		makeApp(spoolDir, { historyClock: clock.clock });

		writeFile(root, "src/product.ts", "export const one = 2;\n");
		git(root, "add", "src/product.ts");
		writeFile(root, "src/product.ts", "export const one = 3;\n");
		await change(clock, () => writeFrame(root, "home", "export default () => <main>saved</main>;\n"));
		await clock.fire();

		expect(touched(root)).toEqual(["M\tdesign/frames/home/frame.tsx"]);
		// one thing staged, another in the working tree, and the save disturbed neither
		expect(status(root)).toEqual(["MM src/product.ts"]);
		expect(git(root, "show", ":src/product.ts")).toBe("export const one = 2;\n");
	});

	it("saves a frame that only moved", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = gitProject(spoolDir);
		const clock = testClock();
		makeApp(spoolDir, { historyClock: clock.clock });

		await change(clock, () => writeFile(root, "design/frames/home/frame.json", '{"x":120,"y":40,"w":390,"h":844}\n'));
		await clock.fire();

		expect(log(root)).toEqual(["design: 1 moved", "init"]);
		expect(touched(root)).toEqual(["A\tdesign/frames/home/frame.json"]);
	});

	it("commits a design/ left dirty while the daemon was down, as a catch-up batch", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = gitProject(spoolDir);
		// the churn happens before there is a daemon at all
		writeFrame(root, "offline", "export default () => <main>offline</main>;\n");

		const clock = testClock();
		makeApp(spoolDir, { historyClock: clock.clock });
		await clock.fire();

		expect(log(root)).toEqual(["design: 1 new", "init"]);
		expect(touched(root)).toEqual(["A\tdesign/frames/offline/frame.tsx"]);
		expect(status(root)).toEqual([]);
	});

	it("commits nothing when design/ has not moved", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = gitProject(spoolDir);
		const clock = testClock();
		makeApp(spoolDir, { historyClock: clock.clock });
		await clock.fire();

		expect(log(root)).toEqual(["init"]);
		expect(clock.windows).toEqual([HISTORY_IDLE_MS]);
	});
});

describe("the save message counts the batch", () => {
	it("counts frames added, changed, removed and moved, and files beside them", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = gitProject(spoolDir);
		writeFrame(root, "beta", "export default () => <main>beta</main>;\n");
		writeFrame(root, "gamma", "export default () => <main>gamma</main>;\n");
		git(root, "add", "-A");
		git(root, "commit", "--quiet", "-m", "more frames");
		const clock = testClock();
		makeApp(spoolDir, { historyClock: clock.clock });

		writeFrame(root, "delta", "export default () => <main>delta</main>;\n");
		rmSync(join(root, "design", "frames", "beta"), { recursive: true, force: true });
		writeFile(root, "design/frames/gamma/frame.json", '{"x":40,"y":80,"w":390,"h":844}\n');
		writeFile(root, "design/shared/tokens.css", ":root { --ink: #fff; }\n");
		await change(clock, () => writeFrame(root, "home", "export default () => <main>home, edited</main>;\n"));
		await clock.fire();

		expect(log(root)[0]).toBe("design: 1 new, 1 frame, 1 removed, 1 moved, 1 file");
	});

	it("counts by frame, not by file or by page", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = gitProject(spoolDir);
		const clock = testClock();
		makeApp(spoolDir, { historyClock: clock.clock });

		// two frames on one page, one of them carrying a second file
		writePageFrame(root, "shop", "cart", "export default () => <main>cart</main>;\n");
		writeFile(root, "design/frames/shop/cart/frame.json", '{"x":0,"y":0,"w":390,"h":844}\n');
		await change(clock, () =>
			writePageFrame(root, "shop", "checkout", "export default () => <main>checkout</main>;\n"),
		);
		await clock.fire();

		expect(log(root)[0]).toBe("design: 2 new");
	});

	it("reads a frame that only wrote its sidecar as moved, not changed", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = gitProject(spoolDir);
		writeFile(root, "design/frames/home/frame.json", '{"x":0,"y":0,"w":390,"h":844}\n');
		git(root, "add", "-A");
		git(root, "commit", "--quiet", "-m", "place home");
		const clock = testClock();
		makeApp(spoolDir, { historyClock: clock.clock });

		await change(clock, () => writeFile(root, "design/frames/home/frame.json", '{"x":900,"y":80,"w":390,"h":844}\n'));
		await clock.fire();

		expect(log(root)[0]).toBe("design: 1 moved");
	});

	it("counts shared/ by file, since nothing there belongs to a frame", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = gitProject(spoolDir);
		const clock = testClock();
		makeApp(spoolDir, { historyClock: clock.clock });

		writeFile(root, "design/shared/lib/cart.ts", "export const empty = [];\n");
		await change(clock, () => writeFile(root, "design/shared/tokens.css", ":root { --ink: #eee; }\n"));
		await clock.fire();

		expect(log(root)[0]).toBe("design: 2 files");
	});

	it("says the same thing about the same batch twice", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = gitProject(spoolDir);
		const clock = testClock();
		makeApp(spoolDir, { historyClock: clock.clock });

		const batch = (): void => {
			writeFrame(root, "home", "export default () => <main>home, again</main>;\n");
			writeFrame(root, "about", "export default () => <main>about</main>;\n");
		};
		await change(clock, batch);
		await clock.fire();
		const first = log(root)[0];

		// the save undone, then made again out of the same bytes
		git(root, "reset", "--quiet", "--hard", "HEAD~1");
		await change(clock, batch);
		await clock.fire();

		expect(first).toBe("design: 1 new, 1 frame");
		expect(log(root)[0]).toBe(first);
	});
});

describe("the safety gate", () => {
	/** Each way a repository says "not now", and how the test puts it back. */
	const gates = [
		{
			name: "mid-merge",
			hold: (root: string) => writeFile(root, ".git/MERGE_HEAD", git(root, "rev-parse", "HEAD")),
			release: (root: string) => rmSync(join(root, ".git", "MERGE_HEAD"), { force: true }),
		},
		{
			name: "mid-rebase",
			hold: (root: string) => mkdirSync(join(root, ".git", "rebase-merge"), { recursive: true }),
			release: (root: string) => rmSync(join(root, ".git", "rebase-merge"), { recursive: true, force: true }),
		},
		{
			name: "a detached HEAD",
			hold: (root: string) => void git(root, "checkout", "--quiet", "--detach"),
			release: (root: string) => void git(root, "checkout", "--quiet", "main"),
		},
		{
			name: "a held index lock",
			hold: (root: string) => writeFile(root, ".git/index.lock", ""),
			release: (root: string) => rmSync(join(root, ".git", "index.lock"), { force: true }),
		},
	];

	it.each(gates)("skips on $name and commits the batch in a later window", async ({ hold, release }) => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = gitProject(spoolDir);
		const clock = testClock();
		makeApp(spoolDir, { historyClock: clock.clock });

		await change(clock, () => writeFrame(root, "home", "export default () => <main>held</main>;\n"));
		hold(root);
		await clock.fire();
		expect(log(root)).toEqual(["init"]);

		release(root);
		// a skipped batch rides into the next window rather than being forgotten
		await clock.fire();
		expect(log(root)).toEqual(["design: 1 frame", "init"]);
		expect(touched(root)).toEqual(["M\tdesign/frames/home/frame.tsx"]);
	});

	it("goes quiet with one notice when design/ is not in a git work tree", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const clock = testClock();
		const app = makeApp(spoolDir, { historyClock: clock.clock });

		writeFrame(root, "home", "export default () => <main>home</main>;\n");
		await clock.fire();

		expect(app.historyNotices).toHaveLength(1);
		expect(app.historyNotices[0]).toContain(root);
		expect(app.historyNotices[0]).toContain("git work tree");
		// nothing is armed any more, so nothing says it a second time
		await clock.fire();
		expect(app.historyNotices).toHaveLength(1);
	});
});
