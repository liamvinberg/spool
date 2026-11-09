import { expect, it } from "vitest";
import { harnessOf, terminalOf } from "./harness";

it("reads the harness off its own mark, and never off one of spool's own turns", () => {
	expect(harnessOf({ CLAUDECODE: "1" })).toBe("claude");
	expect(harnessOf({ CODEX_THREAD_ID: "thr_1" })).toBe("codex");
	expect(harnessOf({ PI_CODING_AGENT: "true" })).toBe("pi");
	expect(harnessOf({ CLAUDECODE: "1", SPOOL_TURN: "1" })).toBeNull();
	expect(harnessOf({ TERM_PROGRAM: "ghostty" })).toBeNull();
});

it("names the terminal by its app where tmux hides it", () => {
	expect(terminalOf("tmux", "com.mitchellh.ghostty")).toEqual({ name: "Ghostty", bundle: "com.mitchellh.ghostty" });
	expect(terminalOf("iTerm.app", undefined)).toEqual({ name: "iTerm", bundle: null });
	expect(terminalOf("ghostty", "bad id; rm")).toEqual({ name: "Ghostty", bundle: null });
});
