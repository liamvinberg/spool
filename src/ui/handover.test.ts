import { describe, expect, it } from "vitest";
import { handedOver, handoverAddress } from "./handover";

describe("a team project handed over from spool.page", () => {
	it("goes to Home on this Mac's daemon with the project named", () => {
		const address = handoverAddress({ team: "devosurf", project: "checkout" });
		expect(address).toBe("http://127.0.0.1:7766/?open=devosurf%2Fcheckout");
		expect(handedOver(new URL(address).search)).toEqual({ team: "devosurf", project: "checkout" });
	});

	it("names nothing that isn't a team and a project", () => {
		for (const search of [
			"",
			"?open=",
			"?open=devosurf",
			"?open=devosurf/checkout/home",
			"?open=../etc",
			"?open=A/b",
		])
			expect(handedOver(search), search).toBeNull();
	});
});
