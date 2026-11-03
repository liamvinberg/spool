import {
	isKnobSpec,
	type KnobCall,
	type KnobChoice,
	type KnobPath,
	type KnobSchema,
	type KnobSpec,
	type KnobType,
	type KnobValue,
} from "../../runtime/knob-protocol";
import type { NumberRules } from "../primitives/inputs";
import { frameFolderRel } from "./pages";

/**
 * The knobs as the rail reads them (#220): the rows a frame's calls draw, how
 * each one is reached, what it says at rest and in the status line, and which
 * live values still stand once a document reports its literals.
 */

/** One row of the Knobs section: a group head, or a knob. */
export type KnobLine =
	| { kind: "group"; id: string; key: string; depth: number; count: number; shared: boolean; open: boolean }
	| {
			kind: "knob";
			id: string;
			at: string;
			path: KnobPath;
			key: string;
			depth: number;
			spec: KnobSpec;
			/** its `value` is no literal: shown, never written */
			computed: boolean;
			/** the file it is declared in, when that is outside the frame's folder */
			shared: string | null;
	  };

export const knobId = (at: string, path: KnobPath): string => `${at}#${path}`;

/** The file a stamp names, relative to design/. */
const stampFile = (at: string): string => at.replace(/:\d+:\d+$/, "");

/** A call declared in a file outside the frame's own folder is one value for every frame that renders it. */
export function sharedFile(frame: string, at: string): string | null {
	const file = stampFile(at);
	return file.startsWith(frameFolderRel(frame)) ? null : file;
}

/** The file a call is written in, as a person reads it: `frame.tsx`, or a shared file by its path. */
export function fileOf(frame: string, at: string): string {
	return sharedFile(frame, at) ?? stampFile(at).split("/").at(-1) ?? at;
}

/** Where a write lands: the file and the call's line, `frame.tsx:4`. */
export function placeOf(frame: string, at: string): string {
	return `${fileOf(frame, at)}:${/:(\d+):\d+$/.exec(at)?.[1] ?? "?"}`;
}

/**
 * Every row the section draws, in code order: each call's knobs, a head over
 * each nested object, and nothing under a folded one.
 */
export function knobLines(frame: string, calls: readonly KnobCall[], folded: ReadonlySet<string>): KnobLine[] {
	const lines: KnobLine[] = [];
	// the frame's own calls first, the shared ones it renders after
	const own = (call: KnobCall) => sharedFile(frame, call.at) === null;
	for (const call of [...calls.filter(own), ...calls.filter((call) => !own(call))]) {
		const shared = sharedFile(frame, call.at);
		const walk = (schema: KnobSchema, prefix: string, depth: number) => {
			for (const [key, node] of Object.entries(schema)) {
				const path = prefix === "" ? key : `${prefix}.${key}`;
				const id = knobId(call.at, path);
				if (isKnobSpec(node)) {
					lines.push({
						kind: "knob",
						id,
						at: call.at,
						path,
						key,
						depth,
						spec: node,
						computed: computedAt(call.computed, path),
						shared,
					});
					continue;
				}
				const open = !folded.has(id);
				lines.push({ kind: "group", id, key, depth, count: countKnobs(node), shared: shared !== null, open });
				if (open) walk(node, path, depth + 1);
			}
		};
		walk(call.schema, "", 0);
	}
	return lines;
}

/** A value worked out in code, the knob's own or a group's over it, is no literal to write. */
const computedAt = (computed: readonly KnobPath[], path: KnobPath): boolean =>
	computed.some((one) => path === one || path.startsWith(`${one}.`));

function countKnobs(schema: KnobSchema): number {
	return Object.values(schema).reduce((n, node) => n + (isKnobSpec(node) ? 1 : countKnobs(node)), 0);
}

/** The heads a knob sits under, outermost first: what an undo unfolds to show it. */
export function headsOver(at: string, path: KnobPath): string[] {
	const keys = path.split(".");
	return keys.slice(0, -1).map((_, index) => knobId(at, keys.slice(0, index + 1).join(".")));
}

/**
 * How a knob is reached from its row: `opens` in place into its editor, a
 * `popover` beside the row for a list too long for the rail, or `row`, acting
 * where it stands and never opening.
 */
export type KnobReach = "opens" | "popover" | "row";

export function reachOf(type: KnobType): KnobReach {
	switch (type) {
		case "toggle":
		case "stepper":
		case "segmented":
		case "text":
		case "action":
			return "row";
		case "font":
		case "icon":
		case "select":
			return "popover";
		default:
			return "opens";
	}
}

/** A knob's value now: what the rail last posted, else its literal. An action has none. */
export function valueNow(spec: KnobSpec, live: KnobValue | undefined): KnobValue | undefined {
	return live ?? ("value" in spec ? (spec.value as KnobValue) : undefined);
}

export const optionValue = (choice: KnobChoice): string => (typeof choice === "string" ? choice : choice.value);

/** The weights a weight knob offers when its call names none. */
const WEIGHTS: readonly number[] = [400, 500, 600, 700];

/** The families a font knob offers when neither its call nor the document's loaded fonts name any. */
const FONTS: readonly string[] = ["system-ui", "ui-serif", "ui-monospace", "Georgia", "Helvetica"];

/** What a weight knob offers. */
export const weightsOf = (spec: Extract<KnobSpec, { type: "weight" }>): readonly number[] =>
	spec.options !== undefined && spec.options.length > 0 ? spec.options : WEIGHTS;

/** What a font knob offers, its own value always among them. */
export function fontsOf(spec: Extract<KnobSpec, { type: "font" }>, value: string): readonly string[] {
	const named = spec.options !== undefined && spec.options.length > 0 ? spec.options : FONTS;
	return named.includes(value) ? named : [value, ...named];
}

/**
 * A knob's value as one number to scrub and step, in the unit its row shows
 * it in, and the way back to the knob's own value: a duration is tuned in ms
 * and written in seconds. Nothing for a knob that is not one number.
 */
export function knobNumber(
	spec: KnobSpec,
	value: KnobValue | undefined,
): { n: number; rules: NumberRules; back: (n: number) => KnobValue } | undefined {
	if (typeof value !== "number") return undefined;
	const same = (n: number) => n;
	switch (spec.type) {
		case "slider":
		case "stepper":
			return { n: value, rules: { min: spec.min, max: spec.max, step: spec.step, unit: spec.unit }, back: same };
		case "angle":
			return { n: value, rules: { min: 0, max: 360, step: 1, unit: "°", wrap: true }, back: same };
		case "duration": {
			const ms = (seconds: number | undefined) => (seconds === undefined ? undefined : Math.round(seconds * 1000));
			return {
				n: Math.round(value * 1000),
				rules: { min: ms(spec.min) ?? 0, max: ms(spec.max), step: 10, unit: "ms", units: { s: 1000 } },
				back: (n) => n / 1000,
			};
		}
		case "spacing":
		case "corners":
			return { n: value, rules: { min: spec.min ?? 0, max: spec.max, step: 1, unit: "px" }, back: same };
		default:
			return undefined;
	}
}

/**
 * A knob that is a choice moved by whole options, signed: ←/→ on its row. A
 * toggle turns on to the right. Nothing for a knob that is no choice.
 */
export function nudged(spec: KnobSpec, value: KnobValue | undefined, units: number): KnobValue | undefined {
	if (units === 0 || value === undefined) return undefined;
	switch (spec.type) {
		case "toggle":
			return units > 0;
		case "weight":
			return stepChoice(weightsOf(spec).map(String), String(value), units, Number);
		case "segmented":
		case "select":
		case "pictures":
		case "icon":
		case "image":
			return stepChoice(spec.options.map(optionValue), String(value), units, String);
		case "font":
			return stepChoice(fontsOf(spec, String(value)), String(value), units, String);
		default:
			return undefined;
	}
}

function stepChoice<T extends KnobValue>(
	options: readonly string[],
	value: string,
	units: number,
	as: (option: string) => T,
): T | undefined {
	const at = options.indexOf(value);
	const next = options[Math.min(options.length - 1, Math.max(0, (at === -1 ? 0 : at) + units))];
	return next === undefined ? undefined : as(next);
}

/** A value in the words the literal is written in: `20 22`, `0.35 0.3`, `true`. */
export function knobWords(value: KnobValue | undefined): string {
	if (value === undefined) return "";
	if (Array.isArray(value)) return value.join(" ");
	if (typeof value === "object") return Object.values(value).join(" ");
	return String(value);
}

export const sameValue = (a: KnobValue | undefined, b: KnobValue | undefined): boolean =>
	JSON.stringify(a) === JSON.stringify(b);

/**
 * The section's foot: while a hand is on a knob, what letting go will write
 * and Escape's way out; once written, undone or redone, the file and line.
 */
export interface KnobStatus {
	kind: "live" | "written" | "undone" | "redone";
	/** `frame.tsx:4`, `shared/knobs/kaffe.ts:4` */
	place: string;
	key: string;
	from: string;
	to: string;
	/** the frames a shared write reached */
	frames: number;
}

export function knobStatus(
	kind: KnobStatus["kind"],
	frame: string,
	at: string,
	path: KnobPath,
	from: KnobValue | undefined,
	to: KnobValue | undefined,
	frames = 1,
): KnobStatus {
	return {
		kind,
		place: placeOf(frame, at),
		key: path.split(".").at(-1) ?? path,
		from: knobWords(from),
		to: knobWords(to),
		frames,
	};
}

/** The status as one line of words and what stands at its far end. */
export function statusWords(status: KnobStatus): { says: string; aside: string } {
	const change = `${status.place} ${status.key} ${status.from} → ${status.to}`;
	if (status.kind === "live") return { says: change, aside: "esc puts back" };
	const lead = status.kind === "written" ? "" : `${status.kind} `;
	return { says: `${lead}${change}`, aside: status.frames > 1 ? `${status.frames} frames` : "" };
}

/** The spec at a path of a frame's calls, when its document still declares it. */
export function specAt(calls: readonly KnobCall[], at: string, path: KnobPath): KnobSpec | undefined {
	const call = calls.find((one) => one.at === at);
	let node: KnobSchema | KnobSpec | undefined = call?.schema;
	for (const key of path.split(".")) {
		if (node === undefined || isKnobSpec(node)) return undefined;
		node = node[key];
	}
	return node !== undefined && isKnobSpec(node) ? node : undefined;
}

/**
 * The live values a document's own literals have caught up with, dropped:
 * what is left is what the rail still has to tell it. A call it no longer
 * runs has nothing to be told.
 */
export function stillLive(
	calls: readonly KnobCall[],
	live: ReadonlyMap<string, Readonly<Record<KnobPath, KnobValue>>>,
): Map<string, Record<KnobPath, KnobValue>> {
	const left = new Map<string, Record<KnobPath, KnobValue>>();
	for (const [at, values] of live) {
		const kept = Object.entries(values).filter(([path, value]) => {
			const spec = specAt(calls, at, path);
			return spec !== undefined && !sameValue(valueNow(spec, undefined), value);
		});
		if (kept.length > 0) left.set(at, Object.fromEntries(kept));
	}
	return left;
}

/** The frames whose documents declared a call: where its values are posted, and who a shared write reaches. */
export function readersOf(declared: ReadonlyMap<string, readonly KnobCall[]>, at: string): string[] {
	return [...declared].filter(([, calls]) => calls.some((call) => call.at === at)).map(([frame]) => frame);
}

/**
 * The name Save as variant copies a frame to: `<name>--b`, or the next letter
 * free. A variant of a variant is its base's next one.
 */
export function variantName(frame: string, taken: ReadonlySet<string>): string {
	const base = frame.replace(/--[b-z]$/, "");
	for (let code = "b".charCodeAt(0); code <= "z".charCodeAt(0); code += 1) {
		const name = `${base}--${String.fromCharCode(code)}`;
		if (!taken.has(name)) return name;
	}
	return `${base}--${taken.size}`;
}
