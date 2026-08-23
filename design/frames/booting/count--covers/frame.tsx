import { BootShell } from "../../../shared/ui/spool-boot-screen";
import { CoversBoot } from "../../../shared/ui/spool-boot-count";
import canvasCover from "./spool-canvas.png";
import homeCover from "./spool-home.png";
import playerCover from "./spool-player.png";

/** freshest capture first, the order /api/projects hands them over in */
const COVERS = [
	{ name: "spool-canvas", src: canvasCover },
	{ name: "spool-home", src: homeCover },
	{ name: "spool-player", src: playerCover },
];

export default function CountCoversFrame() {
	return (
		<BootShell>
			<CoversBoot covers={COVERS} />
		</BootShell>
	);
}
