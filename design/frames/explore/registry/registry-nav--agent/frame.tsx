import { ProjectAgent } from "shared/ui/explore/registry/registry-screen";

/** The second door: the agent took the Slack example itself, and its log names it. Press the name. */
export default function RegistryNavAgentFrame() {
	return <ProjectAgent take="nav" step="copied" traceTarget="explore/registry/registry-nav--traced" />;
}
