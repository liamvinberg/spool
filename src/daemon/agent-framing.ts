import { skillText } from "../skill";

/**
 * What spool appends to every engine's system prompt (#138): a few lines saying what the
 * agent is for, then `spool skill`'s overview.
 *
 * They say what the agent is for and forbid nothing: #121 left writes outside `design/`
 * possible on purpose, so a prompt that closes them contradicts the fence rather than
 * completing it. Each engine says its own boundary paragraph (`asks`), because what asks
 * first is the engine's, and its own line about designers, because where the designer
 * lives is the engine's too.
 */
export interface FramingOptions {
	/** the engine's paragraph on what asks the human first and what never does */
	readonly asks: string;
	/** the engine's line about bringing in designers */
	readonly designer: string;
	/** the chosen mode is Full access, so nothing asks and the framing says so first */
	readonly bypass: boolean;
	/**
	 * Tell the agent to read the project's own CLAUDE.md or AGENTS.md: the price of an
	 * engine whose spawn keeps the project's settings, and its memory with them, out.
	 */
	readonly memory: boolean;
}

/**
 * Said first under bypass, because there the allow rules and the sandbox decide nothing:
 * the framing is what stands in for the ask.
 */
export const BYPASS_FRAMING =
	"Permissions are bypassed on this machine, by the developer's own setting: nothing you do asks first, so say what you are about to do outside design/ before you do it.";

const INTRO = `You are the agent inside Spool, a live prototyping canvas. The human is looking at
frames on that canvas and talking to you from a rail beside them.

The canvas is design/. Its contract is below; \`spool skill <topic>\` gets you depth
on any part of it.

What the human has selected arrives in their message inside a <selection> block.
That is what "this" and "that" mean.

Sum up designers' work in a short list, not a table: the rail already shows a tile per frame.`;

const MEMORY = `Read the project's own CLAUDE.md or AGENTS.md before your first change. Spool does
not load it for you.`;

/**
 * The framing plus the skill overview, which is a call into the same function
 * `spool skill` answers with rather than a second copy to keep in sync.
 *
 * Only the overview goes in, not the seven topics: 860 tokens against 6,170, and
 * a thread that renames one frame would pay for topics it never opens. The
 * overview's last section is the topic index, so the agent fetches exactly the
 * one it wants. Identical bytes on every spawn, so it caches.
 */
export function framing({ asks, designer, bypass, memory }: FramingOptions): string {
	const lines = [INTRO, ...(memory ? [MEMORY] : []), asks, designer].join("\n\n");
	const framed = `${lines}\n\n---\n\n${skillText()}`;
	return bypass ? `${BYPASS_FRAMING}\n\n${framed}` : framed;
}
