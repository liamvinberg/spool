import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { KaffeHome } from "../../../shared/ui/kaffe-home";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { handOf, PlateLayer } from "./plate";
import { KaffeBeans, KaffeVisit } from "./site-frames";

/**
 * agent-hand--plate — the presence holds the word, so there is no second object.
 *
 * Type anything, press Enter, and watch the middle frame. `agent-hand--presence`
 * won this row and then filed the complaint this variation is built on: *the chip
 * is a receipt, and the rail already owns receipts.* Its object was a head welded
 * to the wall, a grip along the wall, and a mono chip standing off six pixels to
 * the side carrying the verb — a presence with a label next to it, and the label
 * was the part a reviewer could fairly call a docked log row.
 *
 * **The decision: the head opens.** There is one object here. Shut, it is the
 * parent's head, a small box on the wall meaning the agent is at this frame with
 * nothing open. Open, it is the same box grown along the bar into a plate with one
 * word standing in it. So the word is not beside the presence and it is not a
 * second mark that can be taken away; it is what the presence looks like while it
 * is doing something. Watch it open on `write`, swap through `shot`, `look`, `edit`,
 * `logs`, and shut ten times in the dead air between them.
 *
 * **Three channels became two, and the one that went was ink.** The parent kept
 * length for the kind of hold, ink for whether a call was open, and the chip for
 * which call. But open-and-has-a-word and a-call-is-open are the same fact stated
 * twice, so the plate being open *is* the ink channel and the bar is one strength
 * for the whole turn. What is left is a bar whose length is what the agent has hold
 * of and a plate that is either shut or holding a word. Two channels, one object.
 *
 * **The plate reads up the wall, and that is arithmetic.** Three 152px frames at
 * 114, 310 and 506 in a 772px viewport leave 114 of open field at each end of the
 * row and 44 between neighbours — the parent measured that and it is right. What it
 * concluded was that words do not fit, because `edit ×6` set across the wall wants
 * 64 with its stand-off. Set *along* the wall, the same word wants 16 of gutter and
 * 38 of the frame's own 329px height. The object reaches 14px out and asks for 20,
 * against a gutter of 44. So it fits in the tight slot with 24px to spare and never
 * has to be taken away, and the rule that picks a side survives at a threshold that
 * in this arrangement never fires.
 *
 * **Which is why `home` is in the middle column here and was on the end there.**
 * `agent-hand--presence` docks on the side with more room, and with `home` first in
 * its row that side had 114px, so its chip always fitted and its own 44px degrade
 * never appeared in its own frame. Every one of the twenty-one rows in this capture
 * names `home`, so putting `home` between two neighbours is the only way to make
 * the hard case the case you are looking at. Both gutters here are 44. The plate is
 * drawn in one of them for the whole turn.
 *
 * **The plate overlaps the frame's border by two pixels, deliberately.** Centred on
 * the bar at the parent's own 6px stand-off, a 16px plate reaches 2px past the
 * wall. Left as a gap it reads as a thing parked next to a frame; left overlapping
 * it reads as a thing attached to one, and 2px of a 1px hairline border is the
 * whole cost. Nothing else here touches the frame: no tint, no stroke on it, no
 * repaint.
 *
 * **Silence is drawn by shutting, not by a word for silence.** 21.6 of this turn's
 * 37.7 seconds — 57% — have no call open at all, across eleven gaps, the longest
 * 4.1s and the shortest 819ms. `agent-hand--label` filled that with the word
 * `working` and made a fair case for it. A plate does not need one: a shut plate is
 * the agent standing at the frame with nothing open, which is the same claim without
 * a fourth word in a three-word vocabulary. It also refuses the alternative that
 * frame refused — holding the last verb dimmed — for the same reason. A dim `look`
 * in a gap where nothing is being looked at is still saying `look`.
 *
 * **The instant channel is solved by the floor.** Five of the twelve calls run under
 * 320ms and the shortest `look` runs 68, so a word keeps the plate until its call
 * ends or 600ms has passed, whichever is later — `agent-hand--label`'s rule, and its
 * number holds against the address-timed measurement below with 219ms to spare. The
 * floor plus the plate's own 200ms shut is 800ms, and the shortest silence in this
 * turn is 819, so the plate does shut on all eleven gaps: on the tightest it touches
 * shut for 19ms and reopens, and on ten of the eleven it stays shut for more than a
 * quarter of a second. Eleven shuts in 37.7 seconds is one shape event every 3.4s,
 * against the parent's twelve chip fades and twelve ink changes over the same rows.
 * Folding three channels into one made the canvas quieter, not busier.
 *
 * **What it costs.** The count is gone from the canvas. `edit ×6` does not fit a
 * fixed 38px plate and a plate that grows for a count is a plate that resizes
 * twelve times in thirty-seven seconds, so the canvas draws each write as it lands
 * — one flick of the bar, six flicks in the run — and the rail is the only place
 * that says six. That is the same trade the whole variation is making, taken to its
 * end: the receipt stays in the rail. And the honest one: **a word turned on its
 * side is slower to read.** Four of the seven words are four characters and you are
 * reading a shape after the second exposure, but the first exposure is worse than
 * the parent's chip, and anyone who wants the word read fast should take
 * `agent-hand--label` instead, where it is horizontal, 12px, and free.
 *
 * **Why not the label, and why not no word at all.** The label is the better answer
 * to *what* — it is already mono, already lowercase, already the one thing on a
 * canvas that does not scale with the zoom, and it survives
 * `prefers-reduced-motion` intact, which nothing here does. It loses on the
 * question this row is actually about: `agent-hand--label` wrote its own killer,
 * that a word does not catch the eye, and a frame whose name row quietly gains a
 * second word is a frame you have to already be looking at. The plate opening is a
 * shape appearing in peripheral vision *and* a word, from one object, which is what
 * the brief asked for. Dropping the word entirely fails a plainer test: `look` and
 * `logs` share the `whole` posture and are two different things — one is the agent
 * looking at a picture of the frame, the other is it reading that frame's console
 * after writing to it, which is it checking its own work. Without a word the object
 * is three postures on a 3px bar at 39% zoom, and at that point the parent's own
 * complaint swallows the whole direction rather than just the chip.
 *
 * **A frame on another page.** The object needs a wall, and a frame you are not
 * looking at has none, so nothing is drawn on the canvas and the page row in the
 * Pages rail lights instead, for exactly as long as the agent holds a frame on it —
 * `agent-play--jump-name`'s rule, that pointing is answered wherever the answer can
 * be drawn. It carries no word out there and it should not: a page cannot say
 * `edit` without naming which frame, and naming the frame is the rail's line. So the
 * canvas says where and the rail says what, which is the same division as
 * everywhere else here. It is wired and it cannot be seen in this frame: every row
 * in this capture names `home`, and `home` is on the page you are looking at.
 *
 * **What I found that I did not know.** The vocabulary is closed and it is short.
 * `label()` in `claude-turn.ts` only ever attaches a frame to `write`, `edit`,
 * `read`, `look`, and the three `spool` verbs in `TAKES_FRAME` — `shot`, `logs`,
 * `url`. Everything else projects `frame: null` and can never reach a wall at all.
 * Seven words, longest five characters, 30.9px of mono. That is what makes a plate
 * that never resizes possible, and I had assumed the set was open and that a fixed
 * box would have to truncate something eventually.
 *
 * The second is that **the dead air is longer than this row has been saying, and the
 * reason is where you start the clock.** Measured from each call's `subjectCue` —
 * the moment the frame is named, which is the first moment anything can be drawn out
 * here — the twelve calls leave eleven gaps of 819, 1274, 4134, 2469, 1088, 3536,
 * 1073, 1113, 2791, 2148 and 1106ms. That is 21.6 of 37.7 seconds, 57%, where
 * `--presence` says 19.9 and 53%. Neither is wrong: the difference is exactly the
 * lag between a tool block opening and its argument deltas spelling out the file,
 * which the rail can print through and the canvas cannot. The shortest call is 68ms
 * on the same measure rather than 186. The dead air is the majority state by more
 * than the number that won this row.
 *
 * The third is smaller and it is a correction. Both `--presence` and `--label`
 * compute their widths from Fragment Mono advancing 7.06px at 12px, and measured in
 * this frame's own boot it advances **7.42px at 12px and 6.18px at 10**. Nothing
 * either frame concluded turns on it — `edit ×6` is 55px rather than 54 and still
 * does not fit 44 — but the number has now been carried through two frames.
 *
 * Under `prefers-reduced-motion` `useTurn` jump-cuts the whole turn to settled, so
 * nobody is ever at a frame and this object is never drawn — a page-wide gap with
 * its own ticket, not this frame's to fix. Its own transitions are cuts if a turn
 * ever runs there, and the honest note is that this is the one direction on the row
 * that loses everything to that setting, where the label direction loses nothing.
 */

/** the site page: `home` between two neighbours the capture never touches */
const SITE: readonly BaseFrame[] = [
	{ name: "beans", screen: "menu", render: KaffeBeans },
	{ name: "home", screen: "menu", render: KaffeHome },
	{ name: "visit", screen: "menu", render: KaffeVisit },
];

const HAVE = SITE.map((frame) => frame.name);

/** which page holds which frame, so a frame with no wall on screen still has somewhere to be drawn */
const WHERE: Record<string, string> = { cart: "app", menu: "app", receipt: "app" };
for (const frame of HAVE) WHERE[frame] = "site";

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

export default function AgentHandPlateFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked a different question: not what
	// happened, but where the agent is and what it has hold of there
	const hand = handOf(script, turn, elapsed);
	const page = hand === null ? null : (WHERE[hand.frame] ?? null);

	const pages: readonly PageRow[] = [
		{ name: "app", frames: ["cart", "menu", "receipt"], lit: page === "app" },
		{ name: "site", frames: HAVE, active: true, open: true, lit: page === "site" },
	];

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={pages}
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
				<PlateLayer hand={hand} base={HAVE} />
			</CanvasChrome>
		</SpoolShell>
	);
}
