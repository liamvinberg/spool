import { ProjectAgent } from "shared/ui/explore/registry/registry-screen";

/** Same tab, the agent opened with the frame attached. */
export default function RegistryRailAskFrame() {
	return <ProjectAgent take="rail" step="ask" sendTarget="explore/registry/registry-rail--copied" />;
}
