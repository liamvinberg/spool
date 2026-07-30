import type { AgentAsking, AgentGrant } from "./agent-events";

/**
 * The channel back: what spool says to a request the binary is waiting on (#121,
 * #145).
 *
 * A turn is not one-way. The binary asks before it runs anything the fence has not
 * already made quiet, and it asks again when the agent itself has a question — both
 * down the same `can_use_tool` request, told apart by a flag. Until something
 * answers, the turn is parked: not thinking, not spending, not moving.
 *
 * Everything here is one pure function of a request and an answer. The turn owns the
 * writing and the waiting; this owns the words, which are the binary's own and never
 * spool's invention.
 */

/**
 * What the person said, as the daemon receives it.
 *
 * Five, because they are five different sentences to the agent and not five names
 * for one: an allow lets the call through, an always lets this shape of call through
 * for the rest of the thread, a deny stops the agent and tells it to wait, picked
 * answers the question with the agent's own options, and said answers it in the
 * person's own words — which the tool tests first and rewards with the stronger
 * instruction.
 */
export type AgentReply =
	| { readonly kind: "allow" }
	| { readonly kind: "always" }
	| { readonly kind: "deny" }
	| { readonly kind: "said"; readonly text: string }
	| { readonly kind: "picked"; readonly picks: Readonly<Record<string, string>> };

/**
 * Whether this answer is one this request can take (#145, #162).
 *
 * The channel is shared and the vocabularies are not. Words answer a question, where
 * they become the response the tool tests before the picked ones; there is no sentence
 * that answers "may I run this", and letting one through would allow the call and
 * carry the words along as a spare argument — the opposite of what somebody typing
 * "wait, don't" meant. The other way round, allowing a question with its arguments
 * untouched is the empty answer, which lands the agent on the weakest of the tool's
 * replies and is the one thing spool never submits.
 *
 * A deny is the only answer both take, because refusing is refusing.
 */
export function answerFits(asking: AgentAsking, reply: AgentReply): boolean {
	if (reply.kind === "deny") return true;
	return asking.interaction === (reply.kind === "said" || reply.kind === "picked");
}

/**
 * One answer off the wire, or nothing where it was not one.
 *
 * The wire carries the reply as it is written above rather than as a flattened body,
 * so the daemon, the client and this module all say it the same way and there is no
 * second vocabulary to keep in step.
 *
 * Nothing is defaulted. A `said` with no words and a `picked` with no picks are both
 * an answer that lost its content on the way, and answering the agent with an empty
 * one would be spool putting words in somebody's mouth — which is the one thing it
 * never does.
 */
export function parseAgentReply(raw: unknown): AgentReply | undefined {
	if (typeof raw !== "object" || raw === null) return undefined;
	const reply = raw as { kind?: unknown; text?: unknown; picks?: unknown };
	if (reply.kind === "allow" || reply.kind === "always" || reply.kind === "deny") return { kind: reply.kind };
	if (reply.kind === "said") {
		return typeof reply.text === "string" && reply.text.trim() !== ""
			? { kind: "said", text: reply.text }
			: undefined;
	}
	if (reply.kind !== "picked") return undefined;
	const picks = reply.picks;
	if (typeof picks !== "object" || picks === null || Array.isArray(picks)) return undefined;
	const chosen: Record<string, string> = {};
	for (const [question, label] of Object.entries(picks as Record<string, unknown>)) {
		if (typeof label !== "string") return undefined;
		chosen[question] = label;
	}
	return Object.keys(chosen).length === 0 ? undefined : { kind: "picked", picks: chosen };
}

/** the person's own words, where the answer was words rather than a decision */
export function wordsOf(reply: AgentReply): string | null {
	if (reply.kind === "said") return reply.text;
	if (reply.kind === "picked") return Object.values(reply.picks).join(", ");
	return null;
}

/**
 * Where an "always" grant lives, and the whole of why it is not a promise.
 *
 * The complaint an "always" answers is repetition, not a missing permanent grant, so
 * the rule goes where the thread is and nowhere else. This value is the binary's own
 * name for that scope, and it is the one destination it will not write to a file —
 * the three it does write are the settings files spool must never edit on somebody's
 * behalf.
 */
const THREAD_SCOPE = "session";

/**
 * One suggested rule, moved to the thread's own scope.
 *
 * The request suggests `localSettings`, because the binary is describing what its own
 * interactive prompt would offer. Spool takes the rule and refuses the destination:
 * the rule is the binary's language and the scope is spool's decision.
 */
const forThisThread = (grant: AgentGrant): AgentGrant => ({ ...grant, destination: THREAD_SCOPE });

/** whatever the tool was called with, as a record the answer can add a field to */
const argumentsOf = (input: unknown): Record<string, unknown> =>
	typeof input === "object" && input !== null && !Array.isArray(input)
		? { ...(input as Record<string, unknown>) }
		: {};

/**
 * The answer, in the shape the binary reads it in.
 *
 * `updatedInput` replaces the call's arguments rather than merging into them, which
 * is why both question answers rebuild the whole input around the one field they
 * add. `decisionClassification` is the binary's own three-way reading of who decided
 * and how permanently; an always is `user_temporary` like an allow, because it is
 * temporary — it dies with the thread.
 *
 * A deny carries an empty message on purpose. The field is required, and anything in
 * it is quoted to the agent as what the person said; empty is the wordless refusal
 * that lands it on the binary's own instruction to stop and wait.
 */
export function answerPayload(asking: AgentAsking, reply: AgentReply): Record<string, unknown> {
	switch (reply.kind) {
		case "allow":
			return { behavior: "allow", decisionClassification: "user_temporary" };
		case "always":
			return {
				behavior: "allow",
				decisionClassification: "user_temporary",
				// nothing to grant is an allow and says so, rather than an empty grant that
				// would read as a rule the next call could match
				...(asking.suggestions.length === 0 ? {} : { updatedPermissions: asking.suggestions.map(forThisThread) }),
			};
		case "deny":
			return { behavior: "deny", message: "", decisionClassification: "user_reject" };
		case "said":
			return {
				behavior: "allow",
				decisionClassification: "user_temporary",
				updatedInput: { ...argumentsOf(asking.input), response: reply.text },
			};
		case "picked":
			return {
				behavior: "allow",
				decisionClassification: "user_temporary",
				updatedInput: { ...argumentsOf(asking.input), answers: { ...reply.picks } },
			};
	}
}

/**
 * A connector's own question, declined (#145).
 *
 * `decline` is the protocol's own word and it is not `cancel`: cancel says the person
 * walked away from a form they were shown, and decline says there was never a form.
 * Nobody is asked, because the words are a server's rather than the agent's and its
 * schema is an unbounded one spool has no surface for.
 */
export const DECLINED = { action: "decline" } as const;

/** one control response, as the line the binary reads off stdin */
export function controlResponseLine(request: string, response: unknown): string {
	return `${JSON.stringify({ type: "control_response", response: { subtype: "success", request_id: request, response } })}\n`;
}

/**
 * The way out of a turn that is already running (#165).
 *
 * It goes the other way down the same stdin an answer does, and it is the one thing
 * spool asks the binary for rather than answers. A request rather than a kill: the
 * process survives it, finishes what it was in the middle of writing, and emits a
 * clean `result` carrying `terminal_reason: "aborted_streaming"` — so nothing is torn
 * and the log ends by saying what happened.
 *
 * The capture answers it with `{still_queued: []}`, the uuids of queued messages that
 * outlive the abort, and it is always empty because spool holds its own queue rather
 * than filling the binary's (#170). Nothing else rides here: the request's own
 * `cancel_queued` flag exists for a queue spool never puts anything in, so setting it
 * would be spool declaring an intent about a list that does not exist.
 */
export function interruptRequestLine(request: string): string {
	return `${JSON.stringify({ type: "control_request", request_id: request, request: { subtype: "interrupt" } })}\n`;
}
