import { describe, expect, it } from "vitest";
import { readinessProblems } from "./player-publication-client";

const site = { code: "navigation-unreadable", message: "Cannot be read.", remedy: "Declare links." };

describe("readiness problems", () => {
	it("lists every problem once, where it is, with the frames that reach it", () => {
		expect(
			readinessProblems([
				{ ...site, frame: "shop/cart", path: "shared/ui/nav.tsx", line: 12 },
				{ ...site, frame: "shop/checkout", path: "shared/ui/nav.tsx", line: 12 },
				{ ...site, frame: "shop/cart", path: "frames/shop/cart/frame.tsx", line: 4 },
				{ code: "entry-missing", frame: "gone", message: "Missing.", remedy: "Choose another." },
			]),
		).toMatchObject([
			{ ...site, location: "shared/ui/nav.tsx:12", frames: ["shop/cart", "shop/checkout"] },
			{ ...site, location: "frames/shop/cart/frame.tsx:4", frames: ["shop/cart"] },
			{ code: "entry-missing", message: "Missing.", remedy: "Choose another.", frames: ["gone"] },
		]);
	});
});
