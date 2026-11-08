import { describe, expect, it } from "vitest";
import { ROOT_PAGE } from "../../page-path";
import { canvasTop, frameSaid, topTitle } from "./shared-top";

const frameOn = (page: string) => ({ page });

describe("where a share's canvas starts (spool#230)", () => {
	it("opens one shared folder as the top, called by its name, its frames by their own page's name", () => {
		const canvas = { pages: ["clients/scania", "clients/scania/offer"], frames: [frameOn("clients/scania/offer")] };
		const top = canvasTop(canvas, {}, true);
		expect(top.top).toBe("clients/scania");
		expect(topTitle(top)).toBe("scania");
		expect(top.tree.get("clients/scania")).toEqual(["clients/scania/offer"]);
		expect(frameSaid(top, "clients/scania/welcome")).toEqual({ place: null, name: "welcome" });
		expect(frameSaid(top, "clients/scania/offer/terms")).toEqual({ place: "offer", name: "terms" });
		// a member's canvas starts at the project's root page whatever it holds
		expect(canvasTop(canvas, {}, false).top).toBe(ROOT_PAGE);
	});

	it("sets several shared items side by side by name, a clash told apart by its parent's name", () => {
		const canvas = { pages: ["acme/checkout", "drinks", "volvo/checkout"], frames: [] };
		const top = canvasTop(canvas, { pages: { "": ["drinks"] } }, true);
		expect(top.top).toBe(ROOT_PAGE);
		expect(topTitle(top)).toBe("Shared with you");
		expect(top.tree.get(ROOT_PAGE)).toEqual(["drinks", "acme/checkout", "volvo/checkout"]);
		expect([...top.places]).toEqual([
			["acme/checkout", "acme"],
			["volvo/checkout", "volvo"],
		]);
		// one item beside frames shared on the root page is not the top: the root page holds both
		expect(canvasTop({ pages: ["drinks"], frames: [{}] }, {}, true).top).toBe(ROOT_PAGE);
	});
});
