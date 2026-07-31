import "../../../shared/agent-wind.css";
import { railEntries, type Script, type ToolRow, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, type Turn, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { Ghosted, useGhost } from "./ghost-wind";
import { KaffeHomeLoud, LANDS, WRITES } from "./home-wind";
import { KaffeAbout, KaffeHours } from "./site-frames";
import { handOf, WindLayer } from "./wind";

/**
 * agent-hand--loud-wind — the compile with the presence rebuilt as a thing that gets
 * wound, using the loader spool actually ships.
 *
 * Type anything and press Enter, and watch the middle frame. Everything
 * `agent-hand--ghost-loud` decided is still here: the plate with its word and its count,
 * the thread whose length is the kind of hold and whose tension is whether a call is
 * open, the lane, the four corners, the ghost, the ladder. What is new is that
 * **`agent-wind`, the 1600ms track that means "spool is working" in the rail, now runs on
 * the canvas**, and that the presence has a store: it is fatter at the end of the turn
 * than it was at the start, because thirteen writes were wound onto it.
 *
 * ## What winding means here
 *
 * **A write winds. One write, one pass.** The pass is laid down the top half of the
 * frame's wall and into the core, in the shipped keyframes, at the shipped 1600ms linear,
 * with `animation-iteration-count` set to 1 and nothing else changed. Thirteen writes,
 * thirteen passes, and nothing else in the frame ever starts one.
 *
 * **A read does not run it off, and that is measured rather than assumed.** The obvious
 * second half of the metaphor is to reverse the track for `look`, `logs` and `read`. The
 * eight non-writing calls in this turn last 687, 281, 1238, 304, 752, 186, 669 and 218
 * milliseconds; seven of the eight are shorter than a single pass, so a reversed pass
 * would still be running long after the thing it is about had finished. **Reading has a
 * duration and winding does not**, and the family already has a channel for duration:
 * the thread is taut for exactly as long as the call is open and slack the rest of the
 * time. So tension carries everything with a length, the wind carries the one thing
 * without one, and neither is doing the other's job.
 *
 * **A shot does not send the whole length round the box**, because `--spool` tried that
 * and reported that the shot posture earns nothing as thread. The corners stay the
 * compile's.
 *
 * ## Reconciling a loop with a family that bans idle animation
 *
 * This is the hard part and it is the whole design. `.agent-wind` ships `infinite`. A
 * canvas of five frames with a spinner on one is a canvas with an alarm on it.
 *
 * **The answer is in the shipped file's own comment**, which is why this frame imports
 * `agent-wind.css` rather than approximating it: *"the length is 0 at both ends of the
 * cycle, so the loop starts over on screen with nothing drawn."* A cycle that begins and
 * ends at nothing is not really a loop. It is one complete gesture that has been told to
 * repeat, and it can be told not to.
 *
 * **So the loop is emitted rather than declared.** The rail loops because it does not
 * know how long a turn is. A frame knows something the rail does not: a write is an
 * instant, and this turn has thirteen of them on the wire. Run one pass per write and the
 * repetition stops being a property of the animation and becomes a property of the work.
 * The mean interval between two writes inside a run here is **1,067ms** against a pass of
 * 1,600, so during a run the passes overlap and the wall carries something that looks
 * exactly like the shipped looping stroke — and every cycle in it is a write that landed.
 * When the writes stop, it stops, because there is nothing left to emit.
 *
 * **What that buys, said plainly: a spinner's tempo tells you nothing and this one's
 * tempo is the only thing on the canvas that says how fast the agent is working.** Three
 * passes on the wall means writes are landing about 600ms apart. One pass and a long
 * empty wall means the agent has gone off to read something.
 *
 * ## The measurements the wind is built on
 *
 * **A pass belongs to a write and cannot belong to a call.** The twelve calls in this
 * turn last 310, 687, 281, 5606, 1238, 304, 4028, 752, 186, 3390, 669 and 218
 * milliseconds. **Nine of the twelve are shorter than one pass** and the median is 678ms,
 * so a per-call wind would be lying for most of its own length, most of the time. Only
 * three calls in thirty-seven seconds could contain a full cycle.
 *
 * **Three passes are on the wall at once, twice, and both times inside the run of six.**
 * The writes land at 7,153, 8,758, 9,331, 9,924, 10,721 and 11,988ms — 573ms apart at the
 * tightest and 1,605 at the widest. At 9,924 and again at 10,721 there are three cycles in
 * flight.
 *
 * **They stay legible, and it is the shipped curve that makes them.** The track's
 * translateX and scaleX are coupled — it is a shuttle that stretches and squeezes rather
 * than a bar that slides — so two cycles started 573ms apart occupy 10.0% to 46.3% and
 * 71.2% to 98.3% of the track. **The closest two passes ever come is 41 pixels of clear
 * track.** Staggering the shipped stroke is what keeps it from reading as one thick
 * moving thing, and that falls out of the keyframes rather than out of a decision here.
 *
 * **The track is half the wall, 164.5 pixels, and this is the honest loss.** The shipped
 * stroke crosses 420px in the same 1600ms, which `agent-load--ride` priced at 0.26px/ms.
 * This runs at 0.103. **The curve is identical in proportion and 60% slower on screen**,
 * because the keyframes are percentages of whatever they are given and a frame's wall is
 * not a rail. `--ride` already took this trade the other way, down to 58px under a word.
 *
 * ## What the wound thing does in the dead air
 *
 * Fifty-three percent of this turn has no call open — 19,914ms of 37,700, eleven gaps,
 * shortest 741ms and longest 3,860 — and on the stricter reading, from `subjectCue`
 * rather than from the row's own, it is 21,551ms and 57%. It is the largest single state
 * this direction has to draw and every frame before it drew a dimmer version of working.
 *
 * **The store: the plate's shut size, growing as the square root of what has been wound
 * on.** Five pixels across the whole turn, 9 to 14. The curve is the material's rather
 * than a designer's — thread has volume, so a spool's radius goes as the square root of
 * its length — and it puts the weight where the news is: **the first write is worth 1.39
 * pixels and the thirteenth is worth 0.20**, against thirteen equal steps of 0.38 that
 * nobody could see at either end.
 *
 * It is the plate's shut size and not a mark of its own for one reason, and it is a good
 * one: an open plate is 16 wide and hides the store completely, and an open plate means a
 * call is running. **So the store is legible exactly and only when nothing else here is
 * saying anything.** It costs no new object and no new pixel of the stand-off.
 *
 * **What it honestly cannot do is count.** Nine against fourteen is a difference; eleven
 * against twelve is not. The store answers *a lot has gone into this frame* and never
 * *thirteen*, and the rail prints thirteen four inches away.
 *
 * **And the thread holds its tension through a pass.** A slack line with thread still
 * arriving on it is not a thing, and drawing one is two objects that have stopped
 * agreeing. The cost is measured: it takes **2,442ms out of the 19,914 of dead air**, so
 * 53% becomes 46%. All eleven gaps survive it. One of them comes out at **88
 * milliseconds** — the last pass of the run of four ends 88ms before the `shot` opens —
 * and at 88 of a 320ms release the thread sags six tenths of one pixel and is pulled
 * straight again, which is the correct picture of an agent that never actually stopped.
 *
 * ## How it composes with the ghost
 *
 * **They are one event drawn twice, at two scales, in two places.** A write fires the
 * ghost inside the rectangle and the pass outside it, on the same cue, in the same tenth
 * of a second. Inside, 420ms of the previous revision at a 0.3 cap says *what* changed;
 * outside, 1600ms of travel in an empty gutter says *that* something was put in.
 *
 * **The cost of pairing them is a 3.8 to 1 mismatch and it runs the wrong way.** At 152
 * drawn pixels the ghost is a smear in a small picture and it is gone in 420ms; the pass
 * is the only moving thing in a 44px gutter and it is still running 1,180ms after the
 * ghost has finished. So the notice outlives the news by nearly four to one: catch the
 * wind and you have already missed the ghost. Fixing that means either shortening the
 * pass, which is the one number this frame is not allowed to touch, or lengthening the
 * ghost past `--ghost`'s measured 573ms ceiling. Neither is available, so it is a cost
 * rather than a fault, and it is the strongest argument for the wind being read as
 * *something happened here* rather than as a pointer at anything.
 *
 * ## The spine: thirteen revisions, one per write
 *
 * `agent-hand--ghost` is the only frame in this family whose canvas is alive, and the
 * reason is one line: `writesOn(script, turn, SUBJECT)`. Everything built after it drew
 * three photographs instead — 14.5s, 26.8s, 35.4s, nothing at all for the first fourteen
 * and a half seconds — which was a mistake in the brief those frames were given, not a
 * finding. **This frame writes thirteen times and re-renders thirteen times**, and every
 * timing here that was ever set against the photograph clock is set against the wire
 * again.
 *
 * **The correction makes the ghost louder rather than quieter, which was the surprise.**
 * The compile measured its worst run-sized ghost at 57.8% of the frame doubled. Per-write,
 * write 11 alone takes the headline from one line to two and pushes the lede, the button,
 * the hero and the menu down 18 pixels: **66.1%**. The three-photograph cadence had been
 * averaging the loudest moment away, because writes 12 and 13 spend the rest of that run
 * putting some of it back. Drawing the target is what showed it.
 *
 * ## What this frame fakes, stated
 *
 * The lane's located heights. `laneLives(152)` is false — below `LIVE_MIN_CSS_PX` there is
 * no document to resolve a write's line against — and they are drawn anyway, because a
 * frame that correctly draws nothing cannot be judged. `--accrue`'s fiction, inherited
 * with its reason. Everything else on this wall is drawn by the canvas outside the iframe
 * and is true at any zoom.
 *
 * The heights come from `layout()` in `home-wind.tsx` rather than from the
 * `data-spool-source` stamp that would answer above 400 drawn pixels. `edit ×6`'s width is
 * `--plate`'s measured 6.18px a glyph at 10px rather than measured again in this boot.
 *
 * ## The costs, in order
 *
 * **The stand-off is still 15 and the frame's own name is still struck.** The plate is the
 * widest occupant and the `shot` corners are struck from the same centre, so their top
 * rail runs at y 31 through a 12px line box at y 29 to 41. The wind does not add to the
 * claim — a pass rides the thread's own centre line at 3px, inside everything — and it
 * does not relieve it either. The compile's cut list still applies and the wind does not
 * argue with it.
 *
 * **Three things on this wall count a write now.** The lane's mark, the plate's `×N` nine
 * pixels out, and the store six pixels past that. The compile flagged two. What keeps them
 * from being one channel repeated is that they answer three questions — where just now,
 * how many in this run, how much altogether and never going down — and the honest reply is
 * that three answers to one question is still a crowd in 44 pixels.
 *
 * **The pass is peripheral motion, and peripheral motion is what this family is nervous
 * about.** Round four's own words: "a segment on a track is the indeterminate progress
 * bar". The defence is that this segment terminates in something rather than crossing and
 * exiting, that it is emitted per event rather than declared, and that it is silent for
 * more than half the turn. The prosecution is that all three of those are arguments, and
 * what a person sees at a glance is a small bar moving next to a rectangle.
 *
 * ## The verdict
 *
 * **It reads as spool working on that frame, and it takes one thing to get there: the
 * pass has to stop somewhere.** Drawn first as a segment crossing the whole wall and out
 * the other end, it is a progress bar taped to a rectangle and nothing about provenance
 * rescues it — the eye does not know that a track ran 164 pixels instead of 420, and it
 * cannot see that the iteration count is 1 rather than infinite. Terminating it at the
 * core changes the sentence: something is running down the edge of this frame and going
 * into the thing that is holding it. That is winding, and it is the whole difference.
 *
 * **The emitted loop is the real find and it generalises past this frame.** Every take in
 * this repo that wanted the shipped stroke had to put it somewhere it could loop forever,
 * which is why it has only ever lived in the rail. Bound to an event instead, it is the
 * same identity and it is not an alarm, and there is no reason that argument stops at a
 * frame's wall.
 *
 * **What I would not ship is the store.** It is the most defensible new thing here on
 * paper — it is the one channel that fills the dead air, its curve is the material's, and
 * it costs no object and no pixel — and it is the weakest thing here in front of a person,
 * because five pixels of growth on a nine-pixel square over thirty-seven seconds is a
 * difference nobody notices happening and nobody can read once it has. It is the third
 * counter on a wall that already had two too many. Cut it and the wind loses nothing: the
 * dead air is then a taut-to-slack thread and a still wall, which is what a wound thing at
 * rest actually looks like.
 *
 * ## Reduced motion
 *
 * `useTurn` jump-cuts to settled, so nobody is ever at the frame and every channel here
 * degrades to zero — no plate, no thread, no lane, no corners, no ghost, no pass. What is
 * left is the design the agent finished with and nothing over it. Worth saying about this
 * one in particular: **`agent-wind.css` carries its own `prefers-reduced-motion` rule**,
 * so the pass would draw nothing even if a turn did reach it. The direction inherits its
 * stillness from the stylesheet it borrowed rather than authoring any.
 */

/** the frame every one of this capture's twenty-one rows names */
const SUBJECT = "home";

/**
 * How many writes have landed on the frame's source, which is what makes it redraw.
 *
 * `agent-hand--ghost`'s reader, and the spine of this frame. A run's children are the
 * calls it collapsed, so this is the same arithmetic `railEntries` does to print `×6` —
 * one number, three surfaces here: the canvas re-renders, the ghost fires, and the wind
 * lays a pass.
 *
 * `write` is excluded and `edit` is not. The capture's single `write home` at 117ms is
 * `frames/home/frame.json`, so geometry moved the rectangle and left the design alone —
 * and the wind is silent there for the same reason the ghost is. That agreement is
 * deliberate: the compile's pluck fired on the wire and said a write had happened when
 * nothing about the frame had changed.
 */
function writesOn(script: Script, turn: Turn, frame: string): number {
	let count = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) if (turn.at(child.cue)) count += 1;
	}
	return Math.min(count, WRITES);
}

/**
 * The revision the newest picture is of.
 *
 * One number for every row rather than one per row, so an older `look` in the log shows
 * the newest picture. That is this frame's stand-in being cheap rather than the direction
 * saying anything: `ShotRef` carries a path, a media type and a frame, and nothing that
 * tells two shots of one frame apart. What it does buy is honest: a picture is of the
 * frame as it was when it was taken, and this turn rewrites that frame thirteen times, so
 * the small picture in the transcript and the large one on the canvas disagree for most
 * of the turn.
 */
function shotRev(script: Script, turn: Turn): number {
	const at = new Map(script.cues.map((cue) => [cue.name, cue.at]));
	const tools = script.rows.filter((row): row is ToolRow => row.kind === "tool");
	const last = tools.filter((row) => row.verb === "shot" && row.doneCue !== null && turn.at(row.doneCue)).at(-1);
	if (last === undefined) return 0;
	const when = at.get(last.cue) ?? 0;
	const by = (cue: string) => (at.get(cue) ?? Number.POSITIVE_INFINITY) <= when;
	let count = 0;
	for (const row of tools) {
		if (row.verb !== "edit") continue;
		for (const child of row.children) if (by(child.cue)) count += 1;
	}
	return Math.min(count, WRITES);
}

const SHOT_W = 120;

/** the picture behind a `look` row, drawn by the same component the canvas draws `home` with */
function picture(shot: ShotRef, rev: number, width = SHOT_W) {
	if (shot.frame !== SUBJECT) return null;
	const scale = width / 240;
	return (
		<div style={{ width, height: Math.round(520 * scale) }}>
			<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
				<KaffeHomeLoud rev={rev} />
			</div>
		</div>
	);
}

export default function AgentHandLoudWindFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked two different questions: where the agent is,
	// and which blocks it has changed recently enough to still be saying so
	const hand = handOf(script, turn, LANDS);

	// one number, and the whole spine of this frame: the canvas redraws on it, the ghost
	// fires on it, and the wind lays a pass on it
	const rev = writesOn(script, turn, SUBJECT);
	const ghost = useGhost(rev);
	const shotAt = shotRev(script, turn);

	/**
	 * The site page: `home` between two frames nobody touches. It is in the middle because
	 * the middle is the honest gutter — 44px a side, which is what a canvas of more than
	 * three frames offers everywhere.
	 */
	const site: readonly BaseFrame[] = [
		{ name: "about", screen: "menu", render: KaffeAbout },
		{
			name: SUBJECT,
			screen: "menu",
			render: () => <Ghosted rev={rev} ghost={ghost} draw={(at) => <KaffeHomeLoud rev={at} />} />,
		},
		{ name: "hours", screen: "menu", render: KaffeHours },
	];

	const pages: readonly PageRow[] = [
		{ name: "app", frames: ["cart", "menu", "receipt"] },
		{ name: "site", frames: site.map((frame) => frame.name), active: true, open: true },
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
						shotView={(shot, width) => picture(shot, shotAt, width)}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				{/* nothing is selected anywhere in this frame, so every mark out here that is not
				    a name or a walk belongs to the agent — which is the whole point */}
				<PlayField base={site} />
				<WindLayer hand={hand} base={site.map((frame) => frame.name)} written={rev} />
			</CanvasChrome>
		</SpoolShell>
	);
}
