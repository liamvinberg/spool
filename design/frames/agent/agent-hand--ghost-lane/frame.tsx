import { railEntries, type Script, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, type Turn, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { Ghosted, useGhost } from "./ghost";
import { backlogOf, HandLayer, handOf } from "./ghost-lane";
import { KaffeHomeLane, LANDS } from "./kaffe-home-lane";
import { KaffeAbout, KaffeHours } from "./site-frames";

/**
 * agent-hand--ghost-lane — the wall carries what the picture has not shown yet, and
 * hands it over the moment the picture catches up.
 *
 * Type anything, press Enter, and watch the middle frame and the three pixels beside
 * its right wall. `agent-hand--ghost` is inside the rectangle unchanged: the previous
 * revision drawn over the current one at a hard 0.3, so identical pixels cancel and
 * only what changed shows. `agent-hand--accrue`'s lane is outside it, changed in one
 * respect that changes everything about it. A mark no longer decays. **It stands until
 * its own photograph lands, and then it leaves on the ghost's own curve.**
 *
 * **What the pairing turns out to be.** The case against putting these two together is
 * that they are two objects narrating one event on two clocks, six pixels apart, and
 * the reader has to hold both. That is the wrong description and the numbers say so.
 * There is one clock here, the picture's, and the lane is the debt against it: the wire
 * knows thirteen writes as they land, the picture knows three batches 2.55s late, and
 * the lane is the difference. A speedometer beside an odometer is not two reports. The
 * ghost is the instant the debt is paid, so the lane's ending and the ghost's beginning
 * are the same event drawn once on each side of one wall, which is the reason both
 * objects stay on the same wall rather than being split across two.
 *
 * **The strongest single argument for the pairing is that neither one teaches its own
 * rule and together they do.** A mark that stands until its picture arrives is a
 * quantity nobody can verify by looking: the rule is invisible until you have watched
 * it hold three times. The ghost is the loudest thing that happens in this frame and it
 * fires at exactly the instant the marks go out. It is the lane's legend, and it is a
 * legend made of the thing itself rather than of words.
 *
 * **The decay is gone and nothing replaced it.** `--accrue` derived six seconds from a
 * legal window of `[4.84s, 6.14s]`, 1.3 seconds wide, and its own report named that as
 * the direction's real weakness — a constant measured off one capture, with two runs
 * missing each other by 138ms. Under the backlog rule there is no constant. A mark's
 * life is whatever the errand's lag happens to be: **2,512ms at the shortest, 7,347ms
 * at the longest**, mean 4,543ms across the ten marks this turn draws. And the runs
 * separate structurally rather than by luck, because a run ends when the agent stops
 * writing and goes to look, and that silence is the same silence the capture errand is
 * waiting for. The wall is empty for 6.37s between run one and run two and 3.54s
 * between run two and run three, and nothing had to be tuned for that.
 *
 * **It also passes `--accrue`'s own closing test, exactly rather than nearly.** That
 * frame said that if letting go of the frame had a lot to erase, the decay was too long,
 * and measured one mark left at 19% when the presence went. Here the last photograph
 * lands at 35.4s and the hand lets go at 37.7s, so **the wall is empty for the last 2.3
 * seconds of the turn, because the picture caught up**. Letting go erases nothing.
 *
 * **Deleting the decay removes something this family had banned everywhere else.**
 * `--accrue`'s marks never loop, but five of them going out on overlapping six-second
 * ramps means the wall is in continuous motion for most of a run, and none of that
 * motion is caused by an event. The parent's own law is that everything moving on this
 * canvas is a call opening, a call landing, or a write. A backlog mark is still for up
 * to seven seconds and that stillness is correct: nothing has happened.
 *
 * **The handover, in the two numbers it borrows.** 420ms survives the change of clock
 * and its derivation does not. `--ghost` read the ceiling off the shortest gap between
 * two writes, 573ms; on the photograph cadence the shortest gap between two pictures is
 * 12.3 seconds, so that ceiling is gone. What replaces it is the next call on this
 * frame: the third photograph lands at 35,400ms and the agent's own `shot` opens at
 * **35,825ms**, and a ghost still on screen when the corners strike would be two claims
 * about the whole frame on top of each other. 420 clears 425 by five milliseconds. The
 * marks leave on the same 140 + 280 and the same curve, so for 140ms the ghost is at its
 * cap while the backlog is still at full — one frame and a half where the lane's report
 * and the picture's catch-up are visibly about the same six writes — and then both are
 * going, together.
 *
 * **The busiest single moment is the one where the lane knows the least, and that is
 * the finding.** Not run one: at 11.99s to 14.50s five marks stand for 2.51 seconds and
 * take 145.0 of the wall's 329.3 pixels, **44.0% struck at a flat 0.55**, which is 24.2%
 * of the wall in full ink. The worst is 24.20s to 26.80s, where the two menu writes
 * resolve nowhere and take the whole wall at 0.22 with the footer's mark over them:
 * 348.3 pixels of a 329.3 pixel wall, which is 105.8% because the two overlap, and 25.2%
 * in full ink. So the unresolved pair is not much brighter than a full run, and it is
 * far larger. Across the whole turn the lane spends 1,047 ink-pixel-seconds, a mean of
 * **8.4% of the wall in full ink**, and the two writes that could not say where they
 * landed are **41.1% of that total**. `--accrue` stated the stamping gap as 2 of 13
 * writes. Priced in ink it is two fifths of everything the lane draws.
 *
 * **Why a write that resolves nowhere still gets a mark.** There is no honest option to
 * draw nothing: the picture really is behind, and a lane that went silent about it would
 * be under-reporting the one quantity it exists to report. Over-claiming to the whole
 * frame is a wrong-grain failure rather than a wrong-place one, and under the backlog
 * reading it is a much weaker lie than under `--accrue`'s — *the picture has not caught
 * up here* stretched over a whole frame is still true, where *I changed this* stretched
 * over a whole frame is not. The fix is upstream, in what `jsx-dev-runtime.ts:27` stamps,
 * and not in this drawing.
 *
 * **Strength was freed and it got a real job.** `--accrue` spent it on age, because
 * strength was the only clock it had. With the clock gone, strength goes to the thing
 * that actually varies: how well a mark knows where it is. Located is 0.55, the root
 * claim is 0.22. 0.55 sits under the grip's live 0.85 and over its idle 0.34, which is
 * the right order twice — while a call is open the presence is the loud thing, and in
 * the dead air the backlog is, because in the dead air the backlog is the only news.
 *
 * **Two writes, one mark, and the split that falls out of it.** The lane reports which
 * blocks the picture is behind on, which is a set, so a block written twice adds nothing
 * to it. The grip still flicks on both. **Every write moves the grip; only a new block
 * moves the lane**, and in this turn they disagree four times: writes 4, 8 and 10, plus
 * the `frame.json` write at 117ms that changes the rectangle and not the design, where
 * the grip flicks and both the lane and the ghost are correctly silent.
 *
 * **The lane went outboard, which costs nothing this time.** `--accrue` moved the
 * presence from 6 to 12 so the lane could have the six pixels nearest the frame, and
 * paid for it: the `shot` outline is struck off the same number, so its top edge moved
 * from y 40 to y 34 and ran through the frame's own name. It moved because a closed
 * rectangle 6px off a frame reads as a selection ring. The winner already fixed that
 * differently — four corners never close, so they are not a ring at any weight — which
 * means nothing wants the extra six pixels any more. The presence stays welded at 6 and
 * the lane starts at 10, leaving 2.5px of clear wall between them. Reading away from the
 * frame it is the wall, the thing holding the wall, then what it owes the picture, which
 * is also the order of how permanent they are.
 *
 * **The lane stands level with the picture, not with the file, and that is what divides
 * the labour.** A mark's y is the block's box at the revision *on screen*, because the
 * lane's claim is about the picture and the reader is looking at the picture. So a write
 * that reflows the page is the case the lane cannot narrate: after a reflow every block
 * below has a stale y and only the one that moved can be marked. Two of the thirteen
 * reflow here, one in run one and one in run three, and both times the ghost is the
 * object doing the work — six blocks doubled at 0.3, which is the most expensive thing a
 * write can do and the thing no still can tell you. Run two is the mirror: the lane can
 * only say *somewhere in this frame*, and the ghost shows three menu rows appearing out
 * of blank paper at a known y. One run each way, which is a better argument for the pair
 * than either object makes for itself.
 *
 * **One thing the drawing caught that reasoning did not.** `layoutAt` declares how many
 * lines a block takes and the page has to actually take them, or the box carries slack
 * and the mark beside it inherits the lie. The lede was authored in a 196px measure and
 * the second write's ninety-six characters set two lines there rather than the three the
 * table claimed, so thirteen native pixels of nothing sat under it and the `sub` mark was
 * a third too tall. Narrowing the measure to 140 fixed both at once. That is the risk in
 * every located mark and it is not the runtime's: a lane is only as honest as the
 * geometry it is reading, and here the geometry and the render had to be made the same
 * eleven lines of arithmetic before either could be trusted.
 *
 * **What I found in the winner while retiming it.** `agent-hand--ghost` fires on every
 * write and stages thirteen revisions of `home`. Below 400 drawn pixels there is no
 * document to re-render, so those thirteen re-renders are an event the product does not
 * have — the regime `--accrue` established and this brief settles. On the photograph
 * cadence the ghost fires three times and **each firing carries a whole run**, which is
 * a much fuller frame at the same cap. That is not a defect in the direction, it is a
 * different picture of it, and it is the one that is drawable at canvas zoom.
 *
 * **The same clock makes the ghost far cheaper than its own report says.** The parent's
 * hardest cost is that the old DOM is gone: an edit reboots the document with a fresh
 * `key`, so its remedy is to hold the outgoing iframe mounted and frozen under the
 * incoming one, two documents alive at once. None of that applies below the threshold,
 * because there is no document on either side of the seam. The frame is a stored still
 * and the thing being replaced is the previous still, which `writeCover` currently
 * deletes. Keeping one file instead of none is the whole implementation at canvas zoom,
 * and `coverPlan` at `frame-shell.tsx:67` already puts a stored still over a frame and
 * fades it out over 180ms. **The expensive version of this direction is the one nobody
 * is looking at.**
 *
 * **Where the backlog rule breaks, stated rather than left to be found.** It needs every
 * mark to have a clearing event, and the photograph is not guaranteed to be one: the
 * capture errand is opportunistic, it borrows the frame when the canvas is idle
 * (`lifecycle.ts:375-377`), and a turn whose last write is followed immediately by the
 * end has no picture coming. The fallback is the hand letting go, inherited from
 * `--accrue`, and it is a fallback rather than a meaning — a mark cleared that way was
 * never shown, so the lane's claim is false for exactly that clearing. Second, a mark's
 * life is now data-dependent rather than constant, so the lane has no rhythm of its own;
 * a photograph landing inside a run would half-clear it and cut the run's shape in two.
 * It does not happen in this capture — the longest gap inside a run is 1,567ms against
 * the errand's 1,500ms restart window plus its own 660 to 1,437ms — but nothing prevents
 * it. Third, and the one that would kill it: the whole object is legible only if a person
 * connects the marks going out to the picture changing, and if they read the two as
 * unrelated the frame is busy on both sides of one wall for 420ms, three times, which is
 * precisely the objection this frame was built to test.
 *
 * **The word.** `home` is the middle column and both gutters are 44px against the 64
 * `edit ×6` wants, so no word is drawn anywhere here. The lane takes 13 of those 44 and a
 * word would still want 64, so whatever answers that question is not answering it out of
 * this gutter. Left where it is for whoever owns it.
 *
 * Under `prefers-reduced-motion` `useTurn` jump-cuts to settled, so no presence is drawn
 * and no lane with it, and the ghost is disabled outright rather than degraded, because a
 * jump cut takes the revision from 0 to 13 in one commit and a ghost of the found design
 * over the finished one is the whole frame doubled. Stillness gets the design the agent
 * left, with nothing over it and nothing beside it. That is the page-wide gap, unfixed
 * here and named.
 *
 * The capture is `claude-edits.json`, the same 37.7 seconds both parents play.
 */

/** the frame every one of this capture's twenty-one rows names */
const SUBJECT = "home";

/**
 * When the canvas gets a new picture of `home`, and how many writes are in it.
 *
 * Below 400 drawn pixels the frame is a stored still, so the picture does not follow the
 * source, it follows the capture errand: `lifecycle.ts:66` waits `CAPTURE_AFTER_READY_MS`
 * of 1500 after ready, the errand itself takes 660 to 1,437ms, and any write landing
 * inside that window bumps the nonce at `canvas.tsx:522` and starts it over. So a still
 * is 2.55s behind at best and a burst of writes yields one photograph rather than one
 * each. Thirteen writes, three photographs, one per run: 11,988 + 2,550 is 14,538, 24,203
 * + 2,550 is 26,753, and 32,837 + 2,550 is 35,387.
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
 * A run's children are the calls it collapsed, so this is the same arithmetic
 * `railEntries` does to print `×6` — one number, three surfaces. It is deliberately not
 * what the canvas draws: the file is up to thirteen writes ahead of its own picture, and
 * that gap is the quantity the lane exists to carry.
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
 * The picture behind a `look` row, drawn by the same component the canvas draws `home`
 * with, at the revision the source has reached.
 *
 * `spool shot` boots a document rather than reading the canvas, so the small picture in
 * the transcript is fresher than the large one out here. At 25.9s the agent photographs a
 * frame ten writes old while the canvas is still showing six, and the lane is what says
 * so.
 */
const SHOT_W = 120;
function picture(shot: ShotRef, written: number, width = SHOT_W) {
	if (shot.frame !== SUBJECT) return null;
	const scale = width / 240;
	return (
		<div style={{ width, height: Math.round(520 * scale) }}>
			<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
				<KaffeHomeLane rev={written} />
			</div>
		</div>
	);
}

export default function AgentHandGhostLaneFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked a different question: not what happened,
	// but where the agent is and whether it is doing anything there
	const hand = handOf(script, turn);

	// the two numbers this frame is built on. `shown` is the picture, `written` is the
	// file, and everything between them is work the canvas has not caught up with
	const shown = photographed(elapsed);
	const written = countWrites(script, turn, SUBJECT);
	const backlog = backlogOf(LANDS, shown, written);
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
			render: () => <Ghosted rev={shown} ghost={ghost} draw={(at) => <KaffeHomeLane rev={at} />} />,
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
				{/* nothing is selected anywhere in this frame, so the only marks out here that
				    are not a name or a walk are the agent, what it owes the picture, and what
				    the picture just replaced */}
				<PlayField base={site} />
				<HandLayer hand={hand} backlog={backlog} shown={shown} base={site.map((frame) => frame.name)} />
			</CanvasChrome>
		</SpoolShell>
	);
}
