import { motion, useAnimationFrame, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../shared/lib/utils";
import { SpoolMark } from "../../shared/ui/spool-mark";

/**
 * landing--specimen — the foundry specimen sheet. The canonical copy is set as
 * a type specimen: every block on the page carries its spec in the margin
 * (size / leading / tracking), the statement is the 104px showing, the fine
 * print is the micro cut. Restraint in the paper.design sense: one family, one
 * accent, hairlines, whitespace. The single living detail is a survey line
 * that travels the sheet on a slow loop, a mono y-readout riding it, so the
 * page measures itself. Copy verbatim from frames/landing; annotations are
 * tool-flavored mono, never marketing voice.
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

/* ---------- the specimen sheet ---------- */

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

/** Margin spec note: mono, right-aligned against the content gutter. */
function Spec({ lines, className }: { lines: string[]; className?: string }) {
	return (
		<div
			className={cn(
				"absolute right-full mr-10 w-[150px] text-right font-mono text-[11px] leading-[16px] text-muted/70",
				className,
			)}
		>
			{lines.map((l) => (
				<div key={l}>{l}</div>
			))}
		</div>
	);
}

const SHEET_H = 1240;
const SCAN_PERIOD_MS = 22000;

/** The survey line: one hairline crossing the sheet, y-readout riding it. */
function SurveyLine() {
	const progress = useMotionValue(0);
	const y = useTransform(progress, (v) => 90 + v * (SHEET_H - 180));
	const readoutRef = useRef<HTMLSpanElement | null>(null);

	useAnimationFrame((t) => {
		const p = (t % SCAN_PERIOD_MS) / SCAN_PERIOD_MS;
		progress.set(p);
		if (readoutRef.current) {
			readoutRef.current.textContent = `y ${Math.round(90 + p * (SHEET_H - 180))}`;
		}
	});

	return (
		<div className="pointer-events-none absolute inset-0" aria-hidden="true">
			<motion.div
				className="absolute left-[280px] right-[100px] h-px bg-thread/40"
				style={{ y }}
			/>
			<motion.div className="absolute right-[100px]" style={{ y }}>
				<span
					ref={readoutRef}
					className="absolute -top-[7px] right-0 whitespace-nowrap font-mono text-[10px] leading-none text-thread/80"
				>
					y 90
				</span>
			</motion.div>
			<motion.div
				className="absolute h-[5px] w-[5px] rounded-full bg-thread"
				style={{ y, x: 274, translateY: -2 }}
			/>
		</div>
	);
}

export default function LandingSpecimen() {
	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{/* the gutter rule that separates margin specs from the showing */}
			<div className="absolute inset-y-0 left-[260px] w-px bg-border" />

			<div className="relative pl-[280px] pr-[100px]">
				{/* header */}
				<header className="flex items-center justify-between py-10">
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

				{/* the showing: statement at display size */}
				<section className="relative pt-16">
					<Spec lines={["familjen grotesk", "600 · 104/0.98", "track -0.02"]} className="top-[76px]" />
					<h1 className="text-[104px] font-semibold leading-[0.98] tracking-[-0.02em]">
						feel an app
						<br />
						before it exists
					</h1>
				</section>

				{/* text cut: the subline at reading size */}
				<section className="relative mt-16 border-t border-border pt-10">
					<Spec lines={["familjen grotesk", "400 · 19/28", "track 0"]} className="top-[46px]" />
					<p className="max-w-[560px] text-[19px] leading-[28px] text-muted">
						a live prototyping canvas. your agent authors live tsx frames on an
						infinite canvas and links them into walkable flows. you feel the
						real thing, interactions and motion and inputs, before it exists.
					</p>
				</section>

				{/* mono cut: the install */}
				<section className="relative mt-16 border-t border-border pt-10">
					<Spec lines={["fragment mono", "400 · 15/30", "track 0"]} className="top-[46px]" />
					<div className="flex gap-5">
						<span className="w-px shrink-0 self-stretch bg-thread/70" />
						<div className="w-[340px] font-mono text-[15px] leading-[30px]">
							<CommandLine command="npm i -g spool.page" />
							<CommandLine command="spool init" />
							<CommandLine command="spool serve" />
						</div>
					</div>
					<div className="relative mt-6">
						<Spec lines={["fragment mono", "400 · 11/16"]} className="top-0" />
						<div className="font-mono text-xs text-muted">
							requires node 22+ · best in chrome · macos-first today
						</div>
					</div>
				</section>

				{/* paired cuts: the stance at text sizes */}
				<section className="relative mt-16 border-t border-border pt-10">
					<Spec lines={["familjen grotesk", "600 18/26 +", "400 14/22"]} className="top-[46px]" />
					<div className="grid grid-cols-4 gap-10">
						{stance.map((s, i) => (
							<div key={s.k}>
								<div className="flex items-baseline gap-2">
									<span className="font-mono text-[11px] text-thread">
										{String(i + 1).padStart(2, "0")}
									</span>
									<span className="text-lg font-semibold tracking-tight">{s.k}</span>
								</div>
								<p className="mt-2 text-md leading-[22px] text-muted">{s.v}</p>
							</div>
						))}
					</div>
				</section>

				{/* footer */}
				<footer className="mt-20 flex items-center justify-between border-t border-border py-9">
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
			</div>

			<SurveyLine />
		</div>
	);
}
