import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { SpoolError } from "../errors";
import type { Harness } from "./harness";
import { OWN_TURN_ENV } from "./harness";

/**
 * Connecting an agent that works from the terminal (task 531): a few hooks in the harness's
 * own settings that only listen. Each one hands the event to spool's daemon in the
 * background and prints nothing, so the agent's context and speed stay as they were, and a
 * closed spool costs nothing but a refused connection nobody sees.
 *
 * The hooks run one small script in spool's own state, `hooks/hook.sh`, so the harness's
 * file names that path and nothing else, and Disconnect takes out exactly the entries that
 * name it. The script knows where this daemon listens; the daemon writes it again whenever
 * that changes. pi takes an extension file instead of a settings entry, which reads the
 * same address from `hooks/hook.json`.
 */

/** Where a harness keeps the file spool writes into, as a person would find it. */
export interface HarnessFiles {
	/** the file connecting writes or edits */
	readonly file: string;
	/** the same, with the home folder as `~`, for saying it */
	readonly said: string;
}

type Env = Readonly<Record<string, string | undefined>>;

function home(env: Env): string {
	return env.HOME !== undefined && env.HOME !== "" ? env.HOME : homedir();
}

function shown(file: string, env: Env): string {
	const at = home(env);
	return file.startsWith(`${at}/`) ? `~${file.slice(at.length)}` : file;
}

/** The file a harness's hooks live in, honouring each one's own override of its folder. */
export function harnessFiles(harness: Harness, spoolDir: string, env: Env = process.env): HarnessFiles {
	const file =
		harness === "claude"
			? join(env.CLAUDE_CONFIG_DIR || join(home(env), ".claude"), "settings.json")
			: harness === "codex"
				? join(env.CODEX_HOME || join(home(env), ".codex"), "hooks.json")
				: join(env.PI_CODING_AGENT_DIR || join(home(env), ".pi", "agent"), "extensions", piExtensionName(spoolDir));
	return { file, said: shown(file, env) };
}

/** pi's extension file: `spool.ts` for the usual install, one per state folder beside it. */
function piExtensionName(spoolDir: string): string {
	if (spoolDir === join(homedir(), ".spool")) return "spool.ts";
	return `spool-${createHash("sha256").update(spoolDir).digest("hex").slice(0, 8)}.ts`;
}

/** The events each harness tells: what it reads and writes, what it waits on, and when it is done. */
export const HOOK_EVENTS: Readonly<Record<Exclude<Harness, "pi">, readonly string[]>> = {
	claude: [
		"UserPromptSubmit",
		"PreToolUse",
		"PostToolUse",
		"PostToolUseFailure",
		"PermissionRequest",
		"Notification",
		"SubagentStart",
		"SubagentStop",
		"TaskCreated",
		"TaskCompleted",
		"Stop",
		"StopFailure",
		"SessionEnd",
	],
	codex: [
		"UserPromptSubmit",
		"PreToolUse",
		"PostToolUse",
		"PermissionRequest",
		"SubagentStart",
		"SubagentStop",
		"Stop",
		"Interrupt",
		"SessionEnd",
	],
};

/** pi's events, as its extension tells them: the same names, so one reading serves both. */
export const PI_EVENTS: readonly string[] = [
	"UserPromptSubmit",
	"PreToolUse",
	"PostToolUse",
	"Notification",
	"Stop",
	"SessionEnd",
];

export function hookScript(spoolDir: string): string {
	return join(spoolDir, "hooks", "hook.sh");
}

function hookAddress(spoolDir: string): string {
	return join(spoolDir, "hooks", "hook.json");
}

/** The command a harness's settings name: the script, then which harness is calling. */
export function hookCommand(spoolDir: string, harness: Harness): string {
	return `sh ${quote(hookScript(spoolDir))} ${harness}`;
}

function quote(path: string): string {
	return `'${path.replaceAll("'", `'\\''`)}'`;
}

/** Where the daemon takes hooks, and the secret only its own hooks carry. */
export interface HookTarget {
	readonly url: string;
	readonly token: string;
}

/**
 * The secret hooks prove themselves with, kept beside the script and made once. It is not
 * the daemon's control token, which changes with every start: a hook in a settings file
 * outlives any one daemon.
 */
export function hookToken(spoolDir: string): string {
	const file = join(spoolDir, "hooks", "token");
	try {
		const token = readFileSync(file, "utf8").trim();
		if (/^[\w-]{32,}$/.test(token)) return token;
	} catch {}
	const token = randomBytes(24).toString("base64url");
	mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
	writeAtomic(file, `${token}\n`);
	chmodSync(file, 0o600);
	return token;
}

/** The secret, if spool ever made one: a daemon only checks hooks against it, never makes it. */
export function readHookToken(spoolDir: string): string | undefined {
	try {
		const token = readFileSync(join(spoolDir, "hooks", "token"), "utf8").trim();
		return /^[\w-]{32,}$/.test(token) ? token : undefined;
	} catch {
		return undefined;
	}
}

/** Whether this machine's spool ever connected a harness, so its script is worth keeping current. */
export function hooksMade(spoolDir: string): boolean {
	return existsSync(join(spoolDir, "hooks"));
}

/**
 * The script every hook runs. It hands the event on stdin to the daemon and says nothing:
 * no output reaches the agent, and every way it can fail ends in `exit 0`.
 */
export function hookScriptText(target: HookTarget): string {
	return `#!/bin/sh
# spool: tells spool what your agent reads, writes and waits on, so the canvas can show it.
# It prints nothing, so nothing reaches the agent. Disconnect in spool, or run
# \`spool hooks remove\`, and the harness stops calling it.
[ -n "$${OWN_TURN_ENV}" ] && exit 0
command -v curl >/dev/null 2>&1 || exit 0
curl -s -m 2 -o /dev/null -X POST \\
  -H 'content-type: application/json' \\
  -H 'x-spool-hook: ${target.token}' \\
  -H "x-spool-term: \${TERM_PROGRAM:-}" \\
  -H "x-spool-app: \${__CFBundleIdentifier:-}" \\
  --data-binary @- '${target.url}/api/hook/'"$1" >/dev/null 2>&1
exit 0
`;
}

/** pi's extension: the same events, in the same words, sent the same way. */
export function piExtensionText(spoolDir: string): string {
	return `// spool: tells spool what pi reads, writes and waits on, so the canvas can show it.
// It adds nothing to pi's context and never waits on spool. Disconnect in spool, or run
// \`spool hooks remove pi\`, and this file goes.
import { readFileSync } from "node:fs";

const ADDRESS = ${JSON.stringify(hookAddress(spoolDir))};

export default function (pi: any) {
	if (process.env.${OWN_TURN_ENV}) return;
	let last: string | null = null;
	const send = (event: Record<string, unknown>, ctx: any) => {
		try {
			const { url, token } = JSON.parse(readFileSync(ADDRESS, "utf8"));
			const body = JSON.stringify({ ...event, session_id: ctx?.sessionManager?.getSessionId?.() ?? "pi", cwd: ctx?.cwd ?? process.cwd() });
			fetch(url + "/api/hook/pi", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-spool-hook": token,
					"x-spool-term": process.env.TERM_PROGRAM ?? "",
					"x-spool-app": process.env.__CFBundleIdentifier ?? "",
				},
				body,
				signal: AbortSignal.timeout(2000),
			}).catch(() => {});
		} catch {}
	};
	const text = (message: any): string | null => {
		const parts = Array.isArray(message?.content) ? message.content : [];
		const said = parts.filter((part: any) => part?.type === "text").map((part: any) => part.text).join("\\n").trim();
		return said === "" ? null : said;
	};
	pi.on("before_agent_start", (event: any, ctx: any) => {
		if (event?.messageType === "user") send({ hook_event_name: "UserPromptSubmit", prompt: event.prompt ?? "" }, ctx);
	});
	// a tool's end says only which call it was: its arguments are kept from its start
	const calls = new Map<string, unknown>();
	pi.on("tool_execution_start", (event: any, ctx: any) => {
		calls.set(event?.toolCallId, event?.args ?? {});
		send({ hook_event_name: "PreToolUse", tool_name: event?.toolName, tool_input: event?.args ?? {} }, ctx);
	});
	pi.on("tool_execution_end", (event: any, ctx: any) => {
		const args = calls.get(event?.toolCallId) ?? {};
		calls.delete(event?.toolCallId);
		send({ hook_event_name: "PostToolUse", tool_name: event?.toolName, tool_input: args, failed: event?.isError === true }, ctx);
	});
	pi.on("ui_prompt_start", (_event: any, ctx: any) => send({ hook_event_name: "Notification", notification_type: "permission_prompt" }, ctx));
	pi.on("agent_end", (event: any) => {
		const messages = Array.isArray(event?.messages) ? event.messages : [];
		for (let at = messages.length - 1; at >= 0; at -= 1)
			if (messages[at]?.role === "assistant") {
				last = text(messages[at]);
				if (last !== null) break;
			}
	});
	pi.on("agent_settled", (_event: any, ctx: any) => send({ hook_event_name: "Stop", last_assistant_message: last }, ctx));
	pi.on("session_shutdown", (_event: any, ctx: any) => send({ hook_event_name: "SessionEnd" }, ctx));
}
`;
}

/** Write the script and the address for this daemon, whether or not anything is connected yet. */
export function writeHookTarget(spoolDir: string, url: string): HookTarget {
	const target = { url, token: hookToken(spoolDir) };
	const script = hookScript(spoolDir);
	const text = hookScriptText(target);
	let was: string | null = null;
	try {
		was = readFileSync(script, "utf8");
	} catch {}
	if (was !== text) {
		mkdirSync(dirname(script), { recursive: true, mode: 0o700 });
		writeAtomic(script, text);
		chmodSync(script, 0o700);
	}
	const address = hookAddress(spoolDir);
	const json = `${JSON.stringify(target)}\n`;
	let wasAddress: string | null = null;
	try {
		wasAddress = readFileSync(address, "utf8");
	} catch {}
	if (wasAddress !== json) {
		writeAtomic(address, json);
		chmodSync(address, 0o600);
	}
	return target;
}

/* ------------------------------------------------------- settings files -- */

interface Handler {
	type?: unknown;
	command?: unknown;
	[key: string]: unknown;
}
interface Group {
	matcher?: unknown;
	hooks?: unknown;
	[key: string]: unknown;
}

/** A settings or hooks.json document, or a reason it can't be touched. */
type Parsed = { ok: true; doc: Record<string, unknown> } | { ok: false; reason: string };

function parse(text: string | null, file: string): Parsed {
	if (text === null || text.trim() === "") return { ok: true, doc: {} };
	try {
		const doc: unknown = JSON.parse(text);
		if (doc !== null && typeof doc === "object" && !Array.isArray(doc))
			return { ok: true, doc: doc as Record<string, unknown> };
	} catch {}
	return { ok: false, reason: `${file} isn't JSON spool can read, so it was left as it is` };
}

function ours(handler: unknown, command: string): boolean {
	return handler !== null && typeof handler === "object" && (handler as Handler).command === command;
}

/** The document with spool's handler on every event and nothing else changed. */
export function withHooks(
	doc: Record<string, unknown>,
	events: readonly string[],
	command: string,
): Record<string, unknown> {
	const cleared = withoutHooks(doc, command);
	const hooks = { ...((cleared.hooks as Record<string, unknown> | undefined) ?? {}) };
	for (const event of events) {
		const groups = Array.isArray(hooks[event]) ? [...(hooks[event] as unknown[])] : [];
		groups.push({ hooks: [{ type: "command", command, async: true }] });
		hooks[event] = groups;
	}
	return { ...cleared, hooks };
}

/** The document with every handler that runs `command` taken out, and groups or events it leaves empty gone too. */
export function withoutHooks(doc: Record<string, unknown>, command: string): Record<string, unknown> {
	const hooks = doc.hooks;
	if (hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) return doc;
	const next: Record<string, unknown> = {};
	for (const [event, groups] of Object.entries(hooks)) {
		if (!Array.isArray(groups)) {
			next[event] = groups;
			continue;
		}
		const kept = groups.flatMap((group: unknown) => {
			if (group === null || typeof group !== "object" || !Array.isArray((group as Group).hooks)) return [group];
			const handlers = ((group as Group).hooks as unknown[]).filter((one) => !ours(one, command));
			if (handlers.length === ((group as Group).hooks as unknown[]).length) return [group];
			return handlers.length === 0 ? [] : [{ ...(group as Group), hooks: handlers }];
		});
		if (kept.length > 0) next[event] = kept;
	}
	const { hooks: _gone, ...rest } = doc;
	return Object.keys(next).length === 0 ? rest : { ...rest, hooks: next };
}

/** Whether the document runs `command` on every one of `events`. */
export function hasHooks(doc: Record<string, unknown>, events: readonly string[], command: string): boolean {
	const hooks = doc.hooks as Record<string, unknown> | undefined;
	if (hooks === undefined || hooks === null || typeof hooks !== "object") return false;
	return events.every((event) => {
		const groups = hooks[event];
		return (
			Array.isArray(groups) &&
			groups.some(
				(group: unknown) =>
					group !== null &&
					typeof group === "object" &&
					Array.isArray((group as Group).hooks) &&
					((group as Group).hooks as unknown[]).some((one) => ours(one, command)),
			)
		);
	});
}

function read(file: string): string | null {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return null;
	}
}

/**
 * What connecting adds, as See change shows it: one line per event, each running the same
 * one command in the background. pi takes one new file instead, which tells the same events.
 */
export function hookLines(
	harness: Harness,
	spoolDir: string,
	env: Env = process.env,
): { readonly events: readonly string[]; readonly runs: string } {
	if (harness === "pi") return { events: PI_EVENTS, runs: "tells spool" };
	return { events: HOOK_EVENTS[harness], runs: `sh ${shown(hookScript(spoolDir), env)} ${harness}` };
}

export type Connection = "connected" | "not-connected";

export function connection(harness: Harness, spoolDir: string, env: Env = process.env): Connection {
	const { file } = harnessFiles(harness, spoolDir, env);
	if (harness === "pi") return existsSync(file) ? "connected" : "not-connected";
	const parsed = parse(read(file), file);
	if (!parsed.ok) return "not-connected";
	return hasHooks(parsed.doc, HOOK_EVENTS[harness], hookCommand(spoolDir, harness)) ? "connected" : "not-connected";
}

export class HookInstallError extends SpoolError {}

/** Add spool's hooks to a harness, keeping everything else in its file exactly as it was. */
export function connect(harness: Harness, spoolDir: string, url: string, env: Env = process.env): HarnessFiles {
	writeHookTarget(spoolDir, url);
	const files = harnessFiles(harness, spoolDir, env);
	mkdirSync(dirname(files.file), { recursive: true });
	if (harness === "pi") {
		writeAtomic(files.file, piExtensionText(spoolDir));
		return files;
	}
	const parsed = parse(read(files.file), files.said);
	if (!parsed.ok) throw new HookInstallError(parsed.reason);
	const next = withHooks(parsed.doc, HOOK_EVENTS[harness], hookCommand(spoolDir, harness));
	writeAtomic(files.file, `${JSON.stringify(next, null, 2)}\n`);
	return files;
}

/** Take out exactly what connecting added. */
export function disconnect(harness: Harness, spoolDir: string, env: Env = process.env): HarnessFiles {
	const files = harnessFiles(harness, spoolDir, env);
	if (harness === "pi") {
		rmSync(files.file, { force: true });
		return files;
	}
	const text = read(files.file);
	if (text === null) return files;
	const parsed = parse(text, files.said);
	if (!parsed.ok) throw new HookInstallError(parsed.reason);
	const next = withoutHooks(parsed.doc, hookCommand(spoolDir, harness));
	if (next !== parsed.doc) writeAtomic(files.file, `${JSON.stringify(next, null, 2)}\n`);
	return files;
}
