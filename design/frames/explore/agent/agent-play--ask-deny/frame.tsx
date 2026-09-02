import { railEntries, useCapture, useTurnScript } from "shared/lib/claude-turn";
import { useTicker, useTurn } from "shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool-canvas-chrome";
import { PlayField } from "shared/ui/spool-play-field";
import { PlayRail } from "shared/ui/spool-play-rail";
import { SpoolShell } from "shared/ui/spool-shell";

/**
 * agent-play--ask-deny — #162's third exit, drawn at last.
 *
 * `agent-play--ask-log` with the dismiss on it. Play it, let the question arrive,
 * and there are now three ways out instead of two: press an option, type anything,
 * or dismiss. Press `dismiss` and the block collapses to one line and the turn ends.
 *
 * **#162 settled this in words and never drew it**, which is why it is here. #165
 * asked for the dismiss and the stop on one frame, on the grounds that two ways out
 * of a turn sitting near each other are the thing a person could confuse. **They are
 * not near each other and cannot co-occur**, so the frame #165 asked for does not
 * exist and this pair replaces it. In the rail it is one line — `cutting` is
 * `phase === "playing" && !waiting` — because a turn is either streaming, and takes
 * a stop, or parked on a question, and takes a dismiss. The stop lives in the
 * composer footer and the dismiss lives on the question block in the log, so they
 * are not even in the same half of the rail. There was also never a capture that
 * could hold both: `claude-interrupt.json` contains no question.
 *
 * **The dismiss is not a fourth option and must not read as one.** An option is an
 * answer; this is the refusal of the whole question, and the two go opposite
 * directions on the wire. So the options keep their full-width bordered rows and the
 * dismiss is one quiet mono word underneath, in the register the composer uses for
 * `enter to send`.
 *
 * **It shares #165's mark, and the binary is the reason.** A dismissed question
 * resolves as `stopped` rather than `failed`, because a deny means the tool never
 * ran — `cancelAndAbort` lands a main thread on `The user doesn't want to proceed
 * with this tool use … STOP what you are doing and wait for the user to tell you how
 * to proceed` — and that is the identical `toolDenialKind: "user-rejected"` stamp an
 * interrupt leaves on the call it caught. Two different acts, one true statement
 * about the tool: a person stopped it before it did anything. `nobody answered` sits
 * one state away and keeps `failed`'s cross on purpose, because it is this one's
 * opposite: the empty answer is the case where the agent carries on and picks for
 * you.
 *
 * **What the agent says after being told to stop is not drawn, because nothing has
 * ever measured it.** The capture had no client attached, so no deny was ever sent
 * down it — every window in this repo is a session where the question went
 * unanswered and the agent chose for itself. The turn therefore ends on the dismiss
 * here rather than inventing a reply to it, and that is a gap in the evidence rather
 * than a claim about the product.
 *
 * **One loose end, left loose on purpose.** The dismiss carries no key. #165 gave
 * esc to a turn that is *running*, and a parked one is not that — so today esc does
 * nothing on a question. Whether it should is #162's to reopen; inventing a binding
 * inside a frame that exists to draw #162's decision would be the frame deciding
 * something the ticket did not.
 *
 * The capture is `claude-mcp.json`, #145's `ask` slice, held at the cue where the
 * options finish arriving.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentAskDenyFrame() {
	const capture = useCapture("claude-mcp");
	const script = useTurnScript(capture, "ask");
	const held = script.rows.find((row) => row.kind === "ask");
	const turn = useTurn(script.cues, held?.kind === "ask" ? (held.liveCue ?? undefined) : undefined);
	const elapsed = useTicker(turn.run, script.total, turn.waiting || turn.phase === "stopped");
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
						ask="log"
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
						onAnswer={turn.resume}
						// a deny ends the turn: the agent is told to stop and wait, so nothing
						// further arrives and the parked clock is never released
						onDeny={turn.cut}
					/>
				}
			>
				<PlayField />
			</CanvasChrome>
		</SpoolShell>
	);
}
