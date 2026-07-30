import { SpunFrame } from "../../../shared/ui/spool-spun-rail";

/**
 * agent-spun--pass — two strokes, and the direction is which way the wire is moving.
 *
 * One stroke runs left to right while something is **away from us**: a request up with nothing
 * back, or a tool call open. One runs right to left while something is **coming back**: words
 * arriving, or a result landing. They are the same stroke and they cross in the middle. That
 * is where the loom is in this — a shuttle passing one way and then the other is what winding
 * actually looks like — and it is why two strokes are not simply twice the noise of one.
 *
 * **This is the take that spends direction, and in three rounds nothing has spent anything but
 * rate.** It hands a reader something no word in the rail can: which end of the wire the turn
 * is at. Nothing has to be learned for it to work, because any stroke moving means working; a
 * reader who does notice gets `out` and `back` for free, told apart by nothing but which way
 * the eye is pulled.
 *
 * **Five states, which is the most in the round.** `out` is one stroke rightward. `doing` is
 * the same stroke at `passMs(load)`, so the rate is the backlog on `say-pace.ts`'s own shape.
 * `saying` is one stroke leftward, and it is the only drawing in four rounds of the return
 * trip. `thinking` runs both, because a thinking block is the one state where the request has
 * been answered and nothing is out there, and two strokes crossing is the honest picture of a
 * turn talking to itself. `asking` stops both nose to nose with 18px between them: the thread
 * has been carried to the middle from both ends and the join is yours to make.
 *
 * **Two costs, said plainly.** It is 840px of moving stroke against `wind`'s 420, the most of
 * any take on the top edge and twice what the seed take was already criticised for. And while
 * both strokes run, the moment they overlap is one longer stroke, so the two-ness of it is
 * legible either side of the crossing and not at it.
 */
export default function SpunPassFrame() {
	return (
		<SpunFrame
			take="pass"
			title="pass · direction is the state"
			claim="rightward while something is out there, leftward while something comes back, both while a thought is open, stopped nose to nose when it needs you."
			notes={[
				"five states off one property nothing has spent before.",
				"the only drawing in four rounds of the return trip.",
				"840px of moving stroke, twice the top edge and twice",
				"what rule was already criticised for.",
			]}
		/>
	);
}
