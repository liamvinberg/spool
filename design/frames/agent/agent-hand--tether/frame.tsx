import { useReducedMotion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import type { ShotRef } from "../../../shared/lib/turn-play";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { KaffeHome } from "../../../shared/ui/kaffe-home";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { holdOf, Probe, TetherLayer } from "./tether";

/**
 * agent-hand--tether — the correspondence is drawn rather than left to be worked
 * out. Presence is the line itself.
 *
 * Play it. A line comes out of the rail's inner edge at the height of the row that
 * is running, curves across the canvas and lands on `home`. It stays there for the
 * whole turn, and what travels along it says which way the work is going.
 *
 * **Every other direction marks the frame and leaves you to find the sentence that
 * explains it.** The row says `edit home ×6` and something out on the canvas goes
 * bright; the two are the same event and nothing on screen says so. This draws the
 * join. Look at the rail and your eye is carried out to the frame; look at the frame
 * and the line takes you back to the line of text that accounts for it. That is the
 * whole proposal, and everything below is what it costs.
 *
 * **Three verbs, three characters of one line, and the capture rewrote the brief.**
 * There is no `read` row anywhere in this turn. The verbs it really plays are
 * `write`, `shot`, `look`, `edit` and `logs`, so the characters are keyed to what a
 * call *moves* rather than to its name: `write` and `edit` push out to the frame,
 * `look` and `logs` pull back to the rail, and `shot` is a request that carries
 * nothing. A pulse is filled when it has something in it and hollow when it does
 * not, which is one mark doing the work of a legend.
 *
 * **The round trip is two rows, not one animation.** `shot home` asks and `look
 * home` is the picture arriving, about a second later and one row further down —
 * three times in this turn, plus a fourth `look` that answers a `logs` — every one
 * of them a hollow pulse out followed by a filled pulse back to a port that has
 * moved down the rail in between. `agent-play--shot-open` put the picture in the
 * row's own disclosure and this is the line that carries it there. It is also where
 * refusing to draw over the rail costs something: the pulse lands on the seam and
 * the picture opens a few pixels inside it, so the last leg of the delivery is the
 * rail's and not the line's.
 *
 * **`edit ×6` is six crossings and they are the capture's own six.** The run's count
 * climbs off six separate write cues 1.6s, 0.6s, 0.6s, 0.8s and 1.3s apart, so the
 * crossings have the rhythm the writing had. Nothing here loops: a pulse exists
 * because something happened, and between the things that happened the line is
 * completely still.
 *
 * **The rail boundary, which is most of this design.** The line is a canvas object
 * and it stops at the canvas. Nothing is ever drawn over the transcript — no leader
 * threading between rows, no overlay on the panel — because the moment the tether
 * can cover a word, reading the log costs you the line. What it gets instead is a
 * **port**: a 26px bar on the canvas side of the seam, the exact height of a row,
 * sitting at the exact height of the row it belongs to. Sliding your eye left off
 * the row's state mark lands on it. The mark is also literally where the line
 * starts, which is why the port is 26 and not 40: it is a row, drawn edge-on.
 *
 * **The line goes under the frames.** Drawn over one it is not quiet, it is gone: a
 * near-white hairline on a phone screen is nothing, and the first pass of this lost
 * whole seconds of tether behind `thanks`. Under is also where `PlayField` already
 * keeps its own thread arrows, so a canvas where lines pass behind the things on it
 * is a rule this frame joins rather than one it invents. What lands on the frame is
 * a cleat sitting a pixel off the wall, which is the port again seen from the other
 * end.
 *
 * **The anchor moves, so it is measured every frame rather than laid out.** The row
 * slides while the transcript grows, the frame moves when the canvas is panned, and
 * a disclosure opening under a `look` row shifts the row itself by 120px. One
 * `requestAnimationFrame` loop writes the path, the port and the pulses straight
 * onto the SVG; no React state changes at 60Hz, so the line and a transcript that
 * re-renders ten times a second cost each other nothing.
 *
 * **Scroll back and the port goes quiet.** The transcript follows the live end, so
 * during a turn the row is where the line says it is. Read back up and it is not:
 * the port stops at the edge of the log's own band, shrinks to a stub and drops to
 * half weight, and the line dims with it. A correspondence you cannot verify is one
 * the line must stop claiming, and going quiet says that without letting go.
 *
 * **The frame off screen.** Drag the canvas. The tether follows `home` out and stops
 * a shade inside the viewport wall, pointing, with the frame's name beside the
 * point — so off screen keeps the one thing no other direction has, which is
 * direction. `agent-play--jump-name` answered off-screen by lighting the page in the
 * Pages rail, and that answer is still here on hover, unchanged: pointing at a row
 * lights the page, the agent's own work draws the line. They are deliberately
 * different marks, because one of them is something you caused.
 *
 * **Presence is the line existing at all, and the dead air is the argument for it.**
 * The eleven gaps between calls in this turn run 0.7s to 3.9s. A tether that only
 * lived during a call would flicker eleven times in thirty-eight seconds and would
 * say the agent had left and come back eleven times, which is false — it never went
 * anywhere. So the tether is tied to the *frame being worked on* rather than to the
 * call: it draws itself in once, holds through the gaps at half weight with nothing
 * moving on it, and retires when the turn ends. Its rail end walks down the
 * transcript as the rows arrive while its canvas end stays pinned. That walk is the
 * presence, and it costs no new object.
 *
 * **`agent-walk-ambient` ruled against this shape and its ruling holds.** An object
 * in the field with a line back to a rectangle is a puzzle at four frames and a knot
 * at thirty. The defence is that there is only ever one tether, and it is measured
 * rather than assumed: **across all seven captures and every slice, no two
 * overlapping tool rows both name a frame.** Not one pair. Rows do overlap — twenty
 * pairs in `claude-mcp`'s session alone — but never two that have a frame to point
 * at, so there is never a second line to draw.
 *
 * **And the reason that is true is the thing that could kill this.** It holds
 * because a sub-agent's writes never reach the transcript: `fromParent` gates ten
 * sites in `claude-turn.ts`, so in `claude-fanout` three delegates write three
 * frames while the log shows one `Task` row that names none of them. The moment
 * those writes are drawn — and the canvas is already where a delegate's work shows —
 * this direction is three lines, then five, and `agent-walk-ambient` was right. The
 * single tether is a property of what the rail currently hides, not of how the agent
 * works.
 *
 * **The second cost is a coupling that does not exist yet.** A line that starts at a
 * row needs the row's box, and the rail hands out no geometry at all, so this frame
 * goes and finds the row in the transcript's own DOM by the same accessor the
 * transcript's follow logic already uses. It works and it is honest about being a
 * borrow. What the design actually implies is a rail that publishes the live row's
 * box, and nothing here would change if it did.
 *
 * **Reduced motion.** The turn is a jump cut, so there is nothing in flight to draw
 * — and a still reader who saw nothing at all would be shown none of this. So the
 * tether is drawn on the settled turn instead: the same line, the same port, the
 * same cleat, no travel, and one chevron parked on the line just clear of the port,
 * pointing the way the last call went. Filled if it carried something, hollow if it was only
 * a request. Everything the moving version says except the moving.
 *
 * The capture is `claude-edits.json`, the same two minutes as
 * `agent-play--edit-run` and `agent-play--jump-name`. Twelve rows, every one of them
 * `home`, which is why the canvas starts on `site` with `home` in the middle of it
 * rather than a page away: `jump-name` had to reach the work, and this has to sit
 * next to it.
 */

/** the site page, with the frame the whole turn is about in the middle of it */
const SITE: readonly BaseFrame[] = [
	{ name: "order", screen: "cart" },
	{ name: "home", screen: "menu" },
	{ name: "thanks", screen: "receipt" },
];

const APP = ["cart", "menu", "receipt"];
const TAKES = ["cart--empty", "cart--empty-b", "cart--empty-c"];

const OF: Record<string, string> = { order: "site", home: "site", thanks: "site" };

/**
 * The picture a `look` row opens, and the thing the inbound pulse is delivering.
 *
 * `FrameThumb` knows the three coffee screens and not this page's `home`, so the
 * thumbnail is drawn here the way that one draws its own: the frame's component at
 * its authored 240×520, scaled. #194 settled that a screenshot is a real 120px
 * picture behind its row's disclosure, and the round trip has to land on something.
 */
const NAT_W = 240;
const NAT_H = 520;
const SHOT_W = 120;

const picture = (shot: ShotRef, width = SHOT_W) => {
	if (shot.frame !== "home") return null;
	const scale = width / NAT_W;
	return (
		<div style={{ width, height: Math.round(NAT_H * scale) }}>
			<div className="origin-top-left" style={{ width: NAT_W, height: NAT_H, transform: `scale(${scale})` }}>
				<KaffeHome />
			</div>
		</div>
	);
};

export default function AgentHandTetherFrame() {
	const still = useReducedMotion() === true;
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	const [landed, setLanded] = useState<string | null>(null);
	const [pointed, setPointed] = useState<string | null>(null);
	const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
	const grab = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);

	// the frames report their own boxes, so the canvas end of the tether needs no
	// shared code and survives both the pan and the field's own camera
	const boxes = useRef<Map<string, HTMLElement>>(new Map());
	const mark = useCallback((name: string, node: HTMLElement | null) => {
		if (node === null) boxes.current.delete(name);
		else boxes.current.set(name, node);
	}, []);

	const base = useMemo<readonly BaseFrame[]>(
		() =>
			SITE.map((frame) =>
				frame.name === "home"
					? {
							...frame,
							render: () => (
								<Probe name="home" on={mark}>
									<KaffeHome />
								</Probe>
							),
						}
					: frame,
			),
		[mark],
	);

	const entries = railEntries(script, turn, elapsed);
	const hold = holdOf(entries);
	// the tether lives for the turn. Under reduced motion the turn is already over
	// on the first frame, so it is held on the settled log instead — otherwise
	// stillness would erase the whole of what this direction is
	const held = hold !== null && (turn.phase === "playing" || (still && turn.phase === "settled")) ? hold : null;

	const litPage = pointed === null ? null : (OF[pointed] ?? null);
	const pages: readonly PageRow[] = [
		{ name: "app", frames: APP },
		{ name: "takes", frames: TAKES },
		{
			name: "site",
			frames: SITE.map((frame) => frame.name),
			active: true,
			open: true,
			lit: litPage === "site",
		},
	];

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={pages}
				selected={landed ?? undefined}
				tool="hand"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={entries}
						phase={turn.phase}
						shot="open"
						shotView={picture}
						jump="name"
						have={SITE.map((frame) => frame.name)}
						pointed={pointed}
						onPoint={setPointed}
						onJump={(frame) => {
							setPan({ x: 0, y: 0 });
							setLanded(frame);
							setPointed(null);
						}}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				{/* the tether is under the frames and over the canvas, which is where
				    `PlayField` already puts its own thread arrows. A line drawn over a frame
				    is invisible on it — the stroke is near-white and so is a phone screen —
				    and passing behind is what a line on a canvas with things on it does */}
				<TetherLayer held={held} boxes={boxes} still={still} />
				{/* the canvas is draggable so the off-screen case can be felt rather than
				    switched to: it is the gesture that puts a frame off the edge in the real
				    product, and the tether's answer to it is the second half of this frame */}
				<div
					className="absolute inset-0 cursor-grab active:cursor-grabbing"
					onPointerDown={(event) => {
						grab.current = { x: event.clientX, y: event.clientY, from: pan };
						event.currentTarget.setPointerCapture(event.pointerId);
					}}
					onPointerMove={(event) => {
						const held0 = grab.current;
						if (held0 === null) return;
						setPan({
							x: held0.from.x + (event.clientX - held0.x),
							y: held0.from.y + (event.clientY - held0.y),
						});
					}}
					onPointerUp={() => {
						grab.current = null;
					}}
					onPointerCancel={() => {
						grab.current = null;
					}}
				>
					<div className="absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
						<PlayField
							base={base}
							selected={landed === null ? [] : [landed]}
							pointed={pointed}
							center={landed}
						/>
					</div>
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}
