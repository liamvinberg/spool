import type { AgentPermissions } from "../settings/registry";
import type { AgentReply } from "./agent-control";
import type { EngineOfferOptions, EngineTurnOptions } from "./agent-engine";
import type { AgentEvent } from "./agent-events";
import type { AgentOffer } from "./agent-offer";
import type { AgentLogin } from "./agent-preflight";

export type BundledRequest =
	| { kind: "account" }
	| { kind: "connect"; provider: string; key: string }
	| { kind: "disconnect"; provider: string }
	| { kind: "offer"; options: Omit<EngineOfferOptions, "signal"> }
	| { kind: "turn"; options: EngineTurnOptions }
	| { kind: "answer"; turn: string; request: string; reply: AgentReply }
	| { kind: "permissions"; turn: string; mode: AgentPermissions }
	| { kind: "stop"; turn: string }
	| { kind: "close" };
export type BundledReply = AgentLogin | AgentOffer | AgentPermissions | boolean | null;
export type HostInput = { id: string; request: BundledRequest };
export type HostOutput =
	| { kind: "reply"; id: string; value: BundledReply }
	| { kind: "error"; id: string; message: string }
	| { kind: "event"; id: string; event: AgentEvent };
