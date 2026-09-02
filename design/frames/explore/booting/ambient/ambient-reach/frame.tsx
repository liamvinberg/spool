import { ReachBoot } from "shared/ui/explore/booting/boot-ambient";
import { BootShell } from "shared/ui/explore/booting/boot-screen";

export default function AmbientReachFrame() {
	return (
		<BootShell>
			<ReachBoot />
		</BootShell>
	);
}
