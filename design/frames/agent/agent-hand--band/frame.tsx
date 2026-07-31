import { useCallback, useEffect, useState } from "react";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { BandLayer, handOf, revAtShot, revOf, type Zone, zoneOf } from "./band";
import { KaffeHomeBand, type Span } from "./kaffe-home-band";
import { KaffeAbout, KaffeHours } from "./site-frames";

/**
 * agent-hand--band — the presence and the change are one object, and the grip says
 * where the work landed.
 *
 * Type anything, press Enter, and watch `home` rather than the rail. It is the middle
 * frame, the agent spends the whole thirty-seven seconds there, and the only mark on
 * the canvas is docked to its right wall: a head, and a bar the head has hold of.
 * Every other direction in this round marks the content and leaves the presence
 * beside it, so the canvas has two things happening. This one has one.
 *
 * **The grip already had a length, and this gives it a place.** `agent-hand--presence`
 * won the last round with a head welded to the wall and a grip whose length said what
 * kind of hold it was — the whole wall while the agent takes the frame in, a short
 * segment while it changes it. That segment was 76 pixels of a 329 pixel wall, and it
 * sat at the middle. The middle was never argued: it is where a bar goes when nobody
 * has asked where it goes. A grip shorter than the wall is already somewhere on it,
 * and this direction is the cheapest possible answer to *where* — the same object,
 * one property, no second mark, and nothing at all drawn over the design.
 *
 * **The mark is as tall as its own error.** The wall is three bands of 109.7 pixels
 * and the grip is one of them. A band says *around here*, and the only way to stop a
 * reader taking *around here* for *exactly here* is to draw something that could not
 * possibly mean exactly here, so the claim is exactly the size of the thing making
 * it: being thirty pixels out is not a mistake this drawing can make, because thirty
 * pixels is inside the band. Three is the coarsest division that says the only thing
 * a person needs in order to know where to look — top, middle, bottom. It never
 * touches the frame, so it never has to agree with an edge inside it.
 *
 * **It does not slide, and the family's own law is what decides that.** A write
 * landing in the footer is not the previous write travelling down the wall. It is
 * another write, somewhere else, and between them the agent held nothing in between.
 * So the grip lets go of one third and takes hold of another, both at once — which is
 * exactly what the presence does between two frames, applied to two thirds of one.
 * Sliding would narrate a journey the wire does not contain, at a smaller scale and
 * for the same reason the token is forbidden from crossing the canvas. The head never
 * moves at all, and that is what makes a position readable: high or low is only high
 * or low against something.
 *
 * **Between edits it says the same thing in the past tense, and ink is what makes
 * that safe.** The band stays where the last write landed and drops to a third of its
 * strength when nothing is open, so the loud band means *changing this now* and the
 * quiet band means *the last change was around here*. Two tenses on one property,
 * separated by the channel that already carried tense. Measured from each row's
 * `subjectCue` to its result, the twelve calls on `home` hold the wire for 15.9 of
 * 37.4 seconds and leave 21.6 quiet — 58%, across eleven gaps, the shortest 819ms and
 * the longest 4.1s — so the quiet band is what is on screen for most of this turn, and
 * after the first run it sits in the bottom third for 3.2 seconds saying so.
 *
 * **The taking-in postures take the position away, and they are right to.** When the
 * next call is a `look` or a `logs` the grip opens back out to the whole wall, so the
 * memory of where the work was is released by the agent turning its attention on the
 * whole frame. Position exists only inside the part-posture, because a hold on the
 * whole thing has no inside.
 *
 * **Six writes in five seconds is two moves, and that is the answer to jitter.** The
 * run's six children land 1.6s, 0.6s, 0.6s, 0.8s and 1.3s apart, and per-pixel
 * precision would move the band six times inside 4.8 seconds, which is a twitch. At a
 * third the same six writes are three positions: four in the top, then the hero, then
 * the hours. Across all thirteen writes and thirty-seven seconds the band changes
 * third six times. The coarseness is not a compromise on the precision — it *is* what
 * makes the rhythm survivable, and the two arguments happen to want the same number.
 * A write inside the third the grip already holds is not silent: the bar thickens from
 * 3 to 5 for 140ms and settles, on a transform, so a write is a beat and never a
 * change of length.
 *
 * **`write` lost its short grip, and finding out why was the useful part.** The parent
 * gave `write` and `edit` the segment, on the reading that length separates changing a
 * frame from taking one in. The capture's one `write home` is `frames/home/frame.json`
 * — geometry — so a grip that shortened for it would be pointing at a third of a design
 * that did not move. Length stops being a taxonomy of verbs here and becomes a plain
 * statement of extent: the grip covers what the agent has hold of. Only an `edit` has
 * hold of a part.
 *
 * **The wall of a middle frame is already occupied, and the neighbours are not the
 * whole of the dock rule.** `home` sits in the middle column because that is the honest
 * case — 44 pixels of gutter on both sides, under the 64 a chip needs, so there is no
 * word anywhere on this canvas and the object carries the whole message alone. The
 * parent's arithmetic breaks a 44-against-44 tie leftward, and left is where
 * `spool-play-field.tsx` lands the incoming walk's arrowhead: a filled triangle at
 * `ROW_1 + 186`, nine pixels tall, finishing one pixel short of the wall. The outgoing
 * edge leaves the right wall at `ROW_1 + 158` as a 1.5px hairline heading away. Both
 * walls are taken, so the tie goes to the occupant a 3px bar can cross without
 * swallowing it: the hairline crosses the grip over four pixels and passes 2.8 above
 * the head, which is a near miss rather than a clearance. A presence that docks on
 * walls has to read the graph as well as the neighbours, and that is a rule this
 * family did not have.
 *
 * **The `shot` ring is gone and the hold hooks over the frame instead.** A box six
 * pixels off a frame reads as a selection at 1.5px and at 2px, which is the parent's
 * own recorded defect. This keeps the grip and lets it overrun: both ends turn the
 * corner and run 14 pixels along the top and the bottom edge, at the grip's own 3px,
 * because it is the grip rather than an outline of anything. It never closes, so it
 * cannot be a border. Drawn at 24 it was a bracket around the frame, which is the
 * same mistake one radius further out.
 *
 * ---
 *
 * **Whether the product can supply the y-range: the measurement is available, the
 * cadence is not, and the two answers belong to different zooms.**
 *
 * `agent-hand--inside` died on this, and its reading was that a `str_replace` gives
 * a byte offset in a source file rather than a rectangle on a rendered page, with a
 * source map nobody has in between. The source map exists.
 * `src/runtime/jsx-dev-runtime.ts:27` stamps every intrinsic element with
 * `data-spool-source: "<file>:<line>:<col>"`, injected by esbuild's `jsxDev` at
 * `src/daemon/compile.ts:168`; the canvas shim in `src/daemon/document.ts:948`
 * already scans `[data-spool-source]` and answers `getBoundingClientRect()` per
 * stamp; and `canvas.tsx:1608` already re-asks on every `loaded`, which is every
 * reboot, because "a fresh document renders fresh elements: re-anchor its arrows".
 * The measuring runtime is that shim rather than `src/runtime/frame-runtime.ts`,
 * which carries clipboard, walks and the player and measures nothing.
 *
 * So the frame half is a sibling of `siteBoxes`: a `{spool:"source-range", path,
 * from, to}` request, and a reply that unions the rects of the stamps whose path
 * matches and whose line falls in the range — the same scan, filtered by line
 * instead of matched on the exact triple, plus `window.scrollY`, which today's boxes
 * do not carry. **What is missing upstream is that nothing knows which lines
 * changed.** `src/daemon/events.ts:18` publishes `{kind:"frame", frame}`, a filename,
 * off an `fs.watch`; `agent-events.ts:275` keeps a tool-use count and no ranges.
 * Somebody has to record the edit's own line span, and the range has to be asked of
 * the post-reboot document in post-edit line numbers, because an edit that shifts
 * lines invalidates the stamps you would ask with.
 *
 * **And a frame at canvas zoom is not a live document.** `cover.ts:8` sets
 * `LIVE_MIN_CSS_PX = 400` and `lifecycle.ts:245` refuses to mount anything narrower,
 * so at the 39% this canvas is drawn at, a 390pt frame is 152 pixels of stored still
 * and there is no DOM out there to ask. The crossover is 400 ÷ 390, about 103%.
 *
 * **The measurement survives that, and this is the part I did not expect.** The still
 * is not a photograph of nothing: `lifecycle.ts:19` borrows the frame and mounts its
 * document precisely in order to photograph it, and `document.ts:676` waits for that
 * document to go quiet before it serialises itself. So the thing that makes the
 * picture is a real document with the stamps in it, and a y-range can ride the errand
 * that is already running — one more field on the reply that already carries the
 * cover, and the canvas never reads anything.
 *
 * **What does not survive is the cadence, and it empties this direction rather than
 * weakening it.** `CAPTURE_AFTER_READY_MS` is 1500 and the errand itself costs 660
 * to 1437ms, so a new still is 2.55 seconds behind at best, and a write inside that
 * window bumps the nonce at `canvas.tsx:522` and starts it over. Across this capture
 * the thirteen writes produce three photographs, each carrying a whole run and each
 * landing after the agent has moved on. Run one touches the headline, the sub, the
 * button, the hero and the hours: top, middle **and** bottom. So does run two. Run
 * three touches the hours, the bar and the button, top to bottom again. All three
 * batches cover all three thirds, so a band drawn at the cover's cadence is the whole
 * wall three times and carries no information at all. There is no wider band to
 * retreat to, because the widest band is the posture this object already has.
 *
 * **So the regime is stated rather than implied: this is the live one, at or above
 * about 103% zoom.** It is drawn here at 39% because the round is comparing five
 * grammars on one canvas and a different zoom would make this frame incomparable to
 * the other four — the thirteen redraws below are the live cadence rendered at a zoom
 * that would not have them. Under the threshold this direction degrades into
 * `agent-hand--presence` exactly: the grip keeps its length, its ink, its postures and
 * its hooks, and the single thing that goes dark is the single thing this direction
 * added. That is the cheapest degradation available, and it is the argument for
 * having put the position onto the object that was already there rather than drawing
 * a second one — a direction that marks the content has nothing left when the content
 * is a photograph.
 *
 * **Every way that measurement degrades makes the answer bigger, which is the
 * argument for a third.** An edit inside a `shared/ui` component has no stamp in the
 * frame's own file and resolves to the nearest stamped ancestor; an edit at a
 * non-intrinsic JSX position has none at all. A rectangle inheriting that error is
 * wrong about the design. A band claiming a third absorbs a hundred pixels of it and
 * stays true. This direction needs the weakest version of the thing `--inside` needed
 * and degrades gracefully into the version the product can actually deliver.
 *
 * ---
 *
 * **What it costs.** The frame measures its own block in a `useLayoutEffect`
 * (`kaffe-home-band.tsx`), which is the one shortcut taken here: out there the same
 * measurement runs inside the document and crosses back by postMessage, because the
 * iframe is `sandbox="allow-scripts"` with no `allow-same-origin` and the canvas can
 * never read a frame's DOM itself. The staged `home`
 * is built in ordinary flow layout on purpose, so the eighth write really does push
 * every block below the headline down twenty pixels and a band claiming a third is
 * still right afterwards, where `--inside` had to author its frame as seven absolute
 * boxes to keep a rectangle honest. There is no verb word on the canvas at all, which
 * is the middle column's own rule and means `look` and `logs` are one picture out here
 * — the rail owns the receipt, and this direction leans on that harder than the parent
 * did. The layer is a sibling of `PlayField` drawing in the field's copied
 * coordinates, so this frame can never centre the camera on anything. And the honest
 * structural cost: a third is three answers, so a frame whose work is genuinely spread
 * across all of it will look the same as a frame whose work is nowhere in particular.
 *
 * Under `prefers-reduced-motion` the turn is a jump cut to settled, so nobody is ever
 * at the frame and no object is drawn at all — the same page-wide gap the parent has,
 * and the same reading of it: presence is a live state and stillness is the state
 * where the work is over. Its own transitions are cuts if a turn ever runs, which
 * means the band changes third instantly and the flick does not fire.
 *
 * The capture is `claude-edits.json`, the same thirty-seven seconds as
 * `agent-hand--presence`.
 */

/** the frame every one of the twenty-one rows in this capture names */
const SUBJECT = "home";

const NAMES = ["about", SUBJECT, "hours"] as const;

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"] },
	{ name: "site", frames: [...NAMES], active: true, open: true },
];

/** the natural box every frame on this canvas is authored in */
const NAT_W = 240;
const NAT_H = 520;
const SHOT_W = 120;

export default function AgentHandBandFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	/*
	 * Where the last write landed, as the frame itself measured it.
	 *
	 * The band is not told which block changed — it is told which third the block
	 * turned out to occupy, after the layout ran. That ordering is the whole of the
	 * claim: a write, then a render, then a measurement, then a mark.
	 */
	const [landed, setLanded] = useState<{ rev: number; zone: Zone } | null>(null);
	const onLand = useCallback((rev: number, span: Span) => setLanded({ rev, zone: zoneOf(span) }), []);
	useEffect(() => setLanded(null), [turn.run]);

	const rev = revOf(script, turn, SUBJECT);
	const shotRev = revAtShot(script, turn, SUBJECT);

	// the same rows the rail is reading, asked a different question: not what
	// happened, but where the agent is and which part of this frame just moved
	const hand = handOf(script, turn);

	const site: readonly BaseFrame[] = [
		{ name: "about", screen: "menu", render: KaffeAbout },
		{ name: SUBJECT, screen: "menu", render: () => <KaffeHomeBand rev={rev} onLand={onLand} /> },
		{ name: "hours", screen: "menu", render: KaffeHours },
	];

	/**
	 * The picture behind a `look` row: the frame at the revision the last `shot`
	 * caught, drawn by the same component the canvas draws `home` with. It is
	 * deliberately behind what the canvas is showing, because the file on disk is.
	 */
	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== SUBJECT) return null;
		const scale = width / NAT_W;
		return (
			<div style={{ width, height: Math.round(NAT_H * scale) }}>
				<div className="origin-top-left" style={{ width: NAT_W, height: NAT_H, transform: `scale(${scale})` }}>
					<KaffeHomeBand rev={shotRev} onLand={() => {}} />
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
				{/* nothing is selected anywhere in this frame, so the only mark out here
				    that is not a name or a walk is the agent */}
				<PlayField base={site} />
				<BandLayer hand={hand} rev={rev} zone={landed?.zone ?? null} base={[...NAMES]} />
			</CanvasChrome>
		</SpoolShell>
	);
}
