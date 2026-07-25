import { readFileSync } from "node:fs";
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

export interface AppSession {
	open: string[];
}

export function readMachineRegistry(spoolDir: string): Registry {
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

export function readMachineSession(spoolDir: string): AppSession {
	const file = join(spoolDir, "session.json");
	let raw: string;
	try {
		raw = readFileSync(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { open: [] };
		throw new SpoolError(`cannot read session at ${file}: ${(error as Error).message}`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { open: [] };
	}
	if (typeof parsed !== "object" || parsed === null) return { open: [] };
	const open = (parsed as Record<string, unknown>).open;
	if (!Array.isArray(open) || !open.every((root) => typeof root === "string")) return { open: [] };
	return { open };
}

function isRegistry(value: unknown): value is Registry {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	if (record.version !== 1 || !Array.isArray(record.projects)) return false;
	return record.projects.every((project) => {
		if (typeof project !== "object" || project === null) return false;
		const candidate = project as Record<string, unknown>;
		return typeof candidate.root === "string" && typeof candidate.openedAt === "string";
	});
}
