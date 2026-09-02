import { BootShell, GhostsBoot, GhostsRail } from "shared/ui/explore/booting/boot-screen";

export default function BootGhostsFrame() {
	return (
		<BootShell rail={<GhostsRail />}>
			<GhostsBoot />
		</BootShell>
	);
}
