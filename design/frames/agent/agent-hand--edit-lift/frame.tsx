import { railEntries, type Script, type ToolRow, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, type Turn, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { KaffeSmall, KaffeWide, WRITES } from "./kaffe-page";
import { Lifted } from "./lift";
import { LiftField, SCALE } from "./lift-field";
import { HandLayer, handOf } from "./lift-hand";

/**
 * agent-hand--edit-lift — no mark at all. The element that changed is the mark, and
 * this is the first frame in this family that is not only a phone.
 *
 * Type anything and press Enter, and watch the wide frame. The agent takes hold of
 * `home` at 117ms and does not let go for thirty-seven seconds; in that time it writes
 * the geometry, photographs the frame, looks at the picture, and lands thirteen writes
 * on the source in runs of six, four and three. Nothing is drawn over the design and
 * nothing is drawn beside it. Twelve of the thirteen writes move one element nine
 * screen pixels across its own column and set it back down, and the thirteenth moves
 * nothing, on purpose.
 *
 * ## What this decides
 *
 * **That the edit channel is a property of the page rather than of the canvas.** Every
 * other direction in this round spends the gutter: a flick on the wall, a lane of
 * marks at the height of the block, a plate holding the verb, a ghost of the previous
 * revision. This spends none of it. The wall keeps exactly what it needs to say the
 * agent is here — `--presence`'s head and `--spool`'s thread, with the pluck and the
 * plate cut — and everything about *what changed* happens inside the frame, on the
 * element the write landed in.
 *
 * ## The axis, which is the argument
 *
 * `--bloom` rejected movement as the signal, correctly: in a flow layout one edit at
 * the top moves every block under it, so a rule that noticed movement would light two
 * thirds of a page for a three-word edit. Its route around that was to stop asking
 * about movement and ask about size.
 *
 * The route here is to keep the movement and change the axis. **A reflow is vertical,
 * always.** So the arrival is across the column, which is the one direction a layout
 * cannot produce by itself: everything the edit displaced slides down the page in the
 * same instant the browser reflows it, and the one element that goes sideways is the
 * one the agent wrote. They are told apart by direction rather than by amount, which
 * is what lets this stay legible on a write that moved six blocks.
 *
 * It also buys the distance, which matters more here than on any previous frame. A
 * vertical arrival is bounded by the leading above it — `--bloom`'s 8 units is 5.1
 * screen pixels and this phone page's tightest gap is 5.1, so it cannot grow — while
 * a lateral one travels *inward*, into the measure, where there is nothing to touch.
 * So the lift is **nine screen pixels over 300ms**, 1.8 times the rise it replaces,
 * and it ends on the page's alignment rather than starting on it: at no point in those
 * three hundred milliseconds does the page look mis-set.
 *
 * Nothing fades and nothing scales. Scale is `--bloom`'s measured finding, inherited
 * without re-argument. The fade is this direction's own cut: in the live regime the
 * element was there before the write and is there after it, so drawing it at less than
 * full for a fifth of a second is taking the design away in order to announce that the
 * design changed. **What arrives is the change, not the element.**
 *
 * ## The clock, re-derived
 *
 * Thirteen writes at 7,153 / 8,758 / 9,331 / 9,924 / 10,721 / 11,988, then 20,868 /
 * 22,435 / 23,221 / 24,203, then 30,341 / 31,648 / 32,837, in a turn 37,700 long. The
 * shortest interval between two writes is **573ms** (the third and fourth of the first
 * run) and the longest inside a run is 1,605. So 300ms finishes 273ms before the next
 * write can land and two arrivals are never alive together — the same arithmetic
 * `--ghost` did for its 420, with more room, because there is only ever one element in
 * flight.
 *
 * **There is no stagger and there is nothing to stagger.** `--bloom` needed one because
 * a photograph carries a whole run and lands nine boxes at once. An edit carries one
 * element. One write, one element, one movement.
 *
 * ## The thing the arithmetic decided before the drawing did
 *
 * A frame is authored at 0.615 of the real page and drawn at `152 / 240`, which is 39%
 * of real. A 1440x900 desktop page is therefore **886x554 authored and 561x351 drawn**,
 * against the phone's 152x329, in a viewport of 1440 less the 248 Pages rail and the
 * 420 agent rail: 772.
 *
 *   8 margin + 152 phone + 44 gutter + 561 desktop + 7 margin = 772
 *
 * **There is no other arrangement.** One phone and one desktop frame at the zoom this
 * family has measured everything at fill the viewport exactly, with the honest 44px
 * gutter between them and seven pixels on the right. A third frame does not fit and
 * neither does a margin. The cost is stated plainly: this canvas cannot show you a
 * page, it can show you two frames, and panning is the only way to see a third.
 *
 * And it lands hardest on the directions that live in the gutter. The `--ghost-loud`
 * assembly is 23 wide — the lane claims wall + 0 to 5, a slack thread its centre ± 4
 * plus a 2px stroke, the plate its centre ± 8. Beside a wide frame **the right wall is
 * seven pixels**. The tie-break is inherited and never fires, because there is no tie:
 * the only wall with room is the left one, which is the wall an incoming walk
 * arrowhead lands on at `ROW_1 + 186`. A wide frame does not have two walls.
 *
 * ## The inversion nobody in this family had noticed
 *
 * `cover.ts:8` sets `LIVE_MIN_CSS_PX = 400` — *"How wide a frame must draw before the
 * canvas mounts its document"* — and `lifecycle.ts:245` enforces it as
 * `frame.w * camera.k < LIVE_MIN_CSS_PX`. Every previous frame in this family read
 * that as a ceiling on the whole idea, because a phone frame at 39% draws 152 and is a
 * stored photograph: thirteen writes become three pictures, each 2.55s late.
 *
 * **A desktop frame at the same zoom draws 561, and 561 is over the line.** So on one
 * canvas, at one zoom, with the camera still, the wide frame is a live document that
 * re-renders on every write and the phone beside it is a still. That is not a fiction
 * this frame invented; it is the shipped rule applied to a frame nobody had drawn.
 *
 * Two consequences, and both of them are this direction's whole case:
 *
 * **The mechanism is real up there.** An `Edit` names a byte range, which is a line
 * range; `runtime/jsx-dev-runtime.ts:30` stamps every element with `path:line:col`; so
 * the element the write landed in is the deepest one whose stamp falls inside the
 * range. No box matching, no tolerance, no identity, and **no false positives** —
 * against `--bloom`'s one in seventeen, which is not a criticism of that mechanism but
 * the reason this one can afford to have no second channel.
 *
 * **And it answers the write a rule about rectangles cannot.** Write 4 turns the button
 * from outline to solid ink and moves nothing; write 1 swaps a headline for one of the
 * same measure; write 5 fills the hero in. Three of thirteen, which is `--bloom`'s own
 * estimate of the class, and a size rule is silent on all three. The line range is not,
 * because a colour is on a line like anything else. This was named as the direction's
 * central weakness and it is the one place the wide frame paid for itself.
 *
 * ## What it actually moves, measured
 *
 * Every arrival was caught off the played frame with the fonts loaded and the element
 * measured at the moment its animation started. **Twelve arrivals across thirteen
 * writes, one each, none overlapping**, at 7.2s, 8.8s, 9.4s, 10.0s, 10.8s, 12.1s, then
 * 21.0s, 23.3s, 24.3s, then 30.4s, 31.7s, 32.9s. All twelve on the wide frame and none
 * on the phone. The eighth write is the gap in the second run and it is the one that
 * names nothing.
 *
 * What nine screen pixels is, against the element it moves, in screen pixels:
 *
 *   element        390        1440       9px is
 *   head           137 x 23   236 x 43   6.6%   3.8%
 *   lede           137 x 17   188 x 22   6.6%   4.8%
 *   cta             75 x 17    84 x 22   12%    11%
 *   hero           137 x 79   255 x 133  6.6%   3.5%
 *   list           137 x 40   509 x 21   6.6%   1.8%
 *   nav              7 x 3    128 x 13   129%   7.0%
 *   foot-address    79 x 8     94 x 8    11%    9.6%
 *   foot-hours      18 x 8     22 x 8    49%    41%
 *
 * **The wide column is the readable one and it is readable at both ends.** 1.8% of a
 * 509px row still reads, because the row moves against a page that did not, and the
 * eye is locked on the column rule it breaks. 41% of a 22px footer readout also reads,
 * for the opposite reason: a small thing may travel far without looking broken, which
 * is how a caret moves. Between them there is no size at which the gesture fails.
 *
 * The phone column has one entry that is not a percentage of anything useful. **The
 * bar's menu glyph is seven screen pixels wide and the lift is nine**, so it would
 * travel more than its own width. A constant screen distance is right for the eye and
 * wrong for a 390px page, and there is no third number that is right for both — which
 * is the second, independent reason the phone frame here draws nothing.
 *
 * ## What it still cannot say, measured
 *
 * **Write 8 names nothing.** The prices come out of a hoisted `PRICES` constant and the
 * edit rewrites that array; there is no element on those lines, so the range resolves
 * to the frame's root. `--accrue` flagged this as the stamp's own miss and left the
 * degrade open. It is decided here as **silence**, because lifting the whole page says
 * *everything changed* and that is never true of one write. One miss in thirteen, and
 * the honest sentence is that the miss is not sized: this capture's happens to be three
 * numbers arriving, and the same edit pattern applied to the items array would be the
 * biggest change in the turn.
 *
 * So the two rules are silent about **disjoint** writes. A box diff misses 1, 4 and 5
 * and catches 8; a line range misses 8 and catches 1, 4 and 5. Neither is a superset,
 * and the reason they differ is that one asks what the page looks like and the other
 * asks what the file says.
 *
 * **The reflow is instantaneous and it is louder than the lift.** Nothing animates the
 * blocks a write displaces: they are in their new positions on the same frame the
 * element starts moving. On the phone page write 11 takes the headline to a second
 * line and moves the four blocks under it **11 screen pixels down, instantly**, while
 * the headline itself travels nine across over 300ms. The jump is the bigger event and
 * it is not the one that carries the information. FLIP would fix it and cannot be had:
 * an edit reboots the document with
 * `key={docNonce}` (`frame-shell.tsx:157-165`), so there is no element on the far side
 * that is the same element, and matching them by box is `--bloom`'s diff again. This is
 * the cost, stated: the direction is clean on the writes that change something in place
 * and is competing with a cut it did not make on the ones that reflow. **On the wide
 * page that is one write of thirteen and on the phone it is three** — the wide layout
 * puts the words beside a hero taller than they are, so the growth writes are absorbed
 * and move nothing at all. A second column is a reflow damper, which is the most
 * useful thing this frame found about desktop.
 *
 * ## Why the phone frame is silent, and both reasons are real
 *
 * `home--sm` renders the same page at 390 and re-renders on all thirteen writes. It
 * lifts nothing.
 *
 * The first reason is the gate, inherited: a write to `shared/tokens.css` reboots every
 * frame on the canvas at once, so only the frame the hand is on may speak. The hand is
 * on `home`. Drawn rather than asserted, which no frame in this family had done: two
 * frames re-render on one write, one of them is the work, and the only thing on screen
 * that can tell them apart is the thread.
 *
 * The second reason is that at 152 drawn pixels there is no document, no elements and
 * no stamps, so there is nothing to animate and nothing to name. **This channel cannot
 * run on a phone frame at canvas zoom at all.** A phone reaches 400 drawn pixels at
 * about 103%, and at 103% a desktop frame draws 1,483 against a 772px viewport. So the
 * two sizes cannot both be live and both be on screen, at any zoom, ever. That is a
 * sharper answer than comfort: **this is a wide-frame and entered-frame channel, and on
 * a canvas of phone frames at 39% it does not exist.**
 *
 * What the phone would look like if it could is arithmetic rather than a guess, and it
 * is not encouraging. Nine screen pixels is 5.9% of a 152px frame against 1.6% of a
 * 561px one, so the same distance is proportionally 3.7 times larger down there — and
 * the smallest element a write lands in, the bar's two-rule menu glyph, is **seven
 * screen pixels wide**. It would travel more than its own width. A constant screen
 * distance is right for the eye and wrong for a 390px page, and there is no third
 * number that is right for both.
 *
 * ## What the drawing caught that the arithmetic did not
 *
 * **The lightbox's life size is a phone.** `spool-play-rail.tsx` sets `BIG_W = 390` with
 * the reason written on it — *"A phone frame is 390 CSS px, so this is it at roughly
 * life size"* — and a `look` at `home` opens a 1440px page at 390. That is 27% of life
 * size, and **smaller than the 561 the canvas is already drawing it at**, so pressing
 * the thumbnail to see it properly makes it worse. Shared, #194's, and not this frame's
 * to fix, but it is the first time a frame here has had a wide page to open.
 *
 * **The `shot` corners have one pixel.** Struck at the 6 the presence stands at, the
 * right-hand pair reaches x 771 of a 772px viewport. They fit, and nothing else would:
 * the compile's stand-off of 15 would put them nine pixels outside the canvas.
 *
 * ## What this frame fakes, stated
 *
 * The phone re-rendering thirteen times. Below `LIVE_MIN_CSS_PX` it is a stored still
 * and would redraw three times, 2.55s late each; it is drawn live here on `--ghost`'s
 * inherited reason, that a frame which correctly draws almost nothing cannot be judged.
 * The fiction is granted to the *re-render* and refused to the *lift*, because the lift
 * is the question being asked.
 *
 * The element table. `LANDS` is written down rather than resolved from a real line
 * range, the way `--ghost-loud`'s `LANDS` and `--accrue`'s heights are, because there
 * is no capture that carries the diffs.
 *
 * ## Reduced motion
 *
 * `useTurn` jump-cuts to settled, so the revision goes from 0 to 13 in one commit and
 * `Lifted` refuses it by the same test that refuses a boot: thirteen writes landing
 * together is not thirteen edits, it is the end of the turn. Nobody is ever at the
 * frame either, so the thread and the corners never draw. **This direction degrades to
 * exactly nothing**, and that is right rather than a loss — it is one channel, and its
 * whole subject is a thing happening.
 *
 * The capture is `claude-edits.json`, the same two minutes as `agent-hand--ghost` and
 * `agent-play--edit-run`.
 */

/** the frame every one of this capture's twenty-one rows names, and the wide one here */
const SUBJECT = "home";

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"] },
	{ name: "site", frames: ["home", "home--sm"], active: true, open: true },
];

const SHOT_W = 120;

export default function AgentHandEditLiftFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked a different question: not what happened,
	// but where the agent is and whether it has a call open there
	const hand = handOf(script, turn);

	// how many of the thirteen design writes have landed. `write home` at 117ms is
	// `frames/home/frame.json` and is deliberately not one of them: geometry moves the
	// rectangle and leaves the design alone, so there is no element for it to name
	const rev = writesOn(script, turn, SUBJECT);

	// a picture is of the frame as it was when it was taken, so the thumbnail is drawn
	// at the revision the last `shot` caught rather than at the one on the canvas now
	const shotAt = shotRev(script, turn);
	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== SUBJECT) return null;
		const scale = width / 886;
		return (
			<div style={{ width, height: Math.round(554 * scale) }}>
				<div className="origin-top-left" style={{ width: 886, height: 554, transform: `scale(${scale})` }}>
					<KaffeWide rev={shotAt} />
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
				{/* nothing is selected anywhere in this frame, so the only marks out here that
				    are not names belong to the agent — and inside the frames there are none at
				    all, which is the whole of the direction */}
				<LiftField
					draw={(slot) =>
						slot.name === SUBJECT ? (
							<Lifted key={turn.run} rev={rev} held={hand?.frame === SUBJECT} scale={SCALE}>
								<KaffeWide rev={rev} />
							</Lifted>
						) : (
							<KaffeSmall rev={rev} />
						)
					}
				/>
				<HandLayer hand={hand} />
			</CanvasChrome>
		</SpoolShell>
	);
}

/**
 * Writes landed on the frame's source, which is what makes it redraw.
 *
 * A run's children are the calls it collapsed, so this is the same arithmetic
 * `railEntries` does to print `×6` — one number, two surfaces. `write` is excluded and
 * `edit` is not: the capture's single `write home` is the geometry sidecar, and there
 * is no element in the page for a change to the rectangle around it to land in.
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
