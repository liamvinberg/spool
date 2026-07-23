import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * landing--fourthwall
 * The site is the product demo. Rest state is a condensed spool.page landing.
 * Click the trigger and the whole page springs down into a single frame on
 * spool's own canvas, ringed thread, surrounded by ghosts of the ten real
 * variants it graduated from. A walked arrow runs from landing--thread-heroinstall
 * (the winner) into the live frame. Clicking the frame springs it back.
 *
 * One wrapper carries the landing; the zoom is transform-only (scale + translate)
 * on that wrapper so it holds 60fps. The canvas, ghosts, arrow and chrome live
 * behind it and fade in. Continuous motion is transform/opacity only.
 */

const LIVE = { x: 548, y: 333, w: 456, h: 285 };
const SCALE = LIVE.w / 1440;
const SPRING = { type: "spring", stiffness: 210, damping: 30, mass: 1 } as const;
const FADE = { duration: 0.4, ease: [0.22, 1, 0.36, 1] } as const;

const dotGrid: React.CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 9%, transparent) 1px, transparent 1px)",
	backgroundSize: "30px 30px",
	backgroundPosition: "-1px -1px",
};

const liveSpine: React.CSSProperties = {
	background:
		"linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--color-thread) 55%, transparent) 4%, color-mix(in srgb, var(--color-thread) 55%, transparent) 96%, transparent 100%)",
};
const ghostSpine: React.CSSProperties = {
	background:
		"linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-thread) 42%, transparent) 15%, color-mix(in srgb, var(--color-thread) 42%, transparent) 85%, transparent)",
};
const ghostSpineHard: React.CSSProperties = {
	background: "color-mix(in srgb, var(--color-thread) 42%, transparent)",
};

const layerV = {
	rest: { transition: { staggerChildren: 0.015, staggerDirection: -1 } },
	canvas: { transition: { staggerChildren: 0.028, delayChildren: 0.03 } },
};
const ghostV = {
	rest: { opacity: 0, y: 8, transition: FADE },
	canvas: { opacity: 1, y: 0, transition: FADE },
};

type Mode = "rest" | "canvas";

/* ---------- copy-to-clipboard, from the canonical landing ---------- */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const ta = document.createElement("textarea");
			ta.value = text;
			ta.setAttribute("readonly", "");
			ta.style.position = "fixed";
			ta.style.top = "0";
			ta.style.left = "0";
			ta.style.width = "1px";
			ta.style.height = "1px";
			ta.style.padding = "0";
			ta.style.border = "none";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			ta.setSelectionRange(0, text.length);
			const ok = document.execCommand("copy");
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
	}
}

function Tick({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-3 w-3 shrink-0", className)}
		>
			<path
				d="M2.5 6.5 5 8.75 9.5 3.5"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CopyGlyph({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-3 w-3 shrink-0", className)}
		>
			<rect
				x="4.25"
				y="4.25"
				width="6"
				height="6"
				rx="1"
				stroke="currentColor"
				strokeWidth="1.2"
			/>
			<path
				d="M2.75 7.75h-.5a.75.75 0 0 1-.75-.75V2.25a.75.75 0 0 1 .75-.75H7a.75.75 0 0 1 .75.75v.5"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function CommandLine({ command }: { command: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	async function handleCopy() {
		const ok = await copyText(command);
		if (!ok) return;
		setCopied(true);
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 1500);
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-label={copied ? `copied ${command}` : `copy ${command}`}
			className="group block w-full cursor-pointer text-left focus-visible:outline-none"
		>
			<span className="inline-flex w-[2ch] select-none items-center align-middle">
				{copied ? (
					<Tick className="text-thread" />
				) : (
					<>
						<span className="text-muted group-hover:hidden group-focus-visible:hidden">
							$
						</span>
						<CopyGlyph className="hidden text-thread group-hover:block group-focus-visible:block" />
					</>
				)}
			</span>
			{command}
		</button>
	);
}

/* ---------- shared marks ---------- */

function Node({ className }: { className?: string }) {
	return (
		<span className={cn("absolute block h-[9px] w-[9px]", className)}>
			<span className="absolute -inset-[5px] rounded-full border border-thread/25" />
			<span className="absolute inset-0 rounded-full border-[3px] border-bg bg-thread" />
		</span>
	);
}

/** the trigger's beacon: a frame (solid) sitting on a canvas (dashed) */
function FrameGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
			<rect
				x="1"
				y="1.5"
				width="14"
				height="13"
				rx="2"
				stroke="currentColor"
				strokeWidth="1"
				strokeDasharray="2 2"
				opacity="0.5"
			/>
			<rect
				x="5"
				y="5.5"
				width="7.5"
				height="6"
				rx="1"
				stroke="currentColor"
				strokeWidth="1.3"
			/>
		</svg>
	);
}

function ArrowOut({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M3.5 8.5 8.5 3.5M4.5 3.5h4v4"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/* ---------- the rest-state landing (also the live frame's content) ---------- */

function TriggerLine({ onReveal }: { onReveal: () => void }) {
	return (
		<button
			type="button"
			onClick={onReveal}
			className="group inline-flex items-center gap-2.5 font-mono text-sm text-muted transition-colors duration-200 hover:text-text focus-visible:text-text focus-visible:outline-none"
		>
			<motion.span
				className="text-thread"
				animate={{ opacity: [0.55, 1, 0.55] }}
				transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
			>
				<FrameGlyph className="h-3.5 w-3.5" />
			</motion.span>
			<span className="relative">
				this page is a frame. see the canvas it came from
				<span className="absolute -bottom-1 left-0 h-px w-0 bg-thread transition-all duration-300 ease-out group-hover:w-full group-focus-visible:w-full" />
			</span>
			<ArrowOut className="h-3 w-3 -translate-x-1.5 text-thread opacity-0 transition-all duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100" />
		</button>
	);
}

function LandingContent({ onReveal }: { onReveal: () => void }) {
	return (
		<div className="relative flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{/* thread spine + travelling pulse (transform only) */}
			<div className="absolute inset-y-0 left-[200px] w-px" style={liveSpine}>
				<motion.span
					className="absolute left-1/2 block h-24 w-[7px] -translate-x-1/2 rounded-full"
					style={{
						top: 0,
						background:
							"linear-gradient(to bottom, transparent, var(--color-thread), transparent)",
					}}
					animate={{ y: [-140, 980] }}
					transition={{ duration: 8.5, repeat: Infinity, ease: "easeInOut" }}
				/>
			</div>

			<div className="relative flex h-full flex-col pl-[320px] pr-[112px]">
				{/* header */}
				<header className="flex shrink-0 items-center justify-between py-9">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-5 w-5 text-thread" title="spool" />
						<span className="text-md font-semibold tracking-tight">spool</span>
					</div>
					<div className="flex items-center gap-6 font-mono text-xs text-muted">
						<span>spool.page</span>
						<span className="text-text">github.com/liamvinberg/spool</span>
					</div>
				</header>

				{/* hero */}
				<main className="flex flex-1 flex-col justify-center">
					<section className="relative grid grid-cols-[1fr_auto] items-center gap-12">
						<div className="max-w-[560px]">
							<Node className="-left-[124px] top-[9px]" />
							<h1 className="text-[66px] font-semibold leading-[0.98] tracking-[-0.02em]">
								feel an app
								<br />
								before it exists
							</h1>
							<p className="mt-6 max-w-[452px] text-[17px] leading-[26px] text-muted">
								a live prototyping canvas. your agent authors live tsx frames on
								an infinite canvas and links them into walkable flows. you feel
								the real thing, interactions and motion and inputs, before it
								exists.
							</p>

							<div className="mt-9">
								<div className="flex gap-5">
									<span className="w-px shrink-0 self-stretch bg-thread/70" />
									<div className="w-[320px] font-mono text-[15px] leading-[30px]">
										<CommandLine command="npm i -g spool.page" />
										<CommandLine command="spool init" />
										<CommandLine command="spool serve" />
									</div>
								</div>
								<div className="mt-5 pl-[25px] font-mono text-xs text-muted">
									requires node 22+ · best in chrome · macos-first today
								</div>
							</div>
						</div>

						<motion.div
							className="relative w-[236px] shrink-0"
							animate={{ y: [0, -14, 0] }}
							transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
						>
							<SpoolMark className="w-full text-thread" title="spool ribbon" />
						</motion.div>
					</section>

					{/* the fourth-wall trigger, hung off the thread as its own node */}
					<div className="relative mt-14">
						<Node className="-left-[124px] top-1/2 -translate-y-1/2" />
						<TriggerLine onReveal={onReveal} />
					</div>
				</main>

				{/* footer */}
				<footer className="flex shrink-0 items-center justify-between border-t border-border py-7">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-4 w-4 text-thread" />
						<span className="text-sm text-muted">spool.page</span>
					</div>
					<span className="font-mono text-xs text-muted">
						github.com/liamvinberg/spool
					</span>
				</footer>
			</div>
		</div>
	);
}

/* ---------- ghost wireframes: one faithful silhouette per real variant ---------- */

function Bar({ w, className }: { w: string; className?: string }) {
	return (
		<div
			className={cn("h-[3px] rounded-full bg-border-raised", className)}
			style={{ width: w }}
		/>
	);
}

function GThread() {
	return (
		<div className="relative h-full w-full">
			<div className="absolute inset-y-1.5 left-[24%] w-px" style={ghostSpineHard} />
			{[16, 50, 84].map((t) => (
				<span
					key={t}
					className="absolute left-[24%] block h-1 w-1 -translate-x-1/2 rounded-full bg-thread/50 ring-2 ring-surface"
					style={{ top: `${t}%` }}
				/>
			))}
			<div className="absolute left-[34%] top-[26%]">
				<div className="flex flex-col gap-2">
					<div className="h-2.5 w-[86px] rounded-sm bg-raised" />
					<div className="h-2.5 w-[66px] rounded-sm bg-raised" />
				</div>
				<div className="mt-3.5 flex flex-col gap-1.5">
					<Bar w="78px" />
					<Bar w="58px" />
				</div>
			</div>
			<SpoolMark className="absolute right-2.5 top-1/2 h-8 w-8 -translate-y-1/2 text-thread/35" />
		</div>
	);
}

function GRefined() {
	return (
		<div className="relative h-full w-full">
			<div className="absolute inset-y-0 left-[24%] w-px" style={ghostSpine} />
			{[18, 50, 82].map((t) => (
				<span
					key={t}
					className="absolute left-[24%] block h-1 w-1 -translate-x-1/2 rounded-full bg-thread/50"
					style={{ top: `${t}%` }}
				>
					<span className="absolute -inset-[3px] rounded-full border border-thread/25" />
				</span>
			))}
			<div className="absolute left-[34%] top-[26%]">
				<div className="flex flex-col gap-2">
					<div className="h-2.5 w-[86px] rounded-sm bg-raised" />
					<div className="h-2.5 w-[66px] rounded-sm bg-raised" />
				</div>
				<div className="mt-3.5 flex flex-col gap-1.5">
					<Bar w="78px" />
					<Bar w="58px" />
				</div>
			</div>
			<SpoolMark className="absolute right-2.5 top-1/2 h-8 w-8 -translate-y-1/2 text-thread/30" />
		</div>
	);
}

function GUnspool() {
	return (
		<div className="relative h-full w-full">
			<SpoolMark className="absolute left-2 top-2 h-7 w-7 text-thread/45" />
			<div className="absolute left-[16%] top-[42%] bottom-1.5 w-px" style={ghostSpine} />
			<span className="absolute left-[16%] top-[42%] block h-1 w-1 -translate-x-1/2 rounded-full bg-thread/60" />
			<div className="absolute left-[34%] top-[30%]">
				<div className="flex flex-col gap-2">
					<div className="h-2.5 w-[92px] rounded-sm bg-raised" />
					<div className="h-2.5 w-[70px] rounded-sm bg-raised" />
				</div>
				<div className="mt-3.5 flex flex-col gap-1.5">
					<Bar w="80px" />
					<Bar w="60px" />
					<Bar w="48px" />
				</div>
			</div>
		</div>
	);
}

function GCenter() {
	return (
		<div className="relative h-full w-full">
			<div className="absolute inset-y-1.5 left-1/2 w-px -translate-x-1/2" style={ghostSpine} />
			<div className="mx-auto flex w-[70%] flex-col items-center gap-1.5 pt-1.5">
				<div className="h-2 w-[64%] rounded-sm bg-raised" />
				<div className="h-2 w-[44%] rounded-sm bg-raised" />
			</div>
			{[40, 60, 80].map((t, i) => (
				<div key={t}>
					<span
						className="absolute left-1/2 block h-1 w-1 -translate-x-1/2 rounded-full bg-thread/50 ring-2 ring-surface"
						style={{ top: `${t}%` }}
					/>
					<div
						className={cn(
							"absolute w-[30%] space-y-1",
							i % 2 === 0 ? "right-[54%] text-right" : "left-[54%]",
						)}
						style={{ top: `${t - 6}%` }}
					>
						<Bar w="100%" className={i % 2 === 0 ? "ml-auto" : ""} />
						<Bar w="70%" className={i % 2 === 0 ? "ml-auto" : ""} />
					</div>
				</div>
			))}
		</div>
	);
}

function GDense() {
	return (
		<div className="flex h-full w-full flex-col">
			<div className="flex items-start justify-between">
				<div className="space-y-1.5">
					<div className="h-2.5 w-[70px] rounded-sm bg-raised" />
					<div className="h-2.5 w-[52px] rounded-sm bg-raised" />
				</div>
				<div className="flex gap-2 pt-0.5">
					<span className="w-px shrink-0 self-stretch bg-thread/60" />
					<div className="space-y-1">
						<Bar w="46px" />
						<Bar w="34px" />
						<Bar w="40px" />
					</div>
				</div>
			</div>
			<div className="mt-auto grid grid-cols-4 gap-1.5 border-t border-border pt-2.5">
				{[0, 1, 2, 3].map((i) => (
					<div key={i} className="space-y-1">
						<span className="block h-1 w-1 rounded-full bg-thread/50" />
						<Bar w="90%" />
						<Bar w="70%" />
					</div>
				))}
			</div>
			<div className="mt-2 h-px w-full bg-border" />
		</div>
	);
}

function GHeroInstall() {
	return (
		<div className="relative h-full w-full">
			<div className="absolute inset-y-0 left-[22%] w-px" style={ghostSpine} />
			<span className="absolute left-[22%] top-[24%] block h-1 w-1 -translate-x-1/2 rounded-full bg-thread/60">
				<span className="absolute -inset-[3px] rounded-full border border-thread/25" />
			</span>
			<div className="absolute left-[32%] right-3 top-[20%]">
				<div className="space-y-2">
					<div className="h-2.5 w-[80%] rounded-sm bg-raised" />
					<div className="h-2.5 w-[62%] rounded-sm bg-raised" />
				</div>
				<div className="mt-3.5 flex gap-2">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div className="flex-1 space-y-[5px]">
						<Bar w="88%" className="bg-raised" />
						<Bar w="58%" className="bg-raised" />
						<div className="flex items-center gap-1">
							<Tick className="h-2 w-2 text-thread" />
							<Bar w="46%" className="bg-raised" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function GTerminal() {
	return (
		<div className="flex h-full w-full flex-col">
			<div className="h-px w-full bg-border" />
			<div className="flex flex-1 flex-col items-center justify-center gap-2.5">
				<div className="flex flex-col items-center gap-1">
					<div className="h-2.5 w-[70px] rounded-sm bg-raised" />
					<Bar w="90px" />
				</div>
				<div className="w-[74%] rounded-[3px] border border-border bg-canvas p-2">
					<div className="space-y-1.5">
						<div className="flex items-center gap-1.5">
							<span className="text-[7px] leading-none text-muted">$</span>
							<Bar w="60%" />
						</div>
						<div className="flex items-center gap-1.5">
							<span className="text-[7px] leading-none text-muted">$</span>
							<Bar w="42%" />
							<span className="block h-2 w-[3px] bg-thread" />
						</div>
					</div>
				</div>
			</div>
			<div className="h-px w-full bg-border" />
		</div>
	);
}

function GEditorial() {
	return (
		<div className="flex h-full w-full flex-col">
			<div className="space-y-1.5">
				<div className="h-3 w-[84%] rounded-sm bg-raised" />
				<div className="h-3 w-[62%] rounded-sm bg-raised" />
				<div className="h-3 w-[74%] rounded-sm bg-raised" />
			</div>
			<div className="my-2.5 h-px w-full bg-border" />
			<div className="mt-auto grid grid-cols-4 gap-2">
				{[0, 1, 2, 3].map((i) => (
					<div key={i} className="space-y-1 border-l border-border pl-1.5 first:border-l-0 first:pl-0">
						<span className="block h-1 w-1 rounded-full bg-thread/60" />
						<Bar w="90%" />
						<Bar w="66%" />
					</div>
				))}
			</div>
		</div>
	);
}

function MiniScreen({ active }: { active?: boolean }) {
	return (
		<div
			className={cn(
				"h-[52px] w-[34px] shrink-0 overflow-hidden rounded-[2px] border",
				active ? "border-thread/60 bg-surface" : "border-border bg-canvas",
			)}
		>
			<div className="space-y-1 p-1">
				<Bar w="80%" className="bg-raised" />
				<Bar w="60%" className="bg-raised" />
				<div className="mt-1.5 h-2 w-full rounded-[1px] bg-raised" />
			</div>
		</div>
	);
}

function MiniArrow() {
	return (
		<svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true">
			<path d="M0 4h9" stroke="var(--color-thread)" strokeWidth="1" strokeOpacity="0.6" />
			<path
				d="M7.5 1.5 10.5 4 7.5 6.5"
				stroke="var(--color-thread)"
				strokeWidth="1"
				strokeOpacity="0.6"
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
			/>
		</svg>
	);
}

function GFlow() {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-2.5">
			<div className="flex items-center gap-1">
				<MiniScreen active />
				<MiniArrow />
				<MiniScreen />
				<MiniArrow />
				<MiniScreen />
			</div>
			<div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1">
				<svg width="7" height="7" viewBox="0 0 8 8" aria-hidden="true">
					<path d="M2 1.5 6.5 4 2 6.5Z" fill="var(--color-thread)" />
				</svg>
				<Bar w="34px" />
			</div>
		</div>
	);
}

function GCanvasMini() {
	return (
		<div className="relative h-full w-full overflow-hidden rounded-[2px]" style={dotGrid}>
			<div className="absolute left-[10%] top-[16%] w-[42%] rounded-[2px] border border-thread/50 bg-surface p-1.5">
				<div className="space-y-1">
					<div className="h-2 w-[70%] rounded-[1px] bg-raised" />
					<Bar w="90%" className="bg-raised" />
					<Bar w="60%" className="bg-raised" />
				</div>
			</div>
			<div className="absolute right-[10%] top-[20%] w-[30%] space-y-1 rounded-[2px] border border-border bg-canvas p-1.5">
				<Bar w="80%" className="bg-raised" />
				<Bar w="55%" className="bg-raised" />
			</div>
			<div className="absolute right-[12%] bottom-[16%] w-[26%] space-y-1 rounded-[2px] border border-border bg-canvas p-1.5">
				<Bar w="70%" className="bg-raised" />
			</div>
			<svg
				className="absolute inset-0 h-full w-full"
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				<path
					d="M62 40 C 74 46, 74 58, 70 66"
					stroke="var(--color-thread)"
					strokeWidth="0.8"
					strokeOpacity="0.55"
					strokeDasharray="3 3"
					fill="none"
				/>
			</svg>
		</div>
	);
}

/* ---------- ghost frame wrapper + placement ---------- */

interface Spec {
	name: string;
	x: number;
	y: number;
	w: number;
	h: number;
	C: () => React.ReactNode;
	winner?: boolean;
}

const GHOSTS: Spec[] = [
	{ name: "landing--thread", x: 78, y: 104, w: 196, h: 122, C: GThread },
	{ name: "landing--thread-refined", x: 300, y: 86, w: 196, h: 122, C: GRefined },
	{ name: "landing--thread-unspool", x: 520, y: 116, w: 190, h: 128, C: GUnspool },
	{ name: "landing--editorial", x: 902, y: 98, w: 200, h: 124, C: GEditorial },
	{ name: "landing--terminal", x: 1146, y: 110, w: 196, h: 124, C: GTerminal },
	{ name: "landing--thread-heroinstall", x: 250, y: 388, w: 210, h: 134, C: GHeroInstall, winner: true },
	{ name: "landing--canvas", x: 1122, y: 410, w: 196, h: 122, C: GCanvasMini },
	{ name: "landing--thread-center", x: 150, y: 648, w: 196, h: 124, C: GCenter },
	{ name: "landing--thread-dense", x: 416, y: 678, w: 200, h: 120, C: GDense },
	{ name: "landing--flow", x: 724, y: 672, w: 252, h: 118, C: GFlow },
];

function Ghost({ spec, onHover }: { spec: Spec; onHover?: (hot: boolean) => void }) {
	const { name, x, y, w, h, C, winner } = spec;
	return (
		<motion.div
			variants={ghostV}
			className="group absolute"
			style={{ left: x, top: y }}
			onPointerEnter={onHover ? () => onHover(true) : undefined}
			onPointerLeave={onHover ? () => onHover(false) : undefined}
		>
			<div
				className={cn(
					"mb-1.5 flex items-center gap-1 font-mono text-[10px] leading-none transition-all duration-200 ease-out group-hover:-translate-y-0.5",
					winner ? "text-thread" : "text-muted group-hover:text-text",
				)}
			>
				<span className="text-[8px] opacity-60">▸</span>
				<span>{name}</span>
			</div>
			<div
				className={cn(
					"relative overflow-hidden rounded-[4px] border bg-surface transition-colors duration-200",
					winner
						? "border-border-raised group-hover:border-thread/50"
						: "border-border group-hover:border-border-raised",
				)}
				style={{ width: w, height: h }}
			>
				<div className="absolute inset-0 p-2.5">
					<C />
				</div>
			</div>
		</motion.div>
	);
}

/* ---------- the walked arrow: heroinstall graduated into the live frame ---------- */

const ARROW_A = { x: 460, y: 471 };
const ARROW_B = { x: 545, y: 475 };
const ARROW_D = `M ${ARROW_A.x} ${ARROW_A.y} C 498 471, 512 475, ${ARROW_B.x} ${ARROW_B.y}`;

const arrowLineV = {
	rest: { pathLength: 0, opacity: 0, transition: { duration: 0.3 } },
	canvas: { pathLength: 1, opacity: 0.9, transition: { duration: 0.5, delay: 0.28 } },
	hot: { pathLength: 1, opacity: 1, transition: { duration: 0.2 } },
};
const arrowGlowV = {
	rest: { opacity: 0 },
	canvas: { opacity: 0.16, transition: { delay: 0.28 } },
	hot: { opacity: 0.34 },
};
const arrowHeadV = {
	rest: { opacity: 0 },
	canvas: { opacity: 0.9, transition: { delay: 0.66 } },
	hot: { opacity: 1 },
};

function GraduationArrow({ state }: { state: string }) {
	return (
		<>
			<motion.svg
				className="pointer-events-none absolute inset-0 z-10 h-full w-full"
				viewBox="0 0 1440 900"
				fill="none"
				initial={false}
				animate={state}
			>
				<motion.path
					d={ARROW_D}
					stroke="var(--color-thread)"
					strokeWidth="5"
					strokeLinecap="round"
					variants={arrowGlowV}
				/>
				<motion.path
					d={ARROW_D}
					stroke="var(--color-thread)"
					strokeWidth="1.5"
					strokeLinecap="round"
					variants={arrowLineV}
				/>
				<motion.path
					d={`M ${ARROW_B.x - 6} ${ARROW_B.y - 4} L ${ARROW_B.x} ${ARROW_B.y} L ${ARROW_B.x - 6} ${ARROW_B.y + 4}`}
					stroke="var(--color-thread)"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					variants={arrowHeadV}
				/>
			</motion.svg>
			{/* the walk: a faint pulse flowing along the graduated edge (transform + opacity) */}
			{state !== "rest" ? (
				<motion.span
					className="pointer-events-none absolute z-10 block h-1.5 w-1.5 rounded-full bg-thread"
					style={{
						left: ARROW_A.x - 3,
						top: ARROW_A.y - 3,
						boxShadow: "0 0 6px 1px color-mix(in srgb, var(--color-thread) 70%, transparent)",
					}}
					animate={{
						x: [0, ARROW_B.x - ARROW_A.x],
						y: [0, ARROW_B.y - ARROW_A.y],
						opacity: [0, 0, 1, 1, 0],
					}}
					transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.7 }}
				/>
			) : null}
		</>
	);
}

/* ---------- the live frame's canvas chrome: name tab, ring, handles, size chip ---------- */

function LiveChrome({ mode, onBack }: { mode: Mode; onBack: () => void }) {
	const ringL = LIVE.x - 3;
	const ringT = LIVE.y - 3;
	const ringW = LIVE.w + 6;
	const ringH = LIVE.h + 6;
	const corners = [
		{ left: ringL - 4, top: ringT - 4 },
		{ left: ringL + ringW - 4, top: ringT - 4 },
		{ left: ringL - 4, top: ringT + ringH - 4 },
		{ left: ringL + ringW - 4, top: ringT + ringH - 4 },
	];
	return (
		<motion.div
			className="absolute inset-0 z-30"
			style={{ pointerEvents: "none" }}
			initial={false}
			animate={{ opacity: mode === "canvas" ? 1 : 0 }}
			transition={FADE}
		>
			{/* name tab */}
			<div
				className="absolute flex items-center gap-1.5 font-mono text-xs leading-none text-thread"
				style={{ left: LIVE.x, top: LIVE.y - 22 }}
			>
				<span>landing</span>
			</div>
			{/* selection ring */}
			<div
				className="absolute rounded-[13px] border-[1.5px] border-thread"
				style={{ left: ringL, top: ringT, width: ringW, height: ringH }}
			/>
			{corners.map((c) => (
				<span
					key={`${c.left}-${c.top}`}
					className="absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread"
					style={{ left: c.left, top: c.top }}
				/>
			))}
			{/* size chip */}
			<div
				className="absolute rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs leading-none text-on-thread"
				style={{ left: LIVE.x + LIVE.w / 2 - 30, top: LIVE.y + LIVE.h - 4 }}
			>
				1440 × 900
			</div>
			{/* click target: springs back to full */}
			<button
				type="button"
				onClick={onBack}
				aria-label="return to the page"
				className="group absolute cursor-pointer rounded-[12px] focus-visible:outline-none"
				style={{
					left: LIVE.x,
					top: LIVE.y,
					width: LIVE.w,
					height: LIVE.h,
					pointerEvents: mode === "canvas" ? "auto" : "none",
				}}
			>
				<span className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
					<span className="inline-flex items-center gap-1.5 rounded-full border border-border-raised bg-bg/85 px-3 py-1.5 font-mono text-2xs text-muted">
						<ArrowOut className="h-2.5 w-2.5 rotate-180 text-thread" />
						back to the page
					</span>
				</span>
			</button>
		</motion.div>
	);
}

/* ---------- caption ---------- */

function Caption() {
	return (
		<motion.div
			variants={ghostV}
			className="absolute z-10 text-right font-mono"
			style={{ left: 1030, top: 656, width: 296 }}
		>
			<div className="text-xs text-muted">ten variants on one canvas.</div>
			<div className="mt-1.5 flex items-center justify-end gap-1.5 text-sm text-text">
				<Tick className="text-thread" />
				<span>this one won.</span>
			</div>
		</motion.div>
	);
}

/* ---------- orchestrator ---------- */

export default function Fourthwall() {
	const [mode, setMode] = useState<Mode>("rest");
	const [arrowHot, setArrowHot] = useState(false);

	const arrowState = mode === "canvas" ? (arrowHot ? "hot" : "canvas") : "rest";

	return (
		<div
			className="relative h-full w-full overflow-hidden bg-canvas font-sans text-text antialiased [font-synthesis:none]"
			style={dotGrid}
		>
			{/* canvas layer: ghosts + caption assemble in */}
			<motion.div
				className="absolute inset-0 z-10"
				variants={layerV}
				initial={false}
				animate={mode}
			>
				{GHOSTS.map((spec) => (
					<Ghost
						key={spec.name}
						spec={spec}
						onHover={spec.winner ? setArrowHot : undefined}
					/>
				))}
				<Caption />
			</motion.div>

			<GraduationArrow state={arrowState} />

			{/* the landing: one wrapper, transform-only zoom */}
			<motion.div
				className="absolute inset-0 z-20 origin-top-left overflow-hidden [will-change:transform]"
				style={{ pointerEvents: mode === "canvas" ? "none" : "auto" }}
				initial={false}
				animate={
					mode === "canvas"
						? { scale: SCALE, x: LIVE.x, y: LIVE.y, borderRadius: 40 }
						: { scale: 1, x: 0, y: 0, borderRadius: 0 }
				}
				transition={SPRING}
			>
				<LandingContent onReveal={() => setMode("canvas")} />
			</motion.div>

			<LiveChrome
				mode={mode}
				onBack={() => {
					setMode("rest");
					setArrowHot(false);
				}}
			/>
		</div>
	);
}
