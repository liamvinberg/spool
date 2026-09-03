import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The agent captures (#190) are tracked at fixtures/captures/, so the shipped
 * suite reads them without reaching into the dogfood canvas and canvas work in
 * flight can never red the build.
 *
 * The canvas imports them as JSON, and an import resolves under design/ and
 * nowhere else: the design boundary rejects any path whose target leaves
 * design/, a symlink to a file inside the project root included
 * (design-boundary.test.ts). So the canvas gets a mirror rather than a link. It
 * is untracked, this is its only writer, and the tracked home is the source.
 */
export function mirrorCaptures(from: string, to: string): void {
	const captures = readdirSync(from).filter((name) => name.endsWith(".json"));
	mkdirSync(to, { recursive: true });
	for (const stale of readdirSync(to).filter((name) => !captures.includes(name))) {
		rmSync(join(to, stale), { recursive: true });
	}
	for (const name of captures) {
		if (outdated(join(from, name), join(to, name))) copyFileSync(join(from, name), join(to, name));
	}
}

/** A copy stamps its own mtime, so a mirror is current while it is the same size and younger. */
function outdated(from: string, to: string): boolean {
	const mirrored = statSync(to, { throwIfNoEntry: false });
	if (mirrored === undefined) return true;
	const source = statSync(from);
	return mirrored.size !== source.size || mirrored.mtimeMs < source.mtimeMs;
}
