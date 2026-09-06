import { useReducedMotion } from "motion/react";
import { useState } from "react";
import { ResizePopover } from "shared/ui/spool/resize-popover";

export function ResizePopoverSpecimen({ still = false }: { still?: boolean }) {
	const reduced = useReducedMotion() === true;
	const [keyboard, setKeyboard] = useState(false);
	const [open, setOpen] = useState(true);
	const [view, setView] = useState("models");
	const [effort, setEffort] = useState("medium");
	return (
		<div className="flex h-[290px] w-[350px] items-end border border-border bg-canvas p-3">
			<div
				className="relative w-full"
				onPointerDownCapture={() => setKeyboard(false)}
				onKeyDownCapture={() => setKeyboard(true)}
			>
				<ResizePopover open={open} view={view} still={still || reduced || keyboard}>
					{view === "models" ? (
						<div>
							<div className="space-y-1 p-1.5">
								{["GPT-6 Astra", "Opus 5", "Sonnet 5"].map((name) => (
									<div key={name} className="rounded-sm px-3 py-2.5 text-text type-value">
										{name}
									</div>
								))}
							</div>
							<button
								type="button"
								onClick={() => setView("effort")}
								className="flex h-10 w-full items-center justify-between border-border-raised border-t px-3 text-muted type-control hover:text-text"
							>
								<span>Effort</span>
								<span className="type-detail">{effort} ›</span>
							</button>
						</div>
					) : (
						<div>
							<button
								type="button"
								onClick={() => setView("models")}
								className="flex h-11 w-full items-center gap-3 border-border-raised border-b px-3 text-muted type-control hover:text-text"
							>
								←<span>Effort</span>
							</button>
							<fieldset aria-label="Effort levels" className="grid grid-cols-3 gap-1 p-2">
								{["low", "medium", "high"].map((level) => (
									<button
										key={level}
										type="button"
										aria-pressed={effort === level}
										onClick={() => setEffort(level)}
										className={`h-8 rounded-sm type-detail hover:bg-raised ${effort === level ? "bg-raised text-text" : "text-muted"}`}
									>
										{level}
									</button>
								))}
							</fieldset>
						</div>
					)}
				</ResizePopover>
				<button
					type="button"
					onClick={() => setOpen(!open)}
					className="flex h-5 items-center gap-2 text-muted type-detail hover:text-text"
				>
					GPT-6 Astra <span>⌄</span>
				</button>
			</div>
		</div>
	);
}
