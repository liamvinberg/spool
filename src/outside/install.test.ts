import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import { connect, connection, disconnect, HookInstallError, harnessFiles, hookCommand } from "./install";

function machine() {
	const home = makeTempDir();
	const spoolDir = join(home, ".spool");
	const env = { HOME: home };
	return { home, spoolDir, env };
}

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));

describe("connecting a harness", () => {
	it("adds one background hook per event to Claude's settings and takes out exactly those", () => {
		const { home, spoolDir, env } = machine();
		const file = join(home, ".claude", "settings.json");
		mkdirSync(join(home, ".claude"));
		const theirs = {
			model: "opus",
			hooks: {
				Stop: [{ hooks: [{ type: "command", command: "say done" }] }],
				PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "./guard.sh" }] }],
			},
		};
		writeFileSync(file, JSON.stringify(theirs));

		expect(connect("claude", spoolDir, "http://127.0.0.1:7766", env).said).toBe("~/.claude/settings.json");
		const command = hookCommand(spoolDir, "claude");
		const settings = read(file);
		expect(settings.model).toBe("opus");
		expect(settings.hooks.Stop).toEqual([
			theirs.hooks.Stop[0],
			{ hooks: [{ type: "command", command, async: true }] },
		]);
		expect(settings.hooks.PreToolUse[0]).toEqual(theirs.hooks.PreToolUse[0]);
		expect(connection("claude", spoolDir, env)).toBe("connected");

		// connecting twice adds nothing twice
		connect("claude", spoolDir, "http://127.0.0.1:7766", env);
		expect(read(file).hooks.Stop).toHaveLength(2);

		disconnect("claude", spoolDir, env);
		expect(read(file)).toEqual(theirs);
		expect(connection("claude", spoolDir, env)).toBe("not-connected");
	});

	it("writes a script that says nothing and knows only this daemon's address and secret", () => {
		const { spoolDir, env } = machine();
		connect("codex", spoolDir, "http://127.0.0.1:7766", env);
		const script = readFileSync(join(spoolDir, "hooks", "hook.sh"), "utf8");
		const token = readFileSync(join(spoolDir, "hooks", "token"), "utf8").trim();
		expect(script).toContain(`'http://127.0.0.1:7766/api/hook/'"$1"`);
		expect(script).toContain(`x-spool-hook: ${token}`);
		expect(script).toContain('[ -n "$SPOOL_TURN" ] && exit 0');
		expect(read(harnessFiles("codex", spoolDir, env).file).hooks.Interrupt).toHaveLength(1);
	});

	it("gives pi an extension file of its own, and takes it away", () => {
		const { spoolDir, env } = machine();
		const { file } = connect("pi", spoolDir, "http://127.0.0.1:7766", env);
		expect(readFileSync(file, "utf8")).toContain(join(spoolDir, "hooks", "hook.json"));
		expect(connection("pi", spoolDir, env)).toBe("connected");
		disconnect("pi", spoolDir, env);
		expect(existsSync(file)).toBe(false);
	});

	it("leaves a settings file it can't read as it is, and says so", () => {
		const { home, spoolDir, env } = machine();
		mkdirSync(join(home, ".claude"));
		writeFileSync(join(home, ".claude", "settings.json"), "{ not json");
		expect(() => connect("claude", spoolDir, "http://127.0.0.1:7766", env)).toThrow(HookInstallError);
		expect(readFileSync(join(home, ".claude", "settings.json"), "utf8")).toBe("{ not json");
	});
});
