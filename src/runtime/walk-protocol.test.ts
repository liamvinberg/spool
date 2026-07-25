import { describe, expect, it } from "vitest";
import { parseWalkDecision, walkAccepted, walkRejected } from "./walk-protocol";

describe("canvas walk decision protocol", () => {
	it("accepts only an exact decision with a positive safe id", () => {
		const decision = walkRejected("landing", 73, "inactive");

		expect(parseWalkDecision(decision)).toEqual(decision);
		expect(parseWalkDecision(walkAccepted("landing", Number.MAX_SAFE_INTEGER))).toEqual(
			walkAccepted("landing", Number.MAX_SAFE_INTEGER),
		);
		expect(parseWalkDecision({ ...decision, extra: true })).toBeUndefined();
		expect(parseWalkDecision({ ...decision, id: 0 })).toBeUndefined();
		expect(parseWalkDecision({ ...decision, id: Number.MAX_SAFE_INTEGER + 1 })).toBeUndefined();
		expect(parseWalkDecision({ ...decision, frame: null })).toBeUndefined();
		expect(parseWalkDecision({ ...decision, accepted: "false" })).toBeUndefined();
		expect(parseWalkDecision({ ...decision, reason: "unknown" })).toBeUndefined();
		expect(parseWalkDecision({ ...walkAccepted("landing", 73), reason: "inactive" })).toBeUndefined();
	});
});
