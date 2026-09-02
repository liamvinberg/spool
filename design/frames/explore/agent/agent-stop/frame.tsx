import { railEntries, useCapture, useTurnScript } from "shared/lib/explore/agent/claude-turn";
import { useTicker, useTurn } from "shared/lib/spool/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { PlayField } from "shared/ui/explore/agent/play-field";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * agent-stop — the recommendation. The way out of a turn that is already running.
 *
 * Play it, then press `stop` — or esc, which works because focus is still in the
 * composer where you left it. Whatever was in flight when you pressed stays in
 * flight forever: that is the state, and it is the first one on this page that is
 * defined by what the turn did *not* get to.
 *
 * **The turn had no exit at all until now.** #162 settled the way out of a *parked*
 * turn — a dismiss sending a bare `{behavior:"deny"}` — and that exists only
 * because the turn had already stopped by itself. `spool-agent-rail.tsx:485` has
 * held a `StopButton` since the first week under the comment *"a turn in flight
 * has to be interruptible, so stop lives where send would be"*, in a module **no
 * frame imports**; it went with the frames #144 cleared, never argued.
 *
 * **The key is esc and it costs nothing.** The ticket assumed #139 had spent it.
 * It had not: `canvas.tsx:2553` is a *ladder* of eight meanings — cancel picks,
 * kill a drag, close the menu, leave the entered frame, drop a multi-selection,
 * climb the ancestry — and #139 owns one rung of it. More to the point,
 * `canvas.tsx:2347` is `if (isTyping(event.target)) return`: the canvas ignores
 * every key while focus is in a textarea, and the composer is one. Enter sends and
 * leaves focus there, so **esc has been going nowhere at the exact moment a turn is
 * running**. Spool spends a key it was already throwing away, and the ladder out on
 * the canvas is untouched. The binary agrees with both halves of that — `press Esc
 * to stop` when it owns the terminal, `press Ctrl+C to stop` when it does not.
 *
 * **The press is not a convenience.** Click out to the canvas to watch a frame
 * repaint — which is the state this whole map is built for — and esc belongs to the
 * ladder again. The press is the only exit that works from wherever the eyes are.
 *
 * **What it sends is an `interrupt` control request**, down the stdin
 * `--input-format stream-json` #115's adapter already opens, answered with
 * `{still_queued:[…]}` — the uuids of queued messages that outlive the abort. It is
 * always empty here, because Spool's composer refuses to send while a turn runs.
 * The request's own `cancel_queued` flag documents this exact client — *"a
 * Stop-means-stop-everything client (a remote UI's Stop button) sets this true"* —
 * and there is nothing for it to cancel until Spool decides queueing is a thing it
 * does. That is a live question and not this ticket's.
 *
 * **The row it caught is neither a success nor a failure, and the wire will not tell
 * you which.** An interrupt builds its synthetic result through
 * `createSyntheticErrorMessage(id, "user_interrupted")`, which stamps
 * `toolDenialKind: "user-rejected"` — *the same value a decline at the permission
 * prompt gets* — so a rail that forks on `is_error` alone draws #142's cross and
 * says the agent's `read` failed. It did not fail and it never ran:
 * `non_execution_kind` is documented as "the harness-stamped reason an
 * is_error:true result did not carry the tool's own execution output", and absent
 * means the tool ran to completion. So there is a fifth `RowState`, and its mark is
 * a single flat stroke through the space the ring leaves — a check is two strokes
 * meeting, a cross is two crossing, and this is one that is neither.
 *
 * **What the log shows where it stopped has three shapes, and the fixture holds all
 * three.** At the instant of the interrupt, `claude-interrupt.json` has one tool
 * whose block closed and never got a result, one cut *mid-argument* — `{"file_path":
 * "/Users/designer/projects/sp` — with no `content_block_stop`, no `assistant`
 * message and no result at all, and everything before them already done. The
 * half-typed one draws as a bare verb with no subject, which is not a special case:
 * the rail already knows a tool call exists before its arguments do, and an
 * interrupt there simply leaves beat one of three.
 *
 * **Nothing is torn on disk.** The ticket supposed a turn cut mid-write leaves half
 * a frame. It does not — the interrupt is a control request, not a kill: the CLI
 * stays alive and emits a clean `result` carrying cost, usage and
 * `terminal_reason: "aborted_streaming"`. A `Write` is atomic at the tool level, so
 * no file is truncated. What *is* real is narrower and worth saying: the abort
 * signal is handed to the tools, so a `Bash` in flight is killed mid-command, and
 * the ordinary case is simply a half-done job — three frames written of five, one
 * written and not yet fixed up. Spool says nothing about it, because it has nothing
 * to say that the log does not already show.
 *
 * **The marker is not drawn.** The binary posts `[Request interrupted by user]` as
 * a synthetic `user` text block — `[Request interrupted by user for tool use]` when
 * the abort lands during the tool batch instead — and it is addressed to the model,
 * so its next turn knows why the work ends mid-sentence. #127's rule is to quote
 * the binary where it can be, and this is where it cannot: echoing it back reports
 * the developer's own press to them as news, in the voice of the person who made
 * it, wearing the 2px accent rail the rail gives the human's words. What is drawn
 * instead is Spool's own `stopped`, as a rule, because a stop is a boundary and not
 * a reply.
 *
 * **The thread carries no mark.** #161 settled that `waiting` is for a thread that
 * has stopped and needs a person; the test it used to rule #122's wind-down out is
 * exactly the test here, and a turn a person stopped fails it — nothing is waiting
 * on anybody. So the mark goes to rest, the same as a turn that finished.
 *
 * The capture is `claude-interrupt.json`, #141's, unplayed by any frame until now.
 * The window is everything before the interrupt; the aftermath is derived from where
 * the clock stopped rather than projected, which is the only way a press landing at
 * an arbitrary second leaves the same thing behind as the recording's own. Leave it
 * alone and it still ends: the capture's stop fires at 17.9s by itself.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentStopFrame() {
	const capture = useCapture("claude-interrupt");
	const script = useTurnScript(capture, "stop");
	const turn = useTurn(script.cues, undefined, script.cut ?? undefined);
	// the clock stops with the turn: a thought cut at 2.3s reads 2.3s forever rather
	// than climbing on past the thing that ended it
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
						stop="footer"
						onStop={turn.cut}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				<PlayField />
			</CanvasChrome>
		</SpoolShell>
	);
}
