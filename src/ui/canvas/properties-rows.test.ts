import { describe, expect, it } from "vitest";
import { type ClassTheme, writeClass } from "../../daemon/class-write";
import type { CompiledTheme } from "../api";
import { LENGTHS, NUMERIC_SET, TOGGLE_SETS, WORDS, type Word } from "./properties-families";
import {
	editsFor,
	optionsFor,
	ROWS,
	type Row,
	type RowElement,
	readRow,
	rowFor,
	sidesOf,
	unlinkTo,
	verdictFor,
} from "./properties-rows";

/**
 * The property model (#257): every family resolves to a primitive and a rule,
 * and every row can be created, edited, removed and unlinked to an arbitrary
 * value — or it refuses with a reason that traces back to here.
 *
 * The theme below is kaffe's, which is the point of most of these: a type
 * scale it named itself, a colour Tailwind has never heard of, and a radius
 * scale that disagrees with Tailwind's on the same words.
 */
const theme: CompiledTheme = {
	colour: [
		{ name: "thread", value: "#F5391A", from: "project" },
		{ name: "muted", value: "#8E8C88", from: "project" },
		{ name: "bg", value: "#0E0E0E", from: "project" },
		{ name: "border", value: "#262626", from: "project" },
		{ name: "red-500", value: "oklch(63.7% 0.237 25.331)", from: "default" },
		{ name: "white", value: "#fff", from: "default" },
	],
	text: [
		{ name: "2xs", value: "10px", from: "project" },
		{ name: "base", value: "13px", from: "project" },
		{ name: "md", value: "14px", from: "project" },
		{ name: "xl", value: "1.25rem", from: "default" },
	],
	weight: [
		{ name: "medium", value: "500", from: "project" },
		{ name: "bold", value: "700", from: "default" },
	],
	font: [
		{ name: "sans", value: "Familjen Grotesk", from: "project" },
		{ name: "mono", value: "Fragment Mono", from: "project" },
	],
	leading: [
		{ name: "base", value: "20px", from: "project" },
		{ name: "md", value: "22px", from: "project" },
	],
	tracking: [{ name: "tight", value: "-0.01em", from: "project" }],
	radius: [
		{ name: "md", value: "8px", from: "project" },
		{ name: "lg", value: "12px", from: "project" },
		{ name: "2xl", value: "1rem", from: "default" },
	],
	shadow: [{ name: "sm", value: "0 1px 3px 0 rgb(0 0 0 / 0.1)", from: "default" }],
	ease: [{ name: "out", value: "cubic-bezier(0, 0, 0.2, 1)", from: "default" }],
	screen: [
		{ name: "app", value: "1280px", from: "project" },
		{ name: "md", value: "48rem", from: "default" },
	],
	step: 4,
};

const element: RowElement = { tag: "div", className: "" };

/** The theme as the write lane takes it, which is what the daemon hands it. */
const names = (list: readonly { name: string }[]) => new Set(list.map((token) => token.name));
const classTheme: ClassTheme = {
	colour: names(theme.colour),
	text: names(theme.text),
	weight: names(theme.weight),
	font: names(theme.font),
	leading: names(theme.leading),
	tracking: names(theme.tracking),
	shadow: names(theme.shadow),
	ease: names(theme.ease),
	radius: names(theme.radius),
};

function at(scoped: string) {
	return { scoped, theme };
}

/** A row's edits run through the write lane, which is what the daemon does with them. */
function applied(row: Row, scoped: string, value: Parameters<typeof editsFor>[1]): string {
	let className = scoped;
	for (const edit of editsFor(row, value, at(scoped))) {
		className = writeClass(
			className,
			{ token: edit.token, scope: "", ...(edit.remove === true ? { remove: true } : {}) },
			classTheme,
		);
	}
	return className;
}

describe("the inventory", () => {
	it("resolves every family to a primitive and a rule", () => {
		for (const row of ROWS) {
			expect(row.primitive, row.property).toBeTypeOf("string");
			expect(row.rule.kind, row.property).toBeTypeOf("string");
			expect(row.section, row.property).toBeTypeOf("string");
		}
		// no two rows answer for the same property, or one of them is unreachable
		expect(new Set(ROWS.map((row) => row.property)).size).toBe(ROWS.length);
	});

	it("has a row for every numeric family and every word family", () => {
		const lengths = new Set(
			ROWS.flatMap((row) =>
				row.rule.kind === "length" ? [row.rule.family] : row.rule.kind === "border-width" ? ["border"] : [],
			),
		);
		for (const family of Object.keys(LENGTHS)) {
			// the border widths fold to edges, so their rows carry the fold's rule
			const covered = lengths.has(family) || family.startsWith("border");
			expect(covered, family).toBe(true);
		}
		const words = new Set(ROWS.flatMap((row) => (row.rule.kind === "word" ? [row.rule.word] : [])));
		for (const word of Object.keys(WORDS) as Word[]) expect(words.has(word), word).toBe(true);
	});

	it("covers the colours, the theme lists, the sets and the gradient", () => {
		const kinds = new Set(ROWS.map((row) => row.rule.kind));
		expect(kinds).toEqual(
			new Set([
				"length",
				"border-width",
				"word",
				"colour",
				"theme",
				"radius",
				"toggles",
				"gradient",
				"size-mode",
				"read",
			]),
		);
		const sets = ROWS.flatMap((row) => (row.rule.kind === "toggles" ? [row.rule.set] : []));
		expect(sets).toEqual([...TOGGLE_SETS]);
		expect(ROWS.filter((row) => row.rule.kind === "colour").length).toBeGreaterThan(15);
		// about 130 families, which is the inventory the ticket counted
		expect(ROWS.length).toBeGreaterThan(120);
	});

	it("leaves no row without a control", () => {
		const primitives = new Set([
			"number",
			"select",
			"icons",
			"place",
			"chip",
			"colour",
			"toggles",
			"gradient",
			"read",
		]);
		for (const row of ROWS) expect(primitives.has(row.primitive), row.property).toBe(true);
	});
});

describe("every row creates, edits, removes and unlinks", () => {
	const cases: readonly { property: string; value: string; other: string; typed: string; token: string }[] = [
		{ property: "padding", value: "4", other: "6", typed: "13px", token: "p-[13px]" },
		{ property: "width", value: "full", other: "44", typed: "347px", token: "w-[347px]" },
		{ property: "font-size", value: "md", other: "base", typed: "15px", token: "text-[15px]" },
		{ property: "line-height", value: "base", other: "md", typed: "19px", token: "leading-[19px]" },
		{ property: "border-radius", value: "lg", other: "md", typed: "13px", token: "rounded-[13px]" },
		{ property: "border-width", value: "2", other: "1", typed: "1.5px", token: "border-[1.5px]" },
	];

	for (const one of cases) {
		it(`writes and takes back ${one.property}`, () => {
			const row = rowFor(one.property);
			if (row === undefined) throw new Error(`no row for ${one.property}`);

			const created = applied(row, "flex", { kind: "value", value: one.value });
			expect(created).not.toBe("flex");

			const edited = applied(row, created, { kind: "value", value: one.other });
			expect(edited).not.toBe(created);

			expect(applied(row, edited, null)).toBe("flex");

			const unlinked = unlinkTo(row, one.typed);
			expect(unlinked).toEqual({ ok: true, token: one.token });
		});
	}

	it("writes a colour with its alpha, and takes it back", () => {
		const row = rowFor("background-color");
		if (row === undefined) throw new Error("no background-color row");

		const painted = applied(row, "flex", { kind: "colour", name: "thread", alpha: 50 });
		expect(painted).toBe("flex bg-thread/50");
		expect(applied(row, painted, { kind: "colour", name: "bg", alpha: null })).toBe("flex bg-bg");
		expect(applied(row, painted, null)).toBe("flex");
		expect(unlinkTo(row, "#ff0044")).toEqual({ ok: true, token: "bg-[#ff0044]" });
	});

	it("turns one chip on, knocking out the group it belongs to", () => {
		const row = rowFor(NUMERIC_SET.property);
		if (row === undefined) throw new Error("no font-variant-numeric row");

		const on = applied(row, "tabular-nums", { kind: "toggle", token: "proportional-nums", on: true });
		expect(on).toBe("proportional-nums");
		expect(applied(row, on, { kind: "toggle", token: "proportional-nums", on: false })).toBe("");
		// a chip has no bracket spelling, and the row says so rather than pretending
		expect(unlinkTo(row, "3px")).toEqual({ ok: false, reason: "no utility" });
	});

	it("writes a gradient as its shape and its stops, and drops every token at once", () => {
		const row = rowFor("background-image");
		if (row === undefined) throw new Error("no background-image row");

		const written = applied(row, "flex", {
			kind: "gradient",
			gradient: {
				shape: "linear",
				direction: "to-br",
				token: "",
				stops: [
					{ at: "from", colour: { token: null, name: "thread", alpha: null, paint: "#F5391A" }, position: null },
					{ at: "via", colour: { token: null, name: "thread", alpha: 70, paint: "#F5391A" }, position: null },
					{ at: "to", colour: { token: null, name: "bg", alpha: null, paint: "#0E0E0E" }, position: null },
				],
			},
		});
		expect(written).toBe("flex bg-linear-to-br from-thread via-thread/70 to-bg");
		expect(applied(row, written, null)).toBe("flex");
	});

	it("writes the three size modes the HTML way", () => {
		const row = rowFor("width mode");
		if (row === undefined) throw new Error("no width mode row");

		expect(applied(row, "flex", { kind: "mode", mode: "fill", measured: 347 })).toBe("flex w-full");
		expect(applied(row, "flex w-full", { kind: "mode", mode: "fixed", measured: 348 })).toBe("flex w-87");
		expect(applied(row, "flex w-87", { kind: "mode", mode: "hug", measured: 348 })).toBe("flex");
	});

	it("says which rows have no arbitrary value, and why", () => {
		for (const row of ROWS) {
			if (row.arbitrary.ok) continue;
			expect(row.arbitrary.reason, row.property).toBe("no utility");
			expect(["word", "toggles", "gradient", "size-mode", "read"]).toContain(row.rule.kind);
		}
	});
});

describe("what a row reads", () => {
	it("reads a length as its token and what it measures", () => {
		const row = rowFor("padding");
		if (row === undefined) throw new Error("no padding row");
		expect(readRow(row, "flex p-4", theme)).toMatchObject({ token: "p-4", value: "4", says: "16px" });
		expect(readRow(row, "flex", theme)).toMatchObject({ token: null, says: null });
	});

	it("reads a size off the compiled theme rather than off Tailwind's", () => {
		const size = rowFor("font-size");
		const colour = rowFor("color");
		if (size === undefined || colour === undefined) throw new Error("no text rows");

		// `text-md` is this project's size and `text-muted` its colour: two rows,
		// and only the theme can say which token belongs to which
		expect(readRow(size, "text-muted text-md", theme)).toMatchObject({ value: "md", says: "14px" });
		expect(readRow(colour, "text-muted text-md", theme)).toMatchObject({ value: "muted", says: "#8E8C88" });
		// and with no theme read yet, neither row invents an answer
		expect(readRow(size, "text-muted text-md", null)).toMatchObject({ token: null });
	});

	it("reads the logical spellings as the sides they resolve to", () => {
		const left = rowFor("padding-left");
		const right = rowFor("padding-right");
		if (left === undefined || right === undefined) throw new Error("no padding side rows");

		expect(readRow(left, "ps-4 pe-6", theme)).toMatchObject({ token: null });
		// the fold is what reads them, and it reads `ps-` as the left side
		expect(sidesOf("ps-4 pe-6", "p")).toEqual({ t: null, r: "6", b: null, l: "4" });
	});

	it("keeps a literal's logical spelling when it writes back", () => {
		const row = rowFor("padding-left");
		if (row === undefined) throw new Error("no padding-left row");
		expect(applied(row, "ps-4 pe-6", { kind: "value", value: "8" })).toBe("pe-6 ps-8");
	});

	it("reads a radius by this project's own scale", () => {
		const row = rowFor("border-radius");
		if (row === undefined) throw new Error("no border-radius row");
		expect(readRow(row, "rounded-lg", theme)).toMatchObject({ value: "lg", says: "12px" });
		expect(readRow(row, "rounded-[13px]", theme)).toMatchObject({ value: "[13px]", says: "13px" });
	});

	it("offers the project's tokens before Tailwind's, in every menu", () => {
		const size = rowFor("font-size");
		const colour = rowFor("background-color");
		if (size === undefined || colour === undefined) throw new Error("no menu rows");

		expect(optionsFor(size, theme).map((option) => option.token)).toEqual([
			"text-2xs",
			"text-base",
			"text-md",
			"text-xl",
		]);
		expect(optionsFor(size, theme).at(-1)).toMatchObject({ from: "default", says: "20px" });
		expect(optionsFor(colour, theme)[0]).toMatchObject({ token: "bg-thread", from: "project" });
		// the two words no theme carries, and the two radii that are keywords
		expect(optionsFor(colour, theme).map((option) => option.name)).toContain("transparent");
		const radius = rowFor("border-radius");
		if (radius === undefined) throw new Error("no border-radius row");
		const radii = optionsFor(radius, theme).map((option) => option.token);
		expect(radii[0]).toBe("rounded-none");
		expect(radii.at(-1)).toBe("rounded-full");
	});

	it("reads a gradient as its shape, its direction and its stops", () => {
		const row = rowFor("background-image");
		if (row === undefined) throw new Error("no background-image row");
		const reading = readRow(row, "bg-linear-to-br from-thread via-thread/70 to-bg", theme);
		expect(reading.gradient?.shape).toBe("linear");
		expect(reading.gradient?.direction).toBe("to-br");
		expect(reading.gradient?.stops.map((stop) => stop.colour?.name)).toEqual(["thread", "thread", "bg"]);
	});
});

describe("the refusals, per element rather than per property", () => {
	it("says what the write lane would have said", () => {
		const row = rowFor("padding");
		if (row === undefined) throw new Error("no padding row");
		const computed: RowElement = {
			...element,
			refusal: { code: "computed-class", says: "className is an expression" },
		};
		expect(verdictFor(row, computed, "")).toEqual({ ok: false, reason: "className is an expression" });

		const shared: RowElement = {
			...element,
			refusal: { code: "shared-definition", says: "defined in shared/ui/icon-button.tsx:9, rendered by 4 frames" },
		};
		expect(verdictFor(row, shared, "")).toMatchObject({ ok: false });
	});

	it("refuses a size and a padding on an inline element, each in its own words", () => {
		const span: RowElement = { tag: "span", className: "text-base" };
		const width = rowFor("width");
		const padding = rowFor("padding");
		if (width === undefined || padding === undefined) throw new Error("no rows");

		expect(verdictFor(width, span, "text-base")).toEqual({ ok: false, reason: "inline, the text decides" });
		expect(verdictFor(padding, span, "text-base")).toEqual({ ok: false, reason: "inline, padding has no box" });
		// a display token beats the tag's own default
		expect(verdictFor(width, { ...span, className: "flex" }, "flex")).toEqual({ ok: true });
		// `flex-1` on an inline child is the parent blockifying it, so it writes
		const flex = rowFor("flex");
		if (flex === undefined) throw new Error("no flex row");
		expect(verdictFor(flex, span, "text-base")).toEqual({ ok: true });
	});

	it("refuses a height the layout is deciding", () => {
		const height = rowFor("height");
		if (height === undefined) throw new Error("no height row");
		expect(verdictFor(height, element, "flex-1 flex")).toEqual({ ok: false, reason: "flex-1, layout decides" });
	});

	it("writes a mapped element and says what it is writing to", () => {
		const row = rowFor("padding");
		if (row === undefined) throw new Error("no padding row");
		expect(verdictFor(row, { ...element, mapped: true }, "")).toEqual({ ok: true, scope: "one row of many" });
	});
});
