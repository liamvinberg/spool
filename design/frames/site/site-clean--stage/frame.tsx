import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";
import {
	ArrowUpRight,
	CanvasPlate,
	CopyGlyph,
	DirectPlate,
	DownloadGlyph,
	LivePlate,
	MONO,
	PlayTri,
	RepoPlate,
	TakesPlate,
	Tick,
} from "./product";

/**
 * site-clean--stage. The same landing, given room.
 *
 * The structure is the converged one and does not move. What changes is the
 * scale of everything on it: a 76px headline against ledger's 46, 130px between
 * bands against ledger's 72, and product pictures at 620 wide rather than 520.
 * There is one horizontal rule on the whole page, above the footer. Bands are
 * separated by air, which is the only separator this take needs at this size.
 *
 * The pictures have no border either. A plate here is the canvas ground itself,
 * #161616 against the page's #0E0E0E, so it lifts off the page on value alone
 * and never has to be boxed in. That is also what makes it possible to put a
 * frame's own red ring against the page with nothing between them.
 *
 * The hero picture is the one place the camera moves: the window is drawn at
 * 1.15 rather than 1:1, so the frames arrive above the size a real screen shows
 * them and the third is cut off at the right. Pushing in is the whole argument
 * of this take, so it happens once, at the top, and never again.
 *
 * Motion is opacity and a 20px rise per band, driven by this frame's own
 * scroller, and it stops under prefers-reduced-motion. The install line copies,
 * the download is the release URL, and the frame in the first section is a real
 * form.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

const DMG_URL = "https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg";
const REPO_URL = "https://github.com/liamvinberg/spool";

/** read off design/frames on 2026-09-01: 190 frames plus these three. */
const FRAME_COUNT = 193;
const PAGE_COUNT = 13;

/* ---------- reveal ---------- */

function useReveal<T extends HTMLElement>(rootRef: React.RefObject<HTMLDivElement | null>) {
	const ref = useRef<T | null>(null);
	const [shown, setShown] = useState(false);
	useEffect(() => {
		const el = ref.current;
		const root = rootRef.current;
		if (el === null || root === null) return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) if (entry.isIntersecting) setShown(true);
			},
			{ root, rootMargin: "0px 0px -12% 0px", threshold: 0.06 },
		);
		io.observe(el);
		return () => {
			io.disconnect();
		};
	}, [rootRef]);
	return { ref, shown };
}

function Reveal({
	rootRef,
	delay = 0,
	className,
	children,
}: {
	rootRef: React.RefObject<HTMLDivElement | null>;
	delay?: number;
	className?: string;
	children: ReactNode;
}) {
	const { ref, shown } = useReveal<HTMLDivElement>(rootRef);
	const reduce = useReducedMotion() === true;
	return (
		<motion.div
			ref={ref}
			className={className}
			initial={false}
			animate={{ opacity: shown ? 1 : 0, y: shown || reduce ? 0 : 20 }}
			transition={{ duration: reduce ? 0.2 : 0.7, ease: EASE, delay: shown ? delay : 0 }}
		>
			{children}
		</motion.div>
	);
}

/* ---------- doors ---------- */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function InstallLine({ command, className }: { command: string; className?: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	return (
		<button
			type="button"
			aria-label={copied ? `Copied ${command}` : `Copy ${command}`}
			onClick={() => {
				void copyText(command).then((ok) => {
					if (!ok) return;
					setCopied(true);
					if (timer.current !== null) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => setCopied(false), 1600);
				});
			}}
			className={cn(
				"group/line flex h-[52px] cursor-pointer items-center gap-3.5 rounded-lg border bg-canvas px-5 text-left transition-colors duration-200 focus-visible:outline-none",
				copied ? "border-thread/50" : "border-border hover:border-border-raised",
				className,
			)}
		>
			<span className={cn("select-none text-[14px] text-muted leading-none", MONO)}>$</span>
			<span className={cn("min-w-0 flex-1 truncate text-[15px] text-text leading-none", MONO)}>{command}</span>
			<span className="relative block h-4 w-4 shrink-0">
				<CopyGlyph
					className={cn(
						"absolute inset-0 h-4 w-4 transition-opacity duration-200",
						copied ? "opacity-0" : "text-muted/70 opacity-100 group-hover/line:text-text",
					)}
				/>
				<Tick
					className={cn(
						"absolute inset-0 h-4 w-4 text-thread transition-opacity duration-200",
						copied ? "opacity-100" : "opacity-0",
					)}
				/>
			</span>
		</button>
	);
}

function Doors() {
	return (
		<div>
			<div className="flex items-center gap-3.5">
				<a
					href={DMG_URL}
					className="flex h-[52px] cursor-pointer items-center gap-2.5 rounded-lg bg-thread px-7 font-semibold text-[15px] text-on-thread leading-none transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none"
				>
					<DownloadGlyph className="h-4 w-4" />
					Download for Mac
				</a>
				<InstallLine command="npm i -g spool.page" className="w-[320px]" />
			</div>
			<div className={cn("mt-5 flex gap-7 text-[11px] text-muted/75 leading-none", MONO)}>
				<span>spool.dmg · apple silicon</span>
				<span>node 22+ · macos, linux, wsl</span>
			</div>
		</div>
	);
}

/* ---------- one band: air on every side, no rules ---------- */

function Band({
	rootRef,
	title,
	body,
	flip = false,
	children,
}: {
	rootRef: React.RefObject<HTMLDivElement | null>;
	title: string;
	body: ReactNode;
	flip?: boolean;
	children: ReactNode;
}) {
	return (
		<section className="grid grid-cols-[1fr_620px] items-center gap-[92px] py-[76px]">
			<Reveal rootRef={rootRef} className={cn("max-w-[380px]", flip && "order-2 justify-self-end")}>
				<h2 className="font-semibold text-[36px] leading-[1.1] tracking-[-0.03em]">{title}</h2>
				<div className="mt-6 text-[16px] text-muted leading-[29px]">{body}</div>
			</Reveal>
			<Reveal rootRef={rootRef} delay={0.1} className={cn(flip && "order-1")}>
				<div className="overflow-hidden rounded-[14px]">{children}</div>
			</Reveal>
		</section>
	);
}

/* ---------- the first minute ---------- */

const STEPS: readonly { n: string; head: string; body: string; mono: string }[] = [
	{
		n: "1",
		head: "Install it",
		body: "Take the Mac app, which carries its own Node, or the global package.",
		mono: "npm i -g spool.page",
	},
	{
		n: "2",
		head: "Point it at a folder",
		body: "A repo you already have is the right place. design/ appears beside your source.",
		mono: "cd chamfer && spool init",
	},
	{
		n: "3",
		head: "Ask your agent for a screen",
		body: "It writes one folder with one component in it. The frame is on the canvas before you switch windows.",
		mono: "design/frames/runs/pt-journal/frame.tsx",
	},
	{
		n: "4",
		head: "Walk the flow",
		body: "Link the frames, press play, and click from screen to screen at full size.",
		mono: "localhost:7766",
	},
];

function VideoPlate() {
	const [hover, setHover] = useState(false);
	return (
		<button
			type="button"
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			className="group/vid relative block cursor-pointer overflow-hidden rounded-[14px] bg-canvas text-left focus-visible:outline-none"
			style={{ width: 1280, height: 640 }}
		>
			<div className="absolute inset-0 opacity-[0.32] transition-opacity duration-500 group-hover/vid:opacity-45">
				<CanvasPlate w={1280} h={640} scale={1.15} />
			</div>
			<div className="absolute inset-0 flex items-center justify-center">
				<span
					className={cn(
						"flex h-[76px] w-[76px] items-center justify-center rounded-full border transition-colors duration-300",
						hover ? "border-thread bg-thread" : "border-border-raised bg-bg/80",
					)}
				>
					<PlayTri className={cn("ml-[4px] h-4 w-4", hover ? "text-on-thread" : "text-text")} />
				</span>
			</div>
			<span className={cn("absolute bottom-6 left-7 text-[11px] text-muted leading-none", MONO)}>
				a minute with spool · 1:04
			</span>
		</button>
	);
}

/* ---------- the page ---------- */

export default function SiteCleanStage() {
	const rootRef = useRef<HTMLDivElement | null>(null);

	return (
		<div
			ref={rootRef}
			className="h-full w-full overflow-y-auto bg-bg font-sans text-text antialiased [font-synthesis:none]"
		>
			<div className="mx-auto w-[1280px]">
				<header className="flex h-[88px] items-center justify-between">
					<div className="flex items-center gap-3">
						<SpoolMark className="h-[21px] w-[17px] text-thread" title="spool" />
						<span className="font-semibold text-[16px] tracking-[-0.01em]">spool</span>
					</div>
					<nav className="flex items-center gap-8 text-[14px] text-muted">
						<a href="/docs" className="transition-colors duration-200 hover:text-text">
							Docs
						</a>
						<a
							href={REPO_URL}
							className="flex items-center gap-1.5 transition-colors duration-200 hover:text-text"
						>
							GitHub
							<ArrowUpRight className="h-3 w-3" />
						</a>
						<a
							href={DMG_URL}
							className="flex h-[34px] items-center rounded-[7px] border border-border-raised px-4 text-[14px] text-text transition-colors duration-200 hover:border-text/40"
						>
							Download
						</a>
					</nav>
				</header>

				<section className="pt-[112px] pb-[86px]">
					<h1 className="max-w-[900px] font-semibold text-[76px] leading-[1.02] tracking-[-0.038em]">
						A canvas where the frames are alive.
					</h1>
					<p className="mt-9 max-w-[560px] text-[18px] text-muted leading-[31px]">
						spool is a prototyping canvas that lives in your project folder. Your agent writes the screens as
						TSX and you click through the flow the way a user would.
					</p>
					<div className="mt-12">
						<Doors />
					</div>
				</section>

				<div className="pb-[36px]">
					<div className="overflow-hidden rounded-[14px]">
						<CanvasPlate w={1280} h={700} scale={1.15} />
					</div>
					<p className={cn("mt-5 text-[11px] text-muted/70 leading-none", MONO)}>
						one project, five frames, three of them linked into a walk
					</p>
				</div>

				<Band
					rootRef={rootRef}
					title="See it before you build it."
					body={
						<>
							<p>
								A frame is one TSX component in your project, rendered live. The select opens, the field
								takes text, and pressing play walks the flow at full size.
							</p>
							<p className="mt-5">
								The frame in this plate is the real thing, running on this page. Answer it.
							</p>
						</>
					}
				>
					<LivePlate w={620} h={520} />
				</Band>

				<Band
					rootRef={rootRef}
					flip
					title="Make variations until one feels right."
					body={
						<>
							<p>
								Half the time you know what you want and not what it looks like. Ask for four readings of
								the same screen and they land as{" "}
								<span className={cn("text-[15px] text-text", MONO)}>--</span> siblings on the canvas, side
								by side at true size.
							</p>
							<p className="mt-5">
								Look at them together, keep the one that works, and put the rest in the trash. The
								decision is the point; the takes are cheap.
							</p>
						</>
					}
				>
					<TakesPlate w={620} h={520} k={0.196} />
				</Band>

				<Band
					rootRef={rootRef}
					title="It lives in your repo."
					body={
						<>
							<p>
								spool writes to <span className={cn("text-[15px] text-text", MONO)}>design/</span> beside
								your source. A frame is a folder, a component is a file, and git tracks all of it.
							</p>
							<p className="mt-5">
								The daemon runs on your own machine, so the canvas is a projection of files you already
								own. Branch it, review it, delete it.
							</p>
						</>
					}
				>
					<RepoPlate w={620} h={520} />
				</Band>

				<Band
					rootRef={rootRef}
					flip
					title="The agent types. You decide."
					body={
						<>
							<p>
								<span className={cn("text-[15px] text-text", MONO)}>spool skill</span> prints the whole
								contract, so an agent in your repo knows how to author a frame without being told twice.
							</p>
							<p className="mt-5">
								It writes the files. You move them on the field, draw the links between them, walk the
								result, and say which one is right.
							</p>
						</>
					}
				>
					<DirectPlate w={620} h={520} k={0.38} />
				</Band>

				{/* the first minute */}
				<section className="pt-[110px] pb-[120px]">
					<Reveal rootRef={rootRef}>
						<h2 className="font-semibold text-[44px] leading-[1.08] tracking-[-0.032em]">
							A minute with spool
						</h2>
						<p className="mt-6 max-w-[520px] text-[17px] text-muted leading-[29px]">
							From nothing to a walkable flow, in the order it actually happens.
						</p>
					</Reveal>

					<Reveal rootRef={rootRef} delay={0.08} className="mt-[72px] grid grid-cols-2 gap-x-[92px] gap-y-[56px]">
						{STEPS.map((s) => (
							<div key={s.n} className="max-w-[500px]">
								<div className={cn("text-[13px] text-thread leading-none", MONO)}>{s.n}</div>
								<h3 className="mt-5 font-semibold text-[21px] leading-none tracking-[-0.018em]">
									{s.head}
								</h3>
								<p className="mt-4 text-[15px] text-muted leading-[26px]">{s.body}</p>
								<p className={cn("mt-5 text-[12px] text-text/70 leading-none", MONO)}>{s.mono}</p>
							</div>
						))}
					</Reveal>

					<Reveal rootRef={rootRef} delay={0.14} className="mt-[92px]">
						<VideoPlate />
					</Reveal>
				</section>

				{/* bookend */}
				<section className="pb-[130px]">
					<Reveal rootRef={rootRef}>
						<h2 className="max-w-[900px] font-semibold text-[52px] leading-[1.08] tracking-[-0.034em]">
							MIT. Fork it, rework it, rename it, ship it.
						</h2>
						<p className="mt-7 max-w-[540px] text-[17px] text-muted leading-[29px]">
							It is a tool for designing things, so make it your own if you want to. spool is pre-1.0 and
							designed on its own canvas: this page is one of {FRAME_COUNT} frames there, across{" "}
							{PAGE_COUNT} pages.
						</p>
						<div className="mt-12">
							<Doors />
						</div>
					</Reveal>
				</section>

				<footer className="flex items-center justify-between border-border border-t py-9">
					<div className="flex items-center gap-3">
						<SpoolMark className="h-[18px] w-[14px] text-thread" />
						<span className="text-[14px] text-muted">spool.page</span>
					</div>
					<div className="flex items-center gap-8 text-[14px] text-muted">
						<a href="/docs" className="transition-colors duration-200 hover:text-text">
							Docs
						</a>
						<a href={REPO_URL} className="transition-colors duration-200 hover:text-text">
							GitHub
						</a>
						<a
							href={`${REPO_URL}/blob/main/LICENSE.md`}
							className="transition-colors duration-200 hover:text-text"
						>
							MIT
						</a>
					</div>
				</footer>
			</div>
		</div>
	);
}
