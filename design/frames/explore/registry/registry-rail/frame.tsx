import { ProjectWithRegistryRow } from "shared/ui/explore/registry/registry-screen";

/** The registry is a row at the foot of every project's pages. Press it. */
export default function RegistryRailFrame() {
	return <ProjectWithRegistryRow openTarget="explore/registry/registry-rail--open" />;
}
