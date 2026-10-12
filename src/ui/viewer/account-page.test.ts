import { describe, expect, it } from "vitest";
import { day, teamsLine } from "./account-page";

describe("the account page's words", () => {
	it("names the teams the account is in, or says there are none", () => {
		expect(teamsLine([])).toBe("Not in a team yet.");
		expect(teamsLine(["Tidemark"])).toBe("In Tidemark.");
		expect(teamsLine(["Tidemark", "Northlight", "Client Co"])).toBe("In Tidemark, Northlight and Client Co.");
	});

	it("says a day as people do: today, yesterday, then the date, with the year only when it isn't this one", () => {
		const now = new Date(2026, 9, 12, 15).getTime() / 1000;
		expect(day(new Date(2026, 9, 12, 1).getTime() / 1000, now)).toBe("today");
		expect(day(new Date(2026, 9, 11, 23).getTime() / 1000, now)).toBe("yesterday");
		expect(day(new Date(2026, 9, 8, 12).getTime() / 1000, now)).toMatch(/^8 Oct$/u);
		expect(day(new Date(2025, 11, 30, 12).getTime() / 1000, now)).toMatch(/^30 Dec 2025$/u);
	});
});
