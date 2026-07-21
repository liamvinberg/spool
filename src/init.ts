import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { SpoolError } from "./errors";
import { registerProject } from "./registry";
import { scaffoldDirs, scaffoldFiles } from "./templates";

/**
 * Scaffold the design/ contract in an existing product root and register it.
 * Never touches an existing design/, whoever owns it.
 */
export function initProject(targetDir: string, spoolDir: string): { root: string } {
	let root: string;
	try {
		root = realpathSync(resolve(targetDir));
	} catch {
		throw new SpoolError(`no such directory: ${targetDir}`);
	}

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
	for (const [rel, content] of Object.entries(scaffoldFiles)) {
		const file = join(design, rel);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, content);
	}

	registerProject(spoolDir, root);
	return { root };
}
