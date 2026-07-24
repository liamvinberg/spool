import { useState } from "react";
import { cn } from "../../shared/lib/utils";
import { BackIcon, CloseIcon, CompressIcon, ExpandIcon, RestartIcon } from "../../shared/ui/spool-icons";
import {
	MotionButton,
	PHONE_LEFT,
	phoneTop,
	PillButton,
	PlayerStage,
	TickFrame,
	useWake,
	useWalk,
} from "../../shared/ui/spool-player-variations";

/**
 * slate — the chrome dissolved into instrument readouts. No pill, no bar:
 * the frame name as a slate top-left (the red dash marks where the thread
 * is), bare controls top-right, the drawing legend bottom-left, and
 * registration ticks just off the screen's corners. Fullscreen puts the
 * whole HUD to sleep.
 */
export default function SpoolPlayerSlate() {
	const walk = useWalk();
	const [motion, setMotion] = useState(true);
	const [fullscreen, setFullscreen] = useState(false);
	const { awake, wake } = useWake(fullscreen);
	const hidden = fullscreen && !awake;

	return (
		<PlayerStage walk={walk} cursorHidden={hidden} onMouseMove={wake}>
			<div className={cn("transition-opacity duration-300", hidden && "pointer-events-none opacity-0")}>
				<TickFrame left={PHONE_LEFT - 7} top={phoneTop() - 7} />
				<div className="absolute left-6 top-5 flex items-center gap-2.5">
					<PillButton label="Back" disabled={walk.stack.length === 0} onClick={walk.back}>
						<BackIcon className="h-4 w-4" />
					</PillButton>
					<div className="flex flex-col gap-1">
						<span className="text-2xs leading-none text-muted">kaffe</span>
						<span className="flex items-center gap-2 text-sm leading-none">
							<span className="h-[2px] w-2 bg-thread" />
							{walk.screen}
						</span>
					</div>
				</div>
				<div className="absolute right-6 top-5 flex items-center gap-1">
					<PillButton label="Restart" onClick={walk.restart}>
						<RestartIcon className="h-4 w-4" />
					</PillButton>
					<MotionButton bare on={motion} onToggle={() => setMotion((m) => !m)} />
					<PillButton
						label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
						onClick={() => setFullscreen((f) => !f)}
					>
						{fullscreen ? <CompressIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
					</PillButton>
					<PillButton label="Close">
						<CloseIcon className="h-4 w-4" />
					</PillButton>
				</div>
				<span className="absolute bottom-5 left-6 text-2xs leading-none text-muted">390 × 780 · 100%</span>
			</div>
		</PlayerStage>
	);
}
