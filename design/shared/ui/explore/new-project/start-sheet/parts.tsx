import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect } from "react";
import type { Place } from "shared/lib/explore/new-project/places";
import { cn } from "shared/lib/utils";
import { TeamMark } from "shared/ui/explore/cloud/home/parts";
import { CloseIcon, FolderIcon } from "shared/ui/spool/icons";

/** spool's entering curve; everything that arrives here wears it and stays under 300ms. */
export const EASE = [0.22, 0.61, 0.36, 1] as const;
export const ENTER = { duration: 0.18, ease: EASE };

export type Host = "app" | "web";

/** The layout id a sheet and the canvas it opens share: the sheet grows into the tab. */
export const BIRTH = "start-sheet-birth";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<kbd className={cn("inline-grid h-[18px] min-w-[18px] place-items-center rounded-[4px] border border-border-raised px-[4px] text-muted type-detail", className)}>
			{children}
		</kbd>
	);
}

/** A draft is a sheet of paper with a corner turned: spool keeps it, no folder of yours holds it. */
export function DraftGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" className={className} aria-hidden="true">
			<path d="M3.5 2.5h6l3 3v8h-9Z" />
			<path d="M9.5 2.5v3h3" />
		</svg>
	);
}

export function BranchGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className={className} aria-hidden="true">
			<circle cx="4.5" cy="3.5" r="1.5" />
			<circle cx="4.5" cy="12.5" r="1.5" />
			<circle cx="11.5" cy="5.5" r="1.5" />
			<path d="M4.5 5v6M11.5 7c0 2.5-3 3-6.4 4.6" />
		</svg>
	);
}

export function LinkGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className={className} aria-hidden="true">
			<path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.3-2.3a2.6 2.6 0 0 0-3.7-3.7l-.9.9" />
			<path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.2 9.1a2.6 2.6 0 0 0 3.7 3.7l.9-.9" />
		</svg>
	);
}

export function CloudGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" className={className} aria-hidden="true">
			<path d="M4.6 12.5a3 3 0 0 1-.3-6 4 4 0 0 1 7.6-.6 2.9 2.9 0 0 1 .3 5.8Z" />
			<path d="M8 7.5v4M6.3 9.9 8 11.6l1.7-1.7" />
		</svg>
	);
}

/** The glyph a place wears wherever it is named: a cover's foot, a segment, a path line. */
export function PlaceGlyph({ kind, className }: { kind: Place["kind"]; className?: string }) {
	if (kind === "team") return <TeamMark size={14} />;
	if (kind === "folder") return <FolderIcon className={cn("h-[13px] w-[13px]", className)} />;
	return <DraftGlyph className={cn("h-[13px] w-[13px]", className)} />;
}

/**
 * The sheet every door here opens: a scrim over Home and one panel settling from
 * just above, the shipped finder's gesture. `birth` names the panel for the move
 * into a project, where the same box grows to fill the canvas.
 */
export function Sheet({
	label,
	title,
	width = 560,
	onClose,
	children,
	birth,
}: {
	label: string;
	title: ReactNode;
	width?: number;
	onClose: () => void;
	children: ReactNode;
	birth?: string | undefined;
}) {
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, [onClose]);
	return (
		<motion.div
			className="absolute inset-0 z-30 flex items-start justify-center bg-[color-mix(in_srgb,var(--color-bg)_72%,transparent)] pt-[min(120px,13vh)]"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0, transition: { duration: 0.12 } }}
			transition={{ duration: 0.14, ease: "easeOut" }}
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<motion.section
				role="dialog"
				aria-label={label}
				{...(birth ? { layoutId: birth } : {})}
				className="relative overflow-hidden rounded-[12px] border border-border-raised bg-surface text-text"
				style={{ width, borderRadius: 12 }}
				initial={{ opacity: 0, y: -8 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
				transition={{ ...ENTER, layout: { duration: 0.26, ease: EASE } }}
			>
				<header className="flex h-[52px] items-center justify-between border-border-raised border-b pr-[14px] pl-[22px]">
					<h2 className="type-title">{title}</h2>
					<button type="button" onClick={onClose} className="flex items-center gap-[8px] rounded-[6px] px-[6px] py-[4px] text-muted hover:text-text" aria-label="Close">
						<Kbd>esc</Kbd>
						<CloseIcon className="h-[9px] w-[9px]" />
					</button>
				</header>
				{children}
			</motion.section>
		</motion.div>
	);
}

/** A line that swaps in place: the old words leave upward as the new ones rise in. */
export function Swap({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
	return (
		<span className={cn("relative block overflow-hidden", className)}>
			<AnimatePresence mode="popLayout" initial={false}>
				<motion.span
					key={id}
					className="block"
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -8 }}
					transition={{ duration: 0.17, ease: EASE }}
				>
					{children}
				</motion.span>
			</AnimatePresence>
		</span>
	);
}

/** The thin bar a clone or a fetch fills, in text colour: progress is not an alarm. */
export function Progress({ value }: { value: number }) {
	return (
		<span className="block h-[2px] w-full overflow-hidden rounded-full bg-border-raised">
			<span className="block h-full rounded-full bg-text transition-[width] duration-150 ease-linear" style={{ width: `${Math.round(value * 100)}%` }} />
		</span>
	);
}
