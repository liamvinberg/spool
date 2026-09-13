import { useState } from "react";
import type { AgentEngineId } from "../daemon/agent-engine";
import { AGENT_PRIMARY, AGENT_SECONDARY, AgentDialog } from "./agent-dialog";
import { ArrowRightIcon } from "./icons";
import { useSetting, useWriteSetting } from "./settings";

/** A machine-wide introduction, only when a ready spool chat is actually visible. */
export function AgentRecommendation({
	active,
	engine,
	onUseAgent,
	onClaude,
}: {
	active: boolean;
	engine: AgentEngineId | undefined;
	onUseAgent: () => void;
	onClaude: () => void;
}) {
	const seen = useSetting("agent.introductionSeen");
	const write = useWriteSetting();
	const [dismissed, setDismissed] = useState(false);
	const dismiss = () => {
		setDismissed(true);
		void write("agent.introductionSeen", true);
	};
	if (!active || engine !== "spool" || seen !== false || dismissed) return null;
	return (
		<AgentDialog title="agent recommendation" onClose={dismiss}>
			{(id) => (
				<div className="px-8 pt-9 pb-7">
					<h2 id={id} className="font-medium text-[26px] leading-[33px] tracking-[-0.025em]">
						Use your usual agent.
					</h2>
					<p className="mt-4 text-muted type-body">
						We recommend your usual app for its web search and connected tools. The spool agent edits files and
						runs commands, but has no built-in web search.
					</p>
					<div className="mt-6 flex flex-wrap gap-2">
						<button
							type="button"
							className={AGENT_PRIMARY}
							onClick={() => {
								dismiss();
								onUseAgent();
							}}
						>
							Use my agent <ArrowRightIcon className="h-4 w-4 shrink-0" />
						</button>
						<button type="button" className={AGENT_SECONDARY} onClick={dismiss}>
							Continue in spool
						</button>
					</div>
					<p className="mt-6 text-muted type-label">
						Claude Code in spool includes web search.{" "}
						<button
							type="button"
							className="rounded-sm text-text underline decoration-border-raised underline-offset-4 hover:decoration-muted"
							onClick={() => {
								dismiss();
								onClaude();
							}}
						>
							Use Claude Code here
						</button>
					</p>
				</div>
			)}
		</AgentDialog>
	);
}
