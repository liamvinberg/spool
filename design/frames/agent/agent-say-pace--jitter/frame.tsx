import { PaceSheet } from "../agent-say-pace/frame";

/**
 * agent-say-pace--jitter — the same three policies on gaps the wire never promised to
 * keep even.
 *
 * Same message, same chunks, same 19.8 seconds. The only difference is that the gaps
 * between deltas swing from 150ms to 1.2s instead of all being the interpolated 460ms.
 * This is the frame that separates the two smoothed policies, and it is the reason the
 * decision is not "spend the chunk across its beat":
 *
 * | | frames with no new character | fastest burst |
 * |---|---|---|
 * | `wire` | 96% | 3 lines at once |
 * | `beat` | **24%** | **5,520 c/s** |
 * | `drain` | 12% | 686 c/s |
 *
 * `beat` fails in both directions at once. A chunk arriving *early* leaves the previous
 * one unspent, and there is nowhere for the remainder to go but onto the screen in a
 * single frame — a burst eighteen times worse than the wire's own step, which is the
 * thing a smoother exists to prevent. A chunk arriving *late* leaves the beat finished
 * with nothing to draw, so the edge stands still for the rest of the gap. Both come from
 * the same place: 460ms is a constant, and no delta ever promised it.
 *
 * `drain` carries no constant. Late chunk, bigger backlog, faster drain; early chunk,
 * still bounded by pending. Watch the traces rather than the text — `beat`'s spikes go
 * off the top of a scale that tops out at 500 c/s, and `drain`'s stay on it.
 */
export default function AgentSayPaceJitterFrame() {
	return <PaceSheet spacing="jitter" />;
}
