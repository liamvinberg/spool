/**
 * The class write-back (#253): one token in, the fewest tokens out.
 *
 * `set-class` is what every field in the rail comes down to, so this module is
 * the one that decides what a literal `className` says afterwards. It takes a
 * single token and the scope it belongs under, and returns the whole literal
 * rewritten as the shortest honest spelling of the same values: `p-4` when all
 * four sides agree, `px-4 py-2` when opposite sides do, `p-4 pt-2` when three
 * of four do, the four sides otherwise. Radius and border widths fold the same
 * way, because their shorthands are the same shape.
 *
 * Three rules run through it:
 *
 * - **Scopes are separate literals.** Tokens under `hover:` or `md:` are read
 *   and written as their own className and laid back into the original order,
 *   so an edit under one scope never disturbs another (#262's scope bar).
 * - **A default drops at the base and is written under a scope.** `p-0` at the
 *   base removes the padding tokens, because that is what the frame's author
 *   would have written; `md:p-0` is a real override and stays.
 * - **The literal's own spelling survives.** A file written in logical sides
 *   (`ps-4`, `border-s`) keeps them, and `!` survives a swap.
 *
 * What it does not know it does not touch: an unrecognised token is appended
 * rather than assumed to replace something, because a wrong replacement is a
 * silent loss and an extra token is visible in the diff. The rail's own family
 * table (#257) widens this list; nothing here has to guess.
 */

export interface ClassEdit {
	/** the token as the rail spells it, with no variant prefix: `pt-4`, `-mt-2`, `flex-col` */
	token: string;
	/** the variant chain it sits under, spelled as it is written: `""`, `"hover:"`, `"md:"` */
	scope: string;
	/** take what this token's family sets under that scope away, rather than setting it */
	remove?: boolean;
}

/**
 * The names this project's theme gives each family of named tokens (#257).
 *
 * Without it the lane has to fall back to Tailwind's own defaults, and a
 * project whose type scale is its own would have `text-md` read as a colour —
 * writing a size would then take the element's colour away. The names come
 * from the compiled theme, which is the only thing that knows them.
 */
export interface ClassTheme {
	colour: ReadonlySet<string>;
	text: ReadonlySet<string>;
	weight: ReadonlySet<string>;
	font: ReadonlySet<string>;
	leading: ReadonlySet<string>;
	tracking: ReadonlySet<string>;
	shadow: ReadonlySet<string>;
	ease: ReadonlySet<string>;
	radius: ReadonlySet<string>;
}

export interface Anatomy {
	variants: readonly string[];
	negative: boolean;
	base: string;
	important: boolean;
}

/** `md:hover:-mt-2!` is four things: where it applies, its sign, itself, its weight. */
export function anatomyOf(token: string): Anatomy {
	let rest = token;
	const important = rest.endsWith("!");
	if (important) rest = rest.slice(0, -1);
	const variants: string[] = [];
	let depth = 0;
	let current = "";
	for (const char of rest) {
		if (char === "[" || char === "(") depth += 1;
		if (char === "]" || char === ")") depth -= 1;
		if (char === ":" && depth === 0) {
			variants.push(current);
			current = "";
		} else current += char;
	}
	const negative = current.startsWith("-");
	return { variants, negative, base: negative ? current.slice(1) : current, important };
}

export function composeToken(anatomy: Anatomy): string {
	const prefix = anatomy.variants.map((variant) => `${variant}:`).join("");
	return `${prefix}${anatomy.negative ? "-" : ""}${anatomy.base}${anatomy.important ? "!" : ""}`;
}

export function splitClass(className: string | null): string[] {
	return className === null ? [] : className.split(/\s+/).filter((token) => token !== "");
}

/** `"md:hover:"` as the chain it means; `""` is the base. Undefined when it is not a scope. */
export function parseScope(scope: string): string[] | undefined {
	if (scope === "") return [];
	if (!/^([a-z0-9][a-z0-9-]*:)+$/.test(scope)) return undefined;
	return scope.slice(0, -1).split(":");
}

/** Variants that apply on their own — a base token cannot honestly beat one. */
const SCREENS = new Set(["sm", "md", "lg", "xl", "2xl", "app"]);

/**
 * The screen-variant token this edit would sit under and never beat, if there
 * is one. A base `w-56` under a live `md:w-96` is a class the frame would not
 * show, so the lane refuses rather than writing a lie into the file (#262).
 */
export function screenConflict(className: string | null, edit: ClassEdit, theme?: ClassTheme): string | undefined {
	// taking a base token away beats nothing: what the breakpoint says still
	// stands afterwards, which is the whole reason the write refuses
	if (edit.remove === true || parseScope(edit.scope)?.length !== 0) return undefined;
	const family = familyOf(anatomyOf(edit.token).base, theme);
	if (family === undefined) return undefined;
	return splitClass(className).find((token) => {
		const anatomy = anatomyOf(token);
		if (!anatomy.variants.some((variant) => SCREENS.has(variant))) return false;
		return covers(familyOf(anatomy.base, theme), family);
	});
}

/**
 * Whether a token of one family sets what a token of another does.
 *
 * Usually the same family and nothing else. `size-8` is the exception: it is
 * two axes in one token, so a `md:size-8` beats a base width and a base height
 * alike, and a base `size-8` is beaten by either — which the fold already
 * knows, since writing one axis splits it.
 */
function covers(held: string | undefined, writing: string): boolean {
	if (held === undefined) return false;
	if (held === writing) return true;
	const axes = new Set(["w", "h", "size"]);
	return axes.has(held) && axes.has(writing) && (held === "size" || writing === "size");
}

/** The literal this edit leaves behind. */
export function writeClass(className: string | null, edit: ClassEdit, theme?: ClassTheme): string {
	const scope = parseScope(edit.scope) ?? [];
	return respace(
		className,
		withScope(className, scope, (scoped) => applyToken(scoped, edit, scope.length === 0, theme)),
	);
}

/**
 * The new literal wearing the old one's spacing.
 *
 * Tokens are read and written as a list, and a list joined by single spaces
 * would flatten a literal its author spread over three lines. A token that
 * survived keeps the whitespace that stood in front of it; only what is new
 * arrives with a space.
 */
function respace(was: string | null, now: string): string {
	const spacing = new Map<string, string>();
	for (const [, gap, token] of (was ?? "").matchAll(/(\s*)(\S+)/g)) {
		if (token !== undefined) spacing.set(token, gap ?? "");
	}
	return splitClass(now)
		.map((token, index) => (index === 0 ? token : `${spacing.get(token) ?? " "}${token}`))
		.join("");
}

/** The tokens under one scope, as a className the rest of this module can read. */
function inScope(className: string | null, scope: readonly string[]): string {
	return splitClass(className)
		.map(anatomyOf)
		.filter((anatomy) => sameScope(anatomy.variants, scope))
		.map((anatomy) => composeToken({ ...anatomy, variants: [] }))
		.join(" ");
}

function sameScope(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((variant, index) => variant === b[index]);
}

/**
 * Run a write against one scope's tokens and lay the answer back into the
 * literal: what stayed keeps its place and its prefix, what went is gone, and
 * what is new goes at the end. Every other scope is left byte for byte.
 */
function withScope(className: string | null, scope: readonly string[], change: (scoped: string) => string): string {
	const pending = splitClass(change(inScope(className, scope)));
	const out: string[] = [];
	for (const token of splitClass(className)) {
		const anatomy = anatomyOf(token);
		if (!sameScope(anatomy.variants, scope)) {
			out.push(token);
			continue;
		}
		const at = pending.indexOf(composeToken({ ...anatomy, variants: [] }));
		if (at === -1) continue;
		pending.splice(at, 1);
		out.push(token);
	}
	for (const bare of pending) out.push(composeToken({ ...anatomyOf(bare), variants: scope }));
	return out.join(" ");
}

function applyToken(scoped: string, edit: ClassEdit, base: boolean, theme?: ClassTheme): string {
	const anatomy = anatomyOf(edit.token);
	const value = anatomy.negative ? `-${tailOf(anatomy.base)}` : tailOf(anatomy.base);
	const fold = foldOf(anatomy.base, theme);
	if (fold !== undefined) {
		const group = FOLDS[fold.group];
		const sides = { ...group.read(scoped, theme) };
		// a default at the base is the absence of the token, which is what the
		// frame's author would have written; under a scope it is a real override
		const written = edit.remove === true || (base && value === group.zero) ? null : (fold.value ?? group.bare);
		for (const key of fold.keys) sides[key] = written;
		return writeFold(group, scoped, sides, weighs(scoped, group, anatomy.important, theme), theme);
	}
	const family = familyOf(anatomy.base, theme);
	if (edit.remove === true) {
		return splitClass(scoped)
			.filter((token) => {
				const held = anatomyOf(token);
				return family === undefined ? held.base !== anatomy.base : familyOf(held.base, theme) !== family;
			})
			.join(" ");
	}
	const kept = splitClass(scoped).filter((token) => {
		const held = anatomyOf(token);
		if (held.base === anatomy.base) return false;
		// `size-8` is two axes in one token: writing either half splits it first
		if ((family === "w" || family === "h") && splitsSize(held.base)) return false;
		return family === undefined || familyOf(held.base, theme) !== family;
	});
	const split = family === "w" || family === "h" ? sizeSplit(scoped, family) : [];
	return [...kept, ...split, composeToken({ ...anatomy, variants: [] })].join(" ");
}

/**
 * Whether the tokens a fold is about to rewrite carry `!`. A group written
 * with weight keeps it, because dropping it would change which rule wins; a
 * group with mixed weight loses it, because there is one spelling to write and
 * the majority is a guess.
 */
function weighs(scoped: string, group: Fold, incoming: boolean, theme?: ClassTheme): boolean {
	const held = splitClass(scoped)
		.map(anatomyOf)
		.filter((anatomy) => group.owns(anatomy.base, theme));
	return incoming || (held.length > 0 && held.every((anatomy) => anatomy.important));
}

/** `size-8` under a width or height write: the other axis, kept as its own token. */
function sizeSplit(scoped: string, writing: "w" | "h"): string[] {
	const held = splitClass(scoped)
		.map(anatomyOf)
		.find((anatomy) => splitsSize(anatomy.base));
	if (held === undefined) return [];
	const other = writing === "w" ? "h" : "w";
	return [composeToken({ ...held, variants: [], base: `${other}-${tailOf(held.base)}` })];
}

function splitsSize(base: string): boolean {
	return base.startsWith("size-") && lengthOf(base)?.family === "size";
}

/** The value half of a token: `p-4` is `4`, `w-[347px]` is `[347px]`, `border` is bare. */
function tailOf(base: string): string {
	const dash = base.indexOf("-");
	return dash === -1 ? "" : base.slice(dash + 1);
}

/* ---------- the folds: sides, corners and edges that collapse ---------- */

type FoldGroup = "padding" | "margin" | "gap" | "radius" | "border" | "inset";

interface Fold {
	/** what the value is when nothing sets it, so the base can drop the token */
	zero: string;
	/** the value a token with no value of its own means: `border`, `rounded` */
	bare: string;
	/** whether a token is one of this fold's own, and so rewritten by it */
	owns(base: string, theme?: ClassTheme): boolean;
	read(scoped: string, theme?: ClassTheme): Record<string, string | null>;
	/** the keys this fold writes, and the pairs they may collapse into */
	shape: FoldShape;
	/** how one key's value is spelled, and how the logical spelling is spotted */
	spell(side: string, value: string | null): string | null;
	logical: { probe: RegExp; sides: Readonly<Record<string, string>> };
	/** a value this family says by leaving the token out — a zero-width edge */
	drops?: string;
}

/**
 * One fold's tokens, rewritten. Every fold is the same act: keep what is not
 * this family's, read whether the literal spells its sides logically, and
 * write the fewest tokens that say the values.
 */
function writeFold(
	fold: Fold,
	scoped: string,
	values: Record<string, string | null>,
	important: boolean,
	theme?: ClassTheme,
): string {
	const kept = splitClass(scoped).filter((token) => !fold.owns(anatomyOf(token).base, theme));
	const logical = splitClass(scoped).some((token) => fold.logical.probe.test(anatomyOf(token).base));
	const said =
		fold.drops === undefined
			? values
			: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === fold.drops ? null : value]));
	const spelled = foldSpelling(fold.shape, said, fold.spell, logical ? fold.logical.sides : {});
	return [...kept, ...weighed(spelled, important)].join(" ");
}

const SPACING_KEYS: Readonly<Record<string, readonly string[]>> = {
	"": ["t", "r", "b", "l"],
	x: ["r", "l"],
	y: ["t", "b"],
	t: ["t"],
	r: ["r"],
	b: ["b"],
	l: ["l"],
	s: ["l"],
	e: ["r"],
};

const RADIUS_KEYS: Readonly<Record<string, readonly string[]>> = {
	"": ["tl", "tr", "br", "bl"],
	t: ["tl", "tr"],
	r: ["tr", "br"],
	b: ["br", "bl"],
	l: ["tl", "bl"],
	s: ["tl", "bl"],
	e: ["tr", "br"],
	tl: ["tl"],
	tr: ["tr"],
	br: ["br"],
	bl: ["bl"],
	ss: ["tl"],
	se: ["tr"],
	ee: ["br"],
	es: ["bl"],
};

/** Which fold a token belongs to, which keys it sets, and to what. */
function foldOf(
	base: string,
	theme?: ClassTheme,
): { group: FoldGroup; keys: readonly string[]; value: string | null } | undefined {
	const spacing = /^(p|m)([xytrbl]|s|e)?-(.+)$/.exec(base);
	if (spacing !== null && lengthOf(base) !== null) {
		const keys = SPACING_KEYS[spacing[2] ?? ""];
		if (keys !== undefined) {
			return { group: spacing[1] === "p" ? "padding" : "margin", keys, value: spacing[3] ?? null };
		}
	}
	const gap = /^gap(?:-([xy]))?-(.+)$/.exec(base);
	if (gap !== null) return { group: "gap", keys: gap[1] === undefined ? ["x", "y"] : [gap[1]], value: gap[2] ?? null };
	if (isRadius(base, theme)) {
		const parts = radiusParts(base);
		const keys = RADIUS_KEYS[parts.side];
		if (keys !== undefined) return { group: "radius", keys, value: parts.value };
	}
	const border = borderParts(base);
	if (border !== undefined) {
		const keys = SPACING_KEYS[border.side];
		if (keys !== undefined) return { group: "border", keys, value: border.width };
	}
	const inset = insetParts(base);
	if (inset !== undefined && lengthOf(base) !== null) {
		const keys = SPACING_KEYS[inset.side];
		if (keys !== undefined) return { group: "inset", keys, value: inset.value };
	}
	return undefined;
}

/**
 * The fewest tokens for four values: one when they all agree, the whole plus
 * one exception when three do, two sides when a pair does, four otherwise. The
 * three-agree form leans on the compiled order, where the narrower utility wins
 * whatever order the literal lists them in.
 */
function foldSpelling(
	shape: FoldShape,
	values: Record<string, string | null>,
	spell: (side: string, value: string | null) => string | null,
	logical: Readonly<Record<string, string>>,
): string[] {
	const at = (key: string) => values[key] ?? null;
	const side = (key: string) => logical[key] ?? key;
	const out: (string | null)[] = [];
	const agree = (keys: readonly string[]) => keys.every((key) => at(key) === at(keys[0] ?? ""));
	// the whole-plus-exception form needs four to have three of them agree
	const odd = shape.keys.length === 4 ? oddOneOut(shape.keys, values) : null;
	const pairing = shape.pairings.find((candidate) => candidate.every((pair) => agree(pair.keys)));
	if (agree(shape.keys)) out.push(spell("", at(shape.keys[0] ?? "")));
	else if (odd !== null) out.push(spell("", odd.rest), spell(side(odd.key), odd.value ?? FLOOR));
	else if (pairing !== undefined) {
		for (const pair of pairing) out.push(spell(logical[pair.side] ?? pair.side, at(pair.keys[0] ?? "")));
	} else out.push(...shape.keys.map((key) => spell(side(key), at(key))));
	return out.filter((token): token is string => token !== null);
}

/** The fold's tokens, carrying `!` when the group they replace had it. */
function weighed(tokens: readonly (string | null)[], important: boolean): string[] {
	return tokens.filter((token): token is string => token !== null).map((token) => (important ? `${token}!` : token));
}

/** The order a fold writes its keys in, and the pairs it may collapse into. */
interface FoldShape {
	keys: readonly string[];
	pairings: readonly (readonly { side: string; keys: readonly string[] }[])[];
}

const SIDE_SHAPE: FoldShape = {
	keys: ["t", "r", "b", "l"],
	pairings: [
		[
			{ side: "y", keys: ["t", "b"] },
			{ side: "x", keys: ["r", "l"] },
		],
	],
};

/** Two axes and nothing to collapse: `gap-4`, or the two of them. */
const AXIS_SHAPE: FoldShape = { keys: ["x", "y"], pairings: [] };

const CORNER_SHAPE: FoldShape = {
	keys: ["tl", "tr", "br", "bl"],
	pairings: [
		[
			{ side: "t", keys: ["tl", "tr"] },
			{ side: "b", keys: ["br", "bl"] },
		],
		[
			{ side: "l", keys: ["tl", "bl"] },
			{ side: "r", keys: ["tr", "br"] },
		],
	],
};

/**
 * The exception in a three-agree set. `null` for the odd one out means the
 * edge is off while the rest are on, which the shorthand cannot say — so the
 * exception is written explicitly with the family's floor.
 */
const FLOOR = "0";

function oddOneOut(
	keys: readonly string[],
	values: Record<string, string | null>,
): { key: string; value: string | null; rest: string | null } | null {
	for (const key of keys) {
		const others = keys.filter((other) => other !== key).map((other) => values[other] ?? null);
		const rest = others[0] ?? null;
		if (others.every((value) => value === rest) && (values[key] ?? null) !== rest) {
			return { key, value: values[key] ?? null, rest };
		}
	}
	return null;
}

const LOGICAL_SIDES: Readonly<Record<string, string>> = { r: "e", l: "s" };
const LOGICAL_CORNERS: Readonly<Record<string, string>> = { tl: "ss", tr: "se", br: "ee", bl: "es" };

/**
 * `inset`, its two axes, the four sides and the logical `start`/`end`.
 *
 * Its families do not share a prefix the way padding's do — the sides are
 * `top`, `right`, `bottom`, `left` — so the spelling is a table rather than a
 * letter, and reading `inset-x-4` as the two sides it sets is what stops a
 * `left-0` from stacking beside it (#257).
 */
const INSET_SIDES: Readonly<Record<string, string>> = { t: "top", r: "right", b: "bottom", l: "left" };
const INSET_LOGICAL: Readonly<Record<string, string>> = { r: "end", l: "start" };
const INSET_FAMILIES: Readonly<Record<string, string>> = {
	inset: "",
	"inset-x": "x",
	"inset-y": "y",
	top: "t",
	right: "r",
	bottom: "b",
	left: "l",
	start: "l",
	end: "r",
};

/** Which family spells one key of the fold: `inset`, `inset-x`, `top`, `start`. */
function insetFamily(side: string): string {
	if (side === "") return "inset";
	if (side === "x" || side === "y") return `inset-${side}`;
	// a logical key arrives already swapped: `l` became `start`, `r` became `end`
	return INSET_SIDES[side] ?? side;
}

function insetParts(base: string): { side: string; value: string } | undefined {
	const length = lengthOf(base);
	if (length === null) return undefined;
	const side = INSET_FAMILIES[length.family];
	return side === undefined ? undefined : { side, value: length.value };
}

function insetFold(): Fold {
	return {
		zero: "0",
		bare: "0",
		owns: (base) => insetParts(base) !== undefined,
		read: (scoped) => {
			const all = lengthTokenOf(scoped, "inset");
			const x = lengthTokenOf(scoped, "inset-x") ?? all;
			const y = lengthTokenOf(scoped, "inset-y") ?? all;
			return {
				t: lengthTokenOf(scoped, "top") ?? y,
				r: lengthTokenOf(scoped, "right") ?? lengthTokenOf(scoped, "end") ?? x,
				b: lengthTokenOf(scoped, "bottom") ?? y,
				l: lengthTokenOf(scoped, "left") ?? lengthTokenOf(scoped, "start") ?? x,
			};
		},
		shape: SIDE_SHAPE,
		spell: (side, value) => signedToken(insetFamily(side), value),
		logical: { probe: /^(start|end)-/, sides: INSET_LOGICAL },
	};
}

const FOLDS: Readonly<Record<FoldGroup, Fold>> = {
	padding: spacingFold("p"),
	margin: spacingFold("m"),
	gap: {
		zero: "0",
		bare: "0",
		owns: (base) => /^gap(-[xy])?-/.test(base),
		read: (scoped) => {
			const both = lengthTokenOf(scoped, "gap");
			return { x: lengthTokenOf(scoped, "gap-x") ?? both, y: lengthTokenOf(scoped, "gap-y") ?? both };
		},
		shape: AXIS_SHAPE,
		spell: (side, value) => signedToken(side === "" ? "gap" : `gap-${side}`, value),
		logical: { probe: /^$/, sides: {} },
	},
	radius: {
		zero: "none",
		bare: "",
		owns: isRadius,
		read: (scoped, theme) => {
			const corners: Record<string, string | null> = { tl: null, tr: null, br: null, bl: null };
			for (const token of splitClass(scoped)) {
				const base = anatomyOf(token).base;
				if (!isRadius(base, theme)) continue;
				const parts = radiusParts(base);
				for (const corner of RADIUS_KEYS[parts.side] ?? []) corners[corner] = parts.value;
			}
			return corners;
		},
		shape: CORNER_SHAPE,
		spell: (side, value) =>
			value === null ? null : `rounded${side === "" ? "" : `-${side}`}${value === "" ? "" : `-${value}`}`,
		logical: { probe: /^rounded-(s|e|ss|se|ee|es)(-|$)/, sides: LOGICAL_CORNERS },
	},
	inset: insetFold(),
	border: {
		zero: "0",
		bare: "",
		owns: (base) => borderParts(base) !== undefined,
		read: (scoped) => {
			const edges: Record<string, string | null> = { t: null, r: null, b: null, l: null };
			for (const token of splitClass(scoped)) {
				const parts = borderParts(anatomyOf(token).base);
				if (parts === undefined) continue;
				for (const edge of SPACING_KEYS[parts.side] ?? []) edges[edge] = parts.width;
			}
			return edges;
		},
		shape: SIDE_SHAPE,
		spell: (side, value) =>
			value === null ? null : `border${side === "" ? "" : `-${side}`}${value === "" ? "" : `-${value}`}`,
		logical: { probe: /^border-[se](-|$)/, sides: LOGICAL_SIDES },
		// a zero-width edge is the absence of the token, never `border-t-0`
		drops: "0",
	},
};

function spacingFold(prefix: "p" | "m"): Fold {
	const family = (side: string) => (side === "" ? prefix : `${prefix}${side}`);
	const owned = new RegExp(`^${prefix}([xytrbl]|s|e)?-`);
	return {
		zero: "0",
		bare: "0",
		owns: (base) => owned.test(base) && lengthOf(base) !== null,
		read: (scoped) => {
			const all = lengthTokenOf(scoped, family(""));
			const x = lengthTokenOf(scoped, family("x")) ?? all;
			const y = lengthTokenOf(scoped, family("y")) ?? all;
			return {
				t: lengthTokenOf(scoped, family("t")) ?? y,
				r: lengthTokenOf(scoped, family("r")) ?? lengthTokenOf(scoped, family("e")) ?? x,
				b: lengthTokenOf(scoped, family("b")) ?? y,
				l: lengthTokenOf(scoped, family("l")) ?? lengthTokenOf(scoped, family("s")) ?? x,
			};
		},
		shape: SIDE_SHAPE,
		spell: (side, value) => signedToken(family(side), value),
		logical: { probe: new RegExp(`^${prefix}[se]-`), sides: LOGICAL_SIDES },
	};
}

function signedToken(family: string, value: string | null): string | null {
	if (value === null) return null;
	const negative = value.startsWith("-");
	return `${negative ? "-" : ""}${family}-${negative ? value.slice(1) : value}`;
}

/** The signed value of the token on this family among already-scoped tokens. */
function lengthTokenOf(scoped: string, family: string): string | null {
	for (const token of splitClass(scoped)) {
		const anatomy = anatomyOf(token);
		const length = lengthOf(anatomy.base);
		if (length === null || length.family !== family) continue;
		return anatomy.negative ? `-${length.value}` : length.value;
	}
	return null;
}

function isRadius(base: string, theme?: ClassTheme): boolean {
	if (base === "rounded") return true;
	if (!base.startsWith("rounded-")) return false;
	const { side, value } = radiusParts(base);
	return RADIUS_KEYS[side] !== undefined && (value === "" || radiusValueOk(value, theme));
}

function radiusParts(base: string): { side: string; value: string } {
	const rest = base === "rounded" ? "" : base.slice("rounded-".length);
	if (rest === "") return { side: "", value: "" };
	const dash = rest.indexOf("-");
	const head = dash === -1 ? rest : rest.slice(0, dash);
	if (RADIUS_KEYS[head] !== undefined) return { side: head, value: dash === -1 ? "" : rest.slice(dash + 1) };
	return { side: "", value: rest };
}

const RADIUS_VALUES = new Set(["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "full"]);

/** The two radii that are keywords rather than theme values. */
const RADIUS_WORDS = new Set(["none", "full"]);

function radiusValueOk(value: string, theme?: ClassTheme): boolean {
	if (/^\[.+\]$/.test(value) || /^\(--.+\)$/.test(value)) return true;
	// `none` and `full` are the utility's own words rather than theme values, so
	// they are radii in every project; the rest is the theme's naming where there
	// is one and Tailwind's where there is not
	if (RADIUS_WORDS.has(value)) return true;
	return theme === undefined ? RADIUS_VALUES.has(value) : theme.radius.has(value);
}

function borderParts(base: string): { side: string; width: string } | undefined {
	const match = /^border(?:-([xytrbl]|s|e))?(?:-(\d+|px|\[.+\]))?$/.exec(base);
	if (match === null) return undefined;
	return { side: match[1] ?? "", width: match[2] ?? "" };
}

/* ---------- families: what one token replaces ---------- */

/** Every numeric family the lane knows, so a write swaps rather than stacks. */
const LENGTHS = new Set([
	"w",
	"h",
	"size",
	"min-w",
	"max-w",
	"min-h",
	"max-h",
	"basis",
	"grow",
	"shrink",
	"order",
	"z",
	"top",
	"right",
	"bottom",
	"left",
	"start",
	"end",
	"inset",
	"inset-x",
	"inset-y",
	"translate",
	"translate-x",
	"translate-y",
	"space-x",
	"space-y",
	"indent",
	"grid-cols",
	"grid-rows",
	"col-span",
	"row-span",
	"col-start",
	"row-start",
	"columns",
	"line-clamp",
	"opacity",
	"scale",
	"scale-x",
	"scale-y",
	"rotate",
	"rotate-x",
	"rotate-y",
	"skew",
	"skew-x",
	"skew-y",
	"brightness",
	"contrast",
	"saturate",
	"hue-rotate",
	"duration",
	"delay",
	"ring",
	"ring-offset",
	"outline",
	"outline-offset",
	"underline-offset",
	"decoration",
	"stroke",
	"p",
	"px",
	"py",
	"pt",
	"pr",
	"pb",
	"pl",
	"ps",
	"pe",
	"m",
	"mx",
	"my",
	"mt",
	"mr",
	"mb",
	"ml",
	"ms",
	"me",
	"gap",
	"gap-x",
	"gap-y",
]);

const LENGTH_FAMILIES = [...LENGTHS].sort((a, b) => b.length - a.length);

const LENGTH_WORDS = new Set([
	"px",
	"full",
	"auto",
	"screen",
	"min",
	"max",
	"fit",
	"dvh",
	"svh",
	"lvh",
	"dvw",
	"svw",
	"lvw",
	"none",
	"initial",
	// the container scale, which is what `max-w-lg` and `min-w-xs` are named off
	"3xs",
	"2xs",
	"xs",
	"sm",
	"md",
	"lg",
	"xl",
	"2xl",
	"3xl",
	"4xl",
	"5xl",
	"6xl",
	"7xl",
	"prose",
]);

/** Which numeric family a token belongs to, and its value; null when it is not one. */
function lengthOf(base: string): { family: string; value: string } | null {
	for (const family of LENGTH_FAMILIES) {
		if (!base.startsWith(`${family}-`)) continue;
		const value = base.slice(family.length + 1);
		if (value === "" || !lengthValueOk(value)) continue;
		return { family, value };
	}
	return null;
}

function lengthValueOk(value: string): boolean {
	if (/^\[.+\]$/.test(value) || /^\(--.+\)$/.test(value)) return true;
	if (/^\d+(?:\.\d+)?$/.test(value) || /^\d+\/\d+$/.test(value)) return true;
	return LENGTH_WORDS.has(value);
}

/** Word families: a set of tokens where writing one takes the others away. */
const WORDS: readonly (readonly string[])[] = [
	[
		"flex",
		"grid",
		"block",
		"inline",
		"inline-flex",
		"inline-block",
		"inline-grid",
		"hidden",
		"contents",
		"table",
		"flow-root",
	],
	["static", "fixed", "absolute", "relative", "sticky"],
	["flex-row", "flex-row-reverse", "flex-col", "flex-col-reverse"],
	["flex-wrap", "flex-wrap-reverse", "flex-nowrap"],
	["flex-1", "flex-auto", "flex-initial", "flex-none"],
	["items-start", "items-end", "items-center", "items-baseline", "items-stretch"],
	[
		"justify-start",
		"justify-end",
		"justify-center",
		"justify-between",
		"justify-around",
		"justify-evenly",
		"justify-normal",
		"justify-stretch",
	],
	["self-auto", "self-start", "self-end", "self-center", "self-stretch", "self-baseline"],
	[
		"content-normal",
		"content-center",
		"content-start",
		"content-end",
		"content-between",
		"content-around",
		"content-evenly",
		"content-baseline",
		"content-stretch",
	],
	["text-left", "text-center", "text-right", "text-justify", "text-start", "text-end"],
	[
		"whitespace-normal",
		"whitespace-nowrap",
		"whitespace-pre",
		"whitespace-pre-line",
		"whitespace-pre-wrap",
		"whitespace-break-spaces",
	],
	["overflow-auto", "overflow-hidden", "overflow-clip", "overflow-visible", "overflow-scroll"],
	["overflow-x-auto", "overflow-x-hidden", "overflow-x-clip", "overflow-x-visible", "overflow-x-scroll"],
	["overflow-y-auto", "overflow-y-hidden", "overflow-y-clip", "overflow-y-visible", "overflow-y-scroll"],
	["object-contain", "object-cover", "object-fill", "object-none", "object-scale-down"],
	["italic", "not-italic"],
	["underline", "overline", "line-through", "no-underline"],
	["uppercase", "lowercase", "capitalize", "normal-case"],
	["truncate", "text-ellipsis", "text-clip"],
];

const WORD_FAMILY = new Map(WORDS.flatMap((set, index) => set.map((token) => [token, `word:${index}`] as const)));

/**
 * Named-value families: the value is a name from the theme rather than a number.
 *
 * `values` is Tailwind's own naming, which is the honest fallback when no theme
 * has been read; `list` is where the project's names live, and it wins whenever
 * one is given. That is the whole of the difference between `text-md` as this
 * project's size and `text-md` as a colour nobody has.
 */
const NAMED: readonly { prefix: string; list?: keyof ClassTheme; values?: ReadonlySet<string>; key: string }[] = [
	{
		prefix: "text",
		list: "text",
		values: new Set(["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"]),
		key: "text:size",
	},
	{
		prefix: "font",
		list: "weight",
		values: new Set(["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"]),
		key: "font:weight",
	},
	{ prefix: "font", list: "font", key: "font:family" },
	{ prefix: "leading", list: "leading", key: "leading" },
	{ prefix: "tracking", list: "tracking", key: "tracking" },
	{ prefix: "shadow", list: "shadow", key: "shadow" },
	{ prefix: "bg", list: "colour", key: "bg:color" },
	{ prefix: "text", list: "colour", key: "text:color" },
	{ prefix: "border", list: "colour", key: "border:color" },
	{ prefix: "border-t", list: "colour", key: "border-t:color" },
	{ prefix: "border-r", list: "colour", key: "border-r:color" },
	{ prefix: "border-b", list: "colour", key: "border-b:color" },
	{ prefix: "border-l", list: "colour", key: "border-l:color" },
	{ prefix: "border-x", list: "colour", key: "border-x:color" },
	{ prefix: "border-y", list: "colour", key: "border-y:color" },
	{ prefix: "border-s", list: "colour", key: "border-s:color" },
	{ prefix: "border-e", list: "colour", key: "border-e:color" },
	{ prefix: "divide", list: "colour", key: "divide:color" },
	{ prefix: "placeholder", list: "colour", key: "placeholder:color" },
	{ prefix: "caret", list: "colour", key: "caret:color" },
	{ prefix: "accent", list: "colour", key: "accent:color" },
	{ prefix: "decoration", list: "colour", key: "decoration:color" },
	{ prefix: "shadow", list: "colour", key: "shadow:color" },
	{ prefix: "ring", list: "colour", key: "ring:color" },
	{ prefix: "outline", list: "colour", key: "outline:color" },
	{ prefix: "fill", list: "colour", key: "fill" },
	{ prefix: "stroke", list: "colour", key: "stroke:color" },
	{ prefix: "from", list: "colour", key: "from" },
	{ prefix: "via", list: "colour", key: "via" },
	{ prefix: "to", list: "colour", key: "to" },
	{ prefix: "cursor", key: "cursor" },
	{ prefix: "aspect", key: "aspect" },
	{ prefix: "ease", list: "ease", key: "ease" },
];

/**
 * Longest prefix first, so `border-t-thread` is the top edge's colour rather
 * than the whole border's, whether or not a theme is there to tell them apart.
 */
const NAMED_BY_PREFIX = [...NAMED].sort((a, b) => b.prefix.length - a.prefix.length);

/** The three colour words that are never theme values, and so are on every list. */
const COLOUR_WORDS = new Set(["transparent", "current", "inherit"]);

/**
 * Whether a name belongs to a family, read against the project's own theme.
 *
 * A theme's list is exact for what it names, and open in the two places
 * Tailwind is: a bracketed value is whatever was typed, and a bare number is
 * the scale — `leading-4` is a line height however this project spells its
 * named ones.
 */
function namesIt(
	family: { list?: keyof ClassTheme; values?: ReadonlySet<string> },
	name: string,
	theme?: ClassTheme,
): boolean {
	if (/^\[.+\]$/.test(name) || /^\(--.+\)$/.test(name)) return true;
	if (theme === undefined || family.list === undefined) {
		return family.values === undefined || family.values.has(name);
	}
	if (theme[family.list].has(name)) return true;
	if (family.list === "colour") return COLOUR_WORDS.has(name);
	return /^\d+(?:\.\d+)?$/.test(name);
}

/**
 * The axes an arbitrary property can pin (#259).
 *
 * `[width:240px]` is a width however it is spelled, so a `w-56` written beside
 * it would leave two rules in the same layer with the older spelling winning.
 * It belongs to the family it sets, and a write displaces it like any other
 * token of that family. Only the two axes a drag reaches are here; anything
 * wider is the property model's to widen.
 */
const ARBITRARY_AXIS: Readonly<Record<string, string>> = { width: "w", height: "h" };

function arbitraryAxis(base: string): string | undefined {
	const property = /^\[([a-z-]+):[^\]]+\]$/.exec(base)?.[1];
	return property === undefined ? undefined : ARBITRARY_AXIS[property];
}

export function familyOf(base: string, theme?: ClassTheme): string | undefined {
	const word = WORD_FAMILY.get(base);
	if (word !== undefined) return word;
	const pinned = arbitraryAxis(base);
	if (pinned !== undefined) return pinned;
	const length = lengthOf(base);
	if (length !== null) return length.family;
	if (isRadius(base, theme)) return "radius";
	if (borderParts(base) !== undefined) return "border:width";
	for (const family of NAMED_BY_PREFIX) {
		if (!base.startsWith(`${family.prefix}-`)) continue;
		const value = base.slice(family.prefix.length + 1);
		const name = value.split("/")[0] ?? value;
		if (!namesIt(family, name, theme)) continue;
		return family.key;
	}
	return undefined;
}
