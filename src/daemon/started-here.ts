import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";

/**
 * The team projects this Mac started with New, by address (spool#411): the only team copies that go by themselves
 * when closed untitled and empty. A teammate's untitled copy, got from the team, would only come back. Kept in the
 * machine's state, since a copy's own record travels with nothing and a rename gives it a name anyway.
 */
function file(spoolDir: string): string {
	return join(spoolDir, "started-here.json");
}

function read(spoolDir: string): string[] {
	try {
		const urls = (JSON.parse(readFileSync(file(spoolDir), "utf8")) as { projects?: unknown }).projects;
		return Array.isArray(urls) ? urls.filter((url): url is string => typeof url === "string") : [];
	} catch {
		return [];
	}
}

function write(spoolDir: string, urls: readonly string[]): void {
	writeAtomic(file(spoolDir), `${JSON.stringify({ projects: urls }, null, "\t")}\n`);
}

export function markStartedHere(spoolDir: string, url: string): void {
	const urls = read(spoolDir);
	if (!urls.includes(url)) write(spoolDir, [...urls, url]);
}

export function startedHere(spoolDir: string, url: string): boolean {
	return read(spoolDir).includes(url);
}

export function forgetStartedHere(spoolDir: string, url: string): void {
	const urls = read(spoolDir);
	if (urls.includes(url))
		write(
			spoolDir,
			urls.filter((held) => held !== url),
		);
}
