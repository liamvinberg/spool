import { RegistryHomeNav } from "shared/ui/explore/registry/registry-screen";

/** The recommendation: Registry sits under Projects on Home and opens its own tab. Press it. */
export default function RegistryNavFrame() {
	return <RegistryHomeNav registryTarget="explore/registry/registry-nav--open" />;
}
