import { SpunFrame } from "../../../shared/ui/spool-spun-rail";

/**
 * agent-spun--slack — the thread has weight, so it bows under what it is carrying.
 *
 * The most literal reading of the identity anywhere in four rounds, and nobody had drawn it.
 * At rest the line is dead straight and **is** the composer's border. When the wire has work
 * away from it the line sags, and the depth is the backlog: a request out is a 2.7px bow, a
 * request and two open calls is the full 8px, a thinking block is a steady 4.4px of its own.
 * When work lands, the line comes back up.
 *
 * **Its whole motion budget is 8px, vertical, about ten times a turn.** Against `wind`'s
 * 420px of lateral travel every 1.6 seconds, and against `pass`'s 840. That is the
 * proposition rather than a saving: a loaded thread does not have to move to say it is
 * loaded, it has to be **bent**. What a reader catches out of the corner of their eye is the
 * *transition* — the line dipping as a request goes up, lifting as it lands — which is a
 * movement that means something rather than a loop that means the loop is running.
 *
 * **It is the only take in the round that cannot imply progress at all**, and that is
 * unarguable rather than argued: depth is not a length, there is no track to be some way
 * along, and the quantity it draws goes *up* as more work opens. Nothing about it points at
 * an end.
 *
 * **The fallback is the take.** Under `prefers-reduced-motion` the bow is drawn at the same
 * depth and simply does not ease into it — the same picture everybody else sees. No other
 * take here can say that, and #161's trap cannot be sprung, because nothing else in this rail
 * is a curve.
 *
 * **Two honest costs.** The path is a 40-point polyline rewritten in place while the depth
 * moves, so it is main-thread work rather than a composited transform; it is bounded, because
 * it writes only while the depth is changing, so a 3-second thought is zero writes and a
 * whole turn is about 250. And a single long thinking block holds one shape for its whole
 * length: this is the take a reader could accuse of being still. Its answer is that a curve
 * is not the resting shape, so being still is not being idle.
 */
export default function SpunSlackFrame() {
	return (
		<SpunFrame
			take="slack"
			title="slack · the thread bows under the load"
			claim="flat is the border and the border is idle. the sag is the backlog: 2.7px for a request out, 8px for a request and two open calls."
			notes={[
				"8px of vertical motion against wind's 420px lateral.",
				"the only take here that cannot imply progress at all,",
				"and the only one whose fallback is the take itself.",
				"the writes meter reads 0 and cannot read otherwise:",
				"alive-slot.ts does not observe attributes, by its own",
				"design, and this path is an attribute. ~250 a turn.",
			]}
		/>
	);
}
