import { QuietFrame } from "../../../shared/ui/spool-quiet-rail";

/**
 * agent-quiet--receipt — one settled line per turn, where the two beats used to be nine.
 *
 * **What it proposes.** `gone`, plus a boundary. When the turn lands, one line lands with
 * it under the last row: `waited 16.6s · thought 22.2s · worked 8.7s`. Nothing before that
 * moment. No beat while a request is out, no row per thinking block, and no clock ticking
 * anywhere in the log.
 *
 * **It is drawn as a rule rather than as a row**, and that is the only real design
 * decision in the frame. It gets no mark and no verb, and a hairline runs from the left
 * edge to meet it, on #199's shape for the wind-down note — because a mark is spool
 * saying a call happened, and nothing happened here. A receipt with a check on it would
 * read as a ninth tool call whose subject is three numbers.
 *
 * **What it buys.** Exactly what `now` bought, minus the noise. This turn's two beats put
 * nine rows in the log across eight requests — four thoughts and five splices — and each
 * of them held one number about itself. This is one row holding all of it, at the one
 * moment anybody would want to read it, in a place scrollback keeps. `agent-think--gone`
 * asked for exactly this and could not draw it, because its script never ended: "if that
 * time matters it belongs to the run's own summary rather than to seven separate lines,
 * which is what the three `run-` frames on this row are for, and none of them currently
 * carries it."
 *
 * **Does anybody want it. Here is the honest answer, and it is a qualified yes.** It is
 * worth its one row exactly when somebody reads a turn back and asks why it took so long,
 * which is a real thing developers do and the reason `thinking 18s` was tolerated in the
 * first place. It is not worth it if the number never gets acted on, and there is a
 * warning sign that it might not: the split has no remedy attached to it. `waited 16.6s`
 * is the network and the queue, `thought 22.2s` is the effort level, `worked 8.7s` is the
 * repo — three numbers with three different owners and no next step in the rail. #122's
 * usage window earned its slot by sitting next to the model switch, which is its remedy.
 * This has none, so if it ships it should ship expecting to be measured for whether
 * anybody ever presses anything after reading it.
 *
 * **What it costs.** One row per turn, which is the cheapest version of the cost `now`
 * pays nine times. And a small dishonesty risk the frame is careful about: the three
 * numbers must be capture time, never replay time, or the receipt is a receipt for the
 * animation. Tool time is unioned per answer rather than summed for the same reason.
 *
 * **What it beats.** `clock`, if the record has to survive the next send. What it loses to
 * `clock` on is that the line above the composer could have carried the same three numbers
 * for nothing.
 */
export default function AgentQuietReceiptFrame() {
	return (
		<QuietFrame
			take="receipt"
			title="receipt · one settled line at the boundary"
			claim="nine beats become one row, drawn as a rule and not as a call."
			after="Yes, and durably: the line is in scrollback next week. One row per turn against nine. The open question is not whether it reads well, it is whether anybody ever acts on it."
			notes={[
				"no mark and no verb: a check would make it a ninth tool call.",
				"capture time, never replay time, or it receipts the animation.",
			]}
		/>
	);
}
