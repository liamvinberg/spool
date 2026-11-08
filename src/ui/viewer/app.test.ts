import { describe, expect, it } from "vitest";
import { appPlace } from "./app";

describe("appPlace", () => {
	const teams = new Set(["devosurf"]);
	it("reads a member's canvas and a people share's from their addresses, and Home's places as Home", () => {
		expect(appPlace("/devosurf/checkout/flows/pay", teams)).toEqual({
			kind: "canvas",
			config: { api: "/api/teams/devosurf/projects/checkout/canvas", path: "/devosurf/checkout" },
		});
		expect(appPlace("/shared/abc/onboarding", teams)).toEqual({
			kind: "canvas",
			config: { api: "/api/shares/abc/canvas", path: "/shared/abc" },
		});
		for (const home of ["/devosurf", "/devosurf/people", "/devosurf/settings/billing", "/shared", "/account"])
			expect(appPlace(home, teams)).toEqual({ kind: "home" });
	});

	it("leaves any other address to a page load: another team's, a team page Home doesn't hold, the account's own pages", () => {
		for (const other of ["/", "/client/checkout", "/devosurf/welcome", "/account/delete", "/sign-in"])
			expect(appPlace(other, teams)).toBeNull();
	});
});
