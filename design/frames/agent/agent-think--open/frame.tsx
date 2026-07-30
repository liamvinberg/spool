import { ThinkFrame } from "../../../shared/ui/spool-think-rail";

/**
 * agent-think--open — the thinking beat opens, and holds everything the wire has.
 *
 * The literal reading of the request. `thinking 18s` gets a chevron, and behind it
 * is every field a thinking block has ever carried that the row is not already
 * printing: how many estimated tokens, and the tokens over the clock. Two lines and
 * a third saying there is no third.
 *
 * The elapsed time is deliberately not repeated inside. The row you pressed is still
 * on screen holding it, and a disclosure whose first line is the line above it is a
 * disclosure with one line in it.
 *
 * **The max height is not a policy here, it is a fact.** A thought has a fixed
 * number of fields, so the panel has a fixed number of lines and exactly one
 * height at every rail width — printed under the frame rather than asserted. Nothing
 * can grow inside it, so nothing needs to be capped, clamped or scrolled. That is
 * the strongest thing this take has and it is worth saying plainly: the request
 * asked for a maximum and the honest answer is that the content already has one.
 *
 * **Where the numbers come from, and the one that does not exist yet.** The elapsed
 * clock is drawn today. The token count is on the wire — `agent-events.ts:105`
 * carries `tokens` on every thinking delta as a running estimate — and it is thrown
 * away where it lands: `agent-transcript.ts:400` defines a beat as `{ key, state,
 * verb, since, until }` and there is no field for it. So this frame is proposing one
 * new field on an existing object, not a new source of data. The rate is arithmetic
 * over the two. Nothing here needs a wire change and nothing here can ever say what
 * the model was thinking.
 *
 * **The live thought opens itself**, on #117's rule for a screenshot: the turn may
 * open a disclosure when the thing behind it is the thing you are waiting on. A
 * settled one stays shut, because a finished thought's numbers stopped moving and
 * nobody re-reads them.
 *
 * **The signature is not drawn.** `agent-claude.ts:466` says a settled thinking
 * block carries an empty string and a signature, and that signature is real, is the
 * only other field on the object, and is a base64 receipt for the model's own
 * bookkeeping. Printing it would be honest and useless in one gesture, which is a
 * good description of the risk this whole take runs.
 *
 * **What it costs.** Every thinking beat in the transcript now carries an
 * affordance, and the affordance is the same three numbers every time. Open it once
 * and you have opened it forever. The panel also grows the run by its own height on
 * whichever row is live, so on the frames next door — where the argument is that the
 * run is already too tall — this take makes the tallest object in the transcript
 * taller. And the line `no text on the wire` is spool apologising for the model, in
 * a rail that has never apologised for anything.
 *
 * **What it beats.** Nothing yet. It beats saying no only if two numbers and a rate
 * are worth a click, and `agent-think--gone` is the frame that argues they are not.
 * They are drawn side by side so that is a comparison rather than a claim.
 */
export default function AgentThinkOpenFrame() {
	return (
		<ThinkFrame
			think="open"
			run="all"
			note="A thought opens into an estimated token count and the rate behind it, and it can never open into anything more than that."
		/>
	);
}
