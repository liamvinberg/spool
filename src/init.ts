import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { registerAndOpenProject } from "./daemon/session";
import { SpoolError } from "./errors";
import { realDir } from "./paths";
import { scaffoldDirs, scaffoldFiles } from "./templates";

/**
 * Scaffold the design/ contract, register the product root, and open its tab.
 * Never touches an existing design/, whoever owns it.
 */
export function initProject(targetDir: string, spoolDir: string): { root: string } {
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
	for (const [rel, content] of Object.entries(scaffoldFiles)) {
		const file = join(design, rel);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, content);
	}

	registerAndOpenProject(spoolDir, root);
	return { root };
}
