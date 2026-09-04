import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIGHT_THEME_TOKENS, parseSetting, SETTINGS, THEME_TOKENS, themeInline } from "./registry";

describe("settings registry", () => {
	it("mirrors the chrome's colour tokens in ui.css, value for value", () => {
		const css = readFileSync(join(__dirname, "..", "ui", "ui.css"), "utf8");
		for (const [token, dark] of Object.entries(THEME_TOKENS)) {
			const light = LIGHT_THEME_TOKENS[token as keyof typeof THEME_TOKENS];
			expect(css, `--color-${token}`).toContain(`--color-${token}: light-dark(${light}, ${dark});`);
		}
	});

	it("parses each shape and refuses what does not fit it", () => {
		expect(parseSetting("history", true)).toEqual({ ok: true, value: true });
		expect(parseSetting("history", "true").ok).toBe(false);
		expect(parseSetting("agent.permissions", "bypass")).toEqual({ ok: true, value: "bypass" });
		expect(parseSetting("agent.permissions", "yolo").ok).toBe(false);
		expect(parseSetting("theme.thread", " #2F6FE0 ")).toEqual({ ok: true, value: "#2f6fe0" });
		expect(parseSetting("theme.thread", "#fff").ok).toBe(false);
		expect(parseSetting("theme.thread", "red").ok).toBe(false);
	});

	it("gives every setting one scope and a fallback its shape accepts", () => {
		for (const [key, entry] of Object.entries(SETTINGS)) {
			expect(["project", "local", "machine"]).toContain(entry.scope);
			expect(parseSetting(key as keyof typeof SETTINGS, entry.fallback).ok, key).toBe(true);
		}
	});

	it("compiles only the tokens somebody moved into the inline theme", () => {
		const entry = (key: "theme.bg" | "theme.thread", value: string, source: "file" | "default") => ({
			...SETTINGS[key],
			key,
			value,
			source,
		});
		expect(themeInline([entry("theme.bg", "#0e0e0e", "default")])).toBe("");
		expect(themeInline([entry("theme.bg", "#0e0e0e", "default"), entry("theme.thread", "#2f6fe0", "file")])).toBe(
			"--color-thread:#2f6fe0",
		);
	});
});
