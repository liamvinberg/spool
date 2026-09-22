import { describe, expect, it } from "vitest";
import { frameHolding, frameOf, nameOf } from "./agent-nouns";

/**
 * A frame is named by its path under frames/ (#336), so the noun a path gives is
 * that path, whatever page the frame sits on.
 */
describe("frameOf", () => {
	it("names a frame by its whole path under frames/", () => {
		expect(frameOf("/p/design/frames/home/frame.tsx")).toBe("home");
		expect(frameOf("/p/design/frames/shop/checkout/frame.tsx")).toBe("shop/checkout");
		expect(frameOf("design/frames/explorations/chat/intro/frame.json")).toBe("explorations/chat/intro");
	});

	it("reads a folder straight under frames/ as no frame at all", () => {
		expect(frameOf("/p/design/frames/shop")).toBeNull();
		expect(frameOf("/p/design/shared/tokens.css")).toBeNull();
	});

	it("reads a verify shot's one segment back into the frame it stands for", () => {
		expect(frameOf("/p/design/.spool/verify/home.png")).toBe("home");
		expect(frameOf("/p/design/.spool/verify/shop%2Fcheckout.png")).toBe("shop/checkout");
		expect(frameOf("/p/design/.spool/verify/%E0%A4%A.png")).toBeNull();
	});
});

describe("frameHolding", () => {
	const known = new Set(["home", "shop/checkout"]);

	it("finds the frame a subfolder sits inside", () => {
		expect(frameHolding("shop/checkout/parts", known)).toBe("shop/checkout");
		expect(frameHolding("shop/checkout", known)).toBe("shop/checkout");
	});

	it("leaves a folder inside no known frame as it was read", () => {
		expect(frameHolding("shop/cart", known)).toBe("shop/cart");
		expect(frameHolding("shop/cart", known, new Set(["shop/cart"]))).toBe("shop/cart");
	});
});

describe("nameOf", () => {
	it("says a frame, a place and a file each the way the rail prints it", () => {
		expect(nameOf("/p/design/frames/shop/checkout/frame.tsx")).toBe("shop/checkout");
		expect(nameOf("/p/design/frames/shop")).toBe("shop");
		expect(nameOf("/p/design/shared/tokens.css")).toBe("tokens.css");
	});
});
