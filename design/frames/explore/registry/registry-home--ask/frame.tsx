import { ProjectAgent } from "shared/ui/explore/registry/registry-screen";

/** "Use in a project" opened kaffe with its agent, the frame attached. The words are the person's. */
export default function RegistryHomeAskFrame() {
	return <ProjectAgent take="home" step="ask" sendTarget="explore/registry/registry-home--copied" />;
}
