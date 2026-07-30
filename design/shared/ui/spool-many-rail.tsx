import type { ReactNode } from "react";
import { useQueue } from "../lib/agent-queue";
import type { PlayEntry, Plan, ShotRef, TurnPhase } from "../lib/turn-play";
import { PlayRail } from "./spool-play-rail";

/**
 * The rail as decided, so five takes can argue about threads without re-arguing it.
 *
 * `agent-chat` compiled twenty-seven tickets into one set of props and found that most
 * frames on this page still draw the losers their own tickets rejected — sixty-three of
 * them, because a switch nobody passes keeps the value the rail had before the ticket
 * that argued it. Every `agent-many--*` frame goes through here, so none of them can
 * repeat that: the switches are passed at their decided values, unconditionally, and a
 * take may change what sits *around* the rail and nothing inside it.
 *
 * The queue lives here because it is widget state and every take needs it identical
 * (#176). Everything a take does have an opinion about — what stands above the
 * transcript, what stands beside it, what is out on the canvas — is a prop.
 */

export function ManyRail({
	entries,
	phase,
	run,
	nav,
	header,
	plan = null,
	model,
	have,
	shotView,
	onSend,
	onReplay,
	onStop,
}: {
	entries: readonly PlayEntry[];
	phase: TurnPhase;
	run: number;
	/** the one row above the transcript; `"outside"` draws nothing at all */
	nav?: ReactNode | "outside" | undefined;
	header?: ReactNode | undefined;
	/** the plan on the shelf (#117), which is the other thing wanting the room above the log */
	plan?: Plan | null | undefined;
	model?: ReactNode | undefined;
	have?: readonly string[] | undefined;
	shotView?: ((shot: ShotRef, width?: number) => ReactNode) | undefined;
	onSend: (text: string) => void;
	onReplay: () => void;
	onStop: () => void;
}) {
	const held = useQueue([], phase);
	return (
		<PlayRail
			entries={[...entries, ...held.fired]}
			phase={phase}
			run={run}
			nav={nav}
			header={header}
			plan={plan}
			say="read"
			shot="open"
			shotView={shotView}
			mcp="ask"
			ask="log"
			jump="name"
			stop="footer"
			queue="box"
			have={have}
			model={model}
			queued={held.queued}
			onQueue={held.queue}
			onUnqueue={held.unqueue}
			draft={held.draft}
			onDraft={held.setDraft}
			onStop={onStop}
			onSend={onSend}
			onReplay={onReplay}
		/>
	);
}
