import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { KaffeHome } from "../../../shared/ui/kaffe-home";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { KaffeAbout, KaffeHours } from "./site-frames";
import { ThreadLayer, handOf } from "./thread";

/**
 * agent-hand--spool — `--presence` with its second channel taken out of paint and
 * put into tension. The presence is a thread, and the thread is either pulling or
 * lying slack.
 *
 * Type anything, press Enter, and watch `home` rather than the rail. Everything the
 * parent decided is still decided here: the agent takes hold of one frame when the
 * first call names it, holds through the whole turn, lets go at the end; three
 * postures absorb five verbs; nothing travels; nothing spins; nothing is the
 * accent. The head is the parent's head down to the pixel. What changed is the one
 * thing this variant is for.
 *
 * **The parent's two channels are length and ink. Here they are length and pull.**
 * Length is unchanged and means what it meant: the wall's whole height while the
 * agent is taking the frame in, a 76px run while it is changing it, off the wall
 * and around the box for the beat it is photographing it. The second channel used
 * to be opacity — 0.85 with a call open, 0.34 between calls. Now the line is one
 * strength forever and the shape carries it: taut and dead straight while a call is
 * open, slack while none is, 4px of lie on a 46px wave.
 *
 * **That is a different sentence, not a prettier one, and it is the argument.** A
 * presence that dims in the gaps says the agent is half here. It is not half here.
 * More than half of this turn is the gaps — 19.9 of 37.6 seconds, 53%, eleven of
 * them, longest 3.9s and shortest 741ms — and what is true across all of it is that
 * the agent still has hold of this frame and is not pulling on it right now. Only a
 * thread can say that, because only a thread can be slack. A bar can be faint and a
 * bar can be short; there is no shape a rectangle takes that means *not under
 * tension*.
 *
 * **The measured find, and it is the one I did not expect: tension low-passes the
 * signal and ink cannot.** The brief's hardest constraint on this direction is that
 * five of the twelve calls run under 320ms and a `look` runs 186ms, so any channel
 * with an entrance and an exit per call flickers. The parent answered it by making
 * ink instant in both directions, which is honest and which also means the object
 * changes strength twelve times in thirty-seven seconds. Thread answers it by being
 * asymmetric for a reason: tension arrives on the instant and slack comes back
 * slowly, 90ms on against 320ms off, because that is what a line does and not
 * because a designer picked two numbers. What falls out is that a burst of short
 * calls never lets go of taut at all, while every one of the eleven real gaps here
 * is more than twice the release and reaches full slack with room to spare. The
 * envelope is the physics, so the drawing gets the right rhythm for free. An
 * opacity ramp could be given the same two numbers, and nothing about opacity would
 * justify them.
 *
 * **A write is a pluck rather than a length, and that is a straight correction.** In
 * the parent one of the six writes in a run flicks the segment 22px longer and
 * settles. That spends the posture channel on an event: for 150ms the object says
 * the agent's hold changed, and it did not. Here the write rides the channel events
 * belong to — the taut line shivers, 1.6px, and is straight again. Length now means
 * the kind of hold and only ever that, which is what the parent's own doc says it
 * means.
 *
 * **One thread, one width, everywhere.** The parent needs two objects: a 3px filled
 * bar for the grip and a 1.5px stroke for the ring, because a bar and an outline
 * are different things and a 3px box around a frame is a border. A thread is one
 * line whichever path it is on, so the wall run and the whole way round the box are
 * the same 2px stroke, and the shot posture stops being a second drawing that
 * happens to appear where the first one left.
 *
 * **What the thread does not earn, said plainly.** The shot posture was already the
 * textile one: the parent's ring is a line running off the head, round the frame,
 * and back, which is winding, and calling it thread renames it rather than
 * improving it. And the ring is the hole in the tension channel — it is only ever
 * out there while the call is open, so it has no slack state and never will. Three
 * postures, and the pull rides two of them.
 *
 * **A find about the ring that lands on the parent too.** It was drawn at 1.5 and at
 * 2 and shot at both, and the two pictures are the same picture: a white outline
 * standing 6px off a white frame on a dark canvas reads as a ring around the frame
 * whichever of those two widths it is struck at, close enough to a selection that a
 * reader has to check. So the parent's own line — 1.5 and not 3, because a 3px box
 * around a frame is a border — is optimistic about what the half-pixel is buying.
 * The stand-off is what would fix it and neither frame spends it. This one keeps 2,
 * because the width has to serve the wall run, which is the thing this variation is
 * actually about, and the ring is indifferent.
 *
 * **Off-page, and this is where the thread wins outright.** #146 and
 * `agent-play--jump-name` settled that pointing gets answered wherever the answer
 * can be drawn, so a frame on another page is answered on that page's own row in
 * the Pages rail. A presence can dock there — the head is 7px and a page row is 32
 * — but the parent's hold cannot follow it, because the hold is *measured against
 * the frame's own wall* and a rail row has no wall: whole and part are both about
 * twenty pixels there and draw the same picture. Tension has no scale. Straight
 * versus bent reads identically at 329 pixels and at 20, so the thread keeps a
 * channel across the move that the bar loses entirely. The parent's object degrades
 * to a dot on a row; this one degrades to a dot on a row with a line off it that is
 * still telling you whether anything is happening.
 *
 * **It is argued rather than drawn, and the reason is the capture.** All twenty-one
 * rows in `claude-edits` over `session` + `run` name `home`, and `home` is on the
 * open page for every second of the turn, so the rail dock is a state this
 * recording cannot reach. Shipping it anyway would put a picture on the canvas of
 * something that never happens, which is the one thing a dogfood frame must not do.
 * A capture that touches two pages is what would settle it, and none of the six in
 * this repo does.
 *
 * **The costs, and they are real.** Two pixels of stroke against three of bar, on
 * the channel that does the most work at canvas distance — thread is thin, and
 * thinness is what makes it thread. One strength forever means this object is
 * louder than the parent's for the 53% of the turn the parent spends at 0.34; the
 * defence is that the loudness is the point, and the bill is still a bill. The
 * polyline is rewritten in place while the amplitude moves, so it is main-thread
 * work rather than a composited transform, bounded the way `agent-spun--slack`
 * bounded it: it writes only while something is changing, so a 3.9-second gap is
 * zero writes after the first 320ms. And the verb still arrives as a word in the
 * chip, which is the parent's own unpaid cost and is untouched here on purpose, so
 * the two frames differ in exactly one thing.
 *
 * **The verdict.** The thread earns its place, narrowly, and on meaning rather than
 * on charm. It says something ink cannot say, its envelope is derived instead of
 * chosen, it collapses two objects into one, and it is the only version of this
 * direction that keeps a channel when the frame is somewhere the canvas is not
 * drawing. What it pays is a pixel of weight and a constant strength. If the two
 * are ever merged, the merge is not "add a thread to the parent" — it is the
 * parent's bar redrawn as a stroke so that it can lie slack, at 2.5px rather than
 * 2, which is the width where this stops costing anything at all.
 *
 * Under `prefers-reduced-motion` the turn is a jump cut to settled, so no frame on
 * this page draws anything at all for those users and this one is no exception.
 * Were a turn to run, every duration here is zero: the line snaps between straight
 * and slack, the posture cuts between lengths, and the pluck is dropped rather than
 * cut, because a 240ms shiver with no duration is a frame of noise. Straight against
 * slack is a shape, so the channel survives having no motion in it, which is more
 * than a rate could say.
 */

/** the site page: `home`, which every row in this capture names, and two nobody touches */
const SITE: readonly BaseFrame[] = [
	{ name: "home", screen: "menu", render: KaffeHome },
	{ name: "about", screen: "menu", render: KaffeAbout },
	{ name: "hours", screen: "menu", render: KaffeHours },
];

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"] },
	{ name: "site", frames: SITE.map((frame) => frame.name).sort(), active: true, open: true },
];

/**
 * The picture behind a `look` row, drawn by the same component the canvas draws
 * `home` with. A spool screenshot is of a frame spool can still render, so the
 * thumbnail is the frame rather than a stand-in for it.
 */
const SHOT_W = 120;
const picture = (shot: ShotRef, width = SHOT_W) => {
	if (shot.frame !== "home") return null;
	const scale = width / 240;
	return (
		<div style={{ width, height: Math.round(520 * scale) }}>
			<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
				<KaffeHome />
			</div>
		</div>
	);
};

export default function AgentHandSpoolFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked a different question: not what
	// happened, but where the agent is and whether it is pulling on anything there
	const hand = handOf(script, turn);

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={railEntries(script, turn, elapsed)}
						phase={turn.phase}
						say="read"
						shot="open"
						shotView={picture}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				{/* nothing is selected anywhere in this frame, so the only mark out here
				    that is not a name or a walk is the agent */}
				<PlayField base={SITE} />
				<ThreadLayer hand={hand} base={SITE.map((frame) => frame.name)} />
			</CanvasChrome>
		</SpoolShell>
	);
}
