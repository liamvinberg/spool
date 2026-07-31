import { railEntries, type Script, type ToolRow, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, type Turn, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { Ghosted, useGhost } from "./ghost-reel";
import { KaffeHomeReel, LANDS, WRITES } from "./home-reel";
import { handOf, ReelLayer } from "./reel";
import { KaffeAbout, KaffeHours } from "./site-frames";

/**
 * agent-hand--loud-reel — the compile, with the presence built out of spool's own rail
 * mark, and the rectangle redrawing on every write.
 *
 * Type anything and press Enter, and watch the middle frame. It changes thirteen times
 * in thirty-seven seconds, and it is the first frame in this family to do so.
 *
 * ## Two things are being answered at once
 *
 * **The first is a defect.** `agent-hand--ghost` reads the writes off the wire and draws
 * the frame at the revision the source has reached, thirteen times, and it is the only
 * reason it feels alive. Every frame built after it was told to draw the *photograph*
 * cadence instead — three revisions at 14.5s, 26.8s and 35.4s, nothing at all for the
 * first fourteen and a half seconds — on the correct observation that below
 * `LIVE_MIN_CSS_PX` the canvas shows a stored cover rather than a live document. Correct
 * about the code and wrong about the design: it means six writes land and the rectangle a
 * person is watching does not move once. This frame draws the target instead. `writesOn`
 * is the whole of the fix and it is four lines.
 *
 * **The second is the question the brief actually asks.** Spool has spent months building
 * a thread vocabulary for the rail: seven marks in `shared/ui/spool-wisp-marks.tsx` with
 * measured boxes and argued durations, three drawings of the real logo in
 * `spool-ribbon-mark.tsx`, six stroke takes in `spool-spun-rail.tsx`. **Sixteen worked
 * explorations, none of which has ever been drawn outside a 420px rail.** `--spool` took
 * exactly one idea out of it. This takes the mark itself.
 *
 * The answer is `reel`, and `reel.tsx` carries the inventory: which of the sixteen
 * survived the move outdoors, which failed and on what. The short version is that
 * fifteen of them fail and they fail for one reason wearing five faces — **they are all
 * motion end to end, and the canvas cannot have idle animation.** `reel` ports because it
 * is the only mark on either row with a stationary part.
 *
 * ## What is on the frame
 *
 * Six channels, the compile's, with one of them rebuilt and one of them corrected:
 *
 *   core      `reel`'s bobbin, at `--spool`'s length: the whole wall while the agent is
 *             taking the frame in, a 76px run while it is changing it, off the wall
 *             entirely while it photographs it.
 *   threads   three, paying off the core at the mark's own three spans — 6.04, 4.11 and
 *             5.16 of a 7px budget, long-short-long. Out while a call is open, drawn back
 *             to a stub when none is, flush to the budget for a quarter second on a write.
 *   plate     `--plate`'s word and its count, unrolled out of the core. No shut state.
 *   lane      `--accrue`'s mark per write, at the height of the block it changed.
 *   corners   `--ghost`'s four corners for the `shot` posture, never closing.
 *   ghost     the previous revision at a 0.3 cap, now thirteen times rather than three.
 *
 * ## What the write clock puts back
 *
 * **`--ghost`'s 420ms is a measured number again.** It was set against 573ms, the shortest
 * interval between two writes in this capture, on the rule that a ghost still alive when
 * the next write lands is a ghost of the wrong revision. The compile observed that 420 then
 * sat twenty times inside its ceiling — true, because on three photographs the ceiling had
 * stopped applying. Thirteen writes put it back: 420 against 573 leaves **153ms of clear
 * air** at the tightest moment in the turn.
 *
 * **And the ghost stops being the thing that reads as a rendering fault.** A ghost of a
 * whole run doubled 42.2%, 14.8% and 57.8% of the frame's area, and the compile's honest
 * verdict was that at 57.8% *which one is the past* is unanswerable. A ghost of one write
 * doubles one block plus whatever its reflow moved. Four of the thirteen move what is under
 * them; nine change in place.
 *
 * **The lane stops lying about a page nobody can see.** `--accrue` and the compile placed a
 * mark level with the box its write made, which for most of the turn was a page the canvas
 * would not draw for another eight seconds. Now the box the mark is level with and the box
 * on screen are the same box.
 *
 * ## The measurements this frame owns
 *
 * The thirteen writes land at 7153, 8758, 9331, 9924, 10721, 11988, 20868, 22435, 23221,
 * 24203, 30341, 31648 and 32837ms. Within a run the gaps are **573 to 1605ms**; the runs
 * span 4.835s, 3.335s and 2.496s and stand 8.880s and 6.138s apart. The lane's six-second
 * life is re-derived against that rather than inherited: a mark must outlive its own run
 * (4.835s) and two runs must stay apart (6.138s), so six sits inside [4.835, 6.138] with
 * room at both ends.
 *
 * The dead air is **21.6 of 37.7 seconds** — eleven gaps, shortest 819ms, longest 4.134s.
 * That number is why `reel` is the take that ported: its `sent` picture is the core with
 * nothing off it, the rarest state in a rail, and out here it is what the canvas looks like
 * for 57% of a turn.
 *
 * ## The thing drawing it caught
 *
 * The presence anchors at the frame's vertical centre, y 210.5. The outgoing walk edge
 * leaves at x 465, y 204 and curves to the next frame's arrowhead at x 497, y 232; solved
 * against the stand-off line at x 477 it crosses at **y 210.1**. The presence's anchor and
 * an accent-coloured connection between two frames are **four tenths of a pixel apart**,
 * and have been in every frame of this family since `--presence`. Nothing here fixes it —
 * moving the anchor breaks the comparison the family rests on — and the reel is only what
 * made it visible, because three threads reaching into the gutter are wide enough to be
 * crossed rather than merely touched.
 *
 * ## What is still wrong, inherited
 *
 * The stand-off is still 15 and the corners still strike the frame's own name in its y 29
 * to 41 line box. That number is forced by the plate's 16px width and by the lane's claim
 * on the five pixels nearest the wall; a cheaper presence cannot buy it back. The plate
 * still wants 51px to hold `edit ×6` against `--plate`'s fixed 38, and the count is still
 * the second write counter on this wall.
 *
 * ## Reduced motion
 *
 * `useTurn` jump-cuts to settled, so `handOf` returns null and nobody is ever at the frame:
 * no core, no threads, no plate, no lane, no corners, and the ghost disables itself rather
 * than degrading, because a jump cut takes the revision from 0 to 13 in one commit. **Six
 * channels degrade to zero**, and there is one portability finding hiding in that: `reel`
 * has a designed frozen fallback, four shapes the rail keeps when the motion stops, and the
 * canvas throws all of it away. Out here it is the *turn* that stops, not the animation, so
 * a mark's still picture has nothing to be still about. What is left is the design the agent
 * finished with, and nothing over it.
 */

/** the frame every one of this capture's twenty-one rows names */
const SUBJECT = "home";

const SHOT_W = 120;

/**
 * Writes landed on the frame's source, which is what makes it redraw.
 *
 * The spine of the frame, and `agent-hand--ghost`'s own reader unchanged. A run's children
 * are the calls it collapsed, so this is the same arithmetic `railEntries` does to print
 * `×6` — one number, two surfaces. `write` is excluded and `edit` is not: the capture's
 * single `write home` is the geometry sidecar, and a redraw of a design that did not change
 * is nothing, which is the correct drawing of it.
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
 * One number for every row rather than one per row, so an older `look` in the log shows the
 * newest picture. That is this frame's stand-in being cheap rather than the direction saying
 * anything: `ShotRef` carries a path, a media type and a frame, and nothing that tells two
 * shots of one frame apart.
 *
 * It matters more here than it did in the compile, which drew the thumbnail at whatever the
 * source currently said. With the canvas following every write, a `shot` taken at 25.9s and
 * looked at during the run that follows is a picture of a page the canvas has already moved
 * past — so the small picture in the transcript is now correctly *behind* the large one,
 * where before it was correctly ahead.
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

export default function AgentHandLoudReelFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked two different questions: where the agent is,
	// and which blocks it has changed recently enough to still be saying so
	const hand = handOf(script, turn, LANDS);

	// the spine. One number, read off the wire, and the rectangle follows it — which is the
	// whole of the difference between this frame and the five above it
	const rev = writesOn(script, turn, SUBJECT);
	const ghost = useGhost(rev);
	const shotAt = shotRev(script, turn);

	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== SUBJECT) return null;
		const scale = width / 240;
		return (
			<div style={{ width, height: Math.round(520 * scale) }}>
				<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
					<KaffeHomeReel rev={shotAt} />
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
			render: () => <Ghosted rev={rev} ghost={ghost} draw={(at) => <KaffeHomeReel rev={at} />} />,
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
				{/* nothing is selected anywhere in this frame, so every mark out here that is not a
				    name or a walk belongs to the agent — which is the whole point */}
				<PlayField base={site} />
				<ReelLayer hand={hand} base={site.map((frame) => frame.name)} />
			</CanvasChrome>
		</SpoolShell>
	);
}
