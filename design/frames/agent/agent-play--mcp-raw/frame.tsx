import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--mcp-raw — nothing invented, and this is what nothing-invented looks
 * like. It is also what the rail does today.
 *
 * `mcp__claude_ai_notion__notion-search`. `mcp__claude_ai_google_drive__search_files`.
 * No verb, no subject, the wire name lowercased and truncated at 420px.
 *
 * **This is not a variant, it is the current behaviour.** `label()`'s fallback is
 * `{verb: tool.toLowerCase(), subject: ""}`, so a rail that never reads
 * `tool_use_meta` produces exactly these rows — which is why this frame is the
 * baseline the other two are a diff against, and why the ticket exists.
 *
 * **The position is real: every other name is a presentation of somebody else's
 * API.** The wire name is the only string that is unambiguously true — it is what
 * was called. Both display names are copy, written by a third party, and Spool
 * putting them in its own vocabulary slots is Spool vouching for text it did not
 * write and cannot check.
 *
 * **It loses on three counts, all of them visible above.**
 *
 *   the row loses its subject. It fits at 420 — just — but `label()`'s fallback
 *   leaves the subject empty, so the whole row is verb-grey and there is no bright
 *   word in it. Every other row on this rail has one, and that word is what the eye
 *   lands on when a transcript is scrolling. Here three rows in a row read as one
 *   grey block, and the first fifteen characters of each are identical.
 *
 *   the lowercase is a lie of a different kind. `label()` lowercases to match
 *   spool's own verbs, so `Google_Drive` becomes `google_drive`: Spool has already
 *   edited the string it is claiming to quote verbatim.
 *
 *   the middle segment is not the server's name anyway. It is the *configured* name
 *   with every character outside `[A-Za-z0-9_-]` replaced by `_`, so
 *   `claude.ai Google Drive` arrives as `claude_ai_Google_Drive`. Reading a name out
 *   of it means undoing a lossy substitution, which is guessing — while the actual
 *   name sits two fields over, sent for this purpose.
 *
 * So refusing the display names does not buy fidelity, it buys a mangled version of
 * the same information in the widest possible form. What the position is right about
 * is that the wire name must exist somewhere, and in `agent-play--mcp-ask` it does:
 * behind the chevron, unmangled, exactly once.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentMcpRawFrame() {
	const capture = useCapture("claude-mcp");
	const script = useTurnScript(capture, "mcp");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
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
						entries={railEntries(script, turn, elapsed, undefined, "log", "empty")}
						phase={turn.phase}
						mcp="raw"
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
