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
	for (const call of calls) {
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
						computed: call.computed.includes(path),
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

/** The number a step moves, decimals kept to the step's own. */
function stepOf(spec: KnobSpec): number {
	if (spec.type === "duration") return 0.01;
	if (spec.type === "weight") return 100;
	if ("step" in spec && typeof spec.step === "number") return spec.step;
	return 1;
}

const decimals = (step: number): number => (String(step).split(".")[1] ?? "").length;

/**
 * A knob moved by whole steps, signed: ←/→ on its row and a scrub across it.
 * Numbers step and clamp (an angle wraps), every side of a box together; a
 * toggle turns on to the right; a choice moves to the next option. Nothing
 * for a knob a step means nothing to.
 */
export function nudged(spec: KnobSpec, value: KnobValue | undefined, units: number): KnobValue | undefined {
	if (units === 0 || value === undefined) return undefined;
	const step = stepOf(spec);
	const min = "min" in spec && typeof spec.min === "number" ? spec.min : -Infinity;
	const max = "max" in spec && typeof spec.max === "number" ? spec.max : Infinity;
	const move = (n: number) => {
		const next = Number((n + units * step).toFixed(decimals(step)));
		return Math.min(max, Math.max(min, next));
	};
	switch (spec.type) {
		case "slider":
		case "stepper":
		case "duration":
			return typeof value === "number" ? move(value) : undefined;
		case "weight": {
			if (typeof value !== "number") return undefined;
			if (spec.options === undefined) return Math.min(900, Math.max(100, move(value)));
			return stepChoice(spec.options.map(String), String(value), units, Number);
		}
		case "angle":
			return typeof value === "number" ? (((value + units * step) % 360) + 360) % 360 : undefined;
		case "spacing":
		case "corners":
			if (typeof value === "number") return move(value);
			return Array.isArray(value) ? value.map(move) : undefined;
		case "toggle":
			return units > 0;
		case "segmented":
		case "select":
		case "pictures":
		case "icon":
		case "image":
			return typeof value === "string" ? stepChoice(spec.options.map(optionValue), value, units, String) : undefined;
		case "font":
			return typeof value === "string" && spec.options !== undefined
				? stepChoice(spec.options, value, units, String)
				: undefined;
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

/** What a step or a scrub moves along: the knobs that are one number, or one per side, at heart. */
export function scrubs(spec: KnobSpec): boolean {
	return ["slider", "angle", "duration", "spacing", "corners"].includes(spec.type);
}

/** A value in the words the literal is written in: `20 22`, `0.35 0.3`, `true`. */
export function knobWords(value: KnobValue | undefined): string {
	if (value === undefined) return "";
	if (Array.isArray(value)) return value.join(" ");
	if (typeof value === "object") return Object.values(value).join(" ");
	return String(value);
}

/** What the number measures, after it in the row. */
export function unitOf(spec: KnobSpec): string | undefined {
	switch (spec.type) {
		case "slider":
		case "stepper":
		case "range":
		case "xy":
			return spec.unit;
		case "angle":
			return "°";
		case "duration":
			return "s";
		case "spacing":
		case "corners":
			return "px";
		default:
			return undefined;
	}
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
