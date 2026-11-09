/**
 * An agent working in this project from outside spool (task 531): Claude Code, Codex or pi
 * run in someone's own terminal rather than in the Agent pane. Spool hears of one two ways:
 * its `spool` calls carry the harness's own mark in their environment, and once connected
 * its hooks tell the daemon what it reads, writes and waits on.
 */

export const HARNESSES = ["claude", "codex", "pi"] as const;
export type Harness = (typeof HARNESSES)[number];

export function isHarness(value: unknown): value is Harness {
	return typeof value === "string" && (HARNESSES as readonly string[]).includes(value);
}

/**
 * Set on every agent spool spawns itself. Its `spool` calls and its hooks are spool's own
 * turn, which the Agent pane already draws, so neither counts as an agent outside spool.
 */
export const OWN_TURN_ENV = "SPOOL_TURN";

/**
 * The harness a process runs under, from the marks each one sets on the shells its agent
 * runs: Claude Code's `CLAUDECODE=1`, Codex's thread id, pi's `PI_CODING_AGENT=true`.
 * Nothing for a person's own shell, and nothing for spool's own agents.
 */
export function harnessOf(env: Readonly<Record<string, string | undefined>>): Harness | null {
	if (present(env[OWN_TURN_ENV])) return null;
	if (env.CLAUDECODE === "1") return "claude";
	if (present(env.CODEX_THREAD_ID)) return "codex";
	if (env.PI_CODING_AGENT === "true") return "pi";
	return null;
}

function present(value: string | undefined): boolean {
	return value !== undefined && value !== "";
}

/** The terminal app a hook came from, named as a person knows it, from `TERM_PROGRAM`. */
const TERMINALS: Readonly<Record<string, string>> = {
	ghostty: "Ghostty",
	"iTerm.app": "iTerm",
	Apple_Terminal: "Terminal",
	WezTerm: "WezTerm",
	WarpTerminal: "Warp",
	vscode: "VS Code",
	kitty: "kitty",
	alacritty: "Alacritty",
	Hyper: "Hyper",
	zed: "Zed",
};

/** The same, from the app's bundle id where `TERM_PROGRAM` says only tmux. */
const BUNDLES: Readonly<Record<string, string>> = {
	"com.mitchellh.ghostty": "Ghostty",
	"com.googlecode.iterm2": "iTerm",
	"com.apple.Terminal": "Terminal",
	"com.github.wez.wezterm": "WezTerm",
	"dev.warp.Warp-Stable": "Warp",
	"com.microsoft.VSCode": "VS Code",
	"com.todesktop.230313mzl4w4u92": "Cursor",
	"net.kovidgoyal.kitty": "kitty",
	"org.alacritty": "Alacritty",
	"dev.zed.Zed": "Zed",
};

/** Where the agent's terminal is: the app's name, and the bundle id that brings it forward on a Mac. */
export interface Terminal {
	readonly name: string | null;
	readonly bundle: string | null;
}

export function terminalOf(program: string | undefined, bundle: string | undefined): Terminal {
	const id = bundle !== undefined && /^[\w.-]{3,120}$/.test(bundle) ? bundle : null;
	const name = (id === null ? undefined : BUNDLES[id]) ?? (program === undefined ? undefined : TERMINALS[program]);
	return { name: name ?? null, bundle: id };
}
