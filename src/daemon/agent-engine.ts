import type { Attachment } from "../attachment";
import type { AgentPermissions } from "../settings/registry";
import type { AgentAsk, AgentOffer } from "./agent-offer";
import type { AgentLogin } from "./agent-preflight";
import type { AgentTurn } from "./agent-turn";

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
	account(root: string, signal?: AbortSignal): Promise<AgentLogin>;
	offer(options: EngineOfferOptions): Promise<AgentOffer>;
	/** Keep only the choice the engine confirmed, including any engine-specific pins. */
	choice(offer: AgentOffer, wanted: AgentAsk, held: AgentAsk): AgentAsk;
	start(options: EngineTurnOptions): AgentTurn;
	continuable(root: string, session: AgentSessionRef): boolean | Promise<boolean>;
}
