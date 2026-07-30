import { RibbonFrame } from "../../../shared/ui/spool-ribbon-rail";

/**
 * agent-ribbon--count — which strands are lit is the state. Four states, four shapes, one
 * grammar.
 *
 * **This is the answer to the second half of Liam's question — "maybe different for when
 * thinking, waiting, working?" — with shape instead of speed.** Every other take on this row,
 * and all ten of round three's, encodes state as a rate or as a word. Nine addressable strands
 * are the first thing this map has had that can encode it as a *picture*, and a picture is the
 * only kind of distinction that survives having the motion turned off.
 *
 * The grammar is one sentence: a state is a **set** of strands, and inside a set the members
 * trade strength against each other. Same trade everywhere, different set each time.
 *
 *   sent      the waist only. Strands 4 and 5 trade over 1,400ms; the other seven sit at 0.08.
 *             The mark is at its thinnest, which is the point — the request is out, nothing has
 *             come back, and that is the least the rail has ever known. It now looks like the
 *             least. This is the beat `agent-transcript.ts:1123` draws today with no name on it.
 *   thinking  the waist blooms. The set is all nine, grouped into rings by distance from strand
 *             5, so the ribbon opens outward from its middle and closes again over 1,800ms.
 *             Nothing travels; it widens. Which is the one honest thing to say about a state
 *             that runs to 18 seconds and carries no text at all.
 *   working   all nine, odd against even, 1,100ms. The fullest the mark ever is while moving.
 *   parked    all nine at full strength and completely still, in the accent.
 *   idle      all nine at 0.24, still. The logo, quiet.
 *
 * **`saying` and `tooling` are one drawing on purpose, and the frame's own dwell meter is the
 * argument.** Words are arriving for roughly a third of a second out of this turn's 13.4. A
 * state live for 2% of a turn cannot hold its own picture however good the picture is, because
 * the reader never sees it settle — which is the measurement that killed `--gerund` and
 * `--breathe`, applied to a state instead of to a cycle. What the reader needs is whether
 * something is coming back, and for both of those it is yes.
 *
 * **The accent is spent once and given back, and this is the B side of the question `--rest`
 * asks.** Red appears in this rail only when a person has to act, and leaves when they do. So
 * it competes with the selection's own red for exactly as long as the thing it is calling you
 * to, which is competing on purpose. #161 settled that being the loudest of the three readings
 * is right rather than a cost for precisely this state, because it is the only one that is
 * actually stuck.
 *
 * **The fallback is where this take wins rather than where it concedes.** Freeze `--wind`,
 * `--aperture` or `--rest` and every state collapses into one picture at two strengths, because
 * their states were rates. Freeze this one and all four survive: two lit strands, a static bell
 * around the waist, an odd-even comb, and a full red ribbon. Four different still pictures, none
 * of them a parked spinner and none of them a filled disc, which is both halves of the trap
 * #161 found. The swatch row on the frame draws all of them.
 *
 * **The honest cost.** It is four things to learn instead of one, and nobody explains it. The
 * defence is that they are not four arbitrary symbols but one shape with four amounts of itself
 * lit, ordered from thinnest to fullest, so the ordering carries most of the meaning even for
 * someone who never works out the rule — thin means early, full means busy, still and red means
 * you. Whether that is enough is the thing to judge from the frame rather than from this
 * paragraph.
 */
export default function RibbonCountFrame() {
	return (
		<RibbonFrame
			take="count"
			title="count · the lit set is the state, and it is a shape"
			claim="waist only while the request is out, blooming outward while it thinks, all nine while work comes back, full and still and red when it needs you."
			notes={[
				"one grammar: a set of strands trading strength. four sets.",
				"saying folds into working on the dwell, not on taste: 0.3s of 13.4s.",
				"freeze it and all four states survive as four different pictures.",
				"red arrives when a person must act and leaves when they do.",
			]}
		/>
	);
}
