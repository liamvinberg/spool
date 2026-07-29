/**
 * The one internal event union every agent adapter feeds and the rail renders
 * (#115, #191).
 *
 * Modelled richest-first on everything Claude Code emits rather than on the
 * intersection of every runtime spool might drive: an intersection deletes
 * thinking, task progress and the usage window, which are the states that carry
 * the panel. A thinner agent lights up fewer members; it never needs a new one.
 *
 * Three rules hold across every member:
 *
 *   - Nothing here is invented. Wording is the agent's own, and a field exists
 *     because a capture in fixtures/captures/ carries it.
 *   - Vendor extras ride in `vendor` rather than being flattened, so a second
 *     adapter is never asked to fake a field that means nothing to it.
 *   - An event type nobody modelled arrives as `other` rather than as a crash.
 *     `stream-json` has no published stability guarantee.
 */

/** What a turn ended as. The wire's own reason rides beside it. */
export type AgentEnding = "done" | "stopped" | "failed";

/**
 * A usage window, the moment the binary says something about one (#122).
 *
 * Below a warning the payload carries no `utilization` at all, so the number is
 * optional and an always-on gauge is undrawable. Spool picks neither the window
 * nor the threshold: exactly one arrives, chosen upstream.
 */
export interface AgentLimit {
	readonly status: string;
	/** `five_hour`, `seven_day`, … — a window spool has never heard of is still carried */
	readonly window?: string;
	readonly utilization?: number;
	/** unix seconds */
	readonly resetsAt?: number;
	readonly usingOverage?: boolean;
	readonly surpassedThreshold?: number;
	/** the wind-down: finish or checkpoint, start no sub-agents */
	readonly graceActive?: boolean;
}

/** What the binary calls a tool that is not its own, per call (#142). */
export interface AgentForeign {
	readonly server?: string;
	readonly tool?: string;
	readonly iconUrl?: string;
}

/** A picture a tool handed back, inline (#117): the rail shows it with no second fetch. */
export interface AgentImage {
	readonly media: string;
	readonly data: string;
}

export interface AgentEventBase {
	/**
	 * The delegating call this came from, or null on the thread the human is
	 * talking to. A sub-agent's own turns reach the parent stream tagged with
	 * their parent call id; the call's own `caller` field is not the
	 * discriminator, because every call in both captures carries the same value.
	 */
	readonly parent: string | null;
	/** whatever the adapter read that the union has no field for */
	readonly vendor?: unknown;
}

/**
 * The session is up: what the binary is, what it loaded, and what it can do.
 *
 * `capabilities` is what feature detection reads. `apiKeySource` is the whole of
 * the no-keys claim — `none` means the spawn reused an existing CLI login.
 */
export interface AgentReady extends AgentEventBase {
	readonly kind: "ready";
	readonly session: string | null;
	readonly model: string | null;
	readonly cwd: string | null;
	readonly version: string | null;
	readonly permissionMode: string | null;
	readonly apiKeySource: string | null;
	readonly capabilities: readonly string[];
}

/** A request went up and nothing has come back yet. Measured, this beat is over a second. */
export interface AgentWaiting extends AgentEventBase {
	readonly kind: "waiting";
}

/** The first token came back. `ttftMs` is the binary's own measurement of the wait. */
export interface AgentSpeaking extends AgentEventBase {
	readonly kind: "speaking";
	readonly message: string | null;
	readonly model: string | null;
	readonly ttftMs?: number;
}

/**
 * The agent is thinking, and there is nothing to show but a number.
 *
 * Thinking deltas carry an empty string and an estimated token count, so
 * `tokens` is the running total and prose is not a field. Anything that streams
 * thinking text is drawing against data that does not exist.
 */
export interface AgentThinking extends AgentEventBase {
	readonly kind: "thinking";
	readonly block: number;
	readonly tokens: number;
}

/** One clause of prose, as the wire sent it — median 53 characters, not word by word. */
export interface AgentSay extends AgentEventBase {
	readonly kind: "say";
	readonly block: number;
	readonly text: string;
}

/** The settled whole of one message, which is what a restored transcript reads. */
export interface AgentSaid extends AgentEventBase {
	readonly kind: "said";
	readonly text: string;
}

/**
 * A tool call exists before its arguments do: the block opens with a name and an
 * empty input, and the subject types itself in behind it.
 */
export interface AgentCall extends AgentEventBase {
	readonly kind: "call";
	readonly id: string | null;
	readonly block: number;
	readonly tool: string;
}

/** One uneven fragment of partial JSON. They split mid-token; nothing here parses. */
export interface AgentCallInput extends AgentEventBase {
	readonly kind: "call-input";
	readonly block: number;
	readonly fragment: string;
}

/** The call, whole, with its arguments parsed by the binary rather than by spool. */
export interface AgentCalled extends AgentEventBase {
	readonly kind: "called";
	readonly id: string;
	readonly tool: string;
	readonly input: unknown;
	/** present exactly when the call belongs to a server that is not spool's */
	readonly foreign?: AgentForeign;
}

/**
 * What a call came back with.
 *
 * `failed` and `nonExecution` are two different facts and the wire needs both: an
 * interrupt and a permission decline stamp the same denial kind, and the field
 * that separates a call that ran and failed from one that never ran is the
 * non-execution kind. Its absence means the tool completed.
 */
export interface AgentResult extends AgentEventBase {
	readonly kind: "result";
	readonly id: string;
	readonly failed: boolean;
	readonly nonExecution?: string;
	readonly text: string;
	readonly images: readonly AgentImage[];
	/** how a deferred-tool search answers: the tools it loaded, by wire name */
	readonly tools?: readonly string[];
}

/** A delegated task, named with its own type and the whole prompt it was given. */
export interface AgentTaskStarted extends AgentEventBase {
	readonly kind: "task-started";
	readonly task: string;
	readonly call: string | null;
	readonly description: string | null;
	readonly agent: string | null;
	readonly prompt: string | null;
}

/** A live one-line step: a snapshot, never a log entry, so it replaces rather than appends. */
export interface AgentTaskStep extends AgentEventBase {
	readonly kind: "task-step";
	readonly task: string;
	readonly call: string | null;
	readonly description: string | null;
	readonly lastTool: string | null;
	readonly tokens?: number;
	readonly toolUses?: number;
	readonly durationMs?: number;
}

/** The task landed, with the summary it wrote for itself. */
export interface AgentTaskDone extends AgentEventBase {
	readonly kind: "task-done";
	readonly task: string;
	readonly status: string | null;
	readonly summary: string | null;
}

/** The usage window, said once, when there is something to say. */
export interface AgentLimitEvent extends AgentEventBase {
	readonly kind: "limit";
	readonly limit: AgentLimit;
}

/** The context is being compacted; the turn continues from the summary it writes. */
export interface AgentCompacting extends AgentEventBase {
	readonly kind: "compacting";
}

export interface AgentCompacted extends AgentEventBase {
	readonly kind: "compacted";
	readonly trigger: string | null;
	readonly droppedTokens?: number;
}

/**
 * The turn is over.
 *
 * `ending` is spool's own three-way reading and `reason` is the binary's own
 * word for it, kept so an interrupted turn stays distinguishable from a clean
 * one without spool having to be the authority on why.
 */
export interface AgentEnded extends AgentEventBase {
	readonly kind: "ended";
	readonly ending: AgentEnding;
	readonly reason: string | null;
	readonly stopReason: string | null;
	readonly turns?: number;
	readonly durationMs?: number;
	readonly costUsd?: number;
}

/** The process is gone. Emitted by the runner rather than by any adapter. */
export interface AgentClosed extends AgentEventBase {
	readonly kind: "closed";
	readonly code: number | null;
	readonly message?: string;
}

/**
 * Something nobody modelled. Tolerated rather than fatal, because `stream-json`
 * publishes no stability guarantee and a rename must cost a blank row, not a turn.
 */
export interface AgentOther extends AgentEventBase {
	readonly kind: "other";
	readonly type: string;
}

export type AgentEvent =
	| AgentReady
	| AgentWaiting
	| AgentSpeaking
	| AgentThinking
	| AgentSay
	| AgentSaid
	| AgentCall
	| AgentCallInput
	| AgentCalled
	| AgentResult
	| AgentTaskStarted
	| AgentTaskStep
	| AgentTaskDone
	| AgentLimitEvent
	| AgentCompacting
	| AgentCompacted
	| AgentEnded
	| AgentClosed
	| AgentOther;
