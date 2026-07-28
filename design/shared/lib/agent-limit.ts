import { useCallback, useEffect, useState } from "react";
import type { PlayEntry } from "./turn-play";

/**
 * The usage window, and who decides which one you are looking at.
 *
 * Not Spool, and this is the whole answer to the question the ticket asks. The
 * account has several windows in flight at once — the installed binary's own
 * table names six of them:
 *
 *   five_hour                    session limit
 *   seven_day                    weekly limit
 *   seven_day_opus               Opus limit
 *   seven_day_sonnet             Sonnet limit
 *   seven_day_overage_included   Fable 5 limit
 *   overage                      usage credit limit
 *
 * But `rate_limit_event` carries exactly one `rateLimitType`, and the choice is
 * made two hops upstream. The API answers every request with a set of
 * `anthropic-ratelimit-unified-<claim>-utilization` / `-reset` headers plus a
 * `-representative-claim` naming the one that speaks for the account. The CLI
 * then walks its claims in order and emits the **first** one carrying a
 * `-surpassed-threshold` header; failing that, the first whose utilization has
 * crossed a threshold *for how little of the window is left*. That second test is
 * the interesting one: 92% used is alarming with a day and a half of the week to
 * go and unremarkable with twenty minutes to go, and the binary already weighs
 * both before it says anything.
 *
 * So there is nothing to average, nothing to rank and nothing to pick. Spool
 * renders the window it is handed. A surface that drew "the five-hour window"
 * would be naming one of six; a surface that drew all six would be inventing five
 * of them, because five of them never arrive.
 *
 * **And it is not ambient, because the data is not.** Measured across both parent
 * captures: at `status: "allowed"` the payload carries no `utilization` at all —
 * four events in the fan-out session, every one of them a bare
 * `{status, resetsAt, rateLimitType}`. A number exists only from
 * `allowed_warning` upward. A permanent percentage readout would therefore be
 * blank for most of every session, which settles the ambient-versus-threshold
 * question without anyone choosing: there is no threshold for Spool to pick and
 * no gauge for Spool to draw. The event's existence *is* the threshold, and the
 * binary ships the one it used in `surpassedThreshold` (0.75 in the capture).
 *
 * It is also sparse. Four events across 1828 in thirteen minutes and sixty-one
 * turns, each landing on a `message_stop` just before the next request goes out.
 * Anything drawn as a live meter would be lying between updates. This is a fact
 * that changes a few times an hour, so it is written like one.
 */

/** three, and the third is the one nobody has captured */
export type LimitStatus = "allowed" | "allowed_warning" | "rejected";

export type LimitWindow =
	| "five_hour"
	| "seven_day"
	| "seven_day_opus"
	| "seven_day_sonnet"
	| "seven_day_overage_included"
	| "overage";

/**
 * `rate_limit_info`, exactly as the two captures carry it.
 *
 * Optional where the payload omits rather than falsifies. `utilization` and
 * `surpassedThreshold` are absent below a warning; `overageStatus` and
 * `overageDisabledReason` appear only where an org has taken a position on
 * overage.
 */
export interface RateLimitInfo {
	readonly status: LimitStatus;
	readonly rateLimitType?: LimitWindow;
	readonly utilization?: number;
	/** unix seconds */
	readonly resetsAt?: number;
	readonly isUsingOverage: boolean;
	readonly surpassedThreshold?: number;
	readonly overageStatus?: string;
	readonly overageDisabledReason?: string;
}

/**
 * What each window is called, in the product's own words.
 *
 * The same law the todos and the model menu are under: the thing that knows
 * supplies the phrasing, and the rail never invents a friendlier one. This table
 * is the one piece Spool has to carry rather than read, because the label is not
 * in the payload — only the key is. So it is quoted rather than written, down to
 * the capitalisation, and a window Spool has never heard of falls through to its
 * own key rather than to a guess.
 *
 * Note what is *not* here: a duration. `five_hour` is called "session limit", not
 * "the five-hour window". Nobody has to hold a clock in their head to read it.
 */
export const LIMIT_SAYS: Readonly<Record<LimitWindow, string>> = {
	five_hour: "session limit",
	seven_day: "weekly limit",
	seven_day_opus: "Opus limit",
	seven_day_sonnet: "Sonnet limit",
	seven_day_overage_included: "Fable 5 limit",
	overage: "usage credit limit",
};

export function limitLabel(window: LimitWindow | undefined): string {
	if (window === undefined) return "usage limit";
	return LIMIT_SAYS[window] ?? window;
}

/**
 * When it resets, from the unix seconds in the payload.
 *
 * The one thing on this surface that is honestly Spool's own writing, because the
 * payload carries a timestamp and a timestamp has to be rendered by whoever draws
 * it.
 *
 * Two forms, and the split is what you would do about it rather than how far away
 * it is. Inside a day it is a clock time, because you will still be at this desk
 * and the question is whether to wait. Past that it is a weekday and nothing
 * else: two days out, the hour is noise — "wed" is already the whole answer to
 * "can I finish this before then", and the six characters it costs are six the
 * model beside it needs.
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
 * The footer's one line: `weekly limit 92% · resets wed`.
 *
 * A readout rather than the binary's sentence, the same way the model line is
 * `Opus (1M context) · high` rather than "Set model to …". The sentence has a
 * place — it is what a crossing writes into the log — but the standing fact has
 * to share eighteen pixels with which model is answering, and "You've used 92% of
 * your" is nine words of scaffolding around the two that carry it.
 *
 * Null below a warning, which is most of the time, and that is the point: the
 * line cannot become chrome because it does not exist until there is something to
 * say.
 */
export function limitReadout(info: RateLimitInfo, now: number): string | null {
	if (info.status === "allowed") return null;
	const label = limitLabel(info.rateLimitType);
	const resets = resetsIn(info.resetsAt, now);
	const tail = resets === null ? "" : ` · resets ${resets}`;
	// "hit" is the binary's own verb for this state, and it is also the shortest
	// true one: the eighteen pixels are shared with the model, and at 420px the
	// rail has room for the fact or for a longer word about it, not both
	if (info.status === "rejected") return `${label} hit${tail}`;
	const used = info.utilization === undefined ? null : Math.floor(info.utilization * 100);
	if (used === null) return `approaching ${label}${tail}`;
	return `${label} ${used}%${tail}`;
}

/**
 * The sentence, as the binary writes it.
 *
 * Reconstructed from the installed CLI rather than composed here: the warning is
 * `You've used ${pct}% of your ${label} · resets ${when}`, falling back to
 * `Approaching ${label} · resets ${when}` where the payload carried no number,
 * and the refusal is `You've hit your ${label}`. This is what lands in the log at
 * the moment the status changes, and only then — the binary's own telemetry fires
 * on a status transition and nothing else, and so does this.
 */
export function limitSentence(info: RateLimitInfo, now: number): string {
	const label = limitLabel(info.rateLimitType);
	const resets = resetsIn(info.resetsAt, now);
	const tail = resets === null ? "" : ` · resets ${resets}`;
	if (info.status === "rejected") return `You've hit your ${label}${tail}`;
	const used = info.utilization === undefined ? null : Math.floor(info.utilization * 100);
	if (used === null) return `Approaching ${label}${tail}`;
	return `You've used ${used}% of your ${label}${tail}`;
}

/**
 * The binary's own remedy, and the reason this belongs in the composer footer.
 *
 * At a weekly limit the CLI's subline is `try /model sonnet · ~2× runway` on
 * Opus, `try /model opus · more runway` on Fable, and `try /effort medium` at
 * high effort or above. At refusal it is `Switch models to keep working.` — that
 * is the product's own answer to running out, and it is a model switch every
 * time.
 *
 * The CLI has to write it as a sentence because its composer has no control to
 * point at. Spool's does: #118 put the model and its effort in the same eighteen
 * pixels this readout wants. So the recommended surface renders no advice at all
 * — the fact sits next to the lever, and the lever is already a menu.
 */
export const LIMIT_SUBLINE = "Switch models to keep working.";

export function limitLever(info: RateLimitInfo, model: string, effort: string): string | null {
	if (info.rateLimitType !== "seven_day") return null;
	if (model.includes("fable")) return "try /model opus · more runway";
	if (model.includes("opus")) return "try /model sonnet · ~2× runway";
	if (effort === "high" || effort === "xhigh" || effort === "max") return "try /effort medium";
	return null;
}

/* ---------- what the capture holds ---------- */

/**
 * The two events in `claude-turn`, verbatim, and the clock they arrived on.
 *
 * Both are `allowed_warning` on `seven_day`, 0.92 then 0.93, resetting Wednesday
 * 09:00 — captured on the Monday evening, so ninety-two per cent of a week is
 * gone with a day and a half of it left. That is the case worth drawing, and it
 * is not a hypothetical: it is what the machine this was designed on was actually
 * sitting at while the design session ran.
 *
 * Two things follow from them being a matched pair. The status never changes
 * across the session, so nothing is ever written into the log — the whole of it
 * is the standing readout. And the number moves by a single point over thirteen
 * minutes, which is what a readout that updates four times an hour looks like
 * from the inside.
 */
export const WARNED: RateLimitInfo = {
	status: "allowed_warning",
	resetsAt: 1785308400,
	rateLimitType: "seven_day",
	utilization: 0.92,
	isUsingOverage: false,
	surpassedThreshold: 0.75,
};

export const WARNED_AGAIN: RateLimitInfo = { ...WARNED, utilization: 0.93 };

/**
 * The refusal, which is drawn rather than captured, and says so.
 *
 * Neither parent capture contains a `rejected` event, because reaching one means
 * spending a week's allowance to take a screenshot. What is not invented is its
 * shape: `status: "rejected"` is one of the three values the binary's header
 * parser produces, and `You've hit your ${label}` and `Switch models to keep
 * working.` are its own strings for that state. The payload below is those facts
 * with the capture's own window and reset time carried over.
 */
export const REFUSED: RateLimitInfo = { ...WARNED, status: "rejected", utilization: 1 };

/** the capture's own clock: 2026-07-27T19:01Z, so "wed 09:00" is 38 hours out */
export const CAPTURED_NOW = Date.parse("2026-07-27T19:01:13.814Z");

/* ---------- playing it ---------- */

/** how long after the send the second event lands, on the capture's own pace */
const SECOND_AT = 4200;

/** the measured median ttft, so a refusal arrives when the first token would have */
const REFUSE_AT = 1569;

export interface LimitDeck {
	readonly info: RateLimitInfo;
	/** the crossing, when there is one; empty for the whole captured session */
	readonly notes: readonly PlayEntry[];
	/** true when the send went nowhere, so the caller must not start a turn */
	readonly say: (text: string) => boolean;
}

/**
 * The two captured events, played on the turn's clock.
 *
 * The readout is already there before the first send, because the fact is: it
 * came back on the message before this one and it will still be true tomorrow.
 * All the turn does is move it a point.
 */
export function useLimit(run: number, hits = false): LimitDeck {
	const [info, setInfo] = useState<RateLimitInfo>(WARNED);
	const [notes, setNotes] = useState<readonly PlayEntry[]>([]);

	useEffect(() => {
		if (run === 0) return;
		const timers = [window.setTimeout(() => setInfo(WARNED_AGAIN), SECOND_AT)];
		if (hits) {
			timers.push(
				window.setTimeout(() => {
					setInfo(REFUSED);
					setNotes([
						{ key: "limit-rule", kind: "note", text: limitSentence(REFUSED, CAPTURED_NOW), rule: true },
						{ key: "limit-say", kind: "note", text: LIMIT_SUBLINE },
					]);
				}, SECOND_AT + 900),
			);
		}
		return () => {
			for (const timer of timers) window.clearTimeout(timer);
		};
	}, [run, hits]);

	/**
	 * Once it has refused, a send does not become a turn.
	 *
	 * The line still goes into the log in the human's own voice, because they said
	 * it and pretending otherwise loses what they were mid-way through asking for.
	 * What it does not do is start a request that comes back the same way.
	 *
	 * It still takes a second, and it has to. Nothing local knows the window is
	 * still shut — a limit resets on a clock nobody here is holding — so the only
	 * way to find out is to ask, and the refusal arrives on the beat the first
	 * token would have.
	 */
	const say = useCallback(
		(text: string): boolean => {
			if (info.status !== "rejected") return false;
			setNotes((prev) => [...prev, { key: `limit-said-${prev.length}`, kind: "user", text }]);
			window.setTimeout(() => {
				setNotes((prev) => [
					...prev,
					{ key: `limit-again-${prev.length}`, kind: "note", text: limitSentence(info, CAPTURED_NOW) },
				]);
			}, REFUSE_AT);
			return true;
		},
		[info],
	);

	return { info, notes, say };
}
