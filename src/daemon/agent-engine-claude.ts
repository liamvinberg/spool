import { sessionExists } from "./agent-claude-session";
import type { AgentEngine } from "./agent-engine";
import type { AgentExecutor } from "./agent-exec";
import { askAgentOffer, askFrom } from "./agent-offer";
import { agentInstalled, askAgentLogin, type Look } from "./agent-preflight";
import { agentPromptContent } from "./agent-spawn";
import { startAgentTurn } from "./agent-turn";

/** Claude keeps its process per turn, user settings, authentication and translator. */
export function createClaudeEngine(executor: AgentExecutor, look?: Look): AgentEngine {
	return {
		id: "claude",
		authentication: { kind: "external", command: "claude auth login" },
		installed: () => agentInstalled(process.env, look),
		account: (root, signal) =>
			askAgentLogin({ executor, root, env: process.env, ...(signal === undefined ? {} : { signal }) }),
		offer: ({ session: _session, ...options }) => askAgentOffer({ executor, env: process.env, ...options }),
		choice: askFrom,
		continuable: (root, session) => sessionExists(root, session.id, process.env),
		start: ({ root, session, said, ask, permissions }) =>
			startAgentTurn({
				executor,
				root,
				session: { id: session.id, resume: sessionExists(root, session.id, process.env) },
				content: agentPromptContent(said),
				ask,
				permissions,
			}),
	};
}
