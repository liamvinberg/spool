import { useRef, useState } from "react";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { KaffeHome } from "../../../shared/ui/kaffe-home";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { KaffeAbout, KaffeHours } from "../agent-hand--presence/site-frames";
import { boxInView, HandLayer, handOf, rungOf } from "./hand";
import { type RailHold, type RosterPage, RosterChrome } from "./roster-chrome";

/**
 * agent-hand--roster — the presence is drawn wherever the frame it belongs to can
 * be pointed at, and the fall down that ladder is the whole design.
 *
 * Play it, then go somewhere else. Drag the canvas until `home` slides off the
 * viewport, or click `app` in the Pages rail, or collapse the rail with the caret in
 * its header. The presence does not go with you and it does not disappear. It is
 * redrawn on the smallest thing still on screen that contains the frame, and it goes
 * on holding.
 *
 * **`agent-hand--presence` is invisible for most of the work it narrates, and that
 * is what this fixes.** Its object is a head welded to a frame's wall and a grip
 * along it, which only exists while the frame is a rectangle you can see.
 * [#136](https://github.com/liamvinberg/spool/issues/136) made off-screen the normal
 * case and `agent-play--jump-name` measured it: every row in this capture names
 * `home`, and `home` is one page over from wherever you usually are. So the parent
 * drew a presence object for the minority of the time it had anywhere to be drawn.
 *
 * **The rule is not distance, it is containment.** The presence lands on the
 * smallest thing on screen that contains the frame, and there are four such things:
 *
 *     the frame          on this page, wholly in view
 *     the frame's row    the page is open under you, the frame has been panned out
 *     the page's row     the frame is on a page you are not looking at
 *     the rail's strip   the Pages rail is collapsed and there are no rows left
 *
 * Below that there is no rung and the object is simply not drawn. Switch projects
 * and nothing on screen contains `home`; a presence with nothing to be present *at*
 * is a claim about a canvas nobody is looking at.
 *
 * **This is `agent-play--jump-name`'s rule, not a new one.** That frame decided that
 * hovering a row lights the frame out on the canvas, and lights the *page* when the
 * frame is elsewhere, because pointing gets answered wherever the answer can be
 * drawn. `PageRow.lit` exists for exactly that. The agent's own work obeys the same
 * ladder for the same reason, and the two are deliberately different marks, because
 * one of them is something you caused.
 *
 * **One object, and the axis is what makes it one.** A frame's only free edge is a
 * side wall, 329 pixels of it, so the grip is vertical. A row's only free edge is the
 * row, so the grip is horizontal. Head welded to the edge, grip growing out of the
 * head along it, three postures and two inks: the grammar is untouched and the only
 * thing that changed is the geometry the subject had to offer. A row is not a
 * rectangle in the rail's own idiom, and the one moment this admits it is one is
 * `shot`, where the grip leaves the line and runs the row's perimeter — which is the
 * same event as the grip leaving a frame's wall and running its box.
 *
 * **What did not survive the drop, measured.** The parent's grip is 76 of a 329px
 * wall, 23%, so length reads as *how much of this frame*. Twenty-three per cent of a
 * 28px row is 6.4px, which is smaller than the 7px head. The fraction dies at the
 * first rung down. What is kept is the order — a long bar, a short bar, none — so
 * `look` and `edit` are still two postures, but the grip has stopped being a
 * quantity and become a rank. That is the real cost of this variation and it is paid
 * on three of the four rungs.
 *
 * **Turning the object found a shape problem the parent never had.** A 3px bar with
 * a 7px head standing on a wall is a hold. The same two marks lying flat, with the
 * head at one end of the bar, is a slider, and it read as one the first time it was
 * drawn next to a folder count. Two things fixed it and both are the parent's own
 * rules restated: the head sits in the middle and the grip grows out of it in both
 * directions, exactly as it does on a wall, and the row's grip is a hair rather than
 * a bar, which is the weight the rail's tree connectors already use. The head keeps
 * its size on every rung, because the head is the participant.
 *
 * **The chip carries whatever the place does not say.** A frame on the canvas wears
 * its name above it and a frame's row *is* its name, so both get the verb alone. A
 * page's row names the page, so the chip there reads `home look` — because the one
 * thing a fall must not cost you is which frame. `look` against `logs` stays
 * tellable on every rung, which is the thing the parent already admitted the posture
 * alone cannot do.
 *
 * **Keeping it off the human's marks took no colour and no accent.** The rail's
 * existing states are all *fields*: `active` is a thread-coloured spine, `selected`
 * and `lit` are a `bg-surface` wash across the whole row. The presence is a *figure*:
 * ink marks lying on the row's own line, at the same two strengths it uses on the
 * canvas, in `--color-text` and never in the thread. Hover a row the agent is
 * standing on and you get both at once, a wash under a mark, and neither one is
 * reading as the other. The thread stays the human's.
 *
 * **The last rung loses the grip, and that is where the ladder ends.** A collapsed
 * rail has no rows, so there is nothing with a shape for the grip to lie along, and
 * what is left is the head alone on the strip's inner seam. It still says somebody is
 * in there and it can no longer say what they are doing. The ladder stops there
 * because the object has run out of channels rather than out of places — one more
 * rung down and it would be a dot that means nothing.
 *
 * **What the shared rail would have to grow.** `spool-canvas-chrome.tsx` cannot carry
 * this, and the reason is its own shape: `PageRow` is a page, and the frames under an
 * open page are rendered from a bare list of strings, so there is no channel to reach
 * `home`'s row at all. `PageRow.lit` reaches the page only, and spends `bg-surface`,
 * which is the one treatment this object had to stay clear of. One addition would do
 * it — a frame under an open page has to be addressable, the way `targets` already
 * addresses one — and the chrome is copied into this folder in the meantime, the way
 * `agent-hand--label` and `agent-hand--inside` each copied the field. Two affordances
 * the shipped chrome draws but does not wire are wired here because the ladder cannot
 * be shown without them: a page row switches the canvas, and the header caret
 * collapses the rail.
 *
 * **Nothing moves the camera on its own, and that is deliberate.** The capture names
 * one frame, so the only honest way to put it off-page is for the person to go
 * somewhere else, which is exactly the case being drawn: the agent did not leave, you
 * did. `agent-hand--tether` panned with the hand tool for the same reason and this
 * opens with the hand tool live, so the first rung down is one drag away. A canvas
 * that panned itself while the agent worked would be answering a question nobody
 * asked, and it would make the fall look like the agent's move.
 *
 * **Inherited and unchanged.** There is no travel: the object lets go here and takes
 * hold there, both at once, and a fall down a rung is not travel either — it is the
 * same object drawn in the only place left that can hold it. It holds through the
 * dead air, which is 19.9 of this turn's 37.6 seconds across eleven gaps. Five of the
 * twelve calls run under 320ms and a `look` runs 186ms, so the ink is instant and the
 * word is given 300ms to leave. Nothing spins and nothing is coloured.
 *
 * Under `prefers-reduced-motion` the turn is a jump cut to settled, so nobody is ever
 * at the frame and none of this is drawn — the page-wide gap, not this frame's. What
 * this one would degrade to is the same four rungs with cuts instead of fades: every
 * transition here is already an opacity or a length, and the still reader would lose
 * the sweep of the `shot` trace and nothing else.
 */

/** the site page: `home`, which every row in this capture names, and two nobody touches */
const SITE: readonly BaseFrame[] = [
	{ name: "home", screen: "menu", render: KaffeHome },
	{ name: "about", screen: "menu", render: KaffeAbout },
	{ name: "hours", screen: "menu", render: KaffeHours },
];

/** the page you go and look at, which is what puts `home` off the canvas */
const APP: readonly BaseFrame[] = [
	{ name: "cart", screen: "cart" },
	{ name: "menu", screen: "menu" },
	{ name: "receipt", screen: "receipt" },
];

const SITE_ROWS = SITE.map((frame) => frame.name).sort();
const OF: Record<string, string> = { home: "site", about: "site", hours: "site" };

const SHOT_W = 120;
const picture = (shot: ShotRef, width = SHOT_W) => {
	if (shot.frame !== "home") return null;
	const scale = width / 240;
	return (
		<div style={{ width, height: Math.round(520 * scale) }}>
			<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
				<KaffeHome />
			</div>
		</div>
	);
};

export default function AgentHandRosterFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	const [here, setHere] = useState("site");
	const [railOpen, setRailOpen] = useState(true);
	const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
	const grab = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);

	// the same rows the rail is reading, asked a different question: not what
	// happened, but where the agent is and whether it is doing anything there
	const hand = handOf(script, turn);
	const page = hand === null ? null : (OF[hand.frame] ?? null);
	const column = hand === null ? -1 : SITE.findIndex((frame) => frame.name === hand.frame);
	const onPage = page !== null && page === here;
	const rung = rungOf({
		inView: column !== -1 && boxInView(column, pan),
		onPage,
		// a page's tree is expanded when you are on it, which is the shipped rail's
		// own behaviour: switching page opens the one you arrived at
		open: onPage,
		railOpen,
	});

	const hold: RailHold | null =
		hand === null || page === null || rung === "frame"
			? null
			: { hand, page, frame: rung === "row" ? hand.frame : null };

	const pages: readonly RosterPage[] = [
		{ name: "app", frames: APP.map((frame) => frame.name), active: here === "app", open: here === "app" },
		{ name: "site", frames: SITE_ROWS, active: here === "site", open: here === "site" },
	];

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<RosterChrome
				pages={pages}
				tool="hand"
				railWidth={420}
				railLabel="Agent"
				open={railOpen}
				onToggle={() => setRailOpen((was) => !was)}
				onOpenPage={(name) => {
					setPan({ x: 0, y: 0 });
					setHere(name);
				}}
				hold={hold}
				strip={rung === "strip"}
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
				{/* the canvas is draggable so the first rung down can be felt rather than
				    switched to: it is the gesture that puts a frame off the edge in the real
				    product, and what the presence does about it is this frame's argument */}
				<div
					className="absolute inset-0 cursor-grab active:cursor-grabbing"
					onPointerDown={(event) => {
						grab.current = { x: event.clientX, y: event.clientY, from: pan };
						event.currentTarget.setPointerCapture(event.pointerId);
					}}
					onPointerMove={(event) => {
						const held = grab.current;
						if (held === null) return;
						setPan({
							x: held.from.x + (event.clientX - held.x),
							y: held.from.y + (event.clientY - held.y),
						});
					}}
					onPointerUp={() => {
						grab.current = null;
					}}
					onPointerCancel={() => {
						grab.current = null;
					}}
				>
					{/* a new page is a new canvas, so the field remounts rather than panning
					    across the gap between two pages nobody travelled */}
					<div
						key={here}
						className="absolute inset-0"
						style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
					>
						<PlayField base={here === "site" ? SITE : APP} />
						{/* the presence rides inside the pan, so it stays welded to the frame
						    while the canvas moves and lets go at the moment the frame stops
						    being drawable rather than at the moment the drag ends */}
						<HandLayer
							hand={hand}
							base={SITE.map((frame) => frame.name)}
							on={rung === "frame" && here === "site"}
						/>
					</div>
				</div>
			</RosterChrome>
		</SpoolShell>
	);
}
