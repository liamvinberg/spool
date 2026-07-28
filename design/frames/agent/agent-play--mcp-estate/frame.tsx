import { connectorsOf, railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--mcp-estate — the whole estate, standing. The other answer to what a
 * broken server looks like.
 *
 * A strip on the plan's shelf: `connectors 5/15  10 need you in a terminal`, open it
 * for the list. It is there before the first keystroke and it is still there when the
 * turn lands, because a connector's status is true whether or not anybody reached for
 * it. Open it and it takes 400px off the transcript, which is what the last paragraph
 * here is about.
 *
 * **The data is real and it is free.** #141 measured `mcp_status`, a control command
 * over the stdio the adapter already opens: per server a `status`, a human-readable
 * `error` (`"Unable to connect. Is the computer able to access the url?"`), the
 * transport and the scope. No token, no HTTP call, nothing Spool authenticates as —
 * which is the same reason `get_usage` turned out to be reachable. The inventory
 * cannot come from `init`: the same binary reported fifteen servers, five and two
 * across six spawns, because connectors are fetched from the account and connected
 * lazily, so `init.mcp_servers` sometimes draws an empty estate. This capture's
 * `init` says two. Its `mcp_status` says fifteen.
 *
 * **The case for it is the case this frame is here to test.**
 * [#126](https://github.com/liamvinberg/spool/issues/126) inherited the developer's
 * MCP servers on one argument: pulling a Figma design into Spool is the difference
 * between a canvas and a toy. `agent-play--mcp-quiet` shows that promise failing in
 * total silence. A standing strip is the answer that never depends on the agent
 * reaching for a thing first — you can see, before you ask, that Figma is not going
 * to work.
 *
 * **Three things argue against it, and all three are visible above.**
 *
 *   the resting state is a complaint about the normal case. Eight of fifteen need
 *   auth and two have failed, on the maintainer's own machine, today. That is not an
 *   incident, it is what a connector list looks like when someone has clicked
 *   through an integrations page once. #122 settled that the limit line is absent
 *   until there is something to say, and #127 that Spool refuses to read another
 *   product's private state to preflight — it asks by doing. A line that is
 *   permanently at ten is neither.
 *
 *   it makes Spool an MCP manager. The list invites a reconnect button, and
 *   `mcp_reconnect` and `mcp_toggle` are both sitting in the control plane, so the
 *   next ticket after this one is a connector settings surface. Spool has no `mcp`
 *   verb and this is how it gets one.
 *
 *   it speaks a second vocabulary. `mcp_status` gives the *configured* name —
 *   `claude.ai Notion` — while `tool_use_meta` gives the display name the log prints,
 *   `Notion`. Same object, two names, in two places in the same rail, and neither is
 *   wrong.
 *
 * The shelf is also not free: #117's plan strip, #136's thread row and #127's login
 * strip all want it, which is [#144](https://github.com/liamvinberg/spool/issues/144)'s
 * whole question. A fourth claimant that is at rest 100% of the time is the weakest
 * of the four.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentMcpEstateFrame() {
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
						connectors={connectorsOf(capture)}
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
