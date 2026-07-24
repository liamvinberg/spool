import { useState } from "react";
import { cn } from "../../shared/lib/utils";
import { CompressIcon, ExpandIcon } from "../../shared/ui/spool-icons";
import { PillButton, PlayerPill, PlayerStage, useWake, useWalk } from "../../shared/ui/spool-player-variations";

/**
 * strip — the conservative fix. The pill as shipped, minus the walked trail
 * (current name only), plus a fullscreen seat: entering it puts the chrome
 * to sleep until the hand moves again. Fullscreen is a mode you opt into.
 */
export default function SpoolPlayerStrip() {
	const walk = useWalk();
	const [motion, setMotion] = useState(true);
	const [fullscreen, setFullscreen] = useState(false);
	const { awake, wake } = useWake(fullscreen);
	const hidden = fullscreen && !awake;

	return (
		<PlayerStage walk={walk} bottomInset={hidden ? 0 : 36} cursorHidden={hidden} onMouseMove={wake}>
			<PlayerPill
				walk={walk}
				motion={motion}
				onMotion={() => setMotion((m) => !m)}
				className={cn(
					"transition-[opacity,translate] duration-300",
					hidden && "pointer-events-none translate-y-1.5 opacity-0",
				)}
				trailing={
					<PillButton
						label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
						onClick={() => setFullscreen((f) => !f)}
					>
						{fullscreen ? <CompressIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
					</PillButton>
				}
			/>
		</PlayerStage>
	);
}
