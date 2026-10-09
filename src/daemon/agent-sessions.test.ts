import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import { engineSessions } from "./agent-sessions";

const SESSION = "6f1c1e4e-7d2a-4c1b-9a51-1a2b3c4d5e6f";

describe("an engine's model sessions", () => {
	it("hands back what was written for a thread, per engine, after a restart", () => {
		const spoolDir = makeTempDir();
		engineSessions(spoolDir, "codex").write(SESSION, "019a-codex");
		engineSessions(spoolDir, "pi").write(SESSION, "/home/p/.pi/sessions/one.jsonl");

		expect(engineSessions(spoolDir, "codex").read(SESSION)).toBe("019a-codex");
		expect(engineSessions(spoolDir, "pi").read(SESSION)).toBe("/home/p/.pi/sessions/one.jsonl");
		expect(engineSessions(spoolDir, "codex").read("another")).toBeUndefined();
	});

	it("keeps continuing the threads earlier versions stored in their own files", () => {
		const spoolDir = makeTempDir();
		mkdirSync(join(spoolDir, "codex", "threads"), { recursive: true });
		writeFileSync(join(spoolDir, "codex", "threads", `${SESSION}.json`), JSON.stringify({ thread: "019a-old" }));
		writeFileSync(join(spoolDir, "pi-sessions.json"), JSON.stringify({ [SESSION]: "/old/pi.jsonl" }));

		expect(engineSessions(spoolDir, "codex").read(SESSION)).toBe("019a-old");
		expect(engineSessions(spoolDir, "pi").read(SESSION)).toBe("/old/pi.jsonl");

		engineSessions(spoolDir, "codex").write(SESSION, "019a-new");
		expect(engineSessions(spoolDir, "codex").read(SESSION)).toBe("019a-new");
	});
});
