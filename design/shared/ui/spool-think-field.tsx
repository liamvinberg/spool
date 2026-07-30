import { cn } from "../lib/utils";

/**
 * The canvas behind these frames: the three site frames the turn in the screenshot
 * is working on, at the same 39% the rest of this page draws.
 *
 * It is deliberately thin. The subject of every `agent-think--` frame is the rail,
 * and a canvas with anything to look at on it is a canvas competing for the reading.
 * What it is here for is the same thing the threads row is here for: the pixels it
 * takes, so the rail's transcript is measured under a real window rather than a
 * floating panel.
 */

const FW = 152;
const FH = 329;
const COLS = [96, 292, 488] as const;
const TOP = 96;

const FRAMES = ["site-punch-sheet", "site-punch-sheet--door-twice", "site-punch-sheet--patch"] as const;

export function ThinkField({ selected = "site-punch-sheet--door-twice" }: { selected?: string | undefined }) {
	return (
		<div className="absolute inset-0">
			{FRAMES.map((name, index) => (
				<div key={name} className="absolute flex flex-col" style={{ left: COLS[index] ?? 0, top: TOP, width: FW }}>
					<div className="flex h-[22px] min-w-0 items-center font-mono text-xs leading-3">
						<span className={cn("min-w-0 truncate", name === selected ? "text-thread" : "text-text")}>{name}</span>
					</div>
					<div className="relative" style={{ width: FW, height: FH }}>
						<div className="overflow-hidden rounded-lg bg-surface" style={{ width: FW, height: FH }}>
							<Sheet punched={index > 0} />
						</div>
						{name === selected ? (
							<span
								className="pointer-events-none absolute rounded-lg border border-thread opacity-55"
								style={{ inset: -1 }}
							/>
						) : null}
					</div>
				</div>
			))}
		</div>
	);
}

/** a punch sheet, small enough that nothing on it is readable and nothing needs to be */
function Sheet({ punched }: { punched: boolean }) {
	return (
		<div className="flex h-full w-full flex-col gap-3 p-4">
			<div className="h-2 w-16 rounded-full bg-border-raised" />
			<div className="grid grid-cols-2 gap-2">
				{Array.from({ length: 8 }, (_, cell) => (
					<div
						key={cell}
						className={cn(
							"h-10 rounded-sm border border-border",
							punched && cell === 2 ? "border-dashed bg-transparent" : "bg-raised/60",
						)}
					/>
				))}
			</div>
			<div className="mt-auto h-2 w-24 rounded-full bg-border" />
		</div>
	);
}
