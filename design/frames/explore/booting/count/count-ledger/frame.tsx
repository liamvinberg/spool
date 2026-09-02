import { LedgerBoot } from "shared/ui/explore/booting/boot-count";
import { BootShell } from "shared/ui/explore/booting/boot-screen";

export default function CountLedgerFrame() {
	return (
		<BootShell>
			<LedgerBoot />
		</BootShell>
	);
}
