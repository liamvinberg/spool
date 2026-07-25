import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";

/**
 * Scenario and fixture reads for the flow runtime (#5): both are project JSON
 * under design/shared/, parse-validated here so a broken file fails loud at
 * the daemon with its path, never as a mystery inside a frame's fetch.
 */

export type ProjectJson =
	| { kind: "ok"; json: string }
	| { kind: "missing"; message: string }
	| { kind: "invalid"; message: string };

/** Zero-config default: empty state, fixtures-backed mock. */
const EMPTY_SCENARIO = `{ "state": {}, "mock": {} }`;

export function readScenario(root: string, name: string): ProjectJson {
	if (!isSafeName(name)) return { kind: "missing", message: `not a scenario name: "${name}"` };
	const designDir = realDesignDir(root);
	const rel = join("shared", "scenarios", `${name}.json`);
	let raw: string | undefined;
	try {
		raw = readIfExists(join(designDir, rel), designDir);
	} catch (error) {
		if (error instanceof DesignBoundaryError) return { kind: "invalid", message: error.message };
		throw error;
	}
	if (raw === undefined) {
		if (name === "default") return { kind: "ok", json: EMPTY_SCENARIO };
		return { kind: "missing", message: `no scenario "${name}" — expected design/${rel}` };
	}
	const parsed = parseJson(raw, rel);
	if (parsed.kind === "invalid") return parsed;
	const scenario = parsed.value;
	if (
		!isPlainObject(scenario) ||
		("state" in scenario && !isPlainObject(scenario.state)) ||
		("mock" in scenario && !isPlainObject(scenario.mock))
	) {
		return { kind: "invalid", message: `design/${rel} must be a JSON object of shape { "state": {}, "mock": {} }` };
	}
	return { kind: "ok", json: raw };
}

export function readFixture(root: string, name: string): ProjectJson {
	// the runtime maps /api/<name> to a fixture verbatim, so a fetch spelled
	// /api/products.json still lands on fixtures/products.json
	const clean = name.endsWith(".json") ? name.slice(0, -".json".length) : name;
	if (clean.length === 0 || !clean.split("/").every(isSafeName)) {
		return { kind: "missing", message: `not a fixture name: "${name}"` };
	}
	const designDir = realDesignDir(root);
	const rel = join("shared", "fixtures", `${clean}.json`);
	let raw: string | undefined;
	try {
		raw = readIfExists(join(designDir, rel), designDir);
	} catch (error) {
		if (error instanceof DesignBoundaryError) return { kind: "invalid", message: error.message };
		throw error;
	}
	if (raw === undefined) return { kind: "missing", message: `no fixture "${clean}" — expected design/${rel}` };
	const parsed = parseJson(raw, rel);
	if (parsed.kind === "invalid") return parsed;
	return { kind: "ok", json: raw };
}

/** One rule for every name that becomes a path segment: frames, scenarios, fixture parts. */
export function isSafeName(segment: string): boolean {
	return segment.length > 0 && !segment.startsWith(".") && !segment.includes("/") && !segment.includes("\\");
}

function parseJson(
	raw: string,
	rel: string,
): { kind: "parsed"; value: unknown } | { kind: "invalid"; message: string } {
	try {
		return { kind: "parsed", value: JSON.parse(raw) };
	} catch (error) {
		return { kind: "invalid", message: `design/${rel}: ${(error as Error).message}` };
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readIfExists(file: string, designDir: string): string | undefined {
	try {
		return readFileSync(resolveDesignPath(designDir, file), "utf8");
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
}
