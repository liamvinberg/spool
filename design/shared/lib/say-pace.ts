/**
 * When a character of an arriving message is allowed on screen (#149).
 *
 * Pure arithmetic over the delta schedule, so it lives here where it can be reasoned
 * about and simulated without a renderer around it — the same split `say-markers.ts` got.
 *
 * **The problem is the chunk, not the character.** A `text_delta` carries a median of 81
 * characters, which at the rail's 392px of text is more than one line and often two. Drawn
 * as it arrives, a message is not a stream: measured over the 3,372-character message in
 * `claude-mcp.json` at 60fps, **96% of frames change nothing at all** and the other 4%
 * carry up to three lines each. Forty-three slides.
 *
 * **And the beat is not a number the wire sends.** The obvious repair — spend each chunk
 * across its own 460ms — is what `agent-say-stream` and `agent-say-arrive` do, and it rests
 * on a constant that does not exist. `stream_event` carries no timestamp (75 of the
 * capture's 787 events are stamped), so 460ms is `place()`'s own mean of a measured total.
 * Simulated against gaps swinging 150ms to 1.2s over the same total, spending-across-the-beat
 * fails in both directions: a chunk arriving early leaves the previous one unspent, and the
 * remainder goes on screen in a single frame at **5,520 characters a second** — eighteen
 * times worse than the wire's own step, which is the thing a smoother exists to prevent —
 * while a chunk arriving late leaves the beat finished with nothing to draw and the edge
 * frozen for 24% of frames.
 *
 * **So the backlog sets the rate, and nothing here knows the beat.**
 *
 *     ms per character = min(FLOOR_MS_PER_CHAR, DRAIN_MS / pending)
 *
 * Further behind, faster; nearly caught up, the floor. A late chunk makes the backlog
 * bigger and the drain faster, and an early one cannot dump because the rate is still
 * bounded by what is pending. Measured on the same jitter: 12% of frames still, worst burst
 * 686 c/s.
 *
 * **The mechanism is assistant-ui's `useSmooth`** (`packages/react/src/utils/smooth/useSmooth.ts`),
 * which is the only one of five shipped implementations that speeds up when it falls behind
 * — Vercel's `smoothStream` (10ms per word), LibreChat's `streamRate` (1ms, docs recommend
 * 25–40) and Open WebUI's `splitLargeDeltas` (5ms per 1–3 characters) all pace at a constant
 * and accumulate lag without bound. **Its tuning does not transfer.** assistant-ui floors the
 * drain at 200 characters a second; Opus 5 writes this message at **170**, so its own default
 * outruns the model, empties the buffer and stands still for 23% of the message. The floor
 * here is 83 c/s, which buys 2% still for 0.05s more lag.
 *
 * **What it costs, stated rather than hidden.** The edge sits up to 0.8s behind the wire and
 * a message finishes 0.26s after its last delta. Nothing is ever drawn before it arrived —
 * `drawnBy` is clamped to what the schedule delivered — so the lag is real and
 * one-directional: the rail always shows slightly less than it has.
 */

/** the drain window: how long the backlog would take to clear at the current rate */
const DRAIN_MS = 250;
/**
 * The slowest the edge may move, in ms per character — 83 characters a second.
 *
 * It does two things. `DRAIN_MS / pending` alone is an exponential decay, so it approaches
 * the end of a message without ever reaching it, and it crawls whenever the backlog is one
 * or two characters. The floor bounds both. It is deliberately *below* Opus 5's own 170 c/s:
 * a floor above the model's writing rate drains each chunk and then waits, which removes the
 * lurch inside a burst and leaves the silence between bursts untouched.
 */
const FLOOR_MS_PER_CHAR = 12;
/** the backlog at which the floor takes over from the decay, where the two rates meet */
const FLOOR_AT = DRAIN_MS / FLOOR_MS_PER_CHAR;

/** a delta that has landed: when it arrived, and the message length once it had */
export interface Landed {
	/** ms from the send */
	readonly at: number;
	/** cumulative characters of the message after this delta */
	readonly upto: number;
}

/**
 * How much of the message may be drawn at `elapsed`.
 *
 * Closed form rather than an accumulator, so the projection stays a pure function of the
 * clock — which is what lets a frame be replayed, held, or seeked without the edge
 * depending on how it got there. Between arrivals the backlog decays exponentially
 * (`pending / DRAIN_MS` is a rate proportional to the backlog) until it reaches `FLOOR_AT`,
 * and drains linearly under it. Checked against a 1ms numeric integration of the same rule
 * across the whole 3,372-character message: they agree to within 0.7 of a character, which
 * is the integration's own error.
 */
export function drawnBy(landed: readonly Landed[], elapsed: number): number {
	const total = landed[landed.length - 1]?.upto ?? 0;
	if (landed.length === 0) return 0;
	// reduced motion hands in an infinite clock, and a settled message wants all of it
	if (!Number.isFinite(elapsed)) return total;

	let pending = 0;
	let arrived = 0;
	let clock = 0;
	const advance = (span: number) => {
		let left = span;
		if (left <= 0) return;
		if (pending > FLOOR_AT) {
			const decay = DRAIN_MS * Math.log(pending / FLOOR_AT);
			if (left <= decay) {
				pending *= Math.exp(-left / DRAIN_MS);
				return;
			}
			pending = FLOOR_AT;
			left -= decay;
		}
		pending = Math.max(0, pending - left / FLOOR_MS_PER_CHAR);
	};

	for (const delta of landed) {
		if (delta.at > elapsed) break;
		advance(delta.at - clock);
		clock = delta.at;
		const grew = delta.upto - arrived;
		arrived = delta.upto;
		pending += grew;
	}
	advance(elapsed - clock);
	// never ahead of the wire: no character is on screen before its delta landed
	return Math.max(0, Math.min(arrived, Math.floor(arrived - pending)));
}
