import { describe, expect, it } from "vitest";
import { Fragment, jsxDEV } from "./jsx-dev-runtime";

/**
 * The stamping runtime (#23): intrinsic elements pick up their compile-time
 * source triple as data-spool-source; components and unstamped calls pass
 * through untouched. Elements land as real React elements — the pinned
 * production jsx runtime does the creating.
 */

const source = { fileName: "frames/cart/frame.tsx", lineNumber: 4, columnNumber: 4 };

interface ElementLike {
	type: unknown;
	props: Record<string, unknown>;
}

describe("jsxDEV", () => {
	it("stamps intrinsic elements with fileName:line:column", () => {
		const el = jsxDEV("button", { className: "pay", children: "Pay now" }, undefined, false, source) as ElementLike;
		expect(el.type).toBe("button");
		expect(el.props["data-spool-source"]).toBe("frames/cart/frame.tsx:4:4");
		expect(el.props.className).toBe("pay");
	});

	it("never stamps components — their own DOM stamps where it is authored", () => {
		const Card = () => null;
		const el = jsxDEV(Card, { children: "x" }, undefined, false, source) as ElementLike;
		expect(el.props["data-spool-source"]).toBeUndefined();
	});

	it("passes through without a source triple", () => {
		const el = jsxDEV("div", { children: "x" }, undefined, false, undefined) as ElementLike;
		expect(el.props["data-spool-source"]).toBeUndefined();
	});

	it("handles static children and fragments", () => {
		const el = jsxDEV(
			"ul",
			{ children: [jsxDEV("li", { children: "a" }, "a", false, source)] },
			undefined,
			true,
			source,
		) as ElementLike;
		expect(el.props["data-spool-source"]).toBe("frames/cart/frame.tsx:4:4");
		const frag = jsxDEV(Fragment, { children: "x" }, undefined, false, source) as ElementLike;
		expect(frag.props["data-spool-source"]).toBeUndefined();
	});
});
