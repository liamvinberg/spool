import { useEffect, useMemo, useState } from "react";
import { type CaptureEvent, useCapture } from "../../../shared/lib/claude-turn";
import { BEAT_MS, type Beat, type Pace, PaceTake, schedule } from "./pace";

/**
 * agent-say-pace — when a character is allowed on screen, which is the question the
 * other two say sheets stepped over.
 *
 * `agent-say-stream` arranged the wire's own steps five ways and found none smooth,
 * because the step is the problem: a delta carries a median of **81 characters**, which
 * at the rail's 392px is more than a line and often two. `agent-say-arrive` accepted
 * that and spread each chunk across a fixed 460ms beat so it could get on to the live
 * edge. **Neither asked where 460ms comes from.** It comes from `place()`: the two real
 * timestamps either side of the block put it at 19.8 seconds, 43 deltas, so 460ms is a
 * mean that `stream_event` — which carries no timestamp at all, 75 of the capture's 787
 * events being stamped — cannot confirm for any individual gap. Even spacing is the one
 * thing the wire does not promise.
 *
 * So there are two frames. This one runs the interpolated spacing every other sheet
 * assumes; `agent-say-pace--jitter` runs the same chunks and the same 19.8 seconds with
 * the gaps swinging 150ms to 1.2s. A policy that only survives the first is a policy
 * resting on Spool's own arithmetic.
 *
 * **The trace above each column is the argument.** Arrival rate over the last two and a
 * half seconds, topping out at 500 c/s. It holds the thing a still cannot and a number
 * flickers too fast to read: `wire` is a comb of spikes over a flat line, `beat` is a
 * ridge whose height is whatever the chunk happened to be, `drain` is a ridge that
 * levels.
 *
 * **Measured over the 3,372-character message, at 60fps:**
 *
 * | | frames with no new character | edge sits behind by | biggest height step | ends |
 * |---|---|---|---|---|
 * | `wire` | **96%** | — | 3 lines | on time |
 * | `beat` | 2% | 129c (0.8s) | 1 line | 0.46s late |
 * | `drain` | 2% | 138c (0.8s) | 1 line | 0.25s late |
 *
 * `wire` is the number that names the problem: **for 96% of frames nothing changes at
 * all**, and the other 4% carry up to three lines each. It is not a stream, it is 43
 * slides.
 *
 * **And under jitter the two smoothed policies stop being equivalent.**
 *
 * | | frames with no new character | fastest burst |
 * |---|---|---|
 * | `beat` | 2% → **24%** | 300 → **5,520 c/s** |
 * | `drain` | 2% → 12% | 590 → 686 c/s |
 *
 * `beat` breaks in exactly the way a real stream will break it. When the next chunk
 * lands before the current one has been spent, there is nothing to spend it across, so
 * the unspent remainder is dumped in one frame — a lurch **eighteen times worse than the
 * wire's own step**, which is the thing the policy exists to prevent. When the next chunk
 * is late instead, the chunk finishes early and the edge stands still. Both failures come
 * from the same place: the beat is a constant, and the wire does not honour it.
 *
 * `drain` has no such constant. It reads the backlog — `ms per character = min(floor,
 * window / pending)`, recomputed every frame — so a late chunk means a bigger backlog
 * and a faster drain, and an early chunk cannot dump because the rate is still bounded by
 * pending. Its worst burst is 686 c/s against 5,520.
 *
 * **This mechanism is not invented here.** It is assistant-ui's `useSmooth`
 * (`packages/react/src/utils/smooth/useSmooth.ts`), which is the only one of five shipped
 * implementations that speeds up when it falls behind: Vercel's `smoothStream` (10ms per
 * word), LibreChat's `streamRate` (1ms, docs recommend 25–40) and Open WebUI's
 * `splitLargeDeltas` (5ms per 1–3 characters) all pace at a **constant** and accumulate
 * lag without bound. What does not transfer is assistant-ui's own tuning: its 200
 * characters-a-second floor is **faster than Opus 5 writes this message** (170 c/s), so
 * it drains each chunk and then stands still — measured here at 23% of frames, against 2%
 * once the floor drops to 83 c/s. A smoother tuned above the model's own rate is a
 * smoother that only removes the lurch inside a burst and leaves the silence between
 * bursts intact.
 *
 * **What it costs, stated plainly.** The edge sits up to 0.8s behind the wire and the
 * message finishes 0.25s after the last delta. Nothing is ever drawn before it arrived —
 * the drain is clamped to what the wire delivered — so the lag is real and one-directional:
 * Spool is always showing you slightly less than it has.
 */

/** every streamed text block over 500 characters, as the deltas that built it */
function blocksOf(name: string, events: readonly CaptureEvent[] | undefined): readonly { id: string; note: string; chunks: readonly string[] }[] {
	if (events === undefined) return [];
	const found: { id: string; note: string; chunks: readonly string[] }[] = [];
	let chunks: string[] = [];
	let text = "";
	let open = false;
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
			if (text.length > 500)
				found.push({
					id: `${name}-${text.length}`,
					note: `${name.replace("claude-", "")} ${text.length.toLocaleString()}c / ${chunks.length}d`,
					chunks: [...chunks],
				});
			open = false;
		}
	}
	return found;
}

const TAKES: readonly { mode: Pace; label: string; note: string }[] = [
	{ mode: "wire", label: "wire", note: "the rail today — 96% of frames still, then three lines at once" },
	{ mode: "beat", label: "beat", note: "the other two sheets — the chunk across a fixed 460ms" },
	{ mode: "drain", label: "drain", note: "min(83 c/s, 250ms ÷ pending) — the backlog sets the rate" },
];

export function PaceSheet({ spacing }: { spacing: "even" | "jitter" }) {
	const mcp = useCapture("claude-mcp");
	const fanout = useCapture("claude-fanout");
	const blocks = useMemo(() => [...blocksOf("claude-mcp", mcp), ...blocksOf("claude-fanout", fanout)], [mcp, fanout]);
	const [pick, setPick] = useState(0);
	const [run, setRun] = useState(0);
	const block = blocks[Math.min(pick, Math.max(0, blocks.length - 1))];
	const beats: readonly Beat[] = useMemo(
		() => (block === undefined ? [] : schedule(block.chunks, spacing)),
		[block, spacing],
	);
	const whole = block === undefined ? "" : block.chunks.join("");

	// loops, because the difference between two of these is a rate rather than a still
	useEffect(() => {
		if (beats.length === 0) return;
		const total = (beats[beats.length - 1]?.at ?? 0) + BEAT_MS + 1800;
		const timer = window.setTimeout(() => setRun((n) => n + 1), total);
		return () => window.clearTimeout(timer);
	}, [beats, run]);

	return (
		<div className="flex h-full w-full flex-col gap-4 overflow-hidden bg-canvas px-8 py-6 font-sans text-text antialiased [font-synthesis:none]">
			<div className="flex items-baseline gap-3">
				<span className="font-mono text-sm text-text leading-4">say pace</span>
				<span className="font-mono text-2xs text-muted/70 leading-3">
					{spacing === "even"
						? "#149 — the interpolated 460ms every other sheet assumes"
						: "#149 — the same chunks and the same 19.8s, gaps swinging 150ms to 1.2s"}
				</span>
				<div className="ml-auto flex items-baseline gap-4">
					{blocks.map((option, at) => (
						<button
							key={option.id}
							type="button"
							onClick={() => {
								setPick(at);
								setRun((n) => n + 1);
							}}
							className={
								at === pick
									? "font-mono text-2xs text-text leading-3"
									: "font-mono text-2xs text-muted/50 leading-3 transition-colors duration-150 hover:text-text/70"
							}
						>
							{option.note}
						</button>
					))}
					<button
						type="button"
						onClick={() => setRun((n) => n + 1)}
						className="font-mono text-2xs text-muted/60 leading-3 transition-colors duration-150 hover:text-text/70"
					>
						replay
					</button>
				</div>
			</div>
			<div className="flex min-h-0 flex-1 gap-6">
				{TAKES.map((take) => (
					<PaceTake
						key={take.mode}
						label={take.label}
						note={take.note}
						beats={beats}
						whole={whole}
						mode={take.mode}
						run={run}
					/>
				))}
			</div>
		</div>
	);
}

export default function AgentSayPaceFrame() {
	return <PaceSheet spacing="even" />;
}
