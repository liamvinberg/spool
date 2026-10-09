import type { AgentPermissions } from "../settings/registry";
import { skillText } from "../skill";
import type { CodexRpc } from "./agent-codex-rpc";
import { CODEX_DESIGNER_DESCRIPTION, CODEX_DESIGNER_FRAMING, DESIGNER_NAME } from "./agent-designer";
import type { AgentSpawn } from "./agent-spawn";

/**
 * What spool spawns for Codex, and what it says to it first (#362).
 *
 * The person's own `codex`, resolved off `PATH`, run as `codex app-server` on stdio. Spool
 * never sets `CODEX_HOME` (that is where the person's login lives), writes nothing into
 * `~/.codex`, and passes what it overrides as process-level `-c` flags rather than a
 * thread's `config` (a per-thread `config` was reported to hang `turn/start` on 0.154).
 */

export const CODEX_COMMAND = "codex";

/**
 * The oldest Codex spool drives. Codex says its version in the handshake (`userAgent`), and
 * a turn on anything older ends there, saying so. It is not part of "installed": that is a
 * look along `PATH`, as Claude's is, because finding out a version means running a binary
 * spool has not been asked to run.
 *
 * 0.151.0 is the first release whose `thread/resume` takes `excludeTurns` without the
 * experimental API; 0.150.0 refuses it ("requires experimentalApi capability"), and a
 * refused resume would start every turn on a fresh thread. Every other method and field
 * spool sends is in 0.150.0 already, and 0.151.0 ran a turn, a resume and an approval
 * through this engine.
 */
export const CODEX_MIN_VERSION = "0.151.0";

/**
 * The three modes, in Codex's own approval policy and sandbox (confirmed against the
 * recorded `codex-ask`, `codex-turn` and `codex-bypass` sessions: `thread/start` echoes
 * each pair back as what the thread runs under).
 */
export const CODEX_MODES: Readonly<
	Record<AgentPermissions, { readonly approvalPolicy: string; readonly sandbox: string }>
> = {
	ask: { approvalPolicy: "untrusted", sandbox: "workspace-write" },
	edits: { approvalPolicy: "on-request", sandbox: "workspace-write" },
	bypass: { approvalPolicy: "never", sandbox: "danger-full-access" },
};

/**
 * Spool's own read-only verbs: they read the canvas or the daemon and change nothing a
 * person would want to approve, so they never ask in any mode.
 */
export const SPOOL_READ_VERBS: readonly string[] = [
	"skill",
	"selection",
	"flows",
	"shot",
	"logs",
	"url",
	"check",
	"status",
];

const FRAMING = `You are the agent inside Spool, a live prototyping canvas. The human is looking at
frames on that canvas and talking to you from a rail beside them.

The canvas is design/. Its contract is below; \`spool skill <topic>\` gets you depth
on any part of it.

What the human has selected arrives in their message inside a <selection> block.
That is what "this" and "that" mean.

Writing under design/ and Spool's own read-only commands (\`spool skill\`, \`spool shot\`,
\`spool logs\` and the like) never ask. Write frame files with your file-editing tool
rather than the shell, and run each spool command on its own rather than chained with
others, so neither needs an approval. Anything else may ask the human first: say what
you are about to do outside design/ before you do it.

${CODEX_DESIGNER_FRAMING}`;

const BYPASS_FRAMING =
	"Approvals are off on this machine, by the developer's own setting: nothing you do asks first, so say what you are about to do outside design/ before you do it.";

export function codexFraming(): string {
	return `${FRAMING}\n\n---\n\n${skillText()}`;
}

/**
 * A turn's developer instructions: the person's own from their Codex config, then spool's
 * framing, so spool adds to theirs rather than replacing them.
 *
 * Codex takes one `developer_instructions`, and whatever sets it last wins: a `-c` flag
 * replaces the one in `config.toml`, and `thread/start`'s `developerInstructions` replaces
 * both. So the turn asks Codex for the person's own (`config/read`) and hands both back on
 * `thread/start` or `thread/resume`, a typed field of each rather than a per-thread `config`.
 * Codex's own base instructions and the project's AGENTS.md are separate and untouched.
 */
export function codexInstructions(own: string | undefined, permissions: AgentPermissions): string {
	const framing = permissions === "bypass" ? `${BYPASS_FRAMING}\n\n${codexFraming()}` : codexFraming();
	return own === undefined || own.trim() === "" ? framing : `${own}\n\n${framing}`;
}

/** a TOML basic string: JSON's escapes are a subset TOML reads the same way */
function toml(value: string): string {
	return JSON.stringify(value);
}

/**
 * The spawn for one connection.
 *
 * `network_access` is the one change to Codex's sandbox: `workspace-write` blocks loopback
 * too, and every spool verb talks to the daemon over localhost, so without it `spool shot`
 * fails under Ask first and Auto-edit. Codex has no loopback-only switch for it: its
 * per-domain allowlist is a proxy under `permissions.<profile>.network`, which a
 * `thread/start` that names a `sandbox` cannot use, and which a client that does not
 * read `HTTP_PROXY` (Node's `fetch`) goes around into the sandbox's block. `design/`
 * sits inside the project root, which is the sandbox's own writable root, so it needs no
 * extra root. Spool's framing is not on the spawn: it rides on the thread, after the
 * person's own developer instructions (`codexInstructions`).
 *
 * The project's trust is the person's own: spool sets none. Codex writes `[projects."<root>"]
 * trust_level = "trusted"` into `~/.codex/config.toml` when a `thread/start` names a `cwd`
 * in a project with no trust entry under a sandbox that can write there, so a turn's
 * `thread/start` names none (`startCodexTurn`) and Codex takes the process's own directory,
 * the project root, instead.
 *
 * A turn's spawn also carries spool's designer (#367) as an agent role: its config layer
 * is the file in spool's state, and its description is the hint the spawn tool shows.
 * Both ride as `-c` flags, so Codex's own config never learns of it.
 */
export function planCodexSpawn(
	root: string,
	env: Readonly<Record<string, string | undefined>>,
	turn?: { readonly designer?: string },
): AgentSpawn {
	return {
		command: CODEX_COMMAND,
		args: [
			"app-server",
			"-c",
			"sandbox_workspace_write.network_access=true",
			...(turn?.designer === undefined
				? []
				: [
						"-c",
						`agents.${DESIGNER_NAME}.config_file=${toml(turn.designer)}`,
						"-c",
						`agents.${DESIGNER_NAME}.description=${toml(CODEX_DESIGNER_DESCRIPTION)}`,
					]),
		],
		cwd: root,
		env: { ...env },
	};
}

/** Notifications nothing in spool reads, left unsent rather than parsed and dropped. */
const QUIET = [
	"mcpServer/startupStatus/updated",
	"remoteControl/status/changed",
	"turn/diff/updated",
	"item/reasoning/summaryTextDelta",
	"item/reasoning/summaryPartAdded",
	"item/reasoning/textDelta",
	"item/commandExecution/outputDelta",
	"item/fileChange/outputDelta",
];

/** `initialize`, then `initialized`: what every connection says before anything else. */
export async function codexHandshake(rpc: CodexRpc, version: string): Promise<{ version: string | null }> {
	const answer = (await rpc.request("initialize", {
		clientInfo: { name: "spool", title: "Spool", version },
		capabilities: { experimentalApi: false, requestAttestation: false, optOutNotificationMethods: QUIET },
	})) as { userAgent?: unknown } | null;
	rpc.notify("initialized");
	return { version: typeof answer?.userAgent === "string" ? versionIn(answer.userAgent) : null };
}

/** `0.161.0` out of `codex-cli 0.161.0` or `spool/0.161.0 (Ubuntu …)` */
export function versionIn(text: string): string | null {
	return /(\d+)\.(\d+)\.(\d+)/.exec(text)?.[0] ?? null;
}

/** whether `version` is at least `floor`, both plain `major.minor.patch` */
export function versionAtLeast(version: string, floor: string): boolean {
	const one = version.split(".").map(Number);
	const two = floor.split(".").map(Number);
	for (let index = 0; index < 3; index += 1) {
		const a = one[index] ?? 0;
		const b = two[index] ?? 0;
		if (a !== b) return a > b;
	}
	return true;
}
