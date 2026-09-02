import { DealBoot, DealRail } from "shared/ui/explore/booting/boot-shape";
import { BootShell } from "shared/ui/explore/booting/boot-screen";

export default function ShapeDealFrame() {
	return (
		<BootShell rail={<DealRail />}>
			<DealBoot />
		</BootShell>
	);
}
