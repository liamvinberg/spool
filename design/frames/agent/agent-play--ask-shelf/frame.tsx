import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--ask-shelf — the question on #117's shelf, where the plan lives. Drawn
 * to be ruled out by a rule that already exists rather than by taste.
 *
 * Play it. `Shot fix · waiting on you` takes the strip above the transcript, the
 * three labels sit under it, and the question stays down in the log where it was
 * said. It looks like the most urgent placement in the rail, which is exactly the
 * argument for it: the shelf is the one surface you cannot scroll away from, and a
 * blocked turn is the one thing you must not scroll away from.
 *
 * **#117 rules it out before taste gets a look in.** The test settled there is
 * whether a thing outlives the call that made it: a plan is written in nine seconds
 * and then worked for nine minutes across twenty-eight rows, so a log loses it; a
 * screenshot is fixed at one moment, so a log holds it. A question is over the
 * instant it is answered. It has the shortest life of anything in a turn — 84ms in
 * the capture — so it is the clearest possible *failure* of that test, and putting it
 * on the shelf would mean the test does not mean anything.
 *
 * **And the shelf is oversubscribed already.** Three tickets have claimed it: #117's
 * plan, #122's rate-limit line, #127's signed-out strip. #144 then measured the
 * chrome above the transcript down from 112px to 68 and said "the shelf holds one
 * strip and the thing that stops you wins". A question does stop you — but so does a
 * rate limit, and #122 already resolved that one into the composer footer for the
 * same reason. The shelf cannot be where everything urgent goes.
 *
 * **What it loses in the drawing is the descriptions again**, for the same reason as
 * `agent-play--ask-composer`: a horizontal strip has room for labels and not for
 * three paragraphs. So two of the three placements fail on the same fact, and the
 * fact is in the payload rather than in anybody's taste — `description` is 150 to 250
 * characters and it is where the cost of each choice is written.
 *
 * The honest thing this frame does show: the answer landing in the log as the
 * developer's own words works from any of the three placements, because it is the
 * same shape the rail already gives the human's turn. Whatever is decided about the
 * options, that part is settled.
 *
 * Same capture and same slice as `agent-play--ask-log`.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentAskShelfFrame() {
	const capture = useCapture("claude-mcp");
	const script = useTurnScript(capture, "ask");
	// held at the question, same as `agent-play--ask-log`, so the options are pressable
	// for as long as a real one would be rather than the 84ms the capture had
	const held = script.rows.find((row) => row.kind === "ask");
	const turn = useTurn(script.cues, held?.kind === "ask" ? (held.liveCue ?? undefined) : undefined);
	const elapsed = useTicker(turn.run, script.total, turn.waiting);
	const ready = script.cues.length > 0;

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
						ask="shelf"
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
						onAnswer={turn.resume}
					/>
				}
			>
				<PlayField />
			</CanvasChrome>
		</SpoolShell>
	);
}
