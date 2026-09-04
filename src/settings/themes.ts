import {
	DARK_TOKENS,
	LIGHT_TOKENS,
	parseSetting,
	THEME_LOOKS,
	THEME_TOKEN_NAMES,
	type ThemeLook,
	type ThemeToken,
	themeKey,
} from "./registry";

/**
 * A theme as a thing you can hand somebody (#282): a name, the look it is for,
 * and the ten tokens. It is the `theme.<look>` slice of config.json with a
 * name on it, so a preset here, a theme pasted into the sheet and a hand edit
 * of the file are the same shape and go through the same check.
 */
export interface ThemeSpec {
	readonly name: string;
	readonly appearance: ThemeLook;
	readonly tokens: Readonly<Record<ThemeToken, string>>;
}

/** The writes that put a theme into its look: one per token, in registry order. */
export function themeWrites(theme: ThemeSpec): { key: `theme.${ThemeLook}.${ThemeToken}`; value: string }[] {
	return THEME_TOKEN_NAMES.map((token) => ({ key: themeKey(theme.appearance, token), value: theme.tokens[token] }));
}

/**
 * Something pasted, against the shape. Every token has to be there and be a
 * colour the registry takes; an unknown key is refused rather than ignored, so
 * a typo in a token name is heard rather than silently dropped.
 */
export function parseTheme(raw: unknown): { ok: true; theme: ThemeSpec } | { ok: false; reason: string } {
	let value = raw;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			return { ok: false, reason: "not JSON" };
		}
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return { ok: false, reason: "a theme is an object with name, appearance and tokens" };
	}
	const { name, appearance, tokens } = value as { name?: unknown; appearance?: unknown; tokens?: unknown };
	if (typeof name !== "string" || name.trim() === "") return { ok: false, reason: '"name" must be a string' };
	if (typeof appearance !== "string" || !THEME_LOOKS.includes(appearance as ThemeLook)) {
		return { ok: false, reason: `"appearance" must be ${THEME_LOOKS.join(" or ")}` };
	}
	if (typeof tokens !== "object" || tokens === null || Array.isArray(tokens)) {
		return { ok: false, reason: '"tokens" must be an object' };
	}
	const held = tokens as Record<string, unknown>;
	for (const key of Object.keys(held)) {
		if (!THEME_TOKEN_NAMES.includes(key as ThemeToken)) return { ok: false, reason: `no token named "${key}"` };
	}
	const parsed = {} as Record<ThemeToken, string>;
	for (const token of THEME_TOKEN_NAMES) {
		if (!(token in held)) return { ok: false, reason: `"${token}" is missing` };
		const colour = parseSetting(themeKey(appearance as ThemeLook, token), held[token]);
		if (!colour.ok) return { ok: false, reason: `"${token}" must be a six-digit hex colour like #f5391a` };
		parsed[token] = colour.value;
	}
	return { ok: true, theme: { name: name.trim(), appearance: appearance as ThemeLook, tokens: parsed } };
}

/** The theme as text, the way it is copied out and pasted in. */
export function printTheme(theme: ThemeSpec): string {
	return `${JSON.stringify({ name: theme.name, appearance: theme.appearance, tokens: theme.tokens }, null, "\t")}\n`;
}

/** The preset whose tokens are exactly these, if any. */
export function matchPreset(look: ThemeLook, tokens: Readonly<Record<ThemeToken, string>>): ThemeSpec | undefined {
	return PRESETS.find(
		(preset) =>
			preset.appearance === look && THEME_TOKEN_NAMES.every((token) => preset.tokens[token] === tokens[token]),
	);
}

const t = (
	appearance: ThemeLook,
	name: string,
	[bg, canvas, surface, raised, border, borderRaised, text, muted, thread, onThread]: readonly [
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
	],
): ThemeSpec => ({
	name,
	appearance,
	tokens: {
		bg,
		canvas,
		surface,
		raised,
		border,
		"border-raised": borderRaised,
		text,
		muted,
		thread,
		"on-thread": onThread,
	},
});

/**
 * The presets, each mapped from its palette's own published values onto the
 * ten tokens. The order of a row is bg, canvas, surface, raised, border,
 * border-raised, text, muted, thread, on-thread: the surfaces from the back
 * forward, then the two inks, then the accent and the ink on it. Where a
 * palette has no step for one of ours, the nearest of its own is used twice.
 */
export const PRESETS: readonly ThemeSpec[] = [
	{ name: "Spool", appearance: "dark", tokens: DARK_TOKENS },
	t("dark", "Mono", [
		"#000000",
		"#0a0a0a",
		"#111111",
		"#1f1f1f",
		"#1f1f1f",
		"#333333",
		"#ffffff",
		"#888888",
		"#ffffff",
		"#000000",
	]),
	t("dark", "Catppuccin Mocha", [
		"#11111b",
		"#1e1e2e",
		"#181825",
		"#313244",
		"#313244",
		"#45475a",
		"#cdd6f4",
		"#a6adc8",
		"#cba6f7",
		"#11111b",
	]),
	t("dark", "Nord", [
		"#242933",
		"#2e3440",
		"#3b4252",
		"#434c5e",
		"#434c5e",
		"#4c566a",
		"#eceff4",
		"#a3adc2",
		"#88c0d0",
		"#2e3440",
	]),
	t("dark", "Dracula", [
		"#191a21",
		"#21222c",
		"#282a36",
		"#343746",
		"#343746",
		"#44475a",
		"#f8f8f2",
		"#6272a4",
		"#bd93f9",
		"#282a36",
	]),
	t("dark", "Tokyo Night", [
		"#16161e",
		"#1a1b26",
		"#1f2335",
		"#292e42",
		"#292e42",
		"#414868",
		"#c0caf5",
		"#7982a9",
		"#7aa2f7",
		"#16161e",
	]),
	t("dark", "One Dark", [
		"#21252b",
		"#282c34",
		"#2c313a",
		"#3e4451",
		"#3e4451",
		"#4b5263",
		"#abb2bf",
		"#5c6370",
		"#61afef",
		"#282c34",
	]),
	t("dark", "Gruvbox Dark", [
		"#1d2021",
		"#282828",
		"#32302f",
		"#3c3836",
		"#3c3836",
		"#504945",
		"#ebdbb2",
		"#a89984",
		"#fe8019",
		"#1d2021",
	]),
	t("dark", "Solarized Dark", [
		"#00212b",
		"#002b36",
		"#073642",
		"#0d4450",
		"#0d4450",
		"#1a5866",
		"#eee8d5",
		"#839496",
		"#268bd2",
		"#fdf6e3",
	]),
	t("dark", "Rosé Pine", [
		"#191724",
		"#1f1d2e",
		"#26233a",
		"#403d52",
		"#403d52",
		"#524f67",
		"#e0def4",
		"#908caa",
		"#ebbcba",
		"#191724",
	]),
	t("dark", "GitHub Dark", [
		"#010409",
		"#0d1117",
		"#161b22",
		"#21262d",
		"#21262d",
		"#30363d",
		"#e6edf3",
		"#8b949e",
		"#58a6ff",
		"#0d1117",
	]),
	{ name: "Spool", appearance: "light", tokens: LIGHT_TOKENS },
	t("light", "Mono", [
		"#f4f4f4",
		"#e9e9e9",
		"#ffffff",
		"#ffffff",
		"#dddddd",
		"#bbbbbb",
		"#000000",
		"#666666",
		"#000000",
		"#ffffff",
	]),
	t("light", "Catppuccin Latte", [
		"#e6e9ef",
		"#dce0e8",
		"#eff1f5",
		"#ffffff",
		"#ccd0da",
		"#bcc0cc",
		"#4c4f69",
		"#6c6f85",
		"#8839ef",
		"#ffffff",
	]),
	t("light", "Nord Light", [
		"#e5e9f0",
		"#d8dee9",
		"#eceff4",
		"#ffffff",
		"#d8dee9",
		"#b8c0d0",
		"#2e3440",
		"#4c566a",
		"#5e81ac",
		"#eceff4",
	]),
	t("light", "Gruvbox Light", [
		"#f2e5bc",
		"#ebdbb2",
		"#fbf1c7",
		"#f9f5d7",
		"#d5c4a1",
		"#bdae93",
		"#3c3836",
		"#7c6f64",
		"#d65d0e",
		"#fbf1c7",
	]),
	t("light", "Solarized Light", [
		"#eee8d5",
		"#e6dfc8",
		"#fdf6e3",
		"#fdf6e3",
		"#d9d2bd",
		"#b8b09b",
		"#002b36",
		"#657b83",
		"#268bd2",
		"#fdf6e3",
	]),
	t("light", "Rosé Pine Dawn", [
		"#f2e9e1",
		"#ebe2d8",
		"#fffaf3",
		"#fffaf3",
		"#dfdad9",
		"#cecacd",
		"#575279",
		"#797593",
		"#d7827e",
		"#fffaf3",
	]),
	t("light", "GitHub Light", [
		"#f6f8fa",
		"#eaeef2",
		"#ffffff",
		"#ffffff",
		"#d0d7de",
		"#afb8c1",
		"#1f2328",
		"#656d76",
		"#0969da",
		"#ffffff",
	]),
];
