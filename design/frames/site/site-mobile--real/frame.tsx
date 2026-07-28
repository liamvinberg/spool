import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SiteCanvasStill } from "../../../shared/ui/site-canvas-still";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * site-mobile--real. site-mobile's layout, with the still answering the question
 * site-mobile got wrong.
 *
 * The first take fitted all of 1440x900 into a 314px card, which put the section
 * frames at 51px and made everything on the canvas read as grey wireframe. The
 * fix is not to draw more faithfully at 51px — nothing survives 51px. The fix is
 * to stop fitting. This still crops into the composition at 0.42 and lets it run
 * off all four edges, which puts the frames at ~99px, and at 99px
 * site-hub--composed's own section wires read as an application: a player pill
 * under three linked screens, source beside its render, three seeded states.
 *
 * The bleed does the second job too. A canvas that ends inside a bordered card
 * is a picture of a page; a canvas that runs off the screen is a picture of a
 * canvas. The card and its caption are gone and the fade hands the eye down to
 * the install line instead.
 *
 * What is given up: the rail and the app bar fall outside the crop, so this take
 * shows the canvas where site-mobile showed the whole application.
 */

const SPINE_X = 18;

function Spine() {
	return (
		<div
			aria-hidden="true"
			// z-10 is load-bearing: the canvas band below is opaque and full-bleed, and
			// a thread that stops at it and starts again under it is two threads.
			className="absolute inset-y-0 z-10 w-px"
			style={{
				left: SPINE_X,
				background:
					"linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--color-thread) 50%, transparent) 7%, color-mix(in srgb, var(--color-thread) 50%, transparent) 93%, transparent 100%)",
			}}
		/>
	);
}

function Node({ className }: { className?: string }) {
	return (
		<span aria-hidden="true" className={cn("-left-[26px] absolute z-20 block h-[9px] w-[9px]", className)}>
			<span className="-inset-[5px] absolute rounded-full border border-thread/25" />
			<span className="absolute inset-0 rounded-full border-[3px] border-bg bg-thread" />
		</span>
	);
}

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
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.select();
			const ok = document.execCommand("copy");
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
	}
}

function CommandLine({ command, prompt }: { command: string; prompt: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	async function handleCopy() {
		if (!(await copyText(command))) return;
		setCopied(true);
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 1500);
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="-mx-2 flex w-[calc(100%+16px)] items-center gap-2 rounded-sm px-2 py-[3px] text-left active:bg-surface"
		>
			<span className="shrink-0 text-muted">{prompt}</span>
			<span className="truncate text-text">{command}</span>
			<span
				className={cn(
					"ml-auto shrink-0 font-mono text-2xs transition-opacity duration-150",
					copied ? "text-thread opacity-100" : "text-muted opacity-0",
				)}
			>
				copied
			</span>
		</button>
	);
}

function ArrowUpRight({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M3.5 8.5 8.5 3.5M4.6 3.5h3.9v3.9"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export default function SiteMobileReal() {
	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<Spine />

			<div className="relative flex h-full flex-col pr-7 pl-10">
				<header className="flex shrink-0 items-center justify-between py-5">
					<div className="flex items-center gap-2">
						<SpoolMark className="h-[18px] w-[18px] text-thread" title="spool" />
						<span className="font-semibold text-[15px] tracking-tight">spool</span>
					</div>
					<a
						href="https://github.com/liamvinberg/spool"
						className="flex items-center gap-1 font-mono text-muted text-xs"
					>
						github
						<ArrowUpRight className="h-3 w-3" />
					</a>
				</header>

				<main className="flex flex-1 flex-col justify-center">
					<div className="relative">
						<Node className="top-[11px]" />
						<h1 className="font-semibold text-[34px] leading-[1.02] tracking-[-0.02em]">
							feel an app
							<br />
							before it exists
						</h1>
					</div>
					<p className="mt-4 text-[15px] text-muted leading-[23px]">
						a live prototyping canvas. your agent authors real tsx frames, you arrange them and walk the flows. it
						feels real because it is.
					</p>

					{/* A band cut clean through the page: full bleed on both edges, and
					    dissolving at top and bottom rather than stopping. A canvas that
					    ends inside a card is a picture of a page; one that runs off every
					    edge it can is a picture of a canvas. */}
					<div className="-ml-10 -mr-7 relative mt-7 h-[250px] overflow-hidden">
						<SiteCanvasStill boxW={390} boxH={250} zoom={0.42} focus="field" />
						<div
							className="absolute inset-x-0 top-0 h-[30px]"
							style={{ background: "linear-gradient(to top, transparent, var(--color-bg) 92%)" }}
						/>
						<div
							className="absolute inset-x-0 bottom-0 h-[72px]"
							style={{ background: "linear-gradient(to bottom, transparent, var(--color-bg) 90%)" }}
						/>
					</div>

					<div className="relative mt-6">
						<Node className="top-[9px]" />
						<div className="flex gap-4">
							<span className="w-px shrink-0 self-stretch bg-thread/70" />
							<div className="min-w-0 flex-1 font-mono text-[13px] leading-[26px]">
								<CommandLine prompt="~ $" command="npm i -g spool.page" />
								<CommandLine prompt="~/your-app $" command="spool init" />
								<CommandLine prompt="~/your-app $" command="spool serve" />
							</div>
						</div>
						<p className="mt-4 pl-5 text-[13px] text-muted leading-[20px]">
							spool runs on your machine, beside your repo. open spool.page on a laptop to walk the canvas.
						</p>
					</div>
				</main>

				<footer className="flex shrink-0 items-center justify-between border-border border-t py-5">
					<span className="font-mono text-2xs text-muted">node 22+ · chrome · macos-first</span>
					<a href="https://github.com/liamvinberg/spool" className="flex items-center gap-1 text-[13px] text-text">
						star it
						<ArrowUpRight className="h-3 w-3" />
					</a>
				</footer>
			</div>
		</div>
	);
}
