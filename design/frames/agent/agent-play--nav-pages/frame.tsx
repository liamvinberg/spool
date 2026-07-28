import { LIVE, LIVE_ASK, useAutoAsk, useDeck } from "../../../shared/lib/agent-threads";
import { planOf, railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow, type Target } from "../../../shared/ui/spool-canvas-chrome";
import { PanelCaret } from "../../../shared/ui/spool-icons";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { ThreadStrip } from "../../../shared/ui/spool-thread-strip";

/**
 * agent-play--nav-pages — connections goes to the left rail, where the frames are.
 *
 * It plays itself, and there is nothing to switch: the right side is the agent, whole,
 * and the question #144 asks has no subject left. `menu` is selected, and its walks are
 * lit in the tree — `cart` and, faintly, `receipt` on this page, `home` on `site`, whose
 * collapsed group carries the count instead of the row.
 *
 * **Why the tree is a real candidate rather than a place to dump it.** `connections.ts`
 * groups a frame's walks *by the page they land on*, and this rail is already that
 * grouping: every frame, under its page, in page order. The list and the tree are the
 * same shape, so the tree can carry the list without inventing a surface — and #143
 * already established the idiom, lighting the *page* in this rail when a row names a
 * frame the canvas cannot show.
 *
 * It also answers the thing the canvas cannot. An arrow only exists where both ends are
 * on the page you are looking at, so a cross-page destination is undrawable out there;
 * in here `site` is just another group, one scroll away.
 *
 * **What it loses, and this is the frame's whole cost.** Of four walks, the tree can
 * hold three. `checkout` is a name nothing answers to — there is no row to light,
 * because the frame does not exist — and the unreadable walk at
 * `frames/app/menu/frame.tsx:118` has no name at all, which is precisely why
 * `connections.ts` keeps an `UnreadableRow` list: *an unresolvable walk that renders as
 * nothing is indistinguishable from a frame with no walks*. So this trades the two rows
 * that report broken work for the two rails staying simple, and a broken flow is the
 * one thing a flow tool must not hide. Any version of this that ships has to find those
 * two somewhere — a marker on the source frame's own row is the obvious place, and it is
 * not drawn here because it would be inventing the answer rather than showing the loss.
 *
 * **The right side, meanwhile, is the whole of #144 dissolved.** One 34px strip of
 * threads, one 34px plan, transcript, composer. No tab row, no icon column, no marks to
 * argue about, and the shut state is one cell with the agent's own ring in it.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
	{ name: "site", frames: ["home"] },
];

const SELECTED = "menu";

/** what `menu` walks to, as the tree can hold it: the two on this page and the one on `site` */
const TARGETS: readonly Target[] = [
	{ frame: "cart", certainty: "will" },
	{ frame: "receipt", certainty: "might" },
	{ frame: "home", certainty: "will" },
];

export default function AgentNavPagesFrame() {
	const capture = useCapture("claude-plan");
	const script = useTurnScript(capture, "session");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	useAutoAsk(ready, turn.send, LIVE_ASK);

	const deck = useDeck(railEntries(script, turn, elapsed, undefined, "lifted"), turn);
	const plan = deck.open.id === LIVE ? planOf(script, turn) : null;

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				selected={SELECTED}
				targets={TARGETS}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						nav={
							<ThreadStrip
								threads={deck.threads}
								open={deck.open.id}
								onOpen={deck.setOpen}
								after={
									<span className="flex w-7 shrink-0 items-center justify-center text-muted/60">
										<PanelCaret dir="right" className="h-3.5 w-2.5" />
									</span>
								}
							/>
						}
						entries={deck.open.entries}
						plan={plan}
						phase={deck.phase}
						run={deck.run}
						onSend={ready ? deck.send : () => {}}
						onReplay={deck.replay}
					/>
				}
			>
				<PlayField selected={[SELECTED]} />
			</CanvasChrome>
		</SpoolShell>
	);
}
