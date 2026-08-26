// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { CompiledTheme } from "../api";
import type { Compiler } from "./properties-compile";
import type { RowEdit, RowElement } from "./properties-rows";
import { BASE, type Scope, scopedClass, scopeKey } from "./properties-scope";
import { PropertySections, type View } from "./properties-sections";

/**
 * The seven primitives, on the rows that need them (#258).
 *
 * What is proved here is what a control reads off a literal and what a change
 * to it comes to: the tokens handed to the write lane. The lane's own spelling
 * — the fewest tokens, the logical sides kept, the zero that drops at the base
 * — is `class-write.test.ts`'s, and the model behind these readings is
 * `properties-rows.test.ts`'s. This file is the surface between them.
 */

/** kaffe's theme: its own colours, sizes and radii, and one breakpoint of its own. */
const THEME: CompiledTheme = {
	colour: [
		{ name: "thread", value: "#F5391A", from: "project" },
		{ name: "raised", value: "#282828", from: "project" },
		{ name: "red-500", value: "#ef4444", from: "default" },
	],
	text: [{ name: "md", value: "14px", from: "project" }],
	weight: [{ name: "bold", value: "700", from: "default" }],
	font: [],
	leading: [],
	tracking: [],
	radius: [
		{ name: "md", value: "8px", from: "project" },
		{ name: "lg", value: "12px", from: "project" },
	],
	shadow: [{ name: "sm", value: "0 1px 2px #000", from: "default" }],
	ease: [],
	screen: [{ name: "app", value: "1280px", from: "project" }],
	step: 4,
};

/* ---------- P6: a sign, a fraction and a unit in every number box ---------- */

it("takes a sign, a fraction, a unit and a bare count", async () => {
	const rail = await mount("");

	await type(rail, "margin", "-4");
	expect(rail.wrote()).toEqual([{ token: "-m-4" }]);

	await type(rail, "width", "50%");
	expect(rail.wrote()).toEqual([{ token: "w-1/2" }]);

	await type(rail, "width", "347px");
	expect(rail.wrote()).toEqual([{ token: "w-[347px]" }]);

	// a percent that is not on the fraction table stays a bare number, which is
	// what v4 takes: `opacity-37.5` compiles and `opacity-[37.5%]` is noise
	await type(rail, "opacity", "37.5");
	expect(rail.wrote()).toEqual([{ token: "opacity-37.5" }]);

	// a bare count on z-index, and a degree on a rotation
	await type(await mount("absolute"), "z-index", "10");
	const turned = await mount("rotate-6");
	await type(turned, "rotate", "12deg");
	expect(turned.wrote()).toEqual([{ token: "rotate-12" }]);
});

it("reads the token in the box and what it measures beside it", async () => {
	const rail = await mount("p-4 w-1/2 opacity-50");

	expect(shows(rail, "padding")).toBe("4");
	expect(asideOf(rail, "padding")).toBe("16px");
	expect(shows(rail, "width")).toBe("1/2");
	expect(asideOf(rail, "width")).toBe("50%");
	expect(asideOf(rail, "opacity")).toBe("50%");
});

it("steps by one scale unit on an arrow and by ten on shift", async () => {
	const rail = await mount("p-4");

	await step(rail, "padding", "ArrowUp", false);
	expect(rail.wrote()).toEqual([{ token: "p-5" }]);

	await step(rail, "padding", "ArrowDown", true);
	expect(rail.wrote()).toEqual([{ token: "-p-6" }]);
});

/* ---------- P7: the folds ---------- */

it("folds padding in three steps, and reads the logical spellings as sides", async () => {
	// every side agrees: one row
	expect(rowNames(await mount("p-4"), "padding")).toEqual(["padding"]);

	// opposite sides agree: the two axes
	expect(rowNames(await mount("px-4 py-2"), "padding")).toEqual(["padding-inline", "padding-block"]);

	// `ps-` is the left side of a left-to-right document, and reading it as one
	// is what lets the row show a value instead of an empty field
	const logical = await mount("pt-1 pr-2 pb-3 ps-4");
	expect(rowNames(logical, "padding")).toEqual(["padding-top", "padding-right", "padding-bottom", "padding-left"]);
	expect(shows(logical, "padding-left")).toBe("4");
});

it("opens one padding row into the axes and then the sides", async () => {
	const rail = await mount("p-4");

	await press(rail, caretIn(rail, "padding"));
	expect(rowNames(rail, "padding")).toEqual(["padding-inline", "padding-block"]);

	await press(rail, caretIn(rail, "padding-inline"));
	expect(rowNames(rail, "padding")).toEqual(["padding-top", "padding-right", "padding-bottom", "padding-left"]);
});

it("folds the radius to four corners and the border to four edges", async () => {
	const even = await mount("rounded-md border-2");
	expect(rowNames(even, "border-radius")).toEqual(["border-radius"]);
	expect(rowNames(even, "border-width")).toEqual(["border-width"]);

	const odd = await mount("rounded-md rounded-tl-none border-2 border-b-4");
	expect(rowNames(odd, "border-radius")).toEqual(["top-left", "top-right", "bottom-right", "bottom-left"]);
	expect(rowNames(odd, "border-width")).toEqual(["top", "right", "bottom", "left"]);
	expect(shows(odd, "bottom")).toBe("4");
});

it("brackets a fractional border width, which Tailwind refuses bare", async () => {
	const rail = await mount("border");

	await type(rail, "border-width", "1.5px");
	expect(rail.wrote()).toEqual([{ token: "border-[1.5px]" }]);

	await type(rail, "border-width", "2");
	expect(rail.wrote()).toEqual([{ token: "border-2" }]);
});

/* ---------- P2: alpha on every colour ---------- */

it("reads a colour as a swatch, a name and an alpha, and writes all three", async () => {
	const rail = await mount("bg-thread/50");

	expect(shows(rail, "background-color")).toBe("thread");
	expect(swatchIn(rail, "background-color")).toContain("#F5391A");
	expect(alphaOf(rail, "background-color")).toBe("50");

	await typeAlpha(rail, "background-color", "80");
	expect(rail.wrote()).toEqual([{ token: "bg-thread/80" }]);

	// full is the absence of the alpha half, not `/100`
	await typeAlpha(rail, "background-color", "");
	expect(rail.wrote()).toEqual([{ token: "bg-thread" }]);
});

it("offers this project's colours first and Tailwind's under a default divider", async () => {
	const rail = await mount("bg-thread");
	await open(rail, "background-color");

	// the absent reading heads it, then the project's own, then Tailwind's
	expect(optionNames(rail, "background-color").slice(0, 3)).toEqual(["transparent", "thread", "raised"]);
	expect(dividersIn(rail, "background-color")).toEqual(["default"]);

	await pick(rail, "background-color", "red-500");
	expect(rail.wrote()).toEqual([{ token: "bg-red-500" }]);
});

it("takes an arbitrary colour typed into the same menu, and reads it back", async () => {
	const rail = await mount("");
	await open(rail, "background-color");
	await find(rail, "background-color", "#ff0044");

	expect(optionNames(rail, "background-color")).toContain("[#ff0044]");
	await pick(rail, "background-color", "[#ff0044]");
	expect(rail.wrote()).toEqual([{ token: "bg-[#ff0044]" }]);

	expect(shows(await mount("bg-[#ff0044]"), "background-color")).toBe("[#ff0044]");
});

/* ---------- P3: the gradient, as rows ---------- */

it("writes a gradient as a shape, a direction and stop rows", async () => {
	const none = await mount("");
	expect(shows(none, "background-image")).toBe("none");
	expect(rowNames(none, "from")).toEqual([]);

	await pick(none, "background-image", "bg-linear-*");
	expect(none.wrote()).toEqual([{ token: "bg-linear-to-r" }]);

	const linear = await mount("bg-linear-to-br from-thread to-raised");
	expect(rowNames(linear, "from")).toEqual(["from"]);
	expect(shows(linear, "from")).toBe("thread");
	expect(shows(linear, "direction")).toBe("to-br");

	await pick(linear, "gradient via", "raised");
	expect(linear.wrote()).toEqual([
		{ token: "bg-linear-to-br", remove: true },
		{ token: "from-thread", remove: true },
		{ token: "to-raised", remove: true },
		{ token: "bg-linear-to-br" },
		{ token: "from-thread" },
		{ token: "via-raised" },
		{ token: "to-raised" },
	]);
});

it("drops every gradient token at once on none", async () => {
	const rail = await mount("bg-linear-to-r from-thread from-10% to-raised");

	await pick(rail, "background-image", "none");
	expect(rail.wrote()).toEqual([
		{ token: "bg-linear-to-r", remove: true },
		{ token: "from-thread", remove: true },
		{ token: "from-10%", remove: true },
		{ token: "to-raised", remove: true },
	]);
});

/* ---------- P4: toggle sets ---------- */

it("knocks out the exclusive group and its reset when a chip goes on", async () => {
	const rail = await mount("proportional-nums normal-nums");

	await press(rail, chipIn(rail, "font-variant-numeric", "tabular-nums"));
	expect(rail.wrote()).toEqual([
		{ token: "proportional-nums", remove: true },
		{ token: "normal-nums", remove: true },
		{ token: "tabular-nums" },
	]);

	// a chip already on comes off on its own, without touching the rest
	await press(rail, chipIn(rail, "font-variant-numeric", "proportional-nums"));
	expect(rail.wrote()).toEqual([{ token: "proportional-nums", remove: true }]);
});

it("gives the blurs a menu of their own inside the filter set", async () => {
	const rail = await mount("grayscale blur-sm");

	expect(chipIn(rail, "filter", "grayscale")?.getAttribute("aria-pressed")).toBe("true");
	expect(chipIn(rail, "filter", "blur-sm")).toBeNull();
	expect(shows(rail, "filter")).toBe("blur-sm");
});

/* ---------- the rows that needed care ---------- */

it("gives a shadow nobody has set a menu rather than dead text", async () => {
	const rail = await mount("");

	expect(shows(rail, "box-shadow")).toBe("shadow-none");
	await pick(rail, "box-shadow", "shadow-sm");
	expect(rail.wrote()).toEqual([{ token: "shadow-sm" }]);
});

it("writes the explicit none under a scope and drops the token at the base", async () => {
	const base = await mount("rounded-md");
	await pick(base, "border-radius", "rounded-none");
	expect(base.wrote()).toEqual([{ token: "rounded-none", remove: true }]);

	const hover = await mount("rounded-md hover:rounded-lg", ["hover"]);
	await pick(hover, "border-radius", "rounded-none");
	expect(hover.wrote()).toEqual([{ token: "rounded-none" }]);
});

it("shows a border colour only once a width exists", async () => {
	// a colour with no width paints nothing, so the row is not offered — but a
	// colour the literal already carries is drawn wherever it is, because a
	// token on the element with no row is the absence this ticket removes
	expect(rowNames(await mount(""), "border-color")).toEqual([]);
	expect(rowNames(await mount("border"), "border-color")).toEqual(["border-color"]);
	expect(rowNames(await mount("border-thread"), "border-color")).toEqual(["border-color"]);
});

it("heads the word menus with unset, so a property can be removed and not only changed", async () => {
	const rail = await mount("flex items-center");
	await open(rail, "display");

	expect(optionNames(rail, "display")[0]).toBe("unset");
	await pick(rail, "display", "unset");
	expect(rail.wrote()).toEqual([{ token: "flex", remove: true }]);
});

/* ---------- the scope: a variant reads the base faint ---------- */

it("reads the base's value faint under a variant, and writes the variant's own", async () => {
	const rail = await mount("p-4 hover:bg-thread", ["hover"]);

	// nothing under `hover:` sets padding: the base's value stands, quietly
	expect(shows(rail, "padding")).toBe("4");
	expect(fieldIn(rail, "padding")?.className).toContain("text-muted/55");
	expect(fieldIn(rail, "background-color")?.className ?? "").not.toContain("text-muted/55");

	await type(rail, "padding", "8");
	expect(rail.wrote()).toEqual([{ token: "p-8" }]);
	expect(rail.scoped()).toBe("hover:");
});

/* ---------- refusals stay visible ---------- */

it("greys an inline element's size rows and says why, rather than hiding them", async () => {
	const rail = await mount("", BASE, { tag: "span", className: "" });

	expect(sectionReason(rail, "size")).toBe("inline, the text decides");
	expect(fieldIn(rail, "width")).toBeNull();
	expect(rowNames(rail, "width")).toEqual(["width"]);
});

it("greys every row on a literal no hand may write", async () => {
	const rail = await mount("p-4", BASE, {
		tag: "div",
		className: "p-4",
		refusal: { code: "computed-class", says: "className is an expression" },
	});

	expect(fieldIn(rail, "padding")).toBeNull();
	expect(rowNames(rail, "padding")).toEqual(["padding"]);
});

/* ---------- the harness ---------- */

interface Rail {
	host: HTMLElement;
	/** the edits the last change came to, as the write lane would be handed them */
	wrote: () => RowEdit[];
	/** the scope those edits were written under */
	scoped: () => string;
}

async function mount(className: string, scope: Scope = BASE, element?: RowElement): Promise<Rail> {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	let wrote: RowEdit[] = [];
	const view: View = {
		scope,
		scoped: scopedClass(className, scope),
		base: scopedClass(className, BASE),
		theme: THEME,
		element: element ?? { tag: "div", className },
		box: { w: 120, h: 40 },
		compiler: stubCompiler(),
		fresh: () => false,
		put: (edits) => {
			wrote = [...edits];
		},
	};
	await act(async () => {
		root.render(createElement(PropertySections, { view }));
	});
	return { host, wrote: () => wrote, scoped: () => scopeKey(scope) };
}

function stubCompiler(): Compiler {
	return { verdictOf: () => undefined, ask: () => {} };
}

/** Every drawn row whose label is this one, in the order the rail draws them. */
function rowsFor(rail: Rail, name: string): HTMLElement[] {
	return [...rail.host.querySelectorAll<HTMLElement>(`[data-properties-row="${name}"]`)];
}

function rowOf(rail: Rail, name: string): HTMLElement | null {
	return rowsFor(rail, name)[0] ?? null;
}

/**
 * The labels a fold is currently drawn under.
 *
 * The fold is which rows exist, so what it is doing is exactly what the rail
 * has on screen — one name, two, or four.
 */
function rowNames(rail: Rail, anyOf: string): string[] {
	const groups: Readonly<Record<string, readonly string[]>> = {
		padding: [
			"padding",
			"padding-inline",
			"padding-block",
			"padding-top",
			"padding-right",
			"padding-bottom",
			"padding-left",
		],
		"border-radius": ["border-radius", "top-left", "top-right", "bottom-right", "bottom-left"],
		"border-width": ["border-width", "top", "right", "bottom", "left"],
		"border-color": ["border-color", "top", "right", "bottom", "left"],
		width: ["width"],
		from: ["from"],
	};
	const names = groups[anyOf] ?? [anyOf];
	return [...rail.host.querySelectorAll<HTMLElement>("[data-properties-row]")]
		.map((row) => row.dataset.propertiesRow ?? "")
		.filter((name) => names.includes(name));
}

function fieldIn(rail: Rail, row: string): HTMLInputElement | null {
	return rowOf(rail, row)?.querySelector("input") ?? null;
}

/** What the row's first control is showing: a field's value, or a menu's name. */
function shows(rail: Rail, row: string): string {
	const held = rowOf(rail, row)?.querySelector("[data-menu-value], input");
	if (held === null || held === undefined) return "";
	return held instanceof HTMLInputElement ? held.value : (held.textContent ?? "");
}

/** The faint half at the right of the row: what the token measures. */
function asideOf(rail: Rail, row: string): string {
	const faint = rowOf(rail, row)?.querySelectorAll(".text-muted\\/50");
	return faint?.[faint.length - 1]?.textContent ?? "";
}

function swatchIn(rail: Rail, row: string): string {
	return rowOf(rail, row)?.querySelector<HTMLElement>("[data-swatch]")?.dataset.swatch ?? "";
}

function alphaOf(rail: Rail, row: string): string {
	const fields = rowOf(rail, row)?.querySelectorAll("input");
	return fields?.[fields.length - 1]?.value ?? "";
}

function caretIn(rail: Rail, row: string): HTMLElement | null {
	return rowOf(rail, row)?.querySelector<HTMLElement>("[aria-expanded]") ?? null;
}

function chipIn(rail: Rail, row: string, label: string): HTMLElement | null {
	return (
		[...(rowOf(rail, row)?.querySelectorAll<HTMLElement>("[aria-pressed]") ?? [])].find(
			(chip) => chip.textContent === label,
		) ?? null
	);
}

function sectionReason(rail: Rail, section: string): string {
	const heads = [...rail.host.querySelectorAll<HTMLElement>(".h-6")];
	const head = heads.find((candidate) => candidate.firstElementChild?.textContent === section);
	return head?.lastElementChild?.textContent ?? "";
}

function menuIn(rail: Rail, label: string): HTMLElement | null {
	return rail.host.querySelector<HTMLElement>(`[aria-label="${label}"]`);
}

function listFor(rail: Rail, label: string): HTMLElement | null {
	return menuIn(rail, label)?.parentElement?.querySelector<HTMLElement>('[role="listbox"]') ?? null;
}

async function open(rail: Rail, label: string): Promise<void> {
	await press(rail, menuIn(rail, label));
}

function optionNames(rail: Rail, label: string): string[] {
	return [...(listFor(rail, label)?.querySelectorAll<HTMLElement>("[data-menu-option]") ?? [])].map(
		(option) => option.dataset.menuOption ?? "",
	);
}

/** The `default` line above where Tailwind's own names begin. */
function dividersIn(rail: Rail, label: string): string[] {
	return [...(listFor(rail, label)?.querySelectorAll("[data-menu-divider]") ?? [])].map(
		(divider) => divider.textContent ?? "",
	);
}

async function find(rail: Rail, label: string, typed: string): Promise<void> {
	const field = listFor(rail, label)?.querySelector("input") ?? null;
	if (field === null) throw new Error(`no find line on ${label}`);
	await put(field, typed);
}

async function pick(rail: Rail, label: string, name: string): Promise<void> {
	if (listFor(rail, label) === null) await open(rail, label);
	const found = [...(listFor(rail, label)?.querySelectorAll<HTMLElement>("[data-menu-option]") ?? [])].find(
		(option) => option.dataset.menuOption === name,
	);
	if (found === undefined) throw new Error(`no option "${name}" on ${label}`);
	await press(rail, found);
}

async function type(rail: Rail, row: string, text: string): Promise<void> {
	const field = fieldIn(rail, row);
	if (field === null) throw new Error(`no field on "${row}"`);
	await put(field, text);
	await act(async () => {
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	});
}

async function typeAlpha(rail: Rail, row: string, text: string): Promise<void> {
	const fields = rowOf(rail, row)?.querySelectorAll("input");
	const field = fields?.[fields.length - 1];
	if (field === undefined) throw new Error(`no alpha on "${row}"`);
	await put(field, text);
	await act(async () => {
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	});
}

async function step(rail: Rail, row: string, key: string, shift: boolean): Promise<void> {
	const field = fieldIn(rail, row);
	if (field === null) throw new Error(`no field on "${row}"`);
	await act(async () => {
		field.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey: shift, bubbles: true, cancelable: true }));
	});
}

/**
 * A keystroke's worth of typing.
 *
 * React tracks the value it last wrote, so a bare assignment reads as no change
 * at all: the native setter is what a real keystroke goes through.
 */
async function put(field: HTMLInputElement, text: string): Promise<void> {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	await act(async () => {
		setter?.call(field, text);
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

async function press(_rail: Rail, target: HTMLElement | null): Promise<void> {
	if (target === null) throw new Error("nothing to press");
	await act(async () => {
		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
}
