import { describe, expect, it } from "vitest";
import { type AgentOffer, modelsOf } from "../../daemon/agent-offer";
import { readModelsReply } from "../../test-helpers";
import { EFFORT_SAYS, effortLevels, menuLongest, menuSays, modelReadout, NO_OFFER, offerOf } from "./agent-model";

/**
 * The readout and the menu's one sentence (#118, #184, #186, #199).
 *
 * The offer here is the installed binary's own `list_models` reply, captured whole. Two
 * of its five rows resolve to the identical model and the parenthetical is all that
 * tells them apart, and one of them carries no effort levels at all — which is why
 * neither the name nor the control's absence is spool's to decide.
 */

/**
 * The reply, read from the one place it is kept.
 *
 * `fixtures/claude-models.json` is the `list_models` control response captured whole:
 * two of its five rows resolve to the same model with only a parenthetical between them,
 * and one carries no effort levels at all, which is why neither the name nor the
 * control's absence is spool's to decide.
 */
const OFFERED: AgentOffer = {
	models: modelsOf(readModelsReply()),
	current: { value: "opus[1m]", resolved: "claude-opus-5[1m]", name: "Opus 5", effort: "high", pin: null },
};

const on = (current: Partial<AgentOffer["current"]>): AgentOffer => ({
	models: OFFERED.models,
	current: { ...OFFERED.current, ...current },
});

describe("the readout", () => {
	it("is the binary's own name for the machine, and its effort beside it", () => {
		expect(modelReadout(OFFERED)).toBe("Opus (1M context) · high");
		// none of the five rows is called `Opus`, and the two that resolve to the same
		// model are told apart by the parenthetical alone — so the row that was asked for
		// is the row that is named
		expect(modelReadout(on({ value: "default" }))).toBe("Default (recommended) · high");
	});

	it("drops the effort on a model that says it supports none", () => {
		// haiku carries no `supportsEffort` key at all, so absence is the signal — and the
		// line is then the name alone rather than a level nothing can move
		expect(modelReadout(on({ value: "haiku", resolved: "claude-haiku-4-5-20251001" }))).toBe("Haiku");
	});

	it("keeps the binary's own name for a machine outside the offer", () => {
		// `--model` takes a full id, so a machine the offer never listed is reachable and
		// the report is what names it. Spool composes nothing
		expect(modelReadout(on({ value: null, resolved: "claude-3-5-haiku-20241022", name: "Haiku 3.5" }))).toBe(
			"Haiku 3.5 · high",
		);
		expect(modelReadout(on({ value: null, name: null, resolved: "claude-3-5-haiku-20241022" }))).toBe(
			"claude-3-5-haiku-20241022 · high",
		);
	});

	it("says nothing at all before the binary has answered", () => {
		// the footer has a shape from the first frame and no words in it, rather than a
		// name spool guessed and then had to take back
		expect(modelReadout(NO_OFFER)).toBe("");
		expect(effortLevels(NO_OFFER)).toEqual([]);
	});
});

describe("the levels", () => {
	it("are the model's own claim about itself", () => {
		expect(effortLevels(OFFERED)).toEqual(["low", "medium", "high", "xhigh", "max"]);
		// so the control is absent rather than present and inert, which makes it a fact
		expect(effortLevels(on({ value: "haiku" }))).toEqual([]);
	});

	it("carry the binary's own sentence, and `auto` carries none", () => {
		expect(EFFORT_SAYS.xhigh).toBe("Deeper reasoning than high, just below maximum (Fable 5, Opus 4.7+, Sonnet 5)");
		expect(EFFORT_SAYS.max).toContain("Use sparingly for the hardest tasks.");
		// `/effort auto` is accepted and no model offers it, so it stays reachable by
		// typing and out of the control — including out of the sentences
		expect(EFFORT_SAYS.auto).toBeUndefined();
	});
});

describe("the one sentence", () => {
	it("describes whatever the cursor is on, out of one slot", () => {
		// a model value and an effort level cannot collide: the levels are a closed set
		// the binary names and a model value is an alias like `opus[1m]`
		expect(menuSays(OFFERED, "haiku")).toBe("Haiku 4.5 · Fastest for quick answers");
		expect(menuSays(OFFERED, "low")).toBe(EFFORT_SAYS.low);
	});

	it("is never empty, because something is always set", () => {
		// with nothing pointed at it describes the model that is set, which is the one
		// thing the menu is already asserting by highlighting a row
		expect(menuSays(OFFERED, null)).toBe("Opus 5 with 1M context · Best for everyday, complex tasks");
		// a row spool has no sentence for says nothing rather than something guessed
		expect(menuSays(OFFERED, "ultra")).toBe("");
	});

	it("says which variable holds the effort, where the effort is", () => {
		const pinned = on({ pin: "max" });

		// measured, an exported CLAUDE_CODE_EFFORT_LEVEL refuses an in-session change and
		// names itself in the refusal, so the environment outranks anything spool draws —
		// and it is the reason those rows are dead, so it answers for them
		expect(menuSays(pinned, "low")).toBe("CLAUDE_CODE_EFFORT_LEVEL=max is set in the environment");
		// and for nothing else: said for every row it would stop the slot describing what
		// the cursor is on, so on a machine with the variable set no model's own sentence
		// would ever be readable
		expect(menuSays(pinned, "haiku")).toBe("Haiku 4.5 · Fastest for quick answers");
		expect(menuSays(pinned, null)).toBe("Opus 5 with 1M context · Best for everyday, complex tasks");
	});

	it("reserves the tallest thing it can ever be made to say", () => {
		// the panel opens upward, so a slot that grew as the cursor crossed a row would
		// move the menu's own top edge — and `max` runs 165 characters against `low`'s 57
		expect(menuLongest(OFFERED)).toBe(EFFORT_SAYS.max);
		// a model with no levels has no level sentences to reserve against, so the tallest
		// is the longest model sentence in the reply — which is why the slot sits outside
		// the effort block rather than inside it
		expect(menuLongest(on({ value: "haiku" }))).toBe(
			"Fable 5 · Most capable for your hardest and longest-running tasks",
		);
	});

	it("reserves at least as much as every sentence it could be asked for", () => {
		// the property rather than the winner: whatever the cursor lands on has to fit in
		// what was reserved, or the pointer moves the thing it is pointing at
		for (const offer of [OFFERED, on({ value: "haiku" }), on({ pin: "max" }), on({ value: "haiku", pin: "max" })]) {
			const reserved = menuLongest(offer).length;
			const asked = [null, ...offer.models.map((model) => model.value), ...effortLevels(offer)];
			for (const over of asked) expect(menuSays(offer, over).length).toBeLessThanOrEqual(reserved);
		}
	});
});

describe("reading the offer off the door", () => {
	it("takes the reply whole", () => {
		expect(offerOf(OFFERED)).toEqual(OFFERED);
	});

	it("answers null for anything that is not an offer, so the footer keeps what it had", () => {
		// the far side of an HTTP door, where a daemon on another version can answer a
		// different shape. A rail that threw on it would take the whole canvas with it
		for (const body of [undefined, null, {}, [], "sonnet", { models: "sonnet" }]) {
			expect(offerOf(body)).toBeNull();
		}
	});

	it("reads an empty offer as an empty offer, which is not the same fact", () => {
		// there is no binary to ask, which is #201's state: the menu opens with nothing
		// to pick rather than the readout going stale
		expect(offerOf({ models: [], current: { value: null, effort: "max", pin: "max" } })).toEqual({
			models: [],
			current: { value: null, resolved: null, name: null, effort: "max", pin: "max" },
		});
	});

	it("drops a row that is not a row, and an empty string is not a value", () => {
		const read = offerOf({ models: [{ value: "sonnet" }, "nope", null], current: { value: "" } });

		expect(read?.models).toHaveLength(1);
		expect(read?.current.value).toBeNull();
	});
});
