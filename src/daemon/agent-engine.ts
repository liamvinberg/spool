import type { AuthEvent, AuthPrompt } from "@earendil-works/pi-ai";
import type { Attachment } from "../attachment";
import type { AgentPermissions } from "../settings/registry";
import type { AgentAsk, AgentOffer } from "./agent-offer";
import type { AgentLogin } from "./agent-preflight";
import type { AgentTurn } from "./agent-turn";

export type AgentEngineId = "claude" | "spool";

export function isAgentEngineId(value: unknown): value is AgentEngineId {
	return value === "claude" || value === "spool";
}

/** An engine resolves this opaque id inside its own storage. It is never a path. */
export interface AgentSessionRef {
	readonly id: string;
}

export interface AgentOwnership {
	readonly engine: AgentEngineId;
	readonly session: AgentSessionRef;
}

/** Human input, before an integration gives it a provider's wire format. */
export interface AgentMessage {
	readonly prompt: string;
	readonly selection: string;
	readonly attachment?: Attachment;
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
 * Starting returns a turn immediately, including while a process or host is starting,
 * so the daemon can reserve the thread and accept Stop before initialization completes.
 * Answers, interruption and abandonment use AgentTurn for every engine.
 */
export interface AgentEngine {
	readonly id: AgentEngineId;
	readonly authentication: AgentAuthentication;
	close?(): void;
	prepareRename?(
		root: string,
		target: string,
		sessions: readonly AgentSessionRef[],
	): Promise<{
		token: string;
		finish(committed: boolean): Promise<void>;
	}>;
	installed(): boolean;
	account(root: string, signal?: AbortSignal): Promise<AgentLogin>;
	offer(options: EngineOfferOptions): Promise<AgentOffer>;
	/** Keep only the choice the engine confirmed, including any engine-specific pins. */
	choice(offer: AgentOffer, wanted: AgentAsk, held: AgentAsk): AgentAsk;
	start(options: EngineTurnOptions): AgentTurn;
	continuable(root: string, session: AgentSessionRef): boolean | Promise<boolean>;
}

/** Non-secret login progress. Submitted secrets belong to the engine, never the rail. */
export type AgentAuthStep =
	| AuthEvent
	| Omit<Extract<AuthPrompt, { type: "text" | "secret" | "manual_code" }>, "signal">
	| Omit<Extract<AuthPrompt, { type: "select" }>, "signal">;

export type AgentLoginProgress =
	| {
			readonly kind: "step";
			readonly id: string;
			readonly revision: number;
			readonly step: AgentAuthStep;
			readonly browser?: Extract<AuthEvent, { type: "auth_url" }>;
	  }
	| { readonly kind: "connected" }
	| { readonly kind: "cancelled" }
	| { readonly kind: "error"; readonly message: string }
	| {
			readonly kind: "waiting";
			readonly id: string;
			readonly message: string;
			readonly url?: string;
			readonly code?: string;
	  }
	| {
			readonly kind: "input";
			readonly id: string;
			readonly label: string;
			readonly secret: boolean;
			readonly choices?: readonly string[];
	  };

/** External authentication stays external; managed engines own the entire login flow. */
export type AgentAuthentication =
	| { readonly kind: "external"; readonly command: string }
	| {
			readonly kind: "managed";
			start(provider: string, method: string): Promise<AgentLoginProgress>;
			poll(id: string): Promise<AgentLoginProgress>;
			input(id: string, value: string, revision?: number): Promise<AgentLoginProgress>;
			cancel(id: string): Promise<void>;
			logout(provider: string): Promise<void>;
	  };
