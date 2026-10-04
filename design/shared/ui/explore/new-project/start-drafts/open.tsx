import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { FolderIcon } from "shared/ui/spool/icons";
import { readingOf, sentenceOf, type Spot, spotsFor, verbOf } from "./fixture";
import type { Host } from "./home";
import { EASE, Kbd } from "./marks";

/**
 * Open…: a path or a git link. The list is the folder the field names, and every
 * row carries what spool read in it, so the choice is made knowing whether it
 * opens a project, starts one beside code, or walks up to one already here.
 */
export function OpenSheet({ host, onPick, onClose }: { host: Host; onPick: (spot: Spot) => void; onClose: () => void }) {
	const [query, setQuery] = useState("~/code/");
	const [at, setAt] = useState(1);
	const field = useRef<HTMLInputElement>(null);
	const { listing, spots } = spotsFor(query);
	const chosen = spots[Math.min(at, spots.length - 1)];
	useEffect(() => {
		field.current?.focus();
	}, []);
	return (
		<div className="absolute inset-0 z-40">
			<motion.button
				type="button"
				aria-label="Close"
				className="absolute inset-0 cursor-default bg-[#0e0e0eb8]"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				transition={{ duration: 0.14 }}
				onClick={onClose}
			/>
			<motion.div
				role="dialog"
				aria-label="Open"
				className="absolute top-[96px] left-1/2 w-[620px] -translate-x-1/2 overflow-hidden rounded-[10px] border border-border-raised bg-surface"
				initial={{ opacity: 0, y: -6 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
				transition={{ duration: 0.18, ease: EASE }}
			>
				<div className="flex items-center gap-[12px] border-border-raised border-b px-[18px]">
					<FolderIcon className="h-[16px] w-[16px] shrink-0 text-muted" />
					<input
						ref={field}
						value={query}
						spellCheck={false}
						aria-label="Path or git link"
						placeholder="A folder path or a git link"
						className="h-[52px] min-w-0 flex-1 bg-transparent text-text outline-none type-code-input placeholder:text-muted"
						onChange={(event) => {
							setQuery(event.target.value);
							setAt(0);
						}}
						onKeyDown={(event) => {
							event.stopPropagation();
							if (event.key === "ArrowDown") {
								event.preventDefault();
								setAt((value) => Math.min(spots.length - 1, value + 1));
							}
							if (event.key === "ArrowUp") {
								event.preventDefault();
								setAt((value) => Math.max(0, value - 1));
							}
							if (event.key === "Enter" && chosen) {
								event.preventDefault();
								onPick(chosen);
							}
							if (event.key === "Escape") {
								event.preventDefault();
								onClose();
							}
						}}
					/>
					{!query.startsWith(listing) && <span className="text-muted type-detail">{listing}</span>}
				</div>
				<div className="p-[6px]">
					{spots.map((spot, index) => {
						const lit = chosen?.key === spot.key;
						return (
							<button
								key={spot.key}
								type="button"
								className={cn("flex h-[42px] w-full items-center gap-[12px] rounded-[7px] px-[12px] text-left", lit && "bg-raised")}
								onMouseEnter={() => setAt(index)}
								onClick={() => onPick(spot)}
							>
								<FolderIcon className="h-[14px] w-[14px] shrink-0 text-muted" />
								<span className="flex-1 truncate type-control">{spot.name}</span>
								<span className={cn("type-detail", spot.finding.kind === "known" ? "text-muted" : "text-text")}>{readingOf(spot.finding)}</span>
							</button>
						);
					})}
					{spots.length === 0 && <p className="px-[12px] py-[12px] text-muted type-label">No folder by that name in {listing}.</p>}
				</div>
				{chosen && (
					<div className="flex items-center justify-between gap-[24px] border-border-raised border-t px-[18px] py-[14px]">
						<p className="max-w-[400px] text-muted type-label">{sentenceOf(chosen.finding)}</p>
						<button type="button" className="inline-flex h-[32px] shrink-0 items-center gap-[9px] rounded-[7px] bg-text px-[12px] text-bg type-control" onClick={() => onPick(chosen)}>
							{verbOf(chosen.finding)}
							<Kbd className="opacity-50">↵</Kbd>
						</button>
					</div>
				)}
				<div className="flex items-center justify-between border-border-raised border-t bg-bg px-[18px] py-[10px] text-muted type-caption">
					{host === "app" ? (
						<button type="button" className="hover:text-text" onClick={onClose}>
							Choose in Finder…
						</button>
					) : (
						<span>The folders listed are on the Mac spool runs on.</span>
					)}
					<span>Paste a GitHub link to clone it.</span>
				</div>
			</motion.div>
		</div>
	);
}
