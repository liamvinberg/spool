import { TallyBoot, TallyRail } from "../../../shared/ui/spool-boot-count";
import { BootShell } from "../../../shared/ui/spool-boot-screen";

export default function CountTallyFrame() {
	return (
		<BootShell rail={<TallyRail />}>
			<TallyBoot />
		</BootShell>
	);
}
