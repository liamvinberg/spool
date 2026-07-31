import { railEntries, type Script, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, type Turn, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { Ghosted, useGhost } from "./ghost-loud";
import { KaffeHomeLoud, LANDS } from "./home-loud";
import { handOf, LoudLayer } from "./loud";
import { KaffeAbout, KaffeHours } from "./site-frames";

/**
 * agent-hand--ghost-loud — every channel this family has decided, on one frame, at
 * once. It is the compile, and what it is for is finding where it stops working.
 *
 * Type anything and press Enter, and watch the middle frame. Six directions are on:
 * `--presence`'s head, `--spool`'s thread, `--plate`'s word turned on its side with
 * its count restored, `--accrue`'s margin lane, `--ghost`'s previous revision at a 0.3
 * cap, and `--roster`'s ladder. Nothing is dimmed to make room and nothing is dropped
 * to keep the picture calm. The maintainer has liked several of these on their own and
 * the question is only whether they survive being in the same picture.
 *
 * ## The busiest moment, measured
 *
 * **35.40 seconds.** The third photograph of `home` lands, so the ghost fires, and it
 * is a ghost of the whole third run: **57.8% of the frame's own area is doubled at
 * 0.30** while **39.7% of its wall is struck at a mean 37.5%**, in the same tenth of a
 * second. Five of the six channels are on. Four hundred and twenty-five milliseconds
 * later the `shot` corners strike over the frame's name.
 *
 * Doubled area is the union of each block's old and new box for every block whose
 * content or position changed, over the frame's 240×520. The three ghosts measure
 * **42.2%, 14.8% and 57.8%**, and the wall under them carries four, two and three
 * marks at mean strengths of 31.4%, 42.8% and 37.5%.
 *
 * The busiest moment **outside** the frame is a different one: **11.99 seconds**, the
 * sixth write of the first run. Five marks are up — 168.5 of the wall's 329 pixels,
 * **51.2% at a mean 60.8%** — the thread is taut, a pluck is running on it, and the
 * plate is open at its full 51 pixels holding `edit ×6`. Five of the six again, the
 * other five. The ghost is not there because the canvas has not been photographed
 * since before the run started, which is the fact underneath all of this: **twelve
 * seconds in, six writes have landed and the picture has not moved once.**
 *
 * ## The finding a compile was needed for
 *
 * **`--ghost`'s central constant was measured against a clock the canvas does not run
 * on, and only `--accrue` sitting in the same frame makes that visible.** The parent
 * set its 420ms life against a **573ms** ceiling: the shortest interval between two
 * writes in this capture, because a ghost still alive when the next write lands is a
 * ghost of the wrong revision. But below `LIVE_MIN_CSS_PX` a frame is a stored
 * photograph, and `--accrue` measured what that costs: **thirteen writes make three
 * photographs**, at 14.5s, 26.8s and 35.4s, each 2.55s behind at best. So the real
 * interval between two ghosts is **12.3s and 8.6s**, and 420ms sits twenty times
 * inside its ceiling rather than 153ms short of it.
 *
 * The number was never the problem. What the number was protecting was, and the
 * compile breaks it: each ghost now carries a whole run, so it doubles everything the
 * run touched plus everything the run's reflows moved. `--ghost`'s loudest case was
 * one reflow doubling six blocks. Ghost 3 here is three writes doubling five, at 57.8%
 * of the frame. That is the moment a person calls it a rendering fault, and the cap is
 * the only thing standing between the two readings.
 *
 * It cuts the other way too, and this is the one thing the compile makes *cheaper*.
 * `--ghost`'s hardest engineering problem was that an edit reboots the document with
 * no overlap window, so a pixel-exact previous state meant holding the outgoing iframe
 * mounted and frozen. Down here there is no iframe: the shell already puts a frame's
 * stored cover over it and fades it out over 180ms once the replacement loads. A ghost
 * in the covered regime is that same layer held at 0.3 instead of faded out, and
 * nothing else. **The direction's price and its loudness move in opposite directions
 * with zoom.**
 *
 * ## The stand-off, which has no solution
 *
 * Four things want a distance from the wall and they do not fit. The lane claims
 * wall + 0 to wall + 5. A slack thread claims its centre ± 4 plus a 2px stroke. The
 * plate claims its centre ± 8. And the `shot` corners are struck from that same
 * centre, because in every frame in this family the shot ink is the grip's own leaving
 * the wall.
 *
 * The plate is widest, so the centre stands at 8 + 5 + 2 of air = **15**, against
 * `--presence`'s 6 and `--accrue`'s 12. The corners' top edge is therefore at
 * `ROW_1 - 15 = 31`, and the frame's own name sets in a 12px line box running **y 29
 * to 41**. It is struck. The corners clear the name only at a stand-off below 6, and
 * the lane plus a slack thread need at least 9. **There is no value that satisfies
 * both.**
 *
 * And the collision is not a tuning problem, because the arm does not move. A corner's
 * arc is struck concentric with the frame's own 12px radius, so its horizontal arm
 * runs from `frame.x + RADIUS` to `ARM` past that — **x 322 to 333 whatever the
 * stand-off is**. Fragment Mono advances 7.42px at 12px, so `home` sets its four
 * glyphs at 310, 317.4, 324.8 and 332.3. **The arm lands on `o`, `m` and the leading
 * edge of `e`, and the one number in play only moves y.**
 *
 * ## What actually collides, and what merely coexists
 *
 * **The grip and the thread are one organ drawn twice.** `--presence` draws a 3px
 * filled bar whose ink says a call is open; `--spool` draws a 2px stroke whose tension
 * says the same thing. They occupy the same pixels and they cannot both be on the
 * wall, so the compile merges them into one line rather than stacking them — which is
 * already an admission that one of the six was never a separate channel.
 *
 * **The plate and the lane overlap by one pixel at `--accrue`'s own stand-off.** At 12
 * the plate's 16px body reaches 4px off the wall and the lane's claim ends at 5. That
 * is what forces 15, and 15 is what strikes the name.
 *
 * **The lane and the incoming walk arrow do not collide, and that is the tie-break
 * earning its keep.** `--accrue` broke the dock tie right for exactly this reason: the
 * arrowhead lands on the **left** wall at `ROW_1 + 186`, and with equal 44px gutters
 * the parent's rule would have parked the whole assembly under an accent triangle.
 * What is left is the residual `--accrue` stated and could not measure: the outgoing
 * edge leaves at `x + w + 3`, `ROW_1 + 158` — **x 465, y 204, inside the lane's 464 to
 * 467 and inside the hero mark, which spans y 136 to 244 for six seconds after every
 * write to it.** An accent-coloured line crosses a grey mark that is up for a sixth of
 * the turn.
 *
 * **The ghost and the corners very nearly collide, twice, and the numbers are worth
 * having.** Ghost 3 ends at 35.820 and the `shot` corners begin striking at 35.825:
 * **five milliseconds**. Ghost 2 opens at 26.800 while the previous shot's corners are
 * still retracting from 26.643 over 200ms: **43 milliseconds of real overlap**, the
 * only frame in the turn where the two are on screen together. Neither is designed;
 * both are what this capture happened to do.
 *
 * **The ghost and the word never coexist here, and it would be a mistake to call that
 * structural.** A photograph is 2.55s behind the last *write*, so it always lands in a
 * lull — but a `look` or a `logs` does not touch the frame's document and does not
 * restart the errand, so nothing stops one being open when a photograph arrives. In
 * this capture the three ghosts miss the next open call by **252ms, 418ms and 5ms**.
 * So the measured maximum is **five of the six at once**, twice, in two different
 * combinations — everything but the ghost at 11.99s, everything but the word at 35.40s
 * — and the sixth is 5 milliseconds away from making it six. The compile has to be
 * judged as though all six were on, because a slightly different session puts them
 * there.
 *
 * ## What the drawing caught that the arithmetic did not
 *
 * **The plate does not graze the walk graph, it hides it.** `--accrue` stated its
 * residual honestly and stated it as a crossing: the outgoing edge leaves at x 465,
 * y 204 and passes through three pixels of the lane. But the lane is a 3px bar and the
 * plate is a filled `bg-canvas` box, 16 by 51 open and 9 by 9 shut, sitting at x 469
 * to 485. **Both states cover the first pixels of the outgoing edge**, so an
 * accent-coloured connection between two frames now emerges from behind a grey box
 * that belongs to the agent. Position was never the problem here. Opacity is, and only
 * drawing it says so.
 *
 * **The cap defends the reading and cannot defend the legibility.** `--ghost`'s 0.3
 * exists so there is never a moment where two designs are on screen at comparable
 * strength, and it holds: nothing here looks like a crossfade. What it cannot do is
 * survive 57.8%. At the peak the frame is two whole pages printed over each other —
 * two headlines, two ledes, two filled buttons, two menus — and *which one is the past*
 * is unanswerable, because the answer was always "the faint one" and at this density
 * everything is faint. The parent's defence was that only what changed is visible. When
 * more than half the page changed, that is not a defence, it is a description.
 *
 * ## Two channels saying the same thing
 *
 * **Three of them say *a call is open*.** The thread's tension, the plate opening, and
 * `--presence`'s grip ink. The compile keeps two of them literally welded to one
 * object. Tension is the one to keep: it is the only one with an envelope measured
 * against the short call — 90ms on and 320ms off, so a burst of sub-320ms calls never
 * lets go of taut — while the plate's 200ms open-and-shut runs twelve times in 37
 * seconds and an opacity ramp blinks.
 *
 * **Two of them count writes, nine pixels apart.** The pluck fires once per write and
 * `×N` prints how many. The rail prints `edit ×6` in the row this object is standing
 * beside, which makes three.
 *
 * **The lane and the ghost are one claim on two clocks, and only at this zoom.** At
 * 152 drawn pixels body copy is five pixels tall, so a ghost of replaced text is a
 * smear: `--ghost` says out loud that down here it answers *where*, never *what*. That
 * is the lane's job. They differ in the clock rather than the claim — the lane fires
 * on the wire, thirteen times, immediately; the ghost fires on the photograph, three
 * times, 2.55s late. Above 400 drawn pixels they stop being the same thing, because
 * the ghost becomes a *what* and the lane stays a *where*. **This redundancy is real
 * here and false up there**, which is the most awkward result in the frame, because it
 * means the right answer depends on a zoom rather than on the design.
 *
 * **One more that is not redundancy but is worth naming.** Ink on this wall now means
 * age (lane), tension (thread) and open-or-shut (plate) at three distances from the
 * same edge. `--accrue` flagged two meanings on one channel as an unpaid cost; the
 * compile makes it three, and nothing keeps them apart except the objects being
 * different shapes.
 *
 * ## What I would cut, in order
 *
 * **First, the count.** It breaks the plate's only structural guarantee. `--plate`
 * fixed the box at 38 on a real argument — the verb vocabulary is closed at
 * `label()`, `write` is the longest at 30.9px, and *the plate never resizes* is the
 * whole of what the object buys over a chip. `edit ×6` wants 51, which is 34% taller
 * on every call for a number that appears on three of twelve, and 51 is not a bound
 * either: the count is a run length, so `edit ×13` wants 56 and a hundred-write run
 * wants 63. It is also the second counter on this wall and the third on this screen.
 *
 * **Second, the plate.** With the count gone it is a word, and the word is the receipt
 * the rail already prints — `--presence`'s own sharpest complaint about itself. It is
 * the widest occupant of the stand-off, so cutting it takes the centre from 15 to 12
 * and the assembly's reach from 23 of the 44px gutter to 15, and it gives the walk
 * graph back the pixels an opaque box was standing on. What it does not buy back is
 * the name: at 12 the corners' top rail is at y 34 and still inside y 29 to 41.
 *
 * **Third, the lane.** It is the only channel here that is a fiction at the zoom this
 * canvas draws at — `laneLives(152)` is false, the located height is unobtainable, and
 * `DIAGRAM` in `loud.tsx` is this frame overriding that on purpose. It is also the
 * channel that forces a stand-off at all. Cutting it takes the centre to 6, the
 * corners' top rail to y 40, and the name clears by a pixel. What is left is
 * `--presence` as a thread, the ghost on the photograph cadence, and the ladder.
 *
 * **The other branch, because the lane is the better channel on the facts.** If the
 * lane stays, the ghost goes instead: they are one claim at this zoom and the lane is
 * the faster and finer of the two, thirteen events against three, immediate against
 * 2.55s late. Then the corners have to be decoupled from the stand-off — struck at a
 * fixed 6 while the presence stands at 12 — which costs the reading that the shot ink
 * is the grip's own. `--ghost` had already spent most of that when it broke the ring
 * into four corners, so it is a smaller loss than it sounds, and it is the only escape
 * from the name that does not delete a channel.
 *
 * ## The honest verdict
 *
 * **Two of the six can be on at once, and a third only because it is free.** The
 * presence, drawn as a thread with its three postures, and the ghost. The ladder makes
 * three by drawing nothing at all: on this canvas the first rung always holds, so it
 * costs zero pixels — and it is the only channel that survives the camera moving,
 * because pan `home` out of view and the other five die in the same frame.
 *
 * Everything past two is fighting over nine pixels of stand-off, and what loses is the
 * frame's own name. That is not a close call. The wall between two 152px frames is 44
 * pixels wide and it already carries the walk graph; asking it to carry a participant,
 * a tension, a word, a count and a history of writes is asking one strip of empty
 * canvas to be a whole instrument panel.
 *
 * The compile is not a strawman, though, and the two things that survive it are
 * stronger for having been through it. The thread absorbed `--presence`'s ink channel
 * without argument, which means one of the six was never a channel. And the ghost
 * came out of the covered regime cheaper than it went in.
 *
 * ## What this frame fakes, stated
 *
 * The lane's located heights: `laneLives(152)` is false and they are drawn anyway,
 * because a frame that correctly draws nothing cannot be judged. `--accrue`'s fiction,
 * inherited with its reason.
 *
 * The heights themselves come from `layout()` in `home-loud.tsx` rather than from the
 * `data-spool-source` stamp that would answer above 400 drawn pixels — and write 7,
 * the menu arriving, is the case `--accrue` flagged as the stamp's own miss: a write
 * into a hoisted constant has no element on its line and would degrade to the frame's
 * root, marking the whole wall for a change to three rows. It is drawn located here.
 *
 * The photograph cadence is `--accrue`'s table, the mid-range of a 660 to 1437ms
 * errand. `edit ×6`'s width is `--plate`'s measured 6.18px a glyph at 10px rather than
 * measured again in this boot.
 *
 * ## Reduced motion
 *
 * `useTurn` jump-cuts to settled, so nobody is ever at the frame: no head, no thread,
 * no plate, no lane, and the ghost is disabled outright rather than degraded, because
 * a jump cut takes the revision from 0 to 13 in one commit and a ghost of the found
 * design over the finished one is the whole frame doubled. **Six channels degrade to
 * zero**, which is the one thing this frame says about stillness that a single-channel
 * frame cannot: the more of them there are, the more completely the setting deletes
 * them. What is left is the design the agent finished with, and nothing over it.
 */

/** the frame every one of this capture's twenty-one rows names */
const SUBJECT = "home";

/**
 * When the canvas gets a new photograph of `home`, and how many writes are in it.
 *
 * `--accrue`'s table, unchanged, because the compile has to be comparable to the frame
 * it inherits the regime from. `lifecycle.ts:66` waits `CAPTURE_AFTER_READY_MS` of
 * 1500 after ready, the errand takes 660 to 1437ms, and a write landing inside that
 * window bumps the nonce at `canvas.tsx:522` and starts it over — so a still is 2.55s
 * behind at best and a burst of writes yields one photograph rather than one each.
 * They land once per run, which is not a coincidence: a run ends when the agent stops
 * writing and goes to look, and that is the same silence the errand is waiting for.
 */
const PHOTOS: readonly (readonly [at: number, writes: number])[] = [
	[14500, 6],
	[26800, 10],
	[35400, 13],
];

/** what the canvas is currently showing, which is not what the file says */
function photographed(elapsed: number): number {
	let shown = 0;
	for (const [at, writes] of PHOTOS) if (elapsed >= at) shown = writes;
	return shown;
}

/**
 * How many writes have landed on disk.
 *
 * The run's children are the calls it collapsed, so this is the same arithmetic
 * `railEntries` does to print `×6`. It is deliberately not what the canvas draws: the
 * file is thirteen writes ahead of its own picture for most of this turn. What it does
 * drive is the rail's thumbnail, because `spool shot` boots the frame headless at
 * whatever the source currently says.
 */
function countWrites(script: Script, turn: Turn, frame: string): number {
	let count = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) if (turn.at(child.cue)) count += 1;
	}
	return count;
}

const SHOT_W = 120;

/**
 * The picture behind a `look` row, drawn by the same component the canvas draws `home`
 * with, at the revision the source has reached.
 *
 * Two photographs of one frame are taken 900ms apart here for two different consumers:
 * the agent's own at 25.9s, which is current, and the canvas's at 26.8s, which is what
 * you are looking at. So the small picture in the transcript is fresher than the large
 * one on the canvas.
 */
function picture(shot: ShotRef, writes: number, width = SHOT_W) {
	if (shot.frame !== SUBJECT) return null;
	const scale = width / 240;
	return (
		<div style={{ width, height: Math.round(520 * scale) }}>
			<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
				<KaffeHomeLoud rev={writes} />
			</div>
		</div>
	);
}

export default function AgentHandGhostLoudFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked two different questions: where the agent
	// is, and which blocks it has changed recently enough to still be saying so
	const hand = handOf(script, turn, LANDS);
	// two different numbers on purpose: what the canvas is showing, and what the source
	// actually says. They agree only for the last two seconds of the turn
	const shown = photographed(elapsed);
	const written = countWrites(script, turn, SUBJECT);
	const ghost = useGhost(shown);

	/**
	 * The site page: `home` between two frames nobody touches. It is in the middle
	 * because the middle is the honest gutter — 44px a side, which is what a canvas of
	 * more than three frames offers everywhere.
	 */
	const site: readonly BaseFrame[] = [
		{ name: "about", screen: "menu", render: KaffeAbout },
		{
			name: SUBJECT,
			screen: "menu",
			render: () => <Ghosted rev={shown} ghost={ghost} draw={(at) => <KaffeHomeLoud rev={at} />} />,
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
						shotView={(shot, width) => picture(shot, written, width)}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				{/* nothing is selected anywhere in this frame, so every mark out here that is
				    not a name or a walk belongs to the agent — which is the whole point */}
				<PlayField base={site} />
				<LoudLayer hand={hand} base={site.map((frame) => frame.name)} />
			</CanvasChrome>
		</SpoolShell>
	);
}
