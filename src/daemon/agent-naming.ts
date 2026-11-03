import { basename } from "node:path";
import { SpoolError } from "../errors";
import { isUntitled } from "../untitled";
import type { AgentExecutor } from "./agent-exec";
import { probeAgent } from "./agent-exec";
import type { AgentSpawn } from "./agent-spawn";

/**
 * Naming a new project from its first ask (spool#51): an untitled project's first turn waits while the same
 * agent, in one quick question of its own, says what to call it, and the project is renamed before anything in
 * it is written. Whatever goes wrong, or takes longer than this, leaves the project untitled and the turn goes on.
 */
export const NAMING_TIMEOUT_MS = 10_000;

/** The one question asked, the brief cut to what a name needs. */
export function namingPrompt(brief: string): string {
	return `Name this design project from its brief in 1 to 3 lowercase words joined by hyphens. Reply with only the name. Brief: ${brief.trim().slice(0, 2000)}`;
}

/** A reply as a project name: its last line, 1 to 3 lowercase words joined by hyphens, or null when it has none. */
export function kebabName(reply: string): string | null {
	const line =
		reply
			.split("\n")
			.map((one) => one.trim())
			.filter((one) => one !== "")
			.at(-1) ?? "";
	const words = line
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/gu, "")
		.split(/[^a-z0-9]+/u)
		.filter((word) => word !== "");
	if (words.length === 0 || words.length > 3) return null;
	const name = words.join("-");
	return name.length > 40 || isUntitled(name) ? null : name;
}

/**
 * One plain-text question to an agent's binary: everything it printed, or null when it could not be asked or
 * failed. A failure can print on stdout too (a signed-out claude says so there), so only a clean exit answers.
 */
export async function askOnce(
	executor: AgentExecutor,
	spawn: AgentSpawn,
	signal?: AbortSignal,
): Promise<string | null> {
	let proc: Awaited<ReturnType<AgentExecutor>>;
	try {
		proc = await executor(spawn);
	} catch {
		return null;
	}
	const said: string[] = [];
	let code: number | null | undefined;
	await probeAgent(
		proc,
		NAMING_TIMEOUT_MS,
		(finish) => {
			proc.onLine((line) => said.push(line));
			// the exit is heard here rather than by the probe, for its code: the first one, not the kill after it
			proc.onExit((exit) => {
				code ??= exit;
				finish();
			});
			proc.end();
		},
		signal,
	);
	return code === 0 ? said.join("\n") : null;
}

/**
 * The project the first turn runs in: an untitled one with no frames, named first by `ask`, or the one it was.
 * A refused rename (the name is taken here, say) is a name it doesn't get, never a failed turn.
 */
export async function nameFirst(
	root: string,
	deps: {
		/** whether the project has frames yet: one that has is past naming */
		hasFrames: (root: string) => boolean;
		/** the agent's reply to `namingPrompt`, or null */
		ask: () => Promise<string | null>;
		rename: (root: string, name: string) => { root: string };
	},
): Promise<string> {
	if (!isUntitled(basename(root)) || deps.hasFrames(root)) return root;
	const name = kebabName((await deps.ask()) ?? "");
	if (name === null) return root;
	try {
		return deps.rename(root, name).root;
	} catch (error) {
		if (error instanceof SpoolError) return root;
		throw error;
	}
}
