import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { registerAndOpenProject } from "./daemon/session";
import { SpoolError } from "./errors";
import { isSafeName } from "./page-path";
import { realDir } from "./paths";
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
	if (!isSafeName(name) || name === "." || name === "..") {
		throw new SpoolError(`not a folder name: ${JSON.stringify(name)}`);
	}
	const target = join(realDir(parentDir), name);
	if (existsSync(target)) {
		throw new SpoolError(`${name} already exists here`);
	}
	mkdirSync(target);
	return initProject(target, spoolDir);
}
