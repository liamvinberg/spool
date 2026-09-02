import { BootShell } from "shared/ui/explore/booting/boot-screen";
import { StallHandover, StallRail } from "shared/ui/explore/booting/boot-handover";

export default function HandoverStallFrame() {
	return (
		<BootShell rail={<StallRail />}>
			<StallHandover />
		</BootShell>
	);
}
