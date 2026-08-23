import { KnotBoot } from "../../../shared/ui/spool-boot-ambient";
import { BootShell } from "../../../shared/ui/spool-boot-screen";

export default function AmbientKnotFrame() {
	return (
		<BootShell>
			<KnotBoot />
		</BootShell>
	);
}
