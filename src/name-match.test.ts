import { describe, expect, it } from "vitest";
import { charWeights, matchName, runsIn } from "./name-match";

const score = (query: string, name: string): number => matchName(query, name)?.score ?? Number.NEGATIVE_INFINITY;

describe("matchName", () => {
	it("finds nothing when the query is not a subsequence", () => {
		expect(matchName("zz", "gym-brute")).toBeNull();
	});

	it("scores a whole segment above letters scavenged across the name", () => {
		expect(score("brute", "gym-brute")).toBeGreaterThan(score("brute", "bookmark-router-tests"));
	});

	it("reads the same word however the machine spells the seam", () => {
		expect(score("brute", "gym_brute_api")).toBe(score("brute", "gym-brute-api"));
		expect(score("brute", "gym.brute.api")).toBe(score("brute", "gym-brute-api"));
		expect(score("sessions", "spool/sessions")).toBe(score("sessions", "spool-sessions"));
	});

	it("lets an exact name outrank the names it prefixes", () => {
		expect(score("gym-brute", "gym-brute")).toBeGreaterThan(score("gym-brute", "gym-brute-sketch"));
	});

	it("says where the query landed", () => {
		expect(matchName("gymbrute", "gym-brute")?.matched).toEqual([0, 1, 2, 4, 5, 6, 7, 8]);
	});

	it("drops a coincidence that spent more on skips than it earned on hits", () => {
		// `gb` is spellable out of `gym-brute` and was never what anybody typed it for
		expect(matchName("gb", "gym-brute")).toBeNull();
		expect(matchName("", "gym-brute")).toBeNull();
	});
});

describe("charWeights", () => {
	it("dims only the run-up before the first landing", () => {
		expect(charWeights("ab-cd", [3])).toEqual(["runup", "runup", "runup", "hit", "plain"]);
	});
});

describe("runsIn", () => {
	it("collapses neighbours of one weight into a single span", () => {
		expect(runsIn("ab-cd", charWeights("ab-cd", [3]))).toEqual([
			{ text: "ab-", weight: "runup", at: 0 },
			{ text: "c", weight: "hit", at: 3 },
			{ text: "d", weight: "plain", at: 4 },
		]);
	});
});
