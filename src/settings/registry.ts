/**
 * Every setting spool has, declared once (#281).
 *
 * The daemon validates against this list, the API describes it, the sheet will
 * draw it and search will index it, so a setting exists here or not at all. An
 * entry says where its value lives (`scope`), what shape it takes (`kind`), what
 * it is when nobody set it, and the one line a person reads beside it. A new
 * setting is one entry and one consumer; nothing else learns its name.
 *
 * One scope per setting, so nothing is ever set in two places and there is no
 * precedence to explain. The exception predates the registry and stays outside
 * it: a hand-written `history: false` in config.json is a refusal that beats
 * the project flag, read by `resolveServeConfig` and nothing here.
 */

export type SettingScope =
	/** design/canvas.json: a fact about the repo every clone shares */
	| "project"
	/** the project's entry in registry.json: this machine's stance on this project */
	| "local"
	/** config.json: this install */
	| "machine";

export type SettingGroup = "general" | "agent" | "appearance" | "theme";

export type SettingKind =
	| { readonly kind: "boolean" }
	| { readonly kind: "choice"; readonly choices: readonly string[] }
	/** a six-digit hex colour, lowercase, `#` first */
	| { readonly kind: "colour" };

export interface SettingEntry<Value extends SettingPrimitive = SettingPrimitive> {
	readonly scope: SettingScope;
	readonly group: SettingGroup;
	readonly shape: SettingKind;
	readonly fallback: Value;
	/** what the row is called, a sentence fragment in sentence case */
	readonly label: string;
	/** the one line under the row */
	readonly says: string;
}

export type SettingPrimitive = boolean | string;

/**
 * How a spawned agent is fenced (#121, #281). `ask` is the fence as built:
 * the allow rules make design/ quiet and everything else asks. `edits` accepts
 * file edits and still asks for the rest. `bypass` hands the harness its own
 * bypass mode, at which point the allow rules and the sandbox buy nothing, which
 * is why this is a local setting: trust never travels in the repo.
 */
export const AGENT_PERMISSIONS = ["ask", "edits", "bypass"] as const;
export type AgentPermissions = (typeof AGENT_PERMISSIONS)[number];

/**
 * Which of the chrome's two looks is on. `system` follows the OS, live. The
 * look is one `color-scheme` on `:root`: every token in `ui.css` is declared
 * as `light-dark(light, dark)`, so the stylesheet picks the value and nothing
 * is swapped by hand.
 */
export const APPEARANCES = ["dark", "light", "system"] as const;
export type Appearance = (typeof APPEARANCES)[number];

/**
 * The interface's own colours: the tokens in `src/ui/ui.css` the chrome is
 * built on, with the values it ships with, per look. The light is authored,
 * not inverted: white panels on a grey canvas with edges that show, since a
 * light chrome has no tonal depth to lean on. A test holds the stylesheet's
 * light-dark() pairs and these two maps in step. `mark` is not here because it
 * follows `thread` in the stylesheet.
 */
export const THEME_LOOKS = ["dark", "light"] as const;
export type ThemeLook = (typeof THEME_LOOKS)[number];

export const DARK_TOKENS = {
	bg: "#0e0e0e",
	canvas: "#161616",
	surface: "#1c1c1c",
	raised: "#282828",
	border: "#262626",
	"border-raised": "#363636",
	text: "#f0efed",
	muted: "#8e8c88",
	thread: "#f5391a",
	"on-thread": "#ffffff",
} as const;
export type ThemeToken = keyof typeof DARK_TOKENS;
export const THEME_TOKEN_NAMES = Object.keys(DARK_TOKENS) as readonly ThemeToken[];

export const LIGHT_TOKENS: Record<ThemeToken, string> = {
	bg: "#f0efec",
	canvas: "#e6e5e1",
	surface: "#ffffff",
	raised: "#ffffff",
	border: "#dcdad5",
	"border-raised": "#c2c0ba",
	text: "#1a1917",
	muted: "#6f6c68",
	thread: "#f5391a",
	"on-thread": "#ffffff",
};

export const THEME_DEFAULTS: Record<ThemeLook, Record<ThemeToken, string>> = {
	dark: DARK_TOKENS,
	light: LIGHT_TOKENS,
};

const THEME_SAYS: Record<ThemeToken, string> = {
	bg: "Behind everything.",
	canvas: "The field the frames sit on.",
	surface: "Rails, menus, sheets.",
	raised: "Menus and toasts.",
	border: "Hairlines.",
	"border-raised": "An edge meant to be seen.",
	text: "Words at full ink.",
	muted: "Words that stand back.",
	thread: "The accent, and every thread on the canvas.",
	"on-thread": "Ink on the accent.",
};

/** `theme.dark.bg`: one entry per token per look, so a preset for one look leaves the other alone. */
export type ThemeKey = `theme.${ThemeLook}.${ThemeToken}`;
export const themeKey = (look: ThemeLook, token: ThemeToken): ThemeKey => `theme.${look}.${token}`;

/** The look and token a theme key names, or nothing for any other key. */
export function parseThemeKey(key: string): { look: ThemeLook; token: ThemeToken } | undefined {
	const [head, look, token] = key.split(".");
	if (head !== "theme" || look === undefined || token === undefined) return undefined;
	if (!THEME_LOOKS.includes(look as ThemeLook) || !Object.hasOwn(DARK_TOKENS, token)) return undefined;
	return { look: look as ThemeLook, token: token as ThemeToken };
}

const themeEntries = Object.fromEntries(
	THEME_LOOKS.flatMap((look) =>
		THEME_TOKEN_NAMES.map((token) => [
			themeKey(look, token),
			{
				scope: "machine",
				group: "theme",
				shape: { kind: "colour" },
				fallback: THEME_DEFAULTS[look][token],
				label: token,
				says: THEME_SAYS[token],
			} satisfies SettingEntry<string>,
		]),
	),
) as { readonly [Key in ThemeKey]: SettingEntry<string> };

export const SETTINGS = {
	history: {
		scope: "project",
		group: "general",
		shape: { kind: "boolean" },
		fallback: false,
		label: "History",
		says: "spool commits design/ for you once the canvas has been quiet for 45 seconds. Off, your agents commit their own work.",
	},
	updateCheck: {
		scope: "machine",
		group: "general",
		shape: { kind: "boolean" },
		fallback: true,
		label: "Check for updates",
		says: "Once a day, and a line in the canvas when there is one.",
	},
	"agent.permissions": {
		scope: "local",
		group: "agent",
		shape: { kind: "choice", choices: AGENT_PERMISSIONS },
		fallback: "ask",
		label: "Agent permissions",
		says: "What the agent may do here without asking. Kept on this machine, never in the repo.",
	},
	appearance: {
		scope: "machine",
		group: "appearance",
		shape: { kind: "choice", choices: APPEARANCES },
		fallback: "dark",
		label: "Appearance",
		says: "Dark, light, or whichever the system is set to.",
	},
	...themeEntries,
} as const satisfies Record<string, SettingEntry>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<Key extends SettingKey> = (typeof SETTINGS)[Key]["fallback"] extends boolean
	? boolean
	: Key extends "agent.permissions"
		? AgentPermissions
		: Key extends "appearance"
			? Appearance
			: string;

export const SETTING_KEYS = Object.keys(SETTINGS) as readonly SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
	return Object.hasOwn(SETTINGS, key);
}

const COLOUR = /^#[0-9a-f]{6}$/;

/** One value against its entry's shape: what a store may hold and the API may accept. */
export function parseSetting<Key extends SettingKey>(
	key: Key,
	raw: unknown,
): { readonly ok: true; readonly value: SettingValue<Key> } | { readonly ok: false; readonly reason: string } {
	const shape: SettingKind = SETTINGS[key].shape;
	switch (shape.kind) {
		case "boolean":
			if (typeof raw === "boolean") return { ok: true, value: raw as SettingValue<Key> };
			return { ok: false, reason: `"${key}" must be true or false` };
		case "choice":
			if (typeof raw === "string" && shape.choices.includes(raw))
				return { ok: true, value: raw as SettingValue<Key> };
			return { ok: false, reason: `"${key}" must be one of ${shape.choices.join(", ")}` };
		case "colour": {
			const colour = typeof raw === "string" ? raw.trim().toLowerCase() : undefined;
			if (colour !== undefined && COLOUR.test(colour)) return { ok: true, value: colour as SettingValue<Key> };
			return { ok: false, reason: `"${key}" must be a six-digit hex colour like #f5391a` };
		}
	}
}

/** Where a value came from, as the API tells it. */
export type SettingSource = "default" | "file";

export interface SettingReading<Key extends SettingKey = SettingKey> {
	readonly key: Key;
	readonly value: SettingValue<Key>;
	readonly fallback: SettingValue<Key>;
	readonly source: SettingSource;
	readonly scope: SettingScope;
	readonly group: SettingGroup;
	readonly shape: SettingKind;
	readonly label: string;
	readonly says: string;
}

/** Every setting, read for one project or for none: what the API returns and the canvas holds. */
export interface SettingsSnapshot {
	readonly project: string | null;
	readonly entries: readonly SettingReading[];
}

/** The custom property a theme token lands on, the one the stylesheet already declares. */
export function themeVariable(token: ThemeToken): string {
	return `--color-${token}`;
}

/** Every token's value for one look: the file's where somebody moved it, the stylesheet's otherwise. */
export function themeTokens(entries: readonly SettingReading[], look: ThemeLook): Record<ThemeToken, string> {
	const tokens = { ...THEME_DEFAULTS[look] };
	for (const entry of entries) {
		const named = parseThemeKey(entry.key);
		if (named === undefined || named.look !== look || typeof entry.value !== "string") continue;
		tokens[named.token] = entry.value;
	}
	return tokens;
}

/**
 * The theme a snapshot compiles to, as the `style` attribute of `<html>`: the
 * daemon writes it ahead of first paint so a themed chrome never flashes its
 * defaults, and the canvas keeps the same attribute current after. Inline
 * because it has to beat the stylesheet's own light-dark() pick whatever order
 * the sheets load in, and a light-dark() pair itself so `color-scheme` still
 * chooses the look. Only tokens somebody moved in either look are written; the
 * rest stay the stylesheet's.
 */
export function themeInline(entries: readonly SettingReading[]): string {
	const moved = new Set<ThemeToken>();
	for (const entry of entries) {
		const named = parseThemeKey(entry.key);
		if (named !== undefined && entry.source === "file") moved.add(named.token);
	}
	if (moved.size === 0) return "";
	const dark = themeTokens(entries, "dark");
	const light = themeTokens(entries, "light");
	return THEME_TOKEN_NAMES.filter((token) => moved.has(token))
		.map((token) => `${themeVariable(token)}:light-dark(${light[token]},${dark[token]})`)
		.join(";");
}

/** The look a snapshot names, `dark` until the read lands. */
export function appearanceOf(entries: readonly SettingReading[]): Appearance {
	const entry = entries.find((candidate) => candidate.key === "appearance");
	return entry === undefined ? "dark" : (entry.value as Appearance);
}
