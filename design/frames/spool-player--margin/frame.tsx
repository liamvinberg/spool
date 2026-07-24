import { Fragment, useState } from "react";
import { cn } from "../../shared/lib/utils";
import type { CoffeeScreenName } from "../../shared/ui/coffee-screens";
import { BackIcon, CloseIcon, CompressIcon, ExpandIcon, RestartIcon } from "../../shared/ui/spool-icons";
import {
	edgeLabel,
	MotionButton,
	PHONE_LEFT,
	PHONE_W,
	phoneTop,
	PillButton,
	PlayerStage,
	STAGE_W,
	TickFrame,
	useWake,
	useWalk,
} from "../../shared/ui/spool-player-variations";

/**
 * margin — the session annotated like a drawing sheet. No panel: the walk
 * is a note in the left margin, the raw state a note in the right, each
 * tied to the screen by a leader hairline. The stage stays a stage; the
 * session data lives where a draughtsman would write it. Fullscreen puts
 * the sheet away and leaves the screen alone.
 */

const NOTE_TOP = 68;
const LEADER_Y = 90;
/** The walk note's right edge sits a leader's length off the screen. */
const WALK_NOTE_RIGHT = STAGE_W - (PHONE_LEFT - 48);

export default function SpoolPlayerMargin() {
	const walk = useWalk();
	const [motion, setMotion] = useState(true);
	const [fullscreen, setFullscreen] = useState(false);
	const { awake, wake } = useWake(fullscreen);
	const hidden = fullscreen && !awake;
	const rows: CoffeeScreenName[] = [...walk.stack, walk.screen];

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

				{/* left margin: the walk, right-aligned toward its leader */}
				<span
					className="absolute h-px bg-border-raised"
					style={{ left: PHONE_LEFT - 40, width: 32, top: LEADER_Y }}
				/>
				<div
					className="absolute flex flex-col items-end gap-1.5 text-right"
					style={{ right: WALK_NOTE_RIGHT, top: NOTE_TOP, width: 200 }}
				>
					<h2 className="text-2xs leading-none text-muted">walk</h2>
					{rows.map((name, i) => {
						const current = i === rows.length - 1;
						const next = rows[i + 1];
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: the same screen can sit at two hops — position is a tape entry's identity
							<Fragment key={`${i}:${name}`}>
								<button
									type="button"
									disabled={current}
									onClick={() => walk.rewind(i)}
									className={cn(
										"flex items-center gap-2 text-sm leading-none",
										current ? "text-text" : "cursor-pointer text-muted transition-colors hover:text-text",
									)}
								>
									{name}
									{current && <span className="h-[2px] w-2 bg-thread" />}
								</button>
								{next !== undefined && (
									<span className="text-2xs leading-none text-muted">· {edgeLabel(name, next)}</span>
								)}
							</Fragment>
						);
					})}
				</div>

				{/* right margin: the raw state, tied to the screen it describes */}
				<span
					className="absolute h-px bg-border-raised"
					style={{ left: PHONE_LEFT + PHONE_W + 8, width: 32, top: LEADER_Y }}
				/>
				<div
					className="absolute flex flex-col gap-1.5"
					style={{ left: PHONE_LEFT + PHONE_W + 48, top: NOTE_TOP, width: 220 }}
				>
					<h2 className="text-2xs leading-none text-muted">state</h2>
					{[
						{ key: "screen", value: `"${walk.screen}"`, changed: walk.stack.length > 0 },
						{ key: "cart.items", value: "2" },
						{ key: "cart.total", value: '"90 kr"' },
						{ key: "scenario", value: '"default"' },
					].map((row) => (
						<div key={row.key} className="flex items-center gap-2 text-sm leading-none">
							{row.changed === true && <span className="h-[2px] w-2 bg-thread" />}
							<span className="text-muted">{row.key}</span>
							<span className="ml-auto">{row.value}</span>
						</div>
					))}
				</div>
			</div>
		</PlayerStage>
	);
}
