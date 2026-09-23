import { RegistryCanvas } from "shared/ui/explore/registry/registry-screen";

/** The registry tab opened from the agent log, at the frame the agent took. */
export default function RegistryNavTracedFrame() {
	return <RegistryCanvas take="nav" page="apps/slack" selected="channel" traced />;
}
