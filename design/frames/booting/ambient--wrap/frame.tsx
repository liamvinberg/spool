import { WrapBoot } from "../../../shared/ui/spool-boot-ambient";
import { BootShell } from "../../../shared/ui/spool-boot-screen";

export default function AmbientWrapFrame() {
	return (
		<BootShell>
			<WrapBoot />
		</BootShell>
	);
}
