import type { AgentLimit } from "../../daemon/agent-events";

/**
 * The usage window, and who decides which one you are looking at (#122, #199).
 *
 * Not spool, and that is the whole answer. The account has several windows in flight
 * at once and the installed binary's own table names six of them:
 *
 *   five_hour                    session limit
 *   seven_day                    weekly limit
 *   seven_day_opus               Opus limit
 *   seven_day_sonnet             Sonnet limit
 *   seven_day_overage_included   Fable 5 limit
 *   overage                      usage credit limit
 *
 * But the event carries exactly one of them, chosen two hops upstream: the API names
 * a representative claim per request, and the CLI then walks its claims and emits the
 * first one over a threshold weighted against how little of the window is left. That
 * is a burn rate rather than a level — a quarter of the week spent on its first day
 * is worth saying, ninety per cent spent on its last afternoon is not — and it is the
 * entire judgement a usage surface would otherwise have to make, already made, in a
 * table spool does not own.
 *
 * So there is nothing here to average, rank or pick. Spool renders the window it is
 * handed.
 *
 * **And it is not ambient, because the data is not.** Measured across both parent
 * captures: at `status: "allowed"` the payload carries no `utilization` at all — four
 * events in the fan-out session, every one a bare status and reset. A number exists
 * only from a warning upward, so an always-on gauge is undrawable and there is no
 * threshold for spool to choose. The event's existence is the threshold, and the
 * binary ships the one it used.
 *
 * It is sparse too: four events across 1,828 in thirteen minutes, each landing just
 * before the next request goes out. Anything drawn as a live meter would be lying
 * between updates. This is a fact that changes a few times an hour, and it is written
 * like one.
 */

export type LimitWindow =
	| "five_hour"
	| "seven_day"
	| "seven_day_opus"
	| "seven_day_sonnet"
	| "seven_day_overage_included"
	| "overage";

/**
 * What each window is called, in the product's own words.
 *
 * The same law the plan and the model menu are under: the thing that knows supplies
 * the phrasing, and the rail never invents a friendlier one. This table is the one
 * piece spool has to carry rather than read, because the label is not in the payload —
 * only the key is — so it is quoted rather than written, down to the capitalisation,
 * and a window spool has never heard of falls through to its own key rather than to a
 * guess.
 *
 * Note what is not here: a duration. `five_hour` is called "session limit", not "the
 * five-hour window", so nobody has to hold a clock in their head to read it.
 */
export const LIMIT_SAYS: Readonly<Record<LimitWindow, string>> = {
	five_hour: "session limit",
	seven_day: "weekly limit",
	seven_day_opus: "Opus limit",
	seven_day_sonnet: "Sonnet limit",
	seven_day_overage_included: "Fable 5 limit",
	overage: "usage credit limit",
};

export function limitLabel(window: string | undefined): string {
	if (window === undefined) return "usage limit";
	return LIMIT_SAYS[window as LimitWindow] ?? window;
}

/**
 * When it resets, from the unix seconds in the payload.
 *
 * The one thing on this surface that is honestly spool's own writing, because the
 * payload carries a timestamp and a timestamp has to be rendered by whoever draws it.
 *
 * Two forms, and the split is what you would do about it rather than how far away it
 * is. Inside a day it is a clock time, because you will still be at this desk and the
 * question is whether to wait. Past that it is a weekday and nothing else: two days
 * out the hour is noise, and "wed" is already the whole answer to "can I finish this
 * before then".
 */
export function resetsIn(at: number | undefined, now: number): string | null {
	if (at === undefined) return null;
	const when = new Date(at * 1000);
	const away = at * 1000 - now;
	if (away <= 0) return "now";
	if (away < 24 * 3600 * 1000) return when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
	return when.toLocaleDateString("en-GB", { weekday: "short" }).toLowerCase();
}

/**
 * The line the menu holds: `weekly limit 92% · resets wed`.
 *
 * A readout rather than the binary's sentence, the same way the model line is `Opus
 * (1M context) · high` rather than "Set model to …". The sentence has a place — it is
 * what a crossing writes into the log — but the standing fact is a fact, and "You've
 * used 92% of your" is nine words of scaffolding around the two that carry it.
 *
 * Null below a warning, which is most of a session, and that is the point: the line
 * cannot become chrome because it does not exist until there is something to say.
 * Nothing is drawn about overage — `usingOverage` and the org's own overage policy are
 * billing spool has no relationship to narrate, and it is moot anyway, since overage
 * being on means the limit is not stopping you.
 */
export function limitReadout(limit: AgentLimit, now: number): string | null {
	if (limit.status === "" || limit.status === "allowed") return null;
	const label = limitLabel(limit.window);
	const resets = resetsIn(limit.resetsAt, now);
	const tail = resets === null ? "" : ` · resets ${resets}`;
	// "hit" is the binary's own verb for this state and also the shortest true one
	if (limit.status === "rejected") return `${label} hit${tail}`;
	const used = limit.utilization === undefined ? null : Math.floor(limit.utilization * 100);
	if (used === null) return `approaching ${label}${tail}`;
	return `${label} ${used}%${tail}`;
}

/**
 * The wind-down, and the find that decided what running out looks like (#122).
 *
 * The binary carries this string and injects it into the running conversation:
 *
 *   [Usage limit reached — grace window active. Wrap up: finish or checkpoint;
 *    don't start subagents or long work.]
 *
 * So reaching a limit mid-session is a wind-down rather than a cut: the agent is told,
 * in the conversation, to land what it is holding and start nothing new. This matters
 * more than the refusal it precedes, because the moment that needs explaining is not
 * the one where nothing happens — it is the one where the agent announces a delegation
 * and then quietly does not delegate. Without a line on screen that reads as the agent
 * losing the thread; with one, it reads as the agent doing exactly what it was told.
 *
 * The words are spool's rather than the binary's, and only the first half survives: the
 * second is an instruction addressed to the model, and echoing an instruction at the
 * person it was not written for is the mistake #165 already refused to make with the
 * interruption notice.
 */
export const LIMIT_GRACE = "usage limit reached · winding down";

/**
 * What a crossing writes across the log, or null where nothing crossed.
 *
 * Only the wind-down does. A warning writes nothing: measured, the status does not
 * change across a whole session — two matched events thirteen minutes apart, 92% then
 * 93% — so the whole of that state is the standing readout, and a rule saying "above
 * this it happened, below this it did not" would be drawn across a log at which
 * nothing happened. A refusal writes nothing either, because a refused turn ends on
 * the wire's own ending and the menu's line already reads `hit`; what the rail would
 * add is a second voice saying the same thing.
 */
export function limitNote(before: AgentLimit | null, after: AgentLimit): string | null {
	return after.graceActive === true && before?.graceActive !== true ? LIMIT_GRACE : null;
}
