import { describe, expect, it } from "vitest";
import { rowFor } from "../../properties/rows";
import { classEditsOf, propertyControlValue } from "./property-controls";

/** What a row's change comes to on the wire (#315): tokens on and off, each under its scope. */
describe("classEditsOf", () => {
	it("takes a scoped spelling apart into the token and the chain it sits under", () => {
		expect(classEditsOf({ kind: "binding", tokens: ["md:hover:-mt-2", "w-[700px]"] })).toEqual([
			{ token: "-mt-2", scope: "md:hover:" },
			{ token: "w-[700px]", scope: "" },
		]);
	});

	it("carries the tokens a change takes off, and a bare removal by its family", () => {
		expect(classEditsOf({ kind: "binding", tokens: ["items-center"], removed: ["items-start"] })).toEqual([
			{ token: "items-start", scope: "", remove: true },
			{ token: "items-center", scope: "" },
		]);
		expect(classEditsOf({ kind: "remove", tokens: ["md:p-0"] })).toEqual([
			{ token: "p-0", scope: "md:", remove: true },
		]);
		// a custom value is spelled by the rail before it reaches the lane
		expect(classEditsOf({ kind: "custom", value: "15px" })).toEqual([]);
		expect(classEditsOf({ kind: "remove" })).toEqual([]);
	});
});

describe("propertyControlValue", () => {
	const at = { scoped: "p-4 items-start", theme: null };

	it("spells a length under the live scope and a removal with the family's zero", () => {
		const width = rowFor("width");
		if (width === undefined) throw new Error("no width row");
		expect(propertyControlValue(width, { kind: "value", value: "[700px]" }, at, "md:")).toEqual({
			kind: "binding",
			tokens: ["md:w-[700px]"],
		});
		expect(propertyControlValue(width, null, at, "")).toEqual({ kind: "remove", tokens: ["w-0"] });
	});
});
