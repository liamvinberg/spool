import { DealBoot, DealRail } from "shared/ui/spool-boot-shape";
import { BootShell } from "shared/ui/spool-boot-screen";

export default function ShapeDealFrame() {
	return (
		<BootShell rail={<DealRail />}>
			<DealBoot />
		</BootShell>
	);
}
