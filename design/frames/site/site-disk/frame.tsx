import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * site-disk. The "your disk" section of the spool.page canvas-as-navigation
 * site, and the calmest one: local-first, felt. The body is the demo. A live
 * file tree sits beside a git moment; on a slow loop a new frame folder is
 * written into the tree (its two files fade in under a thread gutter) and the
 * diff below syncs to name it. The point is made without a sentence: the files
 * are the medium. The back chip walks home to site-hub, and the heading block
 * carries viewTransitionName "site-disk-card" so the hub tile morphs into it.
 *
 * Motion is one slow two-beat timeline (phase 0 to 1) shared by both cards, so
 * the tree and the diff always agree. Card chrome never resizes: the tree grows
 * downward into its own reserved space, the diff crossfades in place, nothing
 * outside the cards moves.
 */

type Phase = 0 | 1;

const CHECKOUT = {
	hash: "8fe05e5",
	frame: "checkout",
	msg: "add checkout frame",
} as const;

const PRICING = {
	hash: "a1c3f90",
	frame: "pricing",
	msg: "add pricing frame",
} as const;

const CARD_H = 404;
const ROW_H = 24;
const EASE = [0.22, 1, 0.36, 1] as const;

function ChevronGlyph({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-2.5 w-2.5 shrink-0", className)}
			style={{ transform: "rotate(90deg)" }}
		>
			<path
				d="m4 2.5 3.5 3.5L4 9.5"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function FileGlyph({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 14 14"
			fill="none"
			aria-hidden="true"
			className={cn("h-3.5 w-3.5 shrink-0", className)}
		>
			<path
				d="M3 1.75h5l3 3v7.5H3z"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
			<path
				d="M8 1.75v3h3"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function LockGlyph({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-3 w-3 shrink-0", className)}
		>
			<rect
				x="2.5"
				y="5.25"
				width="7"
				height="4.75"
				rx="1"
				stroke="currentColor"
				strokeWidth="1"
			/>
			<path
				d="M3.9 5.25V4.1a2.1 2.1 0 0 1 4.2 0v1.15"
				stroke="currentColor"
				strokeWidth="1"
			/>
		</svg>
	);
}

function GitGlyph({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			aria-hidden="true"
			className={cn("h-3.5 w-3.5 shrink-0", className)}
		>
			<circle cx="8" cy="3.6" r="1.6" stroke="currentColor" strokeWidth="1.1" />
			<circle
				cx="8"
				cy="12.4"
				r="1.6"
				stroke="currentColor"
				strokeWidth="1.1"
			/>
			<path d="M8 5.3v5.4" stroke="currentColor" strokeWidth="1.1" />
		</svg>
	);
}

/** A filename with its extension a shade dimmer: the small detail that reads. */
function FileName({ name }: { name: string }) {
	const dot = name.lastIndexOf(".");
	if (dot <= 0) return <>{name}</>;
	return (
		<>
			{name.slice(0, dot)}
			<span className="opacity-60">{name.slice(dot)}</span>
		</>
	);
}

type RowKind = "folder" | "file" | "locked";

function Row({
	depth,
	kind,
	name,
	accent,
}: {
	depth: number;
	kind: RowKind;
	name: string;
	accent?: boolean;
}) {
	const isFolder = kind === "folder";
	const isLocked = kind === "locked";
	return (
		<div
			className="relative flex items-center gap-1.5 font-mono text-[13px]"
			style={{ height: ROW_H, paddingLeft: 12 + depth * 16 }}
		>
			<span className="flex w-4 shrink-0 items-center justify-center">
				{isFolder ? (
					<ChevronGlyph className={accent ? "text-thread" : "text-muted"} />
				) : (
					<FileGlyph
						className={cn("text-muted", isLocked ? "opacity-45" : "opacity-80")}
					/>
				)}
			</span>
			<span
				className={cn(
					"min-w-0 truncate",
					isFolder
						? accent
							? "text-thread"
							: "text-text"
						: "text-muted",
					isLocked && "opacity-45",
				)}
			>
				{isFolder ? name : <FileName name={name} />}
			</span>
			{isLocked ? (
				<LockGlyph className="ml-1.5 text-muted opacity-45" />
			) : null}
		</div>
	);
}

function TreeCard({ phase }: { phase: Phase }) {
	const frameCount = phase === 1 ? 3 : 2;
	return (
		<div
			className="flex flex-col rounded-lg border border-border bg-canvas p-5"
			style={{ height: CARD_H }}
		>
			<div className="flex flex-col">
				<Row depth={0} kind="folder" name="design/" />
				<Row depth={1} kind="locked" name="canvas.json" />
				<Row depth={1} kind="folder" name="frames/" />
				<Row depth={2} kind="folder" name="landing/" />
				<Row depth={3} kind="file" name="frame.tsx" />
				<Row depth={3} kind="file" name="frame.json" />
				<Row depth={2} kind="folder" name="checkout/" />
				<Row depth={3} kind="file" name="frame.tsx" />
				<Row depth={3} kind="file" name="frame.json" />
				<AnimatePresence initial={false}>
					{phase === 1 ? (
						<motion.div
							key="new-frame"
							className="relative overflow-hidden"
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.7, ease: EASE }}
						>
							<span className="absolute bottom-[4px] left-[38px] top-[4px] w-[2px] rounded-full bg-thread" />
							<Row depth={2} kind="folder" name="pricing/" accent />
							<Row depth={3} kind="file" name="frame.tsx" />
							<Row depth={3} kind="file" name="frame.json" />
						</motion.div>
					) : null}
				</AnimatePresence>
				<Row depth={1} kind="folder" name="shared/" />
				<Row depth={2} kind="file" name="tokens.css" />
			</div>

			<div className="mt-auto flex items-center justify-between border-border border-t pt-3 font-mono text-2xs text-muted">
				<span>on disk</span>
				<span>{frameCount} frames</span>
			</div>
		</div>
	);
}

function LogLine({
	hash,
	msg,
	time,
}: {
	hash: string;
	msg: string;
	time: string;
}) {
	return (
		<div className="flex items-center gap-3 font-mono text-xs">
			<span className="text-muted opacity-55">{hash}</span>
			<span className="min-w-0 flex-1 truncate text-muted">{msg}</span>
			<span className="shrink-0 text-muted opacity-55">{time}</span>
		</div>
	);
}

function GitCard({ phase }: { phase: Phase }) {
	const c = phase === 1 ? PRICING : CHECKOUT;
	return (
		<div
			className="flex flex-col rounded-lg border border-border bg-canvas p-5"
			style={{ height: CARD_H }}
		>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 font-mono text-xs text-muted">
					<span className="inline-block h-1.5 w-1.5 rounded-full bg-muted/70" />
					main
				</div>
				<GitGlyph className="text-muted/50" />
			</div>

			{/* the write that just landed */}
			<div className="relative mt-5 h-[128px]">
				<AnimatePresence initial={false}>
					<motion.div
						key={phase}
						className="absolute inset-0"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.5, ease: "easeInOut" }}
					>
						<div className="flex items-center justify-between font-mono text-2xs text-muted">
							<span>commit {c.hash}</span>
							<span>just now</span>
						</div>
						<div className="mt-3 rounded-md border-thread/50 border-l-2 bg-thread/[0.05] px-3 py-2.5 font-mono text-[13px] text-text leading-[22px]">
							<div className="truncate">
								<span className="mr-1.5 text-thread">+</span>
								frames/{c.frame}/frame.tsx
							</div>
							<div className="truncate">
								<span className="mr-1.5 text-thread">+</span>
								frames/{c.frame}/frame.json
							</div>
						</div>
						<div className="mt-3 text-[15px] text-text leading-[22px]">
							{c.msg}
						</div>
					</motion.div>
				</AnimatePresence>
			</div>

			{/* the rest of the history, all on disk */}
			<div className="mt-auto space-y-2.5 border-border border-t pt-4">
				<LogLine hash="8f2a1c" msg="add cart frame" time="2m" />
				<LogLine hash="3c9d4e" msg="add menu frame" time="6m" />
				<LogLine hash="a71b02" msg="scaffold design/" time="14m" />
			</div>
		</div>
	);
}

function BackChip() {
	return (
		<button
			type="button"
			data-go="site-hub"
			className="group inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface/40 px-3 py-1.5 font-mono text-muted text-xs transition-colors hover:border-thread/40 hover:bg-thread/[0.06] hover:text-text"
		>
			<span
				aria-hidden="true"
				className="text-muted transition-colors group-hover:text-thread"
			>
				←
			</span>
			canvas
		</button>
	);
}

export default function SiteDisk() {
	const [phase, setPhase] = useState<Phase>(0);
	const reduce = useReducedMotion();

	useEffect(() => {
		if (reduce) return;
		const id = window.setInterval(() => {
			setPhase((p) => (p === 0 ? 1 : 0));
		}, 4200);
		return () => window.clearInterval(id);
	}, [reduce]);

	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased">
			<div className="flex h-full flex-col px-24 py-14">
				{/* masthead */}
				<header className="flex items-center justify-between border-border border-b pb-5">
					<BackChip />
					<div className="flex items-center gap-2.5 font-mono text-muted text-xs">
						<SpoolMark className="h-3.5 w-3.5 text-muted" title="spool" />
						<span>spool.page</span>
					</div>
				</header>

				{/* the statement, centered beside the living demo */}
				<main className="grid flex-1 grid-cols-[1fr_auto] items-center gap-16">
					<div style={{ viewTransitionName: "site-disk-card" }}>
						<h1 className="font-semibold text-[72px] leading-[0.96] tracking-[-0.03em]">
							your disk
						</h1>
						<p className="mt-6 max-w-[348px] text-[19px] text-muted leading-[28px]">
							plain files inside your repo. git-friendly. no cloud, no accounts.
						</p>
					</div>

					<div className="grid grid-cols-[460px_300px] gap-6">
						<TreeCard phase={phase} />
						<GitCard phase={phase} />
					</div>
				</main>

				{/* the model, as fine print */}
				<footer className="flex items-center justify-between border-border border-t pt-5 font-mono text-muted text-xs">
					<span>your agent writes files. spool renders them.</span>
					<span>delete the folder, the frame is gone. that is the whole model.</span>
				</footer>
			</div>
		</div>
	);
}
