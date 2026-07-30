import { WispFrame } from "../../../shared/ui/spool-wisp-rail";

/**
 * agent-wisp--reel — an anchor that never moves, and three threads paying off it.
 *
 * The first of the two new mechanisms on this row, and the only drawing in five rounds where
 * something is stationary on purpose. A 1.5px core down the left edge is the thing being wound;
 * it is present at every state and every strength, so the mark has a constant identity that no
 * state can take away. The three threads leaving it are the work.
 *
 * **The taper is in the lengths rather than in a shape.** Their maximum runs are three of the
 * mark's own sampled spans — long, short, long — so the cascade reads out of three threads at
 * three different reaches, and nothing had to be invented to get it.
 *
 * **It cannot imply progress, which is the trap this metaphor always falls into.** Round four's
 * `--wound` laid nine strands down in order and was drawn only to be killed for exactly that:
 * nine discrete steps filling in a fixed order is a nine-segment progress bar, and nothing in
 * this rail knows how long a turn takes. Here the threads do not fill toward a complete state.
 * Each pays out and draws back continuously on its own 180ms stagger, so no arrangement is further
 * along than another and there is no fraction to read.
 *
 *   idle      three threads drawn most of the way in, dim. The thread is on the reel.
 *   sent      drawn all the way in and quivering at the root. The core, and nothing off it —
 *             which is the honest picture of a request that has gone up with nothing back.
 *   working   paying out and back, staggered, at three different reaches.
 *   parked    all three fully out, still, in the accent.
 *
 * **Freeze it and four pictures survive**, and they are the most different four on the row: a bare
 * vertical tick, three short threads, three at three staggered lengths, three full ones in red.
 * The bare core is the one that earns the take — every other family here draws `sent` as a smaller
 * version of `working`, and this draws it as the spool with nothing on it.
 */
export default function WispReelFrame() {
	return (
		<WispFrame
			take="reel"
			title="reel · a core that stays, and thread paying off it"
			claim="a 1.5px core is the constant, and three threads at three of the mark's own reaches are the work. sent is the core with nothing off it."
			notes={[
				"the one drawing here with something stationary in it, and that is the identity.",
				"no progress: each thread pays out and back, nothing fills in order.",
				"freeze it and four shapes survive, the bare core being the sharpest of them.",
				"four elements, zero writes, scaleX and one opacity.",
			]}
		/>
	);
}
