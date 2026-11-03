import { execFile, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { promisify } from "node:util";
import { SpoolError } from "./errors";

/**
 * Open… taking a git link: asking the remote whether it answers, and cloning it onto this Mac. Git runs with the
 * daemon's own git environment taken off and never prompts, so a private repo without a credential reads as one that
 * answers nothing rather than hanging on a password nobody can type.
 */

const run = promisify(execFile);

const quiet = () => ({ ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_TERMINAL_PROMPT: "0" });

/** The branch a remote's HEAD names, or undefined when nothing answers at the link. */
export async function remoteHead(url: string, signal?: AbortSignal): Promise<{ branch: string | null } | undefined> {
	try {
		const { stdout } = await run("git", ["ls-remote", "--symref", "--", url, "HEAD"], {
			env: quiet(),
			timeout: 20_000,
			windowsHide: true,
			...(signal === undefined ? {} : { signal }),
		});
		const head = /^ref: refs\/heads\/(\S+)\s+HEAD$/mu.exec(stdout);
		return { branch: head?.[1] ?? null };
	} catch {
		return undefined;
	}
}

/** The branch a folder's checkout is on, or null when it is detached. */
export async function branchAt(dir: string): Promise<string | null> {
	try {
		const { stdout } = await run("git", ["symbolic-ref", "--short", "-q", "HEAD"], {
			cwd: dir,
			env: quiet(),
			timeout: 10_000,
			windowsHide: true,
		});
		const branch = stdout.trim();
		return branch === "" ? null : branch;
	} catch {
		return null;
	}
}

/** How far a clone has got: git's own line, lowercased, and the share of objects received when it says one. */
export interface CloneProgress {
	line: string;
	done: number | null;
}

/** What git prints while it clones, as a share of the whole: receiving is most of the wait, resolving the rest. */
export function cloneProgressOf(line: string): CloneProgress {
	// git's own words in lowercase, as machine text is shown; a path in them keeps its case
	const trimmed = line.trim().replace(/^remote:\s*/iu, "");
	const said = trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
	const percent = /^(receiving|resolving) (?:objects|deltas):\s+(\d+)%/u.exec(said);
	if (percent === null) return { line: said, done: null };
	const share = Number(percent[2]) / 100;
	return {
		line: said.replace(/,.*$/u, "").replace(/\s+\(.*\)$/u, ""),
		done: percent[1] === "receiving" ? share * 0.9 : 0.9 + share * 0.1,
	};
}

/** Clone `url` into `into`, which must not exist yet. A clone that fails or is stopped leaves nothing behind. */
export async function cloneInto(
	url: string,
	into: string,
	options: { progress?: (progress: CloneProgress) => void; signal?: AbortSignal } = {},
): Promise<void> {
	const child = spawn("git", ["clone", "--progress", "--", url, into], {
		env: quiet(),
		stdio: ["ignore", "ignore", "pipe"],
		windowsHide: true,
	});
	const stop = () => child.kill();
	options.signal?.addEventListener("abort", stop, { once: true });
	let last = "";
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => {
		for (const line of chunk.split(/[\r\n]+/u)) {
			if (line.trim() === "") continue;
			last = line.trim();
			options.progress?.(cloneProgressOf(line));
		}
	});
	const code = await new Promise<number | null>((resolve) => {
		child.on("error", () => resolve(-1));
		child.on("close", resolve);
	});
	options.signal?.removeEventListener("abort", stop);
	if (code === 0) return;
	rmSync(into, { recursive: true, force: true });
	if (options.signal?.aborted) throw new SpoolError("The clone was stopped.");
	throw new SpoolError(last.replace(/^fatal:\s*/u, "") || "git could not clone this repository.");
}
