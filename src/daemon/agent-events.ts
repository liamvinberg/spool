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
	/** Active turn time in milliseconds, stamped by the daemon for replay. */
	readonly elapsed?: number;
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

/**
 * One permission update the binary suggested for itself, carried whole (#121).
 *
 * Spool reads exactly one field of it — `destination`, which an "always" answer
 * rewrites to the thread's own scope so the grant dies with the thread and no file
 * is touched. Everything else is the runtime's own rule language and rides through
 * untouched, because spool owning an abstraction over permission rules is the thing
 * #121 decided against: the fence is paths, and the rules are the binary's.
 */
export type AgentGrant = Readonly<Record<string, unknown>>;

/**
 * The turn is waiting on the person (#121, #145).
 *
 * One member for two cases, because the wire is one channel: an approval and the
 * agent's own question arrive on the same request and are told apart by
 * `interaction`, which is what everything downstream reads. Measured across all
 * twelve asks in the capture, what they carry follows it — the flagged one has
 * neither the agent's written `description` nor a rule an "always" could grant, and
 * carries its options inside `input` instead — but the flag is the fact and the
 * contents are the consequence, so nothing infers one from the other.
 *
 * Nothing is parsed here. `input` is whatever the tool was called with, and turning
 * it into a question with readable options is the rail's own projection.
 */
export interface AgentAsking extends AgentEventBase {
	readonly kind: "asking";
	readonly access?: {
		readonly scope: string;
		readonly path: string;
		readonly kind?: "command";
		readonly command?: string;
		readonly unavailable?: boolean;
	};
	/** the control request's own id, which is what an answer names */
	readonly request: string;
	/** the call it is about, which is the row already in the log */
	readonly call: string | null;
	readonly tool: string;
	/** the binary's own display name for the tool */
	readonly display: string | null;
	readonly input: unknown;
	/** the agent's own written sentence about what it wants to do */
	readonly description: string | null;
	/** the agent's own question rather than an approval to run something */
	readonly interaction: boolean;
	/**
	 * What an "always" would grant, in the binary's own rule language.
	 *
	 * Empty is the whole of the rule for whether "always" is on offer: either the
	 * request suggested nothing, or it asked for the always rule to be suppressed.
	 * Spool never composes a rule of its own to fill the gap.
	 */
	readonly suggestions: readonly AgentGrant[];
}

/** What the person said to a waiting request, in spool's own five words. */
export type AgentAnswer = "allow" | "always" | "deny" | "said" | "picked";

/**
 * A waiting request stopped waiting, because the person answered it.
 *
 * Emitted by the daemon rather than by any adapter: the answer went up the same
 * stdin the prompt did, and this is the only trace of it the stream would otherwise
 * carry. The transcript is a fold over events, so without it the log could not draw
 * the answer at all.
 */
export interface AgentAnswered extends AgentEventBase {
	readonly kind: "answered";
	readonly request: string;
	readonly answer: AgentAnswer;
	/** the person's own words, where the answer was words */
	readonly words: string | null;
}

/**
 * A connector asking a question of its own, which spool declines (#145).
 *
 * Not the same kind of thing as the agent's question and not drawn: the words are a
 * server's rather than the agent's, its schema is an unbounded form, and decline is
 * the protocol's own word for "no answer is coming". A connector that needs auth
 * offers no tool to be asked through in the first place.
 *
 * It carries the id the decline has to quote and nothing else. The request does send a
 * server name, a message and a schema, but no capture in the repo holds an
 * elicitation at all, so anything modelled beyond what declining needs would be a
 * field with nothing behind it.
 */
export interface AgentElicit extends AgentEventBase {
	readonly kind: "elicit";
	readonly request: string;
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

/**
 * The background tasks the agent has running, as it reports the whole set (#365).
 *
 * Claude Code says it on every change (`background_tasks_changed`), and the set is the
 * authority on what still runs after the agent has answered. Only `agent` tasks hold a
 * turn open: a background shell (a dev server) is the agent's to leave running.
 */
export interface AgentBackground extends AgentEventBase {
	readonly kind: "background";
	readonly tasks: readonly {
		readonly task: string;
		readonly description: string | null;
		readonly agent: string | null;
		/** the agent's own word for what kind of task it is: `local_agent`, `local_bash` */
		readonly type: string | null;
	}[];
}

/**
 * The agent answered while delegations it started still run, so the turn holds (#365).
 *
 * Emitted by the runner in place of the `ended` it would otherwise have been: a turn ends
 * when the engine has reported its result and no background task it started is still
 * running. `tasks` is how many still are.
 */
export interface AgentHolding extends AgentEventBase {
	readonly kind: "holding";
	readonly tasks: number;
}

/**
 * What a turn did to one frame, read off `design/` rather than off any tool call (#365).
 *
 * Emitted by the daemon, which watches the project's `design/` while a turn runs, so a
 * heredoc, a script and a file tool all read the same. Attribution is the daemon's: the
 * call it came from where the turn's own file-tool calls say so, and the call that was
 * running when it landed otherwise. `parent` is the delegation it belongs to, as on every
 * other event.
 *
 * - `created`: the frame's entry appeared. `source` is what landed, so a held spot can
 *   replay it, and `spot` names the held spot it filled.
 * - `changed`: the source moved. `range` is the changed lines of the new source, 1-based
 *   and inclusive, which is what the canvas's edit ring locates.
 * - `deleted`: the frame went. `source` and `sidecar` are kept so Put back restores it.
 * - `restored`: Put back wrote it back.
 */
export interface AgentFrame extends AgentEventBase {
	readonly kind: "frame";
	readonly change: "created" | "changed" | "deleted" | "restored";
	/** the frame's path under frames/ (#336) */
	readonly frame: string;
	/** lines in the source now; 0 once deleted */
	readonly lines: number;
	readonly range?: { readonly from: number; readonly to: number };
	readonly source?: string;
	readonly sidecar?: string;
	/** the call it was attributed to, or null where nothing was running */
	readonly call: string | null;
	/** the delegated task it was attributed to */
	readonly task: string | null;
	readonly spot?: string;
}

/**
 * A frame's source while the agent is still writing it, before it exists on disk (#365).
 *
 * Only where the engine streams a call's input: Claude Code's main agent does, for a file
 * tool and for a shell heredoc alike. `text` is what arrived since the last one for this
 * call, so the source so far is every `text` of the call joined, and `lines` counts it.
 */
export interface AgentFrameSource extends AgentEventBase {
	readonly kind: "frame-source";
	readonly frame: string;
	readonly call: string;
	readonly text: string;
	readonly lines: number;
}

/**
 * A spot on the canvas held for a delegation that reports nothing while it works (#365).
 *
 * `held` when the delegation starts, placed through the same beside-the-field rule a new
 * frame gets and named from its task; `filled` when its frame lands there; `released` when
 * the delegation ended with nothing landing in it. Root page coordinates.
 */
export interface AgentSpot extends AgentEventBase {
	readonly kind: "spot";
	readonly state: "held" | "filled" | "released";
	readonly name: string;
	readonly task: string;
	/** the delegating call */
	readonly call: string | null;
	/** the frame that filled it */
	readonly frame?: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** The usage window, said once, when there is something to say. */
export interface AgentLimitEvent extends AgentEventBase {
	readonly kind: "limit";
	readonly limit: AgentLimit;
}

/**
 * How full the model's context window is after the turn's last request (#364).
 *
 * `used` is the tokens the last request sent (prompt, cache reads and writes), and
 * `window` the model's whole window, both as the agent reports them. The composer's
 * ring reads the share; nothing else does.
 */
export interface AgentContext extends AgentEventBase {
	readonly kind: "context";
	readonly used: number;
	readonly window: number;
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
export interface AgentRecovery {
	readonly kind: "login" | "limit";
	readonly account: string;
	readonly offer?: string;
	readonly scope: "account" | "model" | "unknown";
	readonly resetsAt?: number;
	readonly token?: string;
}

export interface AgentEnded extends AgentEventBase {
	readonly recovery?: AgentRecovery | null;
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
	readonly recovery?: AgentRecovery | null;
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
	| AgentAsking
	| AgentAnswered
	| AgentElicit
	| AgentTaskStarted
	| AgentTaskStep
	| AgentTaskDone
	| AgentBackground
	| AgentHolding
	| AgentFrame
	| AgentFrameSource
	| AgentSpot
	| AgentLimitEvent
	| AgentContext
	| AgentCompacting
	| AgentCompacted
	| AgentEnded
	| AgentClosed
	| AgentOther;
