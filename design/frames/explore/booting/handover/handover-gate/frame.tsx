import { BootShell, ThreadBoot } from "shared/ui/explore/booting/boot-screen";
import { GateHandover, HandoverRail, useGateStep } from "shared/ui/explore/booting/boot-handover";

export default function HandoverGateFrame() {
	const step = useGateStep();
	return (
		<BootShell rail={<HandoverRail landed={step % 2 === 1} />}>
			<GateHandover step={step} loader={<ThreadBoot />} />
		</BootShell>
	);
}
