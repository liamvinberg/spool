import { describe, expect, it } from "vitest";
import { blocksFields, fieldsFor, WALK_REASON } from "./properties-attributes";

/**
 * The rail's string fields (#260): what an element offers, and what it refuses.
 */

const names = (tag: string, attributes: Parameters<typeof fieldsFor>[1]) =>
	fieldsFor(tag, attributes).map((field) => field.name);

describe("the fields an element offers", () => {
	it("gives an image its own attributes, then the ones every element has", () => {
		expect(names("img", [])).toEqual(["src", "alt", "title", "aria-label"]);
	});

	it("gives a component only what the file actually wrote on it", () => {
		expect(names("CartRow", [{ name: "label", value: "latte" }])).toEqual(["title", "aria-label", "label"]);
	});

	it("draws a string the file holds even where no map has a place for it", () => {
		const fields = fieldsFor("div", [{ name: "role", value: "list" }]);
		expect(fields.find((field) => field.name === "role")).toEqual({ name: "role", value: "list" });
	});

	it("leaves out a handler, which is no string field however it is written", () => {
		expect(names("button", [{ name: "onClick", expression: "{() => pay()}" }])).toEqual([
			"type",
			"name",
			"value",
			"title",
			"aria-label",
		]);
	});

	it("reads the value out of the file", () => {
		const fields = fieldsFor("img", [
			{ name: "src", value: "/a.png" },
			{ name: "alt", value: "a latte" },
		]);
		expect(fields[1]).toEqual({ name: "alt", value: "a latte" });
	});

	it("names the expression where the value is not a literal", () => {
		const fields = fieldsFor("img", [{ name: "alt", expression: "{item.name}" }]);
		expect(fields.find((field) => field.name === "alt")).toEqual({
			name: "alt",
			value: "",
			expression: "{item.name}",
			reason: "alt is an expression",
		});
	});

	it("names an expression the map has no place for rather than hiding it", () => {
		const fields = fieldsFor("div", [{ name: "role", expression: "{kind}" }]);
		expect(fields.find((field) => field.name === "role")).toEqual({
			name: "role",
			value: "",
			expression: "{kind}",
			reason: "role is an expression",
		});
	});

	it("shows a walk target and never offers to write it", () => {
		const fields = fieldsFor("button", [{ name: "data-go", value: "checkout" }]);
		expect(fields.find((field) => field.name === "data-go")).toEqual({
			name: "data-go",
			value: "checkout",
			reason: WALK_REASON,
		});
	});

	it("marks an image's src a picture, because it is chosen rather than typed", () => {
		expect(fieldsFor("img", [])[0]).toEqual({ name: "src", value: "", asset: true });
		expect(fieldsFor("iframe", [])[0]?.asset).toBeUndefined();
	});
});

describe("an import off an image", () => {
	it("reads and never writes, because a string there would be a URL", () => {
		expect(fieldsFor("iframe", [{ name: "src", asset: "./hero.png" }])[0]).toEqual({
			name: "src",
			value: "./hero.png",
			specifier: "./hero.png",
			reason: "src is an import",
		});
	});
});

describe("the refusals that reach a string field", () => {
	it("greys every field where the element is not this frame's to write", () => {
		const refusal = { code: "shared-definition" as const, says: "defined in shared/ui/card.tsx:9" };
		expect(
			fieldsFor("img", [{ name: "alt", value: "a" }], refusal).every((field) => field.reason !== undefined),
		).toBe(true);
	});

	it("leaves them alone for a refusal that is about the classes", () => {
		expect(blocksFields({ code: "computed-class", says: "className is an expression" })).toBeUndefined();
		expect(blocksFields({ code: "inline-style", says: "inline style pins it" })).toBeUndefined();
	});
});

describe("a src the file writes as an import", () => {
	it("reads as the picture it draws rather than as an expression", () => {
		expect(fieldsFor("img", [{ name: "src", asset: "./hero.png" }])[0]).toEqual({
			name: "src",
			value: "./hero.png",
			specifier: "./hero.png",
			asset: true,
		});
	});
});
