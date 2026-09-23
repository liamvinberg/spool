import { RegistryCanvas } from "shared/ui/explore/registry/registry-screen";

/** The registry tab: a read-only canvas. No handoff button; you name the frame to your agent. */
export default function RegistryNavOpenFrame() {
	return <RegistryCanvas take="nav" page="apps/slack" selected="channel" />;
}
