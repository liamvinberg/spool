import { randomUUID } from "node:crypto";
import { drawableEntries, settledPicture, transcriptOf } from "../ui/canvas/agent-transcript";
import type { AgentEnded, AgentEvent } from "./agent-events";
import { readThread, type StoredThread, writeThread } from "./agent-threads";

/** Use the same transcript fold as the rail, even when no viewer is there to save it. */
export function agentPictureEnding(
	spoolDir: string,
	root: string,
	thread: StoredThread,
): (events: readonly AgentEvent[]) => void {
	const before = drawableEntries(thread.entries).slice(0, thread.kept);
	const turn = randomUUID();
	return (events) => {
		const latest = readThread(spoolDir, root, thread.id);
		if (!latest) return;
		const shown = transcriptOf(
			[],
			events.map((event) => ({ event, at: event.elapsed ?? 0 })),
		);
		const entries = [
			...before,
			...settledPicture(shown.entries).map((entry) => ({ ...entry, key: `${turn}:${entry.key}` })),
		];
		let recovery = latest.recovery ?? null;
		let ending: AgentEnded["ending"] | null = null;
		for (const event of events) {
			if (event.kind === "ended") ending = event.ending;
			if (event.kind === "closed") ending ??= event.code === 0 ? "done" : "failed";
			if ((event.kind === "ended" || event.kind === "closed") && event.recovery !== undefined)
				recovery = event.recovery;
			if (event.kind === "ended" && (event.ending === "done" || event.ending === "stopped")) recovery = null;
		}
		try {
			writeThread(spoolDir, root, {
				...latest,
				entries,
				kept: entries.length,
				plan: shown.plan ?? latest.plan,
				life: recovery ? "waiting" : "unread",
				at: Date.now(),
				stopped: false,
				recovery,
				ending,
				pending: recovery ? (latest.pending ?? []) : [],
			});
		} catch {
			// The held turn stays available for reconnect even if its durable save fails.
			console.error("Could not save the completed agent turn");
		}
	};
}
