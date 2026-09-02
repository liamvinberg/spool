import { TallyBoot, TallyRail } from "shared/ui/explore/booting/boot-count";
import { BootShell } from "shared/ui/explore/booting/boot-screen";

export default function CountTallyFrame() {
	return (
		<BootShell rail={<TallyRail />}>
			<TallyBoot />
		</BootShell>
	);
}
