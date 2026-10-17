import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import type { AgentTurnFoot } from "../ui/canvas/agent-transcript";
import type { AgentEvent } from "./agent-events";
import { agentPictureEnding } from "./agent-picture";
import { putThread, readThread } from "./agent-threads";

/*
 * A turn that ends with nobody watching is written down by the daemon, from the same fold the
 * rail draws (task 168). It is the rail's picture of the turn, foot and all: a receipt saying
 * how the turn went and how long it took, and the frames it made.
 */
describe("a turn's picture written with nobody watching", () => {
	it("keeps the turn's foot, with its ending and its length", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = makeTempDir();
		const id = "6b5c1d2e-1111-4222-8333-444455556668";
		putThread(spoolDir, root, id, {
			engine: "claude",
			ask: "go",
			life: "running",
			at: 0,
			entries: [{ key: "user:0", kind: "user", text: "go", context: null, attached: [] }],
			kept: 1,
			plan: null,
			queued: [],
			draft: "",
		});
		const stored = readThread(spoolDir, root, id);
		if (stored === undefined) throw new Error("the thread was not written");
		const events: AgentEvent[] = [
			{ kind: "say", block: 0, text: "Done.", parent: null, elapsed: 1_000 },
			{ kind: "ended", ending: "done", reason: null, stopReason: "end_turn", parent: null, elapsed: 4_000 },
			{ kind: "closed", code: 0, parent: null, elapsed: 4_100 },
		];

		agentPictureEnding(spoolDir, root, stored)(events);

		const entries = readThread(spoolDir, root, id)?.entries ?? [];
		const foot = entries.find((entry) => (entry as { kind?: unknown }).kind === "turn") as AgentTurnFoot | undefined;
		expect(foot?.ending).toBe("done");
		expect(foot?.ms).toBeGreaterThan(0);
	});
});
