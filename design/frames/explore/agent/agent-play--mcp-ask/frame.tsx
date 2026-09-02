import { railEntries, useCapture, useTurnScript } from "shared/lib/explore/agent/claude-turn";
import { useTicker, useTurn } from "shared/lib/spool/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { PlayField } from "shared/ui/explore/agent/play-field";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * agent-play--mcp-ask — the recommendation. The agent left the building, and the
 * row says where it went.
 *
 * Play it. Three rows in this window went outside — `ask Notion`, `ask Google Drive`
 * twice — and the middle one carries an ✕ instead of a check. A fourth foreign row
 * is a search that came back with nothing. Between them sit `skill styling`,
 * `read tokens.css` and `read AGENTS.md`, which are spool's own and unchanged.
 *
 * **The ticket's premise was wrong, and the fixture had the answer in it.** #142
 * says Spool "cannot supply a noun for a server it has never heard of". It does not
 * have to: the binary sends one. `tool_use_meta` rides on the same `assistant`
 * event as the `tool_use` block, keyed by the call's id —
 * `{display_name, server_display_name, icon_url}`. Present on all four MCP calls in
 * `claude-mcp.json`, absent on all thirty-three that are not. Reproduced live on a
 * plain spawn with no `--permission-prompt-tool`, so it is ordinary stream output
 * rather than something the permission flow adds. Nothing here parses `mcp__`.
 *
 * **The server's name is the good one; the tool's is not.** Measured across three
 * servers: `Notion` / `Notion-Search`, `Google Drive` / `Search Files`, `Eidra
 * Artifacts` / `artifact_help`. The server name is written by whoever registered
 * the connector and reads like a product every time. The tool name is written by
 * whoever wrote the server and arrives Title-Cased, Hyphen-Cased or snake_case — so
 * a row built on it reads like a function call a third of the time. The frame to
 * the right is that row.
 *
 * **`ask` is the boundary marker, and it is the only one that always holds.** No
 * spool row uses that verb, so `ask <anything>` means the agent left the building —
 * and Spool owns the verb, so this cannot be broken by a connector author.
 *
 * The capital is a bonus rather than the mechanism, and it is not always there. A
 * claude.ai connector answers with a product name — `Notion`, `Google Drive`,
 * `Eidra Artifacts` — but a local stdio plugin answers with its package slug, so
 * that row reads `ask claude-secrets`, lowercase, with no `icon_url` at all. The
 * same server humanised its *tool* name to `Secrets List`, which is the exact
 * inverse of `Eidra Artifacts` / `artifact_help`. So neither field is reliably the
 * prettier one; they fail in opposite directions per server, and the reason the
 * server slot still wins is that which service was touched is the load-bearing
 * fact either way.
 *
 * No icon, no badge, no colour. `icon_url` is a Google favicon service, a
 * local-first canvas that fetches one per row tells a third party which connectors
 * the developer has, and half the servers do not send one.
 *
 * **`ask` because the row's job is to say the agent went outside.** The tool's own
 * name and the wire name are behind the chevron, where a path and a command already
 * live — which is #117's rule unchanged: the line is the receipt, the payload is the
 * disclosure. So the raw `mcp__claude_ai_Notion__notion-search` exists exactly once
 * in the interface, one click down, which is what the ticket asked for.
 *
 * **A refused call is an ✕, and that is not an MCP feature.** Row three is a Drive
 * search a permission rule refused; the disclosure holds the sentence the human
 * actually typed, `Skip Drive — use Notion only.` Until now an errored
 * `tool_result` drew a check — `claude-fanout.json` has held two of them, a failed
 * `Edit`, since the first fixture. Same gesture as the check, two strokes instead
 * of one, same grey. Nothing is coloured: the accent belongs to the selection, and
 * a refusal is not an alarm because nine times out of ten the developer caused it.
 *
 * **The one discovery row is the only trace a dead connector leaves.** MCP tools are
 * deferred — `init.tools` offers zero `mcp__*` entries against 58,732 tokens held
 * back — so every foreign call is a two-step: `ToolSearch`, then the tool. Those
 * searches are machinery and draw nothing, with one exception. Asked for Figma, the
 * agent searched, got `No matching deferred tools found`, and **said nothing about
 * it, anywhere in the capture** — grep all 787 events and Figma is never mentioned in
 * a word of prose. A connector nobody has signed in to offers no failing tool; it
 * offers no tool. So an empty search is the one place the estate is visible at all,
 * and it draws: `find +figma get code…` with an ✕.
 *
 * **The honest limit of that rule, measured in this same window.** An earlier search,
 * `figma design variables colors`, came back with *six* tools — `DesignSync`,
 * `EnterPlanMode`, `notion-create-database`, two Slides tools — none of them Figma's.
 * A junk answer is a full answer, so this rule cannot catch it and that row stays
 * silent. Empty is the only case the data separates; near-miss is not. The two frames
 * after next hold the other two answers to this question.
 *
 * **ACP needs no second state.** Its `ToolCall` carries `title` (human, mandatory),
 * `name` (marked UNSTABLE, optional) and `kind` — and no server identity anywhere;
 * `mcpServers` appears in the spec only on `session/new`, where the *client*
 * declares them. So an ACP row is this row with the server slot empty and the
 * title in the subject, which is #115's richest-first degrading exactly as designed.
 *
 * The capture is `claude-mcp.json`, the fifth fixture, sliced to the first reach
 * outside spool through the third foreign result — the window where a call is
 * allowed, a call is refused, and a tool is looked for that is not there.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentMcpAskFrame() {
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
						mcp="ask"
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
