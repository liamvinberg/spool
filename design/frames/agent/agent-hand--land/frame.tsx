import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { pictureRev, sourceRev } from "./errand";
import { HandLayer, handOf } from "./hand";
import { KaffeHomeLand } from "./kaffe-home-land";
import { KaffeAbout, KaffeHours } from "./site-frames";

/**
 * agent-hand--land — add nothing. The frame changing is the effect.
 *
 * Type anything, press Enter, and watch `home` in the middle of the row. The
 * presence is `agent-hand--presence`'s, copied with one line changed and nothing
 * added, and no new object is drawn anywhere. What is different is that `home` is a
 * page on its way somewhere: thirteen writes carry it from a first pass to a finished
 * front page, and the proposal under test is that watching it become that is
 * already "seeing the elements appear", so every other direction this round is
 * decoration on a thing the product does for free.
 *
 * **The premise I was handed is false at this zoom, and finding that out is most of
 * what this frame is for.** A frame on the canvas is a live iframe only above 400
 * drawn pixels: `cover.ts:8` sets `LIVE_MIN_CSS_PX = 400` and `lifecycle.ts:245`
 * refuses to mount a document under it. At the 39% this whole family draws, `home`
 * is 152px, so it is not a live document at all — it is a stored still, and
 * `frame-shell.tsx` holds that still opaque over the booting document for the whole
 * of a reboot. So there is no reboot to see. There is a photograph replaced by a
 * photograph. The crossover is 400 ÷ 390, which is 103%: this direction is exactly
 * right above that zoom and exactly wrong below it, and the round is being argued
 * below it.
 *
 * **Thirteen writes, three photographs.** Fourteen if you count the way the
 * transcript counts, and the first one is `frames/home/frame.json`, which
 * `events.ts:174` drops before it is ever an event — a resize must never read as a
 * source edit. The remaining thirteen arrive in runs of six, four and three with
 * internal gaps of 573ms to 1605ms, against an errand that takes 2.55s at best
 * (CAPTURE_AFTER_READY_MS 1500 plus #94's own 660-1437 for the errand itself). Each
 * write bumps the document nonce and stales the picture (`canvas.tsx:522`), so a
 * write inside that window throws the previous errand's work away and restarts the
 * clock. Only the last write of a run gets through, and it brings its whole run
 * with it. The three landings fall at 14.5s, 26.8s and 35.4s, every one of them
 * after the agent has already moved to the next verb.
 *
 * **Which means the first 14.5 seconds of a 37.7 second turn show the page nobody
 * has touched yet**, while the transcript has logged a write, a shot, a look and six
 * edits. That is 39% of the turn in which the canvas is honestly, correctly, and
 * completely out of date.
 *
 * **The legibility question, measured rather than guessed.** Every revision was
 * rendered at the canvas's own 152×329 and diffed against its neighbour at device
 * scale 2, counting pixels more than 8/255 apart. A single write changes a median
 * of **0.42%** of the frame; six of the thirteen change under 0.3%; the quietest is
 * the header rule gaining two 11px hairlines at **0.04%**, four rows out of 329. The
 * three landings, because they carry whole runs, measure **15.79%**, **26.67%** and
 * **0.70%**. So batching is what makes this direction work at all: the first two
 * landings redraw a sixth and a quarter of the rectangle and cannot be missed by
 * anyone looking at it. The third is three text edits — a button word, a footer
 * address, a lede's last sentence — landing as three bands five and six rows tall,
 * and the plain answer to whether you can see it is no. Not at 39%, not if you are
 * looking straight at it.
 *
 * **The thing I did not know, and it is the defect.** I expected to have to argue
 * about the tear in a reboot: the document goes away and comes back, so something
 * flashes. Nothing flashes. `frame-shell.tsx:180` holds the cover at full opacity
 * for the entire errand and the honest "booting" badge is gated on `entered && !ready
 * && !walk`, which a frame nobody went inside never satisfies. And the swap itself
 * is `thumbnail.tsx`, a plain `<img>` whose `src` changes — no fade, no crossfade,
 * no blank. So the change has no gap to cover, and no temporal signal either. A 27%
 * redraw arriving as a hard cut between two still images is the one transition
 * peripheral vision cannot catch: the eye already on that rectangle sees everything,
 * and the eye anywhere else on a canvas of three frames and a rail sees nothing at
 * all and has no way to know it missed anything. The problem is not that the change
 * is too small. Two thirds of the time it is enormous. The problem is that it is
 * instantaneous and silent.
 *
 * **What I did with the grip: nothing, and the measurement is the reason.** The
 * question this direction was asked to settle is whether the presence should go
 * quiet about edits once the content is speaking, and the answer is that the content
 * is not speaking when the editing is happening. The run of six takes 4.8 seconds and
 * the picture arrives 2.55 seconds after it ends, so the seven seconds in which the
 * agent is most plainly at work are the seven seconds in which the frame is most
 * plainly still. The grip keeps its flick per write, unchanged, because it is the
 * only thing on the canvas that is true in real time. And it cannot say more than
 * that here: `home` sits in the middle column with 44px of gutter on both sides
 * against the 64 a word needs, so `dockOf` drops the chip and the presence is a head
 * and a grip. The division that falls out is presence for *now*, content for *what*,
 * and two and a half seconds between them.
 *
 * **The one line that did change is the tie-break, and it is a defect fix rather
 * than a preference.** A frame in the middle has equal gutters, so the parent's
 * `left >= right` was choosing the left wall on nothing at all — and the left wall
 * is where an incoming walk lands its arrowhead, at `ROW_1 + 186`, 21.5px under the
 * head and straight through a grip of any length. Rendered at 10x it reads as the
 * walk ending in the presence. On a tie the object now takes the wall the walk
 * leaves from: the outgoing edge is a 1.5px tail crossing a 3px bar, which is what
 * every other crossing on a canvas looks like. It is not free. The tail's anchor sits
 * at `ROW_1 + 158`, 6.5px above the head, so at 39% a faint hairline grazes the top
 * corner of a 7px square before curving away. The mid-wall the presence docks on and
 * the 30px the thread layer anchors in are the same piece of wall, and no choice of
 * side gets out of that.
 *
 * **A second thing fell out: the rail is ahead of the canvas.** `spool shot` boots
 * the frame headless off disk, so a picture in the transcript is of the source
 * rather than of the cover. The shot at 25.9s photographs a page with ten writes in
 * it while the frame beside it is still showing six, and stays that way for another
 * 0.9 seconds. The rail's thumbnail here renders at the source revision for that
 * reason.
 *
 * **The costs.** The whole argument is a function of zoom, and 39% is the zoom the
 * family chose. The batching that rescues two of the three landings is an accident
 * of this turn's write rate against the errand's length — a turn writing once every
 * four seconds gets thirteen 0.4% cuts instead of three large ones, and every one of
 * them is invisible. `shotView` is handed a path rather than a row, so all four
 * `look` rows draw the same picture; that is inherited from the parent and not fixed
 * here. And the layer is still a sibling of `PlayField` drawing in the field's
 * copied coordinates, so this frame can never move the camera.
 *
 * Under `prefers-reduced-motion` the turn is a jump cut to settled and `useTicker`
 * returns infinity, so the page draws at thirteen writes with no presence and no
 * landing: the finished design, and nobody at it. For this direction that degrades
 * further than for the others, because here the design *was* the animation.
 *
 * **The verdict, plainly. Add nothing is not enough at 39%, and it is enough above
 * 103%.** What is missing is not a mark saying an edit happened — the design says
 * that, over a sixth and a quarter of its own area. What is missing is a *temporal*
 * signal on a change that has none. So the smallest honest fix is a transition on
 * the cover swap, not a new object on the canvas, and any of the other four
 * directions that answers this with a badge, a glow or a second token is answering
 * a question the measurement says is not the one being asked.
 */

/** the frame every one of the twenty-one rows in this capture names */
const SUBJECT = "home";

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"] },
	{ name: "site", frames: ["about", "home", "hours"], active: true, open: true },
];

const SHOT_W = 120;

export default function AgentHandLandFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// two revisions, and keeping them apart is the finding: what is on disk, and
	// what the canvas has managed to photograph of it
	const written = sourceRev(script, turn, SUBJECT);
	const shown = pictureRev(script, elapsed, SUBJECT);

	/*
	 * `home` in the middle, so the presence is drawn against the gutter it really
	 * has. `agent-hand--plate` found the parent flattered itself by docking on the
	 * 114px end of the row; both of this frame's gutters are 44.
	 */
	const site: readonly BaseFrame[] = [
		{ name: "about", screen: "menu", render: KaffeAbout },
		{ name: SUBJECT, screen: "menu", render: () => <KaffeHomeLand rev={shown} /> },
		{ name: "hours", screen: "menu", render: KaffeHours },
	];

	const hand = handOf(script, turn);

	/**
	 * The picture behind a `look` row. `spool shot` boots the frame headless and
	 * rasterises whatever is on disk, so this is the source revision rather than the
	 * one the canvas is showing — which is why it can be four writes ahead of the
	 * rectangle sitting next to it.
	 */
	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== SUBJECT) return null;
		const scale = width / 240;
		return (
			<div style={{ width, height: Math.round(520 * scale) }}>
				<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
					<KaffeHomeLand rev={written} />
				</div>
			</div>
		);
	};

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
				{/* nothing is added over the field: the frame's own contents are the
				    whole of what this direction proposes to draw */}
				<PlayField base={site} />
				<HandLayer hand={hand} base={site.map((frame) => frame.name)} />
			</CanvasChrome>
		</SpoolShell>
	);
}
