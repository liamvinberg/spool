import { basename, isAbsolute, resolve } from "node:path";
import type { Harness, Terminal } from "./harness";

/**
 * One session of an agent working outside spool, folded from its hooks (task 531): what it
 * was asked, which frames it is at and doing what, what it waits on, and once done what it
 * said and changed. Everything here comes from the harness's own hook payloads and nothing
 * else; a field a harness doesn't send stays empty.
 */

export type OutsideState = "working" | "waiting" | "done";

/** One agent's hand on a frame: the session's own agent, or a subagent it started. */
export interface OutsideHand {
	/** `main`, or the subagent's own id */
	readonly agent: string;
	/** what the hand is called on the frame: the harness, or the subagent's type */
	readonly who: string;
	readonly act: "reading" | "editing";
	readonly frame: string;
}

export interface OutsideTask {
	readonly id: string;
	readonly subject: string;
	readonly done: boolean;
}

export interface OutsideSession {
	readonly id: string;
	readonly harness: Harness;
	readonly root: string;
	/** what it was asked last, its first line; stays on this machine */
	readonly name: string | null;
	readonly state: OutsideState;
	/** what it waits on you for, said after "wants to"; null for a plain wait */
	readonly wants: string | null;
	readonly hands: readonly OutsideHand[];
	readonly tasks: readonly OutsideTask[];
	/** its last message, once done */
	readonly said: string | null;
	/** the frames it wrote since it was asked, first written first */
	readonly changed: readonly string[];
	/** stopped short: interrupted, or the model's API failed */
	readonly stopped: boolean;
	readonly terminal: Terminal;
	/** tools started and not yet finished, a long command among them */
	readonly busy: number;
	readonly started: number;
	readonly at: number;
	readonly ended: number | null;
}

/** What a hook payload says, read loosely: every harness sends a little differently. */
export type Payload = Readonly<Record<string, unknown>>;

/** Which frame a file is in, by the project's own frames; null for a file outside them. */
export type FrameAt = (file: string) => string | null;

const NAME_MAX = 60;
const SAID_MAX = 1_500;
const WANTS_MAX = 48;

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim() !== "" ? value : null;
}

function cut(value: string, max: number): string {
	const one = value.replace(/\s+/g, " ").trim();
	return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}

/** Its own words, kept as markdown with their lines, cut at a line or word when too long. */
function clip(value: string, max: number): string {
	const kept = value.trim();
	if (kept.length <= max) return kept;
	const head = kept.slice(0, max);
	const at = Math.max(head.lastIndexOf("\n"), head.lastIndexOf(" "));
	return `${head.slice(0, at > max / 2 ? at : max).trimEnd()}…`;
}

function firstLine(value: string): string {
	return value.trim().split("\n")[0] ?? "";
}

function record(value: unknown): Payload {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Payload) : {};
}

/** The files a tool call names, absolute, and whether it writes them. */
export function filesOf(
	harness: Harness,
	tool: string,
	input: Payload,
	cwd: string,
): { files: readonly string[]; writes: boolean } | null {
	const at = (path: string) => (isAbsolute(path) ? path : resolve(cwd, path));
	const name = tool.toLowerCase();
	if (harness === "codex" && name === "apply_patch") {
		const patch = text(input.command) ?? text(input.patch) ?? "";
		const files = [...patch.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)].map((match) =>
			at((match[1] ?? "").trim()),
		);
		return { files, writes: true };
	}
	const command = text(input.command);
	if (command !== null && ["bash", "shell", "exec_command", "local_shell"].includes(name)) return framesIn(command);
	const path = text(input.file_path) ?? text(input.notebook_path) ?? text(input.path);
	if (path === null) return null;
	if (["read", "view", "cat", "ls", "glob", "grep", "find"].includes(name))
		return { files: [at(path)], writes: false };
	if (["write", "edit", "multiedit", "notebookedit", "create"].includes(name))
		return { files: [at(path)], writes: true };
	return null;
}

/** Tools that stop to put something to the person, and what spool says it wants then. */
const ASKING_TOOLS: Readonly<Record<string, string>> = {
	AskUserQuestion: "ask you something",
	ExitPlanMode: "show you a plan",
	request_user_input: "ask you something",
};

/** A whole to-do list as a harness writes it at once: Claude's TodoWrite, Codex's update_plan. */
function listOf(tool: string, input: Payload): OutsideTask[] | null {
	const items = tool === "TodoWrite" ? input.todos : tool === "update_plan" ? input.plan : undefined;
	if (!Array.isArray(items)) return null;
	return items.flatMap((item, at) => {
		const one = record(item);
		const subject = text(one.content) ?? text(one.step);
		return subject === null
			? []
			: [{ id: `list-${at}`, subject: cut(subject, 80), done: one.status === "completed" }];
	});
}

/**
 * The frames a shell command names, as `frames/<name>/…` paths the project's frames
 * folder resolves (agents often write a frame with a heredoc), and whether it seems to
 * write them. A guess from the command's words: a hand on a frame, never a file read.
 */
function framesIn(command: string): { files: readonly string[]; writes: boolean } | null {
	const files = [...command.matchAll(/(?:^|[\s'"=(:])(?:[\w.@~/-]*\/)?(frames\/[\w.@-]+(?:\/[\w.@-]+)*)/g)].map(
		(match) => match[1] ?? "",
	);
	if (files.length === 0) return null;
	const plain = command.replace(/\d?>&\d/g, "").replace(/[\d&]?>\s*\/dev\/null/g, "");
	return { files, writes: /(?:>|\btee\b|\bsed\s+-i|\bcp\b|\bmv\b|\btouch\b|\.write|open\([^)]*['"][wa])/.test(plain) };
}

/** What a tool asks permission for, as the line says it after "wants to". */
export function wantsOf(tool: string, input: Payload): string {
	const asks = ASKING_TOOLS[tool];
	if (asks !== undefined) return asks;
	const name = tool.toLowerCase();
	const command = text(input.command);
	if ((name === "bash" || name === "shell" || name === "exec_command") && command !== null)
		return `run ${cut(firstLine(command), WANTS_MAX - 4)}`;
	if (name === "webfetch") {
		const url = text(input.url);
		try {
			if (url !== null) return `fetch ${new URL(url).hostname}`;
		} catch {}
		return "fetch a page";
	}
	if (name === "websearch") return "search the web";
	const path = text(input.file_path) ?? text(input.path);
	if (name === "write") return path === null ? "write a file" : `write ${basename(path)}`;
	if (name === "edit" || name === "multiedit" || name === "apply_patch")
		return path === null ? "edit files" : `edit ${basename(path)}`;
	const mcp = /^mcp__.+?__(.+)$/.exec(tool);
	return `use ${cut(mcp?.[1] ?? tool, WANTS_MAX - 4)}`;
}

/** A session from its first hook, before the hook is folded in. */
export function startSession(
	id: string,
	harness: Harness,
	root: string,
	terminal: Terminal,
	at: number,
): OutsideSession {
	return {
		id,
		harness,
		root,
		name: null,
		state: "working",
		wants: null,
		hands: [],
		tasks: [],
		said: null,
		changed: [],
		stopped: false,
		terminal,
		busy: 0,
		started: at,
		at,
		ended: null,
	};
}

function withHand(hands: readonly OutsideHand[], agent: string, hand: OutsideHand | null): readonly OutsideHand[] {
	const others = hands.filter((one) => one.agent !== agent);
	return hand === null ? others : [...others, hand];
}

/**
 * The session after one hook. `null` means the session is over and goes: the person closed
 * it, cleared it or started another.
 */
export function foldHook(
	session: OutsideSession,
	event: string,
	payload: Payload,
	at: number,
	frameAt: FrameAt,
): OutsideSession | null {
	const cwd = text(payload.cwd) ?? session.root;
	const agentId = text(payload.agent_id);
	const agent = agentId ?? "main";
	const who = agentId === null ? session.harness : cut((text(payload.agent_type) ?? "agent").toLowerCase(), 24);
	const base = { ...session, at };
	const tool = text(payload.tool_name) ?? "";
	const input = record(payload.tool_input);
	// any word from it but a wait means it is past the wait
	const going = (next: OutsideSession): OutsideSession =>
		next.state === "waiting" ? { ...next, state: "working", wants: null } : next;

	switch (event) {
		case "UserPromptSubmit": {
			const prompt = text(payload.prompt);
			// what the harness feeds in itself, as a background agent's <task-notification>, goes on the turn it belongs to
			if (prompt !== null && /^<[a-z][\w-]*>/i.test(prompt.trimStart()))
				return { ...going(base), state: "working", ended: null, stopped: false };
			const allDone = session.tasks.every((task) => task.done);
			return {
				...base,
				name: prompt === null ? session.name : cut(firstLine(prompt), NAME_MAX),
				state: "working",
				wants: null,
				hands: [],
				tasks: allDone ? [] : session.tasks,
				said: null,
				changed: [],
				stopped: false,
				busy: 0,
				started: at,
				ended: null,
			};
		}
		case "PreToolUse": {
			// a question or a plan put to you holds it until you answer, whatever its permissions
			const asks = ASKING_TOOLS[tool];
			if (asks !== undefined) return { ...base, state: "waiting", wants: asks, ended: null };
			const listed = listOf(tool, input);
			const next = {
				...going(base),
				state: "working" as const,
				ended: null,
				busy: session.busy + 1,
				...(listed === null ? {} : { tasks: listed }),
			};
			const touched = filesOf(session.harness, tool, input, cwd);
			if (touched === null) return next;
			const frame = touched.files.map(frameAt).find((one): one is string => one !== null) ?? null;
			return {
				...next,
				hands: withHand(
					session.hands,
					agent,
					frame === null ? null : { agent, who, act: touched.writes ? "editing" : "reading", frame },
				),
			};
		}
		case "PostToolUse":
		case "PostToolUseFailure": {
			const next = { ...going(base), busy: Math.max(0, session.busy - 1) };
			const touched = filesOf(session.harness, tool, input, cwd);
			if (touched === null || !touched.writes || event === "PostToolUseFailure" || payload.failed === true)
				return next;
			const changed = [...session.changed];
			for (const file of touched.files) {
				const frame = frameAt(file);
				if (frame !== null && !changed.includes(frame)) changed.push(frame);
			}
			return { ...next, changed };
		}
		case "PermissionRequest":
			return { ...base, state: "waiting", wants: tool === "" ? null : wantsOf(tool, input), ended: null };
		case "Notification": {
			const kind = text(payload.notification_type);
			if (kind === "permission_prompt")
				return session.state === "waiting" ? base : { ...base, state: "waiting", wants: null, ended: null };
			if (kind === "elicitation_dialog")
				return { ...base, state: "waiting", wants: "ask you something", ended: null };
			// it has sat waiting for the next prompt a minute: whatever it was doing, it stopped
			if (kind === "idle_prompt" && session.state !== "done")
				return { ...base, state: "done", wants: null, hands: [], busy: 0, stopped: true, ended: at };
			return base;
		}
		case "SubagentStart":
			return agentId === null ? base : going(base);
		case "SubagentStop":
			return agentId === null ? base : { ...base, hands: withHand(session.hands, agentId, null) };
		case "TaskCreated": {
			const id = text(payload.task_id);
			const subject = text(payload.task_subject);
			if (id === null || subject === null) return base;
			const tasks = session.tasks.filter((task) => task.id !== id);
			return { ...base, tasks: [...tasks, { id, subject: cut(subject, 80), done: false }] };
		}
		case "TaskCompleted": {
			const id = text(payload.task_id);
			const subject = text(payload.task_subject);
			const known = session.tasks.some((task) => task.id === id);
			const tasks = known
				? session.tasks.map((task) => (task.id === id ? { ...task, done: true } : task))
				: id === null || subject === null
					? session.tasks
					: [...session.tasks, { id, subject: cut(subject, 80), done: true }];
			return { ...base, tasks };
		}
		case "Stop":
		case "StopFailure":
		case "Interrupt": {
			const said = text(payload.last_assistant_message);
			return {
				...base,
				state: "done",
				wants: null,
				hands: [],
				busy: 0,
				said: said === null ? null : clip(said, SAID_MAX),
				stopped: event !== "Stop",
				ended: at,
			};
		}
		case "SessionEnd":
			// what it changed stays on the canvas until it is seen, though the agent has quit
			return session.changed.length === 0
				? null
				: {
						...base,
						state: "done",
						wants: null,
						hands: [],
						busy: 0,
						stopped: session.state !== "done",
						ended: session.ended ?? at,
					};
		default:
			return base;
	}
}

/** How long a session that has gone silent keeps its place: past it, it was stopped where no hook could say so. */
export const SILENT_MS = 180_000;
/** A command can run long without a word; one still running keeps the session this long. */
export const BUSY_SILENT_MS = 1_200_000;
/** How long a finished session stays told, as the agent trail tells a finished turn. */
export const DONE_MS = 600_000;

/** Whether a session is still worth showing at `now`. */
export function sessionLive(session: OutsideSession, now: number): boolean {
	if (session.state === "done") return session.changed.length > 0 && now - (session.ended ?? session.at) < DONE_MS;
	return now - session.at < (session.busy > 0 ? BUSY_SILENT_MS : SILENT_MS);
}
