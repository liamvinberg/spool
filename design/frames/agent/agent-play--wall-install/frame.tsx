import { useLook } from "shared/lib/agent-preflight";
import { InstallWall } from "shared/ui/spool-agent-wall";
import { CanvasChrome, type PageRow } from "shared/ui/spool-canvas-chrome";
import { PlayField } from "shared/ui/spool-play-field";
import { SpoolShell } from "shared/ui/spool-shell";

/**
 * agent-play--wall-install — the first-run wall, and the only state on this page
 * Spool is allowed to know before anyone types.
 *
 * #115 settled that Spool spawns the developer's own installed binary rather than
 * shipping one. The cost of that, paid here, is that a machine with no `claude` on
 * it has an agent tab with nothing behind it — and that is a state, not an error.
 * Nobody has done anything wrong. They have not installed something yet.
 *
 * **This is the one of the two states that is a wall, and the split is the
 * ticket's real answer.** Whether a command exists on PATH is a fact about this
 * machine; the check is a `which`, it costs nothing, and it is stable. Whether
 * that command is signed in is a fact inside another product, and the only
 * honest way to ask is to spawn it — so that one is not knowable up front and is
 * drawn in `--wall-login` as a strip over a working log. Spool checks what is its
 * business to check and lets the agent speak for its own login.
 *
 * Three things are deliberate:
 *
 *   the composer stays        and it is dead. Take it away and the tab is a
 *                             sentence with no evidence of what the tab is for;
 *                             leave it live and it collects a prompt for nobody.
 *                             Dimmed at its resting height, it is the picture of
 *                             the good state, which is the one thing a wall owes
 *                             you past the bad news.
 *   the check can fail        forever, and it says so. Installing an agent takes
 *                             minutes, so pressing this twice is the normal case,
 *                             and a second press that leaves no mark reads as a
 *                             broken button. It leaves one quiet line.
 *   no colour                 the accent means a chip and a box on the canvas are
 *                             one object. Spending it here would break the only
 *                             thing it says, for a state that is not even a
 *                             failure.
 *
 * The words are not Spool's invention where they do not have to be. `code.claude
 * .com/docs` is the docs root the installed binary links itself. What Spool
 * writes is the sentence about *why* there is nothing here, because that sentence
 * is about Spool.
 *
 * **What is not on screen is the decision this ticket cut.** The preflight
 * `BuilderIO/agent-native` runs can tell a subscription login from an API-key one,
 * and the map's bar reads *keys: none, ever*. That bar is a promise about what
 * Spool asks for and stores; a developer whose own CLI is configured with a key
 * breaks none of it. So there is no third wall and no warning. It is their login.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlayWallInstallFrame() {
	const look = useLook();

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={<InstallWall checking={look.checking} looked={look.looked} onLook={look.look} />}
			>
				<PlayField />
			</CanvasChrome>
		</SpoolShell>
	);
}
