import { EdgeFrame } from "../../../shared/ui/spool-edge-rail";

/**
 * agent-edge--ahead — the beat is the first beat of the entry it precedes.
 *
 * **What it proposes.** There is no wait object. The request going out *creates the
 * entry the request is for*, empty, with its own mark already turning; when the answer
 * lands the same entry fills in. Nothing is ever added between two things or taken out
 * from between them — an entry appears once, at the bottom, and only ever gains.
 *
 * The rail already has this shape and had it before this ticket. Every tool call gets
 * three beats: the block opens, the argument types itself in, the result lands. #165
 * drew a call cut mid-argument as "a bare verb with no subject" and needed no special
 * case for it, "beat one of the three every tool call already gets". This take adds a
 * beat zero — a mark with no verb yet — and the row is `h-[26px]` whether it holds
 * three words or none, so the fill-in cannot move a pixel.
 *
 * For a message rather than a row the stub is one line of `leading-base`, 20px, with
 * the mark in it. That is exactly the height the message's own first line takes, so
 * the first word lands where the mark was.
 *
 * **What it costs.** For a measured 0.9 to 4.0 seconds the log holds a mark with
 * nothing beside it, which is the unnamed turning spinner the complaint started with,
 * moved rather than fixed. The wait leaves no receipt afterwards. And it makes the log
 * briefly wrong about itself: a `read` row is on screen before the model has said it
 * is going to read anything, so if the answer turns out to be a message the stub was
 * pointing at the wrong kind of thing. This frame draws that case — the first wait
 * resolves into the agent's sentence, and the stub for it is a bare line.
 *
 * **What it beats.** `now`, `settle` and `footer` on surface count: it adds no object
 * to the rail at all, and the one line it does draw is a line that was going to exist
 * anyway. It loses to `settle` on naming and to `footer` on honesty about what is
 * known.
 */
export default function EdgeAheadFrame() {
	return (
		<EdgeFrame
			where="ahead"
			title="ahead · beat zero of the row it becomes"
			claim="the entry is created when the request goes out. a row is 26px empty or full, so filling in moves nothing."
			notes={[
				"rule: entries are created once and only ever gain. nothing is",
				"inserted between two rows and nothing taken out from between.",
				"cost: the mark is unnamed while it turns, for up to 4.0s.",
			]}
		/>
	);
}
