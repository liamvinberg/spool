import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { ThemeToken } from "../../daemon/theme";
import {
	borderColoursOf,
	borderWidthsOf,
	type Colour,
	colourOf,
	colourToken,
	cornersOf,
	DIRECTIONS,
	describe,
	FILTER_SET,
	type Gradient,
	type GradientShape,
	gapOf,
	gradientAngle,
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
	type Stop,
	sidesOf,
	sizeModeOf,
	stepLength,
	themeOf,
	toggledOf,
	WORDS,
	type Word,
	wordOf,
} from "../../properties/families";
import {
	type At,
	boxRefusal,
	displayOf,
	type Row as ModelRow,
	optionsFor,
	type RowElement,
	type RowValue,
	type Rule,
	readRow,
	rowFor,
	rowsIn,
	type Section as SectionName,
	signedRow,
	unlinkTo,
	verdictFor,
} from "../../properties/rows";
import { arbitraryColourName, KEYWORD_COLOURS, listOf, paintOf, paintWith, stepOf } from "../../properties/theme";
import { propertySamplePlaceholder, type SourcePropertyValue } from "../../source-property";
import type { CompiledTheme } from "../api";
import { cn } from "../cn";
import type { Compiler } from "./properties-compile";
import {
	AddField,
	ArrowIcon,
	Chip,
	FAINT,
	Fold,
	IconField,
	LABEL,
	Menu,
	NumField,
	type Option,
	PlaceField,
	Row,
	Section,
} from "./properties-fields";
import type { Scope } from "./properties-scope";
import { scopeKey } from "./properties-scope";
import { PropertyColorField } from "./property-color-field";
import {
	type PropertyControls,
	type PropertyDescription,
	propertyControlValue,
	propertyNumericSample,
	readsFromSource,
	sourceProperty,
	sourcePropertyName,
} from "./property-controls";
import { type NumericTokenProperty, PropertyNumberField } from "./property-number-field";

/** Rows read candidate spellings from the shared property inventory.
 * Every control retains an original source operation through preview and completion.
 */

/** What every row is handed: the element under one scope, and how to write under it. */
export interface View {
	property: PropertyControls | null;
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
	/** What the source says this element's class cell wears, or why it cannot be written. */
	described?: PropertyDescription | undefined;
}

function atOf(view: View): At {
	return { scoped: view.scoped, theme: view.theme };
}

function writeValue(view: View, row: ModelRow, value: RowValue): void {
	if (!sourceProperty(row)) return;
	view.property?.apply(sourcePropertyName(row), propertyControlValue(row, value, atOf(view), scopeKey(view.scope)));
}

/** Two properties one control decides together: an alignment is both of them. */
function writeFields(view: View, changes: readonly { row: ModelRow; value: RowValue }[]): void {
	view.property?.applyFields(
		changes.map((change) => ({
			property: sourcePropertyName(change.row),
			value: propertyControlValue(change.row, change.value, atOf(view), scopeKey(view.scope)),
		})),
	);
}

/** Pointer moves preview one original number; only release completes that source operation. */
function usePropertyScrub(
	view: View,
	row: ModelRow,
	value: string,
	step: (from: string, units: number) => string | undefined,
) {
	const control = sourceProperty(row) ? view.property : null;
	const held = useRef<{ value: string; moved: boolean } | undefined>(undefined);
	const [draft, setDraft] = useState<string>();
	const scope = scopeKey(view.scope);
	// biome-ignore lint/correctness/useExhaustiveDependencies: new authored values or scopes retire the displayed scrub draft
	useEffect(() => {
		setDraft(undefined);
	}, [value, scope]);
	const finish = (commit: boolean) => {
		const original = held.current;
		if (!original) return;
		held.current = undefined;
		control?.finish(commit && original.moved);
		if (!commit || !original.moved) setDraft(undefined);
	};
	return control
		? {
				value: draft ?? value,
				start: () => {
					held.current = { value, moved: false };
					control.begin(sourcePropertyName(row));
				},
				move: (units: number) => {
					const original = held.current;
					if (!original) return;
					const next = step(original.value, units);
					if (next === undefined) return;
					original.value = next;
					original.moved = true;
					setDraft(next);
					control.preview(
						sourcePropertyName(row),
						propertyControlValue(row, { kind: "value", value: next }, atOf(view), scope),
						propertyNumericSample(row, { kind: "value", value: next }),
					);
				},
				end: () => finish(true),
				cancel: () => finish(false),
			}
		: undefined;
}

/** The model row this property is, which is a programming error when it is missing. */
function modelRow(property: string): ModelRow {
	const row = rowFor(property);
	if (row === undefined) throw new Error(`no property row "${property}"`);
	return row;
}

/**
 * The same lookup, with the rule narrowed to the kind the control expects.
 *
 * A control is written against one kind of rule and the section that draws it
 * names its property as a string; this is where the two meet. A mismatch is a
 * programming error rather than a state the rail can be in, so it throws where
 * the section is wrong rather than drawing an empty field where the user is.
 */
function ruleRow<K extends Rule["kind"]>(property: string, kind: K): ModelRow & { rule: Extract<Rule, { kind: K }> } {
	const row = modelRow(property);
	if (row.rule.kind !== kind) throw new Error(`"${property}" is not a ${kind} row`);
	return row as ModelRow & { rule: Extract<Rule, { kind: K }> };
}

/** Whether this row may be written here, and the reason it may not. */
function okOf(view: View, row: ModelRow): boolean {
	return rowAdmission(view, row).ok;
}

/**
 * What a control is allowed to write, in the source's own words.
 *
 * An open session is somewhere to send a request, never evidence that the source
 * will take one: the element's own description says whether its class cell can
 * be written, and a control that draws the source's own reading has nothing to
 * offer until it has one. A control that reads the class keeps its field while
 * the source is still answering, and loses it when the source refuses.
 */
function rowAdmission(view: View, row: ModelRow): { ok: boolean; reason: string | undefined } {
	// What the element itself cannot wear comes first. The write lane's own
	// refusal is not asked about: a class cell shared by several uses is what
	// the source owner edits, and its description is the answer here.
	const box = boxRefusal(row, view.element, view.scoped);
	if (box !== undefined) return { ok: false, reason: box };
	if (view.described?.reason !== undefined) return { ok: false, reason: view.described.reason };
	// A row standing for several declarations at once can only be written where
	// they share a source. Where they do not, it says so in the source's own
	// words instead of offering a write the source would refuse.
	const held = view.described?.readings?.[row.property];
	if (held?.source === "mixed")
		return { ok: false, reason: held.reason ?? "this property has no single source to write" };
	// A project rule written under a condition is part of what this row is, even
	// where the condition is not the one holding now: the row says so, and the
	// value beside it stays the one the element is actually running.
	if (held?.written?.length) return { ok: true, reason: `also written under ${held.written.join(" and ")}` };
	const answered = view.described?.readings !== undefined;
	return { ok: view.property !== null && (answered || !readsFromSource(row)), reason: undefined };
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

/** The same reading, where only the value matters and not whose it is. */
function through<T>(view: View, read: (scoped: string) => T, empty: (value: T) => boolean): T {
	return worn(view, read, empty).shown;
}

/** The token a word family wears here, or the base's where this scope sets none. */
function wordThrough(view: View, word: Word): string | null {
	return through(
		view,
		(scoped) => wordOf(scoped, word),
		(token) => token === null,
	);
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
	const row = ruleRow(property, "length");
	const family = row.rule.family;
	const kind: Kind = LENGTHS[family] ?? "spacing";
	const step = stepOf(view.theme);
	const reader = read ?? ((scoped: string) => signedOf(lengthOf(scoped, family)));
	const held = worn<string | null>(view, reader, (value) => value === null);
	return (
		<ClassNumberRow
			view={view}
			row={row}
			{...(name === undefined ? {} : { name })}
			value={held.shown ?? ""}
			faint={held.own === null}
			changed={view.fresh(lengthOf(view.scoped, family)?.token ?? null)}
			placeholder={placeholder ?? (kind === "spacing" ? "auto" : "–")}
			readout={(shown) => {
				const parsed = takeApart(shown);
				return parsed === null ? (fallback ?? null) : describe(kind, parsed.value, parsed.negative, step);
			}}
			typedValue={(typed) => {
				if (typed.trim() === "") return null;
				const next = parseTyped(kind, typed);
				if (!next || (next.negative && !signedRow(row))) return undefined;
				return { kind: "value", value: `${next.negative ? "-" : ""}${next.value}` };
			}}
			stepped={(from, units) => {
				const parsed = takeApart(from);
				const start: Length | null =
					parsed === null
						? null
						: { family, kind, value: parsed.value, negative: parsed.negative, important: false, token: "" };
				const next = stepLength(kind, start, measured, units);
				if (next === null) return undefined;
				// a family with no negative spelling stops at nothing rather than
				// stepping into a value the compiler cannot write
				if (next.negative && !signedRow(row)) return "0";
				return `${next.negative ? "-" : ""}${next.value}`;
			}}
			{...(aside === undefined ? {} : { aside })}
		/>
	);
}

/**
 * The shape every class-written number row wears (P6).
 *
 * The row is one scrub label, one field and whatever the fold hangs beside it.
 * What differs between a length and a border width is what the class says, what
 * a typed value spells and how a step moves: those are the arguments, and the
 * gesture around them is written once.
 */
function ClassNumberRow({
	view,
	row,
	name,
	value,
	faint,
	changed,
	placeholder,
	readout,
	typedValue,
	stepped,
	aside,
}: {
	view: View;
	row: ModelRow;
	name?: string | undefined;
	value: string;
	/** nothing under this scope sets it: the value shown is the base's */
	faint: boolean;
	changed: boolean;
	placeholder: string;
	readout: (shown: string) => string | null;
	/** what typed text writes, or nothing where this row will not take it */
	typedValue: (typed: string) => RowValue | undefined;
	/** the same value one or ten units along, or nothing where it cannot move */
	stepped: (from: string, units: number) => string | undefined;
	aside?: ReactNode;
}) {
	const { ok, reason } = rowAdmission(view, row);
	const control = sourceProperty(row) ? view.property : null;
	const write = (next: RowValue) => writeValue(view, row, next);
	const stepBy = (units: number) => {
		const next = stepped(value, units);
		if (next !== undefined) write({ kind: "value", value: next });
	};
	const scrub = usePropertyScrub(view, row, value, stepped);
	return (
		<Row
			name={name ?? row.property}
			ok={ok}
			reason={reason}
			changed={changed}
			onScrub={ok ? (scrub?.move ?? stepBy) : undefined}
			onScrubStart={scrub?.start}
			onScrubEnd={scrub?.end}
			onScrubCancel={scrub?.cancel}
		>
			<NumField
				value={scrub?.value ?? value}
				readout={readout(scrub?.value ?? value)}
				ok={ok}
				faint={faint}
				changed={changed}
				placeholder={placeholder}
				onBegin={() => control?.begin(sourcePropertyName(row))}
				onCancel={() => control?.finish(false)}
				onPreview={(typed) => {
					const next = typedValue(typed);
					if (next !== undefined)
						control?.preview(
							sourcePropertyName(row),
							propertyControlValue(row, next, atOf(view), scopeKey(view.scope)),
							propertyNumericSample(row, next),
						);
				}}
				onCommit={(typed) => {
					const next = typedValue(typed);
					if (next !== undefined) write(next);
					else control?.finish(false);
				}}
				onStep={control ? undefined : stepBy}
				stepDraft={control ? stepped : undefined}
			/>
			{aside}
		</Row>
	);
}

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
	const row = ruleRow(property, "border-width");
	const edge = row.rule.edge;
	const step = stepOf(view.theme);
	const held = worn<string | null>(
		view,
		(scoped) => (edge === "all" ? borderWidthsOf(scoped).t : borderWidthsOf(scoped)[edge]),
		(value) => value === null,
	);
	return (
		<ClassNumberRow
			view={view}
			row={row}
			{...(name === undefined ? {} : { name })}
			value={held.shown ?? ""}
			faint={held.own === null}
			changed={view.fresh(readRow(row, view.scoped, view.theme).token)}
			placeholder="0"
			readout={(shown) => describe("px", shown || held.shown || "0", false, step) ?? "0px"}
			typedValue={(typed) => {
				if (typed.trim() === "") return null;
				const next = parseTyped("px", typed);
				return next && !next.negative ? { kind: "value", value: next.value } : undefined;
			}}
			stepped={(from, units) => {
				const parsed = takeApart(from);
				const start: Length | null =
					parsed === null
						? null
						: {
								family: "border",
								kind: "px",
								value: parsed.value,
								negative: parsed.negative,
								important: false,
								token: "",
							};
				// A width nothing sets steps from zero; a set one steps from what it says.
				const next = stepLength("px", start, held.shown === null ? 0 : Number.NaN, units);
				return next === null || next.negative ? undefined : next.value;
			}}
			{...(fold === undefined ? {} : { aside: fold })}
		/>
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

/**
 * What the source says about this element, kept while it is being read again.
 *
 * A description belongs to one element under one scope, so a different subject
 * retires it immediately. A re-read of the same subject does not: dropping the
 * description while its replacement is in flight would retire the controls it
 * admits, and the gesture already under way with them. What that read answers
 * stands in its place, including a read that retired or refused.
 */
function usePropertyDescription(control: PropertyControls | null | undefined, properties: readonly string[]) {
	const subject = JSON.stringify([control?.subject, properties]);
	const identity = JSON.stringify([control?.identity, properties]);
	const [described, setDescribed] = useState<{
		subject: string;
		description: PropertyDescription | undefined;
	}>();
	const describe = useRef(control?.describe);
	describe.current = control?.describe;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `identity` is not read in here, it is the trigger — the same element read again describes again
	useEffect(() => {
		let live = true;
		if (properties.length)
			void describe.current?.(properties).then((description) => {
				if (live) setDescribed({ subject, description });
			});
		return () => {
			live = false;
		};
	}, [subject, identity, properties]);
	return described?.subject === subject ? described.description : undefined;
}

/**
 * One control's own reading, measured against its own property.
 *
 * The element's description says whether the cell can be written; a control
 * that draws the source's value also needs that property's native measurement,
 * which the frame captures for the property the read names.
 */
function useOwnReading(view: View, property: string) {
	// The element's own description already measured the property it was read
	// against; every other control asks for its own native reading.
	const shared = view.described?.readings?.[property];
	const measured = shared?.native !== undefined;
	// Until that description lands there is nothing to ask about: a control that
	// asked first would pay for a second reading of the same class cell.
	const own = view.described !== undefined && !measured;
	const properties = useMemo(() => (own ? [property] : []), [property, own]);
	const asked = usePropertyDescription(view.property, properties)?.readings?.[property];
	return measured ? shared : asked;
}

/**
 * The controls that read the source's own value rather than the class it can see.
 *
 * The first is what the element's own read is measured against, so it is the one
 * control this description can hand a native value to.
 */
const DESCRIBED_PROPERTIES: readonly string[] = [
	"color",
	"background-color",
	"font-size",
	"line-height",
	"letter-spacing",
	"border-radius",
	"border-top-left-radius",
	"border-top-right-radius",
	"border-bottom-right-radius",
	"border-bottom-left-radius",
	// The boxes ask for every side of their own, because which source owns a side
	// is what decides whether the box can be one row at all (#304).
	...["padding", "margin", "inset"].flatMap((box) => [
		box,
		...(box === "inset"
			? ["top", "right", "bottom", "left"]
			: ["inline", "block", "top", "right", "bottom", "left"].map((side) => `${box}-${side}`)),
	]),
];

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
	const control = view.property;
	const row = ruleRow(property, "colour");
	const prefix = row.rule.prefix;
	const { ok, reason } = rowAdmission(view, row);
	const own = useOwnReading(view, property);
	const reading = property === "color" || property === "background-color" ? own : undefined;
	const reader = read ?? ((scoped: string) => colourOf(scoped, prefix, view.theme));
	const held = worn<Colour>(view, reader, (colour) => colour.token === null);
	const shown = held.shown;
	const changed = view.fresh(held.own.token === null ? null : held.own.token);
	const current: Option =
		shown.name === null
			? { token: null, name: absent, swatch: "" }
			: { token: shown.name, name: shown.name, swatch: shown.paint ?? "" };
	const previewAlpha = (alpha: number | null) => {
		if (shown.name === null) return;
		const original = reading;
		const paint = original?.binding.kind === "reference" ? `var(${original.binding.name})` : original?.authored;
		control?.preview(
			property,
			propertyControlValue(row, { kind: "colour", name: shown.name, alpha }, atOf(view), scopeKey(view.scope)),
			paint === undefined ? undefined : paintWith(paint, alpha),
		);
	};
	const write = (nextName: string | null, alpha: number | null) => {
		if (onWrite !== undefined) return onWrite(nextName, alpha);
		writeValue(view, row, nextName === null ? null : { kind: "colour", name: nextName, alpha });
	};
	if (property === "color" || property === "background-color")
		return (
			<PropertyColorField
				property={property}
				reading={reading}
				reason={reason}
				options={[
					...(view.theme?.colour ?? []).map((token) => ({ ...token, reference: `--color-${token.name}` })),
					...KEYWORD_COLOURS.map((color) => ({
						name: color.name,
						value: color.paint,
						from: "default" as const,
						reference: null,
					})),
				]}
				begin={() => control?.begin(property)}
				preview={(value) => control?.preview(property, { kind: "custom", value })}
				apply={(choice) =>
					choice.kind === "binding" ? write(choice.name, shown.alpha) : control?.apply(property, choice)
				}
				finish={(commit) => control?.finish(commit)}
				accessory={
					<>
						<AlphaField
							alpha={shown.alpha}
							ok={ok && shown.name !== null}
							faint={held.own.token === null}
							onBegin={() => control?.begin(property)}
							onPreview={previewAlpha}
							onCancel={() => control?.finish(false)}
							onCommit={(alpha) => write(shown.name, alpha)}
						/>
						{fold}
					</>
				}
			/>
		);
	return (
		<Row name={name ?? row.property} ok={ok} reason={reason} changed={changed}>
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
				onBegin={() => control?.begin(property)}
				onPreview={previewAlpha}
				onCancel={() => control?.finish(false)}
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
	onBegin,
	onPreview,
	onCancel,
}: {
	alpha: number | null;
	ok: boolean;
	faint: boolean;
	onCommit: (alpha: number | null) => void;
	onBegin?: (() => void) | undefined;
	onPreview?: ((alpha: number | null) => void) | undefined;
	onCancel?: (() => void) | undefined;
}) {
	const parse = (typed: string): number | null | undefined => {
		if (typed.trim() === "") return null;
		const raw = typed.trim().replace(/%$/, " ").trim();
		if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return;
		const value = Number(raw);
		return Number.isFinite(value) ? (value >= 100 ? null : Math.max(0, value)) : undefined;
	};
	return (
		<span className="flex w-[46px] shrink-0 items-center">
			<span className={cn("shrink-0", FAINT)}>/</span>
			<NumField
				value={alpha === null ? "" : String(alpha)}
				placeholder="100"
				ok={ok}
				faint={faint}
				onBegin={onBegin}
				onCancel={onCancel}
				onPreview={(typed) => {
					const value = parse(typed);
					if (value !== undefined) onPreview?.(value);
				}}
				onCommit={(typed) => {
					const value = parse(typed);
					if (value !== undefined) onCommit(value);
					else onCancel?.();
				}}
				stepDraft={(typed, units) => {
					const value = parse(typed);
					return value === undefined ? undefined : String(Math.min(100, Math.max(0, (value ?? 100) + units)));
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
	const row = ruleRow(property, "word");
	const word = row.rule.word;
	const { ok, reason } = rowAdmission(view, row);
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
		<Row name={name ?? row.property} ok={ok} reason={reason} changed={changed}>
			<Menu
				current={current}
				options={options}
				ok={ok}
				faint={held.own === null}
				changed={changed}
				label={name ?? row.property}
				onPick={(token) => writeValue(view, row, token === null ? null : { kind: "value", value: token })}
			/>
		</Row>
	);
}

/**
 * A number the source owns: its own token menu, its own reading, one gesture.
 *
 * The class says nothing this control trusts. It draws what the source read
 * says the property is wearing, and every gesture it makes is a source request.
 */
function SourceNumberRow({
	view,
	property,
	options,
	name,
	accessory,
}: {
	view: View;
	property: NumericTokenProperty;
	options: readonly ThemeToken[];
	name?: string | undefined;
	accessory?: ReactNode;
}) {
	const control = view.property;
	const { reason } = rowAdmission(view, modelRow(property));
	const reading = useOwnReading(view, property);
	return (
		<PropertyNumberField
			property={property}
			{...(name === undefined ? {} : { name })}
			reading={reading}
			reason={reason}
			options={options}
			scope={scopeKey(view.scope)}
			begin={() => control?.begin(property)}
			preview={(value) => control?.preview(property, value)}
			apply={(value) => control?.apply(property, value)}
			finish={(commit) => control?.finish(commit)}
			{...(accessory === undefined ? {} : { accessory })}
		/>
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
	const { ok, reason } = rowAdmission(view, row);
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
		<Row name={name ?? row.property} ok={ok} reason={reason} changed={changed}>
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
					writeValue(view, row, explicit === null ? null : { kind: "value", value: explicit });
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
	const row = ruleRow(property, "toggles");
	const set = row.rule.set;
	const { ok, reason } = rowAdmission(view, row);
	const on = toggledOf(view.scoped, set);
	const inherited = view.scope.length > 0 ? toggledOf(view.base, set) : new Set<string>();
	const chips = set.groups.filter((group) => group !== menuGroup).flat();
	const menuOn = menuGroup === undefined ? null : (menuGroup.find((token) => on.has(token)) ?? null);
	const none = `${menuGroup?.[0]?.split("-")[0] ?? ""}-none`;
	const write = (token: string, next: boolean) => writeValue(view, row, { kind: "toggle", token, on: next });
	return (
		<Row name={row.property} ok={ok} reason={reason} tall changed={[...on].some((token) => view.fresh(token))}>
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

interface FoldRows<P extends string = string> {
	/** one row when every side agrees, two on the axes, four on the sides */
	levels: readonly (readonly { property: P; name?: string; sides: readonly Side[] }[])[];
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
function Folded<P extends string>({
	view,
	fold,
	read,
	draw,
}: {
	view: View;
	fold: FoldRows<P>;
	read: (scoped: string) => Sides;
	draw: (
		entry: { property: P; name?: string; sides: readonly Side[] },
		caret: ReactNode,
		read: (scoped: string) => string | null,
	) => ReactNode;
}) {
	const [want, setWant] = useState(0);
	const max = fold.levels.length - 1;
	const own = read(view.scoped);
	const inherited = view.scope.length > 0 ? read(view.base) : own;
	const even = Object.values(own).every((value) => value === null) ? inherited : own;
	// Sides written in different sources are as much a reason to open the box as
	// sides with different values: one row cannot write two sources at once.
	const sides = fold.levels[max] ?? [];
	const sourceOf = (side: Side): string | null => {
		const entry = sides.find((row) => row.sides.includes(side));
		return (entry ? view.described?.readings?.[entry.property]?.source : undefined) ?? null;
	};
	const owners: Sides = { t: sourceOf("t"), r: sourceOf("r"), b: sourceOf("b"), l: sourceOf("l") };
	const natural = Math.max(levelOf(even, max), levelOf(owners, max));
	const level = Math.min(max, Math.max(want, natural));
	const rows = fold.levels[level] ?? [];
	const ok = fold.levels[0]?.[0] === undefined ? false : okOf(view, modelRow(fold.levels[0][0].property));
	// the caret steps one level further open and wraps back to the fewest rows the
	// sides allow: a fold cannot close over sides that disagree, so a group that is
	// already as open as it has to be has no caret at all
	const caret = (
		<Fold open={level > 0} ok={ok && max > natural} onToggle={() => setWant(level >= max ? natural : level + 1)} />
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

const RADIUS_FOLD: FoldRows<NumericTokenProperty> = {
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

const SHAPES: readonly (Option & { shape?: GradientShape })[] = [
	{ token: null, name: "none" },
	{ token: "linear", name: "bg-linear-*", shape: "linear" },
	{ token: "radial", name: "bg-radial", shape: "radial" },
	{ token: "conic", name: "bg-conic", shape: "conic" },
];

/** Where the browser puts a stop nobody positioned, which is what the box hints. */
const SPACED: readonly number[] = [0, 50, 100];

/** One stop changed, the other two left as they were. */
function withStop(gradient: Gradient, index: number, change: (stop: Stop) => Stop): Gradient {
	return { ...gradient, stops: gradient.stops.map((stop, at) => (at === index ? change(stop) : stop)) };
}

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
	const { ok, reason } = rowAdmission(view, row);
	const own = gradientOf(view.scoped, view.theme);
	const gradient = through(
		view,
		(scoped) => gradientOf(scoped, view.theme),
		(held) => held === null,
	);
	const changed = view.fresh(own?.token ?? null);
	const write = (next: Gradient | null) => writeValue(view, row, { kind: "gradient", gradient: next });
	const control = view.property;
	const preview = (next: Gradient, sample?: string) =>
		control?.preview(
			row.property,
			propertyControlValue(row, { kind: "gradient", gradient: next }, atOf(view), scopeKey(view.scope)),
			sample,
		);
	const begin = (next: Gradient) =>
		control?.begin(
			row.property,
			propertyControlValue(row, { kind: "gradient", gradient: next }, atOf(view), scopeKey(view.scope)),
		);
	const beginAlpha = (stop: Stop) => {
		if (!gradient || !stop.colour?.name) return;
		const value = propertyControlValue(row, { kind: "gradient", gradient }, atOf(view), scopeKey(view.scope));
		if (value.kind !== "binding") return;
		const prefix = scopeKey(view.scope);
		const original = `${prefix}${colourToken(stop.at, stop.colour.name, stop.colour.alpha)}`;
		const sample = `${prefix}${stop.at}-${stop.colour.name}/[${propertySamplePlaceholder}]`;
		control?.begin(row.property, {
			kind: "binding",
			tokens: value.tokens.map((token) => (token === original ? sample : token)),
		});
	};
	const direction = (typed: string): Gradient | undefined => {
		const degrees = gradientAngle(typed.trim().replace(/deg$/, ""));
		return gradient && degrees !== undefined ? { ...gradient, direction: String(degrees) } : undefined;
	};
	const position = (index: number, typed: string): Gradient | undefined => {
		if (!gradient) return;
		if (!typed.trim()) return withStop(gradient, index, (held) => ({ ...held, position: null }));
		const value = gradientAngle(typed.trim().replace(/%$/, ""));
		return value === undefined
			? undefined
			: withStop(gradient, index, (held) => ({ ...held, position: `${Math.max(0, Math.min(100, value))}%` }));
	};
	const current =
		gradient === null ? SHAPES[0] : (SHAPES.find((shape) => shape.token === gradient.shape) ?? SHAPES[0]);
	return (
		<>
			<Row name="background-image" ok={ok} reason={reason} changed={changed}>
				<Menu
					current={current ?? { token: null, name: "none" }}
					options={SHAPES}
					ok={ok}
					faint={own === null}
					changed={changed}
					label="background-image"
					onPick={(picked) => {
						const shape = SHAPES.find((option) => option.token === picked)?.shape;
						if (shape === undefined) return write(null);
						write({
							shape,
							direction: shape === "linear" ? (gradient?.direction ?? "to-r") : null,
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
										gradientAngle(gradient.direction) === undefined
											? ""
											: String(gradientAngle(gradient.direction))
									}
									placeholder="deg"
									ok={ok}
									faint
									onBegin={() => begin({ ...gradient, direction: `[${propertySamplePlaceholder}]` })}
									onCancel={() => control?.finish(false)}
									onPreview={(typed) => {
										const next = direction(typed);
										if (next) preview(next, `${next.direction}deg`);
									}}
									onCommit={(typed) => {
										const next = direction(typed);
										if (next) write(next);
										else control?.finish(false);
									}}
									stepDraft={(typed, units) => {
										const from = typed.trim() ? gradientAngle(typed.trim().replace(/deg$/, "")) : 90;
										return from === undefined ? undefined : String(from + units);
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
								onBegin={() => beginAlpha(stop)}
								onCancel={() => control?.finish(false)}
								onPreview={(alpha) =>
									preview(
										withStop(gradient, index, (held) =>
											held.colour ? { ...held, colour: { ...held.colour, alpha } } : held,
										),
										`${alpha ?? 100}%`,
									)
								}
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
									onBegin={() =>
										begin(
											withStop(gradient, index, (held) => ({
												...held,
												position: `[percentage:${propertySamplePlaceholder}]`,
											})),
										)
									}
									onCancel={() => control?.finish(false)}
									onPreview={(typed) => {
										const next = position(index, typed);
										if (next) preview(next, next.stops[index]?.position ?? undefined);
									}}
									onCommit={(typed) => {
										const next = position(index, typed);
										if (next) write(next);
										else control?.finish(false);
									}}
									stepDraft={(typed, units) => {
										const from = typed.trim()
											? gradientAngle(typed.trim().replace(/%$/, ""))
											: (SPACED[index] ?? 0);
										return from === undefined ? undefined : String(Math.max(0, Math.min(100, from + units)));
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
function Rest({
	view,
	section,
	drawn,
}: {
	view: View;
	/** the sections this header covers, in the order it draws them */
	section: SectionName | readonly SectionName[];
	drawn: ReadonlySet<string>;
}) {
	const sections = typeof section === "string" ? [section] : section;
	const worn = sections
		.flatMap((name) => rowsIn(name))
		.filter(
			(row) =>
				!drawn.has(row.property) &&
				row.primitive !== "read" &&
				readRow(row, view.scoped, view.theme).token !== null,
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

/** Whether this element is placed, which is what its offsets are drawn for. */
function placedIn(view: View): boolean {
	const position = wordThrough(view, "position");
	return position !== null && PLACED.has(position);
}

/** The rows that place an element, drawn only where its position is not static. */
function PositionRows({ view, placed }: { view: View; placed: boolean }) {
	return (
		<>
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
		</>
	);
}

/** Which position rows the section led with, so `Rest` does not draw them twice. */
function positionDrawn(placed: boolean): string[] {
	return ["position", "z-index", ...(placed ? INSET_SIDES.map((entry) => entry.property) : [])];
}

/** width and height, each a length and a mode: hug is no token, fill is `w-full`. */
function SizeRows({ view }: { view: View }) {
	return (
		<>
			{(["w", "h"] as const).map((axis) => {
				const property = axis === "w" ? "width" : "height";
				const modeRow = modelRow(axis === "w" ? "width mode" : "height mode");
				const measured = Math.round(axis === "w" ? view.box.w : view.box.h);
				const own = lengthOf(view.scoped, axis);
				const mode = sizeModeOf(view.scoped, axis);
				// hug is the absence of a token, so this axis takes the base's mode only
				// where nothing under the scope sets a length at all
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
									onPick={(token) => {
										const mode = SIZE_MODES.find((entry) => entry.mode === token)?.mode ?? "hug";
										writeValue(view, modeRow, { kind: "mode", mode, measured });
									}}
								/>
							</span>
						}
					/>
				);
			})}
		</>
	);
}

const FLEX_DISPLAYS = new Set(["flex", "inline-flex"]);
const SCROLLS = new Set(["overflow-auto", "overflow-scroll"]);

/**
 * Layout, in the approved frame's own order.
 *
 * The approved editing interface heads one section for how an element lays
 * out, how big it is and what surrounds it, so display, the flex rows, the two
 * dimensions with their modes, the spacing folds and the position rows read
 * under one name rather than three.
 */
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
	const overflow = wordThrough(view, "overflow");
	const scrolls = overflow !== null && SCROLLS.has(overflow);
	const placed = placedIn(view);
	const directionRow = modelRow("flex-direction");
	const wrapRow = modelRow("flex-wrap");
	const alignRow = modelRow("align-items");
	const justifyRow = modelRow("justify-content");
	// The approved frame draws an added border width with Layout's other optional
	// numbers, so it is here rather than under a header of its own.
	const widths = borderWidthsOf(view.scoped);
	const baseWidths = view.scope.length > 0 ? borderWidthsOf(view.base) : widths;
	const bordered = [...Object.values(widths), ...Object.values(baseWidths)].some((width) => width !== null);
	const gapped = flex || grid || gapOf(view.scoped).x !== null || gapOf(view.scoped).y !== null;
	const drawn = new Set([
		...(bordered ? BORDER_WIDTH_FOLD.levels.flat().map((entry) => entry.property) : []),
		// `border-s` and `border-e` are the fold's left and right edges under
		// their logical names: it already draws them, and reading `border` as
		// both would put the same width on screen three times
		"border-inline-start-width",
		"border-inline-end-width",
		"display",
		"overflow",
		"width",
		"height",
		"width mode",
		"height mode",
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
		...positionDrawn(placed),
		...(flex ? ["flex-direction", "flex-wrap", "align-items", "justify-content"] : []),
		...(grid ? ["grid-template-columns"] : []),
		...(gapped ? ["gap", "column-gap", "row-gap"] : []),
		...(scrolls ? ["scroll-snap-type"] : []),
	]);
	return (
		<Section name="Layout" reason={sectionReason(view, ["display", "width", "padding"])}>
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
							onPick={(token) => writeValue(view, directionRow, { kind: "value", value: token })}
						/>
						<span className={cn("ml-auto shrink-0", FAINT)}>{column ? "column" : "row"}</span>
						<Chip
							label="wrap"
							on={(own.wrap ?? base.wrap) === "flex-wrap"}
							ok={okOf(view, wrapRow)}
							onChange={(next) => writeValue(view, wrapRow, next ? { kind: "value", value: "flex-wrap" } : null)}
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
								writeFields(view, [
									{ row: alignRow, value: { kind: "value", value: align } },
									{ row: justifyRow, value: { kind: "value", value: justify } },
								])
							}
						/>
						<span className="flex min-w-0 flex-1 flex-col gap-1">
							<PlaceMenu view={view} property="align-items" own={own.align} base={base.align} />
							<PlaceMenu view={view} property="justify-content" own={own.justify} base={base.justify} />
						</span>
					</Row>
				</>
			) : null}
			{grid ? <LengthRow view={view} property="grid-template-columns" placeholder="none" /> : null}
			<SizeRows view={view} />
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
			{gapped ? (
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
			{bordered ? (
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
			) : null}
			<PositionRows view={view} placed={placed} />
			<WordRow view={view} property="overflow" />
			{scrolls ? <ToggleRow view={view} property="scroll-snap-type" /> : null}
			<Rest view={view} section={["size", "position", "layout"]} drawn={drawn} />
		</Section>
	);
}

function PlaceMenu({
	view,
	property,
	own,
	base,
}: {
	view: View;
	property: "align-items" | "justify-content";
	own: string | null;
	base: string | null;
}) {
	const row = ruleRow(property, "word");
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
			onPick={(token) => writeValue(view, row, token === null ? null : { kind: "value", value: token })}
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
	// A width is what gives an edge a colour to read, so the colours draw with it.
	const widths = borderWidthsOf(view.scoped);
	const baseWidths = view.scope.length > 0 ? borderWidthsOf(view.base) : widths;
	const bordered = [...Object.values(widths), ...Object.values(baseWidths)].some((width) => width !== null);
	const drawn = new Set([
		"opacity",
		"border-radius",
		"border-top-left-radius",
		"border-top-right-radius",
		"border-bottom-right-radius",
		"border-bottom-left-radius",
		"box-shadow",
		...(bordered ? BORDER_COLOUR_FOLD.levels.flat().map((entry) => entry.property) : []),
		...(opened ? ["filter", ...MORE_APPEARANCE, "transition-timing-function"] : []),
	]);
	return (
		<Section name="Appearance" reason={sectionReason(view, ["opacity"])}>
			<Folded
				view={view}
				fold={RADIUS_FOLD}
				read={(scoped) => cornersAsSides(scoped, view.theme)}
				draw={(entry, caret) => (
					<SourceNumberRow
						key={entry.property}
						view={view}
						property={entry.property}
						options={view.theme?.radius ?? []}
						{...(entry.name === undefined ? {} : { name: entry.name })}
						accessory={caret}
					/>
				)}
			/>
			<LengthRow view={view} property="opacity" placeholder="100" fallback="100%" />
			<ColourRow view={view} property="color" absent="inherit" />
			<ColourRow view={view} property="background-color" absent="transparent" />
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
						<span className="type-label">+</span>
						<span className={LABEL}>filter, transform, transition</span>
					</button>
				</div>
			)}
			{bordered ? (
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
			<GradientRows view={view} />
			<Rest view={view} section="fill" drawn={new Set(["background-color", "background-image"])} />
			<Rest view={view} section="appearance" drawn={drawn} />
			<Rest
				view={view}
				section="stroke"
				drawn={
					new Set([
						...drawn,
						// Layout draws the widths; reading them again here would put the
						// same number on screen twice.
						...BORDER_WIDTH_FOLD.levels.flat().map((entry) => entry.property),
						"border-inline-start-width",
						"border-inline-end-width",
					])
				}
			/>
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

function TextSection({ view }: { view: View }) {
	const alignRow = modelRow("text-align");
	const { ok: alignOk, reason: alignReason } = rowAdmission(view, alignRow);
	const align = wordThrough(view, "text-align");
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
		<Section name="Typography" reason={sectionReason(view, ["font-size"])}>
			<SourceNumberRow view={view} property="font-size" options={view.theme?.text ?? []} />
			<SourceNumberRow view={view} property="line-height" options={view.theme?.leading ?? []} />
			{readRow(modelRow("letter-spacing"), view.scoped, view.theme).token !== null ? (
				<SourceNumberRow view={view} property="letter-spacing" options={view.theme?.tracking ?? []} />
			) : null}
			<TokenRow view={view} property="font-weight" absent={{ token: null, name: "inherit" }} />
			<Row
				name="text-align"
				ok={alignOk}
				reason={alignReason}
				changed={view.fresh(wordOf(view.scoped, "text-align"))}
			>
				<Menu
					label="text-align"
					current={{ token: align, name: align?.replace(/^text-/, "") ?? "start" }}
					faint={align === null}
					ok={alignOk}
					options={["start", "left", "center", "right"].map((value) => ({ token: `text-${value}`, name: value }))}
					onPick={(token) => {
						if (token) writeValue(view, alignRow, { kind: "value", value: token });
					}}
				/>
			</Row>
			<TokenRow view={view} property="font-family" absent={{ token: null, name: "inherit" }} />
			<ToggleRow view={view} property="font-variant-numeric" />
			<Rest view={view} section="text" drawn={drawn} />
		</Section>
	);
}

/**
 * What the `+` offers, in the approved frame's own order.
 *
 * Every one of them is a supported row this element is not wearing: the four
 * margins and the two constraints the approved Layout lists, its gap, and the
 * two the typography and border rows already offered.
 */
const OPTIONAL_PROPERTIES: readonly string[] = [
	"gap",
	"letter-spacing",
	"border-width",
	"min-height",
	"max-width",
	"margin-top",
	"margin-right",
	"margin-bottom",
	"margin-left",
];

/**
 * What an optional property is added at.
 *
 * Its own initial value, so adding it moves nothing and the number that lands
 * in the source is the property's, never the pixels one use happens to be
 * showing: a constraint opens at `none`, a spacing at zero. A border with no
 * width paints nothing, so it opens at one.
 */
function openingRequest(property: string): SourcePropertyValue {
	const none = MAX_CONSTRAINTS[property];
	if (none !== undefined) return { kind: "binding", tokens: [none] };
	return { kind: "custom", value: property === "border-width" ? "1px" : "0px" };
}

/** The constraints whose initial value is a word rather than a length. */
const MAX_CONSTRAINTS: Readonly<Record<string, string>> = {
	"max-width": "max-w-none",
	"max-height": "max-h-none",
};

function AddProperty({ view }: { view: View }) {
	// An optional property is offered where its own source admits it, and the
	// refusal it would have met is said here rather than after a failed save.
	const optional = OPTIONAL_PROPERTIES.map((property) => ({
		property,
		admission: rowAdmission(view, modelRow(property)),
	}));
	const unset = optional.filter(({ property }) => readRow(modelRow(property), view.scoped, view.theme).token === null);
	const options = unset.map(({ property }) => property);
	const reason = unset.map(({ admission }) => admission.reason).find((said) => said !== undefined);
	return (
		<div data-add-property="" title={reason} className="flex h-8 items-center border-border-raised border-t px-2.5">
			<Menu
				label="Add property"
				current={{ token: null, name: "+ Add property" }}
				options={options.map((property) => ({ token: property, name: property }))}
				filter
				ok={view.property !== null && options.length > 0}
				onPick={(property) => {
					if (property) view.property?.apply(property, openingRequest(property));
				}}
			/>
		</div>
	);
}

/** Typography and Appearance follow the approved editing controls; remaining layout rows retain their sections. */
export function PropertySections({ view }: { view: View }) {
	// One description of this element's class cell: whether it can be written at
	// all, and what each drawn control is wearing.
	const described = usePropertyDescription(view.property, DESCRIBED_PROPERTIES);
	const held: View = { ...view, described: view.described ?? described };
	return (
		<>
			<LayoutSection view={held} />
			<TextSection view={held} />
			<AppearanceSection view={held} />
			<AddProperty view={held} />
		</>
	);
}

/* ---------- P5: the `+ class`, at the foot ---------- */

/**
 * What the `+` offers before anything is typed, which is the design frame's own
 * list.
 *
 * A starting point rather than a catalogue: nothing here decides what compiles,
 * and whatever is typed over it goes to the compiler the same way. It is why
 * `[mask-type:luminance]` and `mt-3.5!` are in it — the classes no row will ever
 * have are the whole point of the field.
 */
const SEEDS: readonly string[] = [
	"flex-1",
	"shrink-0",
	"grow",
	"truncate",
	"uppercase",
	"italic",
	"underline",
	"select-none",
	"pointer-events-none",
	"cursor-pointer",
	"sr-only",
	"min-h-0",
	"max-w-full",
	"size-full",
	"aspect-square",
	"ml-auto",
	"mt-auto",
	"self-center",
	"order-first",
	"whitespace-nowrap",
	"leading-none",
	"tracking-wide",
	"antialiased",
	"transition",
	"transition-colors",
	"animate-pulse",
	"outline-none",
	"ring-2",
	"shadow-sm",
	"backdrop-blur-sm",
	"[mask-type:luminance]",
	"[--row-h:44px]",
	"content-['']",
	"mt-3.5!",
	"hover:opacity-80",
];

/** What an inline element has no box for, so the field does not offer it one. */
const NOT_INLINE = /^(flex-1|min-h-0|size-full|aspect-square|self-center|order-first)$/;

export function AddClassRow({
	view,
	editable,
	taken,
	onAdd,
}: {
	view: View;
	editable: boolean;
	/** the whole literal's tokens, so one the element already wears is not offered */
	taken: ReadonlySet<string>;
	onAdd: (token: string) => void;
}) {
	const inline = displayOf(view.element, view.scoped) === "inline";
	return (
		<AddField
			candidates={SEEDS.filter((token) => !(inline && NOT_INLINE.test(token))).map((token) => ({ token }))}
			taken={taken}
			ok={editable}
			verdictOf={view.compiler.verdictOf}
			onAsk={view.compiler.ask}
			onAdd={onAdd}
			className="-ml-1.5"
		/>
	);
}
