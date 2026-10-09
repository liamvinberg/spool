import type { AgentEvent, AgentEventBase, AgentForeign, AgentLimit } from "./agent-events";

/**
 * Codex's app-server notifications, read into spool's event union (#362).
 *
 * A translator and nothing more: it names what Codex reports in the union's words and
 * parses no tool arguments. A command is the command Codex reports, a file change is the
 * paths Codex reports, and an item the union has no member for arrives as `other`.
 *
 * One connection can carry more than one thread: a sub-agent streams on the same stdio
 * under its own thread id. Everything not on the thread the human is talking to is tagged
 * with the call that spawned it, the way a Claude sub-agent's events are tagged with their
 * delegating call, and only the main thread's `turn/completed` ends the turn.
 *
 * A spawn is a delegation (#367), drawn the way Claude's `Agent` call is: the call, then a
 * task for the sub-agent's thread once Codex names it, which lands when that thread's own
 * turn completes. Codex gives a spawn no title, so the task is named from the first line
 * of the brief it was handed.
 */

export interface CodexItem {
	readonly type?: string;
	readonly id?: string;
	readonly [key: string]: unknown;
}

/** One call as the rail draws it: what a Claude tool call would have been called. */
export interface CodexCall {
	readonly id: string;
	readonly tool: string;
	readonly input: Record<string, unknown>;
	readonly foreign?: AgentForeign;
}

const string = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
const record = (value: unknown): Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** a file change's kind, in the verbs the rail already draws */
function changeTool(kind: unknown): string {
	const type = record(kind).type;
	return type === "add" ? "Write" : type === "delete" ? "Delete" : "Edit";
}

/**
 * The calls one item is, in the order the rail should draw them.
 *
 * A command is one call, shown as the commands Codex itself split it into. A file change
 * is one call per file, the first under the item's own id so an approval for the item
 * lands on it. Anything that is not a call (a message, reasoning, a plan) is none.
 */
export function callsOf(item: CodexItem): readonly CodexCall[] {
	const id = item.id;
	if (id === undefined) return [];
	switch (item.type) {
		case "commandExecution": {
			const actions = Array.isArray(item.commandActions) ? item.commandActions : [];
			const commands = actions.map((action) => string(record(action).command)).filter((one) => one !== undefined);
			const command = commands.length > 0 ? commands.join(" && ") : (string(item.command) ?? "");
			return [{ id, tool: "Bash", input: { command, ...(item.cwd === undefined ? {} : { cwd: item.cwd }) } }];
		}
		case "fileChange": {
			const changes = Array.isArray(item.changes) ? item.changes : [];
			return changes.map((change, index) => {
				const one = record(change);
				const tool = changeTool(one.kind);
				return {
					id: index === 0 ? id : `${id}#${index}`,
					tool,
					input: {
						file_path: string(one.path) ?? "",
						// a new file's diff is its whole text, which is what a write carries
						...(tool === "Write" && typeof one.diff === "string" ? { content: one.diff } : {}),
					},
				};
			});
		}
		case "mcpToolCall": {
			const server = string(item.server);
			const tool = string(item.tool);
			return [
				{
					id,
					tool: `mcp__${server ?? "unknown"}__${tool ?? "unknown"}`,
					input: record(item.arguments),
					foreign: { ...(server === undefined ? {} : { server }), ...(tool === undefined ? {} : { tool }) },
				},
			];
		}
		case "dynamicToolCall":
			return [{ id, tool: string(item.tool) ?? "tool", input: record(item.arguments) }];
		case "webSearch":
			return [{ id, tool: "WebSearch", input: { query: string(item.query) ?? "" } }];
		case "imageView":
			return [{ id, tool: "Read", input: { file_path: string(item.path) ?? "" } }];
		case "collabAgentToolCall":
			if (item.tool === "spawnAgent")
				return [
					{
						id,
						tool: "Agent",
						input: {
							description: briefTitle(item.prompt),
							...(typeof item.prompt === "string" ? { prompt: item.prompt } : {}),
						},
					},
				];
			return [
				{
					id,
					tool: string(item.tool) ?? "collab",
					input: {
						...(typeof item.prompt === "string" ? { prompt: item.prompt } : {}),
						...(Array.isArray(item.receiverThreadIds) ? { receivers: item.receiverThreadIds } : {}),
					},
				},
			];
		default:
			return [];
	}
}

/** the longest a delegation's title runs before it is cut, in characters */
const TITLE = 60;

/**
 * A spawn's title: the `task_name` Codex's newer spawn tool puts on the brief's first line
 * where there is one, and otherwise the brief's first line, cut at a word.
 */
export function briefTitle(prompt: unknown): string | null {
	if (typeof prompt !== "string") return null;
	const first = prompt.trim().split("\n")[0]?.trim() ?? "";
	const named = /^task_name:\s*(.+)$/.exec(first)?.[1]?.trim();
	const line = named ?? first;
	if (line === "") return null;
	if (line.length <= TITLE) return line;
	const cut = line.slice(0, TITLE);
	const space = cut.lastIndexOf(" ");
	return `${(space > TITLE / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** what a finished item came back with: the command's output, a call's own text, or nothing */
function resultText(item: CodexItem): string {
	if (typeof item.aggregatedOutput === "string") return item.aggregatedOutput;
	const result = record(item.result);
	if (Array.isArray(result.content))
		return result.content
			.map((part) => string(record(part).text))
			.filter((one) => one !== undefined)
			.join("\n");
	const error = record(item.error);
	return string(error.message) ?? "";
}

function failedItem(item: CodexItem): boolean {
	const status = item.status;
	if (status === "failed" || status === "declined") return true;
	return typeof item.exitCode === "number" && item.exitCode !== 0;
}

/** Codex names a window by its length; the rail's names are Claude's, which say the same */
function windowOf(minutes: unknown): string | undefined {
	if (minutes === 300) return "five_hour";
	if (minutes === 10080) return "seven_day";
	return undefined;
}

/**
 * The percentage at which Codex's own terminal UI starts warning about a window (its
 * `RATE_LIMIT_WARNING_THRESHOLDS` start at 75). Codex sends its usage after every model
 * call, and the rail only speaks when the agent itself would have.
 */
const WARNS_AT = 75;

/** The fullest window Codex reported, as a limit, or undefined where it says nothing. */
export function limitOf(snapshot: unknown): AgentLimit | undefined {
	const limits = record(snapshot);
	const windows = [record(limits.primary), record(limits.secondary)].filter(
		(window) => typeof window.usedPercent === "number",
	);
	const fullest = windows.sort((one, two) => (two.usedPercent as number) - (one.usedPercent as number))[0];
	const reached = string(limits.rateLimitReachedType);
	if (fullest === undefined && reached === undefined) return undefined;
	const used = fullest === undefined ? undefined : (fullest.usedPercent as number);
	const window = windowOf(fullest?.windowDurationMins);
	const resetsAt = typeof fullest?.resetsAt === "number" ? fullest.resetsAt : undefined;
	return {
		status:
			reached !== undefined ? "rejected" : used !== undefined && used >= WARNS_AT ? "allowed_warning" : "allowed",
		...(window === undefined ? {} : { window }),
		...(used === undefined ? {} : { utilization: used / 100 }),
		...(resetsAt === undefined ? {} : { resetsAt }),
	};
}

export interface CodexAdapter {
	/** the thread the human is talking to, once Codex has named it */
	main: string | null;
	read(method: string, params: unknown): AgentEvent[];
	/** the item an approval names, as Codex last reported it */
	item(id: string): CodexItem | undefined;
	/** the call an event on this thread belongs to, or null on the main thread */
	parentOf(thread: string | undefined): string | null;
}

export function createCodexAdapter(): CodexAdapter {
	const items = new Map<string, CodexItem>();
	/** a sub-agent's thread, by the call that spawned it */
	const children = new Map<string, string>();
	/** each sub-agent's last words, which are its task's summary when it lands */
	const lastWords = new Map<string, string>();
	let block = 0;
	let spoke = false;
	/** what the last limit said, so the same reading is not said after every model call */
	let said: string | undefined;
	/** each message's block, so its deltas and its settled text land in one place */
	const blocks = new Map<string, number>();

	const adapter: CodexAdapter = {
		main: null,
		item: (id) => items.get(id),
		parentOf(thread) {
			if (thread === undefined || adapter.main === null || thread === adapter.main) return null;
			return children.get(thread) ?? `codex-thread:${thread}`;
		},
		read(method, params) {
			const wire = record(params);
			const thread = string(wire.threadId);
			const base: AgentEventBase = { parent: adapter.parentOf(thread) };
			switch (method) {
				case "turn/started":
					return base.parent === null ? [{ kind: "waiting", ...base }] : [];
				case "item/started":
					return started(record(wire.item) as CodexItem, base);
				case "item/completed":
					return completed(record(wire.item) as CodexItem, base, thread);
				case "item/agentMessage/delta": {
					const text = string(wire.delta);
					const item = string(wire.itemId);
					if (text === undefined || text === "") return [];
					return [
						{ kind: "say", block: (item === undefined ? undefined : blocks.get(item)) ?? block, text, ...base },
					];
				}
				case "turn/completed": {
					if (base.parent !== null) return thread === undefined ? [] : [landed(thread, wire)];
					const turn = record(wire.turn);
					const status = string(turn.status);
					const error = record(turn.error);
					return [
						{
							kind: "ended",
							ending: status === "completed" ? "done" : status === "interrupted" ? "stopped" : "failed",
							reason: string(error.message) ?? null,
							stopReason: status ?? null,
							...(typeof turn.durationMs === "number" ? { durationMs: turn.durationMs } : {}),
							...base,
						},
					];
				}
				case "account/rateLimits/updated": {
					const limit = limitOf(wire.rateLimits);
					if (limit === undefined) return [];
					const key = `${limit.status}:${limit.window}:${Math.floor((limit.utilization ?? 0) * 100)}`;
					// a quiet reading is never news, and the same reading twice is not either
					if (key === said || (said === undefined && limit.status === "allowed")) return [];
					said = key;
					return [{ kind: "limit", limit, parent: null }];
				}
				case "thread/compacted":
					return [{ kind: "compacted", trigger: null, ...base }];
				case "thread/tokenUsage/updated": {
					// the ring is the main thread's: the last request's prompt and answer over the
					// model's window, as Codex's own status line reads it
					if (base.parent !== null) return [];
					const usage = record(wire.tokenUsage);
					const used = record(usage.last).totalTokens;
					const window = usage.modelContextWindow;
					if (typeof used !== "number" || typeof window !== "number" || used <= 0 || window <= 0) return [];
					return [{ kind: "context", used, window, ...base }];
				}
				default:
					return [{ kind: "other", type: method, ...base, vendor: params }];
			}
		},
	};

	function started(item: CodexItem, base: AgentEventBase): AgentEvent[] {
		if (item.id !== undefined) items.set(item.id, item);
		const events: AgentEvent[] = [...spawned(item)];
		if (!spoke && base.parent === null && item.type !== "userMessage") {
			spoke = true;
			events.push({ kind: "speaking", message: null, model: null, ...base });
		}
		switch (item.type) {
			case "userMessage":
				return events;
			case "reasoning":
				block += 1;
				events.push({ kind: "thinking", block, tokens: 0, ...base });
				return events;
			case "agentMessage":
				block += 1;
				if (item.id !== undefined) blocks.set(item.id, block);
				return events;
			case "contextCompaction":
				events.push({ kind: "compacting", ...base });
				return events;
			default:
				break;
		}
		const calls = callsOf(item);
		if (calls.length === 0) {
			events.push({ kind: "other", type: `item/${item.type ?? "unknown"}`, ...base, vendor: item });
			return events;
		}
		for (const call of calls) {
			block += 1;
			events.push({ kind: "call", id: call.id, block, tool: call.tool, ...base });
			events.push({
				kind: "called",
				id: call.id,
				tool: call.tool,
				input: call.input,
				...(call.foreign === undefined ? {} : { foreign: call.foreign }),
				...base,
			});
		}
		return events;
	}

	function completed(item: CodexItem, base: AgentEventBase, thread?: string): AgentEvent[] {
		if (item.id !== undefined) items.set(item.id, item);
		switch (item.type) {
			case "userMessage":
			case "reasoning":
				return [];
			case "agentMessage": {
				const text = string(item.text) ?? "";
				if (text !== "" && base.parent !== null && thread !== undefined) lastWords.set(thread, text);
				return text === "" ? [] : [{ kind: "said", text, ...base }];
			}
			case "contextCompaction":
				return [{ kind: "compacted", trigger: null, ...base }];
			default:
				break;
		}
		const tasks = spawned(item);
		const calls = callsOf(item);
		if (calls.length === 0) return tasks;
		const failed = failedItem(item);
		const declined = item.status === "declined";
		const text = resultText(item);
		return [
			...calls.map((call) => ({
				kind: "result" as const,
				id: call.id,
				failed,
				...(declined ? { nonExecution: "declined" } : {}),
				text,
				images: [],
				...base,
			})),
			...tasks,
		];
	}

	/**
	 * The sub-agents a spawn just named, each a task under the spawning call. Only a spawn
	 * makes a child: `wait` and the other collab calls name threads that already exist, and
	 * a child keeps the call that spawned it as its parent.
	 */
	function spawned(item: CodexItem): AgentEvent[] {
		if (item.type !== "collabAgentToolCall" || item.tool !== "spawnAgent" || item.id === undefined) return [];
		if (!Array.isArray(item.receiverThreadIds)) return [];
		const events: AgentEvent[] = [];
		for (const receiver of item.receiverThreadIds) {
			if (typeof receiver !== "string" || children.has(receiver)) continue;
			children.set(receiver, item.id);
			events.push({
				kind: "task-started",
				task: receiver,
				call: item.id,
				description: briefTitle(item.prompt),
				agent: null,
				prompt: string(item.prompt) ?? null,
				parent: adapter.parentOf(string(item.senderThreadId)),
			});
		}
		return events;
	}

	/** a sub-agent's own turn completed: its task lands, with its last words */
	function landed(thread: string, wire: Record<string, unknown>): AgentEvent {
		const status = string(record(wire.turn).status);
		return {
			kind: "task-done",
			task: thread,
			status: status ?? null,
			summary: lastWords.get(thread) ?? null,
			parent: adapter.parentOf(thread),
		};
	}

	return adapter;
}
