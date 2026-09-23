import { RegistryCanvas } from "shared/ui/explore/registry/registry-screen";

/** Its canvas is the index. A study, selected: the shader collection. */
export default function RegistryTabOpenFrame() {
	return <RegistryCanvas take="tab" page="components/shaders" selected="spool-hero" handTarget="explore/registry/registry-tab--copied" />;
}
