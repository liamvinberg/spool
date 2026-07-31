import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { pictureRev, sourceRev } from "./errand";
import { HandLayer, handOf } from "./hand";
import { Ghosted, HoldTab, useHold } from "./hold";
import { KaffeHomeHold } from "./kaffe-home-hold";
import { KaffeAbout, KaffeHours } from "./site-frames";

/**
 * agent-hand--ghost-hold — the ghost stops waiting to be caught, and starts waiting
 * to be asked.
 *
 * Type anything and press Enter. Watch the middle frame if you like; the point of
 * this one is what it does for you if you don't. Three photographs land in
 * thirty-seven seconds, each one a whole run of writes arriving as a hard cut, and
 * each one leaves a short stub on the frame's bottom wall. **Press and hold that
 * stub, at any moment, and the previous photograph comes back for as long as you
 * hold it.**
 *
 * **What this decides: how long the ghost lives, and whether it waits for you.** The
 * parent picked 420ms against two measured ends. The floor, 180ms, still stands. The
 * ceiling, 573ms, was the shortest gap between two writes — and it stopped binding
 * the moment this family accepted that a frame at 39% is a photograph rather than a
 * document. Thirteen writes make three pictures (`errand.ts`), roughly twelve seconds
 * apart, and the shortest gap between two of them is 8.6 seconds. There is nothing to
 * collide with. So the length of the ghost went from arithmetic to judgement, and
 * this frame is the judgement.
 *
 * **The answer is that a longer automatic ghost does not solve the problem it is
 * proposed for, and the arithmetic is not close.** Something is over the frame for
 * three ghosts' worth of a 37.7 second turn. At the parent's 420 that is 1.26s, so a
 * glance arriving at one uniformly random instant catches a ghost 3.3% of the time.
 * At 580 it is 4.6%. At two full seconds, the top of the range this round was asked
 * to try, it is 15.9% — **still five misses in six**, and now with a doubled
 * quarter-frame standing still on screen long enough to be read, disbelieved and
 * filed. What is being fought is a ratio of ghost to cadence; the cadence is twelve
 * seconds; and no duration that is still legible as a transition moves that ratio
 * anywhere worth having. Duration cannot buy attention. The lever is wrong.
 *
 * **And waiting for the pointer is worse, because it is a guess wearing the costume
 * of a fact.** A ghost that persists until you look has to decide what looking is,
 * and the only signal on offer is a pointer, which is parked wherever your hand left
 * it and is at the rail for most of a turn by construction — `agent-hand--land`
 * settled that the wall is the live channel and the picture is the slow one, so the
 * person watching a turn properly is watching the thing that is *not* the frame. Read
 * a pointer as attention and you clear the ghost for someone who never saw it. Refuse
 * to clear it and you have two designs on screen indefinitely, which is not a report,
 * it is the rendering fault this whole direction has been accused of being, held
 * forever. Both endings are wrong and they are the only two endings that shape has.
 *
 * **So: on demand, with the announcement kept.** The ghost plays itself once, short,
 * for whoever was there. Then it leaves a handle, and the handle waits — not for a
 * pointer to wander past, but for a press, which is the one signal that is not a
 * guess. That is the split the whole frame is: **the animation never waits and the
 * availability always does.**
 *
 * **Why not on demand alone, which was the tempting version.** A handle nobody has
 * ever seen used is an unexplained object. Arriving as the residue of something you
 * just watched happen, it needs no legend at all: the ghost is the sentence and the
 * tab is the sentence staying available. Dropping the automatic half would also drop
 * the only thing that serves the person who *was* watching, and the maintainer's
 * stated reason for picking this family was that it feels live. It still does. It
 * just no longer depends on you having been there.
 *
 * **580ms, and here is where it comes from.** The parent's 420 was 140 held at the
 * cap and 280 leaving. The hold went to zero, and it went to zero because the clock
 * change made the ghost much louder: each photograph carries a whole run rather than
 * one write, and rendered at the canvas's own 152×329 at device scale 2 the three
 * differ from their predecessors by **31.56%, 32.46% and 14.00%** of the rectangle,
 * counting pixels more than 8/255 apart. A third of a frame doubled and held still is
 * not a state, it is a fault. Every millisecond of this ghost moves. That leaves the
 * floor to derive the number: 180ms is a floor on the *perceived* ghost rather than
 * on the timeline, the parent met it by holding flat, and with the hold gone the only
 * way left to meet it is a leave whose visible portion is itself 180ms. The curve
 * sheds most of the 0.3 inside its first third, so 180 ÷ 0.32 = 562, rounded to 580.
 * Longer than the parent by 38%, and none of it standing still.
 *
 * **The case where nobody was watching, drawn.** No frame in this family has drawn
 * it, and here it is the settled state rather than a special one. Let the turn run to
 * 37.7s without touching anything: the agent lets go, the presence goes, the rail
 * finishes, the canvas holds three quiet frames — and `home` keeps its tab, at full
 * strength, because nothing has been asked about it. Press it then, twenty seconds
 * after the last picture landed, and you get the answer the rest of this family
 * throws away inside half a second. The tab has two strengths and that is the second
 * channel: 0.38 while there is a picture you have not asked about, 0.13 once you
 * have. So the same mark says *there is a previous state here*, which is permanently
 * true, and *something landed while you were elsewhere*, which clears on an act.
 *
 * **What I found that I did not expect: one picture back is nearly the whole turn.**
 * The rule that the ghost is one revision back was inherited as a safety measure, and
 * it reads like a limit. Measured, it is barely one: revision 0 against revision 13,
 * the frame as found against the frame the agent left, differs by **32.70%** of the
 * rectangle — and the middle photograph on its own differs by **32.46%**. A turn does
 * not spread across new regions, it rewrites the same ones, so the last picture holds
 * almost everything the whole turn did. The handle is one step of history and it
 * behaves like most of it, which is the reason a stack of ghosts would buy so little
 * and cost the one rule keeping this legible.
 *
 * **Does a longer ghost start to read as a rendering fault? Yes, and the threshold
 * moved down while the ceiling was moving up.** Nothing on this clock is a quiet
 * ghost: the smallest of the three still doubles 14% of the frame, and two of them
 * double a third of it, because the page is laid out in flow and a write that gains a
 * line moves everything under it. At 580ms that is a report. At one second it is
 * uncomfortable. At two it is a bug someone files. So the two halves of this round
 * pull against each other: the constraint that permitted a longer ghost is the same
 * constraint that made a longer ghost unaffordable. Dropping the cap under 0.3 would
 * buy some of it back and would cost the ghost the legibility it has none to spare of
 * at 152px.
 *
 * **The costs, plainly.** The tab is a second object on a canvas whose argument has
 * been that the agent is one object; it is the smallest thing that can carry a press
 * and it is still one more mark. It cannot be a hover, because a pointer crossing a
 * corner on its way somewhere else would fire the ghost, which is position two's flaw
 * in miniature — so the gesture has to be a press, and a press on a canvas is
 * normally a drag, which is why the tab sits outside the frame's box in the presence's
 * own 6px stand-off rather than on the artwork. It is on the bottom wall because that
 * is the only edge free at every moment: the name owns the top, the presence owns a
 * side, and an incoming walk lands its arrowhead on the other at `ROW_1 + 186`.
 * `home` is still the middle column, so both gutters are 44px against the 64 a chip
 * wants and the verb word never appears out here — the tab does not make that
 * question harder or easier, it just does not answer it. And the layer is a sibling of
 * `PlayField` in the field's copied coordinates, so this frame can never move the
 * camera.
 *
 * **Two misreads I could not design out, only reduce.** A rounded bar under a
 * phone-shaped rectangle is the shape of an iOS home indicator, which is why it is
 * left-aligned at the frame's own corner radius rather than centred, and why it sits
 * outside the frame on the dark canvas rather than on the paper. And it is the
 * presence's grip rotated, so at a glance it could read as the agent still holding
 * something; what separates them is that the grip is vertical, on a side wall, and
 * always has the head on it, while this is horizontal, on the bottom, and is at its
 * most visible precisely when the agent has gone. Measured at the canvas's own scale
 * the three strengths come out at 104, 207 and 50 on a canvas of about 20, so the
 * unread state, the held state and the read state are three plainly different marks
 * rather than three shades of one.
 *
 * Under `prefers-reduced-motion` the turn is a jump cut to settled, so no picture ever
 * lands on its own, the automatic ghost is disabled outright, and the tab has nothing
 * to be about — the canvas draws the design the agent left with nothing over it. That
 * is this frame's replay degrading, not the direction: **the held ghost is the one
 * version of this idea that stillness has no objection to**, because it is a gesture
 * rather than a timeline. In the product, a person who asked for no motion would still
 * get the tab and would still get their previous revision on a press, instantly and
 * with no fade at either end. That is not true of any other frame in this family.
 */

/** the frame every one of this capture's twenty-one rows names */
const SUBJECT = "home";

/** `home` between two frames nothing happens to, so both gutters are 44px */
const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"] },
	{ name: "site", frames: ["about", SUBJECT, "hours"], active: true, open: true },
];

const SHOT_W = 120;

export default function AgentHandGhostHoldFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked a different question: not what
	// happened, but where the agent is and whether it is doing anything there
	const hand = handOf(script, turn);

	// two revisions, kept apart because they are two different facts. `written` is
	// what is on disk; `shown` is what the canvas has managed to photograph of it,
	// which is 0, 6, 10 and 13 across this turn and never fewer than 2.55s behind
	const written = sourceRev(script, turn, SUBJECT);
	const shown = pictureRev(script, elapsed, SUBJECT);
	const hold = useHold(shown);

	/**
	 * The picture behind a `look` row. `spool shot` boots the frame headless off disk
	 * and rasterises the source, so the thumbnail is the written revision rather than
	 * the photographed one — the rail can be four writes ahead of the rectangle next
	 * to it, and it is, for 0.9 seconds around 25.9s.
	 */
	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== SUBJECT) return null;
		const scale = width / 240;
		return (
			<div style={{ width, height: Math.round(520 * scale) }}>
				<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
					<KaffeHomeHold rev={written} />
				</div>
			</div>
		);
	};

	const site: readonly BaseFrame[] = [
		{ name: "about", screen: "menu", render: KaffeAbout },
		{
			name: SUBJECT,
			screen: "menu",
			render: () => <Ghosted rev={shown} over={hold.over} draw={(at) => <KaffeHomeHold rev={at} />} />,
		},
		{ name: "hours", screen: "menu", render: KaffeHours },
	];

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
				{/* nothing is selected anywhere in this frame, so the only marks out here
				    that are not names or walks are the agent, what it replaced, and the
				    one handle that outlives both */}
				<PlayField base={site} />
				<HandLayer hand={hand} base={site.map((frame) => frame.name)} />
				<HoldTab index={site.findIndex((frame) => frame.name === SUBJECT)} hold={hold} />
			</CanvasChrome>
		</SpoolShell>
	);
}
