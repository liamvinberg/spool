import type { Attachment } from "../attachment";
import type { AgentExecutor } from "./agent-exec";
import type { AgentAsk, AgentOffer } from "./agent-offer";
import type { AgentLogin, Look } from "./agent-preflight";
import type { AgentTurn } from "./agent-turn";

/**
 * How a spawned agent is fenced (#121, #281). `ask` is the fence as built: the allow rules
 * make design/ quiet and everything else asks. `edits` accepts file edits and still asks for
 * the rest. `bypass` hands the agent its own bypass mode. The mode is this machine's, never
 * the repo's, and is part of the agent choice agent-defaults keeps (#361). It lives here,
 * in a module with no runtime imports, so the rail can read it too.
 */
export const AGENT_PERMISSIONS = ["ask", "edits", "bypass"] as const;
export type AgentPermissions = (typeof AGENT_PERMISSIONS)[number];

/** The installed agents spool drives, each through its own adapter. */
export const AGENT_ENGINE_IDS = ["claude", "codex", "pi"] as const;

export type AgentEngineId = (typeof AGENT_ENGINE_IDS)[number];

export function isAgentEngineId(value: unknown): value is AgentEngineId {
	return (AGENT_ENGINE_IDS as readonly unknown[]).includes(value);
}

/**
 * The bundled engine's owner id, kept for the threads it left behind (#363).
 *
 * The engine itself is gone. Its threads still name it, so their saved rail picture stays
 * readable, and no engine answers for it, so they can never be continued.
 */
export const LEGACY_ENGINE = "spool";

/** Who a stored thread belongs to: an engine spool drives, or the removed bundled one. */
export type ThreadEngine = AgentEngineId | typeof LEGACY_ENGINE;

export function isThreadEngine(value: unknown): value is ThreadEngine {
	return value === LEGACY_ENGINE || isAgentEngineId(value);
}

/** An engine resolves this opaque id inside its own storage. It is never a path. */
export interface AgentSessionRef {
	readonly id: string;
}

export interface AgentOwnership {
	readonly engine: ThreadEngine;
	readonly session: AgentSessionRef;
}

/** Human input, before an integration gives it a provider's wire format. */
export interface AgentMessage {
	readonly prompt: string;
	readonly selection: string;
	readonly attachments?: readonly Attachment[];
}

/**
 * What one message says as text, the selection block leading the words it is about. An
 * empty selection adds nothing, not an empty block.
 */
export function saidText(one: AgentMessage): string {
	return one.selection === "" ? one.prompt : `${one.selection}\n\n${one.prompt}`;
}

export interface EngineOfferOptions {
	readonly root: string;
	readonly session: AgentSessionRef;
	readonly ask: AgentAsk;
	readonly choose?: AgentAsk;
	readonly signal?: AbortSignal;
}

export interface EngineTurnOptions {
	readonly recovery?: string;
	readonly root: string;
	readonly session: AgentSessionRef;
	readonly said: readonly AgentMessage[];
	readonly ask: AgentAsk;
	readonly permissions: AgentPermissions;
}

/** What every engine is built from. */
export interface EngineDeps {
	/** how the engine's processes are spawned: the real one, or a capture's replay in tests */
	readonly executor: AgentExecutor;
	/** spool's state, where the engine mounts the designer and keeps its session references */
	readonly spoolDir: string;
	/** how the engine's command is found on `PATH`; tests make one up */
	readonly look?: Look;
}

/**
 * The daemon owns live turns and rendered history; an engine owns model conversations.
 * Starting returns a turn immediately, including while a process is starting, so the
 * daemon can reserve the thread and accept Stop before initialization completes.
 * Answers, interruption and abandonment use AgentTurn for every engine.
 *
 * Every engine is an agent the person installed and signed in to on their own: spool owns
 * no login, so signing in is always the agent's own command in a terminal.
 */
export interface AgentEngine {
	readonly id: AgentEngineId;
	installed(): boolean;
	/**
	 * On this machine but older than the oldest release spool runs, so not installed as far
	 * as a turn or the fallback go: the rail says it needs updating rather than installing.
	 * Absent on an engine with no oldest release.
	 */
	outdated?(): boolean;
	account(root: string, signal?: AbortSignal): Promise<AgentLogin>;
	offer(options: EngineOfferOptions): Promise<AgentOffer>;
	/** Keep only the choice the engine confirmed, including any engine-specific pins. */
	choice(offer: AgentOffer, wanted: AgentAsk, held: AgentAsk): AgentAsk;
	start(options: EngineTurnOptions): AgentTurn;
	continuable(root: string, session: AgentSessionRef): boolean | Promise<boolean>;
}
