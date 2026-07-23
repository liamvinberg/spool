import { motion, useAnimationFrame, useMotionValue, useTransform } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../shared/lib/utils";
import { SpoolMark } from "../../shared/ui/spool-mark";

/**
 * landing--blueprint — the landing as its own engineering drawing. A drawing
 * sheet: hairline grid, sheet border with corner registration marks, the
 * statement dimensioned like a part (real measurements taken in layout px via
 * offsetWidth/offsetHeight, never getBoundingClientRect, so the player scale
 * cannot strand them, #53), the ribbon as fig. 1 with leader callouts, the
 * install as the bill of materials, the stance as fig. 2..5 detail boxes, and
 * a title block carrying the fine print. One living detail: a survey cursor
 * sweeps the sheet on a slow loop with an x-readout riding the bottom edge.
 * Canonical copy verbatim; every annotation is tool-flavored mono.
 */

/* ---------- canonical copy-to-clipboard (verbatim from landing) ---------- */

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

/* ---------- drawing furniture ---------- */

const grid: React.CSSProperties = {
	backgroundImage:
		"linear-gradient(to right, color-mix(in srgb, var(--color-text) 4%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--color-text) 4%, transparent) 1px, transparent 1px)",
	backgroundSize: "80px 80px",
	backgroundPosition: "36px 36px",
};

function CornerMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 18 18"
			fill="none"
			aria-hidden="true"
			className={cn("absolute h-[18px] w-[18px] text-muted/60", className)}
		>
			<path d="M9 0v18M0 9h18" stroke="currentColor" strokeWidth="1" />
		</svg>
	);
}

/** Horizontal dimension line under the statement, measured in layout px. */
function WidthMeasure({ targetRef, gap = 22 }: { targetRef: React.RefObject<HTMLElement | null>; gap?: number }) {
	const [w, setW] = useState(0);
	useLayoutEffect(() => {
		const el = targetRef.current;
		if (!el) return;
		const read = () => setW(el.offsetWidth);
		read();
		document.fonts?.ready.then(read).catch(() => {});
	}, [targetRef]);
	if (w === 0) return null;
	const y = gap + 9;
	return (
		<div className="absolute inset-x-0" style={{ top: `calc(100% + ${gap}px)` }} aria-hidden="true">
			<svg width={w} height="20" viewBox={`0 0 ${w} 20`} fill="none" className="block overflow-visible">
				<path d={`M0 4 L0 16 M${w} 4 L${w} 16`} stroke="var(--color-thread)" strokeOpacity="0.5" strokeWidth="1" />
				<path
					d={`M10 10 L${w - 10} 10`}
					stroke="var(--color-thread)"
					strokeOpacity="0.7"
					strokeWidth="1"
				/>
				<path d="M10 10 L18 6.8 L18 13.2 Z" fill="var(--color-thread)" fillOpacity="0.7" />
				<path
					d={`M${w - 10} 10 L${w - 18} 6.8 L${w - 18} 13.2 Z`}
					fill="var(--color-thread)"
					fillOpacity="0.7"
				/>
			</svg>
			<span className="absolute left-1/2 top-[-7px] -translate-x-1/2 whitespace-nowrap bg-bg px-2 font-mono text-[10px] leading-none text-thread/90">
				w {w}
			</span>
		</div>
	);
}

/** Vertical dimension line left of the statement, measured in layout px. */
function HeightMeasure({ targetRef, gap = 30 }: { targetRef: React.RefObject<HTMLElement | null>; gap?: number }) {
	const [h, setH] = useState(0);
	useLayoutEffect(() => {
		const el = targetRef.current;
		if (!el) return;
		const read = () => setH(el.offsetHeight);
		read();
		document.fonts?.ready.then(read).catch(() => {});
	}, [targetRef]);
	if (h === 0) return null;
	return (
		<div className="absolute top-0" style={{ left: -gap, height: h }} aria-hidden="true">
			<svg width="20" height={h} viewBox={`0 0 20 ${h}`} fill="none" className="block overflow-visible">
				<path d={`M4 0 L16 0 M4 ${h} L16 ${h}`} stroke="var(--color-thread)" strokeOpacity="0.5" strokeWidth="1" />
				<path d={`M10 10 L10 ${h - 10}`} stroke="var(--color-thread)" strokeOpacity="0.7" strokeWidth="1" />
				<path d="M10 10 L6.8 18 L13.2 18 Z" fill="var(--color-thread)" fillOpacity="0.7" />
				<path d={`M10 ${h - 10} L6.8 ${h - 18} L13.2 ${h - 18} Z`} fill="var(--color-thread)" fillOpacity="0.7" />
			</svg>
			<span
				className="absolute whitespace-nowrap bg-bg px-1 font-mono text-[10px] leading-none text-thread/90"
				style={{ left: 3, top: h / 2, transform: "translate(-50%, -50%) rotate(-90deg)" }}
			>
				h {h}
			</span>
		</div>
	);
}

/* ---------- fig. 1: the ribbon ---------- */

function FigOne() {
	return (
		<div className="relative h-[380px] w-[360px] border border-border">
			<span className="absolute -top-[7px] left-3 bg-bg px-1.5 font-mono text-[10px] leading-none text-muted">
				fig. 1
			</span>
			<div className="absolute inset-0 flex items-center justify-center">
				<SpoolMark className="h-[210px] w-[210px] text-thread" title="spool ribbon" />
			</div>
			{/* registration circle on the mark */}
			<div className="pointer-events-none absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-thread/25" />
			{/* leader callouts */}
			<svg className="absolute inset-0 h-full w-full overflow-visible" fill="none" aria-hidden="true">
				<path d="M180 84 L236 40 L330 40" stroke="var(--color-muted)" strokeOpacity="0.6" strokeWidth="1" />
				<circle cx="180" cy="84" r="2.4" fill="var(--color-thread)" />
				<path d="M180 296 L236 340 L330 340" stroke="var(--color-muted)" strokeOpacity="0.6" strokeWidth="1" />
				<circle cx="180" cy="296" r="2.4" fill="var(--color-thread)" />
			</svg>
			<span className="absolute left-[242px] top-[26px] whitespace-nowrap font-mono text-[10px] leading-none text-muted">
				path 524 × 660
			</span>
			<span className="absolute left-[242px] top-[326px] whitespace-nowrap font-mono text-[10px] leading-none text-muted">
				fill #f5391a
			</span>
		</div>
	);
}

/* ---------- fig. 1a: the walk ---------- */

function FigWalk() {
	return (
		<div className="relative mt-5 h-[190px] w-[360px] border border-border">
			<span className="absolute -top-[7px] left-3 bg-bg px-1.5 font-mono text-[10px] leading-none text-muted">
				fig. 1a
			</span>
			<svg className="absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
				<rect x="42" y="76" width="64" height="46" rx="5" stroke="var(--color-border-raised)" strokeWidth="1" />
				<rect x="252" y="52" width="64" height="46" rx="5" stroke="var(--color-border-raised)" strokeWidth="1" />
				<path
					d="M112 94 C 160 94, 196 80, 244 76"
					stroke="var(--color-thread)"
					strokeOpacity="0.75"
					strokeWidth="1.3"
				/>
				<path d="M244 76 L234 71.5 L234 80.5 Z" fill="var(--color-thread)" fillOpacity="0.75" />
				<circle cx="77" cy="64" r="2" fill="var(--color-muted)" fillOpacity="0.7" />
				<circle cx="287" cy="40" r="2" fill="var(--color-muted)" fillOpacity="0.7" />
			</svg>
			<span className="absolute left-[52px] top-[128px] font-mono text-[10px] leading-none text-muted">
				browse
			</span>
			<span className="absolute left-[252px] top-[104px] font-mono text-[10px] leading-none text-muted">
				now playing
			</span>
			<span className="absolute left-[146px] top-[64px] font-mono text-[10px] leading-none text-thread/80">
				data-go
			</span>
		</div>
	);
}

/* ---------- the sweep ---------- */

const SHEET_LEFT = 36;
const SHEET_W = 1440;
const SWEEP_PERIOD_MS = 20000;

function Sweep() {
	const progress = useMotionValue(0);
	const x = useTransform(progress, (v) => SHEET_LEFT + 8 + v * (SHEET_W - (SHEET_LEFT + 8) * 2));
	const readoutRef = useRef<HTMLSpanElement | null>(null);

	useAnimationFrame((t) => {
		const p = (t % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS;
		progress.set(p);
		if (readoutRef.current) {
			readoutRef.current.textContent = `x ${Math.round(SHEET_LEFT + 8 + p * (SHEET_W - (SHEET_LEFT + 8) * 2))}`;
		}
	});

	return (
		<div className="pointer-events-none absolute inset-0" aria-hidden="true">
			<motion.div
				className="absolute bottom-[36px] top-[36px] w-px bg-thread/30"
				style={{ x }}
			/>
			<motion.div className="absolute bottom-[26px]" style={{ x }}>
				<span
					ref={readoutRef}
					className="absolute -left-3 whitespace-nowrap font-mono text-[10px] leading-none text-thread/80"
				>
					x 44
				</span>
			</motion.div>
		</div>
	);
}

/* ---------- page ---------- */

const stance = [
	{ k: "your agent", v: "works through files and a cli, not a captive chat." },
	{
		k: "your disk",
		v: "local-first. plain files inside your repo. git-friendly, no cloud, no accounts.",
	},
	{
		k: "real depth",
		v: "frames are real tsx. arbitrary js, real motion, real state.",
	},
	{ k: "flows", v: "walk screen to screen, with morphing transitions." },
];

export default function LandingBlueprint() {
	const stmtRef = useRef<HTMLHeadingElement | null>(null);

	return (
		<div
			className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]"
			style={grid}
		>
			{/* sheet border + registration */}
			<div className="pointer-events-none absolute inset-[36px] border border-border" aria-hidden="true" />
			<CornerMark className="left-[27px] top-[27px]" />
			<CornerMark className="right-[27px] top-[27px]" />
			<CornerMark className="bottom-[27px] left-[27px]" />
			<CornerMark className="bottom-[27px] right-[27px]" />

			<div className="relative px-[100px]">
				{/* header */}
				<header className="flex items-center justify-between py-9">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-5 w-5 text-thread" title="spool" />
						<span className="text-md font-semibold tracking-tight">spool</span>
					</div>
					<div className="flex items-center gap-6 font-mono text-xs text-muted">
						<span>spool.page</span>
						<a
							href="https://github.com/liamvinberg/spool"
							className="text-text transition-colors hover:text-thread"
						>
							github.com/liamvinberg/spool
						</a>
					</div>
				</header>

				{/* hero: the statement, dimensioned; fig. 1 to the right */}
				<section className="relative mt-10 flex items-start justify-between">
					<div className="relative">
						<h1
							ref={stmtRef}
							className="w-fit text-[96px] font-semibold leading-[0.98] tracking-[-0.02em]"
						>
							feel an app
							<br />
							before it exists
						</h1>
						<WidthMeasure targetRef={stmtRef} />
						<HeightMeasure targetRef={stmtRef} />
						<p className="mt-16 max-w-[480px] text-[19px] leading-[28px] text-muted">
							a live prototyping canvas. your agent authors live tsx frames on an
							infinite canvas and links them into walkable flows. you feel the
							real thing, interactions and motion and inputs, before it exists.
						</p>
					</div>
					<div className="shrink-0 pt-1">
						<FigOne />
						<FigWalk />
					</div>
				</section>

				{/* bill of materials: the install */}
				<section className="relative mt-14 w-fit border border-border">
					<span className="absolute -top-[7px] left-3 bg-bg px-1.5 font-mono text-[10px] leading-none text-muted">
						bom · 3 rows
					</span>
					<div className="w-[440px] px-5 py-4 font-mono text-[15px] leading-[34px]">
						<CommandLine command="npm i -g spool.page" />
						<div className="border-t border-border" />
						<CommandLine command="spool init" />
						<div className="border-t border-border" />
						<CommandLine command="spool serve" />
					</div>
				</section>

				{/* detail boxes: the stance, fig. 2..5 */}
				<section className="mt-14 grid grid-cols-4 gap-5">
					{stance.map((s, i) => (
						<div key={s.k} className="relative border border-border p-4">
							<span className="absolute -top-[7px] left-3 bg-bg px-1.5 font-mono text-[10px] leading-none text-thread">
								fig. {i + 2}
							</span>
							<div className="text-[15px] font-semibold tracking-tight">{s.k}</div>
							<p className="mt-2 text-[13px] leading-[20px] text-muted">{s.v}</p>
						</div>
					))}
				</section>

				{/* footer + title block */}
				<section className="mt-14 flex items-end justify-between pb-14">
					<footer className="flex items-center gap-6">
						<div className="flex items-center gap-2.5">
							<SpoolMark className="h-4 w-4 text-thread" />
							<span className="text-sm text-muted">spool.page</span>
						</div>
						<a
							href="https://github.com/liamvinberg/spool"
							className="font-mono text-xs text-muted transition-colors hover:text-thread"
						>
							github.com/liamvinberg/spool
						</a>
					</footer>
					<div className="w-[380px] border border-border font-mono text-[11px] leading-[18px] text-muted">
						<div className="flex justify-between border-b border-border px-3 py-1.5">
							<span>sheet</span>
							<span className="text-text">1 / 1</span>
						</div>
						<div className="flex justify-between border-b border-border px-3 py-1.5">
							<span>scale</span>
							<span className="text-text">1:1</span>
						</div>
						<div className="flex justify-between border-b border-border px-3 py-1.5">
							<span>drawn</span>
							<span className="text-text">spool.page</span>
						</div>
						<div className="px-3 py-1.5">
							requires node 22+ · best in chrome · macos-first today
						</div>
					</div>
				</section>
			</div>

			<Sweep />
		</div>
	);
}
