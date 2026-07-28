#!/usr/bin/env node

import { deepStrictEqual } from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type Arm = "picture" | "readable";
type EventRole = "flow" | "function-call" | "marker" | "metadata" | "x";

interface ExtractOptions {
	mode: "extract";
	runsPath: string;
	traceDir: string;
	slicePath: string;
	summaryPath: string;
	pairCount: number;
	verifyReported: boolean;
}

interface ReplayOptions {
	mode: "replay";
	replaySlicePath: string;
	summaryPath: string;
	verifyReported: boolean;
}

type CliOptions = ExtractOptions | ReplayOptions;

interface RafWorstWindow {
	fromOffsetMs: number;
	toOffsetMs: number;
	durationMs: number;
}

interface MainRun {
	arm: Arm;
	pair: number;
	attempt: number;
	order: string;
	position: number;
	browserVersion: string;
	cliSha256: string;
	distTreeSha256: string;
	rafWorstMs: number;
	rafWorstWindow: RafWorstWindow;
	traceName: string;
}

interface MainMetadata {
	cliSha256: string;
	distTreeSha256: string;
	driverSha256: string;
	fixedPoint: string;
	rareIntervalMs: number;
	subjectDesignTreeSha256: string;
	wheelScheduleSha256: string;
}

interface SelectedPair {
	pair: number;
	order: string;
	picture: MainRun;
	readable: MainRun;
}

interface TraceEvent {
	index: number;
	raw: Record<string, unknown>;
	name: string;
	category: string;
	phase: string;
	pid: number;
	tid: number;
	timestampUs: number;
	durationUs: number | null;
}

interface GapMarker {
	event: TraceEvent;
	fromMs: number;
	toMs: number;
	durationMs: number;
}

interface WorstRafEvidence {
	binding: "first-wheel-offset" | "gap-marker";
	pageFromOffsetMs: number;
	pageToOffsetMs: number;
	durationMs: number;
	traceFromUs: number;
	traceToUs: number;
	markerName: string | null;
}

interface ProcessRole {
	pid: number;
	roles: string[];
}

interface SliceMetadata {
	kind: "metadata";
	schemaVersion: 1;
	extractor: string;
	extractorSha256: string;
	runsFile: string;
	runsSha256: string;
	cliSha256: string;
	distTreeSha256: string;
	driverSha256: string;
	fixedPoint: string;
	rareIntervalMs: number;
	subjectDesignTreeSha256: string;
	wheelScheduleSha256: string;
	selectedReadableRareIntervals: number;
	selectedPairs: number[];
	limits: {
		xEventsPerTrace: number;
		flowEventsPerTrace: number;
		functionCallUrlsPerTrace: number;
	};
}

interface SliceSource {
	kind: "source";
	traceId: string;
	pair: number;
	order: string;
	arm: Arm;
	position: number;
	attempt: number;
	browserVersion: string;
	traceFile: string;
	archiveSha256: string;
	rawJsonSha256: string;
	rafWorstMs: number;
	worstRaf: WorstRafEvidence;
	gapMarkerCount: number;
	processRoles: ProcessRole[];
}

interface SliceEvent {
	kind: "event";
	traceId: string;
	roles: EventRole[];
	event: Record<string, JsonValue>;
}

type SliceRecord = SliceMetadata | SliceSource | SliceEvent;

const SCHEMA_VERSION = 1;
const MINIMUM_PAIRS = 3;
const DEFAULT_PAIRS = 4;
const MAX_X_EVENTS_PER_TRACE = 800;
const MAX_FLOW_EVENTS_PER_TRACE = 500;
const MAX_FUNCTION_URLS_PER_TRACE = 32;
const TOP_EVENT_TOTALS = 20;
const FIRST_WHEEL_MARKER = /^DEBUG132_FIRST_WHEEL\|(-?\d+(?:\.\d+)?)$/;
const GAP_MARKER =
	/^DEBUG132_RAF_GAP\|(-?\d+(?:\.\d+)?)\|(-?\d+(?:\.\d+)?)\|(-?\d+(?:\.\d+)?)$/;
const ATTRIBUTION_EVENT_NAMES = new Set([
	"CommandBufferProxyImpl::WaitForGetOffset",
	"Display::DrawAndSwap",
	"RasterImplementation::Finish",
]);
const ROLE_ORDER: readonly EventRole[] = ["metadata", "marker", "x", "flow", "function-call"];
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const driverPath = join(scriptDir, "10-readable-frame-pan-cost.ts");

function usage(): string {
	return `Usage:
  node bench/evidence/readable-frame-pan-cost/10-readable-frame-pan-cost-trace.ts \\
    --trace-dir /path/to/raw-traces \\
    [--runs bench/evidence/readable-frame-pan-cost/10-readable-frame-pan-cost-trace-runs.ndjson] \\
    [--slice bench/evidence/readable-frame-pan-cost/10-readable-frame-pan-cost-trace.ndjson] \\
    [--summary bench/evidence/readable-frame-pan-cost/10-readable-frame-pan-cost-trace.json] \\
    [--pairs 4] [--verify-reported]

  node bench/evidence/readable-frame-pan-cost/10-readable-frame-pan-cost-trace.ts \\
    --replay-slice bench/evidence/readable-frame-pan-cost/10-readable-frame-pan-cost-trace.ndjson \\
    [--summary bench/evidence/readable-frame-pan-cost/10-readable-frame-pan-cost-trace.json] \\
    [--verify-reported]

Environment equivalents:
  DEBUG132_TRACE_DIR, DEBUG132_RUNS, DEBUG132_TRACE_SLICE,
  DEBUG132_TRACE_SUMMARY, DEBUG132_TRACE_PAIRS, DEBUG132_REPLAY_SLICE,
  DEBUG132_VERIFY_REPORTED=1
`;
}

function flagValue(args: readonly string[], index: number): string {
	const value = args[index + 1];
	if (value === undefined || value.startsWith("--")) throw new Error(`${args[index]} needs a value`);
	return value;
}

function parseOptions(args: readonly string[]): CliOptions | null {
	const values = new Map<string, string>();
	let verifyReported = process.env.DEBUG132_VERIFY_REPORTED === "1";
	for (let index = 0; index < args.length; index++) {
		const flag = args[index];
		if (flag === "--help" || flag === "-h") return null;
		if (flag === "--verify-reported") {
			verifyReported = true;
			continue;
		}
		if (
			!["--pairs", "--replay-slice", "--runs", "--slice", "--summary", "--trace-dir"].includes(
				flag ?? "",
			)
		) {
			throw new Error(`unknown argument ${flag ?? ""}\n\n${usage()}`);
		}
		const value = flagValue(args, index);
		values.set(flag ?? "", value);
		index++;
	}

	const summaryPath = resolve(
		values.get("--summary") ??
			process.env.DEBUG132_TRACE_SUMMARY ??
			join(scriptDir, "10-readable-frame-pan-cost-trace.json"),
	);
	const replaySlice = values.get("--replay-slice") ?? process.env.DEBUG132_REPLAY_SLICE;
	if (replaySlice !== undefined) {
		if (values.has("--pairs") || values.has("--runs") || values.has("--slice") || values.has("--trace-dir")) {
			throw new Error(`replay mode does not accept extraction flags\n\n${usage()}`);
		}
		return {
			mode: "replay",
			replaySlicePath: resolve(replaySlice),
			summaryPath,
			verifyReported,
		};
	}

	const traceDir = values.get("--trace-dir") ?? process.env.DEBUG132_TRACE_DIR;
	if (traceDir === undefined || traceDir.length === 0) {
		throw new Error(`--trace-dir or DEBUG132_TRACE_DIR is required\n\n${usage()}`);
	}
	const pairCount = Number(values.get("--pairs") ?? process.env.DEBUG132_TRACE_PAIRS ?? DEFAULT_PAIRS);
	if (!Number.isInteger(pairCount) || pairCount < MINIMUM_PAIRS || pairCount > DEFAULT_PAIRS) {
		throw new Error(`--pairs must be an integer from ${MINIMUM_PAIRS} to ${DEFAULT_PAIRS}`);
	}

	return {
		mode: "extract",
		runsPath: resolve(
			values.get("--runs") ??
				process.env.DEBUG132_RUNS ??
				join(scriptDir, "10-readable-frame-pan-cost-trace-runs.ndjson"),
		),
		traceDir: resolve(traceDir),
		slicePath: resolve(
			values.get("--slice") ??
				process.env.DEBUG132_TRACE_SLICE ??
				join(scriptDir, "10-readable-frame-pan-cost-trace.ndjson"),
		),
		summaryPath,
		pairCount,
		verifyReported,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`${label} must be an object`);
	return value;
}

function stringField(value: Record<string, unknown>, field: string, label: string): string {
	const result = value[field];
	if (typeof result !== "string") throw new Error(`${label}.${field} must be a string`);
	return result;
}

function numberField(value: Record<string, unknown>, field: string, label: string): number {
	const result = value[field];
	if (typeof result !== "number" || !Number.isFinite(result)) {
		throw new Error(`${label}.${field} must be a finite number`);
	}
	return result;
}

function booleanField(value: Record<string, unknown>, field: string, label: string): boolean {
	const result = value[field];
	if (typeof result !== "boolean") throw new Error(`${label}.${field} must be a boolean`);
	return result;
}

function optionalNumber(value: Record<string, unknown>, field: string): number | null {
	const result = value[field];
	return typeof result === "number" && Number.isFinite(result) ? result : null;
}

function nestedString(value: Record<string, unknown>, first: string, second: string): string | null {
	const parent = value[first];
	if (!isRecord(parent)) return null;
	const result = parent[second];
	return typeof result === "string" ? result : null;
}

function parseJson(text: string, label: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch (error) {
		throw new Error(`${label} is not valid JSON`, { cause: error });
	}
}

function sha256(value: Buffer | string): string {
	return createHash("sha256").update(value).digest("hex");
}

function readNdjson(path: string): unknown[] {
	return readFileSync(path, "utf8")
		.split(/\r?\n/)
		.filter((line) => line.length > 0)
		.map((line, index) => parseJson(line, `${basename(path)} line ${index + 1}`));
}

function parseMainMetadata(values: readonly unknown[]): MainMetadata {
	const candidates = values.filter((value) => isRecord(value) && value.kind === "metadata");
	if (candidates.length !== 1) throw new Error(`main NDJSON must contain exactly one metadata record`);
	const metadata = record(candidates[0], "metadata");
	if (metadata.comparison !== "main") throw new Error(`run metadata comparison must be main`);
	return {
		cliSha256: stringField(metadata, "cliSha256", "metadata"),
		distTreeSha256: stringField(metadata, "distTreeSha256", "metadata"),
		driverSha256: stringField(metadata, "driverSha256", "metadata"),
		fixedPoint: stringField(metadata, "fixedPoint", "metadata"),
		rareIntervalMs: numberField(metadata, "rareIntervalMs", "metadata"),
		subjectDesignTreeSha256: stringField(metadata, "subjectDesignTreeSha256", "metadata"),
		wheelScheduleSha256: stringField(metadata, "wheelScheduleSha256", "metadata"),
	};
}

function parseRafWindow(value: unknown, label: string): RafWorstWindow {
	const window = record(value, label);
	return {
		fromOffsetMs: numberField(window, "fromOffsetMs", label),
		toOffsetMs: numberField(window, "toOffsetMs", label),
		durationMs: numberField(window, "durationMs", label),
	};
}

function parseMainRun(value: unknown, index: number): MainRun | null {
	if (!isRecord(value) || value.kind !== "run" || value.phase !== "main") return null;
	const label = `run record ${index + 1}`;
	if (!booleanField(value, "accepted", label) || !booleanField(value, "pairAccepted", label)) return null;
	const armValue = stringField(value, "arm", label);
	if (armValue !== "picture" && armValue !== "readable") return null;
	const traceName = stringField(value, "traceName", label);
	if (basename(traceName) !== traceName) throw new Error(`${label}.traceName must be a basename`);
	return {
		arm: armValue,
		pair: numberField(value, "pair", label),
		attempt: numberField(value, "attempt", label),
		order: stringField(value, "order", label),
		position: numberField(value, "position", label),
		browserVersion: stringField(value, "browserVersion", label),
		cliSha256: stringField(value, "cliSha256", label),
		distTreeSha256: stringField(value, "distTreeSha256", label),
		rafWorstMs: numberField(value, "rafWorstMs", label),
		rafWorstWindow: parseRafWindow(value.rafWorstWindow, `${label}.rafWorstWindow`),
		traceName,
	};
}

function selectPairs(values: readonly unknown[], count: number, rareIntervalMs: number): SelectedPair[] {
	const runs = values
		.map((value, index) => parseMainRun(value, index))
		.filter((value): value is MainRun => value !== null);
	const readable = runs
		.filter((run) => run.arm === "readable" && run.rafWorstMs > rareIntervalMs)
		.sort((left, right) => left.pair - right.pair || left.attempt - right.attempt);
	if (readable.length < count) {
		throw new Error(`found ${readable.length} accepted readable rare intervals, need ${count}`);
	}

	return readable.slice(0, count).map((readableRun) => {
		const controls = runs.filter(
			(run) =>
				run.arm === "picture" &&
				run.pair === readableRun.pair &&
				run.attempt === readableRun.attempt &&
				run.order === readableRun.order,
		);
		if (controls.length !== 1) {
			throw new Error(`pair ${readableRun.pair} has ${controls.length} exact accepted picture controls`);
		}
		const picture = controls[0];
		if (picture === undefined) throw new Error(`pair ${readableRun.pair} lost its picture control`);
		return { pair: readableRun.pair, order: readableRun.order, picture, readable: readableRun };
	});
}

function parseTraceEvent(value: unknown, index: number): TraceEvent {
	const raw = record(value, `trace event ${index}`);
	return {
		index,
		raw,
		name: stringField(raw, "name", `trace event ${index}`),
		category: typeof raw.cat === "string" ? raw.cat : "",
		phase: stringField(raw, "ph", `trace event ${index}`),
		pid: numberField(raw, "pid", `trace event ${index}`),
		tid: numberField(raw, "tid", `trace event ${index}`),
		timestampUs: numberField(raw, "ts", `trace event ${index}`),
		durationUs: optionalNumber(raw, "dur"),
	};
}

function readTrace(path: string): {
	archiveSha256: string;
	rawJsonSha256: string;
	events: TraceEvent[];
} {
	const archive = readFileSync(path);
	const rawJson = gunzipSync(archive);
	const root = record(parseJson(rawJson.toString("utf8"), basename(path)), basename(path));
	const traceEvents = root.traceEvents;
	if (!Array.isArray(traceEvents)) throw new Error(`${basename(path)}.traceEvents must be an array`);
	return {
		archiveSha256: sha256(archive),
		rawJsonSha256: sha256(rawJson),
		events: traceEvents.map(parseTraceEvent),
	};
}

function firstWheelMarker(events: readonly TraceEvent[]): TraceEvent {
	const matches = events.filter((event) => FIRST_WHEEL_MARKER.test(event.name));
	if (matches.length !== 1) throw new Error(`trace has ${matches.length} first-wheel markers`);
	const match = matches[0];
	if (match === undefined) throw new Error(`trace lost its first-wheel marker`);
	return match;
}

function parseGapMarkers(events: readonly TraceEvent[]): GapMarker[] {
	const names = new Set<string>();
	const markers: GapMarker[] = [];
	for (const event of events) {
		const match = GAP_MARKER.exec(event.name);
		if (match === null) continue;
		if (names.has(event.name)) throw new Error(`duplicate gap marker ${event.name}`);
		names.add(event.name);
		const from = Number(match[1]);
		const to = Number(match[2]);
		const duration = Number(match[3]);
		if (![from, to, duration].every(Number.isFinite)) throw new Error(`invalid gap marker ${event.name}`);
		markers.push({ event, fromMs: from, toMs: to, durationMs: duration });
	}
	return markers.sort(
		(left, right) => left.event.timestampUs - right.event.timestampUs || left.event.index - right.event.index,
	);
}

function markerPageTimestamp(event: TraceEvent): number {
	const args = record(event.raw.args, `${event.name}.args`);
	const data = record(args.data, `${event.name}.args.data`);
	return numberField(data, "startTime", `${event.name}.args.data`);
}

function firstWheelEventTimestamp(event: TraceEvent): number {
	const match = FIRST_WHEEL_MARKER.exec(event.name);
	if (match === null) throw new Error(`invalid first-wheel marker ${event.name}`);
	const timestamp = Number(match[1]);
	if (!Number.isFinite(timestamp)) throw new Error(`invalid first-wheel timestamp ${event.name}`);
	return timestamp;
}

function bindWorstRaf(
	run: MainRun,
	events: readonly TraceEvent[],
	gaps: readonly GapMarker[],
	rareIntervalMs: number,
): WorstRafEvidence {
	const firstWheel = firstWheelMarker(events);
	const firstWheelEventMs = firstWheelEventTimestamp(firstWheel);
	const traceTimeOriginUs = firstWheel.timestampUs - markerPageTimestamp(firstWheel) * 1000;
	const window = run.rafWorstWindow;
	if (run.rafWorstMs <= rareIntervalMs) {
		return {
			binding: "first-wheel-offset",
			pageFromOffsetMs: window.fromOffsetMs,
			pageToOffsetMs: window.toOffsetMs,
			durationMs: window.durationMs,
			traceFromUs: traceTimeOriginUs + (firstWheelEventMs + window.fromOffsetMs) * 1000,
			traceToUs: traceTimeOriginUs + (firstWheelEventMs + window.toOffsetMs) * 1000,
			markerName: null,
		};
	}

	const candidates = gaps
		.map((marker) => ({
			marker,
			score:
				Math.abs(marker.durationMs - window.durationMs) +
				Math.abs(marker.fromMs - firstWheelEventMs - window.fromOffsetMs) +
				Math.abs(marker.toMs - firstWheelEventMs - window.toOffsetMs),
		}))
		.filter(
			(candidate) =>
				Math.abs(candidate.marker.durationMs - window.durationMs) <= 0.01 &&
				Math.abs(candidate.marker.fromMs - firstWheelEventMs - window.fromOffsetMs) <= 2 &&
				Math.abs(candidate.marker.toMs - firstWheelEventMs - window.toOffsetMs) <= 2,
		)
		.sort(
			(left, right) =>
				left.score - right.score ||
				left.marker.event.timestampUs - right.marker.event.timestampUs ||
				left.marker.event.index - right.marker.event.index,
		);
	const match = candidates[0];
	if (match === undefined) {
		throw new Error(`pair ${run.pair} ${run.arm} worst interval did not match a gap marker`);
	}
	const second = candidates[1];
	if (second !== undefined && Math.abs(second.score - match.score) < 0.000_001) {
		throw new Error(`pair ${run.pair} ${run.arm} worst interval matched multiple gap markers`);
	}
	return {
		binding: "gap-marker",
		pageFromOffsetMs: window.fromOffsetMs,
		pageToOffsetMs: window.toOffsetMs,
		durationMs: window.durationMs,
		traceFromUs: match.marker.event.timestampUs - match.marker.durationMs * 1000,
		traceToUs: match.marker.event.timestampUs,
		markerName: match.marker.event.name,
	};
}

function eventIntersects(event: TraceEvent, fromUs: number, toUs: number): boolean {
	const duration = event.durationUs ?? 0;
	if (duration === 0) return event.timestampUs >= fromUs && event.timestampUs <= toUs;
	return event.timestampUs < toUs && event.timestampUs + duration > fromUs;
}

function eventUrl(event: TraceEvent): string | null {
	const args = event.raw.args;
	if (!isRecord(args)) return null;
	const data = args.data;
	if (!isRecord(data)) return null;
	return typeof data.url === "string" ? data.url : null;
}

function isChildFrameCall(event: TraceEvent): boolean {
	const url = eventUrl(event);
	return event.name === "FunctionCall" && url !== null && /\/frames\/n100-\d{3}(?:$|[?#])/.test(url);
}

function metadataName(event: TraceEvent): string | null {
	return nestedString(event.raw, "args", "name");
}

function eventOrder(left: TraceEvent, right: TraceEvent): number {
	return (
		left.timestampUs - right.timestampUs ||
		left.pid - right.pid ||
		left.tid - right.tid ||
		left.phase.localeCompare(right.phase) ||
		left.name.localeCompare(right.name) ||
		left.index - right.index
	);
}

function flowKey(event: TraceEvent): string | null {
	if (!["s", "t", "f"].includes(event.phase)) return null;
	const id = event.raw.id;
	const id2 = event.raw.id2;
	if (id === undefined && id2 === undefined) return null;
	return JSON.stringify([event.category, event.name, id ?? null, id2 ?? null, event.raw.scope ?? null]);
}

function chooseFunctionCalls(events: readonly TraceEvent[]): TraceEvent[] {
	const byUrl = new Map<string, TraceEvent>();
	for (const event of [...events].sort(eventOrder)) {
		if (!isChildFrameCall(event)) continue;
		const url = eventUrl(event);
		if (url !== null && !byUrl.has(`${event.pid}:${url}`)) byUrl.set(`${event.pid}:${url}`, event);
	}
	const selected = [...byUrl.values()].slice(0, MAX_FUNCTION_URLS_PER_TRACE);
	if (byUrl.size > MAX_FUNCTION_URLS_PER_TRACE) {
		throw new Error(`trace has ${byUrl.size} child-frame FunctionCall URLs; increase the explicit bound`);
	}
	return selected;
}

function chooseXEvents(
	events: readonly TraceEvent[],
	relevantPids: ReadonlySet<number>,
	window: WorstRafEvidence,
): TraceEvent[] {
	const candidates = events.filter(
		(event) =>
			event.phase === "X" &&
			relevantPids.has(event.pid) &&
			eventIntersects(event, window.traceFromUs, window.traceToUs),
	);
	const required = candidates.filter(
		(event) => event.name === "RunTask" || ATTRIBUTION_EVENT_NAMES.has(event.name),
	);
	if (required.length > MAX_X_EVENTS_PER_TRACE) {
		throw new Error(`trace needs ${required.length} required X events; increase the explicit bound`);
	}
	const selected = new Map(required.map((event) => [event.index, event]));
	const remainder = candidates
		.filter((event) => !selected.has(event.index))
		.sort(
			(left, right) =>
				(right.durationUs ?? 0) - (left.durationUs ?? 0) ||
				left.timestampUs - right.timestampUs ||
				left.index - right.index,
		);
	for (const event of remainder) {
		if (selected.size >= MAX_X_EVENTS_PER_TRACE) break;
		selected.set(event.index, event);
	}
	return [...selected.values()].sort(eventOrder);
}

function chooseFlowEvents(
	events: readonly TraceEvent[],
	relevantPids: ReadonlySet<number>,
	window: WorstRafEvidence,
): TraceEvent[] {
	const inWindow = events.filter(
		(event) =>
			flowKey(event) !== null &&
			event.timestampUs >= window.traceFromUs &&
			event.timestampUs <= window.traceToUs,
	);
	const anchoredKeys = new Set(
		inWindow.filter((event) => relevantPids.has(event.pid)).map((event) => flowKey(event) ?? ""),
	);
	const groups = new Map<string, TraceEvent[]>();
	for (const event of inWindow) {
		const key = flowKey(event);
		if (key === null || !anchoredKeys.has(key)) continue;
		const group = groups.get(key) ?? [];
		group.push(event);
		groups.set(key, group);
	}
	const orderedGroups = [...groups.values()]
		.map((group) => group.sort(eventOrder))
		.sort((left, right) => eventOrder(left[0] ?? neverEvent(), right[0] ?? neverEvent()));
	const selected: TraceEvent[] = [];
	for (const group of orderedGroups) {
		if (selected.length + group.length > MAX_FLOW_EVENTS_PER_TRACE) continue;
		selected.push(...group);
	}
	return selected.sort(eventOrder);
}

function neverEvent(): TraceEvent {
	throw new Error("flow group is unexpectedly empty");
}

function sanitizeString(value: string): string {
	return value
		.replace(/file:\/\/\/Users\/[^"'\\\n\r]*/g, "file:///<redacted>")
		.replace(/\/Users\/[^"'\\\n\r]*/g, "<redacted-path>")
		.replace(/file:\/\/\/home\/[^"'\\\n\r]*/g, "file:///<redacted>")
		.replace(/\/home\/[^"'\\\n\r]*/g, "<redacted-path>")
		.replace(/file:\/\/\/(?:private\/)?var\/folders\/[^"'\\\n\r]*/g, "file:///<redacted-temp>")
		.replace(/\/(?:private\/)?var\/folders\/[^"'\\\n\r]*/g, "<redacted-temp-path>")
		.replace(/file:\/\/\/(?:private\/)?tmp\/[^"'\\\n\r]*/g, "file:///<redacted-temp>")
		.replace(/\/(?:private\/)?tmp\/[^"'\\\n\r]*/g, "<redacted-temp-path>");
}

function sanitize(value: unknown): JsonValue {
	if (value === null || typeof value === "boolean" || typeof value === "number") return value;
	if (typeof value === "string") return sanitizeString(value);
	if (Array.isArray(value)) return value.map(sanitize);
	if (isRecord(value)) {
		const result: Record<string, JsonValue> = {};
		for (const [key, child] of Object.entries(value)) result[sanitizeString(key)] = sanitize(child);
		return result;
	}
	throw new Error(`trace contains a non-JSON value`);
}

function projectedEvent(event: TraceEvent): Record<string, JsonValue> {
	const keys = ["args", "bp", "cat", "dur", "id", "id2", "name", "ph", "pid", "scope", "tdur", "tid", "ts", "tts"];
	const result: Record<string, JsonValue> = {};
	for (const key of keys) {
		if (event.raw[key] !== undefined) result[key] = sanitize(event.raw[key]);
	}
	return result;
}

function processRoles(
	canvasPid: number,
	framePids: ReadonlySet<number>,
	gpuPids: ReadonlySet<number>,
): ProcessRole[] {
	const pids = new Set([canvasPid, ...framePids, ...gpuPids]);
	return [...pids]
		.sort((left, right) => left - right)
		.map((pid) => {
			const roles: string[] = [];
			if (pid === canvasPid) roles.push("canvas-renderer");
			if (framePids.has(pid)) roles.push("child-frame-renderer");
			if (gpuPids.has(pid)) roles.push("gpu");
			return { pid, roles };
		});
}

function addRole(roles: Map<number, Set<EventRole>>, event: TraceEvent, role: EventRole): void {
	const eventRoles = roles.get(event.index) ?? new Set<EventRole>();
	eventRoles.add(role);
	roles.set(event.index, eventRoles);
}

function extractTrace(
	run: MainRun,
	traceDir: string,
	rareIntervalMs: number,
): { source: SliceSource; events: SliceEvent[] } {
	const tracePath = join(traceDir, run.traceName);
	const trace = readTrace(tracePath);
	const firstWheel = firstWheelMarker(trace.events);
	const gaps = parseGapMarkers(trace.events);
	const worstRaf = bindWorstRaf(run, trace.events, gaps, rareIntervalMs);
	const functionCalls = chooseFunctionCalls(trace.events);
	if (run.arm === "readable" && functionCalls.length === 0) {
		throw new Error(`pair ${run.pair} readable trace has no child-frame FunctionCall URL evidence`);
	}

	const framePids = new Set(functionCalls.map((event) => event.pid));
	const gpuPids = new Set(
		trace.events
			.filter((event) => event.phase === "M" && event.name === "process_name" && metadataName(event) === "GPU Process")
			.map((event) => event.pid),
	);
	const relevantPids = new Set([firstWheel.pid, ...framePids, ...gpuPids]);
	const xEvents = chooseXEvents(trace.events, relevantPids, worstRaf);
	const flowEvents = chooseFlowEvents(trace.events, relevantPids, worstRaf);
	const markerEvents = trace.events.filter(
		(event) =>
			event.index === firstWheel.index ||
			event.name === "DEBUG132_LAST_WHEEL" ||
			event.name === "DEBUG132_ANALYSIS_END" ||
			event.name === worstRaf.markerName,
	);

	const roles = new Map<number, Set<EventRole>>();
	for (const event of xEvents) addRole(roles, event, "x");
	for (const event of flowEvents) addRole(roles, event, "flow");
	for (const event of functionCalls) addRole(roles, event, "function-call");
	for (const event of markerEvents) addRole(roles, event, "marker");

	const selectedEvents = [...roles.keys()]
		.map((index) => trace.events[index])
		.filter((event): event is TraceEvent => event !== undefined);
	const selectedPids = new Set(selectedEvents.map((event) => event.pid));
	const selectedThreads = new Set(selectedEvents.map((event) => `${event.pid}:${event.tid}`));
	const metadataEvents = trace.events.filter(
		(event) =>
			event.phase === "M" &&
			((event.name === "process_name" && selectedPids.has(event.pid)) ||
				(event.name === "thread_name" && selectedThreads.has(`${event.pid}:${event.tid}`))),
	);
	for (const event of metadataEvents) addRole(roles, event, "metadata");

	const traceId = `pair-${String(run.pair).padStart(2, "0")}-${run.arm}`;
	const eventRecords = [...roles.entries()]
		.map(([index, eventRoles]): SliceEvent | null => {
			const event = trace.events[index];
			if (event === undefined) return null;
			return {
				kind: "event",
				traceId,
				roles: ROLE_ORDER.filter((role) => eventRoles.has(role)),
				event: projectedEvent(event),
			};
		})
		.filter((value): value is SliceEvent => value !== null)
		.sort((left, right) => {
			const leftEvent = parseTraceEvent(left.event, 0);
			const rightEvent = parseTraceEvent(right.event, 0);
			return eventOrder(leftEvent, rightEvent);
		});

	return {
		source: {
			kind: "source",
			traceId,
			pair: run.pair,
			order: run.order,
			arm: run.arm,
			position: run.position,
			attempt: run.attempt,
			browserVersion: run.browserVersion,
			traceFile: run.traceName,
			archiveSha256: trace.archiveSha256,
			rawJsonSha256: trace.rawJsonSha256,
			rafWorstMs: run.rafWorstMs,
			worstRaf,
			gapMarkerCount: gaps.length,
			processRoles: processRoles(firstWheel.pid, framePids, gpuPids),
		},
		events: eventRecords,
	};
}

function parseSliceRecords(values: readonly unknown[]): SliceRecord[] {
	return values.map((value, index): SliceRecord => {
		const item = record(value, `slice record ${index + 1}`);
		const kind = stringField(item, "kind", `slice record ${index + 1}`);
		if (kind === "metadata" || kind === "source" || kind === "event") return item as unknown as SliceRecord;
		throw new Error(`slice record ${index + 1} has unknown kind ${kind}`);
	});
}

function sourceWindow(source: SliceSource): { fromUs: number; toUs: number } {
	return { fromUs: source.worstRaf.traceFromUs, toUs: source.worstRaf.traceToUs };
}

function traceEventFromSlice(recordValue: SliceEvent, index: number): TraceEvent {
	return parseTraceEvent(recordValue.event, index);
}

function overlapUs(event: TraceEvent, fromUs: number, toUs: number): number {
	const duration = event.durationUs ?? 0;
	return Math.max(0, Math.min(event.timestampUs + duration, toUs) - Math.max(event.timestampUs, fromUs));
}

function round(value: number, digits = 3): number {
	const scale = 10 ** digits;
	return Math.round(value * scale) / scale;
}

function eventTotals(events: readonly TraceEvent[], window: { fromUs: number; toUs: number }) {
	const totals = new Map<string, { count: number; durationUs: number; overlapUs: number }>();
	for (const event of events) {
		const current = totals.get(event.name) ?? { count: 0, durationUs: 0, overlapUs: 0 };
		current.count++;
		current.durationUs += event.durationUs ?? 0;
		current.overlapUs += overlapUs(event, window.fromUs, window.toUs);
		totals.set(event.name, current);
	}
	for (const name of ATTRIBUTION_EVENT_NAMES) {
		if (!totals.has(name)) totals.set(name, { count: 0, durationUs: 0, overlapUs: 0 });
	}
	const ranked = [...totals.entries()].sort(
		([leftName, left], [rightName, right]) =>
			right.overlapUs - left.overlapUs || right.durationUs - left.durationUs || leftName.localeCompare(rightName),
	);
	const selectedNames = new Set(ranked.slice(0, TOP_EVENT_TOTALS).map(([name]) => name));
	for (const name of ATTRIBUTION_EVENT_NAMES) {
		if (totals.has(name)) selectedNames.add(name);
	}
	return ranked
		.filter(([name]) => selectedNames.has(name))
		.map(([name, total]) => ({
			name,
			count: total.count,
			durationTotalMs: round(total.durationUs / 1000),
			windowOverlapTotalMs: round(total.overlapUs / 1000),
		}));
}

function metadataMaps(events: readonly TraceEvent[]): {
	processNames: Map<number, string>;
	threadNames: Map<string, string>;
} {
	const processNames = new Map<number, string>();
	const threadNames = new Map<string, string>();
	for (const event of events) {
		const name = metadataName(event);
		if (name === null) continue;
		if (event.name === "process_name") processNames.set(event.pid, name);
		if (event.name === "thread_name") threadNames.set(`${event.pid}:${event.tid}`, name);
	}
	return { processNames, threadNames };
}

function unionDurationUs(intervals: readonly { from: number; to: number }[]): number {
	const sorted = [...intervals]
		.filter((interval) => interval.to > interval.from)
		.sort((left, right) => left.from - right.from || left.to - right.to);
	let busyUs = 0;
	let current = sorted[0];
	if (current === undefined) return busyUs;
	for (const interval of sorted.slice(1)) {
		if (interval.from <= current.to) {
			current = { from: current.from, to: Math.max(current.to, interval.to) };
		} else {
			busyUs += current.to - current.from;
			current = interval;
		}
	}
	return busyUs + current.to - current.from;
}

function threadBusyUnions(
	xEvents: readonly TraceEvent[],
	metadataEvents: readonly TraceEvent[],
	window: { fromUs: number; toUs: number },
) {
	const byThread = new Map<string, TraceEvent[]>();
	for (const event of xEvents) {
		if (event.name !== "RunTask") continue;
		const key = `${event.pid}:${event.tid}`;
		const values = byThread.get(key) ?? [];
		values.push(event);
		byThread.set(key, values);
	}
	const names = metadataMaps(metadataEvents);
	return [...byThread.entries()]
		.map(([key, events]) => {
			const intervals = events
				.map((event) => ({
					from: Math.max(event.timestampUs, window.fromUs),
					to: Math.min(event.timestampUs + (event.durationUs ?? 0), window.toUs),
				}));
			const [pidText, tidText] = key.split(":");
			const pid = Number(pidText);
			const tid = Number(tidText);
			return {
				pid,
				tid,
				processName: names.processNames.get(pid) ?? null,
				threadName: names.threadNames.get(key) ?? null,
				runTaskCount: events.length,
				busyUnionMs: round(unionDurationUs(intervals) / 1000),
			};
		})
		.sort((left, right) => left.pid - right.pid || left.tid - right.tid);
}

function summarize(records: readonly SliceRecord[]) {
	const metadataRecords = records.filter((value): value is SliceMetadata => value.kind === "metadata");
	if (metadataRecords.length !== 1) throw new Error(`slice must contain exactly one metadata record`);
	const metadata = metadataRecords[0];
	if (metadata === undefined) throw new Error(`slice lost metadata`);
	const sources = records
		.filter((value): value is SliceSource => value.kind === "source")
		.sort((left, right) => left.pair - right.pair || left.arm.localeCompare(right.arm));
	const events = records.filter((value): value is SliceEvent => value.kind === "event");
	const traces = sources.map((source) => {
		const traceRecords = events.filter((event) => event.traceId === source.traceId);
		const parsed = traceRecords.map(traceEventFromSlice);
		const xEvents = parsed.filter((_, index) => traceRecords[index]?.roles.includes("x") === true);
		const metadataEvents = parsed.filter(
			(_, index) => traceRecords[index]?.roles.includes("metadata") === true,
		);
		const functionUrls = traceRecords
			.filter((event) => event.roles.includes("function-call"))
			.map((event, index) => eventUrl(parseTraceEvent(event.event, index)))
			.filter((url): url is string => url !== null)
			.sort();
		const window = sourceWindow(source);
		return {
			traceId: source.traceId,
			pair: source.pair,
			order: source.order,
			arm: source.arm,
			traceFile: source.traceFile,
			archiveSha256: source.archiveSha256,
			rawJsonSha256: source.rawJsonSha256,
			rafWorstMs: source.rafWorstMs,
			worstRaf: source.worstRaf,
			gapMarkerCount: source.gapMarkerCount,
			processRoles: source.processRoles,
			selectedEventCounts: {
				metadata: traceRecords.filter((event) => event.roles.includes("metadata")).length,
				marker: traceRecords.filter((event) => event.roles.includes("marker")).length,
				x: traceRecords.filter((event) => event.roles.includes("x")).length,
				flow: traceRecords.filter((event) => event.roles.includes("flow")).length,
				functionCall: traceRecords.filter((event) => event.roles.includes("function-call")).length,
			},
			eventTotals: eventTotals(xEvents, window),
			threadBusyUnions: threadBusyUnions(xEvents, metadataEvents, window),
			functionCallUrls: [...new Set(functionUrls)],
		};
	});
	const pairs = metadata.selectedPairs.map((pair) => {
		const picture = traces.find((trace) => trace.pair === pair && trace.arm === "picture");
		const readable = traces.find((trace) => trace.pair === pair && trace.arm === "readable");
		if (picture === undefined || readable === undefined) throw new Error(`slice lost a trace for pair ${pair}`);
		return {
			pair,
			order: readable.order,
			pictureTraceId: picture.traceId,
			readableTraceId: readable.traceId,
		};
	});
	return {
		schemaVersion: SCHEMA_VERSION,
		extractor: metadata.extractor,
		extractorSha256: metadata.extractorSha256,
		runsFile: metadata.runsFile,
		runsSha256: metadata.runsSha256,
		cliSha256: metadata.cliSha256,
		distTreeSha256: metadata.distTreeSha256,
		driverSha256: metadata.driverSha256,
		fixedPoint: metadata.fixedPoint,
		rareIntervalMs: metadata.rareIntervalMs,
		subjectDesignTreeSha256: metadata.subjectDesignTreeSha256,
		wheelScheduleSha256: metadata.wheelScheduleSha256,
		selectedReadableRareIntervals: metadata.selectedReadableRareIntervals,
		pairs,
		traces,
	};
}

type TraceSummary = ReturnType<typeof summarize>["traces"][number];

function requiredEventTotal(trace: TraceSummary, name: string): { count: number; durationTotalMs: number } {
	const matches = trace.eventTotals.filter((total) => total.name === name);
	if (matches.length !== 1) throw new Error(`${trace.traceId} has ${matches.length} ${name} totals`);
	const total = matches[0];
	if (total === undefined) throw new Error(`${trace.traceId} lost its ${name} total`);
	return { count: total.count, durationTotalMs: total.durationTotalMs };
}

function requiredThreadBusy(trace: TraceSummary, processRole: string, threadName: string): number {
	const rolePids = new Set(
		trace.processRoles.filter((process) => process.roles.includes(processRole)).map((process) => process.pid),
	);
	const matches = trace.threadBusyUnions.filter(
		(thread) => rolePids.has(thread.pid) && thread.threadName === threadName,
	);
	if (matches.length !== 1) {
		throw new Error(`${trace.traceId} has ${matches.length} ${processRole} ${threadName} busy unions`);
	}
	const thread = matches[0];
	if (thread === undefined) throw new Error(`${trace.traceId} lost its ${processRole} ${threadName} busy union`);
	return thread.busyUnionMs;
}

function reportedTraceTotals(summary: ReturnType<typeof summarize>) {
	return summary.pairs.map((pair) => {
		const picture = summary.traces.find((trace) => trace.traceId === pair.pictureTraceId);
		const readable = summary.traces.find((trace) => trace.traceId === pair.readableTraceId);
		if (picture === undefined || readable === undefined) throw new Error(`summary lost pair ${pair.pair}`);
		return {
			pair: pair.pair,
			pictureWorstMs: picture.rafWorstMs,
			readableWorstMs: readable.rafWorstMs,
			pictureRasterFinish: requiredEventTotal(picture, "RasterImplementation::Finish"),
			readableRasterFinish: requiredEventTotal(readable, "RasterImplementation::Finish"),
			pictureWaitForGetOffset: requiredEventTotal(
				picture,
				"CommandBufferProxyImpl::WaitForGetOffset",
			),
			readableWaitForGetOffset: requiredEventTotal(
				readable,
				"CommandBufferProxyImpl::WaitForGetOffset",
			),
			pictureDrawAndSwap: requiredEventTotal(picture, "Display::DrawAndSwap"),
			readableDrawAndSwap: requiredEventTotal(readable, "Display::DrawAndSwap"),
			readableChildRendererMainBusyMs: requiredThreadBusy(
				readable,
				"child-frame-renderer",
				"CrRendererMain",
			),
			readableCanvasRendererMainBusyMs: requiredThreadBusy(
				readable,
				"canvas-renderer",
				"CrRendererMain",
			),
			readableGpuMainBusyMs: requiredThreadBusy(readable, "gpu", "CrGpuMain"),
			readableVizBusyMs: requiredThreadBusy(readable, "gpu", "VizCompositorThread"),
			functionCallFrames: readable.functionCallUrls.map((url) => {
				const match = /\/frames\/(n100-\d{3})(?:$|[?#])/.exec(url);
				if (match?.[1] === undefined) throw new Error(`${readable.traceId} has an unexpected frame URL`);
				return match[1];
			}),
		};
	});
}

function verifyReportedTotals(summary: ReturnType<typeof summarize>): void {
	const reportedTotals = reportedTraceTotals(summary);
	deepStrictEqual(reportedTotals, EXPECTED_REPORTED_TRACE_TOTALS.slice(0, reportedTotals.length));
}

const EXPECTED_REPORTED_TRACE_TOTALS: ReturnType<typeof reportedTraceTotals> = [
	{
		pair: 3,
		pictureWorstMs: 16.6,
		readableWorstMs: 17,
		pictureRasterFinish: { count: 0, durationTotalMs: 0 },
		readableRasterFinish: { count: 4, durationTotalMs: 6.834 },
		pictureWaitForGetOffset: { count: 0, durationTotalMs: 0 },
		readableWaitForGetOffset: { count: 4, durationTotalMs: 6.786 },
		pictureDrawAndSwap: { count: 1, durationTotalMs: 0.224 },
		readableDrawAndSwap: { count: 2, durationTotalMs: 0.787 },
		readableChildRendererMainBusyMs: 12.322,
		readableCanvasRendererMainBusyMs: 1.487,
		readableGpuMainBusyMs: 11.558,
		readableVizBusyMs: 1.571,
		functionCallFrames: ["n100-056"],
	},
	{
		pair: 11,
		pictureWorstMs: 10.3,
		readableWorstMs: 16.6,
		pictureRasterFinish: { count: 0, durationTotalMs: 0 },
		readableRasterFinish: { count: 1, durationTotalMs: 6.025 },
		pictureWaitForGetOffset: { count: 0, durationTotalMs: 0 },
		readableWaitForGetOffset: { count: 1, durationTotalMs: 6.013 },
		pictureDrawAndSwap: { count: 1, durationTotalMs: 0.118 },
		readableDrawAndSwap: { count: 1, durationTotalMs: 0.336 },
		readableChildRendererMainBusyMs: 7.878,
		readableCanvasRendererMainBusyMs: 1.206,
		readableGpuMainBusyMs: 7.033,
		readableVizBusyMs: 0.684,
		functionCallFrames: ["n100-056"],
	},
	{
		pair: 17,
		pictureWorstMs: 10.4,
		readableWorstMs: 16.6,
		pictureRasterFinish: { count: 0, durationTotalMs: 0 },
		readableRasterFinish: { count: 2, durationTotalMs: 7.343 },
		pictureWaitForGetOffset: { count: 0, durationTotalMs: 0 },
		readableWaitForGetOffset: { count: 2, durationTotalMs: 7.321 },
		pictureDrawAndSwap: { count: 0, durationTotalMs: 0 },
		readableDrawAndSwap: { count: 3, durationTotalMs: 1.353 },
		readableChildRendererMainBusyMs: 12.149,
		readableCanvasRendererMainBusyMs: 0.989,
		readableGpuMainBusyMs: 11.942,
		readableVizBusyMs: 2.107,
		functionCallFrames: ["n100-056"],
	},
	{
		pair: 33,
		pictureWorstMs: 10.3,
		readableWorstMs: 17,
		pictureRasterFinish: { count: 0, durationTotalMs: 0 },
		readableRasterFinish: { count: 2, durationTotalMs: 4.206 },
		pictureWaitForGetOffset: { count: 0, durationTotalMs: 0 },
		readableWaitForGetOffset: { count: 2, durationTotalMs: 4.186 },
		pictureDrawAndSwap: { count: 0, durationTotalMs: 0 },
		readableDrawAndSwap: { count: 2, durationTotalMs: 0.707 },
		readableChildRendererMainBusyMs: 7.914,
		readableCanvasRendererMainBusyMs: 1.002,
		readableGpuMainBusyMs: 9.186,
		readableVizBusyMs: 1.306,
		functionCallFrames: ["n100-056"],
	},
];

function assertSanitized(text: string): void {
	if (
		/(?:file:\/\/)?\/(?:Users|home)\/|(?:file:\/\/)?\/(?:private\/)?(?:tmp|var\/folders)\//.test(text)
	) {
		throw new Error(`emitted evidence contains a private filesystem path`);
	}
}

function writeNdjson(path: string, records: readonly SliceRecord[]): void {
	const text = `${records.map((value) => JSON.stringify(sanitize(value))).join("\n")}\n`;
	assertSanitized(text);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
}

function main(): void {
	const options = parseOptions(process.argv.slice(2));
	if (options === null) {
		process.stdout.write(usage());
		return;
	}
	const currentExtractorSha256 = sha256(readFileSync(scriptPath));
	const currentDriverSha256 = sha256(readFileSync(driverPath));
	if (options.mode === "replay") {
		const records = parseSliceRecords(readNdjson(options.replaySlicePath));
		const reproducedSummary = summarize(records);
		if (reproducedSummary.extractorSha256 !== currentExtractorSha256) {
			throw new Error(
				`slice extractor SHA-256 is ${reproducedSummary.extractorSha256}, current extractor is ${currentExtractorSha256}`,
			);
		}
		if (reproducedSummary.driverSha256 !== currentDriverSha256) {
			throw new Error(
				`slice driver SHA-256 is ${reproducedSummary.driverSha256}, current driver is ${currentDriverSha256}`,
			);
		}
		const emittedSummary = parseJson(
			readFileSync(options.summaryPath, "utf8"),
			basename(options.summaryPath),
		);
		deepStrictEqual(emittedSummary, reproducedSummary);
		if (options.verifyReported) verifyReportedTotals(reproducedSummary);
		process.stdout.write(
			`${JSON.stringify({
				replayedSlice: options.replaySlicePath,
				summary: options.summaryPath,
				selectedPairs: reproducedSummary.pairs.map((pair) => pair.pair),
				traces: reproducedSummary.traces.length,
				reportedTotalsVerified: options.verifyReported,
			})}\n`,
		);
		return;
	}
	if (options.slicePath === options.summaryPath) throw new Error(`slice and summary outputs must differ`);

	const runValues = readNdjson(options.runsPath);
	const runMetadata = parseMainMetadata(runValues);
	if (runMetadata.driverSha256 !== currentDriverSha256) {
		throw new Error(
			`run metadata driver SHA-256 is ${runMetadata.driverSha256}, current driver is ${currentDriverSha256}`,
		);
	}
	for (const [index, value] of runValues.entries()) {
		if (!isRecord(value) || value.kind !== "run") continue;
		const runCliSha256 = stringField(value, "cliSha256", `run record ${index + 1}`);
		if (runCliSha256 !== runMetadata.cliSha256) {
			throw new Error(
				`run record ${index + 1} CLI SHA-256 is ${runCliSha256}, metadata is ${runMetadata.cliSha256}`,
			);
		}
		const runDistTreeSha256 = stringField(value, "distTreeSha256", `run record ${index + 1}`);
		if (runDistTreeSha256 !== runMetadata.distTreeSha256) {
			throw new Error(
				`run record ${index + 1} dist SHA-256 is ${runDistTreeSha256}, metadata is ${runMetadata.distTreeSha256}`,
			);
		}
	}
	const pairs = selectPairs(runValues, options.pairCount, runMetadata.rareIntervalMs);
	const metadata: SliceMetadata = {
		kind: "metadata",
		schemaVersion: SCHEMA_VERSION,
		extractor: basename(scriptPath),
		extractorSha256: currentExtractorSha256,
		runsFile: basename(options.runsPath),
		runsSha256: sha256(readFileSync(options.runsPath)),
		cliSha256: runMetadata.cliSha256,
		distTreeSha256: runMetadata.distTreeSha256,
		driverSha256: runMetadata.driverSha256,
		fixedPoint: runMetadata.fixedPoint,
		rareIntervalMs: runMetadata.rareIntervalMs,
		subjectDesignTreeSha256: runMetadata.subjectDesignTreeSha256,
		wheelScheduleSha256: runMetadata.wheelScheduleSha256,
		selectedReadableRareIntervals: pairs.length,
		selectedPairs: pairs.map((pair) => pair.pair),
		limits: {
			xEventsPerTrace: MAX_X_EVENTS_PER_TRACE,
			flowEventsPerTrace: MAX_FLOW_EVENTS_PER_TRACE,
			functionCallUrlsPerTrace: MAX_FUNCTION_URLS_PER_TRACE,
		},
	};
	const records: SliceRecord[] = [metadata];
	for (const pair of pairs) {
		for (const run of [pair.picture, pair.readable]) {
			const extracted = extractTrace(run, options.traceDir, runMetadata.rareIntervalMs);
			records.push(extracted.source, ...extracted.events);
		}
	}

	const expectedSummary = summarize(records);
	writeNdjson(options.slicePath, records);
	const emittedRecords = parseSliceRecords(readNdjson(options.slicePath));
	const reproducedSummary = summarize(emittedRecords);
	deepStrictEqual(reproducedSummary, expectedSummary);
	if (options.verifyReported) verifyReportedTotals(reproducedSummary);
	const summaryText = `${JSON.stringify(reproducedSummary, null, "\t")}\n`;
	assertSanitized(summaryText);
	mkdirSync(dirname(options.summaryPath), { recursive: true });
	writeFileSync(options.summaryPath, summaryText);
	const emittedSummary = parseJson(readFileSync(options.summaryPath, "utf8"), basename(options.summaryPath));
	deepStrictEqual(emittedSummary, reproducedSummary);
	process.stdout.write(
		`${JSON.stringify({
			slice: options.slicePath,
			summary: options.summaryPath,
			selectedPairs: pairs.map((pair) => pair.pair),
			traces: pairs.length * 2,
			reportedTotalsVerified: options.verifyReported,
		})}\n`,
	);
}

main();
