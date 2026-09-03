import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isSafeName } from "../page-path";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";

/**
 * Scenario reads for the flow runtime (#5): project JSON under design/shared/,
 * parse-validated here so a broken file fails loud at the daemon with its
 * path, never as a mystery inside a frame.
 */

export type ProjectJson =
	| { kind: "ok"; json: string }
	| { kind: "missing"; message: string }
	| { kind: "invalid"; message: string };

/** Zero-config default: an empty seed. */
const EMPTY_SCENARIO = `{ "state": {} }`;

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
	if (!isPlainObject(scenario) || ("state" in scenario && !isPlainObject(scenario.state))) {
		return { kind: "invalid", message: `design/${rel} must be a JSON object of shape { "state": {} }` };
	}
	return { kind: "ok", json: raw };
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
