import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { AgentPermissions } from "../../daemon/agent-defaults";
import type { AgentEngineId } from "../../daemon/agent-engine";
import { fetchAgentDefaults, saveAgentEngine } from "../api";
import { useSettings } from "../settings";

/**
 * The machine's agent choice as this page last confirmed it (#361).
 *
 * One value for every project on the page, because it is one value on the machine. It is
 * undefined until the daemon has answered once, and the rail draws no engine or mode until
 * then. A read that fails keeps what was known and tries again; nothing here ever
 * substitutes an engine of its own.
 */
let engine: AgentEngineId | null | undefined;
let mode: AgentPermissions | undefined;
const listeners = new Set<() => void>();

/** how long a failed read waits before it asks again */
export const AGENT_DEFAULTS_RETRY_MS = 2000;

function notify(): void {
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** A confirmed reading from any door that answers with the machine's mode. */
export function learnAgentMode(next: AgentPermissions): void {
	if (mode === next) return;
	mode = next;
	notify();
}

export function knownAgentMode(): AgentPermissions | undefined {
	return mode;
}

function learn(next: { preferred: AgentEngineId | null; mode: AgentPermissions }): void {
	if (engine === next.preferred && mode === next.mode) return;
	engine = next.preferred;
	mode = next.mode;
	notify();
}

export interface AgentDefaultsDeck {
	/** undefined until the first read lands; null when the daemon runs no engine at all */
	readonly engine: AgentEngineId | null | undefined;
	readonly mode: AgentPermissions | undefined;
	/** saves the pick and resolves with whether the daemon confirmed it */
	choose(engine: AgentEngineId): Promise<boolean>;
}

export function useAgentDefaults(project: string): AgentDefaultsDeck {
	const shown = useSyncExternalStore(
		subscribe,
		() => engine,
		() => undefined,
	);
	const shownMode = useSyncExternalStore(
		subscribe,
		() => mode,
		() => undefined,
	);
	// a setting moved somewhere on this machine, this page included: read the choice again
	const settings = useSettings(project);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a settings event is the cue to read again
	useEffect(() => {
		let live = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const read = () => {
			void fetchAgentDefaults(project).then((answer) => {
				if (!live) return;
				if (answer === undefined) timer = setTimeout(read, AGENT_DEFAULTS_RETRY_MS);
				else learn(answer);
			});
		};
		read();
		return () => {
			live = false;
			if (timer !== undefined) clearTimeout(timer);
		};
	}, [project, settings]);
	const choose = useCallback(
		async (next: AgentEngineId) => {
			const answer = await saveAgentEngine(project, next);
			if (answer === undefined) return false;
			learn(answer);
			return answer.preferred === next;
		},
		[project],
	);
	return { engine: shown, mode: shownMode, choose };
}
