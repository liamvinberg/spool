import { useEffect, useMemo, useState } from "react";
import { type CaptureEvent, useCapture } from "../../../shared/lib/claude-turn";
import type { Arrival } from "../../../shared/ui/spool-say";
import { ArriveTake, type Beat, BEAT_MS, type Take } from "./arrive";

/**
 * agent-say-arrive — four ways a live edge can look, on rendered prose, reading from
 * the top, per word.
 *
 * A sheet at the real 420px. Every streamed message over 500 characters the repo has is
 * here behind the switcher, and it loops.
 *
 * **It renders markdown now, and that changed the question again.** The first two
 * passes of this sheet drew plain text, which is not what ships and hid the two things
 * that actually make streaming prose move. `Said` is the same renderer the rail uses,
 * so a paragraph break is a real gap, a fence is a real block, and a bold lead-in is
 * real weight.
 *
 * **A half-arrived marker is held back rather than drawn.** This is what jittered.
 * `**The shot failed` renders as two literal asterisks in body weight, and 200ms later
 * the closing `**` lands: the asterisks vanish, the run goes bold, its advance widths
 * change, and the paragraph re-wraps under the line being read. An unterminated fence
 * is worse — it swallows the rest of the message into a `<pre>`. So `closedText` waits
 * for the close. The cost is a beat of lateness on the last few characters of a bold
 * run, against a reflow of everything already on screen.
 *
 * **The unit had to become a word, and that is the fix for the flicker.** Per character
 * looked right in a still and was wrong in motion: wrapping a glyph in a span breaks text
 * shaping at the span boundary, so a run of per-character spans measures wider than the
 * same characters as one text node. Every frame, characters leaving the trailing edge of
 * the live window stopped being spans and became plain text, so the paragraph's width
 * changed continuously — the block read as flickering and rebreaking, worst at the start
 * where all of it was inside the window. Per word the boundaries land on spaces, where
 * there is no shaping to break, and **every** word is wrapped for the whole message, live
 * or settled, so no token ever changes box as the window slides. The only thing that
 * reflows is the one partial word at the cursor, which is what typing looks like.
 *
 * **The height animation went with it.** A `layout` transition on the block was measuring
 * a box that the reflow above was already moving, so it chased its own tail and pumped
 * the height up and down. With the width stable there is nothing to chase: a new line is
 * one 20px step, at the bottom, below everything being read.
 *
 * **Rendering was thought to pick the mechanism, and it turned out not to (#149).** The
 * claim here was that `fade` and `blur` animate a word on mount, so they are keyed by
 * position, and rendered position *moves* while a message streams because a closing marker
 * deletes four characters — leaving `edge` and `soften`, which compute opacity from
 * distance to the live edge and have no keys to re-fire. **That was true of the renderer
 * that held markers back, and `closedText` closes them instead.** Walking all three
 * streamed messages one character at a time, 5,808 characters: holding back broke the
 * rendered prefix 61 times, closing broke it 6, and one further rule — a lone `-`, `*` or
 * `1.` waits for its space — takes it to **0**. Nothing re-fires, so the mechanism decides
 * nothing and the four are a straight look.
 *
 * **`fade` ships.** `blur` and `soften` lose on the compositor rather than on taste:
 * Chromium disqualifies an animated pixel-moving filter by name
 * (`kFilterRelatedPropertyMayMovePixels`), Chrome's own writing is *"animating a blur is
 * not really an option as it is very slow"*, and `soften` recomputes a per-word blur every
 * frame on a tree the pace already re-renders sixty times a second. `edge` loses on the one
 * failure an animation cannot have: it **freezes**. Its opacity is a function of a distance
 * that stops changing whenever the wire pauses — 13 mid-stream stalls under jittered gaps,
 * median 200ms — and a word parked at 8% opacity reads as a rendering bug, where a fade
 * completes regardless. All four stay drawn here as the argument.
 *
 * **Three messages, not one, because a treatment tuned to one message is tuned to
 * nothing.** `claude-mcp` holds the 3,372-character report (43 deltas, a fence, a
 * blockquote, three bold findings) and a 1,169-character reply (14 deltas, bullets).
 * `claude-fanout` holds a 1,267-character note (12 deltas, inline code, bullets). Those
 * are all of them: `claude-plan` and `claude-edits` have no streamed block over 500
 * characters at all, so there is no fourth to check.
 *
 * **The rate is Opus 5's own.** Three of the four captures ran `claude-opus-5[1m]`, and
 * across their eleven measurable messages the rate is 107 to 381 characters a second,
 * median 184; the two long ones are 171 and 189. So 19.8 seconds for 3,372 characters
 * is what the model does, not a number this sheet chose. Sonnet 5, in the fourth
 * capture, runs 220 to 388, which is the honest reason a rate cannot be designed
 * against. What is *not* measured is the spacing between deltas: `stream_event` carries
 * no timestamp, so it is interpolated evenly here. The total is real, the metronome is
 * Spool's, and a real turn has pauses none of these have.
 *
 * **The stylisation is stated once and it applies to all four.** The wire sent clauses,
 * not characters — a median of 81 per delta — and every take spends the chunk out over
 * the frames after it so text is always arriving and height grows when a line fills
 * rather than in 40px jumps. The map already flags a typewriter as exactly this. Nothing
 * runs ahead of the wire, so no character is on screen before it arrived. What is
 * invented is the spacing.
 *
 * **The pace is no longer this sheet's own, and that is a correction (#149).** These
 * columns used to spread each chunk across a fixed 460ms. They now run the shipped drain
 * in `say-pace.ts`, because the fixed beat lost: 460ms is `place()`'s interpolation of a
 * measured total — `stream_event` carries no timestamp — and under gaps swinging 150ms to
 * 1.2s, spending-across-the-beat dumps its unspent remainder in one frame at 5,520
 * characters a second, eighteen times worse than the wire's own step. `agent-say-pace` and
 * `--jitter` are that argument. Comparing arrivals at a pace that does not ship was
 * comparing them at the wrong speed.
 *
 *   fade    opacity on mount, 170ms — what ships. Retuned from 260: Streamdown, the one
 *           shipped library doing this, defaults to 150ms, and Kowalski's rule is under
 *           300 with ease-out for anything entering.
 *   blur    3px clearing as it fades, 320ms. What the rail carried provisionally.
 *   edge    no animation. Opacity is a ramp over the last 30 characters, about five
 *           words, so the edge is a gradient that slides with the text and there is
 *           nothing to stutter or re-fire.
 *   soften  the same ramp with a tighter blur trailing it. The closest thing here to
 *           text coming into focus.
 *
 * Drawn earlier and dropped: `drop` (its direction competes with the block growing),
 * `weight` (quietest, least legible as arrival), `glitch` (flicker plus a 1px jitter),
 * `scramble` (the wrong glyph — Inter is proportional, so with the head re-rolling
 * eighteen times a second every word after it twitches and a line boundary re-wraps),
 * `word` (now what all four are), and the whole step-size family, which is
 * `agent-say-stream`. Git history has them.
 */

const MODES: readonly { mode: Arrival; note: string }[] = [
	{ mode: "fade", note: "opacity on mount, 260ms" },
	{ mode: "blur", note: "3px clearing as it fades, 320ms" },
	{ mode: "edge", note: "a computed ramp — no keys, nothing to re-fire" },
	{ mode: "soften", note: "the same ramp, plus a tighter blur trailing the edge" },
];

/** every streamed text block in a capture, as the deltas that built it */
function takesOf(name: string, events: readonly CaptureEvent[] | undefined): readonly Take[] {
	if (events === undefined) return [];
	const found: Take[] = [];
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
			if (text.length > 500) {
				const beats: readonly Beat[] = chunks.map((chunk, index) => ({ text: chunk, at: index * BEAT_MS }));
				found.push({
					id: `${name}-${text.length}`,
					note: `${name.replace("claude-", "")} ${text.length.toLocaleString()}c / ${chunks.length}d`,
					beats,
					whole: text,
				});
			}
			open = false;
		}
	}
	return found;
}

export default function AgentSayArriveFrame() {
	const mcp = useCapture("claude-mcp");
	const fanout = useCapture("claude-fanout");
	const takes = useMemo(() => [...takesOf("claude-mcp", mcp), ...takesOf("claude-fanout", fanout)], [mcp, fanout]);
	const [pick, setPick] = useState(0);
	const [run, setRun] = useState(0);
	const take = takes[Math.min(pick, Math.max(0, takes.length - 1))];

	useEffect(() => {
		if (take === undefined) return;
		const total = (take.beats[take.beats.length - 1]?.at ?? 0) + BEAT_MS + 1600;
		const timer = window.setTimeout(() => setRun((n) => n + 1), total);
		return () => window.clearTimeout(timer);
	}, [take, run]);

	return (
		<div className="flex h-full w-full flex-col gap-4 overflow-hidden bg-canvas px-8 py-6 font-sans text-text antialiased [font-synthesis:none]">
			<div className="flex items-baseline gap-3">
				<span className="font-mono text-sm text-text leading-4">say arrive</span>
				<span className="font-mono text-2xs text-muted/70 leading-3">
					#148 — rendered, reading from the top, at opus 5's own 171 chars/sec
				</span>
				<div className="ml-auto flex items-baseline gap-4">
					{takes.map((option, at) => (
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
				{MODES.map((entry) => (
					<div key={entry.mode} className="flex min-h-0 w-[420px] shrink-0 flex-col gap-2">
						<div className="flex h-8 shrink-0 flex-col gap-1">
							<span className="font-mono text-muted text-sm leading-4">{entry.mode}</span>
							<span className="truncate font-mono text-2xs text-muted/60 leading-3">{entry.note}</span>
						</div>
						<div className="relative min-h-0 flex-1 border-border border-x bg-bg px-3.5 pt-4">
							{take === undefined ? null : (
								<ArriveTake key={`${take.id}-${run}`} beats={take.beats} whole={take.whole} mode={entry.mode} run={run} />
							)}
							<span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg to-transparent" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
