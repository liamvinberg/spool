import { type ReactNode, useState } from "react";
import {
	anatomyOf,
	borderColoursOf,
	borderWidthsOf,
	COLOUR_NAMES,
	type Colour,
	colourOf,
	compiles,
	compose,
	type Corner,
	cornersOf,
	describe,
	DIRECTIONS,
	EASINGS,
	type Edge,
	FILTER_SET,
	FONTS,
	type Gradient,
	gradientCss,
	gradientOf,
	inScope,
	type Kind,
	LEADINGS,
	LENGTHS,
	type Length,
	lengthOf,
	lengthOfToken,
	lengthPx,
	marginOf,
	NUMERIC_SET,
	parseTyped,
	RADII,
	radiusValue,
	type Scope,
	scopeKey,
	scopesOf,
	SHADOWS,
	SNAP_SET,
	split,
	stepLength,
	TEXT_SIZES,
	type ThemeOption,
	themeOf,
	toggledOf,
	type ToggleSet,
	TRACKINGS,
	VARIANTS,
	WEIGHTS,
	withBorderColours,
	withBorderWidths,
	withColour,
	withCorners,
	withGradient,
	withLength,
	withMargin,
	withScope,
	withTheme,
	withToggle,
} from "../lib/properties-families";
import {
	chainOf,
	FILE,
	gapOf,
	literalVerdict,
	paddingOf,
	type Side,
	sizeModeOf,
	sizeVerdict,
	type SizeMode,
	type SourceElement,
	spacingVerdict,
	textVerdict,
	type Verdict,
	withGap,
	withPadding,
	withSizeMode,
	withWord,
	WORDS,
	wordOf,
	wordVerdict,
} from "../lib/properties-model";
import { cn } from "../lib/utils";
import {
	AddField,
	ArrowIcon,
	type Candidate,
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
	SwatchChip,
	TextField,
	VALUE,
} from "./spool-properties-fields";

/**
 * The properties rail, merged (spool-cloud#20): the grid take's two-column
 * inspector as the base, the figma take's field feel, the literal take's `+`
 * at the foot, and the seven primitives the inventory found missing, each on
 * the row it belongs to. Sections are Figma's, in Figma's order (spool-cloud#16):
 * position, size, layout, appearance, fill, stroke, text, source.
 *
 * Every write goes through the scope at the top (P1): the base by default, or
 * one variant chain (`hover:`, `md:`, `dark:`), under which a row reads the
 * variant's own token, or the base's value faint when the variant sets none,
 * and writes the prefixed token. `shape.variants === "rows"` is the other
 * reading: no switcher, each scope is its own section of rows at the foot.
 *
 * Colour rows take an alpha (P2), the fill takes a gradient (P3, as rows or as
 * a bar), font-variant-numeric, filter and scroll-snap are toggle sets (P4),
 * the `+` is gated by the compiler (P5), every number box takes a sign, a
 * fraction and a unit (P6), radius folds to corners and border to edges (P7).
 */

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Geometry {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Pick {
	id: string;
	key: string;
}

export interface Reading {
	element: SourceElement;
	pick: Pick;
	className: string;
	text: string | null;
	box: Rect;
	/** where the element landed inside the frame */
	inFrame: { x: number; y: number };
	frame: Geometry;
	/** the literal the file was written with, split, so a spliced token reads as changed */
	original: ReadonlySet<string>;
}

export interface Acts {
	setClass: (id: string, next: (className: string | null) => string) => void;
	setText: (id: string, text: string) => void;
	setFrame: (patch: Partial<Geometry>) => void;
	select: (pick: Pick) => void;
	undo: () => void;
	canUndo: boolean;
}

export interface Shape {
	/** P1: a scope switcher at the top, or each scope as rows at the foot */
	variants: "bar" | "rows";
	/** P3: three stop rows, or a bar with stops on it */
	gradient: "rows" | "bar";
}

export const DEFAULT_SHAPE: Shape = { variants: "bar", gradient: "rows" };

/** what every section is handed: the element under one scope, and how to write under it */
interface View {
	reading: Reading;
	element: SourceElement;
	scope: Scope;
	/** the tokens under the scope, as a className the family readers take */
	scoped: string;
	/** the base scope's, for what a variant inherits */
	base: string;
	/** write under the scope */
	set: (change: (scoped: string) => string) => void;
	/** true when a (prefixed) token is not the file's */
	fresh: (token: string | null) => boolean;
	acts: Acts;
}

/* ---------- reading the verdicts ---------- */

function reasonFor(element: SourceElement, verdict: Verdict): string | undefined {
	if (verdict.ok) return undefined;
	if (element.shared !== undefined) return `shared, ${element.shared.frames} frames`;
	return verdict.reason;
}

/** a refusal that covers the whole element is said once in the head; a section only carries a reason of its own */
function sectionReason(element: SourceElement, verdict: Verdict): string | undefined {
	return literalVerdict(element).ok ? reasonFor(element, verdict) : undefined;
}

/* ---------- the rail ---------- */

export function Rail({ reading, acts, shape = DEFAULT_SHAPE }: { reading: Reading | null; acts: Acts; shape?: Shape }) {
	return (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			{reading === null ? (
				<div className="flex h-9 shrink-0 items-center border-border border-b px-2.5">
					<span className={cn("text-muted/50", VALUE)}>no selection</span>
				</div>
			) : (
				<Panel key={reading.element.id} reading={reading} acts={acts} shape={shape} />
			)}
		</div>
	);
}

function Panel({ reading, acts, shape }: { reading: Reading; acts: Acts; shape: Shape }) {
	const [scope, setScope] = useState<Scope>([]);
	const [extraScopes, setExtraScopes] = useState<Scope[]>([]);
	const { element } = reading;
	const scopes = scopesOf(reading.className);
	for (const extra of extraScopes) if (!scopes.some((known) => scopeKey(known) === scopeKey(extra))) scopes.push(extra);
	const live = shape.variants === "bar" ? scope : [];
	const view: View = {
		reading,
		element,
		scope: live,
		scoped: inScope(reading.className, live),
		base: inScope(reading.className, []),
		set: (change) => acts.setClass(element.id, (className) => withScope(className, live, change)),
		fresh: (token) => token !== null && !reading.original.has(compose({ ...anatomyOf(token), variants: [...live, ...anatomyOf(token).variants] })),
		acts,
	};
	const isFrame = element.parent === null;
	const hasText = element.text !== undefined || element.display === "inline";

	return (
		<>
			<Head reading={reading} acts={acts} />
			{shape.variants === "bar" && !isFrame ? (
				<ScopeBar scopes={scopes} scope={scope} ok={literalVerdict(element).ok} onScope={setScope} onAdd={(next) => setExtraScopes((held) => [...held, next])} />
			) : null}
			<div className="min-h-0 flex-1 overflow-y-auto [&>div:first-child]:border-t-0">
				{isFrame ? <FramePosition view={view} /> : <PositionSection view={view} />}
				{isFrame ? <FrameSize view={view} /> : <SizeSection view={view} />}
				<LayoutSection view={view} />
				<AppearanceSection view={view} />
				<FillSection view={view} shape={shape} />
				<StrokeSection view={view} />
				{hasText ? <TextSection view={view} /> : null}
				{shape.variants === "rows" && !isFrame ? <ScopeSections reading={reading} acts={acts} extra={extraScopes} onAdd={(next) => setExtraScopes((held) => [...held, next])} /> : null}
				<SourceSection view={view} />
			</div>
		</>
	);
}

function Head({ reading, acts }: { reading: Reading; acts: Acts }) {
	const chain = chainOf(reading.element.id);
	const verdict = literalVerdict(reading.element);
	return (
		<div className="shrink-0 border-border border-b">
			<div className="flex h-9 items-center gap-2 px-2.5">
				<span className={cn("flex min-w-0 items-center gap-1 truncate", VALUE)}>
					{chain.map((element, index) => {
						const last = index === chain.length - 1;
						return (
							<span key={element.id} className="flex shrink-0 items-center gap-1">
								<button
									type="button"
									onClick={() => acts.select({ id: element.id, key: element.mapped === undefined ? element.id : reading.pick.key })}
									className={cn("cursor-pointer rounded-xs px-0.5 focus:outline-none focus-visible:bg-surface", last ? "text-thread" : "text-muted hover:text-text")}
								>
									{element.name}
								</button>
								{last ? null : <span className="text-muted/30">/</span>}
							</span>
						);
					})}
				</span>
				<span className={cn("ml-auto shrink-0", FAINT)}>{reading.element.tag}</span>
			</div>
			{verdict.ok ? null : (
				<div className="flex h-5 items-center px-2.5 pb-1">
					<span className={cn("min-w-0 truncate", FAINT)}>{reasonFor(reading.element, verdict)}</span>
				</div>
			)}
		</div>
	);
}

/* ---------- P1: the scope bar ---------- */

function ScopeBar({
	scopes,
	scope,
	ok,
	onScope,
	onAdd,
}: {
	scopes: readonly Scope[];
	scope: Scope;
	ok: boolean;
	onScope: (scope: Scope) => void;
	onAdd: (scope: Scope) => void;
}) {
	const options: Option[] = VARIANTS.filter((variant) => !scopes.some((known) => scopeKey(known) === `${variant.prefix}:`)).map((variant) => ({
		token: variant.prefix,
		name: `${variant.prefix}:`,
		value: variant.when.replace("@media ", ""),
		group: variant.group,
	}));
	return (
		<div className="flex min-h-8 shrink-0 flex-wrap items-center gap-1 border-border border-b px-2.5 py-1.5">
			{scopes.map((candidate) => {
				const on = scopeKey(candidate) === scopeKey(scope);
				return (
					<Chip key={scopeKey(candidate)} on={on} ok={ok} label={scopeKey(candidate)} onChange={() => onScope(candidate)} />
				);
			})}
			<span className="w-[60px] shrink-0">
				<Menu
					current={{ token: null, name: "+" }}
					options={options}
					ok={ok}
					faint
					onPick={(prefix) => {
						if (prefix === null) return;
						onAdd([prefix]);
						onScope([prefix]);
					}}
					className="h-5"
				/>
			</span>
		</div>
	);
}

/** the other reading: every scope the literal carries, as its own rows at the foot */
function ScopeSections({ reading, acts, extra, onAdd }: { reading: Reading; acts: Acts; extra: readonly Scope[]; onAdd: (scope: Scope) => void }) {
	const scopes = scopesOf(reading.className).slice(1);
	for (const candidate of extra) if (!scopes.some((known) => scopeKey(known) === scopeKey(candidate))) scopes.push(candidate);
	const verdict = literalVerdict(reading.element);
	const options: Option[] = VARIANTS.filter((variant) => !scopes.some((known) => scopeKey(known) === `${variant.prefix}:`)).map((variant) => ({
		token: variant.prefix,
		name: `${variant.prefix}:`,
		value: variant.when.replace("@media ", ""),
		group: variant.group,
	}));
	return (
		<>
			{scopes.map((scope) => (
				<ScopeRows key={scopeKey(scope)} reading={reading} acts={acts} scope={scope} />
			))}
			<div className="flex h-7 items-center border-border-raised border-t px-2.5">
				<span className="w-[88px]">
					<Menu current={{ token: null, name: "+ variant" }} options={options} ok={verdict.ok} faint onPick={(prefix) => (prefix === null ? undefined : onAdd([prefix]))} className="h-5" />
				</span>
			</div>
		</>
	);
}

function ScopeRows({ reading, acts, scope }: { reading: Reading; acts: Acts; scope: Scope }) {
	const scoped = inScope(reading.className, scope);
	const verdict = literalVerdict(reading.element);
	const view: View = {
		reading,
		element: reading.element,
		scope,
		scoped,
		base: inScope(reading.className, []),
		set: (change) => acts.setClass(reading.element.id, (className) => withScope(className, scope, change)),
		fresh: (token) => token !== null && !reading.original.has(`${scopeKey(scope)}${token}`),
		acts,
	};
	const when = VARIANTS.find((variant) => variant.prefix === scope[0])?.when.replace("@media ", "") ?? "";
	return (
		<Section name={scopeKey(scope)} reason={when}>
			{split(scoped).map((token) => (
				<ScopedRow key={token} token={token} view={view} ok={verdict.ok} />
			))}
			<div className="flex h-7 items-center px-1.5">
				<AddField
					candidates={candidatesFor(reading.element).map((candidate) => ({ ...candidate }))}
					taken={new Set(split(scoped))}
					ok={verdict.ok}
					onAdd={(token) => view.set((held) => `${held} ${token}`.trim())}
				/>
			</div>
		</Section>
	);
}

/** one token under a scope, drawn with the primitive its family takes */
function ScopedRow({ token, view, ok }: { token: string; view: View; ok: boolean }) {
	const compiled = compiles(token);
	const property = compiled.ok ? compiled.css.split(":")[0] ?? token : token;
	const length = lengthOfToken(anatomyOf(token).base);
	if (length !== null) {
		return <LengthRow name={property} family={length.family} view={view} ok={ok} />;
	}
	for (const prefix of ["bg", "text", "border"] as const) {
		const colour = colourOf(token, prefix, { paint: "", from: "" });
		if (colour.token !== null) return <ColourRow name={property} prefix={prefix} view={view} ok={ok} absent={{ name: "none", paint: "", from: "" }} />;
	}
	return (
		<Row name={property} ok={ok} changed={view.fresh(token)}>
			<span className={cn("min-w-0 flex-1 truncate px-1", VALUE, ok ? "text-text" : "text-muted/40")}>{token}</span>
			{ok ? (
				<button
					type="button"
					aria-label={`remove ${token}`}
					onClick={() => view.set((held) => split(held).filter((candidate) => candidate !== token).join(" "))}
					className={cn("shrink-0 cursor-pointer rounded-xs px-1 text-muted/50 hover:text-text", VALUE)}
				>
					×
				</button>
			) : null}
		</Row>
	);
}

/* ---------- the number row, P6 inside it ---------- */

/**
 * A length on one family: the token's value in the box, what it measures faint
 * beside it, the label scrubs, arrows step. A sign, a fraction and a unit are
 * all typed straight in: `-4`, `1/2`, `50%`, `347px`, `12deg`, `150ms`.
 */
function LengthRow({
	name,
	family,
	view,
	ok,
	measured = 0,
	placeholder,
	fallback,
	onEmpty,
	aside,
}: {
	name: string;
	family: string;
	view: View;
	ok: boolean;
	/** what the box measures when nothing sets it, so a step starts from the truth */
	measured?: number;
	placeholder?: string | undefined;
	/** the readout when nothing sets it */
	fallback?: string | undefined;
	/** what typing nothing means: drop the token (default) or write this */
	onEmpty?: (() => void) | undefined;
	aside?: ReactNode;
}) {
	const kind: Kind = LENGTHS[family] ?? "spacing";
	const own = lengthOf(view.scoped, family);
	const inherited = own === null && view.scope.length > 0 ? lengthOf(view.base, family) : null;
	const shown = own ?? inherited;
	const value = shown === null ? "" : `${shown.negative ? "-" : ""}${shown.value}${shown.important ? "!" : ""}`;
	const readout = shown === null ? (fallback ?? null) : describe(kind, shown.value, shown.negative);
	return (
		<Row
			name={name}
			ok={ok}
			changed={view.fresh(own?.token ?? null)}
			onScrub={(units) => view.set((held) => withLength(held, family, stepLength(kind, lengthOf(held, family) ?? inherited, measured, units)))}
		>
			<NumField
				value={value}
				readout={readout}
				ok={ok}
				faint={own === null}
				placeholder={placeholder ?? (kind === "spacing" ? "auto" : "–")}
				changed={view.fresh(own?.token ?? null)}
				onCommit={(typed) => {
					const text = typed.trim();
					if (text === "" || text === "auto" || text === "none") {
						if (onEmpty !== undefined) onEmpty();
						else view.set((held) => withLength(held, family, null));
						return;
					}
					const next = parseTyped(kind, text);
					if (next !== null) view.set((held) => withLength(held, family, next));
				}}
				onStep={(units) => view.set((held) => withLength(held, family, stepLength(kind, lengthOf(held, family) ?? inherited, measured, units)))}
			/>
			{aside}
		</Row>
	);
}

/* ---------- the colour row, P2 inside it ---------- */

const COLOUR_OPTIONS: readonly Option[] = COLOUR_NAMES.map((colour) => ({
	token: colour.name,
	name: colour.name,
	value: colour.from === "tokens.css" ? colour.paint : "",
	swatch: colour.paint,
	group: colour.from,
}));

/** the swatch, the name out of the compiled theme, and the alpha after the slash */
function ColourRow({
	name,
	prefix,
	view,
	ok,
	absent,
	onRead,
	scoped: scopedOverride,
	onWrite,
}: {
	name: string;
	prefix: string;
	view: View;
	ok: boolean;
	absent: { name: string; paint: string; from: string };
	/** read from something other than the scoped literal (a gradient stop, an edge) */
	onRead?: (() => Colour) | undefined;
	scoped?: string | undefined;
	/** write somewhere other than the family's own token */
	onWrite?: ((name: string | null, alpha: number | null) => void) | undefined;
}) {
	const scoped = scopedOverride ?? view.scoped;
	const own = onRead === undefined ? colourOf(scoped, prefix, { paint: absent.paint, from: absent.from }) : onRead();
	const inherited = own.token === null && view.scope.length > 0 ? colourOf(view.base, prefix, { paint: absent.paint, from: absent.from }) : null;
	const shown = own.token === null && inherited !== null ? inherited : own;
	const current: Option =
		shown.name === null
			? { token: null, name: absent.name, swatch: absent.paint, value: "" }
			: { token: shown.name, name: shown.name, swatch: shown.paint, value: "" };
	const write = (nextName: string | null, alpha: number | null) =>
		onWrite === undefined ? view.set((held) => withColour(held, prefix, nextName, alpha)) : onWrite(nextName, alpha);
	return (
		<Row name={name} ok={ok} changed={view.fresh(own.token)}>
			<Menu
				current={current}
				options={[{ token: null, name: absent.name, swatch: absent.paint, value: "" }, ...COLOUR_OPTIONS]}
				ok={ok}
				faint={own.token === null}
				changed={view.fresh(own.token)}
				filter
				onPick={(picked) => write(picked, shown.alpha)}
			/>
			<AlphaField alpha={shown.alpha} ok={ok && shown.name !== null} faint={own.token === null} onCommit={(alpha) => write(shown.name, alpha)} />
		</Row>
	);
}

/** `/50`: the alpha as a percent, full when empty */
function AlphaField({ alpha, ok, faint, onCommit }: { alpha: number | null; ok: boolean; faint: boolean; onCommit: (alpha: number | null) => void }) {
	return (
		<span className="flex w-[46px] shrink-0 items-center">
			<span className={cn("shrink-0", FAINT)}>/</span>
			<NumField
				value={alpha === null ? "" : String(alpha)}
				placeholder="100"
				ok={ok}
				faint={faint}
				onCommit={(typed) => {
					const n = Number.parseFloat(typed.replace("%", ""));
					if (typed.trim() === "" || Number.isNaN(n) || n >= 100) onCommit(null);
					else onCommit(Math.max(0, n));
				}}
				onStep={(units) => {
					const now = alpha ?? 100;
					const next = Math.min(100, Math.max(0, now + units * 5));
					onCommit(next >= 100 ? null : next);
				}}
			/>
		</span>
	);
}

/* ---------- a word row and a theme row ---------- */

function WordRow({ name, word, view, ok, fallback, clear }: { name: string; word: keyof typeof WORDS; view: View; ok: boolean; fallback: string; clear?: string }) {
	const own = wordOf(view.scoped, word);
	const inherited = own === null && view.scope.length > 0 ? wordOf(view.base, word) : null;
	const shown = own ?? inherited;
	const options: Option[] = WORDS[word].options.map((option) => ({ token: option.token, name: option.token, value: option.says === option.token ? "" : option.says }));
	return (
		<Row name={name} ok={ok} changed={view.fresh(own)}>
			<Menu
				current={options.find((option) => option.token === shown) ?? { token: null, name: fallback }}
				options={options}
				ok={ok}
				faint={own === null}
				changed={view.fresh(own)}
				onPick={(token) => view.set((held) => withWord(held, word, token === clear ? null : token))}
			/>
		</Row>
	);
}

function themeOptions(options: readonly ThemeOption[]): Option[] {
	return options.map((option) => ({ token: option.token, name: option.token, value: option.value, group: option.from }));
}

function ThemeRow({ name, options, view, ok, fallback }: { name: string; options: readonly ThemeOption[]; view: View; ok: boolean; fallback: Option }) {
	const own = themeOf(view.scoped, options);
	const inherited = own === null && view.scope.length > 0 ? themeOf(view.base, options) : null;
	const shown = own ?? inherited;
	return (
		<Row name={name} ok={ok} changed={view.fresh(own?.token ?? null)}>
			<Menu
				current={shown === null ? fallback : { token: shown.token, name: shown.token, value: shown.value }}
				options={[fallback, ...themeOptions(options)]}
				ok={ok}
				faint={own === null}
				changed={view.fresh(own?.token ?? null)}
				filter={options.length > 8}
				onPick={(token) => view.set((held) => withTheme(held, options, token))}
			/>
		</Row>
	);
}

/* ---------- P4: a toggle set row ---------- */

function ToggleRow({ set, view, ok, menuGroup }: { set: ToggleSet; view: View; ok: boolean; menuGroup?: readonly string[] | undefined }) {
	const on = toggledOf(view.scoped, set);
	const inherited = view.scope.length > 0 ? toggledOf(view.base, set) : new Set<string>();
	const chips = set.groups.filter((group) => group !== menuGroup).flat();
	const menu = menuGroup ?? null;
	const menuOn = menu === null ? null : (menu.find((token) => on.has(token)) ?? null);
	return (
		<Row name={set.property} ok={ok} tall changed={[...on].some((token) => view.fresh(token))}>
			<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
				{chips.map((token) => (
					<Chip
						key={token}
						label={token}
						on={on.has(token) || (!on.has(token) && inherited.has(token))}
						ok={ok}
						title={compiles(token).ok ? (compiles(token) as { css: string }).css : token}
						onChange={(next) => view.set((held) => withToggle(held, set, token, next))}
					/>
				))}
				{menu === null ? null : (
					<span className="w-[88px]">
						<Menu
							current={menuOn === null ? { token: null, name: `${menu[0]?.split("-")[0] ?? ""}-none` } : { token: menuOn, name: menuOn }}
							options={[{ token: null, name: `${menu[0]?.split("-")[0] ?? ""}-none` }, ...menu.map((token) => ({ token, name: token }))]}
							ok={ok}
							faint={menuOn === null}
							onPick={(token) => view.set((held) => (token === null ? (menuOn === null ? held : withToggle(held, set, menuOn, false)) : withToggle(held, set, token, true)))}
						/>
					</span>
				)}
			</div>
		</Row>
	);
}

/* ---------- position ---------- */

function FramePosition({ view }: { view: View }) {
	const { reading, acts } = view;
	return (
		<Section name="position" reason="frame.json">
			{(["x", "y"] as const).map((key) => (
				<Row key={key} name={key} onScrub={(units) => acts.setFrame({ [key]: reading.frame[key] + units * 4 })}>
					<NumField
						value={String(reading.frame[key])}
						readout="px"
						ok
						onCommit={(typed) => {
							const n = Number.parseInt(typed, 10);
							if (!Number.isNaN(n)) acts.setFrame({ [key]: n });
						}}
						onStep={(units) => acts.setFrame({ [key]: reading.frame[key] + units * 4 })}
					/>
				</Row>
			))}
		</Section>
	);
}

const INSETS: readonly { name: string; family: string }[] = [
	{ name: "top", family: "top" },
	{ name: "right", family: "right" },
	{ name: "bottom", family: "bottom" },
	{ name: "left", family: "left" },
];

function PositionSection({ view }: { view: View }) {
	const { element, reading } = view;
	const words = wordVerdict(element);
	const position = wordOf(view.scoped, "position") ?? (view.scope.length > 0 ? wordOf(view.base, "position") : null);
	const placed = position === "absolute" || position === "fixed" || position === "sticky";
	return (
		<Section name="position" reason={sectionReason(element, words)} aside={<span className={FAINT}>{`${Math.round(reading.inFrame.x)}, ${Math.round(reading.inFrame.y)} in cart`}</span>}>
			<WordRow name="position" word="position" view={view} ok={words.ok} fallback="static" clear="static" />
			{placed ? INSETS.map((entry) => <LengthRow key={entry.family} name={entry.name} family={entry.family} view={view} ok={words.ok} />) : null}
			{placed || lengthOf(view.scoped, "z") !== null ? <LengthRow name="z-index" family="z" view={view} ok={words.ok} fallback="auto" placeholder="auto" /> : null}
		</Section>
	);
}

/* ---------- size ---------- */

function FrameSize({ view }: { view: View }) {
	const { reading, acts } = view;
	return (
		<Section name="size" reason="frame.json">
			{(["w", "h"] as const).map((key) => (
				<Row key={key} name={key} onScrub={(units) => acts.setFrame({ [key]: Math.max(80, reading.frame[key] + units * 4) })}>
					<NumField
						value={String(reading.frame[key])}
						readout="px"
						ok
						onCommit={(typed) => {
							const n = Number.parseInt(typed, 10);
							if (!Number.isNaN(n)) acts.setFrame({ [key]: Math.max(80, n) });
						}}
						onStep={(units) => acts.setFrame({ [key]: Math.max(80, reading.frame[key] + units * 4) })}
					/>
				</Row>
			))}
		</Section>
	);
}

const MODES: readonly { token: SizeMode; says: string }[] = [
	{ token: "hug", says: "hug" },
	{ token: "fill", says: "fill" },
	{ token: "fixed", says: "fixed" },
];

/** width and height, each a mode and a number: hug is no token, fill is `full`, fixed is the scale or pixels */
function SizeSection({ view }: { view: View }) {
	const { element, reading } = view;
	const wide = sizeVerdict(element, "w");
	const tall = sizeVerdict(element, "h");
	const worst = !wide.ok ? wide : tall;
	return (
		<Section name="size" reason={sectionReason(element, worst)}>
			{(["w", "h"] as const).map((axis) => {
				const verdict = axis === "w" ? wide : tall;
				const measured = Math.round(axis === "w" ? reading.box.w : reading.box.h);
				const own = lengthOf(view.scoped, axis);
				const mode = sizeModeOf(view.scoped, axis);
				const modeToken = own === null && view.scope.length > 0 ? sizeModeOf(view.base, axis) : mode;
				const options: Option[] = MODES.map((entry) => ({ token: entry.token, name: entry.says }));
				return (
					<LengthRow
						key={axis}
						name={axis === "w" ? "width" : "height"}
						family={axis}
						view={view}
						ok={verdict.ok && (mode === "fixed" || view.scope.length > 0)}
						measured={measured}
						fallback={`${measured}px`}
						placeholder={mode === "fill" ? (lengthOf(view.base, axis) === null ? "flex-1" : `${axis}-full`) : "auto"}
						aside={
							<span className="w-[58px] shrink-0">
								<Menu
									current={options.find((option) => option.token === modeToken) ?? { token: null, name: "hug" }}
									options={options}
									ok={verdict.ok}
									faint={own === null && mode === "hug"}
									onPick={(token) => view.set((held) => withSizeMode(held, axis, (token ?? "hug") as SizeMode, measured))}
								/>
							</span>
						}
					/>
				);
			})}
		</Section>
	);
}

/* ---------- layout ---------- */

/* ---------- the fold: one row, two axes, four sides ---------- */

type Sides = Record<Side, string | null>;

interface FoldNames {
	one: string;
	x: string;
	y: string;
	t: string;
	r: string;
	b: string;
	l: string;
}

function levelOf(sides: Sides, max: 1 | 2): 0 | 1 | 2 {
	if (sides.t === sides.r && sides.r === sides.b && sides.b === sides.l) return 0;
	if (sides.t === sides.b && sides.l === sides.r) return 1;
	return max;
}

/**
 * Padding, margin and gap fold the same way: one box when every side agrees,
 * two when opposite sides do (`padding-inline`, `padding-block`), four
 * otherwise. The caret steps the fold open; the write-back is always the fewest
 * tokens that say it (`p-4`, `px-4 py-2`, the sides), which is the spacing
 * spike's shorthand split run both ways. Margin carries a sign.
 */
function FoldRows({
	view,
	ok,
	names,
	max = 2,
	read,
	write,
	signed = false,
	freshWhen,
}: {
	view: View;
	ok: boolean;
	names: FoldNames;
	max?: 1 | 2;
	read: (scoped: string) => Sides;
	write: (scoped: string, sides: Sides) => string;
	/** negatives allowed (margin) */
	signed?: boolean;
	/** which tokens count as this fold's, for the changed mark */
	freshWhen: RegExp;
}) {
	const [want, setWant] = useState<0 | 1 | 2>(0);
	const own = read(view.scoped);
	const inherited = view.scope.length > 0 ? read(view.base) : own;
	const natural = levelOf(Object.values(own).every((value) => value === null) ? inherited : own, max);
	const level = Math.min(max, Math.max(want, natural)) as 0 | 1 | 2;
	const fresh = split(view.scoped).some((token) => freshWhen.test(anatomyOf(token).base) && view.fresh(token));
	const caret = <Fold open={level > 0} ok={ok} onToggle={() => setWant(level >= max ? 0 : ((level + 1) as 1 | 2))} />;
	const rows: { name: string; sides: readonly Side[] }[] =
		level === 0
			? [{ name: names.one, sides: ["t", "r", "b", "l"] }]
			: level === 1
				? [
						{ name: names.x, sides: ["l", "r"] },
						{ name: names.y, sides: ["t", "b"] },
					]
				: [
						{ name: names.t, sides: ["t"] },
						{ name: names.r, sides: ["r"] },
						{ name: names.b, sides: ["b"] },
						{ name: names.l, sides: ["l"] },
					];
	return (
		<>
			{rows.map((row, index) => {
				const first = row.sides[0] ?? "t";
				const value = own[first];
				const shown = value ?? inherited[first];
				const parsed = shown === null ? null : { value: shown.replace(/^-/, ""), negative: shown.startsWith("-") };
				const put = (next: string | null) =>
					view.set((held) => {
						const now = read(held);
						const sides: Sides = { ...now };
						for (const side of row.sides) sides[side] = next;
						return write(held, sides);
					});
				const step = (units: number) => {
					const px = parsed === null ? 0 : (lengthPxSigned(parsed) ?? 0);
					const next = stepLength("spacing", null, px, units);
					put(next.negative && !signed ? "0" : `${next.negative ? "-" : ""}${next.value}`);
				};
				return (
					<Row key={row.name} name={row.name} ok={ok} changed={fresh} onScrub={step}>
						<NumField
							value={shown ?? ""}
							placeholder="0"
							readout={parsed === null ? "0px" : describe("spacing", parsed.value, parsed.negative)}
							ok={ok}
							faint={value === null}
							changed={fresh}
							onCommit={(typed) => {
								const text = typed.trim();
								if (text === "" || text === "0") return put(null);
								const next = parseTyped("spacing", text);
								if (next === null || (next.negative && !signed)) return;
								put(`${next.negative ? "-" : ""}${next.value}`);
							}}
							onStep={step}
						/>
						{index === 0 ? caret : null}
					</Row>
				);
			})}
		</>
	);
}

function lengthPxSigned(parsed: { value: string; negative: boolean }): number | null {
	const px = lengthPx("spacing", parsed.value);
	return px === null ? null : parsed.negative ? -px : px;
}

const PADDING_NAMES: FoldNames = { one: "padding", x: "padding-inline", y: "padding-block", t: "padding-top", r: "padding-right", b: "padding-bottom", l: "padding-left" };
const MARGIN_NAMES: FoldNames = { one: "margin", x: "margin-inline", y: "margin-block", t: "margin-top", r: "margin-right", b: "margin-bottom", l: "margin-left" };
const GAP_NAMES: FoldNames = { one: "gap", x: "column-gap", y: "row-gap", t: "row-gap", r: "column-gap", b: "row-gap", l: "column-gap" };

function LayoutSection({ view }: { view: View }) {
	const { element } = view;
	const words = wordVerdict(element);
	const spacing = spacingVerdict(element);
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
	const flex = display === "flex" || display === "inline-flex";
	const grid = display === "grid";
	const column = (own.direction ?? base.direction) === "flex-col";
	const overflow = wordOf(view.scoped, "overflow") ?? (view.scope.length > 0 ? wordOf(view.base, "overflow") : null);
	const scrolls = overflow === "overflow-auto" || overflow === "overflow-scroll";
	const reason = sectionReason(element, words) ?? (spacing.ok ? undefined : sectionReason(element, spacing));

	return (
		<Section name="layout" reason={reason}>
			<WordRow name="display" word="display" view={view} ok={words.ok} fallback={element.display} />
			{flex ? (
				<>
					<Row name="flex-direction" ok={words.ok} changed={view.fresh(own.direction)}>
						<IconField
							value={own.direction ?? base.direction ?? "flex-row"}
							ok={words.ok}
							options={[
								{ token: "flex-row", icon: <ArrowIcon /> },
								{ token: "flex-col", icon: <ArrowIcon down /> },
							]}
							onPick={(token) => view.set((held) => withWord(held, "direction", token === "flex-row" && view.scope.length === 0 ? null : token))}
						/>
						<span className={cn("ml-auto shrink-0", FAINT)}>{column ? "column" : "row"}</span>
						<Chip
							label="wrap"
							on={(own.wrap ?? base.wrap) === "flex-wrap"}
							ok={words.ok}
							onChange={(next) => view.set((held) => withWord(held, "wrap", next ? "flex-wrap" : null))}
						/>
					</Row>
					<Row name="items / justify" ok={words.ok} tall changed={view.fresh(own.align) || view.fresh(own.justify)}>
						<PlaceField
							align={own.align ?? base.align}
							justify={own.justify ?? base.justify}
							column={column}
							ok={words.ok}
							onPick={(align, justify) => view.set((held) => withWord(withWord(held, "align", align), "justify", justify))}
						/>
						<span className="flex min-w-0 flex-1 flex-col gap-1">
							<WordMenu word="align" own={own.align} base={base.align} view={view} ok={words.ok} fallback="items-stretch" />
							<WordMenu word="justify" own={own.justify} base={base.justify} view={view} ok={words.ok} fallback="justify-start" />
						</span>
					</Row>
				</>
			) : null}
			{grid ? <LengthRow name="grid-template-columns" family="grid-cols" view={view} ok={words.ok} placeholder="none" /> : null}
			{flex || grid ? (
				<FoldRows
					view={view}
					ok={spacing.ok}
					names={GAP_NAMES}
					max={1}
					read={(scoped) => {
						const gap = gapOf(scoped);
						return { t: gap.y, b: gap.y, l: gap.x, r: gap.x };
					}}
					write={(scoped, sides) => withGap(scoped, { x: sides.l, y: sides.t })}
					freshWhen={/^gap(-[xy])?-/}
				/>
			) : null}
			<FoldRows view={view} ok={spacing.ok} names={PADDING_NAMES} read={paddingOf} write={withPadding} freshWhen={/^p[xytrblse]?-/} />
			<FoldRows view={view} ok={words.ok} names={MARGIN_NAMES} read={marginOf} write={withMargin} signed freshWhen={/^m[xytrblse]?-/} />
			<WordRow name="overflow" word="overflow" view={view} ok={words.ok} fallback="visible" />
			{scrolls ? <ToggleRow set={SNAP_SET} view={view} ok={words.ok} /> : null}
		</Section>
	);
}


function WordMenu({ word, own, base, view, ok, fallback }: { word: "align" | "justify"; own: string | null; base: string | null; view: View; ok: boolean; fallback: string }) {
	const options: Option[] = WORDS[word].options.map((option) => ({ token: option.token, name: option.token }));
	const shown = own ?? base;
	return (
		<Menu
			current={options.find((option) => option.token === shown) ?? { token: null, name: fallback }}
			options={options}
			ok={ok}
			faint={own === null}
			changed={view.fresh(own)}
			onPick={(token) => view.set((held) => withWord(held, word, token))}
		/>
	);
}


/* ---------- appearance: opacity, radius with its corners, shadow, filter, transform, transition ---------- */

const CORNERS: readonly { name: string; corner: Corner }[] = [
	{ name: "border-top-left-radius", corner: "tl" },
	{ name: "border-top-right-radius", corner: "tr" },
	{ name: "border-bottom-right-radius", corner: "br" },
	{ name: "border-bottom-left-radius", corner: "bl" },
];

const RADIUS_OPTIONS: readonly Option[] = RADII.map((radius) => ({ token: radius.suffix, name: radius.suffix === "" ? "rounded" : `rounded-${radius.suffix}`, value: radius.value, group: radius.from }));

function AppearanceSection({ view }: { view: View }) {
	const { element } = view;
	const verdict = literalVerdict(element);
	const [corners, setCorners] = useState(false);
	const [more, setMore] = useState(false);
	const own = cornersOf(view.scoped);
	const inherited = view.scope.length > 0 ? cornersOf(view.base) : own;
	const shown = (corner: Corner) => own[corner] ?? inherited[corner];
	const even = own.tl === own.tr && own.tr === own.br && own.br === own.bl;
	const unfolded = corners || !even;
	const shadow = themeOf(view.scoped, SHADOWS);
	const transforms = ["rotate", "scale", "translate-x", "translate-y"].some((family) => lengthOf(view.scoped, family) !== null);
	const transitions = lengthOf(view.scoped, "duration") !== null || themeOf(view.scoped, EASINGS) !== null;
	const filters = toggledOf(view.scoped, FILTER_SET).size > 0;
	const opened = more || transforms || transitions || filters;

	const radiusMenu = (corner: Corner | "all", name: string, fold: ReactNode) => {
		const suffix = corner === "all" ? shown("tl") : shown(corner);
		const ownSuffix = corner === "all" ? own.tl : own[corner];
		const current = suffix === null ? { token: null, name: "rounded-none", value: "0" } : (RADIUS_OPTIONS.find((option) => option.token === suffix) ?? { token: suffix, name: `rounded-${suffix}`, value: radiusValue(suffix) });
		const token = ownSuffix === null ? null : `rounded${corner === "all" ? "" : `-${corner}`}-${ownSuffix}`;
		return (
			<Row key={name} name={name} ok={verdict.ok} changed={view.fresh(token) || split(view.scoped).some((t) => t.startsWith("rounded") && view.fresh(t) && corner === "all")}>
				<Menu
					current={current}
					options={[{ token: null, name: "rounded-none", value: "0" }, ...RADIUS_OPTIONS.filter((option) => option.token !== "none")]}
					ok={verdict.ok}
					faint={ownSuffix === null}
					changed={token !== null && view.fresh(token)}
					onPick={(picked) =>
						view.set((held) => {
							const now = cornersOf(held);
							if (corner === "all") return withCorners(held, { tl: picked, tr: picked, br: picked, bl: picked });
							return withCorners(held, { ...now, [corner]: picked });
						})
					}
				/>
				{fold}
			</Row>
		);
	};

	return (
		<Section name="appearance" reason={sectionReason(element, verdict)}>
			<LengthRow name="opacity" family="opacity" view={view} ok={verdict.ok} placeholder="100" fallback="100%" />
			{unfolded
				? CORNERS.map((entry, index) => radiusMenu(entry.corner, entry.name, index === 0 ? <Fold open ok={verdict.ok && even} onToggle={() => setCorners(false)} /> : null))
				: radiusMenu("all", "border-radius", <Fold open={false} ok={verdict.ok} onToggle={() => setCorners(true)} />)}
			<Row name="box-shadow" ok={verdict.ok} changed={view.fresh(shadow?.token ?? null)}>
				{shadow === null ? (
					<span className={cn("min-w-0 flex-1 truncate px-1 text-muted/55", VALUE)}>none</span>
				) : (
					<Menu
						current={{ token: shadow.token, name: shadow.token, value: shadow.value }}
						options={[{ token: null, name: "shadow-none", value: "none" }, ...themeOptions(SHADOWS)]}
						ok={verdict.ok}
						onPick={(token) => view.set((held) => withTheme(held, SHADOWS, token))}
					/>
				)}
			</Row>
			{opened ? (
				<>
					<ToggleRow set={FILTER_SET} view={view} ok={verdict.ok} menuGroup={FILTER_SET.groups[3]} />
					<LengthRow name="rotate" family="rotate" view={view} ok={verdict.ok} placeholder="0" fallback="0deg" />
					<LengthRow name="scale" family="scale" view={view} ok={verdict.ok} placeholder="100" fallback="100%" />
					<LengthRow name="translate-x" family="translate-x" view={view} ok={verdict.ok} placeholder="0" fallback="0px" />
					<LengthRow name="translate-y" family="translate-y" view={view} ok={verdict.ok} placeholder="0" fallback="0px" />
					<LengthRow name="transition-duration" family="duration" view={view} ok={verdict.ok} placeholder="150" fallback="150ms" />
					<ThemeRow name="transition-timing-function" options={EASINGS} view={view} ok={verdict.ok} fallback={{ token: null, name: "ease-default", value: "cubic-bezier(0.4, 0, 0.2, 1)" }} />
				</>
			) : (
				<div className="flex h-7 items-center px-1.5">
					<button type="button" disabled={!verdict.ok} onClick={() => setMore(true)} className={cn("flex h-6 cursor-pointer items-center gap-1.5 rounded-xs px-1.5 hover:bg-surface", FAINT, verdict.ok ? "hover:text-text" : "cursor-default")}>
						<span className="text-sm leading-none">+</span>
						<span className={LABEL}>filter, transform, transition</span>
					</button>
				</div>
			)}
		</Section>
	);
}

/* ---------- fill: a colour with alpha, or a gradient ---------- */

const SHAPES: readonly Option[] = [
	{ token: null, name: "none" },
	{ token: "linear", name: "bg-linear-*" },
	{ token: "radial", name: "bg-radial" },
	{ token: "conic", name: "bg-conic" },
];

const DIRECTION_OPTIONS: readonly Option[] = DIRECTIONS.map((direction) => ({ token: direction.value, name: direction.value, value: direction.says }));

function FillSection({ view, shape }: { view: View; shape: Shape }) {
	const { element } = view;
	const verdict = literalVerdict(element);
	const gradient = gradientOf(view.scoped) ?? (view.scope.length > 0 ? gradientOf(view.base) : null);
	const ownGradient = gradientOf(view.scoped);
	const [stopAt, setStopAt] = useState<0 | 1 | 2>(0);
	const write = (next: Gradient | null) => view.set((held) => withGradient(held, next));
	const fresh = split(view.scoped).some((token) => /^(bg-(linear|gradient|radial|conic)|from-|via-|to-)/.test(token) && view.fresh(token));

	const stopRow = (index: 0 | 1 | 2, withPosition: boolean) => {
		if (gradient === null) return null;
		const stop = gradient.stops[index];
		if (stop === undefined) return null;
		const absent = { name: "none", paint: "", from: "" };
		return (
			<Row key={stop.at} name={withPosition ? stop.at : `${stop.at}-*`} ok={verdict.ok} changed={fresh && stop.colour !== null}>
				<Menu
					current={stop.colour === null ? { token: null, name: absent.name, swatch: "" } : { token: stop.colour.name, name: stop.colour.name ?? "", swatch: stop.colour.paint }}
					options={[{ token: null, name: absent.name, swatch: "" }, ...COLOUR_OPTIONS]}
					ok={verdict.ok}
					faint={stop.colour === null}
					filter
					onPick={(name) =>
						write({
							...gradient,
							stops: gradient.stops.map((candidate, at) =>
								at === index
									? { ...candidate, colour: name === null ? null : { token: null, name, alpha: candidate.colour?.alpha ?? null, paint: "", from: "" } }
									: candidate,
							),
						})
					}
				/>
				<AlphaField
					alpha={stop.colour?.alpha ?? null}
					ok={verdict.ok && stop.colour !== null}
					faint={false}
					onCommit={(alpha) =>
						write({
							...gradient,
							stops: gradient.stops.map((candidate, at) => (at === index && candidate.colour !== null ? { ...candidate, colour: { ...candidate.colour, alpha } } : candidate)),
						})
					}
				/>
				{withPosition ? (
					<span className="w-[44px] shrink-0">
						<NumField
							value={stop.position === null ? "" : stop.position.replace("%", "")}
							placeholder={index === 0 ? "0" : index === 1 ? "50" : "100"}
							readout="%"
							ok={verdict.ok && stop.colour !== null}
							faint={stop.position === null}
							onCommit={(typed) => {
								const n = Number.parseFloat(typed);
								write({
									...gradient,
									stops: gradient.stops.map((candidate, at) => (at === index ? { ...candidate, position: Number.isNaN(n) ? null : `${Math.max(0, Math.min(100, n))}%` } : candidate)),
								});
							}}
							onStep={(units) => {
								const now = stop.position === null ? (index === 0 ? 0 : index === 1 ? 50 : 100) : Number.parseFloat(stop.position);
								write({
									...gradient,
									stops: gradient.stops.map((candidate, at) => (at === index ? { ...candidate, position: `${Math.max(0, Math.min(100, now + units * 5))}%` } : candidate)),
								});
							}}
						/>
					</span>
				) : null}
			</Row>
		);
	};

	return (
		<Section name="fill" reason={sectionReason(element, verdict)}>
			<ColourRow name="background-color" prefix="bg" view={view} ok={verdict.ok} absent={{ name: "transparent", paint: "", from: "none" }} />
			<Row name="background-image" ok={verdict.ok} changed={fresh && ownGradient !== null}>
				<Menu
					current={gradient === null ? { token: null, name: "none" } : (SHAPES.find((option) => option.token === gradient.shape) ?? { token: null, name: "none" })}
					options={SHAPES}
					ok={verdict.ok}
					faint={gradient === null}
					changed={fresh && ownGradient !== null}
					onPick={(picked) => {
						if (picked === null) return write(null);
						const from = gradient?.stops[0]?.colour ?? { token: null, name: "thread", alpha: null, paint: "", from: "" };
						const to = gradient?.stops[2]?.colour ?? { token: null, name: "raised", alpha: null, paint: "", from: "" };
						write({
							shape: picked as Gradient["shape"],
							direction: picked === "linear" ? (gradient?.shape === "linear" ? gradient.direction : "to-r") : null,
							stops: gradient?.stops ?? [
								{ at: "from", colour: from, position: null },
								{ at: "via", colour: null, position: null },
								{ at: "to", colour: to, position: null },
							],
							token: "",
						});
					}}
				/>
			</Row>
			{gradient === null ? null : (
				<>
					{gradient.shape === "linear" ? (
						<Row name="direction" ok={verdict.ok}>
							<Menu
								current={{ ...(DIRECTION_OPTIONS.find((option) => option.token === gradient.direction) ?? { token: gradient.direction, name: gradient.direction ?? "to-r" }), value: "" }}
								options={DIRECTION_OPTIONS}
								ok={verdict.ok}
								onPick={(direction) => write({ ...gradient, direction })}
							/>
							<span className="w-[48px] shrink-0">
								<NumField
									value={gradient.direction !== null && /^\d+$/.test(gradient.direction) ? gradient.direction : ""}
									placeholder="deg"
									ok={verdict.ok}
									faint
									onCommit={(typed) => {
										const n = Number.parseInt(typed, 10);
										if (!Number.isNaN(n)) write({ ...gradient, direction: String(((n % 360) + 360) % 360) });
									}}
									onStep={(units) => {
										const now = gradient.direction !== null && /^\d+$/.test(gradient.direction) ? Number(gradient.direction) : 90;
										write({ ...gradient, direction: String((((now + units * 15) % 360) + 360) % 360) });
									}}
								/>
							</span>
						</Row>
					) : null}
					{shape.gradient === "bar" ? (
						<>
							<GradientBar gradient={gradient} at={stopAt} ok={verdict.ok} onPick={setStopAt} onMove={(index, position) => write({ ...gradient, stops: gradient.stops.map((candidate, i) => (i === index ? { ...candidate, position } : candidate)) })} />
							{stopRow(stopAt, true)}
						</>
					) : (
						<>
							{stopRow(0, true)}
							{stopRow(1, true)}
							{stopRow(2, true)}
						</>
					)}
				</>
			)}
		</Section>
	);
}

/** P3 the other way: the gradient drawn, stops on it, drag one along, click one to edit it below */
function GradientBar({
	gradient,
	at,
	ok,
	onPick,
	onMove,
}: {
	gradient: Gradient;
	at: 0 | 1 | 2;
	ok: boolean;
	onPick: (index: 0 | 1 | 2) => void;
	onMove: (index: 0 | 1 | 2, position: string) => void;
}) {
	const fallback = [0, 50, 100] as const;
	const positionOf = (index: 0 | 1 | 2) => {
		const stop = gradient.stops[index];
		return stop?.position === null || stop?.position === undefined ? fallback[index] : Number.parseFloat(stop.position);
	};
	const preview = gradientCss({ ...gradient, shape: "linear", direction: "to-r" });
	return (
		<div className="flex h-9 items-center gap-2 border-border/80 border-b px-2.5">
			<span className={cn("w-[92px] shrink-0 truncate text-muted", LABEL)}>stops</span>
			<div
				className="relative h-5 min-w-0 flex-1 rounded-xs border border-border-raised"
				style={{ background: preview }}
				onPointerDown={(event) => {
					if (!ok) return;
					const rect = event.currentTarget.getBoundingClientRect();
					const bar = event.currentTarget;
					const move = (moving: PointerEvent) => {
						const pct = Math.max(0, Math.min(100, Math.round(((moving.clientX - rect.left) / rect.width) * 100)));
						onMove(at, `${pct}%`);
					};
					const up = () => {
						bar.removeEventListener("pointermove", move);
						bar.removeEventListener("pointerup", up);
					};
					bar.setPointerCapture(event.pointerId);
					bar.addEventListener("pointermove", move);
					bar.addEventListener("pointerup", up);
				}}
			>
				{([0, 1, 2] as const).map((index) => {
					const stop = gradient.stops[index];
					if (stop === undefined) return null;
					const on = index === at;
					return (
						<button
							key={stop.at}
							type="button"
							disabled={!ok}
							title={stop.at}
							onPointerDown={(event) => {
								event.stopPropagation();
								onPick(index);
							}}
							className={cn(
								"-translate-x-1/2 absolute top-1/2 h-4 w-4 -translate-y-1/2 cursor-pointer rounded-full border-[1.5px] bg-bg",
								on ? "border-thread" : stop.colour === null ? "border-border-raised border-dashed" : "border-text/70",
							)}
							style={{ left: `${positionOf(index)}%`, background: stop.colour?.paint ?? "transparent" }}
						/>
					);
				})}
			</div>
		</div>
	);
}

/* ---------- stroke: width and colour, each folding to edges ---------- */

const EDGES: readonly { name: string; edge: Edge }[] = [
	{ name: "top", edge: "t" },
	{ name: "right", edge: "r" },
	{ name: "bottom", edge: "b" },
	{ name: "left", edge: "l" },
];

function StrokeSection({ view }: { view: View }) {
	const { element } = view;
	const verdict = literalVerdict(element);
	const [widthEdges, setWidthEdges] = useState(false);
	const [colourEdges, setColourEdges] = useState(false);
	const widths = borderWidthsOf(view.scoped);
	const baseWidths = view.scope.length > 0 ? borderWidthsOf(view.base) : widths;
	const evenWidth = widths.t === widths.r && widths.r === widths.b && widths.b === widths.l;
	const absent = { paint: "#262626", from: "tokens.css" };
	const colours = borderColoursOf(view.scoped, absent);
	const baseColours = view.scope.length > 0 ? borderColoursOf(view.base, absent) : colours;
	const evenColour = [colours.t, colours.r, colours.b, colours.l].every((colour) => colour.token === colours.t.token);
	const any = Object.values(widths).some((width) => width !== null) || Object.values(baseWidths).some((width) => width !== null);
	const freshWidth = split(view.scoped).some((token) => /^border(-[xytrblse])?(-\d+|-\[.+\])?$/.test(token) && view.fresh(token));

	const widthRow = (edge: Edge | "all", name: string, fold: ReactNode) => {
		const own = edge === "all" ? widths.t : widths[edge];
		const inherited = edge === "all" ? baseWidths.t : baseWidths[edge];
		const shown = own ?? inherited;
		const px = shown === null ? "0" : shown;
		const write = (next: string | null) =>
			view.set((held) => {
				const now = borderWidthsOf(held);
				if (edge === "all") return withBorderWidths(held, { t: next, r: next, b: next, l: next });
				return withBorderWidths(held, { ...now, [edge]: next });
			});
		const step = (units: number) => {
			const now = shown === null ? 0 : Number.parseInt(shown, 10) || 1;
			const next = Math.max(0, now + units);
			write(next === 0 ? null : String(next));
		};
		return (
			<Row key={name} name={name} ok={verdict.ok} changed={freshWidth} onScrub={step}>
				<NumField
					value={shown === null ? "" : shown}
					placeholder="0"
					readout={describe("px", px) ?? "0px"}
					ok={verdict.ok}
					faint={own === null}
					changed={freshWidth}
					onCommit={(typed) => {
						const next = parseTyped("px", typed);
						write(next === null || next.value === "0" ? null : next.value);
					}}
					onStep={step}
				/>
				{fold}
			</Row>
		);
	};

	const colourRow = (edge: Edge | "all", name: string, fold: ReactNode) => {
		const own = edge === "all" ? colours.t : colours[edge];
		const inherited = edge === "all" ? baseColours.t : baseColours[edge];
		return (
			<ColourRow
				key={name}
				name={name}
				prefix={edge === "all" ? "border" : `border-${edge}`}
				view={view}
				ok={verdict.ok}
				absent={{ name: "border", paint: absent.paint, from: absent.from }}
				onRead={() => (own.token === null && inherited.token !== null ? inherited : own)}
				onWrite={(nextName, alpha) =>
					view.set((held) => {
						const now = borderColoursOf(held, absent);
						const pick = (colour: Colour) => (colour.name === null ? null : { name: colour.name, alpha: colour.alpha });
						const next = nextName === null ? null : { name: nextName, alpha };
						if (edge === "all") return withBorderColours(held, { t: next, r: next, b: next, l: next });
						return withBorderColours(held, { t: pick(now.t), r: pick(now.r), b: pick(now.b), l: pick(now.l), [edge]: next });
					})
				}
			/>
		);
	};

	return (
		<Section name="stroke" reason={sectionReason(element, verdict)}>
			{widthEdges || !evenWidth
				? EDGES.map((entry, index) => widthRow(entry.edge, `border-${entry.name}-width`, index === 0 ? <Fold open ok={verdict.ok && evenWidth} onToggle={() => setWidthEdges(false)} /> : null))
				: widthRow("all", "border-width", <Fold open={false} ok={verdict.ok} onToggle={() => setWidthEdges(true)} />)}
			{any
				? colourEdges || !evenColour
					? EDGES.map((entry, index) => (
							<div key={entry.edge} className="relative">
								{colourRow(entry.edge, `border-${entry.name}-color`, null)}
								{index === 0 ? <span className="absolute top-1.5 right-2.5"><Fold open ok={verdict.ok && evenColour} onToggle={() => setColourEdges(false)} /></span> : null}
							</div>
						))
					: (
						<div className="relative">
							{colourRow("all", "border-color", null)}
							<span className="absolute top-1.5 right-2.5">
								<Fold open={false} ok={verdict.ok} onToggle={() => setColourEdges(true)} />
							</span>
						</div>
					)
				: null}
		</Section>
	);
}

/* ---------- text ---------- */

function TextSection({ view }: { view: View }) {
	const { element, reading, acts } = view;
	const verdict = literalVerdict(element);
	const content = textVerdict(element);
	const words = wordVerdict(element);
	const shown = element.text === undefined ? null : (reading.text ?? ("expr" in element.text ? element.text.expr : ""));
	const align = wordOf(view.scoped, "textAlign") ?? (view.scope.length > 0 ? wordOf(view.base, "textAlign") : null);
	return (
		<Section name="text" reason={shown === null ? sectionReason(element, verdict) : (sectionReason(element, content) ?? sectionReason(element, verdict))}>
			{shown === null ? null : (
				<Row name="textContent" ok={content.ok} changed={element.text !== undefined && "literal" in element.text && reading.text !== null && reading.text !== element.text.literal}>
					<TextField value={shown} ok={content.ok} changed={element.text !== undefined && "literal" in element.text && reading.text !== null && reading.text !== element.text.literal} onCommit={(text) => acts.setText(element.id, text)} />
				</Row>
			)}
			<ThemeRow name="font-family" options={FONTS} view={view} ok={verdict.ok} fallback={{ token: null, name: "inherit", value: "Familjen Grotesk" }} />
			<ThemeRow name="font-size" options={TEXT_SIZES} view={view} ok={verdict.ok} fallback={{ token: null, name: "inherit", value: "13px" }} />
			<ThemeRow name="font-weight" options={WEIGHTS} view={view} ok={verdict.ok} fallback={{ token: null, name: "inherit", value: "400" }} />
			<ThemeRow name="line-height" options={LEADINGS} view={view} ok={verdict.ok} fallback={{ token: null, name: "inherit", value: "" }} />
			<ThemeRow name="letter-spacing" options={TRACKINGS} view={view} ok={verdict.ok} fallback={{ token: null, name: "inherit", value: "0em" }} />
			<Row name="text-align" ok={words.ok} changed={view.fresh(wordOf(view.scoped, "textAlign"))}>
				<IconField
					value={align ?? "text-left"}
					ok={words.ok}
					options={[
						{ token: "text-left", icon: <LinesIcon at="left" /> },
						{ token: "text-center", icon: <LinesIcon at="center" /> },
						{ token: "text-right", icon: <LinesIcon at="right" /> },
					]}
					onPick={(token) => view.set((held) => withWord(held, "textAlign", token === "text-left" && view.scope.length === 0 ? null : token))}
				/>
			</Row>
			<ColourRow name="color" prefix="text" view={view} ok={verdict.ok} absent={{ name: "inherit", paint: "#F0EFED", from: "inherited" }} />
			<ToggleRow set={NUMERIC_SET} view={view} ok={verdict.ok} />
		</Section>
	);
}

/* ---------- source: the literal, the `+`, undo ---------- */

/** what the `+` offers before anything is typed: the families this element's rows do not already cover */
function candidatesFor(element: SourceElement): Candidate[] {
	const seeds = [
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
		"ring-thread",
		"shadow-sm",
		"backdrop-blur-sm",
		"[mask-type:luminance]",
		"[--row-h:44px]",
		"font-features-[\"ss01\"]",
		"content-['']",
		"mt-3.5!",
		"md:hidden",
		"hover:opacity-80",
		"dark:bg-bg",
	];
	return seeds
		.filter((token) => !(element.display === "inline" && /^(flex-1|min-h-0|size-full|aspect-square|self-center|order-first)$/.test(token)))
		.map((token) => {
			const compiled = compiles(token);
			return { token, says: compiled.ok ? compiled.css : compiled.reason };
		});
}

function SourceSection({ view }: { view: View }) {
	const { reading, acts, element } = view;
	const list = split(reading.className);
	const where = element.shared === undefined ? `${FILE}:${element.line}` : `${element.shared.file}:${element.shared.line}`;
	const verdict = literalVerdict(element);
	return (
		<Section name="className" reason={verdict.ok && verdict.scope !== undefined ? verdict.scope : undefined}>
			<div className="flex flex-col gap-1.5 px-2.5 py-2">
				<p className={cn("break-all", VALUE)}>
					{element.computed !== undefined ? (
						<span className="text-muted">{element.computed}</span>
					) : list.length === 0 ? (
						<span className="text-muted/50">null</span>
					) : (
						list.map((token, index) => {
							const anatomy = anatomyOf(token);
							const inScopeNow = view.scope.length === 0 || (anatomy.variants.length > 0 && scopeKey(anatomy.variants) === scopeKey(view.scope));
							return (
								<span key={`${token}-${index}`} className={cn(reading.original.has(token) ? (inScopeNow ? "text-muted" : "text-muted/40") : "text-thread")}>
									{token}
									{index < list.length - 1 ? " " : ""}
								</span>
							);
						})
					)}
				</p>
				<div className="flex items-center gap-2">
					<AddField
						candidates={candidatesFor(element)}
						taken={new Set(list)}
						ok={verdict.ok}
						onAdd={(token) => {
							const prefixed = view.scope.length === 0 || anatomyOf(token).variants.length > 0 ? token : `${scopeKey(view.scope)}${token}`;
							acts.setClass(element.id, (className) => `${className ?? ""} ${prefixed}`.trim());
						}}
						className="-ml-1.5"
					/>
					<span className={cn("min-w-0 truncate", FAINT)}>{where}</span>
					{acts.canUndo ? (
						<button type="button" onClick={acts.undo} className={cn("ml-auto shrink-0 cursor-pointer rounded-xs px-1 text-muted hover:text-text focus:outline-none focus-visible:bg-surface", FAINT)}>
							undo ⌘Z
						</button>
					) : null}
				</div>
			</div>
		</Section>
	);
}

/** exported for the screen's overlay: which knobs draw */
export { SwatchChip };
