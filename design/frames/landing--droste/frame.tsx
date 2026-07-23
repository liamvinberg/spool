import {
	motion,
	useAnimationFrame,
	useMotionValue,
	useTransform,
	type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "../../shared/lib/utils";
import { SpoolMark } from "../../shared/ui/spool-mark";

/**
 * landing--droste — the landing contains itself. The page's centerpiece is a
 * canvas viewport, and inside it sits this very page, which contains the
 * viewport, which contains the page: seven flat sibling layers of one shared
 * static sheet, each scaled about its own center (the window is exactly
 * centered in the sheet, so scale ratio 1/2 maps every layer's frame precisely
 * onto the previous layer's window). One MotionValue drives the zoom 1 -> 2 on
 * a 12s loop; at the wrap each layer lands exactly where the next one was, so
 * the loop is invisible. The deepest layer fades in over the first stretch
 * (manual clamp, useTransform function form). Transform-only, plus that one
 * opacity ramp. Boot pose: z = 1, fully composed for `spool shot`.
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

/* ---------- the shared sheet: one layout for the page and every layer ---------- */

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

const dotGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "30px 30px",
	backgroundPosition: "-1px -1px",
};

const SHEET_W = 1440;
const SHEET_H = 1500;
const WIN_W = 720;
const WIN_H = 750;

/** The still window: what a layer shows where the next layer docks. */
function StillWindow() {
	return (
		<div
			className="relative h-full w-full overflow-hidden rounded-2xl border border-border-raised bg-canvas"
			style={dotGrid}
		>
			<div className="absolute bottom-4 left-5 flex items-center gap-1.5 font-mono text-[10px] text-muted/80">
				<SpoolMark className="h-3 w-3 text-muted/70" />
				<span>canvas</span>
			</div>
			<div className="absolute bottom-4 right-5 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted/80">
				100%
			</div>
		</div>
	);
}

function Sheet({ window: windowSlot, live }: { window: React.ReactNode; live?: boolean }) {
	return (
		<div
			className="relative overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]"
			style={{ width: SHEET_W, height: SHEET_H }}
		>
			{/* header */}
			<header className="absolute inset-x-20 top-9 flex items-center justify-between">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-5 w-5 text-thread" title="spool" />
					<span className="text-md font-semibold tracking-tight">spool</span>
				</div>
				<div className="flex items-center gap-6 font-mono text-xs text-muted">
					<span>spool.page</span>
					<span className={cn(live && "text-text")}>github.com/liamvinberg/spool</span>
				</div>
			</header>

			{/* statement */}
			<h1 className="absolute inset-x-0 top-[128px] text-center text-[64px] font-semibold leading-[0.98] tracking-[-0.02em]">
				feel an app
				<br />
				before it exists
			</h1>

			{/* subline */}
			<p className="absolute inset-x-0 top-[280px] mx-auto max-w-[520px] text-center text-[16px] leading-[24px] text-muted">
				a live prototyping canvas. your agent authors live tsx frames on an
				infinite canvas and links them into walkable flows. you feel the real
				thing, interactions and motion and inputs, before it exists.
			</p>

			{/* the window: exactly centered in the sheet */}
			<div
				className="absolute"
				style={{
					left: (SHEET_W - WIN_W) / 2,
					top: (SHEET_H - WIN_H) / 2,
					width: WIN_W,
					height: WIN_H,
				}}
			>
				{windowSlot}
			</div>

			{/* install */}
			<div className="absolute inset-x-0 top-[1160px] flex justify-center">
				<div className="flex gap-5">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div className="w-[300px] font-mono text-[15px] leading-[30px]">
						{live ? (
							<>
								<CommandLine command="npm i -g spool.page" />
								<CommandLine command="spool init" />
								<CommandLine command="spool serve" />
							</>
						) : (
							<>
								<div>
									<span className="inline-flex w-[2ch] select-none text-muted">$</span>
									npm i -g spool.page
								</div>
								<div>
									<span className="inline-flex w-[2ch] select-none text-muted">$</span>
									spool init
								</div>
								<div>
									<span className="inline-flex w-[2ch] select-none text-muted">$</span>
									spool serve
								</div>
							</>
						)}
					</div>
				</div>
			</div>
			<div className="absolute inset-x-0 top-[1272px] text-center font-mono text-xs text-muted">
				requires node 22+ · best in chrome · macos-first today
			</div>

			{/* stance */}
			<div className="absolute inset-x-20 top-[1330px] grid grid-cols-4 gap-8 border-t border-border pt-6">
				{stance.map((s, i) => (
					<div key={s.k}>
						<div className="flex items-baseline gap-2">
							<span className="font-mono text-[11px] text-thread">
								{String(i + 1).padStart(2, "0")}
							</span>
							<span className="text-[15px] font-semibold tracking-tight">{s.k}</span>
						</div>
						<p className="mt-1.5 text-[12px] leading-[18px] text-muted">{s.v}</p>
					</div>
				))}
			</div>

			{/* footer */}
			<footer className="absolute inset-x-20 bottom-0 flex items-center justify-between border-t border-border py-6">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-4 w-4 text-thread" />
					<span className="text-sm text-muted">spool.page</span>
				</div>
				<span className="font-mono text-xs text-muted">github.com/liamvinberg/spool</span>
			</footer>
		</div>
	);
}

/* ---------- the zoom viewport ---------- */

const LAYERS = 7;
const ZOOM_PERIOD_MS = 12000;

function DrosteLayer({ k, z }: { k: number; z: MotionValue<number> }) {
	const scale = useTransform(z, (v) => v * Math.pow(0.5, k + 1));
	const opacity = useTransform(z, (v) =>
		k === LAYERS - 1 ? Math.min(1, Math.max(0, (v - 1) / 0.2)) : 1,
	);
	return (
		<motion.div
			className="absolute left-1/2 top-1/2"
			style={{
				width: SHEET_W,
				height: SHEET_H,
				marginLeft: -SHEET_W / 2,
				marginTop: -SHEET_H / 2,
				scale,
				opacity,
				willChange: "transform",
			}}
		>
			<Sheet window={<StillWindow />} />
		</motion.div>
	);
}

function ZoomViewport() {
	const z = useMotionValue(1);
	const readoutRef = useRef<HTMLSpanElement | null>(null);

	useAnimationFrame((t) => {
		const v = 1 + ((t % ZOOM_PERIOD_MS) / ZOOM_PERIOD_MS);
		z.set(v);
		if (readoutRef.current) {
			readoutRef.current.textContent = `${Math.round(v * 100)}%`;
		}
	});

	return (
		<div
			className="relative h-full w-full overflow-hidden rounded-2xl border border-border-raised bg-canvas"
			style={dotGrid}
		>
			{Array.from({ length: LAYERS }, (_, k) => (
				<DrosteLayer key={k} k={k} z={z} />
			))}
			{/* the vanishing point */}
			<motion.span
				className="absolute left-1/2 top-1/2 -ml-[3px] -mt-[3px] block h-1.5 w-1.5 rounded-full bg-thread"
				animate={{ opacity: [0.35, 0.9, 0.35], scale: [1, 1.5, 1] }}
				transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
			/>
			<div className="absolute bottom-4 left-5 z-10 flex items-center gap-1.5 font-mono text-[10px] text-muted/80">
				<SpoolMark className="h-3 w-3 text-muted/70" />
				<span>canvas</span>
			</div>
			<div className="absolute bottom-4 right-5 z-10 rounded-full border border-border bg-canvas/80 px-2 py-0.5 font-mono text-[10px] text-muted">
				<span ref={readoutRef}>100%</span>
			</div>
		</div>
	);
}

export default function LandingDroste() {
	return <Sheet window={<ZoomViewport />} live />;
}
