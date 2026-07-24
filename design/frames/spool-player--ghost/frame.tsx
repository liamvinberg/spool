import { useState } from "react";
import { cn } from "../../shared/lib/utils";
import { PlayerPill, PlayerStage, useWake, useWalk } from "../../shared/ui/spool-player-variations";

/**
 * ghost — fullscreen as the resting state, not a mode. There is nothing to
 * enter and no button for it: the pill lives while the hand moves and fades
 * when it stops, the way a video player's controls do. The player is the
 * prototype; chrome only visits.
 */
export default function SpoolPlayerGhost() {
	const walk = useWalk();
	const [motion, setMotion] = useState(true);
	const { awake, wake } = useWake(true);

	return (
		<PlayerStage walk={walk} bottomInset={awake ? 36 : 0} cursorHidden={!awake} onMouseMove={wake}>
			<PlayerPill
				walk={walk}
				motion={motion}
				onMotion={() => setMotion((m) => !m)}
				className={cn(
					"transition-[opacity,translate] duration-300",
					!awake && "pointer-events-none translate-y-1.5 opacity-0",
				)}
			/>
		</PlayerStage>
	);
}
