import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CHOOSER } from "./fixture";
import { EASE } from "./marks";

/**
 * The Mac's own folder dialog, as Electron's showOpenDialog raises it: a sheet from
 * the top of the window, in macOS's colours and not spool's. What it hands back is
 * a path, and spool reads that path the same way it reads a typed one.
 */
export function Chooser({ prompt, onPick, onCancel }: { prompt: string; onPick: (path: string) => void; onCancel: () => void }) {
	const [place, setPlace] = useState(0);
	const [at, setAt] = useState(2);
	const panel = useRef<HTMLDivElement>(null);
	const rows = CHOOSER[place]?.rows ?? [];
	useEffect(() => {
		panel.current?.focus({ preventScroll: true });
	}, []);
	return (
		<div className="absolute inset-0 z-50">
			<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="absolute inset-0 bg-[#0000004d]" onClick={onCancel} />
			<motion.div
				ref={panel}
				tabIndex={-1}
				initial={{ y: -24, opacity: 0 }}
				animate={{ y: 0, opacity: 1 }}
				exit={{ y: -24, opacity: 0, transition: { duration: 0.14 } }}
				transition={{ duration: 0.26, ease: EASE }}
				onKeyDown={(event) => {
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						setAt((index) => Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
					} else if (event.key === "Enter") {
						event.preventDefault();
						const row = rows[at];
						if (row) onPick(row.path);
					} else if (event.key === "Escape") {
						event.preventDefault();
						onCancel();
					}
				}}
				className="absolute top-0 left-1/2 flex h-[440px] w-[700px] -translate-x-1/2 flex-col overflow-hidden rounded-b-[12px] border border-[#3a3a3c] border-t-0 bg-[#1e1e1e] font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Text',sans-serif] text-[13px] text-[#e5e5e7] outline-none [box-shadow:0_20px_60px_rgba(0,0,0,0.55)]"
			>
				<div className="flex h-[44px] shrink-0 items-center gap-[10px] border-[#323234] border-b bg-[#2a2a2c] px-[14px]">
					<span className="text-[#8e8e93]">‹ ›</span>
					<span className="rounded-[6px] bg-[#3a3a3c] px-[10px] py-[3px] text-[13px]">{CHOOSER[place]?.place}</span>
					<span className="ml-auto h-[24px] w-[180px] rounded-[6px] bg-[#3a3a3c] px-[8px] py-[3px] text-[#8e8e93]">Search</span>
				</div>
				<div className="flex min-h-0 flex-1">
					<div className="w-[160px] shrink-0 border-[#323234] border-r bg-[#252527] px-[8px] py-[10px]">
						<p className="px-[8px] pb-[4px] text-[11px] font-semibold text-[#8e8e93]">Favourites</p>
						{["Recents", "Applications"].map((label) => (
							<p key={label} className="px-[8px] py-[3px] text-[#8e8e93]">
								{label}
							</p>
						))}
						{CHOOSER.map((group, index) => (
							<button
								key={group.place}
								type="button"
								onClick={() => {
									setPlace(index);
									setAt(0);
								}}
								className={cn("block w-full rounded-[5px] px-[8px] py-[3px] text-left", index === place ? "bg-[#ffffff1a]" : "")}
							>
								{group.place}
							</button>
						))}
						<p className="px-[8px] py-[3px] text-[#8e8e93]">Documents</p>
					</div>
					<div className="min-w-0 flex-1 py-[6px]">
						<div className="flex px-[16px] pb-[4px] text-[11px] text-[#8e8e93]">
							<span className="flex-1">Name</span>
							<span className="w-[120px]">Date Modified</span>
						</div>
						{rows.map((row, index) => (
							<button
								key={row.path}
								type="button"
								onClick={() => setAt(index)}
								onDoubleClick={() => onPick(row.path)}
								className={cn("mx-[8px] flex h-[24px] w-[calc(100%-16px)] items-center rounded-[5px] px-[8px] text-left", index === at ? "bg-[#0a5fd1] text-[#ffffff]" : index % 2 === 1 ? "bg-[#ffffff05]" : "")}
							>
								<span className="mr-[8px] inline-block h-[11px] w-[14px] rounded-[2px] bg-[#5fa8f5]" />
								<span className="flex-1">{row.name}</span>
								<span className={cn("w-[120px]", index === at ? "text-[#ffffffcc]" : "text-[#8e8e93]")}>{row.note}</span>
							</button>
						))}
					</div>
				</div>
				<div className="flex h-[52px] shrink-0 items-center gap-[10px] border-[#323234] border-t bg-[#2a2a2c] px-[16px]">
					<span className="flex-1 text-[#8e8e93]">{prompt}</span>
					<button type="button" onClick={onCancel} className="h-[24px] rounded-[6px] bg-[#4a4a4c] px-[14px]">
						Cancel
					</button>
					<button
						type="button"
						onClick={() => {
							const row = rows[at];
							if (row) onPick(row.path);
						}}
						className="h-[24px] rounded-[6px] bg-[#0a5fd1] px-[16px] text-[#ffffff]"
					>
						Open
					</button>
				</div>
			</motion.div>
		</div>
	);
}
