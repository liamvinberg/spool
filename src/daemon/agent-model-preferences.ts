import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writeAtomic } from "../atomic-write";
import type { AgentDefaults } from "./agent-defaults";
import type { AgentEngine, AgentEngineId } from "./agent-engine";
import { type AgentAsk, type AgentOffer, isEffortShaped, isModelShaped } from "./agent-offer";
import { isThreadId, readThread, threadsDir } from "./agent-threads";

const ask = z
	.object({
		value: z.string().refine(isModelShaped).optional(),
		effort: z.string().refine(isEffortShaped).optional(),
	})
	.transform(
		(choice): AgentAsk => ({
			...(choice.value === undefined ? {} : { value: choice.value }),
			...(choice.effort === undefined ? {} : { effort: choice.effort }),
		}),
	);
const engines = z.object({ claude: ask.optional(), spool: ask.optional() });
const preferences = z.object({
	/** read once by the #361 migration; the machine's choice lives in agent defaults now */
	defaults: engines.optional(),
	threads: z.record(z.string().refine(isThreadId), engines),
});

/**
 * A started thread's accepted choice lives beside the project's threads and moves with them
 * on rename. A thread with no model session yet reads the machine's choice, whatever an
 * earlier model read left for it, so a stale blank thread never pins an old pick.
 */
export function createAgentModelPreferences(spoolDir: string, defaults: AgentDefaults) {
	const file = (root: string) => join(threadsDir(spoolDir, root), "models.json");
	function read(root: string): z.infer<typeof preferences> {
		let raw: string;
		try {
			raw = readFileSync(file(root), "utf8");
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") return { threads: {} };
			throw error;
		}
		// An unreadable preference file must never be overwritten with a fresh default.
		return preferences.parse(JSON.parse(raw));
	}
	return {
		read(root: string, thread: string, engine: AgentEngineId): AgentAsk {
			// Existing conversations keep what they started on, or the engine's own session state.
			if (readThread(spoolDir, root, thread) !== undefined) return read(root).threads[thread]?.[engine] ?? {};
			return defaults.model(engine);
		},
		keep(root: string, thread: string, engine: AgentEngineId, choice: AgentAsk, chosen = false): void {
			const saved = read(root);
			// A late model read cannot replace a choice made while it was in flight.
			if (!chosen && saved.threads[thread]?.[engine] !== undefined) return;
			const checked = ask.parse(choice);
			saved.threads[thread] = { ...saved.threads[thread], [engine]: checked };
			writeAtomic(file(root), `${JSON.stringify(saved, null, "\t")}\n`);
			if (chosen) defaults.setModel(engine, checked);
		},
	};
}

/** Save the complete accepted selection, with the engine still enforcing supported levels and pins. */
export function acceptedModelChoice(engine: AgentEngine, offer: AgentOffer, held: AgentAsk): AgentAsk {
	return engine.choice(
		offer,
		{
			...(offer.current.value === null ? {} : { value: offer.current.value }),
			...(offer.current.effort === null ? {} : { effort: offer.current.effort }),
		},
		held,
	);
}
