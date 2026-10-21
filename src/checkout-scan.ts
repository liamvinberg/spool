import type { Dirent } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { repoOf } from "./git-remote";

/**
 * Where Get it looks for a clone of a team project's repo that spool never opened (spool#193): the usual code
 * folders in the home folder, down to `SCAN_DEPTH` levels, nowhere else. macOS asks before an app reads Desktop,
 * Documents or Downloads, so those are never read, not even through a code folder that links into one.
 */
export const CODE_FOLDERS = ["code", "dev", "Developer", "Projects", "src", "repos", "GitHub"] as const;

/** A checkout is found at most this many folders under a code folder: `~/code/a/b/c`. */
export const SCAN_DEPTH = 3;

/** Folders macOS guards with a permission prompt: never read. */
const GUARDED = ["Desktop", "Documents", "Downloads"];

/** The most folders one scan reads, so a code folder of a million things never stalls the sheet. */
const SCAN_FOLDERS = 20_000;

/** A checkout found by the scan: its top folder and the repo its `origin` names. */
export interface FoundCheckout {
	top: string;
	repo: string;
}

/**
 * Every git checkout with an `origin` under the home folder's code folders. It reads only each one's `.git`, and of
 * that only the config's `origin`, following a worktree's or submodule's `.git` file to it; a checkout's own folders
 * aren't looked in. `home` is the home folder: the machine's, or a test's.
 */
export async function scanCheckouts(home: string): Promise<FoundCheckout[]> {
	const guarded = GUARDED.map((name) => join(home, name));
	const inGuarded = (path: string) => guarded.some((folder) => path === folder || path.startsWith(`${folder}${sep}`));
	const found: FoundCheckout[] = [];
	let read = 0;
	const walk = async (dir: string, depth: number): Promise<void> => {
		if (read >= SCAN_FOLDERS) return;
		read += 1;
		let entries: Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		const git = entries.find((entry) => entry.name === ".git");
		if (git !== undefined) {
			const repo = await originOf(dir, git.isDirectory(), inGuarded).catch(() => undefined);
			if (repo !== undefined) found.push({ top: dir, repo });
			return;
		}
		if (depth >= SCAN_DEPTH) return;
		await Promise.all(
			entries
				// a link is never followed: it could lead anywhere, a guarded folder included
				.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
				.map((entry) => walk(join(dir, entry.name), depth + 1)),
		);
	};
	await Promise.all(
		CODE_FOLDERS.map(async (name) => {
			const folder = join(home, name);
			let real: string;
			try {
				real = await realpath(folder);
				if (!(await stat(real)).isDirectory()) return;
			} catch {
				return;
			}
			if (inGuarded(real)) return;
			let entries: Dirent[];
			try {
				entries = await readdir(real, { withFileTypes: true });
			} catch {
				return;
			}
			read += 1;
			await Promise.all(
				entries
					.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
					.map((entry) => walk(join(real, entry.name), 1)),
			);
		}),
	);
	return found.sort((a, b) => (a.top < b.top ? -1 : 1));
}

/** The repo a checkout's `origin` names, read from its git config alone: git itself is never run. */
async function originOf(
	top: string,
	gitIsFolder: boolean,
	inGuarded: (path: string) => boolean,
): Promise<string | undefined> {
	let gitDir = join(top, ".git");
	if (!gitIsFolder) {
		const pointer = /^gitdir:\s*(.+?)\s*$/mu.exec(await readFile(gitDir, "utf8"))?.[1];
		if (pointer === undefined) return undefined;
		gitDir = isAbsolute(pointer) ? pointer : resolve(top, pointer);
	}
	// a worktree's own folder names the repository's, where the config is
	const common = await readFile(join(gitDir, "commondir"), "utf8").then(
		(text) => text.trim(),
		() => undefined,
	);
	const configDir = common === undefined || common === "" ? gitDir : resolve(gitDir, common);
	// a worktree of a repository kept in a guarded folder stays unread
	if (inGuarded(configDir) || inGuarded(gitDir)) return undefined;
	return repoOf(originUrl(await readFile(join(configDir, "config"), "utf8")));
}

/** `remote "origin"`'s url in a git config's text. */
export function originUrl(config: string): string | undefined {
	let inOrigin = false;
	for (const raw of config.split(/\r?\n/u)) {
		const line = raw.trim();
		if (line.startsWith("[")) {
			inOrigin = /^\[\s*remote\s+"origin"\s*\]$/u.test(line);
			continue;
		}
		if (!inOrigin) continue;
		const url = /^url\s*=\s*(.+)$/u.exec(line)?.[1];
		if (url !== undefined) return url.replace(/^"(.*)"$/u, "$1").trim();
	}
	return undefined;
}
