import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { makeTempDir } from "../../../../src/test-helpers";

const script = fileURLToPath(new URL("./sessions.ts", import.meta.url));

function run(args: string[], state: string) {
	const result = spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
		encoding: "utf8",
		env: { ...process.env, SPOOL_DIR: state },
	});
	return {
		...result,
		rows: result.stdout
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line): unknown => JSON.parse(line)),
	};
}

function fixture() {
	const state = makeTempDir();
	const directory = join(state, "bundled", "sessions");
	mkdirSync(directory, { recursive: true });
	const file = join(directory, "fixture.jsonl");
	const entries = [
		{ type: "session", id: "fixture", cwd: "/fixture", timestamp: "2026-09-06T20:00:00Z" },
		{
			type: "message",
			id: "call-entry",
			message: {
				role: "assistant",
				model: "fixture-model",
				content: [
					{ type: "thinking", thinking: "private-thinking-marker" },
					{ type: "toolCall", id: "call-1", name: "bash", arguments: { command: "spool check" } },
				],
			},
		},
		{
			type: "message",
			id: "result-entry",
			parentId: "call-entry",
			message: {
				role: "toolResult",
				toolCallId: "call-1",
				toolName: "bash",
				isError: true,
				content: [
					{ type: "text", text: "command refused" },
					{ type: "image", mimeType: "image/png", data: "embedded-image-marker" },
				],
			},
		},
	];
	const source = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
	writeFileSync(file, source);
	return { state, file, source };
}

it("inventories the explicitly selected instance with a digest and error counts", () => {
	const { state, file, source } = fixture();
	const result = run(["list", "--state-dir", state], makeTempDir());
	expect(result.status).toBe(0);
	expect(result.rows[0]).toMatchObject({ state, sessions: 1, engine: "spool" });
	expect(result.rows[1]).toMatchObject({
		file,
		digest: createHash("sha256").update(source).digest("hex"),
		project: "/fixture",
		lastEntry: "result-entry",
		models: ["fixture-model"],
		toolErrors: 1,
		parseErrors: [],
	});
	expect(readFileSync(file, "utf8")).toBe(source);
});

it("preserves call/result identities and source lines while omitting images and thinking", () => {
	const { state, file } = fixture();
	const result = run(["read", file, "--from", "2", "--to", "3"], state);
	expect(result.status).toBe(0);
	expect(result.rows).toHaveLength(3);
	expect(result.rows[1]).toMatchObject({ line: 2, id: "call-entry", role: "assistant" });
	expect(result.rows[2]).toMatchObject({ line: 3, parentId: "call-entry", toolCallId: "call-1", isError: true });
	expect(result.stdout).toContain("spool check");
	expect(result.stdout).toContain("command refused");
	expect(result.stdout).not.toContain("embedded-image-marker");
	expect(result.stdout).not.toContain("private-thinking-marker");
});

it("marks clipped evidence and allows a complete focused reread", () => {
	const { state, file } = fixture();
	const clipped = run(["read", file, "--from", "2", "--to", "2", "--chars", "25"], state);
	expect(clipped.rows[1]).toMatchObject({ body: { omittedCharacters: expect.any(Number) } });
	const complete = run(["read", file, "--from", "2", "--to", "2", "--chars", "5000"], state);
	expect(complete.rows[1]).toMatchObject({
		body: { message: { content: [{ type: "toolCall", id: "call-1" }] } },
	});
});

it("reports malformed lines without losing their location or counting the inventory as clean", () => {
	const { state, file, source } = fixture();
	writeFileSync(file, `${source}broken\n`);
	const listed = run(["list"], state);
	expect(listed.status).toBe(1);
	expect(listed.rows[1]).toMatchObject({ parseErrors: [4], lines: 4 });
	const read = run(["read", file, "--from", "4"], state);
	expect(read.status).toBe(1);
	expect(read.rows[1]).toMatchObject({ line: 4, error: "Invalid JSON object" });
});
