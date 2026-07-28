import { useEffect, useMemo, useState } from "react";
import { type CaptureEvent, useCapture } from "../../../shared/lib/claude-turn";
import { type Beat, BEAT_MS, type Growth, StreamTake } from "./stream";

/**
 * agent-say-stream — the same twenty seconds five ways, so the vertical motion can
 * be judged rather than argued.
 *
 * A sheet, at the real 420px, running the real message. #148 settled that a long
 * message renders whole (`agent-play--say-read`), which leaves the thing that is
 * actually watchable: it takes **19.8 seconds** to arrive and it grows the whole
 * time.
 *
 * **The cadence is measured and the spacing is not.** The 3,372-character message
 * in `claude-mcp.json` arrives as **43 `text_delta`s**, and the two real timestamps
 * either side of the block put it at 19.8 seconds: one beat every ~460ms carrying a
 * median of **81 characters**. At 392px of text that is more than one line and often
 * two, so the honest problem is a block getting one to two lines taller twice a
 * second for twenty seconds. What is *not* measured is the evenness: `stream_event`
 * carries no timestamp — only 75 of the capture's 787 events are stamped — so
 * `place()` interpolates the gaps. Chunk sizes and the total are the wire's; the
 * regular spacing is Spool's, and no capture can fix that.
 *
 * **Every column reads from the top, and it is rendered.** Both were corrections. The
 * first pass drew plain text, which is not what ships and hid the fact that a paragraph
 * break is a real gap and a fence a real block; `Said` is now the same renderer the rail
 * uses, and an unclosed `**` waits rather than reflowing the paragraph when it closes.
 * The first pass also pinned the bottom, which drove the report's first line up out of
 * the box before it could be read. Anchored at the top, a step here reads as text moving
 * under the line you are on, which is the actual complaint.
 *
 * The two levers are step size and whether the step is animated. `jump` and `ease`
 * are the wire unchanged, two lines at a time, unanimated and animated. `line`
 * halves the step by letting a chunk in one line at a time. `type` spreads the
 * chunk across its own beat as characters.
 *
 * **`hold` was tried as a strawman and top-anchoring exonerated it.** It is #145's
 * reserve: the block's height is final from the first character, so nothing ever moves.
 * Bottom-pinned that looked catastrophic — the column sat empty for most of twenty
 * seconds while text filled a reserved block 1,234px above the viewport. Top-anchored
 * it is simply the calmest column here, because a reserved block fills from the top and
 * there is no step to smooth at all. **So the empty-screen argument against the reserve
 * was a bottom-pinning artefact, not a property of the reserve.** What is left against
 * it is narrower and still real: it puts two and a half screens of scrollable nothing
 * into the log for twenty seconds, and the scrollbar claims a length nothing occupies.
 *
 * `type` is the one that is not the capture. The map already flags it: a per-word or
 * per-character typewriter is a stylisation, and this is the one place a frame here
 * departs from the wire on purpose. It is drawn so the cost of the stylisation can
 * be weighed against how much smoother it is, rather than ruled out unseen.
 *
 * **`type` won the argument and then lost its own tuning (#149).** Spending the chunk is
 * what ships; spending it across a fixed 460ms is not. Every take on this sheet divides the
 * measured beat, and the beat is `place()`'s interpolation of a total — `stream_event`
 * carries no timestamp, so no individual gap is ever 460ms by promise. Under gaps swinging
 * 150ms to 1.2s, `type` dumps whatever it has not yet spent in a single frame at 5,520
 * characters a second, which is eighteen times worse than `jump`. What ships instead reads
 * the backlog rather than the clock: `min(83 c/s, 250ms ÷ pending)`, in `say-pace.ts`, drawn
 * on `agent-say-pace` and `agent-say-pace--jitter`. This sheet stays as the step-size
 * argument it was; it is not the pace.
 */

const TAKES: readonly { mode: Growth; note: string }[] = [
	{ mode: "jump", note: "the wire, unanimated — one to two lines land at once, every 460ms" },
	{ mode: "ease", note: "the same steps, glided over 260ms" },
	{ mode: "line", note: "one line at a time — half the step, twice as often" },
	{ mode: "type", note: "characters across the beat — smoothest, and not what the wire sent" },
	{ mode: "hold", note: "#145's reserve — nothing moves, and top-anchored that is fine" },
];

/** the deltas of the one long assistant block, exactly as they came off the wire */
function beatsOf(events: readonly CaptureEvent[] | undefined): { beats: readonly Beat[]; whole: string } {
	if (events === undefined) return { beats: [], whole: "" };
	let text = "";
	let chunks: string[] = [];
	let open = false;
	let found: string[] | null = null;
	for (const event of events) {
		const wire = event.type === "stream_event" ? event.event : undefined;
		if (wire === undefined) continue;
		if (wire.type === "content_block_start" && wire.content_block?.type === "text") {
			chunks = [];
			text = "";
			open = true;
		}
		if (wire.type === "content_block_delta" && wire.delta?.type === "text_delta" && open) {
			chunks.push(wire.delta.text ?? "");
			text += wire.delta.text ?? "";
		}
		if (wire.type === "content_block_stop" && open) {
			if (text.length > 3000) found = chunks;
			open = false;
		}
	}
	if (found === null) return { beats: [], whole: "" };
	// the first chunk lands when the block opens, not a beat later: `content_block_start`
	// and the first `text_delta` are adjacent on the wire
	const beats = found.map((chunk, index) => ({ text: chunk, at: index * BEAT_MS }));
	return { beats, whole: found.join("") };
}

export default function AgentSayStreamFrame() {
	const capture = useCapture("claude-mcp");
	const { beats, whole } = useMemo(() => beatsOf(capture), [capture]);
	const [run, setRun] = useState(0);

	// loops, because the difference between two of these is 20px of motion twice a
	// second and one pass is not enough to see it
	useEffect(() => {
		if (beats.length === 0) return;
		const total = (beats[beats.length - 1]?.at ?? 0) + BEAT_MS + 1400;
		const timer = window.setTimeout(() => setRun((n) => n + 1), total);
		return () => window.clearTimeout(timer);
	}, [beats, run]);

	return (
		<div className="flex h-full w-full flex-col gap-4 overflow-hidden bg-canvas px-8 py-6 font-sans text-text antialiased [font-synthesis:none]">
			<div className="flex items-baseline gap-3">
				<span className="font-mono text-sm text-text leading-4">say stream</span>
				<span className="font-mono text-2xs text-muted/70 leading-3">
					#148 — 3,372 characters, 43 deltas, 19.8s. top-anchored at the real 420px, rendered. it loops
				</span>
				<button
					type="button"
					onClick={() => setRun((n) => n + 1)}
					className="ml-auto font-mono text-2xs text-muted/60 leading-3 transition-colors duration-150 hover:text-text/70"
				>
					replay
				</button>
			</div>
			<div className="flex min-h-0 flex-1 gap-6">
				{TAKES.map((take) => (
					<div key={take.mode} className="flex min-h-0 w-[420px] shrink-0 flex-col gap-2">
						<div className="flex h-8 shrink-0 flex-col gap-1">
							<span className="font-mono text-muted text-sm leading-4">{take.mode}</span>
							<span className="truncate font-mono text-2xs text-muted/60 leading-3">{take.note}</span>
						</div>
						<div className="relative min-h-0 flex-1 border-border border-x bg-bg px-3.5 pt-4">
							{beats.length === 0 ? null : (
								<StreamTake key={run} beats={beats} whole={whole} mode={take.mode} run={run} />
							)}
							<span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg to-transparent" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
