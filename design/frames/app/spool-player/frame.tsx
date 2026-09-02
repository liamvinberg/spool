import { Fragment, useState } from "react";
import { cn } from "shared/lib/utils";
import type { CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { BackIcon, CloseIcon, InspectorIcon, RestartIcon } from "shared/ui/spool/icons";
import {
	edgeLabel,
	PHONE_W,
	phoneTop,
	PillButton,
	PlayerStage,
	STAGE_W,
	TickFrame,
	useWake,
	useWalk,
	type Walk,
} from "shared/ui/spool/player-stage";

/**
 * The player (#60), shipped: slate plus the session as an instrument rail,
 * closed by default. Controls group by meaning: walk verbs (back, restart)
 * ride the name slate top-left; top-right holds only the rail summon and the
 * exit. There is no fullscreen mode — sleep is the resting state, and the
 * instrument sleeps whenever the hand stops, unless the rail is open (reading
 * is stillness). The walk is a tape that is always running: scrub it by
 * clicking a hop, export it from the rail's footer.
 *
 * Back and restart drive the mock walk inside the stage. Close leaves the
 * player for the canvas it was opened from, which is what the real close does
 * once the popped window is gone.
 */

const RAIL_W = 320;

export default function SpoolPlayerFrame() {
	const walk = useWalk();
	const [motion, setMotion] = useState(true);
	const [open, setOpen] = useState(false);
	const { awake, wake } = useWake(!open);
	const hidden = !open && !awake;
	const stageW = open ? STAGE_W - RAIL_W : STAGE_W;
	const phoneLeft = Math.round((stageW - PHONE_W) / 2);

	return (
		<PlayerStage walk={walk} phoneLeft={phoneLeft} cursorHidden={hidden} onMouseMove={wake}>
			<div className={cn("transition-opacity duration-300", hidden && "pointer-events-none opacity-0")}>
				<TickFrame left={phoneLeft - 7} top={phoneTop() - 7} />
				<div className="absolute left-6 top-5 flex items-center gap-2.5">
					<div className="flex items-center gap-1">
						<PillButton label="Back" disabled={walk.stack.length === 0} onClick={walk.back}>
							<BackIcon className="h-4 w-4" />
						</PillButton>
						<PillButton label="Restart" onClick={walk.restart}>
							<RestartIcon className="h-4 w-4" />
						</PillButton>
					</div>
					<div className="flex flex-col gap-1">
						<span className="text-2xs leading-none text-muted">kaffe</span>
						<span className="flex items-center gap-2 text-sm leading-none">
							<span className="h-[2px] w-2 bg-thread" />
							{walk.screen}
						</span>
					</div>
				</div>
				<div
					className="absolute top-5 flex items-center gap-1 transition-[right] duration-300"
					style={{ right: open ? RAIL_W + 24 : 24 }}
				>
					<PillButton
						label={open ? "Close inspector" : "Inspector"}
						className={cn(open && "text-text")}
						onClick={() => setOpen((o) => !o)}
					>
						<InspectorIcon className="h-4 w-4" />
					</PillButton>
					<PillButton label="Close" go="spool-canvas">
						<CloseIcon className="h-4 w-4" />
					</PillButton>
				</div>
				<span className="absolute bottom-5 left-6 text-2xs leading-none text-muted">390 × 780 · 100%</span>
			</div>
			<div
				className={cn(
					"absolute inset-y-0 right-0 flex flex-col overflow-hidden border-l border-border bg-canvas transition-[translate,opacity] duration-300",
					!open && "pointer-events-none translate-x-full opacity-0",
				)}
				style={{ width: RAIL_W }}
			>
				<WalkSection walk={walk} />
				<StateSection walk={walk} />
				<MockSection />
				<footer className="mt-auto flex flex-col gap-1.5 border-t border-border px-5 py-4">
					<button
						type="button"
						onClick={() => setMotion((m) => !m)}
						className="-mx-1.5 -my-0.5 flex cursor-pointer items-center justify-between rounded-xs px-1.5 py-0.5 text-sm leading-sm transition-colors hover:bg-surface"
					>
						<span className="text-muted">motion</span>
						<span>{motion ? "on" : "off"}</span>
					</button>
					<div className="flex items-center justify-between px-0 text-sm leading-sm">
						<span className="text-muted">export</span>
						<span className="flex items-center gap-2">
							<button type="button" className="cursor-pointer transition-colors hover:text-thread">
								video
							</button>
							<span className="text-muted">·</span>
							<button type="button" className="cursor-pointer transition-colors hover:text-thread">
								link
							</button>
						</span>
					</div>
				</footer>
			</div>
		</PlayerStage>
	);
}

function WalkSection({ walk }: { walk: Walk }) {
	const rows: CoffeeScreenName[] = [...walk.stack, walk.screen];
	const duration = `0:${String((rows.length - 1) * 4).padStart(2, "0")}`;
	return (
		<section className="flex flex-col gap-2.5 px-5 py-4">
			<div className="flex items-center justify-between">
				<h2 className="text-2xs leading-none text-muted">walk</h2>
				<span className="text-2xs leading-none text-muted">{duration}</span>
			</div>
			<ol className="flex flex-col gap-1.5">
				{rows.map((name, i) => {
					const current = i === rows.length - 1;
					const next = rows[i + 1];
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: the same screen can sit at two hops — position is a tape entry's identity
						<Fragment key={`${i}:${name}`}>
							<li>
								<button
									type="button"
									disabled={current}
									onClick={() => walk.rewind(i)}
									className={cn(
										"-mx-1.5 -my-0.5 flex w-[calc(100%+12px)] items-center gap-2 rounded-xs px-1.5 py-0.5 text-sm leading-sm",
										current ? "text-text" : "cursor-pointer text-muted transition-colors hover:bg-surface hover:text-text",
									)}
								>
									{current && <span className="h-[2px] w-2 bg-thread" />}
									{name}
									<span className="ml-auto text-2xs text-muted">0:{String(i * 4).padStart(2, "0")}</span>
								</button>
							</li>
							{next !== undefined && (
								<li className="pl-3 text-2xs leading-none text-muted">· {edgeLabel(name, next)}</li>
							)}
						</Fragment>
					);
				})}
			</ol>
		</section>
	);
}

function StateSection({ walk }: { walk: Walk }) {
	const rows: Array<{ key: string; value: string; changed?: boolean }> = [
		{ key: "screen", value: `"${walk.screen}"`, changed: walk.stack.length > 0 },
		{ key: "cart.items", value: "2" },
		{ key: "cart.total", value: '"90 kr"' },
		{ key: "scenario", value: '"default"' },
	];
	return (
		<section className="flex flex-col gap-2.5 border-t border-border px-5 py-4">
			<h2 className="text-2xs leading-none text-muted">state</h2>
			<dl className="flex flex-col gap-1.5">
				{rows.map((row) => (
					<div key={row.key} className="flex items-center gap-2 text-sm leading-sm">
						{row.changed === true && <span className="h-[2px] w-2 bg-thread" />}
						<dt className="text-muted">{row.key}</dt>
						<dd className="ml-auto">{row.value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

function MockSection() {
	const rows = [
		{ method: "GET", path: "/api/menu", meta: "200 · 8 ms" },
		{ method: "POST", path: "/api/cart", meta: "200 · 14 ms" },
	];
	return (
		<section className="flex flex-col gap-2.5 border-t border-border px-5 py-4">
			<h2 className="text-2xs leading-none text-muted">mock</h2>
			<ul className="flex flex-col gap-1.5">
				{rows.map((row) => (
					<li key={`${row.method}:${row.path}`} className="flex items-center gap-2 text-sm leading-sm">
						<span className="w-9 text-muted">{row.method}</span>
						<span>{row.path}</span>
						<span className="ml-auto text-2xs text-muted">{row.meta}</span>
					</li>
				))}
			</ul>
		</section>
	);
}
