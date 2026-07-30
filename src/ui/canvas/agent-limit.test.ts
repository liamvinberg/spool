import { describe, expect, it } from "vitest";
import { createClaudeAdapter } from "../../daemon/agent-claude";
import type { AgentEvent, AgentLimit } from "../../daemon/agent-events";
import { CAPTURES, readCapture } from "../../test-helpers";
import { LIMIT_GRACE, LIMIT_SAYS, limitLabel, limitNote, limitReadout, resetsIn } from "./agent-limit";
import { type Stamped, transcriptOf } from "./agent-transcript";

/**
 * The usage window (#122, #199).
 *
 * The payloads are the two captures' own, verbatim: both `allowed_warning` on
 * `seven_day`, 0.92 then 0.93, resetting Wednesday 09:00 — captured on the Monday
 * evening, so ninety-two per cent of a week is gone with a day and a half of it left.
 * That is the case worth drawing and it is not a hypothetical: it is what the machine
 * this was designed on was sitting at while the session ran.
 */

/** the capture's own clock: 2026-07-27T19:01Z, so `wed 09:00` is 38 hours out */
const NOW = Date.parse("2026-07-27T19:01:13.814Z");

const WARNED: AgentLimit = {
	status: "allowed_warning",
	window: "seven_day",
	utilization: 0.92,
	resetsAt: 1785308400,
	usingOverage: false,
	surpassedThreshold: 0.75,
};

describe("the readout", () => {
	it("says nothing at all below a warning", () => {
		// measured across both captures: at `allowed` the payload carries no utilization,
		// four events in the fan-out session and every one a bare status and reset. So
		// there is no gauge to draw and no threshold for spool to pick
		expect(limitReadout({ status: "allowed", window: "seven_day", resetsAt: 1785308400 }, NOW)).toBeNull();
		// and a status nobody modelled is still not something to draw a number about
		expect(limitReadout({ status: "" }, NOW)).toBeNull();
	});

	it("is the window, the number and when it comes back", () => {
		expect(limitReadout(WARNED, NOW)).toBe("weekly limit 92% · resets wed");
		expect(limitReadout({ ...WARNED, utilization: 0.93 }, NOW)).toBe("weekly limit 93% · resets wed");
		// "hit" is the binary's own verb for this state, and also the shortest true one
		expect(limitReadout({ ...WARNED, status: "rejected", utilization: 1 }, NOW)).toBe(
			"weekly limit hit · resets wed",
		);
		// a warning with no number is a warning, and it says so rather than inventing one
		expect(limitReadout({ status: "allowed_warning", window: "five_hour" }, NOW)).toBe("approaching session limit");
	});

	it("names the window in the product's own words, and falls through rather than guessing", () => {
		// the label is not in the payload — only the key is — so this is the one piece
		// spool carries rather than reads, quoted down to the capitalisation
		expect(Object.values(LIMIT_SAYS)).toEqual([
			"session limit",
			"weekly limit",
			"Opus limit",
			"Sonnet limit",
			"Fable 5 limit",
			"usage credit limit",
		]);
		// and none of them carries a duration: nobody has to hold a clock in their head
		expect(LIMIT_SAYS.five_hour).not.toContain("five");
		expect(limitLabel("seven_day_opus")).toBe("Opus limit");
		expect(limitLabel("nine_day_fortnight")).toBe("nine_day_fortnight");
		expect(limitLabel(undefined)).toBe("usage limit");
	});

	it("says the hour inside a day and the weekday past it", () => {
		// inside a day you are still at this desk and the question is whether to wait
		expect(resetsIn(Math.floor(NOW / 1000) + 3600, NOW)).toMatch(/^\d{2}:\d{2}$/);
		// two days out the hour is noise: `wed` is the whole answer to "can I finish
		// this before then", and the six characters it costs are six the model needs
		expect(resetsIn(1785308400, NOW)).toBe("wed");
		expect(resetsIn(Math.floor(NOW / 1000) - 60, NOW)).toBe("now");
		expect(resetsIn(undefined, NOW)).toBeNull();
	});

	it("says nothing about overage, at any status", () => {
		const lines = [
			limitReadout({ ...WARNED, usingOverage: true }, NOW),
			limitReadout({ ...WARNED, status: "rejected", usingOverage: true }, NOW),
			limitReadout({ ...WARNED, window: "overage", usingOverage: true }, NOW),
		];

		// billing spool has no relationship to narrate, and it is moot anyway: if overage
		// is on then the limit is not stopping you. The window's own name is the one
		// exception, because that is the binary naming it rather than spool
		expect(lines[0]).toBe("weekly limit 92% · resets wed");
		expect(lines[1]).toBe("weekly limit hit · resets wed");
		expect(lines[2]).toBe("usage credit limit 92% · resets wed");
	});
});

describe("what the log says about it", () => {
	it("writes nothing for a warning, because nothing happened", () => {
		// measured, the status does not change across a whole session: two matched events
		// thirteen minutes apart, 92% then 93%. A rule saying "above this it happened and
		// below this it did not" would be drawn across a log at which nothing did
		expect(limitNote(null, WARNED)).toBeNull();
		expect(limitNote(WARNED, { ...WARNED, utilization: 0.93 })).toBeNull();
		// nor for a refusal: that turn ends on the wire's own ending and the menu's line
		// already reads `hit`, so a rule would be a second voice saying the same thing
		expect(limitNote(WARNED, { ...WARNED, status: "rejected" })).toBeNull();
	});

	it("writes the wind-down once, because it is why the work stops early", () => {
		const grace = { ...WARNED, status: "rejected", graceActive: true };

		// the binary injects `[Usage limit reached — grace window active. Wrap up: finish
		// or checkpoint; don't start subagents or long work.]` into the conversation, so
		// the agent is told to land what it holds and start nothing new. Without a line
		// saying so, the delegation it announced and never made reads as the agent losing
		// the thread
		expect(limitNote(WARNED, grace)).toBe(LIMIT_GRACE);
		expect(limitNote(grace, grace)).toBeNull();
		// the second half of the binary's sentence is an instruction addressed to the
		// model, and echoing it at the person it was not written for is #165's mistake
		expect(LIMIT_GRACE).not.toContain("subagents");
	});

	it("draws the wind-down as a rule and carries the window out of the fold", () => {
		const events: Stamped[] = [
			{ at: 0, event: { kind: "waiting", parent: null } },
			{ at: 100, event: { kind: "limit", limit: WARNED, parent: null } },
			{ at: 200, event: { kind: "limit", limit: { ...WARNED, graceActive: true }, parent: null } },
		];

		const { entries, limit } = transcriptOf([{ text: "go" }], events);

		expect(entries.filter((entry) => entry.kind === "note").map((entry) => entry.text)).toEqual([LIMIT_GRACE]);
		// the standing fact is not an entry, because it is not a thing that happened: it
		// was true before this turn and it will still be true after it ends
		expect(limit?.graceActive).toBe(true);
		expect(limit?.utilization).toBe(0.92);
	});

	it("is null across a session the binary said nothing about, which is most of them", () => {
		const { limit, entries } = transcriptOf([{ text: "go" }], [{ at: 0, event: { kind: "waiting", parent: null } }]);

		expect(limit).toBeNull();
		expect(entries.some((entry) => entry.kind === "note")).toBe(false);
	});
});

describe("against every capture", () => {
	it("draws no rule for the windows the recordings actually hold", () => {
		for (const capture of CAPTURES) {
			const adapter = createClaudeAdapter();
			const events: Stamped[] = [];
			for (const line of readCapture(capture)) {
				for (const event of adapter.read(JSON.stringify(line))) events.push({ at: events.length, event });
			}
			const seen = events.filter(
				(one): one is Stamped & { event: Extract<AgentEvent, { kind: "limit" }> } => one.event.kind === "limit",
			);
			const { entries, limit } = transcriptOf([{ text: "go" }], events);

			// grace was never open during any of these, so no capture writes a rule — and
			// every one that carries a window at all leaves it standing on the readout
			expect(entries.some((entry) => entry.kind === "note" && entry.text === LIMIT_GRACE)).toBe(false);
			if (seen.length === 0) expect(limit).toBeNull();
			else expect(limit).toEqual(seen.at(-1)?.event.limit);
		}
	});

	it("reads the two windows `claude-turn` carries as a matched pair", () => {
		const adapter = createClaudeAdapter();
		const limits: AgentLimit[] = [];
		for (const line of readCapture("claude-turn")) {
			for (const event of adapter.read(JSON.stringify(line))) if (event.kind === "limit") limits.push(event.limit);
		}

		expect(limits).toHaveLength(2);
		expect(limits.map((limit) => limitReadout(limit, NOW))).toEqual([
			"weekly limit 92% · resets wed",
			"weekly limit 93% · resets wed",
		]);
		// the number moves by a single point across thirteen minutes, which is what a
		// readout that updates four times an hour looks like from the inside
		expect(limits.every((limit) => limit.status === "allowed_warning")).toBe(true);
	});
});
