import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "shared/lib/utils";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { FolderIcon } from "shared/ui/spool/icons";
import { EASE } from "./motion";
import { DIRS } from "./world";

/**
 * The Mac's own open panel, drawn plainly: in the app, "Choose a folder…" is the
 * Finder, and what it hands back is a path that lands in the field to be read.
 * The browser has no such panel, which is why the field takes a typed path at all.
 */
export function FinderPanel({ onPick, onCancel }: { onPick: (path: string) => void; onCancel: () => void }) {
	const [dir, setDir] = useState("~/code");
	const [sel, setSel] = useState(2);
	const items = DIRS[dir] ?? [];
	const chosen = items[sel];
	const pick = () => onPick(chosen ? `${dir}/${chosen}` : dir);
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onCancel();
			} else if (event.key === "Enter") {
				event.preventDefault();
				pick();
			} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				setSel((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
			}
		};
		window.addEventListener("keydown", key, true);
		return () => window.removeEventListener("keydown", key, true);
	});
	return (
		<div className="absolute inset-0 z-50 flex justify-center bg-[color-mix(in_oklab,var(--color-bg)_55%,transparent)]" onPointerDown={onCancel}>
			<motion.div
				initial={{ opacity: 0, y: -12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.22, ease: EASE }}
				className="mt-0 flex h-[400px] w-[640px] flex-col overflow-hidden rounded-b-[12px] border border-border-raised border-t-0 bg-surface"
				onPointerDown={(event) => event.stopPropagation()}
			>
				<div className="flex h-[40px] shrink-0 items-center justify-center border-border border-b text-muted type-label">Choose a folder for spool</div>
				<div className="flex min-h-0 flex-1">
					<div className="w-[150px] shrink-0 border-border border-r px-[8px] py-[10px]">
						<span className="px-[8px] text-muted type-caption">Favourites</span>
						{["~/code", "~/Desktop", "~/spool"].map((place) => (
							<button
								key={place}
								type="button"
								className={cn("mt-[2px] flex h-[28px] w-full items-center gap-[8px] rounded-[6px] px-[8px] text-left type-label", dir === place ? "bg-raised text-text" : "text-muted hover:text-text")}
								onClick={() => {
									setDir(place);
									setSel(0);
								}}
							>
								<FolderIcon className="h-[13px] w-[13px]" />
								{place.slice(2)}
							</button>
						))}
					</div>
					<div className="min-w-0 flex-1 px-[8px] py-[10px]">
						<span className="px-[8px] text-muted type-detail">{dir}</span>
						{items.map((name, index) => (
							<button
								key={name}
								type="button"
								className={cn("mt-[2px] flex h-[28px] w-full items-center gap-[8px] rounded-[6px] px-[8px] text-left type-label", index === sel ? "bg-raised text-text" : "text-text hover:bg-raised/50")}
								onClick={() => setSel(index)}
								onDoubleClick={() => (DIRS[`${dir}/${name}`] ? (setDir(`${dir}/${name}`), setSel(0)) : onPick(`${dir}/${name}`))}
							>
								<FolderIcon className="h-[13px] w-[13px] text-muted" />
								{name}
							</button>
						))}
					</div>
				</div>
				<div className="flex h-[56px] shrink-0 items-center justify-end gap-[10px] border-border border-t px-[16px]">
					<button type="button" className={HOME_ACTION} onClick={onCancel}>
						Cancel
					</button>
					<button type="button" className={HOME_ACTION_PRIMARY} onClick={pick}>
						Open
					</button>
				</div>
			</motion.div>
		</div>
	);
}
