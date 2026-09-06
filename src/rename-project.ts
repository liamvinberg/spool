import { existsSync, lstatSync, mkdirSync, renameSync, rmdirSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { writeAtomic } from "./atomic-write";
import { readThreads, threadsDir } from "./daemon/agent-threads";
import { applyRelocation } from "./daemon/bundled-relocation";
import { SpoolError } from "./errors";
import { type AppSession, type Registry, readMachineRegistry, readMachineSession } from "./machine-state-files";
import { isSafeName } from "./page-path";

export interface ProjectRename {
	root: string;
	name: string;
	registry: Registry;
	session: AppSession;
}

/** Only the closed machine-state operation calls this, with its cross-process lock held. */
export function renameProjectUnlocked(
	spoolDir: string,
	root: string,
	requestedName: string,
	bundled?: string,
): ProjectRename {
	const name = requestedName.trim();
	if (!isSafeName(name) || [...name].some((character) => character.charCodeAt(0) < 32)) {
		throw new SpoolError("Use a folder name without slashes or a leading dot.");
	}
	const registry = readMachineRegistry(spoolDir);
	const session = readMachineSession(spoolDir);
	if (!registry.projects.some((project) => project.root === root)) {
		throw new SpoolError("This project is no longer registered. Open its folder again.");
	}
	const target = join(dirname(root), name);
	if (target === root) return { root, name, registry, session };
	if (registry.projects.some((project) => project.root !== root && basename(project.root) === name)) {
		throw new SpoolError("A project with that name is already open in Spool. Choose another name.");
	}
	if (
		registry.projects.some((project) => project.root.startsWith(`${root}${sep}`)) ||
		resolve(spoolDir) === root ||
		resolve(spoolDir).startsWith(`${root}${sep}`)
	) {
		throw new SpoolError("This folder contains another Spool project or its app data and cannot be renamed here.");
	}
	const oldThreads = threadsDir(spoolDir, root);
	const newThreads = threadsDir(spoolDir, target);
	if (existsSync(newThreads)) throw new SpoolError("That location has saved conversations. Choose another name.");
	const nextRegistry: Registry = {
		...registry,
		projects: registry.projects.map((project) => (project.root === root ? { ...project, root: target } : project)),
	};
	const nextSession = { open: session.open.map((held) => (held === root ? target : held)) };
	const sessions = readThreads(spoolDir, root, true)
		.filter((thread) => thread.engine === "spool")
		.map((thread) => thread.session.id);
	if (sessions.length && bundled === undefined)
		throw new SpoolError("The bundled engine must prepare this project rename.");
	const restore: (() => void)[] = [];
	try {
		if (bundled !== undefined) applyRelocation(join(spoolDir, "bundled"), bundled, root, target, sessions, restore);
		moveIntoVacantFolder(root, target);
		restore.push(() => moveIntoVacantFolder(target, root));
		if (existsSync(oldThreads)) {
			moveIntoVacantFolder(oldThreads, newThreads);
			restore.push(() => moveIntoVacantFolder(newThreads, oldThreads));
		}
		writeAtomic(join(spoolDir, "registry.json"), `${JSON.stringify(nextRegistry, null, "\t")}\n`);
		restore.push(() => writeAtomic(join(spoolDir, "registry.json"), `${JSON.stringify(registry, null, "\t")}\n`));
		writeAtomic(join(spoolDir, "session.json"), `${JSON.stringify(nextSession, null, "\t")}\n`);
	} catch (error) {
		const failures: unknown[] = [];
		for (const undo of restore.reverse()) {
			try {
				undo();
			} catch (failure) {
				failures.push(failure);
			}
		}
		if (failures.length > 0)
			throw new AggregateError([error, ...failures], "Project rename could not be rolled back.");
		if (error instanceof SpoolError) throw error;
		throw new SpoolError(`Could not rename the project: ${error instanceof Error ? error.message : String(error)}`);
	}
	return { root: target, name, registry: nextRegistry, session: nextSession };
}

/** Claim the destination exclusively: even an existing empty folder belongs to somebody else. */
function moveIntoVacantFolder(from: string, to: string): void {
	// On a case-insensitive filesystem, a capitalization edit addresses the same
	// directory. It needs no reservation and must not be mistaken for a collision.
	const destination = lstatSync(to, { throwIfNoEntry: false });
	if (destination?.isDirectory()) {
		const source = lstatSync(from);
		if (source.dev === destination.dev && source.ino === destination.ino) {
			renameSync(from, to);
			return;
		}
	}
	try {
		mkdirSync(to);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			throw new SpoolError("A folder or file with that name already exists. Choose another name.");
		}
		throw error;
	}
	try {
		renameSync(from, to);
	} catch (error) {
		rmdirSync(to);
		throw error;
	}
}
