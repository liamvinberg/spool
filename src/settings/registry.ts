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
 * built on, with the values it ships with in the dark. A test holds the two in
 * step. `mark` is not here because it follows `thread` in the stylesheet, and
 * `on-thread` stays white until a theme asks otherwise.
 */
export const THEME_TOKENS = {
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
export type ThemeToken = keyof typeof THEME_TOKENS;
export const THEME_TOKEN_NAMES = Object.keys(THEME_TOKENS) as readonly ThemeToken[];

/**
 * The same tokens in the light. Authored, not inverted: the greys keep the
 * dark's warmth and the accent is the same red, since it is the mark's colour
 * before it is anything else. A moved token stands in both looks; the light is
 * what a token shows when nobody moved it.
 */
export const LIGHT_THEME_TOKENS: Record<ThemeToken, string> = {
	bg: "#f5f4f2",
	canvas: "#eae9e6",
	surface: "#fbfaf9",
	raised: "#ffffff",
	border: "#e2e0dc",
	"border-raised": "#cbc9c3",
	text: "#1a1917",
	muted: "#767370",
	thread: "#f5391a",
	"on-thread": "#ffffff",
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

const themeEntries = Object.fromEntries(
	THEME_TOKEN_NAMES.map((token) => [
		`theme.${token}`,
		{
			scope: "machine",
			group: "theme",
			shape: { kind: "colour" },
			fallback: THEME_TOKENS[token],
			label: token,
			says: THEME_SAYS[token],
		} satisfies SettingEntry<string>,
	]),
) as { readonly [Token in ThemeToken as `theme.${Token}`]: SettingEntry<string> };

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

/**
 * The theme a snapshot compiles to, as the `style` attribute of `<html>`: the
 * daemon writes it ahead of first paint so a themed chrome never flashes its
 * defaults, and the canvas keeps the same attribute current after. Inline
 * because it has to beat the stylesheet's own light-dark() pick whatever order
 * the sheets load in. Only tokens somebody moved are written; the rest stay
 * the stylesheet's.
 */
export function themeInline(entries: readonly SettingReading[]): string {
	const moved = entries.filter(
		(entry): entry is SettingReading & { value: string } =>
			entry.group === "theme" && entry.source === "file" && typeof entry.value === "string",
	);
	const token = (key: string) => key.slice("theme.".length) as ThemeToken;
	return moved.map((entry) => `${themeVariable(token(entry.key))}:${entry.value}`).join(";");
}

/** The look a snapshot names, `dark` until the read lands. */
export function appearanceOf(entries: readonly SettingReading[]): Appearance {
	const entry = entries.find((candidate) => candidate.key === "appearance");
	return entry === undefined ? "dark" : (entry.value as Appearance);
}
