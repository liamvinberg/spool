import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DARK_TOKENS, LIGHT_TOKENS, parseSetting, SETTINGS, themeInline } from "./registry";

describe("settings registry", () => {
	it("mirrors the chrome's colour tokens in ui.css, value for value", () => {
		const css = readFileSync(join(__dirname, "..", "ui", "ui.css"), "utf8");
		for (const [token, dark] of Object.entries(DARK_TOKENS)) {
			const light = LIGHT_TOKENS[token as keyof typeof DARK_TOKENS];
			expect(css, `--color-${token}`).toContain(`--color-${token}: light-dark(${light}, ${dark});`);
		}
	});

	it("parses each shape and refuses what does not fit it", () => {
		expect(parseSetting("history", true)).toEqual({ ok: true, value: true });
		expect(parseSetting("history", "true").ok).toBe(false);
		expect(parseSetting("agent.permissions", "bypass")).toEqual({ ok: true, value: "bypass" });
		expect(parseSetting("agent.permissions", "yolo").ok).toBe(false);
		expect(parseSetting("theme.dark.thread", " #2F6FE0 ")).toEqual({ ok: true, value: "#2f6fe0" });
		expect(parseSetting("theme.dark.thread", "#fff").ok).toBe(false);
		expect(parseSetting("theme.dark.thread", "red").ok).toBe(false);
	});

	it("gives every setting one scope and a fallback its shape accepts", () => {
		for (const [key, entry] of Object.entries(SETTINGS)) {
			expect(["project", "local", "machine"]).toContain(entry.scope);
			expect(parseSetting(key as keyof typeof SETTINGS, entry.fallback).ok, key).toBe(true);
		}
	});

	it("compiles only the tokens somebody moved into the inline theme", () => {
		const entry = (
			key: "theme.dark.bg" | "theme.dark.thread" | "theme.light.thread",
			value: string,
			source: "file" | "default",
		) => ({
			...SETTINGS[key],
			key,
			value,
			source,
		});
		expect(themeInline([entry("theme.dark.bg", "#0e0e0e", "default")])).toBe("");
		// a token moved in one look keeps the stylesheet's value in the other
		expect(
			themeInline([entry("theme.dark.bg", "#0e0e0e", "default"), entry("theme.dark.thread", "#2f6fe0", "file")]),
		).toBe("--color-thread:light-dark(#f5391a,#2f6fe0)");
		expect(
			themeInline([entry("theme.dark.thread", "#2f6fe0", "file"), entry("theme.light.thread", "#8839ef", "file")]),
		).toBe("--color-thread:light-dark(#8839ef,#2f6fe0)");
	});
});
