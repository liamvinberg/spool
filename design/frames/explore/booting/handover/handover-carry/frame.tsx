import { BootShell } from "shared/ui/explore/booting/boot-screen";
import { CarryHandover, HandoverRail, useCarryPhase } from "shared/ui/explore/booting/boot-handover";

export default function HandoverCarryFrame() {
	const { landed, hidden } = useCarryPhase();
	return (
		<BootShell rail={<HandoverRail landed={landed && !hidden} />}>
			<CarryHandover landed={landed} hidden={hidden} />
		</BootShell>
	);
}
