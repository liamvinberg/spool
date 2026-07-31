import { useState } from "react";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { KaffeHome } from "../../../shared/ui/kaffe-home";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { KaffeAbout, KaffeContact } from "./site-screens";
import { COLS, FH, FW, ROW_1, WallLayer, handOf } from "./wall";

/**
 * agent-hand--wall — the frame's own wall says what the agent is doing to it.
 *
 * Type anything, press Enter, and watch `home`. Two minutes of a real session run
 * against one frame, and nothing new appears on the canvas for any of it: no
 * badge, no cursor, no chip, no dock. The rectangle already had a wall and this
 * direction spends it.
 *
 * **The decision is a line, and the line is the rectangle itself.** Everything the
 * human does is drawn *outside* a frame — the selection ring at
 * `overlays.tsx:167`, 1.5px thread at a 3px offset; the hover ring at
 * `overlays.tsx:143`, 1px neutral at the same offset; the element outline at 2px.
 * So the agent gets what is left, which is the rectangle's own edge and the space
 * just inside it. That is the whole answer to *how does a frame the agent is
 * reading not read as selected*: they are never in the same pixels and never in
 * the same ink. There is no opacity ladder to negotiate and no third colour to
 * invent, because spool has exactly one accent and it is already the human's. Boot
 * this frame and `home` is selected before a word is typed; press `about` or
 * `contact` mid-turn to pull the ring off and put it somewhere else. The two
 * vocabularies never once have to be told apart by strength.
 *
 * **Three verbs, three things a stroke can do — travel, break, double.** Not three
 * speeds of one glow, which was the trap. `logs home` sends one bright segment once
 * around the perimeter, arriving home exactly when the call resolves, so the lap
 * position is how far through the read it is: passive, finite, and over. An
 * `edit` run breaks the wall into a dashed one at full strength and ratchets it one
 * notch per write, six notches for `edit home ×6`; the whole wall drops to half
 * strength underneath while it runs, because this is the one verb that unmakes the
 * thing it touches. And `shot home` does the only thing the other two cannot: it
 * changes how many walls there are. A second hairline draws itself in 4px inside
 * the first over the length of the call, the wall flashes once at the instant the
 * call lands, and after that the frame has two walls instead of one, because after
 * that there is a picture of it that did not exist before. `look home` is the agent
 * reading that copy, so the inner line and only the inner line goes to full for the
 * two tenths of a second the read takes.
 *
 * **Presence: yes, and it is the wall existing at all.** From the first call that
 * names `home` to the moment the turn ends, the frame wears a hairline it did not
 * have before, at 30% ink, and that hairline never moves. It is not a heartbeat and
 * it is not a spinner. It says *held*, and held is the true state — this is the
 * number that decided it: the agent has a call open on `home` for **17.7 of the
 * turn's 37.7 seconds**. The other twenty, 53% of it, is thinking, prose and the
 * gap between one tool block and the next, and in every one of those seconds the
 * only thing on the canvas is the still wall. A language that had nothing to draw
 * there would be blank for more than half of what it is supposed to be narrating.
 *
 * **The picture goes stale, and that is a fact the transcript cannot hold.** A
 * write does not delete `.spool/verify/home.png`, it makes it wrong, so the inner
 * line drops to a sixth of its strength the moment a run opens and comes back when
 * a new shot lands. Drawing it turned up the thing I did not know going in: at
 * 17.3s this session runs `look home` against a picture taken at 1.9s, with a
 * six-write run in between and no `spool shot` anywhere between them. Either the
 * agent looked at a fifteen-second-old picture of a frame it had rewritten six
 * times, or spool had quietly rewritten the file and said so nowhere. The rail can
 * report neither; it has one row per call and no memory of the file. The wall has
 * both, for free, because it was already drawing the thing the file is of.
 *
 * **What it costs, honestly.**
 *
 * *The ink is not spool's, it is the frame's.* Every frame on this canvas is
 * `#FEFEFE`, so a mark drawn inside one has to be near-black or it is not a mark.
 * That is fine here and it is a correctness problem in the product: a frame with a
 * dark interior needs the inverse, which means this language has to know what
 * surface it is standing on. Blend modes get you out of it and get you a different
 * colour on every frame. This is the strongest argument against the direction and I
 * could not design it away — it is the price of being inside the rectangle, and
 * being inside the rectangle is the whole idea.
 *
 * *One of the three characters is only motion.* Break and double survive a still.
 * Travel does not — a lap with nothing moving is a complete ring, which is a held
 * wall at higher strength and nothing else. Under `prefers-reduced-motion` that is
 * exactly what it degrades to, and the honest report is that read loses its
 * character while the other two keep theirs. It is also the least-used verb here:
 * the capture holds one read against three shots, four looks and thirteen writes.
 *
 * *The budget is per stroke, not per frame.* Three of the four states want two
 * concentric hairlines at once, and 4px apart at 39% they read as two lines rather
 * than as a box inside a box. Four would not, so this language has no room to grow
 * a fourth verb without going somewhere else.
 *
 * *A dashed stroke already means something on this canvas.* `agent-walk-ambient`
 * dashes a `might` arrow to mean conditional; here a dash on a wall means being
 * cut. Different object, same texture, and worth saying out loud.
 *
 * The capture is `claude-edits.json` at the `session` slice with runs collapsed —
 * the same two minutes as `agent-play--edit-run` and `agent-play--jump-name`, and
 * every one of its twelve tool rows names `home`. What it does not hold is a `read`
 * row: the projection's verbs are `write`, `shot`, `look`, `edit ×6`, `logs`,
 * `look`, `edit ×4`, `shot`, `look`, `edit ×3`, `shot`, `look`. So `logs home`
 * carries the read character, and the opening `write home` is the edit character on
 * a run of one.
 */

/** kaffe's site page: the frame this session spends two minutes on, and its neighbours */
const SITE: readonly BaseFrame[] = [
	{ name: "home", screen: "menu", render: KaffeHome },
	{ name: "about", screen: "menu", render: KaffeAbout },
	{ name: "contact", screen: "menu", render: KaffeContact },
];

const NAMES = SITE.map((frame) => frame.name);

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"] },
	{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
	{ name: "site", frames: NAMES, active: true, open: true },
];

export default function AgentHandWallFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the human's own pick, on the canvas from the first frame of the turn. It starts
	// on `home` because that is the case this direction has to survive: one rectangle
	// wearing a selection outside it and the agent's hand inside it, at the same time
	const [selected, setSelected] = useState<string | null>("home");
	const [pointed, setPointed] = useState<string | null>(null);

	const hands = Object.fromEntries(NAMES.map((name) => [name, handOf(script, turn, name)]));

	// a click selects the frame under it, hit-tested against the field's own grid.
	// It rides on the container rather than on the frames, so nothing this direction
	// draws has to take a pointer event and the field's hover is left alone
	const pick = (event: React.MouseEvent<HTMLDivElement>) => {
		const box = event.currentTarget.getBoundingClientRect();
		const x = event.clientX - box.left;
		const y = event.clientY - box.top;
		const hit = NAMES.findIndex((_, index) => {
			const left = COLS[index] ?? 0;
			return x >= left && x <= left + FW && y >= ROW_1 && y <= ROW_1 + FH;
		});
		setSelected(hit === -1 ? null : (NAMES[hit] ?? null));
	};

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				selected={selected ?? undefined}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={railEntries(script, turn, elapsed)}
						phase={turn.phase}
						say="read"
						mcp="ask"
						ask="log"
						jump="name"
						have={NAMES}
						pointed={pointed}
						onPoint={setPointed}
						onJump={(frame) => {
							setSelected(frame);
							setPointed(null);
						}}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				<div className="absolute inset-0" onClick={pick}>
					<PlayField base={SITE} selected={selected === null ? [] : [selected]} pointed={pointed} />
					<WallLayer frames={NAMES} hands={hands} />
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}
