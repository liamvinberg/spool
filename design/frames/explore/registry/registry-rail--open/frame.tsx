import { RegistryCanvas } from "shared/ui/explore/registry/registry-screen";

/** Open inside kaffe's tab, marked read-only, the agent one press away. */
export default function RegistryRailOpenFrame() {
	return <RegistryCanvas take="rail" page="apps/slack" selected="channel" handTarget="explore/registry/registry-rail--ask" />;
}
