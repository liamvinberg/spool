import { BootShell } from "shared/ui/explore/booting/boot-screen";
import { NoneHandover, NoneRail, useNonePhase } from "shared/ui/explore/booting/boot-handover";

export default function HandoverNoneFrame() {
	const landed = useNonePhase();
	return (
		<BootShell rail={<NoneRail landed={landed} />}>
			<NoneHandover landed={landed} />
		</BootShell>
	);
}
