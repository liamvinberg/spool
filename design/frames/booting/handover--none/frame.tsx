import { BootShell } from "shared/ui/spool-boot-screen";
import { NoneHandover, NoneRail, useNonePhase } from "shared/ui/spool-boot-handover";

export default function HandoverNoneFrame() {
	const landed = useNonePhase();
	return (
		<BootShell rail={<NoneRail landed={landed} />}>
			<NoneHandover landed={landed} />
		</BootShell>
	);
}
