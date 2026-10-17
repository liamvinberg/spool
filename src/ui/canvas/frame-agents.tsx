import { type CSSProperties, useMemo, useSyncExternalStore } from "react";
import { SpinRing, StatusMark } from "../primitives/display";
import type { AgentCompanion } from "./agent-companion";
import type { PresenceRoom, Teammate } from "./presence";

/**
 * Agents at a frame, said on its name row (task 164): a turning ring and `working` while any
 * agent is at work there, the ring held still and `waiting` while one stopped to ask. Nothing
 * is drawn on or in the frame, so nothing moves with the zoom: the row holds one size on
 * screen, and as the frame gets narrow on screen the word goes and the ring stays.
 *
 * It replaced the companion squares (#366), which travelled the frame's walls and docked on
 * this row. One mark says the same thing at every zoom and every crowd.
 */
export interface FrameAgent {
	/** a teammate's presence colour; null for this canvas's own agent, or someone unheard of */
	readonly color: string | null;
	/** this canvas's own agent, which a wait is on you for */
	readonly own: boolean;
	readonly waiting: boolean;
	/** who it is and what it is doing, as hovering the mark says */
	readonly says: string;
}

export type FrameAgents = ReadonlyMap<string, readonly FrameAgent[]>;

export const NO_AGENTS: FrameAgents = new Map();

/**
 * Each frame or placeholder frame an agent is at, by name: this canvas's own turn's agents
 * and every teammate's their presence tells of. A designer holding only its placeholder is at
 * the placeholder's name.
 */
export function frameAgents(own: readonly AgentCompanion[], mates: readonly Teammate[]): FrameAgents {
	const at = new Map<string, FrameAgent[]>();
	const add = (name: string, agent: FrameAgent) => {
		const there = at.get(name);
		if (there === undefined) at.set(name, [agent]);
		else there.push(agent);
	};
	for (const one of own) {
		const name = one.frame ?? one.spot?.name;
		if (name === undefined) continue;
		const waiting = one.act === "ask";
		add(name, {
			color: null,
			own: true,
			waiting,
			says: `${one.name ?? "Your agent"}${waiting ? " · waiting on you" : ""}`,
		});
	}
	for (const mate of mates) {
		const agent = mate.left === null ? mate.state.agent : undefined;
		if (agent === undefined) continue;
		for (const one of agent.work) {
			const waiting = one.act === "ask";
			const step = waiting ? "waiting" : one.detail;
			add(one.frame, {
				color: mate.person.color,
				own: false,
				waiting,
				says: `${mate.person.name}'s agent${step === null ? "" : ` · ${step}`}`,
			});
		}
	}
	return at;
}

/**
 * The ring and its word, for the row it stands on. The row is a size container: under
 * 120px on screen it keeps the ring alone.
 */
export function FrameAgentsMark({ name, agents }: { name: string; agents: readonly FrameAgent[] | undefined }) {
	if (agents === undefined || agents.length === 0) return null;
	const waiting = agents.find((one) => one.waiting);
	const lead = waiting ?? agents[0];
	if (lead === undefined) return null;
	const word = waiting === undefined ? "working" : waiting.own ? "waiting on you" : "waiting";
	const tint = lead.color === null ? undefined : ({ color: lead.color } as CSSProperties);
	return (
		<span
			data-frame-agents={name}
			data-frame-agents-state={waiting === undefined ? "working" : "waiting"}
			title={agents.map((one) => one.says).join("\n")}
			className={`pointer-events-auto flex shrink-0 items-center gap-1 type-detail ${
				lead.color !== null ? "" : waiting === undefined ? "text-secondary" : "text-primary"
			}`}
			style={tint}
		>
			{waiting === undefined ? (
				<SpinRing className="size-3" />
			) : (
				<StatusMark status="waiting" className="[&>svg]:text-current" />
			)}
			<span className="hidden @min-[120px]/row:inline">{word}</span>
		</span>
	);
}

/** every frame's agents, kept with this canvas's turn and its teammates' presence */
export function useFrameAgents(room: PresenceRoom, own: readonly AgentCompanion[], team: boolean): FrameAgents {
	const heard = useSyncExternalStore(room.subscribe, () => (team ? heardWork(room.teammates()) : ""));
	return useMemo(
		() => (own.length === 0 && heard === "" ? NO_AGENTS : frameAgents(own, team ? room.teammates() : [])),
		[own, heard, room, team],
	);
}

/** what of the room this reads, as one string, so a pointer moving redraws nothing */
function heardWork(mates: readonly Teammate[]): string {
	const said = mates
		.filter((mate) => mate.left === null && mate.state.agent !== undefined && mate.state.agent.work.length > 0)
		.map((mate) => [mate.person.accountId, mate.person.color, mate.person.name, mate.state.agent?.work]);
	return said.length === 0 ? "" : JSON.stringify(said);
}
