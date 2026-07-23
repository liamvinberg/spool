import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * landing--quiet
 * Direction: the restraint test. paper.design discipline pushed to the far end.
 * A printed manifesto that happens to be alive in exactly one spot. An enormous,
 * measured Familjen statement is the masthead; hairline rules in border color
 * structure an asymmetric broadsheet grid; whitespace is the main material. The
 * page is one ruled content column beside one open margin, and the only motion
 * is the spool ribbon, sole occupant of that margin, spooling at a glacial,
 * hypnotic pace. Red is spent in just two earned places: the living ribbon and
 * the thread rule beside the install. Everything else is still.
 *
 * Rhythm: the middle is four equal bands, a strict vertical beat; every gap rides
 * an 8px unit drawn from {8, 16, 24, 40, 64, 80}. Type steps cleanly from the
 * 11px fine print up to the 100px statement, mono only where the content is
 * genuinely tool-flavored.
 */

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

const install = ["npm i -g spool.page", "spool init", "spool serve"];

/**
 * Paste-ready copy. Frames run in null-origin sandboxed srcdoc, so the async
 * Clipboard API can reject outright, so try it, then fall back to the classic
 * hidden-textarea execCommand path. Silent on both branches: no console output.
 */
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

/**
 * One install line. The whole line is the button; the "$" prompt is the
 * affordance: hover (or keyboard focus) swaps it for the copy glyph, the command
 * itself is never covered. Copying strips the prompt so the clipboard is
 * paste-ready; the copied tick holds for a beat. The prompt cell keeps a fixed
 * 2ch footprint so the swaps never reflow the line.
 */
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

export default function LandingQuiet() {
	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased">
			<div className="mx-auto flex h-full max-w-[1440px] flex-col px-24">
				{/* masthead top row */}
				<header className="flex items-center justify-between border-b border-border py-8">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-5 w-5 text-text" title="spool" />
						<span className="text-md font-semibold tracking-tight">spool</span>
					</div>
					<div className="flex items-center gap-8 font-mono text-xs text-muted">
						<span>spool.page</span>
						<a
							href="https://github.com/liamvinberg/spool"
							className="transition-colors hover:text-thread"
						>
							github.com/liamvinberg/spool
						</a>
					</div>
				</header>

				{/* one ruled content column beside one open margin, split by a single rule */}
				<main className="grid flex-1 grid-cols-[1fr_380px]">
					<div className="flex flex-col">
						{/* statement — the masthead moment */}
						<div className="flex flex-1 items-center border-b border-border py-8 pr-20">
							<h1 className="text-[128px] font-semibold leading-[0.96] tracking-[-0.03em]">
								feel an app
								<br />
								before it exists
							</h1>
						</div>

						{/* subline — set asymmetrically, indented off the statement */}
						<div className="flex flex-1 items-center border-b border-border py-8 pr-20">
							<p className="ml-[128px] max-w-[520px] text-[22px] leading-[32px] text-muted">
								a live prototyping canvas. your agent authors live tsx frames on
								an infinite canvas and links them into walkable flows. you feel
								the real thing, interactions and motion and inputs, before it
								exists.
							</p>
						</div>

						{/* install — the one call to action, fine print as an index column */}
						<div className="flex flex-1 items-center border-b border-border py-8 pr-20">
							<div className="grid w-full grid-cols-[1fr_270px] items-start gap-10">
								<div className="flex gap-6">
									<span className="w-px shrink-0 self-stretch bg-thread" />
									<div className="font-mono text-[26px] leading-[40px]">
										{install.map((c) => (
											<CommandLine key={c} command={c} />
										))}
									</div>
								</div>
								<p className="max-w-[250px] pt-2 font-mono text-xs leading-[20px] text-muted">
									requires node 22+ · best in chrome · macos-first today
								</p>
							</div>
						</div>

						{/* stance — a numbered index */}
						<div className="flex flex-1 items-center py-8 pr-20">
							<div className="w-full space-y-10">
								{stance.map((s, i) => (
									<div
										key={s.k}
										className="grid grid-cols-[56px_160px_1fr] items-baseline gap-6"
									>
										<span className="font-mono text-xs text-muted">
											{String(i + 1).padStart(2, "0")}
										</span>
										<span className="text-lg font-semibold tracking-tight">
											{s.k}
										</span>
										<span className="text-md leading-[22px] text-muted">
											{s.v}
										</span>
									</div>
								))}
							</div>
						</div>
					</div>

					{/* the one living element, sole occupant of the open margin */}
					<aside className="flex items-center justify-center border-l border-border">
						<motion.div
							className="w-[170px]"
							animate={{ rotate: 360 }}
							transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
						>
							<SpoolMark className="w-full text-thread" title="spool ribbon" />
						</motion.div>
					</aside>
				</main>

				{/* footer masthead */}
				<footer className="flex items-center justify-between border-t border-border py-8">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-4 w-4 text-muted" />
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
		</div>
	);
}
