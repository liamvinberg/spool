import { RibbonFrame } from "../../../shared/ui/spool-ribbon-rail";

/**
 * agent-ribbon--spin — the nine strands as channels, with a thread running each of them. The
 * one drawing in the family that is literally the word.
 *
 * **The metaphor is the product's own vocabulary and not one imported to justify a logo.**
 * spool means winding thread. This product calls its conversations threads. `say-pace.ts`
 * already paces the words by the wire's own backlog. So "the agent is spinning a thread" is
 * what the thing is called, and until this frame no take had said it — which is the strongest
 * identity argument available and the reason this take exists even though it is the most
 * expensive one here.
 *
 * **How it works, and why it is a loop rather than a fill.** Every strand's subpath returns to
 * its own start point, so its outline is closed. A dash of fixed length running that closed
 * outline travels out along the strand and back along it, nine of them staggered 178ms apart.
 * The lengths are read off the browser with `getTotalLength()` and printed on the frame, so the
 * dash is 17% of each strand's *measured* outline rather than of a guess.
 *
 * **The loop is the answer to the sharpest risk in the brief.** A `pathLength` drawing is
 * where an indicator most easily lies: a line filling up reads as a percentage whether or not
 * anything knows one, and nothing in this rail knows how long a turn takes. This dash never
 * grows. It is 17% at every instant, there is no end to arrive at, and the thing that makes
 * the thread *appear* to be spun costs nothing in false certainty.
 *
 * **Direction is the state, which makes this the one take here whose state distinction is
 * geometric rather than a rate.** A thinking block is open and the nine laps stagger from
 * strand 8 up to strand 0 with the thread running the other way: the ribbon winds *in*. Words
 * or a result coming back and it runs 0 down to 8, paying *out*. Same rate, same 17%, opposite
 * sense. Winding and unwinding are one idea, so this is a second reading rather than a second
 * vocabulary — which is the test `--gerund` failed.
 *
 * That is worth pausing on, because thinking is the state with the worst numbers in the whole
 * map. It runs to 18 seconds, it carries a clock and a token estimate and **no text at all** —
 * 346 blocks across six captures, every one `"thinking": ""` — so there is nothing to read for
 * eighteen seconds and the only honest thing the rail can say is *still going, and going
 * inward*. A direction says that.
 *
 * **What it costs, and it is the number that ranks it below `wind` and `aperture`.**
 * `stroke-dashoffset` is a paint property. Chromium cannot hand it to the compositor, so nine
 * stroked paths repaint on every frame on the main thread, while every other take in this
 * family is opacity or translate on plain HTML elements. **The writes meter cannot see this**
 * and the frame says so rather than letting a zero flatter it: `alive-slot.ts` deliberately
 * ignores attribute mutations, because observing them would report ~800 for every transform
 * take and rank them identically, and a dash offset is an attribute. So the cost is stated,
 * printed under `compositor`, and taken on the chin.
 *
 * **Reduced motion holds each thread at the phase its own stagger would have put it in**,
 * which leaves nine short lit arcs stepping across a dim ribbon. A broken outline is not a
 * parked spinner and not a filled disc, so both halves of #161's trap are clear — but the two
 * directions freeze into two *mirrored* staircases, and a lean is a thinner distinction than a
 * shape. That is this take's real weakness beside `--count`, and the swatch row is where it
 * shows: park those four states and `count` keeps four pictures while this one keeps two and a
 * mirror.
 *
 * Monochrome, so it can be read beside `--rest` with only the mechanism differing.
 */
export default function RibbonSpinFrame() {
	return (
		<RibbonFrame
			take="spin"
			title="spin · a thread running each closed outline"
			claim="the product's own noun, drawn. a fixed 17% dash laps each strand: nothing fills, nothing arrives, and thinking runs it inward instead of out."
			notes={[
				"lengths read with getTotalLength() at mount, not computed.",
				"the dash never grows, so there is no percentage to misread.",
				"stroke-dashoffset repaints: nine paths, main thread, every frame.",
				"the writes meter cannot see that, so it is printed instead.",
			]}
		/>
	);
}
