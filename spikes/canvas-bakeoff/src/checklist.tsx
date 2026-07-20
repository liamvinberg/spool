// The Figma-feel checklist Liam reacts to. Two tick columns (tldraw / home) so both
// variants are judged against the same rows. In-memory only — a reload wipes ticks.

import { clsx } from "clsx";

export type ChecklistRow = { id: string; label: string; gesture: string };

export const checklist: ChecklistRow[] = [
	{ id: "pan-trackpad", label: "Trackpad pan", gesture: "two-finger scroll pans — no zoom, no page scroll" },
	{ id: "zoom-cursor", label: "Zoom to cursor", gesture: "pinch or ⌘/ctrl-scroll zooms toward the pointer, not the center" },
	{ id: "pan-space", label: "Space / middle-mouse pan", gesture: "hold space → grab cursor, drag pans; middle-mouse too" },
	{ id: "zoom-keys", label: "Zoom keys", gesture: "+ / − step · ⇧1 fit · ⇧2 selection · ⌘0 100%" },
	{ id: "select-click", label: "Click select", gesture: "click frame → bounds + handles; click canvas → deselect" },
	{ id: "select-shift", label: "Shift-click", gesture: "shift-click adds / removes from selection" },
	{ id: "select-marquee", label: "Marquee", gesture: "drag on empty canvas → rectangle, frames select live" },
	{ id: "drag-frame", label: "Drag a frame", gesture: "sticks to cursor — no lag, no jitter, at any zoom" },
	{ id: "snapping", label: "Snapping", gesture: "drag near another frame → red edge/center guides, snap engages and releases naturally" },
	{ id: "arrows-live", label: "Arrows re-route live", gesture: "move a connected frame — the noodle follows, never stale" },
	{ id: "arrows-draw", label: "Draw an arrow", gesture: "press A, drag from one frame to another" },
	{ id: "resize", label: "Corner resize", gesture: "content reflows as the box resizes — no pixel scaling, no blur" },
	{ id: "labels", label: "Frame labels", gesture: "name above frame at constant size; click selects, drag moves" },
	{ id: "wrist", label: "The wrist test", gesture: "after two minutes of play: tool, or webpage?" },
];

export type Ticks = Record<string, { t: boolean; h: boolean }>;

export function ChecklistPanel({
	ticks,
	onTick,
	onClose,
}: {
	ticks: Ticks;
	onTick: (id: string, col: "t" | "h") => void;
	onClose: () => void;
}) {
	return (
		<div className="fixed top-4 right-4 bottom-20 z-50 flex w-95 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl">
			<div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
				<div className="text-[13px] font-semibold text-neutral-800">figma-feel checklist</div>
				<div className="flex items-center gap-3">
					<div className="flex gap-2 text-[11px] font-medium text-neutral-400">
						<span className="w-5 text-center">t</span>
						<span className="w-5 text-center">h</span>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="cursor-pointer text-[13px] text-neutral-400 hover:text-neutral-700"
					>
						✕
					</button>
				</div>
			</div>
			<div className="flex-1 overflow-y-auto py-1">
				{checklist.map((row) => {
					const tick = ticks[row.id] ?? { t: false, h: false };
					return (
						<div key={row.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-neutral-50">
							<div className="min-w-0 flex-1">
								<div className="text-[13px] font-medium text-neutral-800">{row.label}</div>
								<div className="mt-0.5 text-[12px] leading-snug text-neutral-500">{row.gesture}</div>
							</div>
							{(["t", "h"] as const).map((col) => (
								<button
									key={col}
									type="button"
									onClick={() => onTick(row.id, col)}
									className={clsx(
										"mt-0.5 h-5 w-5 flex-shrink-0 cursor-pointer rounded-md border text-[11px] leading-none",
										tick[col]
											? "border-violet-600 bg-violet-600 text-white"
											: "border-neutral-300 bg-white text-transparent hover:border-neutral-400",
									)}
								>
									✓
								</button>
							))}
						</div>
					);
				})}
			</div>
			<div className="border-t border-neutral-100 px-4 py-2 text-[11px] text-neutral-400">
				t = tldraw · h = home-built · ticks live in memory only
			</div>
		</div>
	);
}
