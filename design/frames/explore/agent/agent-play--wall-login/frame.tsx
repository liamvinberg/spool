import { useLogin } from "shared/lib/explore/agent/agent-preflight";
import { railEntries, captureEvents, useTurnScript } from "shared/lib/explore/agent/claude-turn";
import { useTicker, useTurn } from "shared/lib/spool/turn-play";
import { LoginStrip } from "shared/ui/explore/agent/agent-wall";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { PlayField } from "shared/ui/explore/agent/play-field";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";
import claudeTurnCapture from "shared/captures/claude-turn.json";

/**
 * agent-play--wall-login — signed out, found out the only honest way.
 *
 * Play it. Type something and press Enter. Your words land in the log the instant
 * you send them, and a second and a half later the reason nothing happened lands
 * under them. Press `check again`, and the prompt you already wrote is the one
 * that runs.
 *
 * **The composer is live, and that is the decision.** Spool could know this
 * before you typed: `~/.claude.json` carries an `oauthAccount` and
 * `~/.claude/.credentials.json` sits next to it at 0600. Reading either one is
 * Spool parsing a private file format it does not own, guessing at another
 * product's internals, and breaking the week they change. So Spool does not look.
 * It asks, by doing the thing it was going to do anyway — which is why this is not
 * a wall like `--wall-install`. There, the missing command is a fact about the
 * machine and Spool checks it for free. Here, the only instrument is the spawn.
 *
 * **So the beat before the refusal is load-bearing.** 1569 ms is the measured
 * median `ttft_ms` across the parent capture, and the refusal arrives when the
 * first token would have, for the same reason #122's did: a composer that refused
 * instantly would be Spool answering on the agent's behalf, and it would answer
 * wrong the first morning somebody signs in without telling it.
 *
 * **The prompt is held, and that is the second decision.** They wrote a sentence,
 * pressed Enter, and the machine said not yet. Throwing it away so they can retype
 * it to prove they meant it is the kind of small insult software does constantly.
 * It is already in the log in their voice; the check sends it. Which is also why
 * the turn does not draw its own copy of the prompt on that one run — one thing
 * was said once.
 *
 * **Where each part sits is #117's test, applied again.** Being signed out
 * outlives the send that revealed it and stays true until it stops, so it is a
 * strip under the tabs — the plan's shelf, which is free, because a plan belongs
 * to a turn that is running and this exists precisely because none can. The
 * bounce itself happened at one moment, so it reads in the log, where the eye
 * already is when the question is *why did nothing come back*.
 *
 * **The words are the binary's own.** `Not logged in` is a verbatim string in the
 * installed 2.1.220, alongside `Please run /login`, `Invalid API key` and `No
 * authentication available`. Spool quotes the first and cannot quote the second:
 * `/login` is a slash command inside the interactive TUI, and Spool spawns `-p`,
 * where there is no session to type it into. Naming the terminal is the whole of
 * Spool's addition to the sentence.
 *
 * The strip's second half is the only place on this page the map's *keys: none,
 * ever* is said out loud, and this is the moment to say it: someone staring at a
 * signed-out agent is exactly the person about to go looking for somewhere to
 * paste a key.
 *
 * **What the check answers with is a who.** The preflight comes back carrying an
 * account — `oauthAccount` holds `emailAddress`, `displayName` and
 * `organizationName` — so the success is a name rather than a screen quietly
 * changing. It is also the honest form of the API-key state this ticket cut:
 * Spool does not judge the login, it names it, once, as it starts using it.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlayWallLoginFrame() {
	const capture = captureEvents(claudeTurnCapture);
	const script = useTurnScript(capture, "plan");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	const login = useLogin(turn.send, turn.run);

	// the log already holds the prompt this run is for, so the turn keeps its rows
	// and gives up its copy of the sentence
	const rows = railEntries(script, turn, elapsed).filter((entry) => !(login.carried && entry.key === "user"));

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={[...login.notes, ...rows]}
						phase={turn.phase}
						header={
							login.state === "ready" ? null : (
								<LoginStrip checking={login.checking} onCheck={login.check} />
							)
						}
						run={turn.run}
						onSend={
							ready
								? (text) => {
										if (login.say(text)) return;
										turn.send(text);
									}
								: () => {}
						}
						onReplay={turn.replay}
					/>
				}
			>
				<PlayField />
			</CanvasChrome>
		</SpoolShell>
	);
}
