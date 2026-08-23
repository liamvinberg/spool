import { LedgerBoot } from "../../../shared/ui/spool-boot-count";
import { BootShell } from "../../../shared/ui/spool-boot-screen";

export default function CountLedgerFrame() {
	return (
		<BootShell>
			<LedgerBoot />
		</BootShell>
	);
}
