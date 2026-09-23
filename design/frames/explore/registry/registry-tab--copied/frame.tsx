import { RegistryCanvas } from "shared/ui/explore/registry/registry-screen";

/** The handoff is a note on the clipboard, for whichever agent you use. */
export default function RegistryTabCopiedFrame() {
	return <RegistryCanvas take="tab" page="components/shaders" selected="spool-hero" copied />;
}
