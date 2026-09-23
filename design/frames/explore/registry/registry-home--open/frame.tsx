import { RegistryCanvas } from "shared/ui/explore/registry/registry-screen";

/** The registry in its own read-only tab, on the slack collection. */
export default function RegistryHomeOpenFrame() {
	return <RegistryCanvas take="home" page="apps/slack" selected="channel" handTarget="explore/registry/registry-home--ask" />;
}
