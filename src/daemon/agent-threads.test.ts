import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import {
	closeThread,
	parseThreadPut,
	putThread,
	readThreads,
	serveThreads,
	sessionExists,
	sessionFile,
	type ThreadPut,
	writeThread,
} from "./agent-threads";

/**
 * What survives a restart, and the two facts only the daemon can answer (#120, #200).
 *
 * The picture is the rail's and this is the disk under it, so nothing here has an opinion
 * about the drawing: what is tested is that a thread comes back the way it went down,
 * that a bad byte costs one thread rather than a project, that a restart marks a thread
 * stopped without ever resuming it, and that closing a tab deletes nothing.
 */

const ONE = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";
const TWO = "2a1b3c4d-5e6f-4788-9900-112233445566";
const ROOT = "/Users/liam/projects/kaffe";

/** a picture in the rail's own vocabulary, which this module carries and never reads */
const picture: ThreadPut = {
	ask: "shoot home and fix whatever reads wrong",
	life: "read",
	at: 1_700_000_000_000,
	entries: [
		{ key: "u0", kind: "user", text: "shoot home and fix whatever reads wrong", context: null, attached: null },
		{ key: "row:t1", kind: "row", state: "done", verb: "shot", subject: "home" },
	],
	kept: 2,
	plan: null,
	queued: [],
	draft: "",
};

const noSessions = { HOME: "/nowhere" };

describe("the store", () => {
	it("hands a thread back the way it went down, drawing and all", () => {
		const spoolDir = makeTempDir();
		putThread(spoolDir, ROOT, ONE, picture);

		const [back] = readThreads(spoolDir, ROOT);
		expect(back).toEqual({ id: ONE, ...picture, stopped: false, closed: false });
		// nothing is capped and nothing is elided, so live and restored are the same view
		expect(back?.entries).toEqual(picture.entries);
	});

	it("keys by the project root, so two projects never see each other's threads", () => {
		const spoolDir = makeTempDir();
		putThread(spoolDir, ROOT, ONE, picture);
		putThread(spoolDir, "/Users/liam/projects/other", TWO, picture);

		expect(readThreads(spoolDir, ROOT).map((one) => one.id)).toEqual([ONE]);
		expect(readThreads(spoolDir, "/Users/liam/projects/other").map((one) => one.id)).toEqual([TWO]);
	});

	it("holds them in the order they were last touched", () => {
		const spoolDir = makeTempDir();
		putThread(spoolDir, ROOT, ONE, { ...picture, at: 20 });
		putThread(spoolDir, ROOT, TWO, { ...picture, at: 10 });

		expect(readThreads(spoolDir, ROOT).map((one) => one.at)).toEqual([10, 20]);
	});

	/** one file per thread is what makes a bad byte cheap: the strip still holds the rest */
	it("loses one thread to an unreadable file and keeps the project", () => {
		const spoolDir = makeTempDir();
		putThread(spoolDir, ROOT, ONE, picture);
		const dir = dirOf(spoolDir);
		writeFileSync(join(dir, `${TWO}.json`), "{ this is not json");

		expect(readThreads(spoolDir, ROOT).map((one) => one.id)).toEqual([ONE]);
	});

	it("reads no threads at all for a project that has never had one", () => {
		expect(readThreads(makeTempDir(), ROOT)).toEqual([]);
	});

	it("refuses a put that is not a thread, and one that claims spool's own flags", () => {
		expect(parseThreadPut({ ask: "", life: "read", entries: [] })).toBeUndefined();
		expect(parseThreadPut({ ask: "go", life: "streaming", entries: [] })).toBeUndefined();
		expect(parseThreadPut({ ask: "go", life: "read" })).toBeUndefined();
		expect(parseThreadPut("go")).toBeUndefined();
		// a client says what it drew; a restart and a close are spool's own to say
		expect(parseThreadPut({ ask: "go", life: "read", entries: [], stopped: true, closed: true })).toMatchObject({
			ask: "go",
		});
	});

	describe("a restart", () => {
		/**
		 * A restart marks a thread stopped and never resumes it, because a reboot is not a
		 * hand: an agent has write access to the repo, and re-running one because a
		 * background process came back up is spool acting where nobody asked.
		 */
		it("marks a thread whose process is gone stopped, and unread with it", () => {
			const spoolDir = makeTempDir();
			putThread(spoolDir, ROOT, ONE, { ...picture, life: "running" });

			const [back] = serveThreads(spoolDir, ROOT, { live: new Set(), env: noSessions });
			expect(back?.stopped).toBe(true);
			// it changed while nobody was looking at it, and the change is that it stopped
			expect(back?.life).toBe("unread");
		});

		it("marks a thread parked on a question stopped too, since nobody can answer it now", () => {
			const spoolDir = makeTempDir();
			putThread(spoolDir, ROOT, ONE, { ...picture, life: "waiting" });

			expect(serveThreads(spoolDir, ROOT, { live: new Set(), env: noSessions })[0]?.stopped).toBe(true);
		});

		it("leaves a thread this daemon is still running alone", () => {
			const spoolDir = makeTempDir();
			putThread(spoolDir, ROOT, ONE, { ...picture, life: "running" });

			const [back] = serveThreads(spoolDir, ROOT, { live: new Set([ONE]), env: noSessions });
			expect(back?.stopped).toBe(false);
			expect(back?.life).toBe("running");
		});

		it("leaves a thread that had already finished alone", () => {
			const spoolDir = makeTempDir();
			putThread(spoolDir, ROOT, ONE, { ...picture, life: "unread" });

			const [back] = serveThreads(spoolDir, ROOT, { live: new Set(), env: noSessions });
			expect(back?.stopped).toBe(false);
			expect(back?.life).toBe("unread");
		});

		/** a thread the hands send into is running again, so the mark a restart left clears */
		it("is cleared by the next thing said in the thread", () => {
			const spoolDir = makeTempDir();
			writeThread(spoolDir, ROOT, { id: ONE, ...picture, stopped: true, closed: false });
			putThread(spoolDir, ROOT, ONE, { ...picture, life: "running" });

			expect(readThreads(spoolDir, ROOT)[0]?.stopped).toBe(false);
		});
	});

	describe("closing a thread", () => {
		it("takes it out of the strip and leaves every byte of it on disk", () => {
			const spoolDir = makeTempDir();
			putThread(spoolDir, ROOT, ONE, picture);
			const file = join(dirOf(spoolDir), `${ONE}.json`);
			const before = JSON.parse(readFileSync(file, "utf8")) as { entries: unknown[] };

			expect(closeThread(spoolDir, ROOT, ONE)).toBe(true);

			expect(readThreads(spoolDir, ROOT)).toEqual([]);
			// spool does not throw away a readable record because a tab was put away
			const after = JSON.parse(readFileSync(file, "utf8")) as { entries: unknown[]; closed: boolean };
			expect(after.entries).toEqual(before.entries);
			expect(after.closed).toBe(true);
		});

		it("leaves the agent's own session where it is", () => {
			const spoolDir = makeTempDir();
			const home = makeTempDir();
			const session = plantSession(home, ROOT, ONE);
			putThread(spoolDir, ROOT, ONE, picture);

			closeThread(spoolDir, ROOT, ONE);

			expect(sessionExists(ROOT, ONE, { HOME: home })).toBe(true);
			expect(readFileSync(session, "utf8")).toBe("{}\n");
		});

		it("says so when there is no such thread", () => {
			expect(closeThread(makeTempDir(), ROOT, ONE)).toBe(false);
		});

		it("stays closed when the same picture is written again", () => {
			const spoolDir = makeTempDir();
			putThread(spoolDir, ROOT, ONE, picture);
			closeThread(spoolDir, ROOT, ONE);
			putThread(spoolDir, ROOT, ONE, picture);

			expect(readThreads(spoolDir, ROOT)).toEqual([]);
		});
	});

	describe("the agent's own session", () => {
		/**
		 * The binary deletes its own sessions after thirty days, so spool's picture outlives
		 * the thing that makes the conversation continuable. Such a thread reads as finished
		 * rather than offering a resume that would fail.
		 */
		it("is what says whether a thread can be continued", () => {
			const spoolDir = makeTempDir();
			const home = makeTempDir();
			putThread(spoolDir, ROOT, ONE, picture);

			expect(serveThreads(spoolDir, ROOT, { live: new Set(), env: { HOME: home } })[0]?.continuable).toBe(false);

			plantSession(home, ROOT, ONE);
			expect(serveThreads(spoolDir, ROOT, { live: new Set(), env: { HOME: home } })[0]?.continuable).toBe(true);
		});

		it("is never deleted by spool when the picture outlives it", () => {
			const spoolDir = makeTempDir();
			const home = makeTempDir();
			putThread(spoolDir, ROOT, ONE, picture);

			serveThreads(spoolDir, ROOT, { live: new Set(), env: { HOME: home } });

			// the picture of a thread you cannot continue is still worth reading, and spool
			// does not throw one away on a timer somebody else configured
			expect(readThreads(spoolDir, ROOT)).toHaveLength(1);
		});

		it("is found where the binary keeps it, by the binary's own slug", () => {
			expect(sessionFile("/Users/liam/projects/kaffe", ONE, { HOME: "/Users/liam" })).toBe(
				`/Users/liam/.claude/projects/-Users-liam-projects-kaffe/${ONE}.jsonl`,
			);
			// every character that is not a letter or a digit, dots included
			expect(sessionFile("/Users/liam/.config/nvim", ONE, { HOME: "/Users/liam" })).toContain(
				"-Users-liam--config-nvim",
			);
		});

		/** the spawn inherits the environment whole, so a config elsewhere keeps its sessions there */
		it("follows CLAUDE_CONFIG_DIR when the developer has moved it", () => {
			expect(sessionFile(ROOT, ONE, { HOME: "/Users/liam", CLAUDE_CONFIG_DIR: "/opt/claude" })).toBe(
				`/opt/claude/projects/-Users-liam-projects-kaffe/${ONE}.jsonl`,
			);
		});
	});
});

/** the one directory a project's threads live in, found the way a hand would find it */
function dirOf(spoolDir: string): string {
	const dir = join(spoolDir, "threads");
	const [key] = readdirSync(dir);
	return join(dir, key as string);
}

/** the binary's own session file, at the path spool checks for */
function plantSession(home: string, root: string, id: string): string {
	const file = sessionFile(root, id, { HOME: home });
	mkdirSync(join(file, ".."), { recursive: true });
	writeFileSync(file, "{}\n");
	return file;
}
