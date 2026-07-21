import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
 * known projects (spool never scans disk), so a corrupt file is an error to
 * surface, never something to silently reset. Written only by init and open.
 */
export function readRegistry(spoolDir: string): Registry {
	const file = join(spoolDir, "registry.json");
	let raw: string;
	try {
		raw = readFileSync(file, "utf8");
	} catch {
		return { version: 1, projects: [] };
	}
	try {
		return JSON.parse(raw) as Registry;
	} catch {
		throw new SpoolError(`corrupt registry at ${file}, fix or remove it`);
	}
}

export function registerProject(spoolDir: string, root: string): Registry {
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
	return registry;
}

function writeRegistry(spoolDir: string, registry: Registry): void {
	mkdirSync(spoolDir, { recursive: true });
	const file = join(spoolDir, "registry.json");
	const tmp = `${file}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(registry, null, "\t")}\n`);
	renameSync(tmp, file);
}
