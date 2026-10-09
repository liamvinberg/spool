import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import type { AgentEngineId } from "./agent-engine";

/**
 * Each spool thread's model session in an engine that names its own (#362, #363).
 *
 * Claude's session is the rail's id, so Claude needs nothing here. Codex mints a thread id on
 * `thread/start` and pi writes a session file of its choosing, so spool keeps the exact
 * reference each handed back, under the spool session it belongs to, and hands it back on the
 * next turn. One file per engine in spool's state, `sessions/<engine>.json`.
 *
 * Earlier versions kept these in two shapes of their own, Codex one file per session under
 * `codex/threads/` and pi one map in `pi-sessions.json`. Those are still read, so a thread
 * from before keeps continuing; the next write puts its reference in the new file.
 */
export interface EngineSessions {
	read(session: string): string | undefined;
	write(session: string, reference: string): void;
}

export function engineSessions(spoolDir: string, engine: AgentEngineId): EngineSessions {
	const file = join(spoolDir, "sessions", `${engine}.json`);
	const earlier = EARLIER[engine];
	return {
		read: (session) => readMap(file)[session] ?? earlier?.(spoolDir, session),
		write: (session, reference) => {
			const held = readMap(file);
			if (held[session] === reference) return;
			writeAtomic(file, `${JSON.stringify({ ...held, [session]: reference }, null, "\t")}\n`);
		},
	};
}

function readMap(file: string): Record<string, string> {
	try {
		const data: unknown = JSON.parse(readFileSync(file, "utf8"));
		if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
		return Object.fromEntries(
			Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
		);
	} catch {
		return {};
	}
}

/** where each engine kept its references before they shared one store */
const EARLIER: Partial<Record<AgentEngineId, (spoolDir: string, session: string) => string | undefined>> = {
	codex: (spoolDir, session) => {
		try {
			const file = join(spoolDir, "codex", "threads", `${session.replace(/[^\w-]/g, "")}.json`);
			const stored = JSON.parse(readFileSync(file, "utf8")) as { thread?: unknown };
			return typeof stored.thread === "string" ? stored.thread : undefined;
		} catch {
			return undefined;
		}
	},
	pi: (spoolDir, session) => readMap(join(spoolDir, "pi-sessions.json"))[session],
};
