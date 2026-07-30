import { WaitFrame } from "../../../shared/ui/spool-wait-rail";

/**
 * agent-wait--fact — the rest state carries a fact, so the object is always there and
 * always worth reading.
 *
 * **What it proposes.** The objection is to an object that appears. It may not be an
 * objection to an object that is always there *and is telling you something*. So this
 * take gives the always-present slot a job in both directions: while a request is out
 * it counts, `waiting 2.7s · 3 of 4`; between requests it totals, `7.6s waiting so far`;
 * and once the turn lands it keeps the two numbers this whole ticket is about, `13s turn
 * · 56% waiting`. Before anything has been asked it says `no turns yet`, which is a
 * fact too and the reason the slot is never blank.
 *
 * That 56% is not a design flourish. It is the measurement round one made and then had
 * nowhere to put: four real times to first token out of `claude-edits.json` — 1397,
 * 1684, 2682, 1809 — are 7,572ms of a 13,407ms turn. `none` loses that number
 * permanently; this is the only take that hands it back.
 *
 * **Where it lives, and why that turns out to be the finding.** The composer footer's
 * readout slot, beside the model name, because a fact is a readout and #122's own
 * reasoning put readouts here. The slot **reserves its widest sentence** rather than
 * sizing to whatever it currently says — #186's rule for a panel that opens upward,
 * applied sideways — because a readout that grew and shrank between the model and the
 * stop would be the up-and-down complaint again, turned ninety degrees.
 *
 * **And then the measurement kills it, which is what the meter is for.** #184 resolved
 * that row three weeks of tickets ago: the model wants 160, the stop 73, one gap, **243
 * at every rail width in the 200–480 range**, against 391 of box at 420 and **271 at
 * `RAIL_WIDTH`'s own 300**. The reserved sentence is twenty-two mono characters, and the
 * meter under this frame reads the whole row live rather than taking my word for it:
 * **389 of 391**. Two pixels, at the widest rail the agent ever gets. At the shipped
 * 300 it is 118 over its box, and since the fact is `shrink-0` and the model is what
 * truncates, the model pays every one of those pixels.
 *
 * That is the same shape of defect #184 was filed for and fixed: two readouts and a
 * control in one 18px line, where the second readout is the one that has to give. #184's
 * conclusion was that the limit had to leave this row *at every width*, not below a
 * threshold, and putting a sentence back into the slot it vacated is that decision run
 * backwards.
 *
 * Compare `agent-wait--mark`, which is the same row asked to hold fourteen pixels of
 * glyph and does it with room to spare at the narrowest rail. **The footer can hold a
 * mark and it cannot hold a sentence**, and that is not a taste call — it is 24px
 * against roughly 140, in a box that is 271 at the default.
 *
 * **So read this frame as an argument about the copy, not about the place.** Everything
 * proposed here about *what an always-present indicator should say* survives; where it
 * says it does not. The slot that has the room is `agent-wait--line`'s, at the
 * transcript's edge, which spends 24px of transcript nobody has measured a use for
 * instead of the last 140px of a row three tickets already fought over.
 *
 * **What it beats.** `mark`, on meaning — it is the only take that ever says what a
 * wait cost. `none`, on the same. It loses to `line` on nothing but pixels, and pixels
 * are enough.
 */
export default function WaitFactFrame() {
	return (
		<WaitFrame
			take="fact"
			title="fact · the rest state says what the last turn cost"
			claim="always there and always true: waiting 2.7s · 3 of 4, then 13s turn · 56% waiting. it reserves its widest."
			notes={[
				"389 of 391 at this rail: two pixels. at the shipped 300 rail's",
				"271px box it is 118 over, and the model pays all of it.",
				"#184 took the limit out of this row at every width; a reserved",
				"sentence is that defect walking back in. line's slot fits it.",
			]}
		/>
	);
}
