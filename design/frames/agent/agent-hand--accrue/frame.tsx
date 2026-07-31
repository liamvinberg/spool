import { railEntries, type Script, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, type Turn, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { AccrueLayer, handOf } from "./accrue";
import { KaffeHomeAccrue, LANDS } from "./kaffe-home-accrue";
import { KaffeAbout, KaffeHours } from "./site-frames";

/**
 * agent-hand--accrue — six writes are one piece of work, and the wall carries the
 * shape of it for as long as the shape is true.
 *
 * Type anything, press Enter, and watch `home` in the middle column. The presence of
 * `agent-hand--presence` is unchanged: a head welded to the wall, a grip whose length
 * is the kind of hold and whose ink is whether a call is open, no travel, no accent,
 * no spinner. What is added is one lane against the frame's own edge, and every write
 * leaves a mark in it at the height of the block it changed. Watch the wall against the
 * picture: the wall moves thirteen times and the picture moves three, which is what the
 * canvas really does at this size.
 *
 * **The argument is that a canvas that flashes six times is drawing six events the
 * rail deliberately stopped drawing.** The transcript collapses `edit home ×6` into
 * one row because six writes are one loop, and `agent-play--edit-pass` argued the
 * unit was never the edit but the pass. Every other direction in this round treats a
 * write as an event: it lands, it is shown, it is gone. This one lets the marks
 * coexist, so at 12.0 seconds the wall is not showing you the sixth write, it is
 * showing you the run — five places, in the order they were touched, with the oldest
 * nearly gone and the newest at full.
 *
 * **The decay is measured rather than chosen, and the measurement is the finding.**
 * A run coheres only if a mark outlives the run that made it, and the longest run of
 * writes here spans 4.84s — six calls from 7.15s to 11.99s. Two runs stay apart only
 * if a mark dies before the next run starts, and the shortest gap between runs is
 * 6.14s, from 24.20s to 30.34s. So the legal window for the constant is [4.84, 6.14]
 * and it is **1.3 seconds wide**. Six sits near its top, which is where it has to
 * sit: at 5.5s the first mark of a run of six is down to 13% of full when the sixth
 * lands, which is not a mark, and at 6.2s two runs would be on the wall at once. The
 * curve is a 0.7s hold at full and then linear to nothing, because the one thing the
 * margin has to keep legible is the *order* of a run, and an ease either bunches the
 * old marks at the bottom of the range or drops them off a cliff.
 *
 * **What that window means is the honest verdict on the whole direction.** It means
 * this object accrues a *run* and can never accrue a session. At six seconds two runs
 * never coexist, and they miss each other by 138 milliseconds — run 1 clears at
 * 17.99s and run 2 opens at 20.87s, run 2 clears at 30.20s and run 3 opens at 30.34s.
 * There is no moment in this turn where the wall carries thirteen writes, or ten, or
 * seven. A canvas that carried a picture of the whole session would need a mark to
 * live forty seconds, and at forty seconds the run of six is a solid column of ink
 * standing beside a design nobody can see past. So the thing the brief imagined —
 * thirty seconds in, three changes at the top and one at the bottom — is not
 * reachable, and finding that it is not reachable is what this frame is for. The
 * accrual is real at the scale the rail already works at and false at every scale
 * above it.
 *
 * **The trace lives on the wall rather than on the design, and that is the whole
 * answer to the cost.** A trace that outlives its event is a claim about the past,
 * and a canvas covered in warm patches has stopped showing you the present. Here
 * nothing is ever drawn over the frame: the marks sit two pixels outside its edge in
 * a three-pixel lane, the way a diff ruler sits beside a file rather than in it. The
 * past is a strip of ink you can ignore completely. Occlusion of the design at every
 * moment, in every state: zero.
 *
 * **The frame on this canvas is not live, and finding that out is what makes the
 * direction worth having.** `src/cover.ts:8` sets `LIVE_MIN_CSS_PX` to 400 and
 * `lifecycle.ts:245` refuses to mount a document below it, so at 152 drawn pixels
 * `home` is a stored still — `coverPlan` returns `cover: true` for every state that is
 * not `live`, and `frame-shell.tsx:154` puts it in one sentence: "a held document
 * stays mounted for Select and the rail, but its still remains on screen below the
 * readable threshold". What replaces the re-render is the capture errand, and it is
 * slow: `CAPTURE_AFTER_READY_MS` is 1500, the errand adds 660 to 1437ms, and a write
 * landing inside that window restarts it at `canvas.tsx:522`. **Thirteen writes, three
 * photographs**, at 14.5s, 26.8s and 35.4s of a 37.7 second turn, each 2.55s behind at
 * best. This frame draws that rather than the thirteen-step re-render I first staged:
 * the picture moves three times and the wall moves thirteen.
 *
 * **Which is the argument.** For 12.4 of the first 14.5 seconds the picture of `home`
 * has not moved at all while six writes have landed in it, and the only thing on the
 * canvas that knows any of that is the wall. The photographs arrive once per run,
 * about 2.5 seconds after the run ends, by which time the run's own marks are down to
 * 40% — so the wall tells you during and the picture confirms after, and they are
 * never saying the same thing at the same time. A canvas whose frames are stills for
 * most of the zoom range needs a narrator, and the presence object is the only thing
 * out there fast enough to be one.
 *
 * **The moment this is most likely to be called wrong is 23.0 seconds, and it is not
 * wrong.** The menu list is written at 20.9s and 22.4s, so the wall carries a mark at
 * the bottom of the frame — and the picture there is still empty, because the
 * photograph carrying that list does not arrive until 26.8s. A mark is pointing at
 * blank paper. That reads as an error and it is the opposite of one: the mark is
 * early, not misplaced, and a person watching it learns that something landed at the
 * bottom of the page about four seconds before the canvas can show them what. If the
 * margin only marked what the picture already displayed it would be a decoration on
 * the still rather than a report on the work. This is the case that decides whether
 * the direction is wanted, so it is stated here rather than left to be found.
 *
 * **The regime, stated rather than buried.** The marks are drawn by the canvas outside
 * the iframe, so *drawing* them never needs a live document and their timing is the
 * wire's own. Their heights do. Above 400 drawn pixels a write's line resolves to a box
 * and the margin is a ruler; below it there is nothing to ask and the correct degrade
 * is no margin at all, which is `agent-hand--presence` exactly. So these two frames are
 * not competitors, they are one object either side of a threshold. The threshold is
 * severe: at 400 drawn pixels this viewport's 772 holds the subject and 70 pixels of
 * each neighbour, so **the located margin is a working-on-one-frame object and the
 * overview object is the parent**. `marginLives()` in `accrue.tsx` is that law, and the
 * `DIAGRAM` constant beside it is this frame overriding it on purpose, because a frame
 * that correctly draws nothing cannot be judged. That is the one fiction here and it is
 * named at the line that introduces it.
 *
 * **The worst moment, which is the one at 12.0 seconds.** Five marks are up — head at
 * 20%, sub at 47%, cta at 67%, hero at 80%, bar at 90% — and they are 183.7 of the
 * wall's 329.3 pixels, so **56% of the wall is struck at a mean strength of 66%**.
 * The hero alone is 95 of those pixels, because the hero is 29% of the page and a
 * mark that lied about that would be worth less than no mark. That is a busy gutter
 * and it is the true cost of the direction. It is also the moment it is doing its
 * job: five blocks, one glance, no words.
 *
 * **Nothing resets it, and it does not survive the turn.** The run does not clear the
 * wall, because the run is the thing being drawn. The turn's end does clear it, and
 * the measurement says that costs almost nothing: the last write lands at 32.84s and
 * the hand lets go at 37.70s, so there is exactly one mark left at 19% when the
 * presence goes, and it goes with it. That is the test the constant has to pass in
 * the other direction — **if letting go had a lot to erase, the decay was too long**.
 * And it is why the marks are keyed to the hand: a gutter with no hand on it is a
 * claim about history with nothing to anchor it, two turns later it would carry marks
 * whose cause is unreachable, and the canvas already has a permanent, scrollable
 * place for history that this is not competing with.
 *
 * **What it does with the dead air.** 21.6 of 37.7 seconds have no call open, and
 * this is the direction that wants them: the margin is most legible exactly when
 * nothing is landing on top of it. Run 1's last write is at 11.99s, `logs` opens at
 * 15.17s and `look` at 17.34s, so while the agent is checking what it just did, the
 * shape of what it just did is still on the wall at 47% and then 10%. The presence
 * says it has not gone; the margin says what it has been doing. Neither of them is
 * the transcript repeating itself.
 *
 * **Above the threshold the mechanism already exists, and it is not a box diff.** The
 * canvas cannot read a frame's DOM — `sandbox="allow-scripts"` with no
 * `allow-same-origin` — and does not need to. #23's JSX runtime stamps every intrinsic
 * element with `data-spool-source="file:line:col"`, and `canvas.tsx:691` already posts
 * `{path, line, col}` anchors to the shim on every boot to place walk arrows, getting
 * boxes back. An `Edit` gives a line in the same file. So the request shape exists and
 * only the question is new: ask for the line the write touched instead of the line a
 * `data-go` sits on. Nothing has to be compared before and after, because the reboot's
 * stamps are the new file's own.
 *
 * **Where that misses, stated at the grain it misses at.** The stamp is on intrinsic
 * elements; an unstamped element degrades to its nearest stamped ancestor, so a write
 * into a hoisted constant — a menu array at the top of the file — has no element on
 * its line and degrades to the frame's root, which would mark the whole wall for a
 * change to three list rows. Two of the thirteen writes staged here are that case, 15%.
 * A write into a shared component's own file resolves nowhere on this frame and
 * possibly on several others. That is the same gap `data-go` anchoring already lives
 * with rather than new debt, and it is a wrong-grain failure rather than a wrong-place
 * one: the margin over-claims to the whole frame, it never points at the wrong block.
 *
 * **What the still could have given instead, and why it is the wrong object.** The
 * canvas owns consecutive photographs of a frame, and two PNGs can be diffed for
 * changed rows without any document at all — a y and a height, honestly, below the
 * threshold. It is the wrong source for this direction and the numbers say why: it
 * yields three marks rather than thirteen, each 2.55 seconds late, each spanning
 * everything a whole run touched. A margin fed by stills would draw the run *after* the
 * run, once, which is a slower and coarser version of what the rail already prints. The
 * wire knows all thirteen as they happen and knows nothing about where; the still knows
 * three, late, and knows where. This direction takes the wire and pays for it with a
 * zoom threshold, and that is the trade rather than an oversight.
 *
 * **Two lanes, and one of them costs the parent's geometry.** The presence stands at
 * 12 pixels off the wall here instead of 6, because the margin takes the six nearest
 * the frame and two objects on one line would be one object. The head is twice as far
 * from the thing it holds and the whole assembly is wider at every zoom. It buys back
 * one of the parent's named defects and introduces another, which is the honest way
 * to put it: a `shot` outline at 6px reads as a selection ring and at 12 it does not,
 * but the outline is struck from the same number, so its top edge moves from y 40 to
 * y 34 and runs through the frame's own name. Drawn rather than argued, at 26.3s.
 *
 * **One fix that is one character.** `dockOf` broke a tie to the left, and a walk
 * arrow's head lands on a frame's left wall at `x - 9`. `home` in the middle column
 * has 44 pixels on each side, so the parent's rule would have parked the hand and the
 * whole margin under an accent triangle. The tie goes right here. The residual is
 * real: the outgoing edge leaves at the frame's vertical middle and crosses three
 * pixels of the margin lane.
 *
 * **The costs that are not paid off.** The margin makes ink mean age while the grip
 * makes ink mean live, on one wall, six pixels apart — two meanings for one channel,
 * kept apart only by the objects being different shapes, and width decaying with the
 * marks is the belt to that brace rather than a second idea. A block written twice
 * carries one mark that restarts rather than two stacked, which is right for the wall
 * and means the wall cannot count; `×6` stays the rail's. And the margin says nothing
 * about the first row of the turn, because `write home` is `frames/home/frame.json`
 * and geometry moves the rectangle rather than the design — correct, and it means the
 * first seven seconds are carried by presence alone.
 *
 * **Reduced motion is where this direction has no answer, and the answer is not to
 * invent one.** `useTurn` jump-cuts to settled, so no presence is ever drawn and no
 * mark with it. Asked whether a trace has a still form that could survive the cut:
 * the still form of a decaying mark is its end state, and its end state is nothing. A
 * trace has a body only in the middle of its life and a jump cut has no middle. The
 * only version of this direction that survives stillness is the one that never
 * decays, which is the session-scale accrual the measurements above rule out. So
 * stillness and accrual are opposed, and under that setting this frame is the parent
 * frame with a lane of empty wall.
 *
 * The capture is `claude-edits.json`, the same 37.7 seconds as `agent-hand--presence`.
 *
 * One brief clash, recorded: the round's brief asked for content staged so that "each
 * write visibly advances the design", on the understanding that a frame on the canvas
 * is a live iframe and an edit's reboot is visible. Below 400 drawn pixels it is not,
 * so this frame stages three advances rather than thirteen. Where the two disagreed the
 * source won, and the disagreement turned out to be the best argument the direction has.
 */

export default function AgentHandAccrueFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked two different questions: where the
	// agent is, and which blocks it has changed recently enough to still be saying so
	const hand = handOf(script, turn, LANDS);
	// two different numbers on purpose: what the canvas is showing, and what the
	// source actually says. They are the same only for the last two seconds of the turn
	const shown = photographed(elapsed);
	const written = countWrites(script, turn, SUBJECT);

	/**
	 * The site page: `home` between two frames nobody touches. It is in the middle
	 * because the middle is the honest gutter — 44px a side, which is what a canvas
	 * of more than three frames offers everywhere.
	 */
	const site: readonly BaseFrame[] = [
		{ name: "about", screen: "menu", render: KaffeAbout },
		{ name: SUBJECT, screen: "menu", render: () => <KaffeHomeAccrue rev={shown} /> },
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
				{/* nothing is selected anywhere in this frame, so the only marks out here
				    that are not a name or a walk are the agent and what it has left */}
				<PlayField base={site} />
				<AccrueLayer hand={hand} base={site.map((frame) => frame.name)} />
			</CanvasChrome>
		</SpoolShell>
	);
}

/** the frame every row in this capture names */
const SUBJECT = "home";

/**
 * When the canvas gets a new photograph of `home`, and how many writes are in it.
 *
 * Below 400 drawn pixels the frame is a stored still, so the picture does not follow
 * the source — it follows the capture errand. `lifecycle.ts:66` waits
 * `CAPTURE_AFTER_READY_MS` of 1500 after ready, the errand itself takes 660 to 1437ms,
 * and any write landing inside that window bumps the nonce at `canvas.tsx:522` and
 * starts it over. So a still is 2.55s behind at best and a burst of writes yields one
 * photograph, not one each.
 *
 * Across this turn that is **thirteen writes and three photographs** — at 14.5s, 26.8s
 * and 35.4s of 37.7 seconds, carrying six writes, ten and thirteen. They land once per
 * run, and that is not a coincidence: a run ends when the agent stops writing and goes
 * to look, which is the same silence the errand is waiting for.
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
 * `railEntries` does to print `×6`. It is deliberately *not* what the canvas draws:
 * the file is thirteen writes ahead of its own picture for most of this turn. What it
 * does drive is the rail's thumbnail, because `spool shot` boots the frame headless at
 * whatever the source currently says. So the small picture in the transcript is
 * fresher than the large one on the canvas, and at 25.9s the agent photographs a frame
 * ten writes old while the canvas is still showing six.
 */
function countWrites(script: Script, turn: Turn, frame: string): number {
	let count = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) if (turn.at(child.cue)) count += 1;
	}
	return count;
}

/**
 * The picture behind a `look` row, drawn by the same component the canvas draws
 * `home` with, at the revision the turn has reached.
 *
 * A spool screenshot is of a frame spool can still render, so the thumbnail is the
 * frame rather than a stand-in for it — and it is the *source's* frame, because
 * `spool shot` boots a document rather than reading the canvas. Two photographs of one
 * frame are taken 900ms apart here for two different consumers: the agent's own at
 * 25.9s, which is current, and the canvas's at 26.8s, which is what you are looking at.
 */
const SHOT_W = 120;
function picture(shot: ShotRef, writes: number, width = SHOT_W) {
	if (shot.frame !== SUBJECT) return null;
	const scale = width / 240;
	return (
		<div style={{ width, height: Math.round(520 * scale) }}>
			<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
				<KaffeHomeAccrue rev={writes} />
			</div>
		</div>
	);
}
