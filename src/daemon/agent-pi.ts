import { DESIGNER_NAME } from "./agent-designer";
import type { AgentEvent, AgentEventBase, AgentImage } from "./agent-events";

/**
 * The pi adapter: `pi --mode rpc` in, the internal event union out (#363).
 *
 * A translator and nothing else, like Claude Code's: it parses no tool arguments (pi
 * hands its own parsed ones over), invents no wording, and an event nobody modelled
 * becomes `other`. Every field it reads is one a `pi-*` capture in fixtures/captures/
 * carries, recorded on pi 1.0.3.
 *
 * The wire is strict JSONL. Commands go down with an id and come back as a `response`
 * quoting it; everything else is the session's own event stream, the same one
 * `--mode json` prints. Pi has no approvals and no permission modes, so nothing here
 * ever asks: an extension's own dialog is the one request that could, and the turn
 * declines it where it arrives.
 *
 * Spool's designer extension (#367) is a tool pi runs like any other, and a call to it is a
 * delegation: it reads as Claude's `Agent` call, with a task that starts when the tool
 * does, steps on each of the tool's progress updates, and lands with its result.
 */

/** The ids spool puts on the commands it sends, so a response is known by what it answers. */
export const PI_STATE = "spool-state";
export const PI_PROMPT = "spool-prompt";

/** one command line, as pi reads it off stdin */
export function piCommandLine(command: Readonly<Record<string, unknown>>): string {
	return `${JSON.stringify(command)}\n`;
}

/**
 * What pi says once a turn has nothing left to do (#363).
 *
 * Not `agent_end`: that closes one low-level run, and retries, compaction, steering and
 * follow-ups can start another. `agent_settled` is pi's own "no remaining automatic
 * work", so it is the turn's end here and the one event the runner ends on.
 */
export const PI_SETTLED = "agent_settled";

interface WireContent {
	readonly type?: string;
	readonly text?: string;
	readonly data?: string;
	readonly mimeType?: string;
	readonly id?: string;
	readonly name?: string;
	readonly arguments?: unknown;
}

interface WireMessage {
	readonly role?: string;
	readonly content?: string | readonly WireContent[];
	readonly model?: string;
	readonly provider?: string;
	readonly stopReason?: string;
	readonly errorMessage?: string;
	readonly responseId?: string;
	readonly usage?: { readonly totalTokens?: unknown };
}

interface WireLine {
	readonly type?: string;
	readonly id?: string;
	readonly command?: string;
	readonly success?: boolean;
	readonly error?: string;
	readonly data?: {
		readonly sessionId?: string;
		readonly sessionFile?: string;
		readonly thinkingLevel?: string;
		readonly model?: { readonly id?: string; readonly provider?: string; readonly contextWindow?: unknown };
	};
	readonly message?: WireMessage;
	readonly assistantMessageEvent?: {
		readonly type?: string;
		readonly contentIndex?: number;
		readonly delta?: string;
		readonly id?: string;
		readonly toolName?: string;
		readonly toolCall?: WireContent;
	};
	readonly toolCallId?: string;
	readonly toolName?: string;
	readonly args?: { readonly description?: unknown; readonly prompt?: unknown };
	readonly partialResult?: { readonly details?: { readonly step?: unknown } };
	readonly result?: { readonly content?: readonly WireContent[] };
	readonly isError?: boolean;
	readonly reason?: string;
	readonly method?: string;
}

/** the extension UI methods that wait for an answer; the rest are fire-and-forget */
const DIALOGS: ReadonlySet<string> = new Set(["confirm", "select", "input", "editor"]);

/** what declining an extension's dialog says, in pi's own words for it */
export function piDeclineLine(request: string): string {
	return piCommandLine({ type: "extension_ui_response", id: request, cancelled: true });
}

const string = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/** `provider/id`, which is how pi names a model on its own command line */
export function piModelValue(model: { readonly id?: unknown; readonly provider?: unknown } | undefined): string | null {
	const id = string(model?.id);
	const provider = string(model?.provider);
	return id === undefined ? null : provider === undefined ? id : `${provider}/${id}`;
}

/** what the rail calls a delegation, which the designer tool is */
const DELEGATION = "Agent";

/** a tool's name as the rail reads it: spool's designer is a delegation */
function toolOf(name: string | undefined): string {
	return name === DESIGNER_NAME ? DELEGATION : (name ?? "");
}

function textOf(content: WireMessage["content"]): string {
	if (typeof content === "string") return content;
	return (content ?? [])
		.filter((block) => block.type === "text")
		.map((block) => string(block.text) ?? "")
		.join("");
}

export function createPiAdapter() {
	/** the last assistant message's own ending, which is what the settled turn ended as */
	let stopReason: string | null = null;
	let failure: string | null = null;
	/** the model's whole window, as `get_state` names it */
	let window: number | undefined;

	function read(line: string): AgentEvent[] {
		let wire: WireLine;
		try {
			const parsed: unknown = JSON.parse(line);
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
				return [{ kind: "other", type: "unparsed", parent: null, vendor: parsed }];
			wire = parsed as WireLine;
		} catch {
			return [{ kind: "other", type: "unparsed", parent: null, vendor: line }];
		}
		const base: AgentEventBase = { parent: null };
		switch (wire.type) {
			case "response":
				return responded(wire, base);
			case "turn_start":
				return [{ kind: "waiting", ...base }];
			case "message_start":
				if (wire.message?.role !== "assistant") return [];
				return [
					{
						kind: "speaking",
						message: null,
						model: piModelValue({ id: wire.message.model, provider: wire.message.provider }),
						...base,
					},
				];
			case "message_update":
				return updated(wire, base);
			case "message_end":
				return wire.message?.role === "assistant" ? spoke(wire.message, base) : [];
			case "tool_execution_end":
				return wire.toolName === DESIGNER_NAME
					? [resultOf(wire, base), landed(wire, base)]
					: [resultOf(wire, base)];
			case "tool_execution_start":
				return wire.toolName === DESIGNER_NAME ? [delegated(wire, base)] : [];
			case "tool_execution_update":
				return wire.toolName === DESIGNER_NAME ? stepped(wire, base) : [];
			case "compaction_start":
				return [{ kind: "compacting", ...base }];
			case "compaction_end":
				return [{ kind: "compacted", trigger: string(wire.reason) ?? null, ...base }];
			case PI_SETTLED:
				return [settled(base)];
			// an extension's own dialog is the one thing in pi that waits on a person, and it is
			// not the agent asking: the turn declines it, as Claude's connector questions are
			case "extension_ui_request":
				return DIALOGS.has(string(wire.method) ?? "") && typeof wire.id === "string"
					? [{ kind: "elicit", request: wire.id, ...base }]
					: [];
			// bookkeeping the union already carries from somewhere better: the run and turn
			// boundaries are the messages inside them, a tool's start is its call, and the
			// end of a low-level run is not the end of the turn
			case "agent_start":
			case "agent_end":
			case "turn_end":
			case "queue_update":
				return [];
			default:
				return [{ kind: "other", type: string(wire.type) ?? "unknown", ...base, vendor: wire }];
		}
	}

	function responded(wire: WireLine, base: AgentEventBase): AgentEvent[] {
		if (wire.id === PI_STATE && wire.success === true) {
			const named = wire.data?.model?.contextWindow;
			window = typeof named === "number" && named > 0 ? named : undefined;
			return [
				{
					kind: "ready",
					session: string(wire.data?.sessionId) ?? null,
					model: piModelValue(wire.data?.model),
					cwd: null,
					version: null,
					permissionMode: null,
					apiKeySource: null,
					capabilities: [],
					...base,
				},
			];
		}
		// a prompt pi refused never starts a run, so nothing will settle it: this is the end
		if (wire.id === PI_PROMPT && wire.success === false) {
			return [{ kind: "ended", ending: "failed", reason: string(wire.error) ?? null, stopReason: null, ...base }];
		}
		return [];
	}

	function updated(wire: WireLine, base: AgentEventBase): AgentEvent[] {
		const event = wire.assistantMessageEvent ?? {};
		const block = event.contentIndex ?? 0;
		switch (event.type) {
			case "text_delta":
				return [{ kind: "say", block, text: string(event.delta) ?? "", ...base }];
			case "thinking_start":
				return [{ kind: "thinking", block, tokens: 0, ...base }];
			// pi 1.0 names the call on the event itself; a toolCall block is the older shape
			case "toolcall_start":
				return [
					{
						kind: "call",
						id: string(event.id) ?? string(event.toolCall?.id) ?? null,
						block,
						tool: toolOf(string(event.toolName) ?? string(event.toolCall?.name)),
						...base,
					},
				];
			case "toolcall_delta":
				return [{ kind: "call-input", block, fragment: string(event.delta) ?? "", ...base }];
			default:
				return [];
		}
	}

	/** the settled message, in its own order: what it said, then the calls it made */
	function spoke(message: WireMessage, base: AgentEventBase): AgentEvent[] {
		stopReason = string(message.stopReason) ?? null;
		failure = stopReason === "error" ? (string(message.errorMessage) ?? null) : null;
		const events: AgentEvent[] = [];
		// how full the window is after this answer: its whole prompt and answer over the
		// window get_state named
		const used = message.usage?.totalTokens;
		if (window !== undefined && typeof used === "number" && used > 0)
			events.push({ kind: "context", used, window, ...base });
		for (const block of Array.isArray(message.content) ? message.content : []) {
			if (block.type === "text") events.push({ kind: "said", text: string(block.text) ?? "", ...base });
			if (block.type === "toolCall")
				events.push({
					kind: "called",
					id: string(block.id) ?? "",
					tool: toolOf(string(block.name)),
					input:
						block.name === DESIGNER_NAME
							? { ...(block.arguments as object | undefined), subagent_type: DESIGNER_NAME }
							: block.arguments,
					...base,
				});
		}
		return events;
	}

	function resultOf(wire: WireLine, base: AgentEventBase): AgentEvent {
		const content = wire.result?.content ?? [];
		const images: AgentImage[] = content
			.filter((part) => part.type === "image")
			.map((part) => ({ media: string(part.mimeType) ?? "image", data: string(part.data) ?? "" }));
		return {
			kind: "result",
			id: string(wire.toolCallId) ?? "",
			failed: wire.isError === true,
			text: textOf(content),
			images,
			...base,
		};
	}

	/** a designer started: its task, named with the call's own words */
	function delegated(wire: WireLine, base: AgentEventBase): AgentEvent {
		const call = string(wire.toolCallId) ?? "";
		return {
			kind: "task-started",
			task: call,
			call,
			description: string(wire.args?.description) ?? null,
			agent: DESIGNER_NAME,
			prompt: string(wire.args?.prompt) ?? null,
			...base,
		};
	}

	/** what the designer is doing now, as its extension reports it */
	function stepped(wire: WireLine, base: AgentEventBase): AgentEvent[] {
		const step = string(wire.partialResult?.details?.step);
		if (step === undefined) return [];
		const call = string(wire.toolCallId) ?? "";
		return [
			{ kind: "task-step", task: call, call, description: step, lastTool: step.split(" ")[0] ?? null, ...base },
		];
	}

	/** the designer finished: its task lands with the words it ended on */
	function landed(wire: WireLine, base: AgentEventBase): AgentEvent {
		return {
			kind: "task-done",
			task: string(wire.toolCallId) ?? "",
			status: wire.isError === true ? "failed" : "completed",
			summary: textOf(wire.result?.content ?? []) || null,
			...base,
		};
	}

	function settled(base: AgentEventBase): AgentEvent {
		const ending = stopReason === "aborted" ? "stopped" : stopReason === "error" ? "failed" : "done";
		return { kind: "ended", ending, reason: failure, stopReason, ...base };
	}

	return { read };
}
