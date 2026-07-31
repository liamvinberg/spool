import { railEntries, type Script, type ToolRow, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, type Turn, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { Ghosted, useGhost } from "./ghost";
import { KaffePhone, KaffeWide, phoneLayout, wideLayout, WRITES } from "./kaffe-page";
import { handOf, type Span, SpanLayer, spansAt, writesOn } from "./span";
import { SpanField } from "./span-field";

/**
 * agent-hand--edit-span — an edit is a line across the frame at the height of the
 * change, and this is the first frame in the family that draws a desktop page.
 *
 * Type anything and press Enter, and watch both frames. The agent takes hold of `home`
 * at 117ms and does not let go for thirty-seven seconds: it writes the geometry,
 * photographs the frame, looks at the picture, and lands thirteen writes on the source
 * in runs of six, four and three. Every one of the thirteen strikes a pair of rules
 * across the frame at the top and bottom of what changed, and both frames redraw,
 * because one page at two breakpoints is one component.
 *
 * **The argument.** Every direction before this one marks an edit at the frame's edge:
 * a grip that flicks, a lane of marks outside the wall. An edge mark makes you look at
 * the edge and then work out what it points at. `--ghost-lane` measured what that
 * indirection costs when it fails — its two unstamped writes, unable to say where they
 * landed, were **41.1% of everything the lane drew**. A line across the frame lands on
 * the thing that changed and needs no second look.
 *
 * ## What it covers, which is nothing
 *
 * Both rules sit **outside** the block, in the seam the layout already left empty. A
 * rule on a block's own edge falls inside its line box leading, which at this zoom is
 * under a pixel of clearance; a rule at a block's centre strikes the text. Bracketing
 * from outside is the only placement where the number is zero rather than small, and it
 * is zero on both frames in every state.
 *
 * What the mark does cover is canvas and seam: **1.40% of the phone's pixels and 1.31%
 * of the desktop's**, two rules 2px tall running a frame's width, which is 0.63% and
 * 0.59% once the ink is priced. The worst moment is **9,331ms** — writes 2 and 3, the
 * capture's tightest gap at 573ms, the lede's span and the button's span both up for
 * **287ms**, adjacent blocks so the two lines sit 6.6 drawn pixels apart. That moment
 * is **2.80% of the phone struck, 1.26% in full ink**, and it is the number to judge.
 * Against `--inside`, which spent the interior and was rejected for it: 4% sustained
 * and 3.84% momentary, all of it on the design rather than beside it.
 *
 * ## It spans the frame and six pixels past, and not the canvas
 *
 * A rule continuing across the whole canvas ties a change to the rail and to the
 * neighbours, and this canvas is the one that kills it. Write 1 lands in the headline,
 * which is at authored y 38 on the phone and y 92 on the desktop. A canvas-wide rule
 * struck at the phone's height crosses the desktop frame at authored y 38 — **inside
 * its top bar**, a block that did not change, in the exact case where the neighbour did
 * change and a correct height existed 33 pixels lower. A rule long enough to relate two
 * frames is long enough to lie about the second one.
 *
 * The 6px overshoot stays because it is the only thing separating this mark from a
 * divider the designer might have drawn. It feathers to nothing at the tip, and that
 * turned out to be load-bearing rather than decorative: see `span.tsx` on the two tones.
 *
 * ## The desktop, which is the half that does not work
 *
 * A phone page is one column, so a height is an address. A desktop page is a grid, and
 * it is not.
 *
 * Measured over the thirteen writes: **a rule at a write's height crosses a block that
 * did not change 0 times out of 13 on the phone and 7 times out of 11 on the desktop**,
 * eleven because two of the thirteen cannot say where they landed at all. Six of the
 * seven cross the hero photograph, which occupies the same 220 authored pixels of
 * height as the headline, the lede and the button put together, in the next column.
 *
 * So a horizontal span does not survive a desktop layout on its own, and the honest
 * thing was to draw that rather than quietly making the desktop one column. The repair
 * had to keep the object a span, and two candidates were drawn. **Verticals** work and
 * cost the whole pitch: a vertical rule runs the frame's full height, so it crosses
 * every band on the page, it takes the occlusion from 1.40% to 4.39% with every added
 * pixel landing on content, and the mark stops being a glance and becomes a crossing
 * you construct. **Modulating the one rule** ships: bright at 0.45 over the block's own
 * x-range, faint at 0.12 over the rest, one continuous line, nothing added and nothing
 * new crossed. The bright segment is **83% of the rule on the phone and 58% on the
 * desktop**, so on a phone the modulation is nearly invisible, which is correct, and on
 * a desktop it carries the whole answer.
 *
 * **What it does not buy back, stated plainly.** The faint segment still runs across
 * the hero, and a reader who reads the line rather than the bright part of the line
 * reads it as pointing at both. This direction's pitch was that an edge lane makes you
 * look at the edge and then work out what it points at. On a wide page this mark makes
 * you look at the line and then work out which part of it is the claim. **The reading
 * step is not removed on desktop, it is relocated.** On a phone it is genuinely gone.
 *
 * ## The finding a desktop frame was needed for
 *
 * `src/cover.ts:8` puts `LIVE_MIN_CSS_PX` at 400 and `lifecycle.ts:245` enforces it as
 * `frame.w * camera.k < LIVE_MIN_CSS_PX`: below that a frame is a stored photograph
 * with no document in it. The phone here draws at 132 and the desktop at **487**.
 *
 * **The threshold falls between the two frames, and in the product it always does.** A
 * real 390pt phone needs 103% zoom to cross it; a real 1440 desktop page needs 28%. At
 * every zoom anybody works at, a canvas holding both holds **one live frame and one
 * picture.** Three things follow, and none of them was visible while this family drew
 * only phones:
 *
 *   - **The located mark is obtainable on the desktop frame and fictional on the
 *     phone.** `--accrue` and `--ghost-loud` both declared drawing located heights at
 *     152px a fiction and drew them anyway, because a frame that correctly draws
 *     nothing cannot be judged. Half of that fiction is now unnecessary: the desktop
 *     frame has a DOM, so `data-spool-source` can resolve a write to a rectangle in it
 *     for real. The phone's spans are still the inherited fiction, named below.
 *   - **The liveness rule is true rather than staged, on one of the two frames.** Every
 *     frame in this family stages thirteen re-renders. The desktop frame genuinely gets
 *     them; the phone genuinely would not.
 *   - **The whole family has been designing the located mark against the frame where it
 *     cannot be located.**
 *
 * ## What the two pages did to each other
 *
 * Running one layout table at two widths produced three things nobody asked for.
 *
 * **A phone reflow is the page and a desktop reflow is a column.** Four of the thirteen
 * writes move something below them on the phone, three do on the desktop, and the count
 * that matters is blocks: **twelve moved on the phone against five on the desktop**.
 * Write 2 lengthens the lede and the phone moves the button, the picture, the menu and
 * the hours; the desktop moves the button. Write 7 adds the menu and the desktop moves
 * nothing at all. So the ghost, whose loudest case is a reflow, is loud on the frame
 * where it is a smear and quiet on the frame where it would be legible.
 *
 * **The desktop's one full reflow is caused by the picture rather than by the words.**
 * The lower band sits under whichever column is taller and the text never overtakes the
 * image, so the page moves when the image crops shorter at write 12. Write 11 doubles
 * the headline and nothing moves.
 *
 * **The presence and the span are not on the same frames.** The wire names one frame,
 * so the agent's thread stands beside `home` and nowhere else; the write lands in a
 * component two frames read, so both get a span. A canvas holding a page at two
 * breakpoints therefore has a frame redrawing with nothing beside it saying why, and no
 * frame in this family had put that on screen. The presence is a fact about the
 * transcript. The span is a fact about the pixels.
 *
 * ## Six writes in five seconds
 *
 * Run one lands six writes between 7,153 and 11,988ms, 573 to 1,605ms apart. Six spans
 * in that window read as jitter if they accumulate and as a pulse if they do not, and
 * the difference is one number.
 *
 * A span lives **860ms**, and both ends of that are the capture's rather than taste.
 * The floor is 180: `frame-shell.tsx:136-144` fades a rebooted frame's cover out over
 * exactly that, so a mark shorter than the seam is a flash of nothing. The ceiling is
 * **1,166ms**, the smallest sum of two consecutive gaps in the whole turn, because a
 * third span alive means three heights held at once and the run stops having a shape.
 * Across the thirteen writes there are four overlaps, the longest 287ms: **two spans
 * alive, never three, for 3.3% of the turn.** It does not read as jitter, and the
 * reason is that it never accrues.
 *
 * What that costs is the run's shape. `--accrue`'s marks stood six seconds so a
 * finished run left something to read; this leaves nothing. A span is a pointer and not
 * a ledger, the rail already prints `edit home ×6`, and spending one channel on both is
 * the redundancy `--ghost-loud` found three of, nine pixels apart.
 *
 * A single mark that *moves* to each new block was tried first and cut: six moves in
 * 4,835ms is 806ms a move, and a rule sliding the length of a page over body copy is
 * the jitter the short life was chosen to avoid. A struck-and-gone rule travels nowhere.
 *
 * ## Inherited, and one thing given back
 *
 * The thread, the plate and the `shot` corners are `--ghost-loud`'s, minus its lane and
 * minus its count. Removing the lane un-contests the stand-off it forced: the plate is
 * the only real claimant, so the centre stands at **10** against the compile's 15. That
 * alone does not clear the frame's own name, so the corners are decoupled and struck at
 * **4**, which does. `--ghost-loud` named that escape and priced it as losing the
 * reading that the shot ink is the grip's own; that reading was already spent there,
 * because four corners cannot leave a 16px plate without drawing a rectangle with two
 * gaps in it. **The one collision the compile said had no solution is fixed, and it
 * cost nothing that was not already gone.**
 *
 * ## What this frame fakes, stated
 *
 * **The second frame.** `claude-edits.json` edits `frames/home/frame.tsx` and knows
 * nothing about a desktop sibling. `home--wide` and the arrangement where one write
 * re-renders both are this frame's addition, and they are necessary rather than
 * convenient: a horizontal mark cannot be judged against a desktop layout unless the
 * same write lands in one.
 *
 * **The phone's located heights.** At 132 drawn pixels there is no document, so its
 * spans are `--accrue`'s fiction inherited with its reason. The desktop's are not.
 *
 * **The block a write landed in.** `LANDS` is `--ghost-loud`'s staging and the boxes
 * come from `phoneLayout` and `wideLayout` rather than from a stamp resolved in a live
 * document. Writes 7 and 8 are the exception and are drawn as the stamp would actually
 * resolve them, which is nowhere.
 *
 * ## Reduced motion
 *
 * `useTurn` jump-cuts to settled, so nobody is ever at the frame and thirteen writes
 * land in one commit. Every span would be struck at once and the whole page would be
 * ruled at the one moment nothing was written, so the layer is disabled outright rather
 * than degraded — the same call `--ghost` makes about its own. What stillness gets is
 * two frames showing the design the agent left, with nothing over them and nothing
 * beside them. Page-wide gap, named rather than fixed.
 *
 * The capture is `claude-edits.json`, the same 37.7 seconds every frame in this family
 * plays.
 */

/** the frame every one of this capture's twenty-one rows names */
const SUBJECT = "home";
/** its desktop sibling, which the capture does not know about */
const WIDE = "home--wide";

const SHOT_W = 120;

export default function AgentHandEditSpanFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked where the agent is rather than what happened
	const hand = handOf(script, turn);

	// how many of the thirteen design writes have landed. `write home` at 117ms is
	// `frames/home/frame.json`, so it is not one of them and neither the spans nor the
	// ghost has anything to say about the first thing this turn does
	const rev = writesOn(script, turn, SUBJECT, WRITES);
	const ghost = useGhost(rev);

	// one write, two frames: the same count read through two layout tables, because the
	// block that changed sits in a different place on each page
	const spans = new Map<string, readonly Span[]>([
		[SUBJECT, spansAt(rev, phoneLayout)],
		[WIDE, spansAt(rev, wideLayout)],
	]);

	// a picture is of the frame as it was when it was taken, and this turn rewrites that
	// frame thirteen times, so the thumbnail is drawn at the revision the last `shot`
	// caught rather than at the one on the canvas now
	const shotAt = shotRev(script, turn);
	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== SUBJECT) return null;
		const scale = width / 240;
		return (
			<div style={{ width, height: Math.round(520 * scale) }}>
				<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
					<KaffePhone rev={shotAt} />
				</div>
			</div>
		);
	};

	const pages: readonly PageRow[] = [
		{ name: "app", frames: ["cart", "menu", "receipt"] },
		{ name: "site", frames: [SUBJECT, WIDE], active: true, open: true },
	];

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="34%">
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
				    not a name belongs to the agent */}
				<SpanField
					draw={(slot) =>
						slot.name === SUBJECT ? (
							<Ghosted rev={rev} ghost={ghost} draw={(at) => <KaffePhone rev={at} />} />
						) : (
							<Ghosted rev={rev} ghost={ghost} draw={(at) => <KaffeWide rev={at} />} />
						)
					}
					overlay={<SpanLayer hand={hand} spans={spans} />}
				/>
			</CanvasChrome>
		</SpoolShell>
	);
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
