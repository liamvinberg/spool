import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { registerAndOpenProject } from "./daemon/session";
import { SpoolError } from "./errors";
import { isSafeName } from "./page-path";
import { expandHome, realDir } from "./paths";
import { readRegistry } from "./registry";
import { scaffoldDirs, scaffoldFiles } from "./templates";

export interface InitOptions {
	/**
	 * Whether the new project keeps history (#158). Off unless the caller asks:
	 * an automatic save between an agent's own commits is noise in a log a team
	 * reads, so a project opts in, and init says which way it went out loud.
	 */
	history?: boolean;
}

/**
 * Scaffold the design/ contract, register the product root, and open its tab.
 * Never touches an existing design/, whoever owns it.
 */
export function initProject(targetDir: string, spoolDir: string, options: InitOptions = {}): { root: string } {
	const root = realDir(targetDir);

	const design = join(root, "design");
	if (existsSync(join(design, "canvas.json"))) {
		throw new SpoolError(`already a spool project: ${root} (run \`spool open\` instead)`);
	}
	if (existsSync(design)) {
		throw new SpoolError(`design/ already exists at ${root} and is not a spool project, move it aside first`);
	}

	for (const dir of scaffoldDirs) {
		mkdirSync(join(design, dir), { recursive: true });
	}
	for (const [rel, content] of Object.entries(scaffoldFiles(options.history ?? false))) {
		const file = join(design, rel);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, content);
	}

	registerAndOpenProject(spoolDir, root);
	return { root };
}

/**
 * The picker's "+" (#242): make the folder, then run the one scaffold on it.
 * The folder lands inside the one being browsed, and a name is one path
 * segment, never a path — the picker is where you choose where.
 */
export function createProject(parentDir: string, name: string, spoolDir: string): { root: string } {
	const trimmed = name.trim();
	if (trimmed === "") return startProject(parentDir, spoolDir);
	if (!isSafeName(trimmed)) throw new SpoolError(`Not a folder name: ${JSON.stringify(trimmed)}`);
	const parent = expandHome(parentDir);
	try {
		mkdirSync(parent, { recursive: true });
		const target = join(realDir(parent), trimmed);
		if (existsSync(target)) throw new SpoolError(`${trimmed} already exists here. Choose another name.`);
		mkdirSync(target);
		return initProject(target, spoolDir);
	} catch (error) {
		if (error instanceof SpoolError) throw error;
		throw new SpoolError(
			`Could not create a project in ${parent}. Choose another folder or check that it is writable.`,
		);
	}
}

/** Allocate with mkdir itself: another request or process may take any name before us. */
export function startProject(location: string, spoolDir: string): { root: string } {
	const parent = expandHome(location);
	try {
		mkdirSync(parent, { recursive: true });
		const directory = realDir(parent);
		const registered = new Set(readRegistry(spoolDir).projects.map((project) => basename(project.root)));
		for (let suffix = 1; ; suffix++) {
			const name = suffix === 1 ? "untitled" : `untitled-${suffix}`;
			if (registered.has(name)) continue;
			const target = join(directory, name);
			try {
				mkdirSync(target);
			} catch (error) {
				if (error instanceof Error && "code" in error && error.code === "EEXIST") continue;
				throw error;
			}
			return initProject(target, spoolDir);
		}
	} catch (error) {
		throw new SpoolError(
			`Could not create a project in ${parent}. Check that the folder is writable or change the save location. ${error instanceof Error ? error.message : ""}`,
		);
	}
}
