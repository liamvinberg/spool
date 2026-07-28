import { useState } from "react";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { KaffeHome } from "../../../shared/ui/kaffe-home";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--jump-row — the whole row is the door, and the chevron keeps the path.
 *
 * Same capture, same landing, one thing moved: the row's click goes to the frame
 * and the disclosure is evicted to the chevron, which becomes a target of its own.
 * The frame to the left keeps the click on the disclosure and hangs the jump off
 * the name.
 *
 * **What this wins.** The valuable act gets the big target. Going to the frame is
 * two hundred pixels wide here and forty over there, and what it displaces is one
 * line holding a path — the least valuable thing in the rail, and the only thing
 * [#120](https://github.com/liamvinberg/spool/issues/120) found behind a
 * disclosure at all (`turn-play.ts:181` is one line: a path, a command). A
 * dedicated chevron is also how a disclosure normally works, so nothing is lost
 * that was not being asked to do two jobs.
 *
 * **What it costs, and it is the whole argument.** Two rows that look identical
 * now do different things. `edit home ×6` goes somewhere; `read pnpm-lock.yaml`
 * opens a path. Same height, same mark, same mono, same hover — and whether the
 * click travels depends on whether the subject happens to be a frame, which is a
 * fact about the string rather than about anything you can see. The frame to the
 * left never has that problem: the row's click is the disclosure on every row in
 * the log, and only the marked word is a place.
 *
 * The second cost is smaller and real: hover is now the row's, so the row lights
 * under the cursor at the same moment the frame does, and a log you are reading
 * with the mouse in it lights a row at a time.
 */

const APP: readonly BaseFrame[] = [
	{ name: "cart", screen: "cart" },
	{ name: "menu", screen: "menu" },
	{ name: "receipt", screen: "receipt" },
];

const SITE: readonly BaseFrame[] = [{ name: "home", screen: "menu", render: KaffeHome }];

const OF: Record<string, string> = { cart: "app", menu: "app", receipt: "app", home: "site" };

export default function AgentPlayJumpRowFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	const [here, setHere] = useState("app");
	const [landed, setLanded] = useState<string | null>(null);
	const [pointed, setPointed] = useState<string | null>(null);

	const litPage = pointed === null ? null : (OF[pointed] ?? null);
	const pages: readonly PageRow[] = [
		{ name: "app", frames: APP.map((frame) => frame.name), active: here === "app", open: true },
		{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
		{
			name: "site",
			frames: SITE.map((frame) => frame.name),
			active: here === "site",
			open: here === "site",
			lit: litPage === "site",
		},
	];

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={pages}
				selected={landed ?? undefined}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={railEntries(script, turn, elapsed)}
						phase={turn.phase}
						jump="row"
						have={[...APP, ...SITE].map((frame) => frame.name)}
						pointed={pointed}
						onPoint={setPointed}
						onJump={(frame) => {
							setHere(OF[frame] ?? here);
							setLanded(frame);
							setPointed(null);
						}}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				<PlayField
					key={here}
					base={here === "site" ? SITE : APP}
					selected={landed === null ? [] : [landed]}
					pointed={pointed}
					center={landed}
				/>
			</CanvasChrome>
		</SpoolShell>
	);
}
