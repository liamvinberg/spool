import { WrapBoot } from "shared/ui/explore/booting/boot-ambient";
import { BootShell } from "shared/ui/explore/booting/boot-screen";

export default function AmbientWrapFrame() {
	return (
		<BootShell>
			<WrapBoot />
		</BootShell>
	);
}
