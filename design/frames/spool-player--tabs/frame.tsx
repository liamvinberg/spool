import { useState } from "react";
import { cn } from "../../shared/lib/utils";
import type { CoffeeScreenName } from "../../shared/ui/coffee-screens";
import { BackIcon, CloseIcon, CompressIcon, ExpandIcon, RestartIcon } from "../../shared/ui/spool-icons";
import { MotionButton, PillButton, PlayerStage, useWake, useWalk } from "../../shared/ui/spool-player-variations";

/**
 * tabs — the reviewer's player. A flush underbar carries the flow's screens
 * as jumpable tabs (the thread-red tick marks the one on stage), so a batch
 * of agent work can be inspected directly instead of only walked. The most
 * tool-like of the set; fullscreen slides the bar away and recenters.
 */

const SCREENS: CoffeeScreenName[] = ["menu", "cart", "receipt"];
const BAR_H = 44;

export default function SpoolPlayerTabs() {
	const walk = useWalk();
	const [motion, setMotion] = useState(true);
	const [fullscreen, setFullscreen] = useState(false);
	const { awake, wake } = useWake(fullscreen);
	const hidden = fullscreen && !awake;

	return (
		<PlayerStage walk={walk} bottomInset={hidden ? 0 : BAR_H} cursorHidden={hidden} onMouseMove={wake}>
			<div
				className={cn(
					"absolute inset-x-0 bottom-0 flex items-center border-t border-border bg-canvas px-2.5 transition-[translate,opacity] duration-300",
					hidden && "pointer-events-none translate-y-full opacity-0",
				)}
				style={{ height: BAR_H }}
			>
				<div className="flex items-center gap-1">
					<PillButton label="Back" disabled={walk.stack.length === 0} onClick={walk.back}>
						<BackIcon className="h-4 w-4" />
					</PillButton>
					<PillButton label="Restart" onClick={walk.restart}>
						<RestartIcon className="h-4 w-4" />
					</PillButton>
				</div>
				<div className="absolute left-1/2 flex h-full -translate-x-1/2 items-stretch">
					{SCREENS.map((name) => (
						<button
							key={name}
							type="button"
							onClick={() => walk.jump(name)}
							className={cn(
								"relative flex cursor-pointer items-center px-3.5 text-sm transition-colors",
								name === walk.screen ? "text-text" : "text-muted hover:text-text",
							)}
						>
							{name}
							{name === walk.screen && <span className="absolute inset-x-0 top-0 h-[2px] bg-thread" />}
						</button>
					))}
				</div>
				<div className="ml-auto flex items-center gap-1">
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
			</div>
		</PlayerStage>
	);
}
