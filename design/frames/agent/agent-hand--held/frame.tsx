import { useState } from "react";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { type FieldFrame, HeldField } from "./held-field";
import { heldOf, shotRev } from "./held";
import { KaffeHomeHeld } from "./kaffe-home-held";
import { KaffeAbout, KaffeHours } from "./site-frames";

/**
 * agent-hand--held — the frame is what is held, so the frame is the whole of the
 * drawing.
 *
 * Type anything, press Enter, and watch the canvas rather than any one thing on
 * it. Nothing arrives. No head, no grip, no chip, no line, no mark inside a
 * rectangle. What happens is that `home` stays exactly as it was and the rest of
 * the canvas goes back, and it stays back for thirty-seven seconds until the turn
 * lands and comes forward again. The agent is not standing next to a frame holding
 * it. The frame is in its hands, and the way you can tell is that it is the only
 * one still fully on the canvas.
 *
 * **The decision, and it is forced rather than chosen.** A frame at full strength
 * on a plain canvas has exactly one property left to spend, and it is the strength
 * of everything else. There is no brighter than `#FEFEFE`, so presence here can
 * only ever be relative, and every claim below follows from that one fact. `home`
 * is 254 on a 22 ground for the whole turn and never moves; its neighbours drop to
 * 189 the moment the first call names it, and to 152 while a call is open. Those
 * are the only three settings, they are one quantity, and the quantity is how much
 * of the canvas is still the canvas.
 *
 * **Three postures, on three properties, because there is no object to hold
 * one.** This is the honest structural difference from `--presence` and it took
 * building to see. A token has a shape, so its three postures can be three states
 * of one shape. A rectangle has no shape to change — it is the shape — so the
 * postures land on three separate properties of it: *taking it in* is the frame
 * held and nothing happening to it, which is what a `look`, a `logs` and a `read`
 * all actually do to a file; *changing it* is the frame's own body redrawing, once
 * per write, because spool re-renders on source change and that is a report rather
 * than a mark; *photographing it* is the frame contracting for the length of the
 * call, ring and all, since a `shot` is the one call whose subject is the whole
 * rectangle and this is the one thing on this canvas that ever moves a frame's
 * edges. Five verbs land in three, and `read`, which this window happens not to
 * contain, lands in the first with nothing new drawn.
 *
 * **It holds through the dead air, and the dead air is what it is for.** Twelve
 * calls on `home` across 37.7 seconds, 17.7 of them with a call open and **20.0 of
 * them, 53.1%, with none**. Eleven gaps, the shortest 741ms and the longest 3.9s.
 * In every one of those seconds the canvas is unchanged and completely legible:
 * `home` lit, the rest back, nothing moving. That is the state the transcript has
 * no row for and the one a person watching the canvas actually wants — whether the
 * agent has finished with this frame or is coming back to it.
 *
 * **Nothing here has an entrance and an exit on a short call, and that is a fact
 * about the capture rather than a save.** Five of the twelve calls run under 320ms
 * — one `write` at 310ms and four `look`s at 281, 304, 218 and 186 — and every one
 * of them is a call that draws no new shape at all: a look does nothing to a
 * frame, and a write is a single redraw with no exit to flicker. The only posture
 * that needs to arrive and leave is the shot, and the three shots run 687ms, 752ms
 * and 669ms — an 83ms spread, and every one of them more than three and a half
 * times the shortest call in the turn. The one thing that has to move is the only
 * one of the three with room to move in. The live setting is not a
 * shape but a step, 110ms in and 110ms out, so a 186ms `look` spends 76ms of
 * itself at its floor instead of never reaching it.
 *
 * **The selection collision, drawn both ways at once.** Boot and `home` and
 * `hours` are both picked, which is a selection this canvas can really hold, and
 * that puts both cases on screen in the same still: the human's ring on the frame
 * the agent has, and the human's ring on a frame it does not, with an untouched
 * `about` between them as the control. Press any frame to move the picks around.
 * They do not collide, and the rule that keeps them apart is one line: **a name, a
 * ring and a walk arrow are spool drawing about a frame, and the weight is the
 * frame itself.** So a frame that has gone back keeps its ring and its name at
 * full strength, in the accent, unchanged — the two vocabularies are never in the
 * same pixels, never in the same ink, and never on the same property. The ring
 * does ride the shot's contraction, because a ring is drawn around a box and that
 * box moved; chrome following its subject is not the agent moving the human's
 * mark. The link graph is the sharper test and it passes the same way: three
 * accent arrows cross a field that has receded and do not recede with it.
 *
 * **The address is paid once, and this is what I did not know before drawing it.**
 * A tool block opens with an empty input and the file name arrives afterwards in
 * the argument deltas, so every row in this capture knows its verb before it knows
 * its subject: 157ms on the first, 314ms on the worst, **1,794ms across the twelve
 * of them**. Anything that prints a word per row pays that twelve times — on the
 * 186ms `look` at 27.6s the address lands with 68ms of the call left to run, which
 * is a word that was never for reading. A property of a frame pays it once, at
 * 274ms, and never again, because after that the frame is already held and every
 * later row is about the same rectangle. And the live setting pays none of it at
 * all: whether something is happening does not depend on knowing where, so it is
 * true on the instant the block opens.
 *
 * **The recession sets the redraw's floor, which I did not expect to be an
 * arithmetic question.** A write shows the frame's own socket through its body for
 * a beat, and the socket is `#0E0E0E` over `#FEFEFE`: a cover at `a` leaves
 * `254 − 240a`, and a receded neighbour is at 189, so they meet at 0.27. Any
 * darker and the held frame is briefly dimmer than the frames it is being held
 * against — fourteen times in this turn, a tenth of a second each — and the one
 * thing this direction says stops being true at the exact moment the thing it is
 * reporting happens. So the blink is capped at 0.26 by the depth rather than by
 * taste, and the second channel turns out not to be independent of the first.
 *
 * **Letting go is not undoing.** The turn lands, the field comes forward, and
 * `home` is the frame the agent left rather than the one it found: a different
 * headline, a fourth row in the hours, a longer address. That is the only trace
 * this direction leaves anywhere and it is the right one, because it is not a
 * trace of the agent at all — it is the work. Every direction that draws an object
 * has nothing on the canvas the moment it lets go; this one has the thing that
 * changed.
 *
 * **There is no travel, and here there is nothing that could travel.** The hold is
 * a property of a frame rather than a thing between frames, so moving from one to
 * the next is one frame going back and another coming forward, both at once, which
 * is what the wire says. A token sliding across the canvas would only be drawable
 * when both frames happened to be on screen at a zoom where the path fits; a
 * property is drawable at every zoom, on every frame, at once, and this is the
 * only candidate that reads the same on a canvas of thirty as on a canvas of
 * three.
 *
 * **When the held frame is on another page there is no frame, and the answer is
 * that the canvas says nothing.** A page with no held frame on it does not recede,
 * because a field that receded with nothing lit in it would be saying *one of
 * these* and be wrong. So the mark goes where `agent-play--jump-name` already put
 * it: the page lights in the Pages rail. Being honest about what that costs — up
 * there the rule survives and the *reading* does not. On the canvas the property
 * is on the thing itself; in the rail it is on a row, and a row is a name for a
 * frame rather than the frame, so at that moment this direction is a lit list item
 * like everybody else's. It is not drawn here, because this capture never leaves
 * `site` and faking a jump it never made would be drawing a moment the recording
 * does not hold.
 *
 * **What it costs.**
 *
 * *It cannot say anything on a page with one frame on it.* Everything here is a
 * comparison, so a page whose only frame is the held one has nothing to compare it
 * to and draws a completely ordinary canvas. `--presence` puts a 7px square on the
 * wall and works at a count of one. This is the floor of the idea rather than of
 * the execution: there is no brighter than full, so there is no way to say *this
 * one* without there being another one.
 *
 * *The agent's state is now the canvas's state.* Twenty-nine frames of thirty are
 * greyed for as long as a turn runs, and this turn runs 37.7 seconds. Nothing is
 * hidden and the names stay sharp, but you are reading the project through the
 * agent's attention for the whole of it, which is a large price for a small fact
 * and the thing to argue about.
 *
 * *The `#FEFEFE` problem is dodged rather than solved.* Nothing is drawn on a
 * frame, so nothing has to know what colour a frame is: a frame going back is its
 * own opacity over the ground it already sits on, and a dark frame recedes toward
 * the same ground by the same rule. What is left is that the direction needs the
 * frame and the canvas to differ at all. Here that gap is 254 against 22 and the
 * held frame is the brightest object in the viewport; on a canvas of dark frames
 * there would be very little to spend, and the whole language would go quiet.
 *
 * *The live setting is the weakest reading of the three.* 189 to 152 on the
 * neighbours is a shade, and it says *a call is open* rather than *this call is
 * open on this frame* — true with one agent, and the first thing that breaks if
 * there are ever two. It is also the one place where a whole-canvas change is
 * spent on a per-call fact, twelve times in thirty-seven seconds.
 *
 * *The verb is gone, and that is the trade.* `--presence` keeps a mono chip and
 * says so plainly; this has no receipt at all, so `look` and `logs` are one
 * picture, and so are `write` and `edit`. The rail names every call already and
 * this is the direction that decides to let it. Whether that is discipline or a
 * gap is the maintainer's call, and it is the difference between the two frames.
 *
 * Under `prefers-reduced-motion` the turn is a jump cut to settled, so nobody is
 * ever at a frame and nothing here is drawn. Its own transitions, if a turn ever
 * runs, are cuts: the settle, the step, the contraction and the redraw all take
 * zero, which leaves the recession itself, and a recession with no motion in it is
 * still the whole of this direction.
 */

/** the `site` page: `home`, which every row in this capture names, and two nobody touches */
const SITE: readonly FieldFrame[] = [
	{ name: "home", render: (rev: number) => <KaffeHomeHeld rev={rev} /> },
	{ name: "about", render: () => <KaffeAbout /> },
	{ name: "hours", render: () => <KaffeHours /> },
];

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"] },
	{ name: "site", frames: SITE.map((frame) => frame.name).sort(), active: true, open: true },
];

/**
 * Both selection cases, on screen together.
 *
 * The frame the agent takes hold of and one it never touches, so the ring is on a
 * held frame and on a receded one in the same still. It is a real state rather
 * than a demonstration: #196's composer draws the whole selection the daemon
 * serves, and two picks is what that strip is for.
 */
const PICKED: readonly string[] = ["home", "hours"];

const SHOT_W = 120;

export default function AgentHandHeldFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	const [picked, setPicked] = useState<readonly string[]>(PICKED);

	// the same rows the rail is reading, asked a different question: not what
	// happened, but which frame is in the agent's hands and what is happening to it
	const held = heldOf(script, turn);
	const rev = shotRev(script, turn);

	/**
	 * The picture behind a `look` row, drawn by the same component the canvas draws
	 * `home` with, at the revision the camera saw. A spool screenshot is of a frame
	 * spool can still render, so the thumbnail is the frame rather than a stand-in.
	 */
	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== "home") return null;
		const scale = width / 240;
		return (
			<div style={{ width, height: Math.round(520 * scale) }}>
				<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
					<KaffeHomeHeld rev={rev} />
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
				{/* two picks, so the Pages rail's single `selected` slot has no honest
				    answer and is left alone; out here both rings are drawn where they are */}
				<HeldField
					frames={SITE}
					held={held}
					selected={picked}
					onSelect={(name) =>
						setPicked((was) => (was.includes(name) ? was.filter((one) => one !== name) : [...was, name]))
					}
				/>
			</CanvasChrome>
		</SpoolShell>
	);
}
