import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { SlidesAsked } from "./deck/rehearsal";
import { SpoolError } from "./errors";
import type { RehearseLine, RehearseOutcome } from "./rehearse-report";
import { refusalOf } from "./verbs";
import { controlHeaders, jsonLines } from "./verify";

/**
 * `spool rehearse` on the CLI's side (spool#322): ask the daemon to play the talk, say what it narrates while it plays,
 * and hand back what it found. A talk takes as long as it has beats, so only silence ends the wait: the daemon beats
 * every few seconds while it works.
 */

export interface RehearseDeps {
	readonly daemonUrl: string;
	readonly controlToken: string;
	/** the project's name */
	readonly name: string;
	readonly narrate: (line: string) => void;
}

/**
 * How long the daemon's answer may go without a line before it is taken for gone. It beats every few seconds, but a
 * machine short of memory stalls it for longer, and giving up throws away minutes of rehearsal.
 */
const QUIET_MS = 120_000;

/** `--slides 3` or `--slides 3-5`. */
export function parseSlides(value: string): SlidesAsked {
	const match = /^(\d+)(?:-(\d+))?$/.exec(value.trim());
	const from = Number(match?.[1]);
	const to = match?.[2] === undefined ? from : Number(match[2]);
	if (match === null || from < 1 || to < from)
		throw new SpoolError(`--slides takes a slide's number from 1, or a range of them like 3-5, got "${value}"`);
	return { from, to };
}

/** A talk named as a page or slide, or as its folder: `talk`, `design/frames/talk/`. */
export function talkNamed(value: string): string {
	return value.replace(/^\.?\/?(?:design\/)?frames\//, "").replace(/\/+$/, "");
}

export async function rehearseTalk(deps: RehearseDeps, talk: string, slides?: SlidesAsked): Promise<RehearseOutcome> {
	const url = `${deps.daemonUrl}/api/p/${encodeURIComponent(deps.name)}/rehearse`;
	const stopped = new AbortController();
	let quiet = setTimeout(() => stopped.abort(), QUIET_MS);
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: { ...controlHeaders(deps.controlToken), "content-type": "application/json" },
			body: JSON.stringify({ talk, ...(slides === undefined ? {} : { slides }) }),
			signal: stopped.signal,
		});
		if (res.status === 401 || res.status === 403) throw await refusalOf(res, url);
		if (!res.ok || res.body === null) {
			const text = await res.text();
			throw new SpoolError(text !== "" ? text : `the daemon could not rehearse "${talk}"`);
		}
		for await (const line of jsonLines<RehearseLine>(res.body)) {
			clearTimeout(quiet);
			quiet = setTimeout(() => stopped.abort(), QUIET_MS);
			if ("beat" in line) continue;
			if ("narrate" in line) {
				deps.narrate(line.narrate);
				continue;
			}
			if (line.outcome.kind === "failed")
				throw new SpoolError(`could not rehearse "${talk}": ${line.outcome.message}`);
			const { kind: _, ...outcome } = line.outcome;
			return outcome;
		}
		throw new SpoolError(`the daemon stopped answering while it rehearsed "${talk}"`);
	} catch (error) {
		if (stopped.signal.aborted)
			throw new SpoolError(
				`the daemon said nothing for ${Math.round(QUIET_MS / 1000)} s while it rehearsed "${talk}": \`spool status\` says whether it is still running`,
			);
		throw error;
	} finally {
		clearTimeout(quiet);
	}
}

/**
 * The rehearsal's pictures copied to `out` as well, in place of whatever a rehearsal left there, and where they are
 * now as the report names them: from `cwd`, or whole when outside it.
 */
export function copyRehearsal(root: string, folder: string, out: string, cwd: string): string {
	const target = resolve(cwd, out);
	mkdirSync(target, { recursive: true });
	rmSync(join(target, "stills"), { recursive: true, force: true });
	for (const file of readdirSync(target))
		if (/^sheet-\d+\.png$/.test(file)) rmSync(join(target, file), { force: true });
	cpSync(join(root, folder), target, { recursive: true });
	const from = relative(cwd, target);
	return from === "" ? "." : from.startsWith("..") || isAbsolute(from) ? target : from;
}
