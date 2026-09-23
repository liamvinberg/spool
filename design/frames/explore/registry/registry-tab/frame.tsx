import { RegistryHomeCard } from "shared/ui/explore/registry/registry-screen";

/** The registry is a card on Home, opened like a project. Press it. */
export default function RegistryTabFrame() {
	return <RegistryHomeCard openTarget="explore/registry/registry-tab--open" />;
}
