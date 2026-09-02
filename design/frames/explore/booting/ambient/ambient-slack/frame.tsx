import { SlackBoot } from "shared/ui/explore/booting/boot-ambient";
import { BootShell } from "shared/ui/explore/booting/boot-screen";

export default function AmbientSlackFrame() {
	return (
		<BootShell>
			<SlackBoot />
		</BootShell>
	);
}
