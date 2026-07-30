import type {
	AgentEvent,
	AgentEventBase,
	AgentForeign,
	AgentGrant,
	AgentImage,
	AgentLimit,
	AgentSpeaking,
	AgentThinking,
} from "./agent-events";

/**
 * The Claude Code adapter: `stream-json` in, the internal event union out
 * (#115, #191).
 *
 * It is a translator and nothing else. It parses no tool arguments, invents no
 * wording, and reads none of the rail's nouns — that projection is its own pure
 * module. What it does own is tolerance: `stream-json` publishes no stability
 * guarantee, so an event type nobody modelled becomes `other` and a line that is
 * not JSON becomes `other` too. A rename must cost a blank row, never a turn.
 *
 * Every field it reads is one a capture in fixtures/captures/ carries.
 */

/**
 * Wire types the adapter deliberately says nothing about.
 *
 * Every one of them is bookkeeping the union already carries from somewhere
 * better:
 *
 *   assistant                      a message whose only block is thinking — the
 *                                  count already streamed, and the block carries
 *                                  an empty string and a signature
 *   content_block_start            a text block opening; `speaking` already said
 *                                  the message did, and the first delta carries
 *                                  the words
 *   content_block_stop             implied by the whole message that follows
 *   message_delta, message_stop    a stop reason the `result` carries again
 *   signature_delta                435 characters of base64 nobody can draw
 *   thinking_delta                 only once `system/thinking_tokens` has taken
 *                                  over the count for this message
 *   user                           an event with no `tool_result` in it: the
 *                                  compaction summary and the interruption
 *                                  notice are the binary talking to the model
 *                                  rather than to anybody (#165)
 *
 * Exported because the no-loss test asserts against it: anything silent that is
 * not on this list is a hole rather than a decision.
 */
export const CLAUDE_QUIET: readonly string[] = [
	"assistant",
	"stream_event/content_block_start",
	"stream_event/content_block_stop",
	"stream_event/content_block_delta:signature_delta",
	"stream_event/content_block_delta:thinking_delta",
	"stream_event/message_delta",
	"stream_event/message_stop",
	"user",
];

interface WireDelta {
	readonly type?: string;
	readonly text?: string;
	readonly partial_json?: string;
	readonly estimated_tokens?: number;
}

interface WireBlock {
	readonly type?: string;
	readonly id?: string;
	readonly name?: string;
	readonly text?: string;
	readonly input?: unknown;
	readonly tool_use_id?: string;
	readonly is_error?: boolean;
	readonly content?: string | readonly WireBlock[];
	readonly source?: { readonly media_type?: string; readonly data?: string };
	readonly tool_name?: string;
}

interface WireEvent {
	readonly type?: string;
	readonly subtype?: string;
	readonly index?: number;
	readonly delta?: WireDelta;
	readonly content_block?: WireBlock;
	readonly message?: {
		readonly id?: string;
		readonly model?: string;
		readonly role?: string;
		readonly content?: string | readonly WireBlock[];
	};
}

/**
 * A request coming the other way (#121, #145).
 *
 * The binary asks the client for things over the same stdout the turn streams down,
 * and every one of them names itself with a `request_id` the answer has to quote.
 * `can_use_tool` is the only subtype the rail draws; the rest are answered by the
 * daemon on the protocol's own terms.
 */
interface WireControl {
	readonly subtype?: string;
	readonly tool_name?: string;
	readonly display_name?: string;
	readonly input?: unknown;
	readonly description?: string;
	readonly permission_suggestions?: readonly unknown[];
	readonly suppress_always_allow_rule?: boolean;
	readonly requires_user_interaction?: boolean;
	readonly tool_use_id?: string;
}

interface WireLine {
	readonly type?: string;
	readonly subtype?: string;
	readonly status?: string;
	readonly event?: WireEvent;
	readonly request_id?: string;
	readonly request?: WireControl;
	readonly parent_tool_use_id?: string | null;
	readonly ttft_ms?: number;
	readonly session_id?: string;
	readonly message?: WireEvent["message"];
	readonly estimated_tokens?: number;
	readonly cwd?: string;
	readonly model?: string;
	readonly permissionMode?: string;
	readonly apiKeySource?: string;
	readonly claude_code_version?: string;
	readonly capabilities?: readonly string[];
	readonly rate_limit_info?: Record<string, unknown>;
	readonly compact_metadata?: { readonly trigger?: string; readonly cumulative_dropped_tokens?: number };
	readonly task_id?: string;
	readonly tool_use_id?: string;
	readonly description?: string;
	readonly subagent_type?: string;
	readonly prompt?: string;
	readonly last_tool_name?: string;
	readonly usage?: { readonly total_tokens?: number; readonly tool_uses?: number; readonly duration_ms?: number };
	readonly patch?: { readonly status?: string };
	readonly summary?: string;
	readonly is_error?: boolean;
	readonly terminal_reason?: string;
	readonly stop_reason?: string | null;
	readonly num_turns?: number;
	readonly duration_ms?: number;
	readonly total_cost_usd?: number;
	readonly tool_use_meta?: readonly {
		readonly id?: string;
		readonly display_name?: string;
		readonly server_display_name?: string;
		readonly icon_url?: string;
	}[];
	readonly tool_result_meta?: readonly { readonly id?: string; readonly non_execution_kind?: string }[];
}

interface OpenBlock {
	kind: string;
	id: string | null;
	tool: string;
	tokens: number;
}

const asRecord = (value: unknown): WireLine | undefined =>
	typeof value === "object" && value !== null && !Array.isArray(value) ? (value as WireLine) : undefined;

const number = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);

const string = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

const bool = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);

/** Optional fields are omitted rather than set to undefined — exactOptionalPropertyTypes. */
function some<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
	return value === undefined ? ({} as { [P in K]?: V }) : ({ [key]: value } as { [P in K]?: V });
}

export function createClaudeAdapter() {
	/** open content blocks, keyed by thread and index — an index is reused every message */
	const blocks = new Map<string, OpenBlock>();
	/**
	 * Whether this message's thinking count is being told to us rather than
	 * summed. `system/thinking_tokens` carries the running total for the message
	 * and lands just before the delta it accounts for, so once one has arrived the
	 * deltas' own counts would double it.
	 */
	const authoritative = new Set<string>();

	function read(line: string): AgentEvent[] {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			// a line that is not JSON is the binary printing something we did not
			// ask for. It is not the turn's problem.
			return [{ kind: "other", type: "unparsed", parent: null, vendor: line }];
		}
		const wire = asRecord(parsed);
		if (wire === undefined) return [{ kind: "other", type: "unparsed", parent: null, vendor: parsed }];
		const parent = typeof wire.parent_tool_use_id === "string" ? wire.parent_tool_use_id : null;
		const base: AgentEventBase = { parent };
		switch (wire.type) {
			case "system":
				return system(wire, base);
			case "stream_event":
				return streamed(wire, base, parent);
			case "assistant":
				return assistant(wire, base);
			case "user":
				return user(wire, base);
			case "control_request":
				return asked(wire, base);
			case "result":
				return [ended(wire, base)];
			case "rate_limit_event":
				return [{ kind: "limit", limit: limitOf(wire.rate_limit_info ?? {}), ...base }];
			default:
				return [{ kind: "other", type: string(wire.type) ?? "unknown", ...base, vendor: parsed }];
		}
	}

	function system(wire: WireLine, base: AgentEventBase): AgentEvent[] {
		switch (wire.subtype) {
			case "init":
				return [
					{
						kind: "ready",
						session: string(wire.session_id) ?? null,
						model: string(wire.model) ?? null,
						cwd: string(wire.cwd) ?? null,
						version: string(wire.claude_code_version) ?? null,
						permissionMode: string(wire.permissionMode) ?? null,
						apiKeySource: string(wire.apiKeySource) ?? null,
						capabilities: Array.isArray(wire.capabilities) ? [...wire.capabilities] : [],
						...base,
					},
				];
			case "status":
				if (wire.status === "requesting") return [{ kind: "waiting", ...base }];
				if (wire.status === "compacting") return [{ kind: "compacting", ...base }];
				return [{ kind: "other", type: "system/status", ...base, vendor: wire }];
			case "thinking_tokens":
				return [thoughtOf(wire, base, number(wire.estimated_tokens) ?? 0, true)];
			case "compact_boundary":
				return [
					{
						kind: "compacted",
						trigger: string(wire.compact_metadata?.trigger) ?? null,
						...some("droppedTokens", number(wire.compact_metadata?.cumulative_dropped_tokens)),
						...base,
					},
				];
			// three channels, not one (#191): a task names itself and carries its
			// whole prompt, its progress is one live line, and its notification is
			// the summary it wrote for itself
			case "task_started":
				return [
					{
						kind: "task-started",
						task: string(wire.task_id) ?? "",
						call: string(wire.tool_use_id) ?? null,
						description: string(wire.description) ?? null,
						agent: string(wire.subagent_type) ?? null,
						prompt: string(wire.prompt) ?? null,
						...base,
					},
				];
			case "task_progress":
				return [
					{
						kind: "task-step",
						task: string(wire.task_id) ?? "",
						call: string(wire.tool_use_id) ?? null,
						description: string(wire.description) ?? null,
						lastTool: string(wire.last_tool_name) ?? null,
						...some("tokens", number(wire.usage?.total_tokens)),
						...some("toolUses", number(wire.usage?.tool_uses)),
						...some("durationMs", number(wire.usage?.duration_ms)),
						...base,
					},
				];
			case "task_updated":
				return [
					{
						kind: "task-done",
						task: string(wire.task_id) ?? "",
						status: string(wire.patch?.status) ?? null,
						summary: null,
						...base,
					},
				];
			case "task_notification":
				return [
					{
						kind: "task-done",
						task: string(wire.task_id) ?? "",
						status: string(wire.status) ?? null,
						summary: string(wire.summary) ?? null,
						...base,
					},
				];
			default:
				return [{ kind: "other", type: `system/${string(wire.subtype) ?? "unknown"}`, ...base, vendor: wire }];
		}
	}

	/**
	 * The binary asking the client for something (#121, #145).
	 *
	 * Three subtypes are question-shaped and only one of them is the agent's own
	 * question, so they do not collapse into one member: `can_use_tool` carries the
	 * agent's words and is the channel both an approval and an `AskUserQuestion` ride,
	 * `elicitation` carries a connector's words and is declined, and a
	 * `request_user_dialog` arrives only for a dialog kind the client declared it can
	 * display — spool declares none, so it never does.
	 *
	 * A request nobody modelled becomes `other`, which is a request nobody answers.
	 * That is the honest failure: the binary's own abort resolves it, where a guessed
	 * answer would resolve it wrongly.
	 */
	function asked(wire: WireLine, base: AgentEventBase): AgentEvent[] {
		const request = string(wire.request_id) ?? "";
		const control = wire.request ?? {};
		if (request === "") return [{ kind: "other", type: "control_request", ...base, vendor: wire }];
		if (control.subtype === "can_use_tool") {
			return [
				{
					kind: "asking",
					request,
					call: string(control.tool_use_id) ?? null,
					tool: string(control.tool_name) ?? "",
					display: string(control.display_name) ?? null,
					input: control.input,
					description: string(control.description) ?? null,
					interaction: bool(control.requires_user_interaction) ?? false,
					// an always the request asked to have suppressed is an always spool does not
					// get to offer, which is the same fact as it having suggested nothing
					suggestions:
						bool(control.suppress_always_allow_rule) === true ? [] : grantsOf(control.permission_suggestions),
					...base,
				},
			];
		}
		if (control.subtype === "elicitation") return [{ kind: "elicit", request, ...base }];
		return [
			{ kind: "other", type: `control_request/${string(control.subtype) ?? "unknown"}`, ...base, vendor: wire },
		];
	}

	function streamed(wire: WireLine, base: AgentEventBase, parent: string | null): AgentEvent[] {
		const event = wire.event;
		if (event === undefined) return [{ kind: "other", type: "stream_event", ...base, vendor: wire }];
		const slot = (index: number | undefined) => `${parent ?? ""}:${index ?? 0}`;
		switch (event.type) {
			case "message_start": {
				// a message is a fresh set of block indexes, and a fresh thinking count
				for (const key of [...blocks.keys()]) {
					if (key.startsWith(`${parent ?? ""}:`)) blocks.delete(key);
				}
				authoritative.delete(parent ?? "");
				const speaking: AgentSpeaking = {
					kind: "speaking",
					message: string(event.message?.id) ?? null,
					model: string(event.message?.model) ?? null,
					...some("ttftMs", number(wire.ttft_ms)),
					...base,
				};
				return [speaking];
			}
			case "content_block_start": {
				const block = event.content_block ?? {};
				const open: OpenBlock = {
					kind: string(block.type) ?? "",
					id: string(block.id) ?? null,
					tool: string(block.name) ?? "",
					tokens: 0,
				};
				blocks.set(slot(event.index), open);
				// a thought opens before it has a number, and its first delta can be a
				// second away: the beat is the state, and zero is the honest count
				if (open.kind === "thinking") return [{ kind: "thinking", block: event.index ?? 0, tokens: 0, ...base }];
				if (open.kind !== "tool_use") return [];
				// the block opens with a name and an empty input; the subject types
				// itself in behind it
				return [{ kind: "call", id: open.id, block: event.index ?? 0, tool: open.tool, ...base }];
			}
			case "content_block_delta": {
				const delta = event.delta ?? {};
				const open = blocks.get(slot(event.index));
				if (delta.type === "text_delta") {
					return [{ kind: "say", block: event.index ?? 0, text: string(delta.text) ?? "", ...base }];
				}
				if (delta.type === "thinking_delta") {
					if (authoritative.has(parent ?? "")) return [];
					const tokens = (open?.tokens ?? 0) + (number(delta.estimated_tokens) ?? 0);
					if (open !== undefined) open.tokens = tokens;
					const thinking: AgentThinking = { kind: "thinking", block: event.index ?? 0, tokens, ...base };
					return [thinking];
				}
				if (delta.type === "input_json_delta") {
					return [
						{
							kind: "call-input",
							block: event.index ?? 0,
							fragment: string(delta.partial_json) ?? "",
							...base,
						},
					];
				}
				if (delta.type === "signature_delta") return [];
				return [
					{
						kind: "other",
						type: `stream_event/content_block_delta:${string(delta.type) ?? "unknown"}`,
						...base,
						vendor: delta,
					},
				];
			}
			case "content_block_stop":
			case "message_delta":
			case "message_stop":
				return [];
			default:
				return [{ kind: "other", type: `stream_event/${string(event.type) ?? "unknown"}`, ...base, vendor: event }];
		}
	}

	/** the thinking block currently open on this thread, so a message-level count lands on it */
	function thoughtOf(wire: WireLine, base: AgentEventBase, tokens: number, tell: boolean): AgentThinking {
		const parent = typeof wire.parent_tool_use_id === "string" ? wire.parent_tool_use_id : null;
		if (tell) authoritative.add(parent ?? "");
		let index = 0;
		for (const [key, open] of blocks) {
			if (!key.startsWith(`${parent ?? ""}:`) || open.kind !== "thinking") continue;
			open.tokens = tokens;
			index = Number.parseInt(key.slice(key.indexOf(":") + 1), 10);
		}
		return { kind: "thinking", block: index, tokens, ...base };
	}

	function assistant(wire: WireLine, base: AgentEventBase): AgentEvent[] {
		const content = wire.message?.content;
		if (!Array.isArray(content)) return [{ kind: "other", type: "assistant", ...base, vendor: wire }];
		const events: AgentEvent[] = [];
		for (const block of content) {
			if (block.type === "text") {
				events.push({ kind: "said", text: string(block.text) ?? "", ...base });
				continue;
			}
			if (block.type !== "tool_use") continue;
			const meta = (wire.tool_use_meta ?? []).find((entry) => entry.id === block.id);
			events.push({
				kind: "called",
				id: string(block.id) ?? "",
				tool: string(block.name) ?? "",
				input: block.input,
				// a call is foreign exactly when the binary sent names for it —
				// nothing here parses an `mcp__` prefix to find out (#142)
				...some("foreign", meta === undefined ? undefined : foreignOf(meta)),
				...base,
			});
		}
		// a whole thinking block carries an empty string and its signature: the
		// count already streamed, so there is nothing left to say about it
		return events;
	}

	function user(wire: WireLine, base: AgentEventBase): AgentEvent[] {
		const content = wire.message?.content;
		if (!Array.isArray(content)) return [];
		const events: AgentEvent[] = [];
		for (const block of content) {
			if (block.type !== "tool_result") continue;
			const id = string(block.tool_use_id) ?? "";
			const meta = (wire.tool_result_meta ?? []).find((entry) => entry.id === id);
			const parts: readonly WireBlock[] = Array.isArray(block.content) ? block.content : [];
			const images: AgentImage[] = parts
				.filter((part) => part.type === "image")
				.map((part) => ({
					media: string(part.source?.media_type) ?? "image",
					data: string(part.source?.data) ?? "",
				}));
			const tools = parts
				.filter((part) => part.type === "tool_reference")
				.map((part) => string(part.tool_name) ?? "");
			const text =
				typeof block.content === "string"
					? block.content
					: parts
							.filter((part) => part.type === "text")
							.map((part) => string(part.text) ?? "")
							.join("");
			events.push({
				kind: "result",
				id,
				failed: bool(block.is_error) ?? false,
				...some("nonExecution", string(meta?.non_execution_kind)),
				text,
				images,
				...some("tools", parts.some((part) => part.type === "tool_reference") ? tools : undefined),
				...base,
			});
		}
		return events;
	}

	function ended(wire: WireLine, base: AgentEventBase): AgentEvent {
		const reason = string(wire.terminal_reason) ?? null;
		const failed = bool(wire.is_error) ?? false;
		// the wire's own word is what separates a press from a failure: both leave
		// an error result, and only `terminal_reason` says which happened
		const ending = reason === "aborted_streaming" ? "stopped" : failed ? "failed" : "done";
		return {
			kind: "ended",
			ending,
			reason,
			stopReason: string(wire.stop_reason) ?? null,
			...some("turns", number(wire.num_turns)),
			...some("durationMs", number(wire.duration_ms)),
			...some("costUsd", number(wire.total_cost_usd)),
			...base,
		};
	}

	return { read };
}

function foreignOf(meta: {
	readonly display_name?: string;
	readonly server_display_name?: string;
	readonly icon_url?: string;
}): AgentForeign {
	return {
		...some("server", string(meta.server_display_name)),
		...some("tool", string(meta.display_name)),
		...some("iconUrl", string(meta.icon_url)),
	};
}

/**
 * The rules an "always" would grant, carried whole rather than remodelled (#121).
 *
 * The binary's permission-update language has six shapes and its own destinations,
 * and spool reads exactly one field of one of them. So every suggestion rides
 * through as the object it arrived as, and anything that is not an object is not a
 * rule spool can hand back.
 */
function grantsOf(suggestions: readonly unknown[] | undefined): readonly AgentGrant[] {
	if (!Array.isArray(suggestions)) return [];
	return suggestions.filter(
		(entry): entry is AgentGrant => typeof entry === "object" && entry !== null && !Array.isArray(entry),
	);
}

function limitOf(info: Record<string, unknown>): AgentLimit {
	return {
		status: string(info.status) ?? "",
		...some("window", string(info.rateLimitType)),
		...some("utilization", number(info.utilization)),
		...some("resetsAt", number(info.resetsAt)),
		...some("usingOverage", bool(info.isUsingOverage)),
		...some("surpassedThreshold", number(info.surpassedThreshold)),
		...some("graceActive", bool(info.rateLimitGraceActive)),
	};
}
