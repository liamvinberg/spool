import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";

/**
 * The team copies this Mac started with New, by folder (spool#411): the only team copies that go by themselves when
 * closed untitled and empty. A teammate's untitled copy, got from the team, would only come back. Kept in the
 * machine's state and marked before the copy is registered, so no card of it ever reads without it.
 */
function file(spoolDir: string): string {
	return join(spoolDir, "started-here.json");
}

function read(spoolDir: string): string[] {
	try {
		const roots = (JSON.parse(readFileSync(file(spoolDir), "utf8")) as { roots?: unknown }).roots;
		return Array.isArray(roots) ? roots.filter((root): root is string => typeof root === "string") : [];
	} catch {
		return [];
	}
}

function write(spoolDir: string, roots: readonly string[]): void {
	writeAtomic(file(spoolDir), `${JSON.stringify({ roots: roots }, null, "\t")}\n`);
}

export function markStartedHere(spoolDir: string, root: string): void {
	const roots = read(spoolDir);
	if (!roots.includes(root)) write(spoolDir, [...roots, root]);
}

export function startedHere(spoolDir: string, root: string): boolean {
	return read(spoolDir).includes(root);
}

export function forgetStartedHere(spoolDir: string, root: string): void {
	const roots = read(spoolDir);
	if (roots.includes(root))
		write(
			spoolDir,
			roots.filter((held) => held !== root),
		);
}
