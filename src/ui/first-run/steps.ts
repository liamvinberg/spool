import type { AgentEngineId } from "../../daemon/agent-engine";
import type { MachineAgent } from "../../daemon/agent-setup";

/**
 * The first run's steps (spool#250), as data: which step follows which, what return does
 * on an agent's row, and what the step says, so the window only draws them.
 *
 * open: the ripple, then Welcome under the mark. agents: Claude Code, Codex and pi, each
 * installed and signed in from the row. pi: pi's own page, a plan or a key. cloud: Try
 * Spool Cloud, which can always be passed by. After it the window grows into spool's.
 */
export type Step = "open" | "agents" | "pi" | "cloud";

/** The dots at the foot: pi's page is the agents' step still. */
export const DOTS = ["open", "agents", "cloud"] as const;

export function dotOf(step: Step): number {
	return DOTS.indexOf(step === "pi" ? "agents" : step);
}

/** Where esc goes from a step; null where esc is Not now or does nothing. */
export function backFrom(step: Step): Step | null {
	if (step === "pi") return "agents";
	if (step === "agents") return "open";
	return null;
}

export const AGENT_ROWS: readonly AgentEngineId[] = ["claude", "codex", "pi"];

export const AGENT_COPY: Record<AgentEngineId, { name: string; plan: string }> = {
	claude: { name: "Claude Code", plan: "For a Claude Pro or Max plan" },
	codex: { name: "Codex", plan: "For a ChatGPT plan" },
	pi: { name: "Other providers, through pi", plan: "ChatGPT, GitHub Copilot, or an API key" },
};

const SHORT: Record<AgentEngineId, string> = { claude: "Claude Code", codex: "Codex", pi: "pi" };

/** What return does on an agent's row, as the foot's primary button says it. */
export type RowAction =
	| { readonly kind: "install" | "sign-in"; readonly label: string; readonly can: boolean }
	/** something runs for it: the button waits */
	| { readonly kind: "wait"; readonly label: string }
	/** spool can't run it from here: the row shows the line, and return copies it */
	| { readonly kind: "copy"; readonly label: string; readonly line: string }
	/** pi, installed: its own page, for a plan or a key */
	| { readonly kind: "pi"; readonly label: string };

/** An agent spool can start a thread on now. */
export const isReady = (agent: MachineAgent): boolean => agent.installed && !agent.outdated && agent.signedIn;

/** An install runs somewhere: no second one starts beside it. */
export const installing = (agents: readonly MachineAgent[]): boolean =>
	agents.some((agent) => agent.job?.kind === "install" && agent.job.state === "running");

/** What return does on this row; null once the agent is ready, where return goes on. */
export function rowAction(agent: MachineAgent, agents: readonly MachineAgent[]): RowAction | null {
	const name = SHORT[agent.id];
	if (agent.job?.state === "running")
		return agent.job.kind === "install"
			? { kind: "wait", label: `Installing ${name}` }
			: { kind: "wait", label: "Waiting for the browser" };
	if (!agent.installed || agent.outdated)
		return agent.install.unattended
			? {
					kind: "install",
					label: `${agent.outdated ? "Update" : "Install"} ${name}`,
					can: !installing(agents),
				}
			: { kind: "copy", label: "Copy the install line", line: agent.install.line };
	if (agent.signedIn) return null;
	if (agent.id === "pi") return { kind: "pi", label: "Choose a provider" };
	return agent.signIn.unattended
		? { kind: "sign-in", label: `Sign in to ${name}`, can: true }
		: { kind: "copy", label: "Copy the sign-in line", line: agent.signIn.line };
}

/** What the agents step says above its rows. */
export function agentsHeadline(
	agents: readonly MachineAgent[],
	/** the agents already ready when the step first read them: spool found them, it didn't set them up */
	found: readonly AgentEngineId[],
): { title: string; body: string } {
	const ready = agents.filter(isReady);
	if (ready.length === 0)
		return {
			title: "Connect your agent.",
			body: "spool works with the AI plan you already pay for. Pick yours and spool sets it up.",
		};
	if (ready.length >= 2 && ready.every((agent) => found.includes(agent.id))) {
		const names = ready.map((agent) => SHORT[agent.id]);
		return {
			title: "Your agents are already here.",
			body: `spool found ${names.slice(0, -1).join(", ")} and ${names.at(-1)} on this computer, signed in.`,
		};
	}
	const first = ready[0] as MachineAgent;
	return { title: `${SHORT[first.id]} is ready.`, body: "Add another if you use more than one, or go on." };
}

/** The agents step's own primary when the selected row has nothing left to do. */
export function agentsContinue(agents: readonly MachineAgent[]): { label: string; can: boolean } {
	const first = agents.find(isReady);
	return { label: first ? `Continue with ${SHORT[first.id]}` : "Continue", can: !installing(agents) };
}

/** Spool Cloud's offer, said once here rather than in every place that draws it. */
export const CLOUD_OFFER = {
	facts: [
		"Team projects that sync in about a second",
		"Teammates on the canvas by name",
		"Comments, and shares with named people",
		"Viewers join free in a browser",
		"90 days of history",
	],
	terms: "$20 a seat a month, $16 yearly. 14 days free for up to 10 editors, no card.",
} as const;
