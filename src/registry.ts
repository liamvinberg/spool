import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { SpoolError } from "./errors";

export interface RegistryProject {
	root: string;
	openedAt: string;
}

export interface Registry {
	version: 1;
	projects: RegistryProject[];
}

/**
 * The machine-global project registry in ~/.spool. It is the only record of
 * known projects (spool never scans disk), so anything short of a cleanly
 * missing file is an error to surface, never something to silently reset.
 * Written only by init and open.
 */
export function readRegistry(spoolDir: string): Registry {
	const file = join(spoolDir, "registry.json");
	let raw: string;
	try {
		raw = readFileSync(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { version: 1, projects: [] };
		}
		throw new SpoolError(`cannot read registry at ${file}: ${(error as Error).message}`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		parsed = undefined;
	}
	if (!isRegistry(parsed)) {
		throw new SpoolError(`corrupt registry at ${file}, fix or remove it`);
	}
	return parsed;
}

export function registerProject(spoolDir: string, root: string): void {
	const real = realpathSync(root);
	const registry = readRegistry(spoolDir);
	const openedAt = new Date().toISOString();
	const existing = registry.projects.find((p) => p.root === real);
	if (existing) {
		existing.openedAt = openedAt;
	} else {
		registry.projects.push({ root: real, openedAt });
	}
	writeRegistry(spoolDir, registry);
}

export type ProjectLookup =
	| { kind: "found"; root: string }
	| { kind: "unknown" }
	| { kind: "ambiguous"; roots: string[] };

/**
 * Resolve a project by its display name — the folder name of a registered
 * root (#4: identity is the root path, display is the folder name). Two
 * registered roots sharing a folder name is an ambiguity to surface, never
 * a first-wins guess.
 */
export function lookupProjectByName(spoolDir: string, name: string): ProjectLookup {
	const roots = readRegistry(spoolDir)
		.projects.map((project) => project.root)
		.filter((root) => basename(root) === name);
	const [first, ...rest] = roots;
	if (first === undefined) return { kind: "unknown" };
	if (rest.length > 0) return { kind: "ambiguous", roots };
	return { kind: "found", root: first };
}

function isRegistry(value: unknown): value is Registry {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	if (record.version !== 1 || !Array.isArray(record.projects)) return false;
	return record.projects.every((project) => {
		if (typeof project !== "object" || project === null) return false;
		const p = project as Record<string, unknown>;
		return typeof p.root === "string" && typeof p.openedAt === "string";
	});
}

function writeRegistry(spoolDir: string, registry: Registry): void {
	mkdirSync(spoolDir, { recursive: true });
	const file = join(spoolDir, "registry.json");
	const tmp = `${file}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(registry, null, "\t")}\n`);
	renameSync(tmp, file);
}
