import { AliveFrame } from "../../../shared/ui/spool-alive-rail";

/**
 * agent-alive--gerund — no mark at all. A rotating set of words, which is the mechanism behind
 * Claude Code's 186.
 *
 * **The vocabulary question, drawn on its own.** Every other take on this row settles the word
 * in a line and spends the frame on the mark. This one is the reverse: the words *are* the
 * take, and the candidate being tested is the one Liam's own reference points at — the list of
 * 186 gerunds `agent-wait-look` recovered from the binary (`Accomplishing … Zigzagging`,
 * `Thinking`, `Working`, `Clauding`). Five of them, verbatim and lowercased into this repo's
 * machine register, crossfading every 2.8 seconds.
 *
 * **Two measurements kill it and both needed a running frame to find.**
 *
 * *The cycle is longer than the wait.* 2800ms a word against a measured median time to first
 * token of 1970ms. In half of all real waits the set never rotates once, so the mechanism that
 * is the entire take is invisible in the median case, and what the person sees is one arbitrary
 * word that will be a different arbitrary word next time. The fastest measured wait, 878ms,
 * shows a third of one word's life.
 *
 * *And it is the only take here that is not actually always-present.* The word is a keyed
 * element, so every rotation destroys one and creates another — the exact churn round two spent
 * itself proving was the objection. The churn meter reads zero for it, because the marker sits
 * on the container the way every other take's does, and that is the honest limit of that
 * instrument: `alive-slot.ts` is what catches it, in the writes column and in a width step at
 * every swap.
 *
 * **What it would be good for, since it is not nothing.** Claude Code's list is charm, and charm
 * is a real thing to spend on a wait. But it is charm that requires either a very long wait or
 * a much shorter cycle, and a word changing every second in the corner of the eye is a second
 * kind of motion nobody asked for. The version of this that could work is the escalation rather
 * than the rotation: `thinking`, then `still thinking` once the wait is long enough to be
 * annoying, which is a state change on a real threshold rather than a carousel. That is not this
 * frame, and it needs the clock Liam has already turned down.
 */
export default function AliveGerundFrame() {
	return (
		<AliveFrame
			take="gerund"
			title="gerund · a rotating set, and no mark at all"
			claim="five of claude code's 186, lowercased into this register, crossfading every 2800ms. the words are the whole take."
			notes={[
				"2800ms a word against a 1970ms median wait: in half",
				"of all real waits the set never rotates once.",
				"the word is a keyed element, so every rotation makes",
				"and unmakes one. the writes column is what sees it.",
			]}
		/>
	);
}
