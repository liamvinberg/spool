import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { KaffeHome } from "../../../shared/ui/kaffe-home";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { HandLayer, handOf } from "./hand";
import { KaffeAbout, KaffeHours } from "./site-frames";

/**
 * agent-hand--presence — the agent is a participant on the canvas, and the three
 * verbs are three states of it.
 *
 * Type anything, press Enter, and watch `home` rather than the rail. The agent
 * takes hold of its left wall the moment the first call names it, holds it for the
 * whole turn, and lets go when the turn lands. Nothing else arrives, and nothing
 * else leaves: everything you see between those two moments is one object changing.
 *
 * **The object is a head and a grip.** The head is the participant — a seven pixel
 * square welded to the wall, which never changes for as long as the agent is at
 * this frame, because being *at* a frame is not a state with degrees. The grip is
 * what it has hold of: the wall's whole height while the agent is taking the frame
 * in, a short segment while it is changing it, and nothing at all for the beat it
 * is photographing it, because that is the one call whose subject is the whole
 * frame and the one state where the grip leaves the wall and runs around the box.
 * So a verb is never a second mark beside the presence. It is the presence's own
 * posture, and you can watch one become the next.
 *
 * **Two channels, and keeping them apart is the whole drawing.** Length is the kind
 * of hold and it survives the gaps, because pausing is not letting go. Ink is
 * whether a call is open right now. Reading `logs` and finishing `logs` are the
 * same object at two strengths; reading and writing are the same object at two
 * lengths; shooting is the same ink off the wall. Nothing changes colour, because
 * the accent is the selection's, and the presence has no claim on it.
 *
 * **More than half of this turn is the state the transcript has no row for.**
 * Twelve calls on `home` across 37.6 seconds, and 19.9 of those seconds — 53% —
 * have no call open at all. Eleven gaps, the longest 3.9s, the shortest 741ms. The
 * rail draws that stretch as a thinking line and then as nothing, and neither says
 * the thing a person watching the canvas actually wants to know, which is whether
 * the agent has finished with this frame or is coming back to it. That is what a
 * presence object is *for*, and it is why this direction inverts the other four: if
 * the mark is an event, the majority state is no mark.
 *
 * **The verbs are five, not three.** `session` + `run` on `claude-edits` projects
 * `write`, `shot`, `look`, `logs` and `edit` — twenty-one rows, every one of them
 * naming `home`, and `read` is not among them. A direction that draws three verbs
 * has to say what it does with the other two, and this one does not have to: three
 * postures absorbed five verbs, and `read`, which this window happens not to
 * contain, lands in the one it already belongs to with nothing new drawn.
 *
 * **Nothing here spins.** Every movement on this canvas is an event — a call
 * opening, a call landing, one of the six writes inside a run flicking the segment
 * — so the object has no idle animation and needs none. Twelve calls in thirty-
 * seven seconds is plenty of movement, and a canvas of five frames with a spinner
 * on one of them is a canvas with an alarm on it. The rail keeps the turning ring,
 * where the question is a thread you cannot see; out here you can see it.
 *
 * **There is no travel, and the code is where that is said.** The presence is keyed
 * on the frame it is at, so it cannot move between two frames: it lets go here and
 * takes hold there, both at once, which is what the wire says — one call ends and
 * the next begins. A token sliding across the canvas would be the fake cursor with
 * a different head on it, and it would only be drawable when both frames happened
 * to be on screen, on the same page, at a zoom where the path fits. That makes the
 * object's grammar a property of where the camera is pointing. Take-hold and let-go
 * are the same two beats whether the next frame is next door, off-screen, or on
 * another page, and this capture contains one of each: the take at 117ms and the
 * let-go at 37.7s.
 *
 * **The dock side is forced by 44 pixels.** `agent-walk-ambient` found that the
 * side is a property of the frame's situation, and this arrangement says it in
 * numbers: three 152px frames at 114, 310 and 506 in a 772px viewport leave 114 of
 * open field at each end of the row and 44 between neighbours. `edit ×6` is 54px of
 * mono with its padding and wants 64 with its stand-off, so the outer walls can
 * hold the word and the inner ones cannot. A frame with neighbours on both sides
 * keeps the head and the grip and loses the chip, which is the law the covers and
 * the walk tags already obey: where words stop being worth their ink, the words go
 * and the stub stays.
 *
 * **It carries no name, and that is arithmetic rather than restraint.** A name tag
 * is multiplayer's answer to *which of you is this*, and there is one agent. The
 * head is where a name would dock if a delegate ever made the question real —
 * `claude-turn.ts:649` already draws one as a row, and #143's rule says that for a
 * delegate the place is the canvas — but spending the slot now would be printing a
 * word to answer a question nobody has asked yet.
 *
 * **The costs.** Five of the twelve calls are under 320ms, so the word in the chip
 * changes faster than it can be read; the ink is instant and the word is given
 * 300ms to leave, which is a fade covering for a rhythm the object cannot fix. The
 * layer is a sibling of `PlayField` drawing in the field's own copied coordinates,
 * because the field has no slot for another layer — which holds only while the
 * camera is still, so this frame can never centre on a frame the way
 * `agent-play--jump-name` does. And the honest structural cost: the verb still
 * arrives as a word. The posture says which of the three kinds is happening and the
 * word says which call, so if you took the chip away, `look` and `logs` would be
 * one picture. This direction is a presence object with a receipt on it, and the
 * receipt is the part the rail already owns.
 *
 * Under `prefers-reduced-motion` the turn is a jump cut to settled, so there is
 * never anybody at the frame and the object is never drawn at all. That is right
 * rather than a degrade: presence is a live state, and stillness is the state where
 * the work is already over. Its own transitions are cuts if a turn ever runs.
 */

/** the site page: `home`, which every row in this capture names, and two nobody touches */
const SITE: readonly BaseFrame[] = [
	{ name: "home", screen: "menu", render: KaffeHome },
	{ name: "about", screen: "menu", render: KaffeAbout },
	{ name: "hours", screen: "menu", render: KaffeHours },
];

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"] },
	{ name: "site", frames: SITE.map((frame) => frame.name).sort(), active: true, open: true },
];

/**
 * The picture behind a `look` row, drawn by the same component the canvas draws
 * `home` with. A spool screenshot is of a frame spool can still render, so the
 * thumbnail is the frame rather than a stand-in for it.
 */
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

export default function AgentHandPresenceFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked a different question: not what
	// happened, but where the agent is and whether it is doing anything there
	const hand = handOf(script, turn);

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
				<PlayField base={SITE} />
				<HandLayer hand={hand} base={SITE.map((frame) => frame.name)} />
			</CanvasChrome>
		</SpoolShell>
	);
}
