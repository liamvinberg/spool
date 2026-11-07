import { sessionExists } from "./agent-claude-session";
import { agentEnv } from "./agent-cli";
import { mountDesigner } from "./agent-designer";
import type { AgentEngine, EngineDeps } from "./agent-engine";
import { askOnce, namingPrompt } from "./agent-naming";
import { askAgentOffer, askFrom } from "./agent-offer";
import { agentInstalled, askAgentLogin } from "./agent-preflight";
import { AGENT_COMMAND, agentPromptContent } from "./agent-spawn";
import { startAgentTurn } from "./agent-turn";

/**
 * Claude keeps its process per turn, user settings, authentication and translator.
 * Every turn mounts spool's designer from spool's state (#367).
 */
export function createClaudeEngine({ executor, spoolDir, look }: EngineDeps): AgentEngine {
	return {
		id: "claude",
		installed: () => agentInstalled(process.env, AGENT_COMMAND, look),
		account: (root, signal) =>
			askAgentLogin({ executor, root, env: process.env, ...(signal === undefined ? {} : { signal }) }),
		offer: ({ session: _session, ...options }) => askAgentOffer({ executor, env: process.env, ...options }),
		choice: askFrom,
		continuable: (root, session) => sessionExists(root, session.id, process.env),
		// the quickest model the account has, whatever the thread runs on: a name is one line
		name: (root, brief, _ask, signal) =>
			askOnce(
				executor,
				{
					command: AGENT_COMMAND,
					args: [
						"-p",
						"--model",
						"haiku",
						"--no-session-persistence",
						"--tools",
						"",
						"--strict-mcp-config",
						"--output-format",
						"text",
						namingPrompt(brief),
					],
					cwd: root,
					env: { ...process.env },
				},
				signal,
			),
		start: ({ root, session, said, ask, permissions, recovery }) =>
			startAgentTurn({
				executor,
				root,
				session: { id: session.id, resume: sessionExists(root, session.id, process.env) },
				content: agentPromptContent(
					recovery === "claude-continue"
						? [
								{
									prompt:
										"Continue the pending request from the completed tool results. Do not repeat completed actions.",
									selection: "",
								},
							]
						: said,
				),
				continuing: recovery === "claude-continue",
				ask,
				permissions,
				designer: mountDesigner(spoolDir, "claude", ask.effort),
				env: agentEnv(spoolDir),
			}),
	};
}
