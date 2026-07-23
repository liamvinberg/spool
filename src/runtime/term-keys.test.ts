import { describe, expect, it } from "vitest";
import { termKeyIntent } from "./term-keys";

const key = (k: string, mods?: { meta?: boolean; ctrl?: boolean }) => ({
	key: k,
	metaKey: mods?.meta ?? false,
	ctrlKey: mods?.ctrl ?? false,
});

describe("termKeyIntent — the parity law for keys", () => {
	it("hands Escape to the TUI untouched", () => {
		expect(termKeyIntent(key("Escape"))).toBe("tui");
	});

	it("hands Ctrl+C to the TUI — signals belong to the process", () => {
		expect(termKeyIntent(key("c", { ctrl: true }))).toBe("tui");
	});

	it("hands Ctrl+Z and plain typing to the TUI", () => {
		expect(termKeyIntent(key("z", { ctrl: true }))).toBe("tui");
		expect(termKeyIntent(key("a"))).toBe("tui");
	});

	it("reserves platform modifier + Escape as the one way out", () => {
		expect(termKeyIntent(key("Escape", { meta: true }))).toBe("exit");
		expect(termKeyIntent(key("Escape", { ctrl: true }))).toBe("exit");
	});

	it("hands even the zoom chords to the TUI — one carve-out, not three", () => {
		expect(termKeyIntent(key("+", { meta: true }))).toBe("tui");
		expect(termKeyIntent(key("=", { ctrl: true }))).toBe("tui");
		expect(termKeyIntent(key("-", { ctrl: true }))).toBe("tui");
	});
});
