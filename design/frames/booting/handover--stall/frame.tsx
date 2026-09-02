import { BootShell } from "shared/ui/spool-boot-screen";
import { StallHandover, StallRail } from "shared/ui/spool-boot-handover";

export default function HandoverStallFrame() {
	return (
		<BootShell rail={<StallRail />}>
			<StallHandover />
		</BootShell>
	);
}
