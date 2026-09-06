import type { AgentPermissions } from "../settings/registry";
import { type AgentReply, answerFits } from "./agent-control";
import type { AgentLoginProgress, EngineOfferOptions, EngineTurnOptions } from "./agent-engine";
import type { AgentAsking, AgentEvent } from "./agent-events";
import type { AgentOffer } from "./agent-offer";
import type { AgentLogin } from "./agent-preflight";
import type { BundledQuestions } from "./bundled-questions";

export type BundledRequest =
	| { kind: "account" }
	| { kind: "rename-prepare"; root: string; target: string; sessions: readonly { id: string }[] }
	| { kind: "rename-finish"; token: string; committed: boolean }
	| { kind: "login"; provider: string; method: string }
	| { kind: "login-poll"; id: string }
	| { kind: "login-input"; id: string; value: string; revision?: number }
	| { kind: "login-cancel"; id: string }
	| { kind: "connect"; provider: string; key: string }
	| { kind: "disconnect"; provider: string }
	| { kind: "offer"; options: Omit<EngineOfferOptions, "signal"> }
	| { kind: "turn"; options: EngineTurnOptions }
	| { kind: "answer"; turn: string; request: string; reply: AgentReply }
	| { kind: "permissions"; turn: string; mode: AgentPermissions }
	| { kind: "stop"; turn: string }
	| { kind: "close" };
export type BundledReply = AgentLogin | AgentOffer | AgentLoginProgress | AgentPermissions | boolean | string | null;
export type HostInput = { id: string; request: BundledRequest };
export type HostOutput =
	| { kind: "reply"; id: string; value: BundledReply }
	| { kind: "error"; id: string; message: string }
	| { kind: "event"; id: string; event: AgentEvent };

/** Validate at both IPC ends, before the client consumes its request reservation. */
export function bundledAnswerFits(asking: AgentAsking, reply: AgentReply): boolean {
	if (!answerFits(asking, reply)) return false;
	if (reply.kind === "said") return reply.text.trim().length > 0;
	if (reply.kind !== "picked") return true;
	const { questions } = asking.input as BundledQuestions;
	return (
		Object.keys(reply.picks).length === questions.length &&
		questions.every((question) => question.options.some((option) => option.label === reply.picks[question.question]))
	);
}
