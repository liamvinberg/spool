import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writeAtomic } from "../atomic-write";
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
	defaults: engines,
	threads: z.record(z.string().refine(isThreadId), engines),
});

/** Accepted choices live beside the project's threads and move with them on rename. */
export function createAgentModelPreferences(spoolDir: string) {
	const file = (root: string) => join(threadsDir(spoolDir, root), "models.json");
	function read(root: string): z.infer<typeof preferences> {
		let raw: string;
		try {
			raw = readFileSync(file(root), "utf8");
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") return { defaults: {}, threads: {} };
			throw error;
		}
		// An unreadable preference file must never be overwritten with a fresh default.
		return preferences.parse(JSON.parse(raw));
	}
	return {
		read(root: string, thread: string, engine: AgentEngineId): AgentAsk {
			const saved = read(root);
			const held = saved.threads[thread]?.[engine];
			if (held !== undefined) return held;
			// Existing conversations still have their engine-owned model session.
			if (readThread(spoolDir, root, thread) !== undefined) return {};
			return saved.defaults[engine] ?? {};
		},
		keep(root: string, thread: string, engine: AgentEngineId, choice: AgentAsk, chosen = false): void {
			const saved = read(root);
			// A late model read cannot replace a choice made while it was in flight.
			if (!chosen && saved.threads[thread]?.[engine] !== undefined) return;
			const checked = ask.parse(choice);
			saved.threads[thread] = { ...saved.threads[thread], [engine]: checked };
			if (chosen) saved.defaults[engine] = checked;
			writeAtomic(file(root), `${JSON.stringify(saved, null, "\t")}\n`);
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
