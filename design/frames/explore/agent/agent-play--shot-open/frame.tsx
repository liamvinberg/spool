import { railEntries, captureEvents, useFanoutScript } from "shared/lib/explore/agent/claude-turn";
import type { ShotRef } from "shared/lib/spool/turn-play";
import { useTicker, useTurn } from "shared/lib/spool/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { type BaseFrame, FrameThumb, PlayField } from "shared/ui/explore/agent/play-field";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";
import claudeFanoutCapture from "shared/captures/claude-fanout.json";

/**
 * agent-play--shot-open — the picture behind the disclosure, and a real one.
 *
 * Type anything and press Enter. The `look cart.png` row opens itself when the
 * image comes back and holds the frame the agent looked at, drawn by the same
 * component the canvas draws it with. The line rhythm survives: the row is still
 * one line, and the picture is the payload of that line the way a command or a
 * path is the payload of any other.
 *
 * This is the frame that fixes the well. Today the disclosure opens on an empty
 * box and two lines of file metadata, because the captures elide their base64
 * payloads and a prototype should not invent one. But the payload is not missing
 * in the product — a `tool_result` carries about 150 KB of PNG straight into
 * memory, so the picture is free to draw and an empty well is the one thing that
 * is definitely wrong. The frames here are React, so the honest thumbnail is the
 * component itself at 120px rather than a picture of a picture.
 *
 * `image/png` goes with the well. It is a fact about a file, and the row above it
 * already said `look`; what is worth keeping is which frame, and that is one word.
 *
 * The open question this leaves is whether it earns the click at all — the same
 * frame is on the canvas at 152px, live, and more current than the still. The
 * frame to the left makes that case by drawing nothing.
 */

const PROJECT: readonly BaseFrame[] = [
	{ name: "cart", screen: "cart" },
	{ name: "menu", screen: "menu" },
];

const TAKES = ["cart--empty", "cart--empty-b", "cart--empty-c"] as const;

/** the width the rail has left once the transcript's padding and the row's indent are off it */
const SHOT_W = 120;

const picture = (shot: ShotRef, width = SHOT_W) => (shot.frame === null ? null : <FrameThumb name={shot.frame} width={width} />);

export default function AgentShotOpenFrame() {
	const capture = captureEvents(claudeFanoutCapture);
	const script = useFanoutScript(capture);
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	const takes = TAKES.map((name) => {
		const take = script.takes.find((candidate) => candidate.name === name);
		return {
			name,
			arrived: take !== undefined && turn.at(take.arriveCue),
			painted: take?.paintCue != null && turn.at(take.paintCue),
			revision: take === undefined ? 0 : take.changeCues.filter((cue) => turn.at(cue)).length,
		};
	});

	const pages: readonly PageRow[] = [
		{
			name: "root",
			frames: [
				...PROJECT.map((frame) => frame.name),
				...takes.filter((take) => take.arrived).map((take) => take.name),
			].sort(),
			active: true,
			open: true,
		},
	];

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={pages}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={railEntries(script, turn, elapsed)}
						shot="open"
						shotView={picture}
						phase={turn.phase}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				<PlayField base={PROJECT} takes={takes} />
			</CanvasChrome>
		</SpoolShell>
	);
}
