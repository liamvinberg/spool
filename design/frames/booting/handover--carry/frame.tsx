import { BootShell } from "../../../shared/ui/spool-boot-screen";
import { CarryHandover, HandoverRail, useCarryPhase } from "../../../shared/ui/spool-boot-handover";

export default function HandoverCarryFrame() {
	const { landed, hidden } = useCarryPhase();
	return (
		<BootShell rail={<HandoverRail landed={landed && !hidden} />}>
			<CarryHandover landed={landed} hidden={hidden} />
		</BootShell>
	);
}
