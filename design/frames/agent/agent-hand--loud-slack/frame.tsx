import { railEntries, type Script, type ToolRow, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, type Turn, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { Ghosted, useGhost } from "./ghost-slack";
import { KaffeHomeSlack, LANDS, WRITES } from "./home-slack";
import { KaffeAbout, KaffeHours } from "./site-frames";
import { handOf, SlackLayer } from "./slack";

/**
 * agent-hand--loud-slack — the compile, on the clock the canvas is meant to run on,
 * with the presence rebuilt so the thread carries a quantity instead of a state.
 *
 * Type anything and press Enter, and watch the middle frame. It redraws thirteen times
 * in thirty-seven seconds, once per write, and the line beside it sags further with
 * every one of them and springs back when the run closes.
 *
 * ## What pulls on the thread
 *
 * `agent-hand--spool` gave the line two positions and derived a good envelope for
 * moving between them, and it is a boolean in a physical costume: taut while a call is
 * open, slack while none is. A thread under a hundred kilos and a thread under one draw
 * identically there.
 *
 * Here the line has a **load**, and the load is what the agent is holding at this frame
 * right now. Nothing between calls. One for a call that does one thing — a `look`, a
 * `shot`, a `logs`. And for a run of writes, **however many writes the run has landed
 * so far**, so a run gets heavier as it goes and puts everything down at once when it
 * closes. The line bows away from the frame in proportion, and the depths are 0, 4.7,
 * 7.1, 8.7, 9.7, 10.4 and 11.0 pixels for loads zero through six.
 *
 * **This inverts `--spool` and the inversion is the decision, not a side effect.** A
 * quantity needs a zero and slack is not one: it is the maximum of a different
 * quantity. So the null state is a straight, still line and every departure from
 * straight is load. What that buys is a ruler the object carries itself — the loaded
 * span is 38 pixels directly under the head, and everything above it and below it is
 * the same line, at the same x, dead straight.
 *
 * ## How many levels are actually legible, measured
 *
 * Rendered and shot, cropped to the gutter, at loads 0 through 6:
 *
 *   0 → 1     4.7px of new deflection, against a straight line. Unmistakable.
 *   1 → 2     2.4px. Readable side by side, not from memory across a gap.
 *   2 → 3     1.5px. At the edge. Two crops have to be adjacent to call it.
 *   3 → 4     1.0px, and 4 → 5 is 0.7, and 5 → 6 is 0.6. Not readable at all.
 *
 * So **three bands, not seven**: nothing, one thing, a run under way. And the run's own
 * growth from 4.7 to 11.0 is 6.3 pixels, which is clearly visible as a whole and is
 * read as *motion* rather than as a level — the line is still going down, so the run is
 * still going on. What a frozen frame cannot tell you is whether it is at four or at
 * six, and the frame stops claiming it can: the exact number is the rail's, one row
 * away, printed as `edit ×6`.
 *
 * That is a smaller claim than the direction promises and it is still more than
 * `--spool` can make, which is that at any frozen moment you can tell a `look` from a
 * run in progress without waiting to see what the line does next.
 *
 * ## The spine, and what it broke
 *
 * The mock frame re-renders on every write. `rev = writesOn(script, turn, SUBJECT)`, and
 * every timing in this frame is re-derived against that clock rather than against the
 * three-photograph cadence the compile inherited. Writes land 573ms to 1,605ms apart
 * inside a run, the run of six spans 7,153 to 11,988, and the eleven gaps between calls
 * run 741ms to 3,860ms.
 *
 * **The backlog does not survive it.** `agent-hand--ghost-lane`'s best idea was that a
 * mark stands until its own photograph lands, so the lane is exactly the writes the
 * picture has not shown yet — a real quantity with a real end and no constant in it,
 * which is what let it delete `--accrue`'s magic six seconds. That quantity is
 * `written - shown`, and on the write clock `written` and `shown` are the same number at
 * every instant. It is not smaller here. It is **identically zero for all 37.7 seconds**,
 * and a lane built on it draws nothing at all.
 *
 * So the honest statement about `--ghost-lane` is that **its subject exists only under
 * the lag, and the lag is the bug.** Below `LIVE_MIN_CSS_PX` a frame is a stored
 * photograph and the backlog is real; above it the document is live and there is no
 * such thing. The maintainer's instruction is the live regime, so the backlog is a
 * true object of the regime nobody wants to be in.
 *
 * **What survives is the shape of its rule rather than its quantity.** A mark stands
 * until the work it belongs to is finished, and the work is the run. The run's close is
 * an event on the wire, so there is still no chosen number anywhere, and the lane now
 * says *where this run has been so far*. The lane and the thread report one thing two
 * ways: the thread weighs it, the lane itemises it, and they clear in the same gesture.
 * They also disagree usefully — run 2 is four writes into two blocks, so the line bows
 * to load 4 while the lane holds two marks.
 *
 * ## What else moved on this clock
 *
 * **The ghost's 420ms is right again.** The compile found it sitting twenty times inside
 * its own ceiling, because three photographs are 12.3s and 8.6s apart. Thirteen writes
 * are 573ms apart at the tightest, which is the ceiling `--ghost` measured in the first
 * place, and 420 clears it by 153ms with two ghosts never alive at once.
 *
 * **The ghost got louder rather than quieter, which I did not expect.** Per write, the
 * doubled area peaks at **61.7% at write 11** — the headline gaining a line and pushing
 * four blocks down the page. The compile's worst was 57.8% for a whole run of three. A
 * per-write ghost is worse than the run containing it because run 3's own write 12 crops
 * the hero by 26px and undoes part of write 11's reflow before anything is photographed,
 * and firing on every write never gets that cancellation. Nine of the thirteen are under
 * 10% and the median is 9.0%, so it is one bad case rather than a bad channel, and the
 * 0.3 cap is doing more work than the compile credited it with.
 *
 * **The lane's marks stand on the picture instead of on a remembered layout.** Both
 * parents compromised: `--accrue` and the compile drew a mark at the box its block had at
 * the write that made it, `--ghost-lane` at the box the stale photograph still showed.
 * Here they are the same box, so a mark is simply level with its block. The bill is that
 * a reflow drags every standing mark down with it, on the same 220ms the posture moves
 * on.
 *
 * ## The collision the compile could not solve, taken
 *
 * The compile measured it exactly and left it: struck from the presence's 15px
 * stand-off, the `shot` corners' top rail lands at y 31 and the frame's own name sets in
 * a 12px line box running y 29 to 41, and no single value clears both the name and the
 * lane. It also named the only escape that deletes no channel — decouple the corners
 * from the stand-off — and did not take it. **Taken here.** The corners are struck at 6,
 * their top rail is at y 40, and the name clears by a pixel.
 *
 * The cost is the reading that the shot ink is the grip's own leaving the wall, and most
 * of that was already spent when `--ghost` broke the ring into four corners: four corners
 * are not a path a line can walk out onto and back, so they were their own mark already.
 * What is left to lose is a shared number, and it buys the frame's name back.
 *
 * ## What was cut, and it is the compile's own first cut
 *
 * **The plate's count.** `--plate` fixed the box at 38 on the argument that the verb
 * vocabulary is closed at `label()` and *the plate never resizes* is the whole of what
 * the object buys over a chip; `edit ×6` wants 51 and `edit ×13` wants 56, so a run
 * length has no bound and the guarantee cannot hold. It comes off for that reason and
 * for one more: **the bow is the count**, drawn as weight nine pixels away, so keeping
 * `×N` would be the third counter on this screen after the rail's row and the line
 * itself. The plate is back to 38 and the vocabulary is closed again.
 *
 * ## The costs, plainly
 *
 * The steps compress and the curve is built to compress them: 0 to 1 is 4.7 pixels
 * because nothing to something is the largest change of meaning available, and 5 to 6 is
 * 0.6 because by then it is not. Anyone reading the object for an exact number will be
 * wrong, and nothing on the wall stops them trying.
 *
 * The assembly is wider. The compile reached 23 pixels into a 44px gutter; this reaches
 * 27 at the capture's deepest load and 31 at the asymptote, which is 70% of the space
 * between two frames. The bow is also the first thing in this family that grows toward
 * the neighbour rather than sitting still, so what a reader sees in the gutter is now
 * partly a function of how busy the agent is.
 *
 * The residual on the walk graph is worse than the compile's, not better. The outgoing
 * edge leaves at x 465, y 204, and the loaded span runs y 210 to 248 on the same wall, so
 * an accent-coloured connection now sets off a few pixels above a line that is moving.
 *
 * And the plate still covers the 38 pixels of straight thread above the head while a
 * call is open, which is the reference half at exactly the moment the load is deepest.
 * The frame's own wall, 15 pixels in, is what is left to read against. That is inherited
 * from the compile rather than introduced, and it is the one thing I would fix next.
 *
 * ## Reduced motion
 *
 * `useTurn` jump-cuts to settled, so nobody is ever at the frame and none of this draws
 * at all — a page-wide gap this frame does not fix. Were a turn to run, every duration
 * here is zero: the bow steps between depths, the posture cuts between lengths, the lane
 * appears and clears without fading, and the ghost is disabled outright rather than
 * degraded, because a jump cut takes the revision from 0 to 13 in one commit and a ghost
 * of the found design over the finished one is the whole frame doubled.
 *
 * **A depth is a shape, so the quantity survives having no motion in it.** That is the
 * one thing this direction can say that a rate or a pulse cannot: freeze it and the load
 * is still on the line.
 */

/** the frame every one of this capture's twenty-one rows names */
const SUBJECT = "home";

const SHOT_W = 120;

export default function AgentHandLoudSlackFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked a different question: where the agent is,
	// and how much it has on the line there
	const hand = handOf(script, turn, LANDS);

	// the spine. Thirteen revisions, one per write, and the canvas draws every one of
	// them the instant the wire says so. `write home` at 117ms is `frames/home/frame.json`
	// and is deliberately not one of them, which is why the first thing this turn does
	// moves the thread and leaves the picture alone
	const rev = writesOn(script, turn, SUBJECT);
	const ghost = useGhost(rev);

	// a picture is of the frame as it was when it was taken, and this turn rewrites that
	// frame thirteen times, so the thumbnail is drawn at the revision the last `shot`
	// caught rather than at the one on the canvas now. `--ghost`'s own, and it matters
	// here because the two numbers really do differ: the shot at 25.9s catches ten
	const shotAt = shotRev(script, turn);
	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== SUBJECT) return null;
		const scale = width / 240;
		return (
			<div style={{ width, height: Math.round(520 * scale) }}>
				<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
					<KaffeHomeSlack rev={shotAt} />
				</div>
			</div>
		);
	};

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
			render: () => <Ghosted rev={rev} ghost={ghost} draw={(at) => <KaffeHomeSlack rev={at} />} />,
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
				{/* nothing is selected anywhere in this frame, so every mark out here that is
				    not a name or a walk belongs to the agent */}
				<PlayField base={site} />
				<SlackLayer hand={hand} rev={rev} base={site.map((frame) => frame.name)} />
			</CanvasChrome>
		</SpoolShell>
	);
}

/**
 * Writes landed on the frame's source, which is what makes it redraw.
 *
 * A run's children are the calls it collapsed, so this is the same arithmetic
 * `railEntries` does to print `×6` — one number, two surfaces. `write` is excluded and
 * `edit` is not: the capture's single `write home` is the geometry sidecar, and a
 * revision of a design that did not change is not a revision.
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
 * the newest picture. That is this frame's stand-in being cheap rather than the
 * direction saying anything: `ShotRef` carries a path, a media type and a frame, and
 * nothing that tells two shots of one frame apart.
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
