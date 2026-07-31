import { useMemo } from "react";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { Arriving } from "./bloom";
import { HandLayer, handOf, stillOn, writesOn } from "./hand";
import { KaffeHomeBloom } from "./kaffe-home-bloom";
import { KaffeAbout, KaffeHours } from "./site-frames";

/**
 * agent-hand--bloom — what is new arrives, and you can see it arrive.
 *
 * Type anything, press Enter, and watch the middle frame. The presence takes hold of
 * `home` on the first call and holds it for the whole turn, exactly as
 * `agent-hand--presence` settled it. What is added is inside the frame: when the
 * canvas's picture of `home` is replaced, the blocks that are new or a different size
 * come up into place over 280ms and everything else hard-cuts. Nothing is drawn on
 * top of the design at any point.
 *
 * ## The regime, stated before anything else
 *
 * **This is drawn for the covered regime, which is where the canvas actually sits.**
 * At canvas zoom a frame is not a live document. `cover.ts:8` sets
 * `LIVE_MIN_CSS_PX = 400` — *"How wide a frame must draw before the canvas mounts its
 * document"* — and `lifecycle.ts:245` enforces it: *"if (frame.w * camera.k <
 * LIVE_MIN_CSS_PX) return false"*. A 390px frame passes that at about 103% zoom. At
 * the 39% this page draws, a frame is 152px and `frame-shell.tsx:11` says what is
 * there instead: *"picture: the still (or a quiet placeholder), no iframe in the
 * DOM"*.
 *
 * So writes do not reach the canvas. Photographs do, and they are slow and few. A
 * still costs `CAPTURE_AFTER_READY_MS` (1500) of quiet plus 660 to 1437ms of errand,
 * and any write inside that window restarts it. **The largest gap between two writes
 * inside a run here is 1,605ms and the lag is 2,550, so no photograph can complete
 * inside a run.** Thirteen writes become three pictures, each carrying a whole run,
 * each landing about 2.5s after the agent has moved on. That arithmetic is the
 * cadence and this frame plays it.
 *
 * The rule is not zoom-conditional. The carrier and the cadence are. Above ~103% the
 * same diff runs on the live DOM, one arrival per write, thirteen of them, and the
 * stagger cap has to come down because the floor between two writes is 573ms. Below
 * it, three arrivals carrying six, four and three writes. **The covered regime turned
 * out to be the easier one to build**, which is the opposite of what I expected, and
 * the reason is under "what the runtime would have to grow".
 *
 * ## The route around `agent-hand--inside`
 *
 * That direction was right that the interior is the only surface that can say
 * *where*, and it died on how it asked: it drew a box around the block that changed,
 * and the region would have to come from the diff, where a `str_replace` gives a byte
 * offset in a source file and not a rectangle on a rendered page. So this never asks
 * where the edit was. **It asks which boxes moved** — and then narrows that to which
 * boxes changed size.
 *
 * The difference is not a refinement, it is the difference between a mark and no
 * mark. `--inside`'s worst case was pointing at the wrong block, which is worse than
 * pointing at nothing. This one has nothing to point with: the thing that moves is
 * the picture's own content. The worst it can do is stay silent.
 *
 * ## What counts as new
 *
 * A box, and only a box. Three candidate signals, and they are not equal.
 *
 * **A box that did not exist before.** The strongest and the only unambiguous one.
 * The fourth row of an opening-hours list has no counterpart on the other side, and
 * nothing else explains it.
 *
 * **A box that changed size.** Nearly as strong, and it is what most writes look
 * like: a headline that gained a line, a hero that got taller, a measure that
 * narrowed from 216 to 168.
 *
 * **A box that moved.** Rejected, and this is the decision the whole direction turns
 * on. In a flow layout a change to one block moves every block under it, so write 1
 * here — the headline going to two lines — moves the lede, the button, the hero,
 * three hours rows and the footer. A rule that noticed movement would light two
 * thirds of the page for a three-word edit. Moving is what happens *to* boxes; it is
 * not what the agent did. So position is thrown away, and `fates()` matches on size
 * alone. The cost is stated rather than hidden: two blocks swapping places keep their
 * sizes and this reports nothing at all.
 *
 * Two rules sit on top of the match. **A change has to be big enough to see, and that
 * is two screen pixels** — the same number as the match tolerance, because they are
 * the same question, and in screen units rather than the design's because "could a
 * person tell" does not care about zoom. **And news inside news is drawn once.**
 * Adding a row to a list makes the row, the day inside it and the list itself all
 * news; the list is the container of news and the day came with the row. So a box
 * that is genuinely new silences everything inside it, and a box that merely changed
 * size is silenced by any news below it.
 *
 * ## What it actually reports, measured
 *
 * Every step was run through the diff offscreen at this exact scale with the fonts
 * loaded, and the answers counted. **Eighteen boxes arrive across the three
 * photographs: six, nine and three.**
 *
 *   still 1  six writes    the headline, the lede, the button, the hero, the whole
 *                          hours block, and the footer
 *   still 2  four writes   nine boxes — the photo's three layers, four hours values,
 *                          the narrowed lede, the lengthened address
 *   still 3  three writes  the bar rules at 7x3 screen pixels, the widened button,
 *                          and the note that did not exist before
 *
 * **The middle one is the finding.** Nine of the fourteen measured boxes move at
 * once, which is much closer to *the page came back different* than to *this block
 * changed*. That is not a defect to hide, it is the true reading of four writes
 * landing together, and it is the price of the covered cadence: the specificity of
 * the mark degrades exactly in proportion to how much actually changed, and never
 * further. What holds the picture still around it is the five boxes that do not move
 * — the bar, the headline, the button's frame, the hero's own box, the footer rule.
 *
 * The live regime, measured the same way: thirteen writes produce seventeen arrivals,
 * median one, and ten of the thirteen move exactly one box. **The live regime is the
 * specific one and the covered regime is the visible one**, which is a trade rather
 * than a ranking — a batch is easier to catch and says less about where.
 *
 * ## The three writes worth naming
 *
 * **The write that changed nothing.** The turn opens with `write home` against
 * `frames/home/frame.json`. It needs no special case, and that is the strongest thing
 * about this mechanism: nothing here knows what a write is. The diff is a question
 * about rectangles, the rectangles are identical, and the answer is nothing. In the
 * covered regime it does not even reach the question, because a geometry write moves
 * the rectangle and the picture inside it is the picture it already was.
 *
 * **The write that changed something with no geometry.** Write 4 fills the button in,
 * outline to solid ink, a change you cannot miss at 158px, and no box moves. Live,
 * that write is silent. Batched, it is carried in by its neighbours and the button
 * moves for a reason that is not its own. Either way this is the direction's real
 * limit: a colour, a weight, a radius, a word swapped for a word of the same length
 * are all invisible to a box diff. `--inside` was wrong by commission. This is wrong
 * by omission, which is the cheaper error, because it never lies about where.
 *
 * **The write that is genuinely small.** Write 7 lengthens the footer address from
 * `Torsgatan 11` to `Torsgatan 11, Vasastan, Stockholm`. Eight pixels of grey type at
 * the bottom edge of a 158px frame. The bloom fires and it **rescues it rather than
 * overselling it**, because of the property that makes any of this read as
 * information: the mark is the changed thing itself, so its loudness is the change's
 * own size. A one-line footer edit gets one line of footer moving. No badge could be
 * the right size for both a hero replacement and a comma.
 *
 * **And one of the eighteen is wrong.** The first photograph blooms the footer
 * address, which nobody had touched yet. `Röda dagar` renders at 26x8 and
 * `Torsgatan 11` renders at 26x8, the new day claimed the old footer's seat because
 * it was the only same-sized one left, and the footer was then the box with no
 * partner. Identity would have prevented it and there is no identity. One false
 * arrival in eighteen, and the shape of the error is the mechanism's own consolation:
 * a collision only happens between boxes that look alike, so the lie is always the
 * size of the thing it lies about. A distance ceiling would catch it and was tried
 * and rejected — a ceiling turns a large edit's cascade back into news, and write 5
 * alone shifts the footer 33 screen pixels.
 *
 * ## What the runtime would have to grow
 *
 * The brief's premise needed correcting, and correcting it made the ask smaller.
 *
 * **`requestSiteBoxes` is not the road in.** It does run on every boot — the `loaded`
 * arm at `canvas.tsx:1608` is unconditional under *"a fresh document renders fresh
 * elements: re-anchor its arrows (#34)"* — but it carries a list of navigation
 * anchors and `siteBoxes()` (`daemon/document.ts:948`, not `runtime/frame-runtime.ts`
 * as briefed) answers only those, and `canvas.tsx:713` returns early when a frame has
 * no outgoing anchored edges. `home` has none, so it is asked nothing, ever. And it
 * only fires for a frame with a document, which at 39% is none of them.
 *
 * **The one identity spool has is destroyed by the one event this cares about.** A
 * stamped element's key is `path:line:col` (`runtime/jsx-dev-runtime.ts:30`), and an
 * edit shifts line numbers, so every element below the edit gets a new key —
 * identity-based diffing would report the whole page below the change, the same
 * cascade failure as position matching by another route. Throwing identity away is
 * not a compromise forced by its absence. It is the right call even where it exists.
 *
 * So the road in is the photograph, and this is where it gets easy. `frame-shell
 * .tsx:12` already boots a document out of sight for no reason but to be
 * photographed — *"refreshing: a document booting behind the still, only to be
 * photographed"*. Measure while it is up. Three changes:
 *
 *   1. the capture errand asks the shim for every element with a layout box rather
 *      than the anchor sites a caller named, and the boxes ride out with the bitmap
 *   2. the canvas keeps the previous still's box list, which it can, because it is
 *      already keeping the previous still
 *   3. the frame shell, on a swap, diffs the two lists and draws the new bitmap
 *      clipped to each changed box rising over itself
 *
 * **Nothing has to cross a boundary that is not already being crossed**, and step 3
 * never touches a frame's DOM at all — the canvas owns both bitmaps, so the sandbox
 * is irrelevant to it. The live regime is the harder one: there the shim has to
 * animate the frame's own elements, because `sandbox="allow-scripts"` with no
 * `allow-same-origin` (`frame-shell.tsx:161`) means the canvas cannot reach them.
 *
 * Drawing it here by animating the page's own elements is the faithful stand-in for
 * step 3, because a clipped copy of a bitmap rising over the same bitmap is
 * pixel-for-pixel what an element rising over its own final position looks like.
 *
 * ## How it composes with the presence
 *
 * The object on the wall is unchanged — head, grip, length is the kind of hold, ink
 * is whether a call is open, no colour. Three things moved.
 *
 * **The flick is gone.** The parent lengthened the grip 22px for 150ms on every
 * write, because the wall was the only surface that could say a write had landed.
 * Two objects reporting one event at one instant is one of them decorating.
 *
 * **And the wall turned out to be doing the harder half.** The picture is 2.5 seconds
 * late and arrives three times; the grip is instant and moves on every call. So the
 * wall is the live channel and the interior is the slow one, which is the opposite of
 * what I assumed going in and is the strongest argument for the pair. Through the
 * dead air — 57% of this turn — the grip says the agent is still there. When a
 * picture finally lands, the interior says what came back. Neither is redundant and
 * neither is sufficient.
 *
 * **The `shot` outline no longer closes.** The parent's ran the grip's ends around
 * the box and met them on the far wall, which is a ring 6px off a frame, which is
 * what a selection is. They now stop 18px short of each other. The stand-off stays,
 * because the grip lives on that line; what made it read as selection was the
 * closure, not the distance.
 *
 * **The presence also gates the bloom.** A write to `shared/tokens.css` has every
 * frame rephotographed at once and every box in every one of them can move. No box
 * diff can tell which of those was the work. The presence can, because it is at one
 * frame. The wall says who, the interior says what.
 *
 * `home` sits in the middle column, both gutters 44px, so there is room for the head
 * and the grip and none for the chip. This direction carries the verb without a word,
 * which is the honest test.
 *
 * ## The costs, plainly
 *
 * A change with no geometry is invisible, and write 4 is drawn to prove it. Two
 * blocks swapping order is invisible. One arrival in eighteen is a collision. **A
 * non-replaced inline element cannot take the arrival at all**, because transforms do
 * not apply to one, so `measure()` skips them and its block carries the change or
 * nothing does — every measured element on this page is a block, a flex item or
 * absolutely positioned, and a real page full of inline links would lose some. And
 * the whole direction is 2.5 seconds late at this zoom, which no amount of drawing
 * fixes. It can only make the late thing catchable, which is the job, since a hard
 * cut between two bitmaps is the one transition peripheral vision cannot catch.
 *
 * The two pictures of `home` in this frame are taken by different hands and it shows.
 * The rail's thumbnail is the agent's own `spool shot`, taken immediately after a run;
 * the canvas's is the errand's, taken 2.5s later. **The agent's is the fresher one**,
 * which is worth noticing on its own: the transcript is ahead of the canvas.
 * `shot="open"` keeps #194's real thumbnail and #194's open flaw with it — `shotView`
 * is handed a path and not a row, so all four `look` rows draw the frame at its
 * current source revision and only the last is true. Not this frame's to fix, and
 * worse to paper over.
 *
 * Under `prefers-reduced-motion` the turn is a jump cut to settled, so the page is
 * drawn at revision 13 with no photograph behind it, nothing to diff against, and no
 * arrival. `Arriving` checks the setting and does not even measure. That is right
 * rather than a degrade: stillness is the state where the work is already over, and
 * the whole of this direction is about watching it happen.
 *
 * The capture is `claude-edits.json`, the same two minutes as `agent-hand--presence`
 * and `agent-play--edit-run`.
 */

const SHOT_W = 120;

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"] },
	{ name: "site", frames: ["about", "home", "hours"], active: true, open: true },
];

export default function AgentHandBloomFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	const cueAt = useMemo(() => new Map(script.cues.map((cue) => [cue.name, cue.at])), [script.cues]);

	// the same rows the rail is reading, asked a different question: not what
	// happened, but where the agent is and whether it is doing anything there
	const hand = handOf(script, turn);
	// what the source is at, and what the canvas's picture of it is at. Two numbers,
	// and the gap between them is the whole reason this frame is drawn the way it is
	const rev = writesOn(script, turn, "home");
	const still = stillOn(script, turn, cueAt, elapsed, "home");
	const held = hand?.frame === "home";

	/**
	 * The picture behind a `look` row. It is the agent's own `spool shot`, taken the
	 * moment it stops writing, so it is drawn at the source's revision rather than the
	 * canvas's.
	 */
	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== "home") return null;
		const scale = width / 240;
		return (
			<div style={{ width, height: Math.round(520 * scale) }}>
				<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
					<KaffeHomeBloom rev={rev} />
				</div>
			</div>
		);
	};

	const site: readonly BaseFrame[] = [
		{ name: "about", screen: "menu", render: KaffeAbout },
		{
			name: "home",
			screen: "menu",
			// keyed on the run, so a replay starts from a picture with nothing behind it
			// and the first paint is a first photograph rather than an arrival
			render: () => (
				<Arriving key={turn.run} rev={still} held={held}>
					<KaffeHomeBloom rev={still} />
				</Arriving>
			),
		},
		{ name: "hours", screen: "menu", render: KaffeHours },
	];

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
				{/* nothing is selected anywhere in this frame, so the only mark out here
				    that is not a name or a walk is the agent */}
				<PlayField base={site} />
				<HandLayer hand={hand} base={site.map((frame) => frame.name)} />
			</CanvasChrome>
		</SpoolShell>
	);
}
