/**
 * Who is on the canvas. Five people, and the agents four of them brought.
 *
 * A member's colour is identity data, not a token: it is the one hue that marks
 * everything that member or their agent does. Your own agent keeps the thread,
 * because from your chair it is the shipped hand and nothing about it changes.
 * You yourself have no colour here: from your own chair you are the pointer.
 */

export type MemberId = "you" | "ana" | "jonas" | "mira" | "theo";
export type ActorId = MemberId | `${MemberId}:agent`;

export interface Member {
	readonly id: MemberId;
	/** a person's name, said as a person would say it */
	readonly name: string;
	readonly initial: string;
	readonly color: string;
	/** the tool they brought, or none */
	readonly agent: "claude" | "codex" | null;
}

export const MEMBERS: Readonly<Record<MemberId, Member>> = {
	you: { id: "you", name: "You", initial: "Y", color: "var(--color-thread)", agent: "claude" },
	ana: { id: "ana", name: "Ana", initial: "A", color: "#6fa8ff", agent: "claude" },
	jonas: { id: "jonas", name: "Jonas", initial: "J", color: "#6fd394", agent: "codex" },
	mira: { id: "mira", name: "Mira", initial: "M", color: "#c39bff", agent: "claude" },
	theo: { id: "theo", name: "Theo", initial: "T", color: "#e9b949", agent: null },
};

export const ROSTER: readonly MemberId[] = ["ana", "jonas", "mira", "theo"];

export function isAgent(id: ActorId): id is `${MemberId}:agent` {
	return id.endsWith(":agent");
}

export function ownerOf(id: ActorId): Member {
	return MEMBERS[id.replace(":agent", "") as MemberId];
}

export function colorOf(id: ActorId): string {
	return ownerOf(id).color;
}

/**
 * An agent's name is machine text: the tool, then whose it is. Your own is just
 * the tool, the way the shipped rail names it.
 */
export function agentLabel(id: ActorId): string {
	const owner = ownerOf(id);
	return owner.id === "you" ? (owner.agent ?? "agent") : `${owner.agent ?? "agent"} · ${owner.id}`;
}

export function actorLabel(id: ActorId): string {
	return isAgent(id) ? agentLabel(id) : ownerOf(id).name;
}
