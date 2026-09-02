import { BootShell, GhostsBoot, GhostsRail } from "shared/ui/spool-boot-screen";

export default function BootGhostsFrame() {
	return (
		<BootShell rail={<GhostsRail />}>
			<GhostsBoot />
		</BootShell>
	);
}
