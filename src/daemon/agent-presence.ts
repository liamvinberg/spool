import {
	PRESENCE_AGENT_WORDS,
	PRESENCE_AGENT_WORK,
	PRESENCE_NAME,
	type PresenceAgent,
	type PresenceAgentWork,
	readPresenceAgent,
} from "../team-sync-protocol";
import { type Stamped, type Transcript, transcriptOf } from "../ui/canvas/agent-transcript";
import type { AgentHeld } from "./agent-live";

/**
 * A person's agent, said to their team through presence (#378).
 *
 * While a turn runs on a team project, its daemon folds the turn's log the way the rail does
 * and says the little a teammate's canvas draws of it: whether it is at work, its one status
 * line, and where each of its agents is and what it is doing there, a designer in its
 * placeholder frame or any agent at a frame that stands. It rides the person's presence, so
 * a teammate hears it only while that person's canvas is open on the project, and it is
 * said at most once a second however fast the turn talks.
 */

/** how often a running turn's agent is said again, at most */
export const AGENT_PRESENCE_MS = 1_000;

function cut(text: string): string {
	return text.length <= PRESENCE_AGENT_WORDS ? text : `${text.slice(0, PRESENCE_AGENT_WORDS - 1)}…`;
}

/** What a turn's transcript says of its agent to the team; null once the turn is over. */
export function presenceAgentOf(
	transcript: Pick<Transcript, "over" | "foot" | "asking" | "companions">,
): PresenceAgent | null {
	if (transcript.over) return null;
	const work: PresenceAgentWork[] = [];
	const at = new Set<string>();
	const add = (one: PresenceAgentWork) => {
		// a name too long to say is left out rather than costing the rest
		if (at.has(one.frame) || work.length >= PRESENCE_AGENT_WORK || one.frame.length > PRESENCE_NAME) return;
		at.add(one.frame);
		work.push(one);
	};
	// a designer in its placeholder, which a teammate's canvas draws its work inside
	for (const tile of transcript.foot?.tiles ?? [])
		if (tile.state === "reading" || tile.state === "drawing")
			add({
				frame: tile.frame,
				act: tile.state,
				detail: tile.step === undefined ? null : cut(tile.step),
				lines: tile.lines,
			});
	// an agent at a frame that stands, which a teammate's canvas draws as its companion
	for (const one of transcript.companions)
		if (!one.own && one.frame !== null) add({ frame: one.frame, act: one.act, detail: null, lines: one.lines });
	const status = transcript.foot?.status ?? null;
	// read back as a teammate reads it: whatever would not fit is not said
	return (
		readPresenceAgent({
			running: transcript.asking === null,
			status: status === null ? null : cut(status),
			work,
		}) ?? null
	);
}

/** The agents of every turn running on one project, as one: their work together, and the latest status. */
function together(agents: readonly PresenceAgent[]): PresenceAgent | null {
	if (agents.length === 0) return null;
	const last = agents[agents.length - 1] as PresenceAgent;
	if (agents.length === 1) return last;
	return {
		running: agents.some((one) => one.running),
		status: [...agents].reverse().find((one) => one.status !== null)?.status ?? null,
		work: agents.flatMap((one) => one.work).slice(0, PRESENCE_AGENT_WORK),
	};
}

export interface AgentPresence {
	/** follow a turn held on a team project, saying its agent until it ends */
	follow(held: AgentHeld): void;
}

export function createAgentPresence({
	publish,
	everyMs = AGENT_PRESENCE_MS,
}: {
	/** what a project's agents are now, or null once none runs there */
	publish: (root: string, agent: PresenceAgent | null) => void;
	everyMs?: number;
}): AgentPresence {
	/** each project's running turns and what each last said */
	const roots = new Map<string, Map<AgentHeld, PresenceAgent | null>>();
	const tell = (root: string) => {
		const turns = roots.get(root);
		const agents = [...(turns?.values() ?? [])].filter((one): one is PresenceAgent => one !== null);
		publish(root, together(agents));
	};
	return {
		follow(held) {
			const turns = roots.get(held.root) ?? new Map<AgentHeld, PresenceAgent | null>();
			roots.set(held.root, turns.set(held, null));
			const seen: Stamped[] = [];
			let timer: ReturnType<typeof setTimeout> | undefined;
			let last = 0;
			const fold = () => {
				timer = undefined;
				last = Date.now();
				turns.set(held, presenceAgentOf(transcriptOf([], seen)));
				tell(held.root);
			};
			void (async () => {
				try {
					for await (const { event } of held.watch(0)) {
						seen.push({ at: Date.now(), event });
						timer ??= setTimeout(fold, Math.max(0, last + everyMs - Date.now()));
					}
				} finally {
					if (timer !== undefined) clearTimeout(timer);
					turns.delete(held);
					if (turns.size === 0) roots.delete(held.root);
					tell(held.root);
				}
			})();
		},
	};
}
