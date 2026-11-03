/**
 * Knobs (#220, ADR-0012): the vocabulary the frame runtime, the canvas and the
 * daemon share. A frame declares values with `ui.knobs({...})`; the compile
 * stamps the call; the runtime posts what it declared to the canvas; the rail
 * posts live values back while a hand drags, and writes the literal through
 * the write lane on release. The file stays the one record.
 */

import type { KnobSchema, KnobSpec } from "./spool-public";

export type { KnobChoice, KnobOption, KnobSchema, KnobSpec, SpringValue } from "./spool-public";

export type KnobType = KnobSpec["type"];

export const KNOB_TYPES: readonly KnobType[] = [
	"slider",
	"range",
	"stepper",
	"angle",
	"xy",
	"duration",
	"easing",
	"spring",
	"color",
	"gradient",
	"toggle",
	"segmented",
	"select",
	"pictures",
	"icon",
	"image",
	"text",
	"longtext",
	"font",
	"weight",
	"spacing",
	"corners",
	"shadow",
	"action",
];

/** A knob's value as JSON: what is posted live and what the write lane writes as a literal. */
export type KnobValue = number | string | boolean | readonly number[] | { readonly [key: string]: number | string };

/** A knob's address inside its call: its keys joined by dots, `card.radius`. */
export type KnobPath = string;

/** What the compile injects as the call's second argument: never written by hand. */
export interface KnobSite {
	/** the call's stamp, `frames/cart/frame.tsx:4:11`, or a shared file's */
	at: string;
	/** paths whose `value` is not a literal in the file: shown read-only, never written */
	computed: KnobPath[];
	/** every call's stamp in the file as compiled, this one's included: a re-run file's other stamps are gone */
	inFile: string[];
}

/** One `ui.knobs` call as a frame ran it: its site and its schema with the values it holds. */
export interface KnobCall extends Omit<KnobSite, "inFile"> {
	schema: KnobSchema;
}

/** frame → canvas: every call the document has run, whole, each time the set changes. */
export interface KnobsDeclared {
	spool: "knobs";
	frame: string;
	calls: KnobCall[];
}

/** canvas → frame: live values for one call, by path; a path left out reads its literal again. */
export interface KnobValues {
	spool: "knob-values";
	at: string;
	values: Record<KnobPath, KnobValue>;
}

/** canvas → frame: an action knob pressed. */
export interface KnobAction {
	spool: "knob-action";
	at: string;
	path: KnobPath;
}

export function isKnobSpec(node: unknown): node is KnobSpec {
	return isRecord(node) && typeof node.type === "string" && (KNOB_TYPES as readonly string[]).includes(node.type);
}

/** Every knob in a schema, depth first in code order, with its path. */
export function eachKnob(schema: KnobSchema, visit: (path: KnobPath, spec: KnobSpec) => void, prefix = ""): void {
	for (const [key, node] of Object.entries(schema)) {
		const path = prefix === "" ? key : `${prefix}.${key}`;
		if (isKnobSpec(node)) visit(path, node);
		else if (isRecord(node)) eachKnob(node as KnobSchema, visit, path);
	}
}

export function parseKnobsDeclared(value: unknown): KnobsDeclared | undefined {
	if (!isRecord(value) || value.spool !== "knobs" || typeof value.frame !== "string") return undefined;
	if (!Array.isArray(value.calls) || !value.calls.every(isKnobCall)) return undefined;
	return value as unknown as KnobsDeclared;
}

export function parseKnobValues(value: unknown): KnobValues | undefined {
	if (!isRecord(value) || value.spool !== "knob-values" || typeof value.at !== "string") return undefined;
	if (!isRecord(value.values) || !Object.values(value.values).every(isKnobValue)) return undefined;
	return value as unknown as KnobValues;
}

export function parseKnobAction(value: unknown): KnobAction | undefined {
	if (!isRecord(value) || value.spool !== "knob-action") return undefined;
	return typeof value.at === "string" && typeof value.path === "string" ? (value as unknown as KnobAction) : undefined;
}

export function isKnobValue(value: unknown): value is KnobValue {
	if (typeof value === "number") return Number.isFinite(value);
	if (typeof value === "string" || typeof value === "boolean") return true;
	if (Array.isArray(value)) return value.every((item) => typeof item === "number" && Number.isFinite(item));
	return isRecord(value) && Object.values(value).every((item) => typeof item === "number" || typeof item === "string");
}

function isKnobCall(value: unknown): value is KnobCall {
	return (
		isRecord(value) &&
		typeof value.at === "string" &&
		Array.isArray(value.computed) &&
		value.computed.every((path) => typeof path === "string") &&
		isRecord(value.schema)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
