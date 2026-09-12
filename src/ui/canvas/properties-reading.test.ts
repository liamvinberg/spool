import { describe, expect, it } from "vitest";
import type { CompiledTheme } from "../../daemon/theme";
import { BASE } from "./properties-scope";
import { authoredReading, type Reading } from "./properties-sections";

/**
 * The rail's two sources, merged into one reading (#323, spool-cloud#149).
 *
 * The authored column is the class literal at the stamp and nothing else; the
 * drawn column is what the frame answered with when the element was picked.
 * A row whose literal says nothing used to read as an empty field beside a
 * unit it never had, on every project whose styling is plain CSS classes.
 */

const THEME: CompiledTheme = {
	colour: [{ name: "ink", value: "#171719", from: "project" }],
	text: [{ name: "lg", value: "1.125rem", from: "default" }],
	weight: [],
	font: [],
	leading: [],
	tracking: [],
	radius: [{ name: "md", value: "0.375rem", from: "default" }],
	shadow: [],
	ease: [],
	screen: [],
	step: 4,
};

function reading(scoped: string, computed: Record<string, string> | null = null): Reading {
	return { scope: BASE, scoped, theme: THEME, computed };
}

describe("authoredReading", () => {
	it("reads a row the class literal says nothing about off the frame", () => {
		const read = authoredReading(reading("company-byline", { "font-size": "13px" }), "font-size");
		expect(read).toEqual({ tokens: [], binding: { kind: "page" }, native: "13px" });
	});

	it("has nothing to say where neither source does", () => {
		expect(authoredReading(reading("company-byline"), "font-size")).toEqual({
			tokens: [],
			binding: { kind: "page" },
		});
	});

	it("keeps the authored token beside the drawn value", () => {
		const read = authoredReading(reading("text-lg", { "font-size": "18px" }), "font-size");
		expect(read).toEqual({
			tokens: ["text-lg"],
			authored: "1.125rem",
			native: "18px",
			binding: { kind: "reference", name: "--text-lg", value: "1.125rem" },
		});
	});

	it("reads the drawn colour a stylesheet set", () => {
		expect(authoredReading(reading("company-byline", { color: "rgb(51, 51, 51)" }), "color")).toEqual({
			tokens: [],
			binding: { kind: "page" },
			native: "rgb(51, 51, 51)",
		});
	});

	it("takes a folded row's answer from any one of the sides it stands for", () => {
		const read = authoredReading(reading("p", { "border-top-left-radius": "6px" }), "border-radius");
		expect(read?.native).toBe("6px");
	});

	it("says nothing for a value that is not one: none, auto, normal", () => {
		expect(authoredReading(reading("p", { "letter-spacing": "normal" }), "letter-spacing")?.native).toBe(undefined);
		expect(authoredReading(reading("p", { "box-shadow": "none" }), "box-shadow")?.native).toBe(undefined);
	});

	it("spells a computed number the way a field would take it back", () => {
		expect(authoredReading(reading("p", { "font-size": "13.0000px" }), "font-size")?.native).toBe("13px");
		expect(authoredReading(reading("p", { "line-height": "18.200px" }), "line-height")?.native).toBe("18.2px");
	});
});
