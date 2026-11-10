import { homedir } from "node:os";
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
	/**
	 * it wrote to this project's design this turn, a frame's files or the shared folder's, or a
	 * designer of its worked: only then is it drawn, so an agent reading, or asked about code,
	 * stays off the canvas
	 */
	readonly drawn: boolean;
	readonly terminal: Terminal;
	/** tools started and not yet finished, a long command among them */
	readonly busy: number;
	readonly started: number;
	readonly at: number;
	readonly ended: number | null;
}

/** What a hook payload says, read loosely: every harness sends a little differently. */
export type Payload = Readonly<Record<string, unknown>>;

/**
 * Where a file is in the project's design, by its own folders: in a frame, or under the design
 * folder's `shared/`; null for a file outside both.
 */
export type DesignAt = (file: string) => { readonly frame: string } | "shared" | null;

/**
 * What a subagent that designs is called, as the loom skill names it and agent-hub's designer
 * workers follow: its first word draws the session, before it has written anything.
 */
export const DESIGNER = "designer";

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

/** The files a tool call reads and writes, absolute. */
export interface ToolFiles {
	readonly read: readonly string[];
	readonly written: readonly string[];
}

/** The files a tool call names, absolute, and which of them it writes. */
export function filesOf(harness: Harness, tool: string, input: Payload, cwd: string): ToolFiles | null {
	const at = (path: string) => (isAbsolute(path) ? path : resolve(cwd, path));
	const name = tool.toLowerCase();
	if (harness === "codex" && name === "apply_patch") {
		const patch = text(input.command) ?? text(input.patch) ?? "";
		const files = [...patch.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)].map((match) =>
			at((match[1] ?? "").trim()),
		);
		return { read: [], written: files };
	}
	const command = text(input.command);
	if (command !== null && ["bash", "shell", "exec_command", "local_shell"].includes(name))
		return shellFiles(command, cwd);
	const path = text(input.file_path) ?? text(input.notebook_path) ?? text(input.path);
	if (path === null) return null;
	if (["read", "view", "cat", "ls", "glob", "grep", "find"].includes(name)) return { read: [at(path)], written: [] };
	if (["write", "edit", "multiedit", "notebookedit", "create"].includes(name))
		return { read: [], written: [at(path)] };
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

/** Commands that write every file they name, and those that write only the last: a copy's target. */
const WRITES_ALL = new Set(["mv", "rm", "rmdir", "touch", "mkdir", "tee", "truncate", "unlink", "ln", "patch"]);
const WRITES_LAST = new Set(["cp", "rsync", "install"]);
/** git's verbs that change the files they name */
const GIT_WRITES = new Set(["rm", "mv", "restore", "checkout"]);
/** Words that run the command after them: `sudo cp …` copies. */
const RUNNERS = new Set(["sudo", "env", "command", "exec", "time", "nice", "xargs"]);
/** Code that writes a file itself, in a heredoc or a quoted script: Python's open(…, "w"), Node's writeFileSync. */
const SCRIPT_WRITES = /\bopen\([^)]*,\s*['"][wax]|\bwrite(?:_text|_bytes|File|FileSync)?\(|\bappendFileSync\(/;
/** A shell command's words, quotes, redirects and the marks between commands. */
const TOKEN = /'[^']*'?|"(?:[^"\\]|\\.)*"?|\d*>&-?\d*|&?>>?|\d+>>?|&&|\|\||[;&|\n()]|[<>]+|(?:[^\s'";&|()<>\\]|\\.)+/g;
/** A path inside a script's text, with at least one slash */
const PATH_IN = /(?:^|[\s'"`=(:,[{])((?:~|\.{1,2})?\/?[\w.@+-]+(?:\/[\w.@+*-]+)+\/?)/g;

/** A command's shell lines apart from its heredocs' bodies, which are what the scripts it runs say. */
function heredocs(command: string): { shell: string; bodies: string[] } {
	const shell: string[] = [];
	const bodies: string[] = [];
	const ends: string[] = [];
	let body: string[] = [];
	for (const line of command.split("\n")) {
		if (ends.length > 0) {
			if (line.trim() !== ends[0]) body.push(line);
			else {
				ends.shift();
				bodies.push(body.join("\n"));
				body = [];
			}
			continue;
		}
		shell.push(line);
		for (const match of line.matchAll(/(?<!<)<<-?\s*(['"]?)([\w.-]+)\1/g)) ends.push(match[2] ?? "");
	}
	if (body.length > 0) bodies.push(body.join("\n"));
	return { shell: shell.join("\n"), bodies };
}

function unquote(token: string): string {
	if (token.startsWith("'")) return token.slice(1, token.endsWith("'") && token.length > 1 ? -1 : undefined);
	const bare = token.startsWith('"')
		? token.slice(1, token.endsWith('"') && token.length > 1 ? -1 : undefined)
		: token;
	return bare.replace(/\\(.)/g, "$1");
}

/**
 * The files a shell command names, resolved against where it runs (and where a `cd` in it moves to), and which
 * of them it writes: a redirect's target, a copy's, what `mv`, `rm`, `sed -i` and their like name, what a script
 * that writes files names. The spool CLI writes no frame, so none of its verbs counts.
 * A guess from the command's words, never a shell's parse: what it can't tell is a read.
 */
function shellFiles(command: string, cwd: string): ToolFiles | null {
	const { shell, bodies } = heredocs(command);
	const read: string[] = [];
	const written: string[] = [];
	/** folders a `cd` went to, where a script writes what it names relatively */
	const went: string[] = [];
	const scripts = [...bodies];
	let base = cwd;
	const at = (path: string) => resolve(base, path === "~" || path.startsWith("~/") ? homedir() + path.slice(1) : path);
	const segments: string[][] = [[]];
	for (const token of shell.match(TOKEN) ?? [])
		if (/^(?:&&|\|\||[;&|\n()])$/.test(token)) segments.push([]);
		else segments.at(-1)?.push(token);
	for (const tokens of segments) {
		const words: { word: string; quoted: boolean }[] = [];
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i] ?? "";
			if (/^(?:\d*|&)>>?$/.test(token)) {
				const target = tokens[++i];
				if (target !== undefined) written.push(at(unquote(target)));
			} else if (token === "<") {
				const source = tokens[++i];
				if (source !== undefined) read.push(at(unquote(source)));
			} else if (token.startsWith("<")) i++;
			else if (!/^\d*>&/.test(token)) {
				const quoted = /^['"]/.test(token);
				const word = unquote(token);
				// a quoted word with spaces in it is a script's text, or a pattern's: never a file itself
				if (quoted && /\s/.test(word)) scripts.push(word);
				else if (word !== "") words.push({ word, quoted });
			}
		}
		while (words[0] !== undefined && (RUNNERS.has(words[0].word) || /^\w+=/.test(words[0].word))) words.shift();
		const [first, ...rest] = words;
		if (first === undefined) continue;
		const name = basename(first.word);
		const named = rest.filter((one) => !one.word.startsWith("-"));
		const paths = named.map((one) => one.word);
		if (name === "cd") {
			if (paths[0] !== undefined) {
				base = at(paths[0]);
				went.push(base);
			}
		} else if (WRITES_ALL.has(name)) written.push(...paths.map(at));
		else if (name === "git" && GIT_WRITES.has(paths[0] ?? "")) written.push(...paths.slice(1).map(at));
		else if ((name === "sed" || name === "perl") && rest.some((one) => /^-[a-z]*i|^--in-place/.test(one.word)))
			written.push(...named.filter((one) => !one.quoted).map((one) => at(one.word)));
		else if (WRITES_LAST.has(name) && paths.length >= 2) {
			read.push(...paths.slice(0, -1).map(at));
			written.push(at(paths.at(-1) ?? ""));
		} else read.push(...paths.filter((path) => path.includes("/") || /\.\w+$/.test(path)).map(at));
	}
	const inScripts = scripts.flatMap((script) => [...script.matchAll(PATH_IN)].map((match) => at(match[1] ?? "")));
	if (scripts.some((script) => SCRIPT_WRITES.test(script))) written.push(...inScripts, ...went);
	else read.push(...inScripts, ...went);
	return read.length === 0 && written.length === 0 ? null : { read, written };
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
		drawn: false,
		terminal,
		busy: 0,
		started: at,
		at,
		ended: null,
	};
}

/** The first frame among places in the design. */
function frameOf(places: readonly ReturnType<DesignAt>[]): string | null {
	for (const place of places) if (place !== null && place !== "shared") return place.frame;
	return null;
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
	designAt: DesignAt,
): OutsideSession | null {
	const cwd = text(payload.cwd) ?? session.root;
	const agentId = text(payload.agent_id);
	const agent = agentId ?? "main";
	const who = agentId === null ? session.harness : cut((text(payload.agent_type) ?? "agent").toLowerCase(), 24);
	// a designer's first word draws it, whatever it goes on to do
	const designer = text(payload.agent_type)?.toLowerCase() === DESIGNER;
	const base = { ...session, at, drawn: session.drawn || designer };
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
				drawn: false,
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
			const files = filesOf(session.harness, tool, input, cwd);
			if (files === null) return next;
			// a write to the design draws it, a shared file's with no hand; a read's hand shows once it is drawn
			const written = files.written.map(designAt).filter((one) => one !== null);
			const editing = frameOf(written);
			const frame = editing ?? frameOf(files.read.map(designAt));
			return {
				...next,
				drawn: next.drawn || written.length > 0,
				hands: withHand(
					session.hands,
					agent,
					frame === null ? null : { agent, who, act: editing === null ? "reading" : "editing", frame },
				),
			};
		}
		case "PostToolUse":
		case "PostToolUseFailure": {
			const next = { ...going(base), busy: Math.max(0, session.busy - 1) };
			const files = filesOf(session.harness, tool, input, cwd);
			if (files === null || event === "PostToolUseFailure" || payload.failed === true) return next;
			const changed = [...session.changed];
			for (const file of files.written) {
				const frame = frameOf([designAt(file)]);
				if (frame !== null && !changed.includes(frame)) changed.push(frame);
			}
			return { ...next, changed, drawn: next.drawn || changed.length > 0 };
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
