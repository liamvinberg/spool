import { type ReactNode, useState } from "react";
import type { CompiledTheme } from "../api";
import { cn } from "../cn";
import type { Compiler } from "./properties-compile";
import {
	borderColoursOf,
	borderWidthsOf,
	type Colour,
	colourOf,
	cornersOf,
	DIRECTIONS,
	describe,
	FILTER_SET,
	type Gradient,
	gapOf,
	gradientCss,
	gradientOf,
	insetOf,
	type Kind,
	LENGTHS,
	type Length,
	lengthOf,
	parseTyped,
	SIZE_MODES,
	type Side,
	type SizeMode,
	sidesOf,
	sizeModeOf,
	stepLength,
	themeOf,
	toggledOf,
	WORDS,
	wordOf,
} from "./properties-families";
import {
	AddField,
	ArrowIcon,
	Chip,
	FAINT,
	Fold,
	IconField,
	LABEL,
	LinesIcon,
	Menu,
	NumField,
	type Option,
	PlaceField,
	Row,
	Section,
} from "./properties-fields";
import {
	type At,
	editsFor,
	type Row as ModelRow,
	optionsFor,
	type RowEdit,
	type RowElement,
	type RowValue,
	readRow,
	rowFor,
	rowsIn,
	type Section as SectionName,
	unlinkTo,
	verdictFor,
} from "./properties-rows";
import type { Scope } from "./properties-scope";
import { arbitraryColourName, KEYWORD_COLOURS, listOf, paintOf, paintWith, stepOf } from "./properties-theme";

/**
 * The rail's rows (#258): every section, drawn out of the property model.
 *
 * The model (#257) already says what each of about 130 class families reads,
 * writes and refuses; this file is where those answers become controls. Nothing
 * here decides what a token means — a row asks `readRow` what it is wearing,
 * `optionsFor` what it may offer, `editsFor` what a change comes to, and
 * `verdictFor` whether it may be written at all. What comes back is handed to
 * the write lane as `set-class` ops, which is what keeps the spelling — the
 * fewest tokens, the logical sides, the zero that drops at the base and
 * overrides under a scope — in one place rather than two.
 *
 * The sections and their order are Figma's, and which rows each one leads with
 * is `design/frames/manipulate/properties--rail`. A section's other rows draw
 * themselves when the element wears one, and a `+ more` at its foot reaches the
 * rest: a rail of a hundred and thirty rows is not a surface anybody reads, and
 * a family with nowhere to be reached is exactly the absence this ticket exists
 * to remove.
 */

/** What every row is handed: the element under one scope, and how to write under it. */
export interface View {
	scope: Scope;
	/** the tokens under the live scope, prefixes off, which is what the model reads */
	scoped: string;
	/** the base scope's own, for what a variant inherits and reads faint */
	base: string;
	theme: CompiledTheme | null;
	element: RowElement;
	/** the rung's measured box, which is what `fixed` writes when a mode changes */
	box: { w: number; h: number };
	compiler: Compiler;
	/** true when a bare token under this scope is not one the file was written with */
	fresh: (token: string | null) => boolean;
	/** the row's edits, as one patch under the live scope */
	put: (edits: readonly RowEdit[]) => void;
}

function atOf(view: View): At {
	return { scoped: view.scoped, theme: view.theme };
}

/** The model row this property is, which is a programming error when it is missing. */
function modelRow(property: string): ModelRow {
	const row = rowFor(property);
	if (row === undefined) throw new Error(`no property row "${property}"`);
	return row;
}

/** Whether this row may be written here, and the reason it may not. */
function okOf(view: View, row: ModelRow): boolean {
	return verdictFor(row, view.element, view.scoped).ok;
}

/**
 * The reason a section's rows refuse, said once in its head.
 *
 * A refusal that covers the whole element is already under the crumbs, so a
 * section only carries one of its own — an inline element's size, a flex
 * child's height — which is the reading that is actually about these rows.
 */
function sectionReason(view: View, properties: readonly string[]): string | undefined {
	if (view.element.refusal !== undefined) return undefined;
	for (const property of properties) {
		const row = rowFor(property);
		if (row === undefined) continue;
		const verdict = verdictFor(row, view.element, view.scoped);
		if (!verdict.ok) return verdict.reason;
	}
	return undefined;
}

/* ---------- what a row is wearing, and what the base lends it ---------- */

/** A value the row shows: its own under this scope, or the base's, read faint. */
interface Worn<T> {
	own: T;
	shown: T;
	/** nothing under this scope sets it: the value shown is the base's */
	faint: boolean;
}

function worn<T>(view: View, read: (scoped: string) => T, empty: (value: T) => boolean): Worn<T> {
	const own = read(view.scoped);
	if (!empty(own) || view.scope.length === 0) return { own, shown: own, faint: empty(own) };
	const base = read(view.base);
	return { own, shown: base, faint: true };
}

/* ---------- P6: a length ---------- */

/** A length as one signed string: `4`, `-2`, `[347px]`, `1/2!`. */
function signedOf(length: Length | null): string | null {
	if (length === null) return null;
	return `${length.negative ? "-" : ""}${length.value}${length.important ? "!" : ""}`;
}

/** That string taken back apart, which is what the readout and the step need. */
function takeApart(value: string): { value: string; negative: boolean } | null {
	if (value === "") return null;
	const negative = value.startsWith("-");
	const rest = (negative ? value.slice(1) : value).replace(/!$/, "");
	return { value: rest, negative };
}

function LengthRow({
	view,
	property,
	name,
	measured = 0,
	placeholder,
	fallback,
	read,
	aside,
}: {
	view: View;
	property: string;
	/** the label, when the row is drawn under a shorter name than the model's */
	name?: string;
	/** what the box measures when nothing sets it, so a step starts from the truth */
	measured?: number;
	placeholder?: string | undefined;
	/** the readout when nothing sets it */
	fallback?: string | undefined;
	/**
	 * The fold's own reading of this side, signed, where the row is one of a fold.
	 *
	 * `p-4` and `ps-4` are both the left side, and reading them as one is what
	 * lets `padding-left` show a value instead of an empty box. What it writes is
	 * still its own family's token: the lane folds it back.
	 */
	read?: ((scoped: string) => string | null) | undefined;
	aside?: ReactNode;
}) {
	const row = modelRow(property);
	if (row.rule.kind !== "length") throw new Error(`"${property}" is not a length`);
	const family = row.rule.family;
	const kind: Kind = LENGTHS[family] ?? "spacing";
	const step = stepOf(view.theme);
	const ok = okOf(view, row);
	const reader = read ?? ((scoped: string) => signedOf(lengthOf(scoped, family)));
	const held = worn<string | null>(view, reader, (value) => value === null);
	const value = held.shown ?? "";
	const parsed = takeApart(value);
	const readout = parsed === null ? (fallback ?? null) : describe(kind, parsed.value, parsed.negative, step);
	const changed = view.fresh(lengthOf(view.scoped, family)?.token ?? null);
	const write = (next: RowValue) => view.put(editsFor(row, next, atOf(view)));
	const stepBy = (units: number) => {
		const from: Length | null =
			parsed === null
				? null
				: { family, kind, value: parsed.value, negative: parsed.negative, important: false, token: "" };
		const next = stepLength(kind, from, measured, units, step);
		write({ kind: "value", value: `${next.negative ? "-" : ""}${next.value}` });
	};
	return (
		<Row name={name ?? row.property} ok={ok} changed={changed} onScrub={ok ? stepBy : undefined}>
			<NumField
				value={value}
				readout={readout}
				ok={ok}
				faint={held.own === null}
				changed={changed}
				placeholder={placeholder ?? (kind === "spacing" ? "auto" : "–")}
				onCommit={(typed) => {
					const text = typed.trim();
					if (text === "") return write(null);
					const next = parseTyped(kind, text, step);
					if (next !== null) write({ kind: "value", value: `${next.negative ? "-" : ""}${next.value}` });
				}}
				onStep={stepBy}
			/>
			{aside}
		</Row>
	);
}

/**
 * A border width, which is a length that folds to edges (P7).
 *
 * A fraction brackets rather than going bare: Tailwind refuses `border-1.5`,
 * and `border-[1.5px]` is what it takes instead — the row would otherwise offer
 * a value that lands nothing.
 */
function BorderWidthRow({
	view,
	property,
	name,
	fold,
}: {
	view: View;
	property: string;
	name?: string;
	fold?: ReactNode;
}) {
	const row = modelRow(property);
	if (row.rule.kind !== "border-width") throw new Error(`"${property}" is not a border width`);
	const edge = row.rule.edge;
	const ok = okOf(view, row);
	const step = stepOf(view.theme);
	const held = worn<string | null>(
		view,
		(scoped) => (edge === "all" ? borderWidthsOf(scoped).t : borderWidthsOf(scoped)[edge]),
		(value) => value === null,
	);
	const changed = view.fresh(readRow(row, view.scoped, view.theme).token);
	const write = (next: RowValue) => view.put(editsFor(row, next, atOf(view)));
	const stepBy = (units: number) => {
		const now = held.shown === null ? 0 : Number.parseFloat(held.shown.replace(/[^\d.]/g, "")) || 1;
		const next = Math.max(0, Math.round(now + units));
		if (next === 0) write(null);
		else write({ kind: "value", value: String(next) });
	};
	return (
		<Row name={name ?? row.property} ok={ok} changed={changed} onScrub={ok ? stepBy : undefined}>
			<NumField
				value={held.shown ?? ""}
				placeholder="0"
				readout={describe("px", held.shown ?? "0", false, step) ?? "0px"}
				ok={ok}
				faint={held.own === null}
				changed={changed}
				onCommit={(typed) => {
					const next = parseTyped("px", typed.trim(), step);
					if (next === null || next.value === "0") return write(null);
					write({ kind: "value", value: next.value });
				}}
				onStep={stepBy}
			/>
			{fold}
		</Row>
	);
}

/* ---------- P2: a colour, with an alpha ---------- */

/**
 * Every colour this project has, the theme's own first.
 *
 * `transparent`, `current` and `inherit` are the utility's words rather than
 * theme values, and a menu that left them out would be missing the most
 * reachable answers in it.
 */
function colourOptions(theme: CompiledTheme | null): Option[] {
	return [
		...listOf(theme, "colour").map(
			(token): Option => ({
				token: token.name,
				name: token.name,
				value: token.from === "project" ? token.value : "",
				swatch: token.value,
				...(token.from === "default" ? { group: "default" } : {}),
			}),
		),
		...KEYWORD_COLOURS.map(
			(colour): Option => ({ token: colour.name, name: colour.name, swatch: colour.paint, group: "default" }),
		),
	];
}

/** The unlink: a raw colour typed into the menu becomes a bracket value. */
function colourTyped(theme: CompiledTheme | null, typed: string): Option | null {
	const name = arbitraryColourName(typed);
	if (name === null) return null;
	const paint = paintOf(theme, name);
	return { token: name, name, group: "arbitrary", ...(paint === undefined ? {} : { swatch: paint }) };
}

/** the swatch, the name out of the compiled theme, and the alpha after the slash */
function ColourRow({
	view,
	property,
	name,
	absent,
	read,
	onWrite,
	fold,
}: {
	view: View;
	property: string;
	name?: string;
	/** what the row says when nothing sets it: `transparent`, `inherit`, `border` */
	absent: string;
	/** read from somewhere other than this prefix's own token (an edge, a stop) */
	read?: ((scoped: string) => Colour) | undefined;
	onWrite?: ((name: string | null, alpha: number | null) => void) | undefined;
	fold?: ReactNode;
}) {
	const row = modelRow(property);
	if (row.rule.kind !== "colour") throw new Error(`"${property}" is not a colour`);
	const prefix = row.rule.prefix;
	const ok = okOf(view, row);
	const reader = read ?? ((scoped: string) => colourOf(scoped, prefix, view.theme));
	const held = worn<Colour>(view, reader, (colour) => colour.token === null);
	const shown = held.shown;
	const changed = view.fresh(held.own.token === null ? null : held.own.token);
	const current: Option =
		shown.name === null
			? { token: null, name: absent, swatch: "" }
			: { token: shown.name, name: shown.name, swatch: shown.paint ?? "" };
	const write = (nextName: string | null, alpha: number | null) => {
		if (onWrite !== undefined) return onWrite(nextName, alpha);
		view.put(editsFor(row, nextName === null ? null : { kind: "colour", name: nextName, alpha }, atOf(view)));
	};
	return (
		<Row name={name ?? row.property} ok={ok} changed={changed}>
			<Menu
				current={current}
				options={[{ token: null, name: absent, swatch: "" }, ...colourOptions(view.theme)]}
				ok={ok}
				faint={held.own.token === null}
				changed={changed}
				filter
				label={name ?? row.property}
				arbitrary={(typed) => colourTyped(view.theme, typed)}
				onPick={(picked) => write(picked, shown.alpha)}
			/>
			<AlphaField
				alpha={shown.alpha}
				ok={ok && shown.name !== null}
				faint={held.own.token === null}
				onCommit={(alpha) => write(shown.name, alpha)}
			/>
			{fold}
		</Row>
	);
}

/** `/50`: the alpha as a percent, full when the field is empty */
function AlphaField({
	alpha,
	ok,
	faint,
	onCommit,
}: {
	alpha: number | null;
	ok: boolean;
	faint: boolean;
	onCommit: (alpha: number | null) => void;
}) {
	return (
		<span className="flex w-[46px] shrink-0 items-center">
			<span className={cn("shrink-0", FAINT)}>/</span>
			<NumField
				value={alpha === null ? "" : String(alpha)}
				placeholder="100"
				ok={ok}
				faint={faint}
				onCommit={(typed) => {
					const percent = Number.parseFloat(typed.replace("%", ""));
					if (typed.trim() === "" || Number.isNaN(percent) || percent >= 100) onCommit(null);
					else onCommit(Math.max(0, percent));
				}}
				onStep={(units) => {
					const next = Math.min(100, Math.max(0, (alpha ?? 100) + units * 5));
					onCommit(next >= 100 ? null : next);
				}}
			/>
		</span>
	);
}

/* ---------- words, named tokens and radii: all one menu ---------- */

/**
 * `unset` heads the menu wherever a property can be taken off as well as
 * changed, which the inventory found was nowhere: a row you can only ever set
 * is a row you cannot undo without going to the file.
 */
const UNSET: Option = { token: null, name: "unset" };

function WordRow({ view, property, name }: { view: View; property: string; name?: string }) {
	const row = modelRow(property);
	if (row.rule.kind !== "word") throw new Error(`"${property}" is not a word`);
	const word = row.rule.word;
	const ok = okOf(view, row);
	const held = worn<string | null>(
		view,
		(scoped) => wordOf(scoped, word),
		(token) => token === null,
	);
	const changed = view.fresh(held.own);
	const options: Option[] = [
		UNSET,
		...optionsFor(row, view.theme).map((option) => ({
			token: option.token,
			name: option.name,
			value: option.says === option.name ? "" : option.says,
		})),
	];
	const current =
		held.shown === null
			? { token: null, name: WORDS[word].fallback }
			: (options.find((option) => option.token === held.shown) ?? { token: held.shown, name: held.shown });
	return (
		<Row name={name ?? row.property} ok={ok} changed={changed}>
			<Menu
				current={current}
				options={options}
				ok={ok}
				faint={held.own === null}
				changed={changed}
				label={name ?? row.property}
				onPick={(token) =>
					view.put(editsFor(row, token === null ? null : { kind: "value", value: token }, atOf(view)))
				}
			/>
		</Row>
	);
}

/**
 * A named token off the compiled theme: font, size, weight, leading, tracking,
 * shadow, easing and the radii.
 *
 * The list is the project's own and Tailwind's under a `default` divider, with
 * type-to-find past eight of them. Text nothing matches becomes the arbitrary
 * value the family takes, offered first — `text-[15px]`, `rounded-[13px]` —
 * which is how a row unlinks without leaving the row.
 */
function TokenRow({
	view,
	property,
	name,
	absent,
	clearTo,
	fold,
}: {
	view: View;
	property: string;
	name?: string;
	absent: Option;
	/**
	 * The name that says the CSS initial value, where the family has one.
	 *
	 * A zero means two things by scope: at the base it is the absence of a token,
	 * which is the fewest tokens; under a scope it is a real override, so
	 * `hover:rounded-none` and `md:shadow-none` stay expressible.
	 */
	clearTo?: string | undefined;
	fold?: ReactNode;
}) {
	const row = modelRow(property);
	const ok = okOf(view, row);
	const held = worn(
		view,
		(scoped) => readRow(row, scoped, view.theme),
		(reading) => reading.token === null,
	);
	const changed = view.fresh(held.own.token);
	const options: Option[] = [
		absent,
		...optionsFor(row, view.theme)
			// the absent option already says this one: two entries spelled the same
			// with different meanings is the confusion the rail exists to remove
			.filter((option) => option.name !== clearTo)
			.map((option) => ({
				token: option.name,
				name: option.token,
				value: option.says,
				...(option.from === "default" ? { group: "default" } : {}),
			})),
	];
	const current: Option =
		held.shown.value === null
			? absent
			: (options.find((option) => option.token === held.shown.value) ?? {
					token: held.shown.value,
					name: held.shown.token ?? held.shown.value,
					value: held.shown.says ?? "",
				});
	return (
		<Row name={name ?? row.property} ok={ok} changed={changed}>
			<Menu
				current={current}
				options={options}
				ok={ok}
				faint={held.own.token === null}
				changed={changed}
				filter={options.length > 8}
				label={name ?? row.property}
				arbitrary={(typed) => arbitraryOption(row, typed)}
				onPick={(token) => {
					const explicit = token === null && clearTo !== undefined && view.scope.length > 0 ? clearTo : token;
					view.put(editsFor(row, explicit === null ? null : { kind: "value", value: explicit }, atOf(view)));
				}}
			/>
			{fold}
		</Row>
	);
}

/**
 * Typed text as this row's own arbitrary value, or nothing when it takes none.
 *
 * The token is the model's, so what the field accepts is exactly what the row
 * would write; the menu shows the whole token and carries the value half, which
 * is what a pick hands back.
 */
function arbitraryOption(row: ModelRow, typed: string): Option | null {
	const spelled = unlinkTo(row, typed);
	if (!spelled.ok) return null;
	const value = /\[.+\]$/.exec(spelled.token)?.[0];
	if (value === undefined) return null;
	return { token: value, name: spelled.token, value: value.slice(1, -1).replace(/_/g, " "), group: "arbitrary" };
}

/* ---------- P4: a set of chips, several on at once ---------- */

function ToggleRow({
	view,
	property,
	menuGroup,
}: {
	view: View;
	property: string;
	menuGroup?: readonly string[] | undefined;
}) {
	const row = modelRow(property);
	if (row.rule.kind !== "toggles") throw new Error(`"${property}" is not a toggle set`);
	const set = row.rule.set;
	const ok = okOf(view, row);
	const on = toggledOf(view.scoped, set);
	const inherited = view.scope.length > 0 ? toggledOf(view.base, set) : new Set<string>();
	const chips = set.groups.filter((group) => group !== menuGroup).flat();
	const menuOn = menuGroup === undefined ? null : (menuGroup.find((token) => on.has(token)) ?? null);
	const none = `${menuGroup?.[0]?.split("-")[0] ?? ""}-none`;
	const write = (token: string, next: boolean) =>
		view.put(editsFor(row, { kind: "toggle", token, on: next }, atOf(view)));
	return (
		<Row name={row.property} ok={ok} tall changed={[...on].some((token) => view.fresh(token))}>
			<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
				{chips.map((token) => (
					<Chip
						key={token}
						label={token}
						on={on.has(token) || inherited.has(token)}
						ok={ok}
						onChange={(next) => write(token, next)}
					/>
				))}
				{menuGroup === undefined ? null : (
					<span className="w-[88px]">
						<Menu
							current={menuOn === null ? { token: null, name: none } : { token: menuOn, name: menuOn }}
							options={[{ token: null, name: none }, ...menuGroup.map((token) => ({ token, name: token }))]}
							ok={ok}
							faint={menuOn === null}
							label={`${row.property} amount`}
							onPick={(token) => {
								if (token === null) {
									if (menuOn !== null) write(menuOn, false);
									return;
								}
								write(token, true);
							}}
						/>
					</span>
				)}
			</div>
		</Row>
	);
}

/* ---------- P7: the folds ---------- */

type Sides = Record<Side, string | null>;

interface FoldRows {
	/** one row when every side agrees, two on the axes, four on the sides */
	levels: readonly (readonly { property: string; name?: string; sides: readonly Side[] }[])[];
}

function levelOf(sides: Sides, max: number): number {
	if (sides.t === sides.r && sides.r === sides.b && sides.b === sides.l) return 0;
	if (sides.t === sides.b && sides.l === sides.r) return Math.min(1, max);
	return max;
}

/**
 * Padding, margin, gap, the radius corners and the border edges (P7).
 *
 * One box while every side agrees, opened by the caret into the axes and then
 * the sides. Only which rows draw is decided here: the write is one token per
 * row, and the fewest-tokens spelling that comes back — `p-4`, `px-4 py-2`,
 * `p-4 pt-2` where three of four agree — is the write lane's, which is where it
 * has to be for a `hover:` write and a base write to spell the same.
 */
function Folded({
	view,
	fold,
	read,
	draw,
}: {
	view: View;
	fold: FoldRows;
	read: (scoped: string) => Sides;
	draw: (
		entry: { property: string; name?: string; sides: readonly Side[] },
		caret: ReactNode,
		read: (scoped: string) => string | null,
	) => ReactNode;
}) {
	const [want, setWant] = useState(0);
	const max = fold.levels.length - 1;
	const own = read(view.scoped);
	const inherited = view.scope.length > 0 ? read(view.base) : own;
	const even = Object.values(own).every((value) => value === null) ? inherited : own;
	const natural = levelOf(even, max);
	const level = Math.min(max, Math.max(want, natural));
	const rows = fold.levels[level] ?? [];
	const ok = fold.levels[0]?.[0] === undefined ? false : okOf(view, modelRow(fold.levels[0][0].property));
	const caret = (
		<Fold
			open={level > 0}
			ok={ok && (level === 0 || natural === 0)}
			onToggle={() => setWant(level >= max ? 0 : level + 1)}
		/>
	);
	return (
		<>
			{rows.map((entry, index) =>
				draw(entry, index === 0 ? caret : null, (scoped) => read(scoped)[entry.sides[0] ?? "t"]),
			)}
		</>
	);
}

const SPACING_FOLD = (prefix: "padding" | "margin"): FoldRows => ({
	levels: [
		[{ property: prefix, sides: ["t", "r", "b", "l"] }],
		[
			{ property: `${prefix}-inline`, sides: ["l", "r"] },
			{ property: `${prefix}-block`, sides: ["t", "b"] },
		],
		[
			{ property: `${prefix}-top`, sides: ["t"] },
			{ property: `${prefix}-right`, sides: ["r"] },
			{ property: `${prefix}-bottom`, sides: ["b"] },
			{ property: `${prefix}-left`, sides: ["l"] },
		],
	],
});

const GAP_FOLD: FoldRows = {
	levels: [
		[{ property: "gap", sides: ["t", "r", "b", "l"] }],
		[
			{ property: "column-gap", sides: ["l", "r"] },
			{ property: "row-gap", sides: ["t", "b"] },
		],
	],
};

const RADIUS_FOLD: FoldRows = {
	levels: [
		[{ property: "border-radius", sides: ["t", "r", "b", "l"] }],
		[
			{ property: "border-top-left-radius", name: "top-left", sides: ["t"] },
			{ property: "border-top-right-radius", name: "top-right", sides: ["r"] },
			{ property: "border-bottom-right-radius", name: "bottom-right", sides: ["b"] },
			{ property: "border-bottom-left-radius", name: "bottom-left", sides: ["l"] },
		],
	],
};

const BORDER_WIDTH_FOLD: FoldRows = {
	levels: [
		[{ property: "border-width", sides: ["t", "r", "b", "l"] }],
		[
			{ property: "border-top-width", name: "top", sides: ["t"] },
			{ property: "border-right-width", name: "right", sides: ["r"] },
			{ property: "border-bottom-width", name: "bottom", sides: ["b"] },
			{ property: "border-left-width", name: "left", sides: ["l"] },
		],
	],
};

const BORDER_COLOUR_FOLD: FoldRows = {
	levels: [
		[{ property: "border-color", sides: ["t", "r", "b", "l"] }],
		[
			{ property: "border-top-color", name: "top", sides: ["t"] },
			{ property: "border-right-color", name: "right", sides: ["r"] },
			{ property: "border-bottom-color", name: "bottom", sides: ["b"] },
			{ property: "border-left-color", name: "left", sides: ["l"] },
		],
	],
};

/** The four corners as a `Sides` reading, so the radius folds like the rest. */
function cornersAsSides(scoped: string, theme: CompiledTheme | null): Sides {
	const corners = cornersOf(scoped, theme);
	return { t: corners.tl, r: corners.tr, b: corners.br, l: corners.bl };
}

/* ---------- P3: the gradient, as rows ---------- */

const SHAPES: readonly Option[] = [
	{ token: null, name: "none" },
	{ token: "linear", name: "bg-linear-*" },
	{ token: "radial", name: "bg-radial" },
	{ token: "conic", name: "bg-conic" },
];

const DIRECTION_OPTIONS: readonly Option[] = DIRECTIONS.map((direction) => ({
	token: direction.value,
	name: direction.value,
	value: direction.says,
}));

/**
 * `background-image` as a shape, a direction and three stop rows.
 *
 * The rows say the tokens, which is what the file holds: a drawn bar shows
 * positions and hides the names, and the names are what you came to the rail
 * for. `none` drops every gradient token at once rather than leaving orphan
 * `from-`/`to-` classes behind, which is the model's own rule.
 */
function GradientRows({ view }: { view: View }) {
	const row = modelRow("background-image");
	const ok = okOf(view, row);
	const own = gradientOf(view.scoped, view.theme);
	const gradient = own ?? (view.scope.length > 0 ? gradientOf(view.base, view.theme) : null);
	const changed = view.fresh(own?.token ?? null);
	const write = (next: Gradient | null) => view.put(editsFor(row, { kind: "gradient", gradient: next }, atOf(view)));
	const current =
		gradient === null ? SHAPES[0] : (SHAPES.find((shape) => shape.token === gradient.shape) ?? SHAPES[0]);
	return (
		<>
			<Row name="background-image" ok={ok} changed={changed}>
				<Menu
					current={current ?? { token: null, name: "none" }}
					options={SHAPES}
					ok={ok}
					faint={own === null}
					changed={changed}
					label="background-image"
					onPick={(picked) => {
						if (picked === null) return write(null);
						write({
							shape: picked as Gradient["shape"],
							direction: picked === "linear" ? (gradient?.direction ?? "to-r") : null,
							stops: gradient?.stops ?? [
								{ at: "from", colour: null, position: null },
								{ at: "via", colour: null, position: null },
								{ at: "to", colour: null, position: null },
							],
							token: gradient?.token ?? "",
						});
					}}
				/>
				{gradient === null ? null : (
					<span
						className="h-3 w-6 shrink-0 rounded-[2px] border border-border-raised"
						style={{ background: gradientCss(gradient) }}
					/>
				)}
			</Row>
			{gradient === null ? null : (
				<>
					{gradient.shape === "linear" ? (
						<Row name="direction" ok={ok}>
							<Menu
								current={
									DIRECTION_OPTIONS.find((option) => option.token === gradient.direction) ?? {
										token: gradient.direction,
										name: gradient.direction ?? "to-r",
									}
								}
								options={DIRECTION_OPTIONS}
								ok={ok}
								label="gradient direction"
								onPick={(direction) => write({ ...gradient, direction })}
							/>
							<span className="w-[48px] shrink-0">
								<NumField
									value={
										gradient.direction !== null && /^\d+$/.test(gradient.direction) ? gradient.direction : ""
									}
									placeholder="deg"
									ok={ok}
									faint
									onCommit={(typed) => {
										const degrees = Number.parseInt(typed, 10);
										if (!Number.isNaN(degrees))
											write({ ...gradient, direction: String(((degrees % 360) + 360) % 360) });
									}}
									onStep={(units) => {
										const now =
											gradient.direction !== null && /^\d+$/.test(gradient.direction)
												? Number(gradient.direction)
												: 90;
										write({ ...gradient, direction: String((((now + units * 15) % 360) + 360) % 360) });
									}}
								/>
							</span>
						</Row>
					) : null}
					{gradient.stops.map((stop, index) => (
						<Row key={stop.at} name={stop.at} ok={ok} changed={changed && stop.colour !== null}>
							<Menu
								current={
									stop.colour?.name == null
										? { token: null, name: "none", swatch: "" }
										: { token: stop.colour.name, name: stop.colour.name, swatch: stop.colour.paint ?? "" }
								}
								options={[{ token: null, name: "none", swatch: "" }, ...colourOptions(view.theme)]}
								ok={ok}
								faint={stop.colour === null}
								filter
								label={`gradient ${stop.at}`}
								arbitrary={(typed) => colourTyped(view.theme, typed)}
								onPick={(name) =>
									write({
										...gradient,
										stops: gradient.stops.map((candidate, at) =>
											at === index
												? {
														...candidate,
														colour:
															name === null
																? null
																: {
																		token: null,
																		name,
																		alpha: candidate.colour?.alpha ?? null,
																		paint: paintWith(
																			paintOf(view.theme, name) ?? "",
																			candidate.colour?.alpha ?? null,
																		),
																	},
													}
												: candidate,
										),
									})
								}
							/>
							<AlphaField
								alpha={stop.colour?.alpha ?? null}
								ok={ok && stop.colour !== null}
								faint={false}
								onCommit={(alpha) =>
									write({
										...gradient,
										stops: gradient.stops.map((candidate, at) =>
											at === index && candidate.colour !== null
												? { ...candidate, colour: { ...candidate.colour, alpha } }
												: candidate,
										),
									})
								}
							/>
							<span className="w-[44px] shrink-0">
								<NumField
									value={stop.position === null ? "" : stop.position.replace("%", "")}
									placeholder={index === 0 ? "0" : index === 1 ? "50" : "100"}
									readout="%"
									ok={ok && stop.colour !== null}
									faint={stop.position === null}
									onCommit={(typed) => {
										const percent = Number.parseFloat(typed);
										write({
											...gradient,
											stops: gradient.stops.map((candidate, at) =>
												at === index
													? {
															...candidate,
															position: Number.isNaN(percent)
																? null
																: `${Math.max(0, Math.min(100, percent))}%`,
														}
													: candidate,
											),
										});
									}}
									onStep={(units) => {
										const now =
											stop.position === null
												? index === 0
													? 0
													: index === 1
														? 50
														: 100
												: Number.parseFloat(stop.position);
										write({
											...gradient,
											stops: gradient.stops.map((candidate, at) =>
												at === index
													? { ...candidate, position: `${Math.max(0, Math.min(100, now + units * 5))}%` }
													: candidate,
											),
										});
									}}
								/>
							</span>
						</Row>
					))}
				</>
			)}
		</>
	);
}

/* ---------- a row drawn from its rule alone, for everything not led with ---------- */

function AutoRow({ view, row }: { view: View; row: ModelRow }) {
	switch (row.rule.kind) {
		case "length":
			return <LengthRow view={view} property={row.property} />;
		case "border-width":
			return <BorderWidthRow view={view} property={row.property} />;
		case "colour":
			return <ColourRow view={view} property={row.property} absent="none" />;
		case "word":
			return <WordRow view={view} property={row.property} />;
		case "theme":
			return <TokenRow view={view} property={row.property} absent={UNSET} />;
		case "radius":
			return <TokenRow view={view} property={row.property} absent={UNSET} />;
		case "toggles":
			return <ToggleRow view={view} property={row.property} />;
		case "gradient":
			return <GradientRows view={view} />;
		case "size-mode":
			return null;
		case "read":
			return null;
	}
}

/**
 * The rest of a section: whatever this element wears that the section did not
 * lead with.
 *
 * Which rows a section leads with is the design's, and a rail that drew all
 * hundred and thirty families would be a wall nobody reads. But a token on the
 * literal with nowhere to change it is the absence this ticket removes, so any
 * family the element is actually wearing draws itself here. A family it is not
 * wearing and has no row for is reached by the `+ class` at the foot, which is
 * what P5 is for.
 */
function Rest({ view, section, drawn }: { view: View; section: SectionName; drawn: ReadonlySet<string> }) {
	const worn = rowsIn(section).filter(
		(row) =>
			!drawn.has(row.property) && row.primitive !== "read" && readRow(row, view.scoped, view.theme).token !== null,
	);
	return (
		<>
			{worn.map((row) => (
				<AutoRow key={row.property} view={view} row={row} />
			))}
		</>
	);
}

/* ---------- the sections ---------- */

const PLACED = new Set(["absolute", "fixed", "sticky"]);
const INSET_SIDES: readonly { side: Side; property: string }[] = [
	{ side: "t", property: "top" },
	{ side: "r", property: "right" },
	{ side: "b", property: "bottom" },
	{ side: "l", property: "left" },
];

function PositionSection({ view }: { view: View }) {
	const position = wordOf(view.scoped, "position") ?? (view.scope.length > 0 ? wordOf(view.base, "position") : null);
	const placed = position !== null && PLACED.has(position);
	const drawn = new Set(["position", "z-index", ...(placed ? INSET_SIDES.map((entry) => entry.property) : [])]);
	return (
		<Section name="position" reason={sectionReason(view, ["position"])}>
			<WordRow view={view} property="position" />
			{placed
				? INSET_SIDES.map((entry) => (
						<LengthRow
							key={entry.property}
							view={view}
							property={entry.property}
							read={(scoped) => insetOf(scoped)[entry.side]}
						/>
					))
				: null}
			{placed || lengthOf(view.scoped, "z") !== null ? (
				<LengthRow view={view} property="z-index" placeholder="auto" fallback="auto" />
			) : null}
			<Rest view={view} section="position" drawn={drawn} />
		</Section>
	);
}

/** width and height, each a length and a mode: hug is no token, fill is `w-full`. */
function SizeSection({ view }: { view: View }) {
	const drawn = new Set(["width", "height", "width mode", "height mode"]);
	return (
		<Section name="size" reason={sectionReason(view, ["width", "height"])}>
			{(["w", "h"] as const).map((axis) => {
				const property = axis === "w" ? "width" : "height";
				const modeRow = modelRow(axis === "w" ? "width mode" : "height mode");
				const measured = Math.round(axis === "w" ? view.box.w : view.box.h);
				const own = lengthOf(view.scoped, axis);
				const mode = sizeModeOf(view.scoped, axis);
				const shownMode = own === null && view.scope.length > 0 ? sizeModeOf(view.base, axis) : mode;
				const options: Option[] = SIZE_MODES.map((entry) => ({ token: entry.mode, name: entry.says }));
				return (
					<LengthRow
						key={axis}
						view={view}
						property={property}
						measured={measured}
						fallback={`${measured}px`}
						placeholder={mode === "fill" ? `${axis}-full` : "auto"}
						aside={
							<span className="w-[58px] shrink-0">
								<Menu
									current={
										options.find((option) => option.token === shownMode) ?? { token: "hug", name: "hug" }
									}
									options={options}
									ok={okOf(view, modeRow)}
									faint={own === null && mode === "hug"}
									label={`${property} mode`}
									onPick={(token) =>
										view.put(
											editsFor(
												modeRow,
												{ kind: "mode", mode: (token ?? "hug") as SizeMode, measured },
												atOf(view),
											),
										)
									}
								/>
							</span>
						}
					/>
				);
			})}
			<Rest view={view} section="size" drawn={drawn} />
		</Section>
	);
}

const FLEX_DISPLAYS = new Set(["flex", "inline-flex"]);
const SCROLLS = new Set(["overflow-auto", "overflow-scroll"]);

function LayoutSection({ view }: { view: View }) {
	const read = (className: string) => ({
		display: wordOf(className, "display"),
		direction: wordOf(className, "direction"),
		align: wordOf(className, "align"),
		justify: wordOf(className, "justify"),
		wrap: wordOf(className, "wrap"),
	});
	const own = read(view.scoped);
	const base = view.scope.length > 0 ? read(view.base) : own;
	const display = own.display ?? base.display;
	const flex = display !== null && FLEX_DISPLAYS.has(display);
	const grid = display === "grid";
	const column = (own.direction ?? base.direction) === "flex-col";
	const overflow = wordOf(view.scoped, "overflow") ?? (view.scope.length > 0 ? wordOf(view.base, "overflow") : null);
	const scrolls = overflow !== null && SCROLLS.has(overflow);
	const directionRow = modelRow("flex-direction");
	const wrapRow = modelRow("flex-wrap");
	const alignRow = modelRow("align-items");
	const justifyRow = modelRow("justify-content");
	const drawn = new Set([
		"display",
		"overflow",
		"padding",
		"padding-inline",
		"padding-block",
		"padding-top",
		"padding-right",
		"padding-bottom",
		"padding-left",
		"margin",
		"margin-inline",
		"margin-block",
		"margin-top",
		"margin-right",
		"margin-bottom",
		"margin-left",
		...(flex ? ["flex-direction", "flex-wrap", "align-items", "justify-content"] : []),
		...(grid ? ["grid-template-columns"] : []),
		...(flex || grid ? ["gap", "column-gap", "row-gap"] : []),
		...(scrolls ? ["scroll-snap-type"] : []),
	]);
	return (
		<Section name="layout" reason={sectionReason(view, ["display", "padding"])}>
			<WordRow view={view} property="display" />
			{flex ? (
				<>
					<Row name="flex-direction" ok={okOf(view, directionRow)} changed={view.fresh(own.direction)}>
						<IconField
							value={own.direction ?? base.direction ?? "flex-row"}
							ok={okOf(view, directionRow)}
							options={[
								{ token: "flex-row", icon: <ArrowIcon /> },
								{ token: "flex-col", icon: <ArrowIcon down /> },
							]}
							onPick={(token) => view.put(editsFor(directionRow, { kind: "value", value: token }, atOf(view)))}
						/>
						<span className={cn("ml-auto shrink-0", FAINT)}>{column ? "column" : "row"}</span>
						<Chip
							label="wrap"
							on={(own.wrap ?? base.wrap) === "flex-wrap"}
							ok={okOf(view, wrapRow)}
							onChange={(next) =>
								view.put(editsFor(wrapRow, next ? { kind: "value", value: "flex-wrap" } : null, atOf(view)))
							}
						/>
					</Row>
					<Row
						name="items / justify"
						ok={okOf(view, alignRow)}
						tall
						changed={view.fresh(own.align) || view.fresh(own.justify)}
					>
						<PlaceField
							align={own.align ?? base.align}
							justify={own.justify ?? base.justify}
							column={column}
							ok={okOf(view, alignRow)}
							onPick={(align, justify) =>
								view.put([
									...editsFor(alignRow, { kind: "value", value: align }, atOf(view)),
									...editsFor(justifyRow, { kind: "value", value: justify }, atOf(view)),
								])
							}
						/>
						<span className="flex min-w-0 flex-1 flex-col gap-1">
							<PlaceMenu view={view} row={alignRow} own={own.align} base={base.align} />
							<PlaceMenu view={view} row={justifyRow} own={own.justify} base={base.justify} />
						</span>
					</Row>
				</>
			) : null}
			{grid ? <LengthRow view={view} property="grid-template-columns" placeholder="none" /> : null}
			{flex || grid ? (
				<Folded
					view={view}
					fold={GAP_FOLD}
					read={(scoped) => {
						const gap = gapOf(scoped);
						return { t: gap.y, b: gap.y, l: gap.x, r: gap.x };
					}}
					draw={(entry, caret, read) => (
						<LengthRow
							key={entry.property}
							view={view}
							property={entry.property}
							placeholder="0"
							read={read}
							aside={caret}
						/>
					)}
				/>
			) : null}
			<Folded
				view={view}
				fold={SPACING_FOLD("padding")}
				read={(scoped) => sidesOf(scoped, "p")}
				draw={(entry, caret, read) => (
					<LengthRow
						key={entry.property}
						view={view}
						property={entry.property}
						placeholder="0"
						read={read}
						aside={caret}
					/>
				)}
			/>
			<Folded
				view={view}
				fold={SPACING_FOLD("margin")}
				read={(scoped) => sidesOf(scoped, "m")}
				draw={(entry, caret, read) => (
					<LengthRow
						key={entry.property}
						view={view}
						property={entry.property}
						placeholder="0"
						read={read}
						aside={caret}
					/>
				)}
			/>
			<WordRow view={view} property="overflow" />
			{scrolls ? <ToggleRow view={view} property="scroll-snap-type" /> : null}
			<Rest view={view} section="layout" drawn={drawn} />
		</Section>
	);
}

function PlaceMenu({ view, row, own, base }: { view: View; row: ModelRow; own: string | null; base: string | null }) {
	if (row.rule.kind !== "word") return null;
	const options: Option[] = [
		UNSET,
		...optionsFor(row, view.theme).map((option) => ({ token: option.token, name: option.token })),
	];
	const shown = own ?? base;
	const fallback = `${row.rule.word === "align" ? "items" : "justify"}-${WORDS[row.rule.word].fallback}`;
	return (
		<Menu
			current={shown === null ? { token: null, name: fallback } : { token: shown, name: shown }}
			options={options}
			ok={okOf(view, row)}
			faint={own === null}
			changed={view.fresh(own)}
			label={row.property}
			onPick={(token) =>
				view.put(editsFor(row, token === null ? null : { kind: "value", value: token }, atOf(view)))
			}
		/>
	);
}

const MORE_APPEARANCE = ["rotate", "scale", "translate-x", "translate-y", "transition-duration"] as const;

function AppearanceSection({ view }: { view: View }) {
	const [more, setMore] = useState(false);
	const transforms = MORE_APPEARANCE.some((property) => {
		const row = rowFor(property);
		return row !== undefined && readRow(row, view.scoped, view.theme).token !== null;
	});
	const easing = themeOf(view.scoped, "ease", "ease", view.theme) !== null;
	const filters = toggledOf(view.scoped, FILTER_SET).size > 0;
	const opened = more || transforms || easing || filters;
	const drawn = new Set([
		"opacity",
		"border-radius",
		"border-top-left-radius",
		"border-top-right-radius",
		"border-bottom-right-radius",
		"border-bottom-left-radius",
		"box-shadow",
		...(opened ? ["filter", ...MORE_APPEARANCE, "transition-timing-function"] : []),
	]);
	return (
		<Section name="appearance" reason={sectionReason(view, ["opacity"])}>
			<LengthRow view={view} property="opacity" placeholder="100" fallback="100%" />
			<Folded
				view={view}
				fold={RADIUS_FOLD}
				read={(scoped) => cornersAsSides(scoped, view.theme)}
				draw={(entry, caret) => (
					<TokenRow
						key={entry.property}
						view={view}
						property={entry.property}
						{...(entry.name === undefined ? {} : { name: entry.name })}
						absent={{ token: null, name: "rounded-none", value: "0" }}
						clearTo="none"
						fold={caret}
					/>
				)}
			/>
			{/* a shadow nobody had set used to be dead text with no way in: it is a menu */}
			<TokenRow
				view={view}
				property="box-shadow"
				absent={{ token: null, name: "shadow-none", value: "none" }}
				clearTo="none"
			/>
			{opened ? (
				<>
					<ToggleRow view={view} property="filter" menuGroup={FILTER_SET.groups[3]} />
					<LengthRow view={view} property="rotate" placeholder="0" fallback="0deg" />
					<LengthRow view={view} property="scale" placeholder="100" fallback="100%" />
					<LengthRow view={view} property="translate-x" placeholder="0" fallback="0px" />
					<LengthRow view={view} property="translate-y" placeholder="0" fallback="0px" />
					<LengthRow view={view} property="transition-duration" placeholder="0" fallback="0ms" />
					<TokenRow
						view={view}
						property="transition-timing-function"
						absent={{ token: null, name: "ease-default", value: "" }}
					/>
				</>
			) : (
				<div className="flex h-7 items-center px-1.5">
					<button
						type="button"
						onClick={() => setMore(true)}
						className={cn(
							"flex h-6 cursor-pointer items-center gap-1.5 rounded-xs px-1.5 hover:bg-surface hover:text-text",
							FAINT,
						)}
					>
						<span className="text-sm leading-none">+</span>
						<span className={LABEL}>filter, transform, transition</span>
					</button>
				</div>
			)}
			<Rest view={view} section="appearance" drawn={drawn} />
		</Section>
	);
}

function FillSection({ view }: { view: View }) {
	return (
		<Section name="fill" reason={sectionReason(view, ["background-color"])}>
			<ColourRow view={view} property="background-color" absent="transparent" />
			<GradientRows view={view} />
			<Rest view={view} section="fill" drawn={new Set(["background-color", "background-image"])} />
		</Section>
	);
}

/**
 * Width and colour, each folding to the four edges.
 *
 * The colour rows appear only once a width exists: a border colour with no
 * width paints nothing, so offering one is offering a field that cannot change
 * a pixel.
 */
function StrokeSection({ view }: { view: View }) {
	const widths = borderWidthsOf(view.scoped);
	const baseWidths = view.scope.length > 0 ? borderWidthsOf(view.base) : widths;
	const any = [...Object.values(widths), ...Object.values(baseWidths)].some((width) => width !== null);
	const drawn = new Set([
		...BORDER_WIDTH_FOLD.levels.flat().map((entry) => entry.property),
		// `border-s` and `border-e` are the fold's left and right edges under
		// their logical names: it already draws them, and reading `border` as
		// both would put the same width on screen three times
		"border-inline-start-width",
		"border-inline-end-width",
		...(any ? BORDER_COLOUR_FOLD.levels.flat().map((entry) => entry.property) : []),
	]);
	return (
		<Section name="stroke" reason={sectionReason(view, ["border-width"])}>
			<Folded
				view={view}
				fold={BORDER_WIDTH_FOLD}
				read={borderWidthsOf}
				draw={(entry, caret) => (
					<BorderWidthRow
						key={entry.property}
						view={view}
						property={entry.property}
						{...(entry.name === undefined ? {} : { name: entry.name })}
						fold={caret}
					/>
				)}
			/>
			{any ? (
				<Folded
					view={view}
					fold={BORDER_COLOUR_FOLD}
					read={(scoped) => {
						const colours = borderColoursOf(scoped, view.theme);
						return { t: colours.t.name, r: colours.r.name, b: colours.b.name, l: colours.l.name };
					}}
					draw={(entry, caret) => {
						const side = entry.sides[0] ?? "t";
						return (
							<ColourRow
								key={entry.property}
								view={view}
								property={entry.property}
								{...(entry.name === undefined ? {} : { name: entry.name })}
								absent="border"
								read={(scoped) => borderColoursOf(scoped, view.theme)[side]}
								fold={caret}
							/>
						);
					}}
				/>
			) : null}
			<Rest view={view} section="stroke" drawn={drawn} />
		</Section>
	);
}

function TextSection({ view }: { view: View }) {
	const alignRow = modelRow("text-align");
	const align = wordOf(view.scoped, "text-align") ?? (view.scope.length > 0 ? wordOf(view.base, "text-align") : null);
	const drawn = new Set([
		"font-family",
		"font-size",
		"font-weight",
		"line-height",
		"letter-spacing",
		"text-align",
		"color",
		"font-variant-numeric",
	]);
	return (
		<Section name="text" reason={sectionReason(view, ["font-size", "color"])}>
			<TokenRow view={view} property="font-family" absent={{ token: null, name: "inherit" }} />
			<TokenRow view={view} property="font-size" absent={{ token: null, name: "inherit" }} />
			<TokenRow view={view} property="font-weight" absent={{ token: null, name: "inherit" }} />
			<TokenRow view={view} property="line-height" absent={{ token: null, name: "inherit" }} />
			<TokenRow view={view} property="letter-spacing" absent={{ token: null, name: "inherit" }} />
			<Row name="text-align" ok={okOf(view, alignRow)} changed={view.fresh(wordOf(view.scoped, "text-align"))}>
				<IconField
					value={align ?? "text-left"}
					ok={okOf(view, alignRow)}
					options={[
						{ token: "text-left", icon: <LinesIcon at="left" /> },
						{ token: "text-center", icon: <LinesIcon at="center" /> },
						{ token: "text-right", icon: <LinesIcon at="right" /> },
					]}
					onPick={(token) => view.put(editsFor(alignRow, { kind: "value", value: token }, atOf(view)))}
				/>
			</Row>
			<ColourRow view={view} property="color" absent="inherit" />
			<ToggleRow view={view} property="font-variant-numeric" />
			<Rest view={view} section="text" drawn={drawn} />
		</Section>
	);
}

/** Every section, in Figma's order, which is the order the rail draws them. */
export function PropertySections({ view }: { view: View }) {
	return (
		<>
			<PositionSection view={view} />
			<SizeSection view={view} />
			<LayoutSection view={view} />
			<AppearanceSection view={view} />
			<FillSection view={view} />
			<StrokeSection view={view} />
			<TextSection view={view} />
		</>
	);
}

/* ---------- P5: the `+ class`, at the foot ---------- */

/**
 * What the `+` offers before anything is typed.
 *
 * A short list of the classes a rail has no row for, which is the point of the
 * field: `flex-1` has a row, `[mask-type:luminance]` never will. Nothing here
 * is a catalogue of what compiles — the compiler answers that for every one of
 * them, including whatever is typed over them.
 */
const SEEDS: readonly string[] = [
	"shrink-0",
	"grow",
	"select-none",
	"pointer-events-none",
	"cursor-pointer",
	"sr-only",
	"aspect-square",
	"antialiased",
	"transition",
	"transition-colors",
	"animate-pulse",
	"outline-none",
	"backdrop-blur-sm",
	"[mask-type:luminance]",
	"content-['']",
];

export function AddClassRow({
	view,
	taken,
	onAdd,
}: {
	view: View;
	/** the whole literal's tokens, so one the element already wears is not offered */
	taken: ReadonlySet<string>;
	onAdd: (token: string) => void;
}) {
	return (
		<AddField
			candidates={SEEDS.map((token) => ({ token }))}
			taken={taken}
			ok={view.element.refusal === undefined}
			verdictOf={view.compiler.verdictOf}
			onAsk={view.compiler.ask}
			onAdd={onAdd}
			className="-ml-1.5"
		/>
	);
}
