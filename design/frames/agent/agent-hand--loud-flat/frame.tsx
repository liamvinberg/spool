import { railEntries, type Script, type ToolRow, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, type Turn, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { FlatLayer, handOf } from "./flat";
import { Ghosted, useGhost } from "./ghost-flat";
import { KaffeHomeFlat, LANDS, WRITES } from "./home-flat";
import { KaffeAbout, KaffeHours } from "./site-frames";

/**
 * agent-hand--loud-flat — `agent-hand--ghost-loud`, with the word set the way a person
 * reads and the frame redrawing on every write.
 *
 * Type anything and press Enter, and watch the middle frame. It is the compile: the
 * presence, `--spool`'s thread, `--accrue`'s margin lane, `--ghost`'s corners and its
 * previous revision at a 0.3 cap, `--roster`'s ladder, and the verb with its count. One
 * variable moves. The word is horizontal.
 *
 * ## Two things changed and only one of them is the variable
 *
 * **The frame re-renders on every write, all thirteen.** Every frame in this family
 * after `agent-hand--ghost` was drawn on the photograph cadence — three revisions at
 * 14.5s, 26.8s and 35.4s, nothing at all for the first fourteen and a half seconds —
 * because `lifecycle.ts:66` waits `CAPTURE_AFTER_READY_MS` after ready and a write
 * inside that window starts the errand over. That is true of the product today and it is
 * a bug. Drawing to it made every one of those frames feel dead. So the revision here is
 * `writesOn(script, turn, "home")`, which is `--ghost`'s own line, and the picture on the
 * canvas is never behind the file.
 *
 * That is not the variable under test, but it is not free either, and everything it
 * touched has been re-derived rather than inherited. The numbers are in
 * `ghost-flat.tsx`; the short version is that `--ghost`'s 420ms is measured against
 * 573ms again and clears it by 153, and the compile's complaint that a ghost of a whole
 * run doubles more than half the frame was a complaint about the photograph rather than
 * about the ghost.
 *
 * ## The 44px, and how it is actually solved
 *
 * `--plate` turned the word on its side because a horizontal chip needs 55.3px and the
 * gutter between two frames is 44. That arithmetic is right and it is still right. **The
 * word is not in the gutter.**
 *
 * `src/ui/canvas/frame-label.tsx` lays the frame's name out at `frameWidth * k` and
 * counter-scales the row by `1 / k`, so the row's screen width is the frame's and its
 * type is a fixed size at every zoom. That row already carries a second occupant at the
 * far end when the frame is selected: `play`, in `font-mono text-2xs text-muted
 * leading-3`, `gap-1.5` from the name. **This word is that slot**, same font, same size,
 * same gap, taken by the agent rather than by the human.
 *
 * The measurements, which are in `name-word.tsx` in full:
 *
 * - `edit ×6` is **43.28px** at Fragment Mono's 6.183px advance at 10px. The row is 152
 *   at this zoom, `home` takes 29.68 of it at 12px, the gap takes 6, and 73px are left
 *   over. The word goes on fitting down to a frame drawn **79px** wide.
 * - The bound is not the row, it is the `shot` corner's top-right arm at **x 439**. That
 *   leaves the word 93.3px, **fifteen characters**. The verb vocabulary is closed at
 *   `label()` at seven words with `write` the longest, so the widest string it can make
 *   short of a six-figure run is `write ×100000` at thirteen.
 * - Set at the *far* end, where `play` goes, `edit ×6` runs x 418.7 to 462 and that same
 *   arm crosses it. Set after the name it runs 345.7 to 389 and clears the near arm's end
 *   at 333 by **12.7px**. The end of the row was decided by that collision, not by taste.
 *
 * ## What leaving the gutter buys
 *
 * **The stand-off gets a solution.** The compile had four claims on the wall and the
 * plate was the widest at centre ± 8, forcing the centre to 15. Without it the widest is
 * a slack thread at centre ± 5 against the lane's 5, so the centre stands at **12** and
 * the assembly's reach falls from 23 of the 44px gutter to **16.5 — 37.5% of it rather
 * than 52%**.
 *
 * **The walk graph gets its pixels back.** `spool-play-field.tsx` starts an outgoing edge
 * at `x + w + 3`, `ROW_1 + 158`, and the compile's opaque `bg-canvas` plate covered
 * **15.79px of that edge's 44.42px open and 11.88 shut**, measured along the curve. The
 * node alone covers **9.06, and always the same 9.06**. Not solved: 20% of that edge is
 * still under the presence, because the presence welds at the frame's vertical centre and
 * the edge departs 6.5px above it. They share an anchor. Since the edge travels right as
 * it falls, pushing the presence further out pushes it further *into* the edge.
 *
 * **The word becomes the only channel that survives a zoom.** The thread, the lane, the
 * node and the corners are canvas geometry and shrink with the frame; the name row does
 * not, because the shipped label counter-scales it. `--ghost-loud` found the ladder was
 * the only channel that survived the *camera*. This is its sibling and they are the only
 * two that survive anything. **This frame cannot show it** — `spool-play-field.tsx` draws
 * one fixed zoom — so it is read out of shipped code and stated rather than demonstrated.
 *
 * ## The busiest moment, re-measured on the write clock
 *
 * **31.648 seconds, write 12**, the hero cropping 26px shorter and taking the price list
 * up with it: **41.9% of the frame doubled at 0.30**, **34.7% of the wall struck at a
 * mean 84.2%**, the thread taut with a pluck running on it, the node on, the row reading
 * `edit ×2`, the ladder holding. **All six channels, which the compile could never
 * reach.** Its own maximum was five, twice, in two different combinations, and the reason
 * was structural: a photograph lands 2.55s after the last write, so it always fell in a
 * lull and the ghost and the word could not co-occur. On the write clock the ghost fires
 * *inside* the open call that caused it, so six is not a coincidence — it is what every
 * one of the thirteen writes looks like.
 *
 * Write 5 at **10.721s** is the near miss and has the fuller wall: 29.4% doubled against
 * 46.2% of the wall at mean 71.0%, four marks up. Write 6 at **11.988s** is the fullest
 * wall in the turn — five marks, 51.2% of it, and the widest word this capture produces —
 * against a 5.0% ghost. And write 11 at **30.341s** is the loudest single ghost:
 * **59.3%**, which beats the compile's 57.8% peak.
 *
 * So the write clock does not lower the maximum. It lowers the median, from **42.2% to
 * 5.8%**: ten of the thirteen ghosts double under ten percent of the frame, and three are
 * over 29. The compile's sharpest complaint was that at 57.8% *which one is the past* is
 * unanswerable because the answer was always "the faint one" and at that density
 * everything is faint. That complaint survives write 11 exactly and dies everywhere else.
 *
 * ## Whether horizontal is actually faster to read
 *
 * Yes, and the size is not why. At five characters a quarter turn costs very little
 * decoding — the word is short enough to take in as a shape. What it costs is
 * *noticing*: rotated, the word is a 12px-wide vertical strip of ink in a gutter, and it
 * has to be found and then chosen before it can be read. Horizontal on the name row it
 * lands in the one place on this canvas the eye already goes to find out what a frame is.
 * Same 519 square pixels of ink, different address, and the address is the whole of it.
 *
 * The fair charge against it is the other side of that: **six pixels from the name, in
 * the same font, `home edit ×6` reads as one string at a glance.** Two sizes and two inks
 * separate them, which is exactly what the shipped label does to keep `play` off `home`,
 * and it is a mitigation rather than an answer.
 *
 * ## What I would cut, in order, and it is not the parent's order
 *
 * **The count comes off the list entirely.** The compile cut it first, and the reason was
 * sound where it stood: `--plate` fixed the box at 38 because the vocabulary is closed
 * and `write` is 30.9px, and *the plate never resizes* was the whole of what the object
 * bought over a chip. `edit ×6` wants 51, `edit ×13` 56, a hundred-write run 63. There is
 * no plate here. The word is a text run in a flex row whose other occupant already
 * truncates, which is #184's shipped rule for the model name against the stop, and the
 * bound is a corner arm nothing reaches. **The item the parent cut first is the item this
 * change makes free**, and that is the clearest single argument for it.
 *
 * **First cut: the lane.** It was third. It moves to first because with the plate gone it
 * is the only remaining reason the stand-off is above 6 — cutting it takes the centre to
 * 6, the corners' top rail from y 34 to y 40, and the assembly's reach from 16.5 to 10.5,
 * which is 24% of the gutter. It is also still the one channel here that is a fiction at
 * the zoom this canvas draws at: `laneLives(152)` is false, the located heights are
 * unobtainable, and `DIAGRAM` in `flat.tsx` is this frame overriding that on purpose.
 *
 * **Second cut: the thread's tension, not the thread.** Length is the posture and stays.
 * Tension says *a call is open*; the word now says *which call is open*, legibly, in the
 * row the eye was already reading. The compile kept tension over the plate because
 * tension had an envelope measured against the short call and the plate's 200ms
 * open-and-shut blinked twelve times in 37 seconds. That argument was about the plate's
 * shape and does not transfer: a word cuts in one commit and holds as a receipt. What
 * tension still buys is that it is read without a fixation, which is why it is second and
 * not first.
 *
 * **Third, the branch the compile named, and it is stronger here.** The lane and the
 * ghost are one claim at this zoom, and down there the choice was easy — thirteen events
 * against three, immediate against 2.55s late. On the write clock they are thirteen
 * against thirteen and both immediate, so the redundancy is total rather than partial and
 * the choice is a straight one: the lane says where against the wall, the ghost says
 * where inside the frame. The ghost is the finer of the two and it is the one that gets
 * better with zoom. The lane is the one that needs a live document to exist at all.
 *
 * ## What this frame fakes, stated
 *
 * The lane's located heights: `laneLives(152)` is false and they are drawn anyway,
 * because a frame that correctly draws nothing cannot be judged. `--accrue`'s fiction,
 * inherited with its reason. The heights come from `layout()` in `home-flat.tsx` rather
 * than from the `data-spool-source` stamp that would answer above 400 drawn pixels.
 *
 * The counter-scaled name row is real in `frame-label.tsx` and is not what this canvas
 * draws: `spool-play-field.tsx` has one zoom and its label is a plain 22px row. So the
 * word is placed at that row's exact coordinates and inherits none of its behaviour, and
 * the claim that it survives a zoom is read rather than shown.
 *
 * `edit ×6`'s width is 6.183px a glyph measured in this frame's own boot, and 7.42 at
 * 12px for the name. `--presence` and `--label` both compute from 7.06 and are 5% out.
 *
 * ## Reduced motion
 *
 * `useTurn` jump-cuts to settled, so nobody is ever at the frame: no node, no thread, no
 * lane, no corners, no word, and the ghost is disabled outright rather than degraded,
 * because a jump cut takes the revision from 0 to 13 in one commit and a ghost of the
 * found design over the finished one is the whole frame doubled. Six channels degrade to
 * zero, which is the compile's own result.
 *
 * One thing is better and it is a property of the move rather than a choice. The wall
 * channels leave an empty gutter that was visibly built to hold something. The word
 * leaves the name row exactly as the canvas draws it with no agent anywhere, because it
 * was never a slot this frame added. **A channel that borrows existing chrome leaves no
 * hole when it goes.**
 */

/** the frame every one of this capture's twenty-one rows names */
const SUBJECT = "home";

const SHOT_W = 120;

export default function AgentHandLoudFlatFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked two different questions: where the agent is,
	// and which blocks it has changed recently enough to still be saying so
	const hand = handOf(script, turn, LANDS);

	// the spine. One number, thirteen steps, and the canvas is never behind the file:
	// `write home` at 117ms is `frames/home/frame.json` and is deliberately not one of
	// them, which is why the ghost has nothing to say about the first thing this turn does
	const rev = writesOn(script, turn, SUBJECT);
	const ghost = useGhost(rev);

	// a picture is of the frame as it was when it was taken, and this turn rewrites that
	// frame thirteen times, so the thumbnail is drawn at the revision the last `shot`
	// caught rather than at the one on the canvas now. The compile drew the current source
	// instead, which was honest only because its canvas was a stale photograph anyway
	const shotAt = shotRev(script, turn);
	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== SUBJECT) return null;
		const scale = width / 240;
		return (
			<div style={{ width, height: Math.round(520 * scale) }}>
				<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
					<KaffeHomeFlat rev={shotAt} />
				</div>
			</div>
		);
	};

	/**
	 * The site page: `home` between two frames nobody touches. It is in the middle because
	 * the middle is the honest gutter — 44px a side, which is what a canvas of more than
	 * three frames offers everywhere. The arrangement is the compile's exactly, because a
	 * variation that moved the frames would not be comparable to it.
	 */
	const site: readonly BaseFrame[] = [
		{ name: "about", screen: "menu", render: KaffeAbout },
		{
			name: SUBJECT,
			screen: "menu",
			render: () => <Ghosted rev={rev} ghost={ghost} draw={(at) => <KaffeHomeFlat rev={at} />} />,
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
						shotView={picture}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				{/* nothing is selected anywhere in this frame, so every mark out here that is not
				    a name or a walk belongs to the agent — the word included, which is the one
				    thing this variation has to get away with */}
				<PlayField base={site} />
				<FlatLayer hand={hand} base={site.map((frame) => frame.name)} />
			</CanvasChrome>
		</SpoolShell>
	);
}

/**
 * Writes landed on the frame's source, which is what makes it redraw.
 *
 * `agent-hand--ghost`'s function, restored. A run's children are the calls it collapsed,
 * so this is the same arithmetic `railEntries` does to print `×6` — one number, two
 * surfaces. `write` is excluded and `edit` is not: the capture's single `write home` is
 * the geometry sidecar, and a ghost of a design that did not change is nothing, which is
 * the correct drawing of it.
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
 * tells two shots of one frame apart.
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
