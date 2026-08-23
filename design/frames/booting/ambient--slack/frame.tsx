import { SlackBoot } from "../../../shared/ui/spool-boot-ambient";
import { BootShell } from "../../../shared/ui/spool-boot-screen";

export default function AmbientSlackFrame() {
	return (
		<BootShell>
			<SlackBoot />
		</BootShell>
	);
}
