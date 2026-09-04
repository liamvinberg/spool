import { describe, expect, it } from "vitest";
import { DARK_TOKENS, THEME_TOKEN_NAMES } from "./registry";
import { matchPreset, PRESETS, parseTheme, printTheme, themeWrites } from "./themes";

describe("themes", () => {
	it("ships every preset complete, parseable, and named once per look", () => {
		const seen = new Set<string>();
		for (const preset of PRESETS) {
			const key = `${preset.appearance}/${preset.name}`;
			expect(seen.has(key), key).toBe(false);
			seen.add(key);
			expect(parseTheme(printTheme(preset))).toEqual({ ok: true, theme: preset });
			expect(themeWrites(preset)).toHaveLength(THEME_TOKEN_NAMES.length);
			expect(themeWrites(preset)[0]?.key).toBe(`theme.${preset.appearance}.bg`);
		}
		expect(PRESETS.some((preset) => preset.name === "Spool" && preset.appearance === "dark")).toBe(true);
		expect(PRESETS.some((preset) => preset.name === "Spool" && preset.appearance === "light")).toBe(true);
	});

	it("refuses what is not a theme, with the reason", () => {
		expect(parseTheme("{")).toMatchObject({ ok: false, reason: "not JSON" });
		expect(parseTheme({ name: "x", appearance: "dusk", tokens: {} })).toMatchObject({ ok: false });
		expect(parseTheme({ name: "x", appearance: "dark", tokens: { ...DARK_TOKENS, mark: "#000000" } })).toMatchObject({
			ok: false,
			reason: 'no token named "mark"',
		});
		const { thread: _thread, ...short } = DARK_TOKENS;
		expect(parseTheme({ name: "x", appearance: "dark", tokens: short })).toMatchObject({
			ok: false,
			reason: '"thread" is missing',
		});
		expect(parseTheme({ name: "x", appearance: "dark", tokens: { ...DARK_TOKENS, thread: "red" } })).toMatchObject({
			ok: false,
		});
		// a hex is taken the way the registry takes it
		expect(
			parseTheme({ name: " Mine ", appearance: "dark", tokens: { ...DARK_TOKENS, thread: " #2F6FE0 " } }),
		).toMatchObject({ ok: true, theme: { name: "Mine", tokens: { thread: "#2f6fe0" } } });
	});

	it("names the preset a set of tokens is, and nothing when it is nobody's", () => {
		expect(matchPreset("dark", DARK_TOKENS)?.name).toBe("Spool");
		expect(matchPreset("light", DARK_TOKENS)).toBeUndefined();
		expect(matchPreset("dark", { ...DARK_TOKENS, thread: "#2f6fe0" })).toBeUndefined();
	});
});
