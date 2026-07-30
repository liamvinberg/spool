import { WaitFrame } from "../../../shared/ui/spool-wait-rail";

/**
 * agent-wait--mark — the spool ribbon, always there, turning while a request is out.
 *
 * **What it proposes.** Liam's own suggestion, taken literally: *maybe like spool logo
 * animating or something.* The mark is mounted when the rail opens and it is still
 * mounted when the rail closes. It never enters and it never leaves. What changes is
 * that it turns, and that it is the brand's red while it is turning and the footer's
 * grey when it is not. Zero enters, zero leaves, on screen 100% of the turn — the meter
 * beside it says so, and it says the same thing before the first keystroke.
 *
 * **Where it lives, which is the half of this the suggestion did not answer.** The
 * composer footer, leading the row, because that row is the only surface in the rail
 * that is already permanent, already 18px, and already about the state of the machine
 * rather than about the conversation. It is also where the stop already is, so the two
 * things that mean *a turn is running* end up in one place instead of two.
 *
 * **What it costs there, to the pixel, and this is the number that decides whether it
 * can live in the footer at all.** #184 measured that row down to the character: the
 * model wants 160, the stop 73, one 10px gap between them, **243 at every rail width
 * from 200 to 480**, with no threshold and no ladder. The rail's box is the width less
 * 29px of composer padding, so 391 at the shipped-for-agent 420 and **271 at
 * `RAIL_WIDTH`'s own 300**. The mark is 14px plus a 10px gap, so the row becomes 267 —
 * the meter under this frame reads it live rather than taking my word for it.
 *
 * Which means: it fits at 420 with 124 to spare, and it fits at 300 with **four pixels**
 * to spare. It does not break the footer, and it eats very nearly all of the margin
 * #184 bought by moving the limit out — the model starts truncating at a rail of about
 * 284 instead of 260. That is the whole cost, and it is small because a glyph is small.
 * `agent-wait--fact` is the same slot asked to hold a sentence, and it is where this
 * stops being true.
 *
 * **What is deliberate about how it turns.** It is not a `repeat: Infinity` keyframe. A
 * rotation animating back to zero visibly runs the logo backwards when the answer
 * lands, and a class toggled off snaps it upright in a single frame — both of which are
 * the appearing-and-disappearing problem again, moved from the DOM into a property. So
 * the angle is driven by hand and the *rate* is what eases: it spins up over about a
 * quarter of a second, and when the answer lands it slows to a coast and keeps going
 * until it is upright, then stops. It never reverses, and it never parks crooked, which
 * a mark with a shape has to care about and a ring does not. Watch the frame rest
 * between turns: that is the state it is in most of the time.
 *
 * **What is honestly wrong with it.** It says nothing. It is the unnamed turning mark
 * the whole complaint started with, wearing the logo — and the one thing round one
 * agreed on is that an unlabelled spinner is the weakest object in this rail, because
 * every other row is a verb and a subject. It also puts the brand in the position of
 * reporting on the machine, which is a decision about the brand and not only about the
 * rail: from here on the logo means *working*, everywhere, or it means nothing anywhere.
 * And **nothing found in the research does this** — of the surfaces read at the source,
 * not one uses its own brand mark as a loading state.
 *
 * **What it beats.** `none`, on the one thing `none` cannot answer: for 56% of a turn
 * there is now something alive in the rail, and it costs 24 pixels of a row that had
 * 148 spare. It loses to `line` on saying what it means.
 */
export default function WaitMarkFrame() {
	return (
		<WaitFrame
			take="mark"
			title="mark · the ribbon, always there, only ever turning"
			claim="one element for the life of the rail. it changes speed and colour and never its box, so nothing can move."
			notes={[
				"#184's row wants 243 at every width. the mark makes it 267, so",
				"it clears the shipped 300 rail's 271px box by four pixels and",
				"moves the model's truncation from a 260 rail to about 284.",
				"cost: it is still an unnamed spinner, and it is now the logo.",
			]}
		/>
	);
}
