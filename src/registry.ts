import { realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import { followedLink } from "./daemon/team-sync";
import { type MachineProjectRemoval, mutateMachineState } from "./machine-state";
import { type Registry, type RegistryProject, readMachineRegistry } from "./machine-state-files";
import type { ProjectLink } from "./team-project";

export type { Registry, RegistryProject };

/**
 * The machine-global project registry in ~/.spool. It is the only record of
 * known projects (spool never scans disk), so anything short of a cleanly
 * missing file is an error to surface, never something to silently reset.
 * Written only by init, open, and remove lifecycle operations.
 */
export function readRegistry(spoolDir: string): Registry {
	return readMachineRegistry(spoolDir);
}

export function registerProject(spoolDir: string, root: string): void {
	const real = realpathSync(root);
	mutateMachineState(spoolDir, { kind: "register-project", root: real });
}

/** Forget one registered root, preserving every file it points at. */
export function unregisterProject(spoolDir: string, path: string): { root: string; removed: boolean } {
	const root = resolveRegisteredRoot(path);
	return unregisterResolvedProject(spoolDir, root);
}

/** Forget one canonical root without resolving its disk identity again. */
export function unregisterResolvedProject(spoolDir: string, root: string): { root: string; removed: boolean } {
	const result = forgetResolvedProject(spoolDir, root);
	return { root: result.root, removed: result.removed };
}

/** Forget one exact root and close its tab as one event-ready machine mutation. */
export function forgetResolvedProject(spoolDir: string, root: string): MachineProjectRemoval {
	return mutateMachineState(spoolDir, { kind: "remove-project", root });
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

/** A vanished root cannot be realpathed, but its registered absolute spelling still identifies it. */
export function resolveRegisteredRoot(path: string): string {
	const absolute = resolve(path);
	try {
		return realpathSync(absolute);
	} catch {
		return absolute;
	}
}

/** A team project this machine holds, and every registered local copy of it, most recently opened first. */
export interface TeamProjectCopies {
	link: ProjectLink;
	copies: string[];
}

/**
 * The machine's team projects, keyed by team and name (the link a local copy is followed by). A checkout and
 * each of its worktrees is a local copy of one team project; each is registered by its own root, and forgetting one
 * forgets that path only. Read from each root rather than remembered, so a pull that brings a `spool.json` in is seen
 * as it is. A copy whose project ended here is none: its team project is one to get again.
 */
export function teamProjects(spoolDir: string): TeamProjectCopies[] {
	const projects = new Map<string, TeamProjectCopies>();
	const registered = [...readRegistry(spoolDir).projects].sort(
		(a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt),
	);
	for (const { root } of registered) {
		const link = followedLink(root);
		if (link === undefined) continue;
		const known = projects.get(link.url);
		if (known === undefined) projects.set(link.url, { link, copies: [root] });
		else known.copies.push(root);
	}
	return [...projects.values()];
}
