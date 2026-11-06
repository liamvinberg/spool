import { describe, expect, it } from "vitest";
import { stepVisits, visit, visitsAround, visitsFrom } from "./visits";

const all = () => true;

describe("the pages visited", () => {
	it("goes back and forward as a browser does, and a new page voids forward", () => {
		let visits = visit(visit(visitsFrom(""), "explore"), "explore/checkout");
		const back = stepVisits(visits, -1, all);
		expect(back?.page).toBe("explore");
		visits = back?.visits ?? visits;
		expect(stepVisits(visits, 1, all)?.page).toBe("explore/checkout");
		visits = visit(visits, "app");
		expect(stepVisits(visits, 1, all)).toBeUndefined();
		expect(visitsAround(visits, all)).toEqual({ back: "explore" });
	});

	it("steps over a page deleted since, and has nowhere to go past the ends", () => {
		const visits = visit(visit(visitsFrom(""), "gone"), "app");
		expect(stepVisits(visits, -1, (page) => page !== "gone")?.page).toBe("");
		expect(stepVisits(visitsFrom(""), -1, all)).toBeUndefined();
		// arriving where you already are is no visit
		expect(visit(visits, "app")).toBe(visits);
	});
});
