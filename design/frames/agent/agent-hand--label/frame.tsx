import { useState } from "react";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { KaffeHome } from "../../../shared/ui/kaffe-home";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { type FieldFrame, HandField } from "./field";
import { handOf } from "./hand";

/**
 * agent-hand--label — the frame's own name becomes the reporter. Words, not motion.
 *
 * Type anything, press Enter, and watch `home` rather than the rail. Its label
 * says `write`, `shot`, `look`, then `edit` climbing to `edit ×6`, then `logs`,
 * `look`, `edit ×4`, `shot`, `look`, `edit ×3`, `shot`, `look` — twelve calls, and
 * in every gap between two of them it says `working`. The two frames beside it say
 * their names and nothing else for the whole two minutes, which is what the canvas
 * looks like today for all three of them.
 *
 * **The claim is a subtraction, not an addition.** `edit home ×6` is one sentence
 * the rail prints whole. Out here the frame *is* the subject, so the same sentence
 * with its subject removed is `edit ×6` — and there is exactly one place on a spool
 * canvas that already belongs to that frame, is already mono, already lowercase,
 * and is already the only screen-size thing in a scene that scales: its name row.
 * So nothing is invented. `hand.ts` re-uses `railEntries`' own count expression
 * character for character, and the two panes are the same string cut in half.
 *
 * **The label is where a 12px word survives a canvas.** `frame-label.tsx:38`
 * counter-scales the row by `1/k` and pre-multiplies its width by `k`, so the name
 * is 12px (`--text-sm`) at every zoom while the frame it names grows and shrinks.
 * That is the whole reason this direction exists: at 39% the frames are 152px wide
 * and a stroke, a glow or a pulse drawn *on* one is 39% of itself, while the word
 * above it is at full size. So the canvas can say what is happening instead of only
 * that something is.
 *
 * **The name is not given up, it is joined.** The verb sits after the name on the
 * same line rather than in its slot. Replacing was drawn first and it is a bad
 * trade at any legibility: a canvas of twelve frames where the two the agent has
 * touched no longer answer to their names is a canvas you cannot navigate at the
 * exact moment you most want to. When the two cannot both fit the name truncates
 * and the verb never does, which is #184's shape exactly — the identity gives way,
 * the transient fact stays whole. Fragment Mono advances 7.06px at 12px, so a
 * 152px label row holds 21 characters: `home edit ×6` wants 84 of them and the row
 * only runs out on a name as long as `cart--empty-c` under a run past ten.
 *
 * **The strength ladder was already there and it was unspent, which is the find I
 * did not expect.** `frame-label.tsx:50` draws a resting name at `text-muted` and
 * lifts it to `text-text` only under the pointer, so on the shipped canvas every
 * name is quiet and the loud rung is free. The verb takes it, and the result is
 * three states on one axis with no colour added and no stroke: one muted word is a
 * frame with nothing happening to it, a second muted word is the agent standing
 * here, and a second word at full strength is the agent doing that thing right now.
 * The accent stays the selection's — it is the one rung above `text-text`, and
 * spending it on the agent would leave the human's own mark nowhere louder to go.
 *
 * That ladder is also a **divergence between this canvas and the app it models**,
 * and it is worth filing: `spool-play-field.tsx:311` draws a resting name at
 * `text-text` where `frame-label.tsx:50` draws it at `text-muted`. This direction
 * follows the shipped file, so the frames here look a shade quieter than they do on
 * every sibling frame on this page, for a reason that is nothing to do with the
 * mark. If the dogfood field is the one that is right, this direction loses its
 * loud rung and has to find another.
 *
 * **The gap between the two words is 10px and it started at 6.** `frame-label.tsx`
 * uses `gap-1.5`, which at 7.06px per character is *tighter than a word space*, so
 * `home working` drew as one compound name. Ten is a space and a half and they
 * separate. Small, and it is the difference between the line reading as two facts
 * and reading as a frame with a strange name.
 *
 * **The timing rule, in one sentence: a verb takes the slot the instant its call
 * names this frame and keeps it until the call ends or 600ms has passed, whichever
 * is later, and the next verb takes it back the instant it starts.** The floor is
 * not a fudge and it is not a queue. The twelve calls in this capture run 186ms to
 * 5.6s and three of them are under 320ms, so without a floor `look` is a 186ms
 * flicker that reads as a rendering fault; with one, it is a word. 600 rather than
 * 700 because the tightest gap between one call ending and the next beginning here
 * is 741ms, so the floor has 141ms of headroom and is never actually cut short in
 * this turn. In some other turn it will be, and then it yields without argument:
 * the label must never buffer, because a word about a call that is over while a
 * different call is running is the one failure this direction cannot survive.
 * Two clauses close it. The count takes no floor at all, because a count is not a
 * new word, it is the same word getting more accurate — and it could not have one
 * anyway, since two of the six writes land 593ms apart. And the turn ending clears
 * the slot whatever the floor has left, because a settled rail beside a frame still
 * saying `look` is two panes contradicting each other.
 *
 * **Presence is a second word and it is always the quiet one.** In the dead air
 * between two calls the label reads `home working`. `working` is not invented
 * either: it is `Life`'s own reading for a thread with a turn in flight
 * (`agent-threads.ts`), borrowed by the one frame the turn is in flight *on*. It
 * begins when a call first names this frame and ends when the turn stops running or
 * when a call names a different one, so the claim it makes is the strongest one the
 * transcript can actually support. Because it never takes the loud rung it can
 * never be misread as a verb, which is what makes a fourth word safe to add to a
 * three-word vocabulary.
 *
 * The alternative was to hold the last verb dimmed until the next one arrives, and
 * that is the fudge this direction is not allowed: a dim `look` in a gap where
 * nothing is being looked at is still the label saying `look`. A word is either
 * true or it is not, and the honest word for the gap is the one that describes the
 * gap.
 *
 * **Reduced motion is free, and it is free because nothing here moves.** No fade,
 * no crossfade, no pulse: a word swap is an instant cut, since at 12px a 150ms
 * crossfade is 150ms of two words on top of each other and neither is readable.
 * `prefers-reduced-motion` renders this frame byte for byte. That is a real
 * advantage and it has a real price on the other side, which is the strongest thing
 * against this whole direction: **a word does not catch the eye.** A stroke
 * appearing in peripheral vision is seen; `look` appearing above a frame you are
 * not looking at is not. This direction answers *what* better than any mark can and
 * answers *that* worse than all of them. If the canvas has to tell you the agent
 * arrived, it needs something else, and then this is a second layer rather than
 * the answer.
 *
 * **What drawing it turned up that I did not know.** A tool block opens with an
 * empty input and the file name arrives in the argument deltas afterwards, so the
 * rail can honestly print `edit` with nothing after it and the canvas cannot print
 * anything at all — out here the subject is the address. Measured on this capture
 * the label lags the rail's row by 78ms on `shot`, 157ms on `write` and 274ms on
 * `edit`. That is the standing cost of putting the report on the thing rather than
 * in the list, and it is why `hand.ts` gates on `subjectCue` instead of on the
 * row's own cue.
 *
 * The frame is otherwise untouched: no stroke, no tint, no repaint. A frame really
 * does blink when its source is written, because spool re-renders it, and that
 * behaviour is the canvas's own rather than this direction's mark — drawing it here
 * would put someone else's evidence under this argument.
 *
 * The capture is `claude-edits.json`, the same two minutes `agent-play--jump-name`
 * and `agent-play--edit-run` play. Every one of its twelve calls names `home`,
 * which is the best case this direction gets and worth saying out loud: one frame
 * held for a whole turn is where a word on a label is cheapest. A turn that touches
 * six frames in ninety seconds is the case that would break it, and no capture in
 * this repo holds one.
 */

/** the kaffe site page: `home` and two neighbours the turn never touches */
const SITE: readonly FieldFrame[] = [
	{ name: "beans", screen: "menu" },
	{ name: "home", render: KaffeHome },
	{ name: "hours", screen: "receipt" },
];

const HAVE = SITE.map((frame) => frame.name);

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"] },
	{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
	{ name: "site", frames: HAVE, active: true, open: true },
];

export default function AgentHandLabelFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	const [landed, setLanded] = useState<string | null>(null);
	const [pointed, setPointed] = useState<string | null>(null);

	// the whole direction, in one call: where the hand is, and what it is doing there
	const hand = handOf(script, turn, elapsed);

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				selected={landed ?? undefined}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={railEntries(script, turn, elapsed)}
						phase={turn.phase}
						// the rail is unchanged, and #148's renderer is the decided one rather
						// than the default the frames on this page were left holding
						say="read"
						jump="name"
						have={HAVE}
						pointed={pointed}
						onPoint={setPointed}
						onJump={setLanded}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				<HandField
					frames={SITE}
					hand={hand.frame}
					verb={hand.verb}
					selected={landed}
					pointed={pointed}
				/>
			</CanvasChrome>
		</SpoolShell>
	);
}
