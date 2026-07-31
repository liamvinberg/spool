import { railEntries, type Script, type ToolRow, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, type Turn, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { KaffeHomePhone, KaffeHomeWide, LANDS, WIDE, WRITES } from "./kaffe-home-both";
import { handOf, MarkLayer } from "./marks";
import { KaffeAbout, KaffeHours } from "./site-frames";
import { useWipe, Wiped } from "./wipe";
import { PHONE_H, WIDE_H, WipeField } from "./wipe-field";

/**
 * agent-hand--edit-wipe — the change is applied rather than swapped, and you can follow it.
 *
 * Type anything and press Enter, and watch both frames. The agent takes hold of `home` at
 * 117ms and does not let go for thirty-seven seconds; in that time it writes the geometry,
 * photographs the frame, looks at the picture, and lands thirteen writes on the source in
 * runs of six, four and three. Every one of those thirteen is put into the page by a
 * boundary that starts at the top of the frame and travels to the bottom, with the design
 * the write made above it and the design it replaced below it. There is no cut. You watch
 * the page get rewritten, in an order, over 274 milliseconds.
 *
 * **The argument.** Every direction in this round shows the *result* of a write: something
 * is different, or something arrived. An instantaneous swap is the one transition
 * peripheral vision cannot catch, which `agent-hand--land` proved by measurement, and it is
 * the wrong failure to accept here because the person is usually reading the rail rather
 * than the canvas. A travelling reveal is the opposite kind of event. It occupies time and
 * space, so it can be caught out of the corner of an eye, and the corner of an eye is where
 * this whole family is actually being read from.
 *
 * ## What travels, and the objection that turned out not to hold
 *
 * **The boundary travels, and the whole frame is under it.** The brief's own objection to
 * that is that a wipe over the whole frame for a one-word change is a lie about the size of
 * the edit. It would be, if the wipe were a band of ink moving across the page. It is not:
 * it is a partition between two renders of the same component, so everywhere the write did
 * not reach the two sides are identical and the boundary is invisible. For a one-word change
 * the frame draws one word arriving and nothing else, over the same 274ms as a change that
 * rewrote half the page. **What travels is the boundary; what is drawn is only the
 * difference.**
 *
 * That is `agent-hand--ghost`'s mechanism with the opacity replaced by a moving line, and it
 * keeps the property that made the ghost cheap: *no diff is computed anywhere and no source
 * map is spent*. Confining the wipe to the changed element was the alternative, and it is
 * worse twice over. It needs a rectangle on a rendered page derived from a byte offset in a
 * source file, which is the thing `--inside` named as most likely to kill it and the thing
 * the ghost's whole argument was that it avoided. And it *understates* the edit rather than
 * overstating it: four of these thirteen writes move everything under them, and a wipe
 * confined to the written block leaves the reflow — the thing the write actually did to the
 * page — outside the event entirely.
 *
 * **What it costs instead is order.** All thirteen writes are instantaneous on the wire and
 * the wipe gives each one an order it does not have: the top of the page changes before the
 * bottom does. That is a real invention, and it is the price of being catchable at all. The
 * mitigation is the axis, which is also the argument for the axis.
 *
 * ## Direction, and why desktop decided it rather than meaning
 *
 * **Top to bottom.** Reading order.
 *
 * Left to right is writing order, and writing order is honest for a line of text and empty
 * for a picture, a button and a rule, which is four of the seven blocks on this page. So
 * the direction with the better *meaning* only means anything three sevenths of the time.
 *
 * But it never got that far, because it dies on arithmetic first. At one zoom a phone frame
 * is **152** drawn pixels across and a desktop frame is **561**: a factor of 3.69, and no
 * single duration and no single rate survives that — one of the two is a flash or a crawl.
 * Vertically the same two frames are **329 and 351**, twenty-two pixels apart, because a
 * phone is tall and narrow and a desktop is short and wide and at one zoom those cancel
 * almost exactly. **The vertical axis is the only one on which a phone and a desktop are
 * the same journey.** It also happens to be reading order, and to be the direction a reflow
 * genuinely propagates in. Three reasons, one of them decisive, and the decisive one is the
 * one the maintainer's question forced.
 *
 * So: direction carries meaning, but not enough of it to have decided anything. Say it
 * plainly — the axis was picked by geometry and it is fortunate that the geometry and the
 * meaning agree.
 *
 * ## Speed: a rate with two clamps, and neither of them binds
 *
 * `duration = clamp(height ÷ 1.2, 180, 420)` in drawn pixels and milliseconds, which comes
 * out at **274ms on the phone and 293ms on the desktop**.
 *
 * The floor of 180ms is spool's own: `frame-shell.tsx:136-144` fades a stored cover out over
 * exactly that once a rebooted document reports `loaded`, so 180 is how long a reboot's seam
 * lasts, and a wipe shorter than the seam is a flash. The ceiling of 420ms is `--ghost`'s
 * life span arrived at from the same end — the tightest interval between two writes here is
 * **573ms**, measured, and 420 leaves the 153ms of clear air that frame settled on. The rate
 * of 1.2 px/ms is then chosen to keep both clamps off at both sizes: the phone's 329 staying
 * above the floor needs R ≤ 1.83, the desktop's 351 staying under the ceiling needs R ≥ 0.84,
 * and 1.2 is near the geometric centre of that band.
 *
 * **So the speed is a rate, and it did not have to change between phone and desktop — but
 * only because the axis was chosen so that it would not have to.** On the horizontal axis
 * the same rate gives 127ms and 468ms, one under the floor and one over the ceiling, and no
 * constant fixes it either. The honest form of the answer is: *speed is a rate, and the
 * thing that makes one grammar work at both sizes is the axis rather than the constant.*
 *
 * ## What happens when two writes land 573ms apart
 *
 * Nothing collides, and the margin is better than the number suggests. The 573ms pair is
 * writes 2 and 3, at 8,758ms and 9,331ms, and they land in **different blocks** — the lede
 * and the button — so the second boundary starts 299ms after the first one left the frame.
 * The tightest *same-block* pair is writes 3 and 4 at **593ms**, both in the button. Across
 * all thirteen the gaps run 573ms to 1,605ms inside a run and 8,880ms and 6,138ms between
 * them, so two boundaries are never alive at once, on this capture, by arithmetic rather
 * than by luck.
 *
 * If a faster agent ever closed the gap, the rule is the ghost's unchanged: **a new wipe
 * replaces the old rather than joining it.** One revision back, always. Two boundaries
 * travelling over one frame at two offsets would be unreadable in a way that one never is,
 * and the layer is keyed so the older one simply goes.
 *
 * ## Whether it composes with the ghost, and it does not, and that is the finding
 *
 * They were drawn together rather than reasoned about, and photographed at 166ms into
 * write 11. Ahead of the boundary the previous render is already opaque, so a 0.3 ghost
 * underneath contributes exactly nothing. Behind it the previous render is gone, so what
 * is left is the ghost alone: **a 30% doubling of the region the wipe has just finished
 * resolving**, still on screen for its own 420ms after the 274ms sweep has ended. The
 * photograph is worse than that sounds and worse in an instructive place — **the doubling
 * lands behind the boundary rather than ahead of it**, so the part of the frame the wipe
 * has already finished is the part carrying two headlines, two buttons and two menus at
 * once, while the part still travelling is clean. Composing them takes the one region the
 * wipe has made unambiguous and makes it the ambiguous one, and the ambiguity is exactly
 * what `agent-hand--ghost-hold` measured and named: a third of the frame doubled *and
 * standing still* reads as a rendering fault. So they do not compose. One of them goes.
 *
 * **The one that goes is the ghost, and it loses on its own terms.** Both are silent where
 * nothing changed, for the same reason and at the same price — two whole renders, the same
 * outgoing-document problem above 400 drawn pixels, no diff anywhere. Past that:
 *
 *   *what changed*     the wipe draws it at full contrast where the ghost caps it at 0.3,
 *                      and at 152 drawn pixels 0.3 of five-pixel text is a smear
 *   *what it was*      the wipe shows the previous design at **full strength** for as long
 *                      as the boundary is above it. The ghost never showed it above 30%
 *   *the reflow*       the wipe reveals it in the order it propagates, top to bottom
 *   *the bug reading*  the ghost bought it with a constant. The wipe gets it from geometry:
 *                      a boundary is a partition, so at no instant are two designs at
 *                      comparable strength on the same pixel, at any percentage of the frame
 *
 * **What the ghost keeps is simultaneity** — the whole old state and the whole new state on
 * screen at once, comparable if you can read them. The wipe never has both; it has a top, a
 * bottom and a seam. That is a real loss and it is smaller than it sounds, because `--ghost`
 * had already conceded that at this zoom it answers *where* and never *what*, and
 * simultaneity you cannot read is not simultaneity.
 *
 * This is the maintainer's favourite mechanism, so the claim is put at its plainest: **on
 * this evidence the ghost is this wipe with the direction taken out and the contrast capped
 * to make the result survivable.** The cap was buying a partition. Geometry gives the
 * partition away.
 *
 * ## Desktop, which is the other half of the ask
 *
 * This is the first frame in the family to draw one. `shared/ui/spool-play-field.tsx`
 * hard-codes `FW = 152` and `FH = 329`, so every argument this round has been had on one
 * frame shape. `wipe-field.tsx` draws two: `home` at 1440×900 authored to 886×554 and the
 * same page at 390×844 authored to 240×520, both at the same 39%.
 *
 * **They cannot share a row, and the cost is stated.** 561 + 44 of gutter + 152 is 757 of a
 * 772px viewport: it fits and leaves nothing, no margins and no wall for the presence to
 * dock on, which needs 29. Stacked they both fit with room, and a second row is where a
 * canvas would really put them. **A desktop frame takes 73% of the viewport's width at the
 * zoom a phone is comfortable at**, and that is the honest headline of the whole question.
 *
 * Four things fell out of drawing it that no phone frame could have shown.
 *
 * **1. A desktop frame is above `LIVE_MIN_CSS_PX` and a phone frame is not.** `src/cover.ts:8`
 * sets it at 400 and `lifecycle.ts:245` enforces `frame.w * camera.k < LIVE_MIN_CSS_PX`.
 * 152 is under and **561 is over**. So this one canvas at this one zoom holds a frame whose
 * thirteen writes really do redraw it thirteen times, and one whose picture would follow the
 * capture errand at three photographs a turn. Every fiction this family has been carrying —
 * `--accrue`'s located heights, `--ghost-loud`'s `DIAGRAM`, the photograph cadence — is a
 * fiction *about the phone*. The desktop frame needs none of them.
 *
 * **2. The same write is a different event at the two widths.** The phone is one column, so
 * every block that grows pushes the whole page down: four of the thirteen reflow. The desktop
 * puts the hero beside the text rather than in it, so write 12 — the hero cropping 24px
 * shorter — **reflows nothing at all**, and the three that do reflow move a third of the
 * frame's width rather than all of it. The loudest case this family has ever measured
 * against is a phone case, and it is loud because a phone is one column, not because a write
 * is big.
 *
 * **3. The lane conflates the columns, and that is not fixable.** A lane is a projection of
 * the page onto one vertical axis. On this desktop page the hero spans x 452 to 814 and the
 * text spans 72 to 412 at the same heights, so a mark level with the headline and a mark
 * level with the top of the hero are one mark at one y, 240 authored pixels apart on the page
 * and zero apart on the wall. The lane answers *how far down* and a desktop layout needs
 * *where*. The wall has one dimension and the page has two.
 *
 * **4. The stand-off collision is size-invariant.** The compile could not find a value that
 * both cleared the frame's name and made room for the lane, and the reasonable guess was that
 * a bigger frame would relieve it. It does not. A corner's arc is struck concentric with the
 * frame's own 12px radius, so its horizontal arm is eleven pixels of ink starting twelve
 * pixels in from the left edge, and the name starts at the left edge at 7.42px a glyph.
 * Neither number is a function of the frame's width. A 152px frame and a 561px frame put the
 * same arm through the same three glyphs.
 *
 * ## What this frame fakes, stated
 *
 * **One fiction, and it is the second frame.** The capture writes one file, `frames/home/frame.tsx`,
 * thirteen times. Landing those same thirteen writes on a phone frame as well is what makes a
 * 152px sweep and a 561px sweep comparable under one clock, which is the question that had to
 * be answered. The presence and its four channels dock on the desktop frame alone, because
 * the agent is at one frame and the capture names one.
 *
 * That leaves a real question open and this frame does not pretend to answer it: **a
 * responsive pair has no presence in this family's vocabulary.** One write changes two
 * frames the moment a page has two frames, or the moment a write lands in `shared/ui/`, and
 * every direction in this round assumes the agent is at one place. The wipe itself is fine
 * with it — it is drawn by the frame's own two renders and needs no participant — which is
 * quietly the strongest thing about it, and it is exactly why it does not break the family's
 * ban on travel: nothing here crosses the canvas, or leaves a frame's own rectangle, or says
 * where anybody is.
 *
 * Also inherited rather than decided: `edit ×6`'s plate width from `--plate`'s measured
 * 6.18px a glyph, the lane's six-second life from `--accrue`'s window, and the `shot`
 * corners never closing.
 *
 * ## Reduced motion
 *
 * `useTurn` jump-cuts to settled, so the revision goes from 0 to 13 in one commit and there
 * is no sequence left to wipe. The boundary is disabled outright rather than slowed: one
 * pass carrying the found design over the finished one would be the entire page changing
 * under a moving line at the single moment nobody wrote anything. The four wall channels go
 * with it, since nobody is ever at the frame. What stillness gets is the design the agent
 * left, with nothing over it and nothing moving. Known page-wide, not fixed here.
 */

/** the frame every one of this capture's twenty-one rows names */
const SUBJECT = "home";
/** the same page at phone width, which is this frame's one declared fiction */
const SMALL = "home--phone";

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"] },
	{ name: "site", frames: [SUBJECT, SMALL, "hours", "about"], active: true, open: true },
];

const SHOT_W = 120;

export default function AgentHandEditWipeFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked a different question: where the agent is and
	// which blocks it has changed recently enough for the wall to still be saying so
	const hand = handOf(script, turn, LANDS);

	// how many of the thirteen design writes have landed. `write home` at 117ms is
	// `frames/home/frame.json` and is deliberately not one of them, so the wipe has nothing
	// to say about the first thing this turn does — and would draw nothing if it tried
	const rev = writesOn(script, turn, SUBJECT);
	const wipe = useWipe(rev);

	// a picture is of the frame as it was when it was taken, and this turn rewrites that
	// frame thirteen times, so the thumbnail is drawn at the revision the last `shot` caught
	const shotAt = shotRev(script, turn);
	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== SUBJECT) return null;
		const scale = width / WIDE.w;
		return (
			<div style={{ width, height: Math.round(WIDE.h * scale) }}>
				<div className="origin-top-left" style={{ width: WIDE.w, height: WIDE.h, transform: `scale(${scale})` }}>
					<KaffeHomeWide rev={shotAt} />
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
				{/* nothing is selected anywhere in this frame, so the only marks out here that are
				    not names or walks are the agent and the write going in */}
				<WipeField
					wide={
						<Wiped rev={rev} wipe={wipe} height={WIDE_H} draw={(at) => <KaffeHomeWide rev={at} />} />
					}
					phone={
						<Wiped rev={rev} wipe={wipe} height={PHONE_H} draw={(at) => <KaffeHomePhone rev={at} />} />
					}
					neighbours={[
						{ name: "hours", render: KaffeHours },
						{ name: "about", render: KaffeAbout },
					]}
				/>
				<MarkLayer hand={hand} subject={SUBJECT} />
			</CanvasChrome>
		</SpoolShell>
	);
}

/**
 * Writes landed on the frame's source, which is what makes it redraw.
 *
 * A run's children are the calls it collapsed, so this is the same arithmetic `railEntries`
 * does to print `×6` — one number, two surfaces, and thirteen of them rather than the three
 * a stored photograph would give. The frame is above `LIVE_MIN_CSS_PX`, so thirteen is what
 * it would really do. `write` is excluded and `edit` is not: the capture's single
 * `write home` is the geometry sidecar, and a wipe of a design that did not change draws
 * nothing, which is the correct drawing of it.
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
