import { RibbonFrame } from "../../../shared/ui/spool-ribbon-rail";

/**
 * agent-ribbon--wind — a crest of strength travelling the nine strands of the real mark, with
 * the backlog as its amplitude rather than its rate.
 *
 * **This is the reference take, and the point of it is that nothing is abstracted.** The path
 * is `SPOOL_MARK_PATH`, split on its own `M` commands into the nine strands it has always
 * been, and `STRANDS.join(" ")` is still byte-identical to the identity. That is the whole
 * difference from `agent-alive--fold`, which drew three hairlines "out of the ribbon's
 * silhouette" and is exactly what Liam was reacting against: the shape was spool's and the
 * mark was not.
 *
 * **What the nine strands buy that three bars could not.** An order, a taper, and a waist.
 * The spans run 395, 416, 321, 224, 180, 165, 269, 392, 446 units, so the shape narrows for
 * six strands and opens again for three, and a wave crossing it is read against a silhouette
 * the eye already knows rather than against nothing.
 *
 * **The backlog sets amplitude, and that is the one number separating this from `--churn`.**
 * That take's honest risk was written into its own comment: 18 seconds of thinking at a
 * backlog of one draws a shuttle crossing every 1.2 seconds, and slow is what a hung process
 * looks like. Here the period is nailed to 1,170ms in every state — comfortably inside the
 * 1,970ms median wait, so half of all real waits see a whole pass — and the *depth* of the
 * wave carries the load. One request out and the crest is faint. Three calls open and it is at
 * full strength. Nothing can read as stuck and nothing can read as frantic, because the rate
 * is not a variable.
 *
 * The amplitude rides a **parent** element's opacity rather than the keyframes, so a call
 * opening mid-pass fades the whole mark up without restarting the crest. Round three had no
 * take whose rate could change without the animation jumping; one extra element is what that
 * costs.
 *
 * **On the state question it takes the modest position and says so.** Three states: working,
 * parked, idle. It argues that `sent`, `thinking`, `saying` and `tooling` are one thing to a
 * reader — something is out — with the load visible inside that one thing as depth. What it
 * does *not* do is draw four rates, because four rates is a vocabulary and the row already
 * learned from `--gerund` that a vocabulary nobody has time to read is not information.
 *
 * **Parked is drawn, because it is the one distinction that earns a different picture.** #161
 * settled that: everything else is the agent working and only this is a call to act. So the
 * wave stops dead and the whole ribbon holds at full strength. It is the only state in this
 * take where nothing moves, which is the honest reading — nothing *is* moving, and it is
 * waiting on you.
 *
 * **Reduced motion draws the crest frozen at one phase**: a nine-step ramp from strand 0
 * bright to strand 8 dim. That is not a spinner parked and not a filled disc, so it clears
 * both halves of #161's trap, and it is a picture nothing else in this rail makes.
 *
 * Monochrome on purpose. The accent question is answered by `--rest` and `--count`; this take
 * is the control, and it is here to show what the mark reads like with the red left to the
 * selection.
 */
export default function RibbonWindFrame() {
	return (
		<RibbonFrame
			take="wind"
			title="wind · the crest travels, the backlog is its depth"
			claim="the real nine-strand path, a 1170ms crest, and the load as amplitude. the rate never changes, so nothing can read as hung."
			notes={[
				"9 strands, byte-identical to SPOOL_MARK_PATH when rejoined.",
				"opacity of nine html elements: nothing repaints, nothing lays out.",
				"reduced motion is the wave frozen: a nine-step ramp, which is",
				"neither a parked spinner nor a filled disc.",
			]}
		/>
	);
}
