import { KnotBoot } from "shared/ui/explore/booting/boot-ambient";
import { BootShell } from "shared/ui/explore/booting/boot-screen";

export default function AmbientKnotFrame() {
	return (
		<BootShell>
			<KnotBoot />
		</BootShell>
	);
}
