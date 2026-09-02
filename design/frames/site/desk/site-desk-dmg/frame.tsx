import { type PanInfo, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * site-desk--dmg. The Mac app argued download-first: the page is the install.
 *
 * The hero is not a picture of the product, it is the disk image you are about
 * to mount, standing open with Spool.app on the left and the Applications alias
 * on the right. You drag the icon across and it lands, which is the entire
 * install and also the only interaction on the page. The step list under it is
 * bound to that drag: doing the thing is what advances it, so nothing here is a
 * caption describing a screenshot.
 *
 * After the ritual the page answers the three questions a download page owes
 * you and stops. What it looks like moving (a video slot, poster only, since
 * frames carry no video). What the other door is, for someone who lives in the
 * terminal and would rather type. What the first window shows before you have
 * done anything, which is an empty project and the one gesture that fills it.
 *
 * The numbers are desktop/README.md's: Apple silicon, macOS 14 or later, a
 * compressed dmg around 168 MB, signed with a Developer ID and notarized, and a
 * bundle that carries the published spool.page of its own version.
 *
 * Scrolls inside the 1440x900 stage.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

const dotGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 9%, transparent) 1px, transparent 1px)",
	backgroundSize: "24px 24px",
};

const volumeDepth: CSSProperties = {
	boxShadow: [
		"0 2px 2px rgba(0,0,0,0.3)",
		"0 24px 48px rgba(0,0,0,0.46)",
		"0 70px 140px -22px rgba(0,0,0,0.8)",
		"inset 0 1px 0 rgba(255,255,255,0.07)",
	].join(","),
};

/* ── glyphs ───────────────────────────────────────────────────────────── */

function DownGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path
				d="M7 2v7.2M3.9 6.4 7 9.5l3.1-3.1M2.6 12h8.8"
				stroke="currentColor"
				strokeWidth="1.35"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Tick({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M2.5 6.5 5 8.75 9.5 3.5"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CopyGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<rect x="4.25" y="4.25" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
			<path
				d="M2.75 7.75h-.5a.75.75 0 0 1-.75-.75V2.25a.75.75 0 0 1 .75-.75H7a.75.75 0 0 1 .75.75v.5"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function PlayTri({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M3.2 1.8 10 6 3.2 10.2Z" />
		</svg>
	);
}

/** the Applications folder, drawn the way the Finder alias reads at 64px. */
function AppsFolder({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 64 56" className={className} fill="none" aria-hidden="true">
			<path
				d="M2 10.5A3.5 3.5 0 0 1 5.5 7h17.2l5.4 6.2h31.4A3.5 3.5 0 0 1 63 16.7v33.8A3.5 3.5 0 0 1 59.5 54h-54A3.5 3.5 0 0 1 2 50.5z"
				fill="currentColor"
				opacity="0.14"
			/>
			<path
				d="M2 10.5A3.5 3.5 0 0 1 5.5 7h17.2l5.4 6.2h31.4A3.5 3.5 0 0 1 63 16.7v33.8A3.5 3.5 0 0 1 59.5 54h-54A3.5 3.5 0 0 1 2 50.5z"
				stroke="currentColor"
				strokeWidth="1.6"
				opacity="0.55"
			/>
			<path d="M2 20h61" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
		</svg>
	);
}

/* ── copy-to-clipboard command line ───────────────────────────────────── */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function CommandLine({ prompt, command }: { prompt: string; command: string }) {
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
			onClick={() => {
				void copyText(command).then((ok) => {
					if (!ok) return;
					setCopied(true);
					if (timer.current !== null) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => setCopied(false), 1500);
				});
			}}
			aria-label={copied ? `Copied ${command}` : `Copy ${command}`}
			className="group/cmd flex w-full cursor-pointer items-center gap-2 text-left font-mono text-[13px] leading-7 focus-visible:outline-none"
		>
			<span className="select-none text-muted/80">{prompt}</span>
			<span className="text-text">{command}</span>
			<span className="relative ml-auto block h-3 w-3 shrink-0">
				<CopyGlyph
					className={cn(
						"absolute inset-0 text-muted opacity-0 transition-opacity duration-150",
						copied ? "" : "group-hover/cmd:opacity-100",
					)}
				/>
				<Tick
					className={cn(
						"absolute inset-0 text-thread transition-opacity duration-150",
						copied ? "opacity-100" : "opacity-0",
					)}
				/>
			</span>
		</button>
	);
}

/* ── arrive on scroll ─────────────────────────────────────────────────── */

function Arrive({
	children,
	delay = 0,
	className,
}: {
	children: React.ReactNode;
	delay?: number;
	className?: string;
}) {
	const reduce = useReducedMotion() === true;
	if (reduce) return <div className={className}>{children}</div>;
	return (
		<motion.div
			className={className}
			initial={{ opacity: 0, y: 18 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.25 }}
			transition={{ duration: 0.55, ease: EASE, delay }}
		>
			{children}
		</motion.div>
	);
}

/* ── the mounted volume, which is the hero and the only control ───────── */

const APP_SLOT = { x: 372, y: 118 };
const ICON_SLOT = { x: 84, y: 118 };

function SpoolAppIcon({ size = 96 }: { size?: number }) {
	return (
		<div
			className="flex items-center justify-center rounded-[22px] border border-thread/25"
			style={{
				width: size,
				height: size,
				background: "linear-gradient(160deg, #2A1211 0%, #150B0A 62%, #0F0908 100%)",
			}}
		>
			<SpoolMark className="h-[58px] w-[46px] text-thread" title="Spool" />
		</div>
	);
}

function Volume({ installed, onInstall }: { installed: boolean; onInstall: () => void }) {
	const reduce = useReducedMotion() === true;
	const [dragging, setDragging] = useState(false);

	function end(_event: unknown, info: PanInfo) {
		setDragging(false);
		if (info.offset.x > 170 && Math.abs(info.offset.y) < 130) onInstall();
	}

	return (
		<div
			className="relative overflow-hidden rounded-[11px] border border-white/10 bg-bg"
			style={{ width: 620, height: 396, ...volumeDepth }}
		>
			{/* the volume's title bar */}
			<div className="relative flex h-[38px] items-center border-border border-b bg-surface px-3.5">
				<div className="flex items-center gap-2">
					{["#FF5F57", "#FEBC2E", "#28C840"].map((fill) => (
						<span key={fill} className="block h-[11px] w-[11px] rounded-full" style={{ background: fill }} />
					))}
				</div>
				<span className="-translate-x-1/2 absolute left-1/2 font-medium text-[12px] leading-none">Spool</span>
				<span className="ml-auto font-mono text-[10px] text-muted leading-none">mounted</span>
			</div>

			{/* the volume's background */}
			<div className="relative h-[358px]" style={dotGrid}>
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"radial-gradient(560px 320px at 50% 40%, color-mix(in srgb, var(--color-thread) 9%, transparent), transparent 72%)",
					}}
				/>
				<SpoolMark className="-right-12 -bottom-20 pointer-events-none absolute h-[300px] w-[240px] text-text/[0.03]" />

				{/* the arrow between the two slots */}
				<svg
					className="pointer-events-none absolute top-0 left-0"
					width={620}
					height={358}
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M 208 166 L 348 166"
						stroke="var(--color-thread)"
						strokeWidth="1.4"
						strokeDasharray="5 5"
						strokeLinecap="round"
						opacity={installed ? 0.2 : 0.6}
					/>
					<path
						d="M 358 166 L 344 160 L 344 172 Z"
						fill="var(--color-thread)"
						opacity={installed ? 0.2 : 0.6}
					/>
				</svg>

				{/* the Applications slot */}
				<div
					className="absolute flex w-[152px] flex-col items-center gap-3"
					style={{ left: APP_SLOT.x, top: APP_SLOT.y }}
				>
					<div className="relative flex h-[96px] w-[96px] items-center justify-center">
						<AppsFolder className="h-[76px] w-[86px] text-text/70" />
						{installed ? (
							<motion.div
								className="absolute mt-5"
								initial={reduce ? false : { scale: 0.6, opacity: 0 }}
								animate={{ scale: 1, opacity: 1 }}
								transition={{ type: "spring", stiffness: 380, damping: 24 }}
							>
								<div
									className="flex h-[52px] w-[52px] items-center justify-center rounded-[12px] border border-thread/30"
									style={{ background: "linear-gradient(160deg, #2A1211 0%, #120A09 100%)" }}
								>
									<SpoolMark className="h-8 w-[26px] text-thread" />
								</div>
							</motion.div>
						) : null}
					</div>
					<span className="font-mono text-[12px] text-muted leading-none">Applications</span>
				</div>

				{/* the app, which is the thing you drag */}
				<div
					className="absolute flex w-[152px] flex-col items-center gap-3"
					style={{ left: ICON_SLOT.x, top: ICON_SLOT.y }}
				>
					{installed ? (
						<>
							<div className="flex h-[96px] w-[96px] items-center justify-center">
								<span className="block h-[76px] w-[76px] rounded-[20px] border border-dashed border-border-raised" />
							</div>
							<span className="font-mono text-[12px] text-muted/60 leading-none">Spool.app</span>
						</>
					) : (
						<>
							<motion.div
								drag={reduce ? false : true}
								dragSnapToOrigin
								dragElastic={0.16}
								dragMomentum={false}
								onDragStart={() => setDragging(true)}
								onDragEnd={end}
								whileDrag={{ scale: 1.06 }}
								className="cursor-grab active:cursor-grabbing"
								animate={
									reduce || dragging
										? undefined
										: { y: [0, -5, 0] }
								}
								transition={{ duration: 3.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
							>
								<SpoolAppIcon />
							</motion.div>
							<span className="font-mono text-[12px] text-text leading-none">Spool.app</span>
						</>
					)}
				</div>

				<div className="absolute inset-x-0 bottom-4 text-center font-mono text-[11px] leading-none">
					{installed ? (
						<span className="text-thread">Installed. Open it from Launchpad.</span>
					) : (
						<span className="text-muted">Drag Spool.app onto Applications</span>
					)}
				</div>
			</div>
		</div>
	);
}

/* ── the steps, bound to the drag ─────────────────────────────────────── */

const STEPS: readonly { n: string; title: string; body: string }[] = [
	{ n: "01", title: "Download Spool.dmg", body: "One file, 168 MB. Signed with a Developer ID and notarized." },
	{ n: "02", title: "Drag it to Applications", body: "The bundle carries the spool npm ships, so it runs on its own." },
	{ n: "03", title: "Press + and pick a folder", body: "That folder is a project from then on, and its frames live inside it." },
];

function Steps({ done }: { done: number }) {
	return (
		<ol className="border-border border-t">
			{STEPS.map((step, i) => {
				const complete = i < done;
				const current = i === done;
				return (
					<li key={step.n} className="flex gap-5 border-border border-b py-4">
						<span
							className={cn(
								"mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border font-mono text-[10px] leading-none transition-colors duration-300",
								complete
									? "border-thread bg-thread text-on-thread"
									: current
										? "border-thread text-thread"
										: "border-border-raised text-muted",
							)}
						>
							{complete ? <Tick className="h-2.5 w-2.5" /> : step.n}
						</span>
						<div>
							<div
								className={cn(
									"font-medium text-[14px] leading-5 transition-colors duration-300",
									complete || current ? "text-text" : "text-muted",
								)}
							>
								{step.title}
							</div>
							<div className="mt-1 text-[13px] text-muted leading-5">{step.body}</div>
						</div>
					</li>
				);
			})}
		</ol>
	);
}

/* ── the video slot ───────────────────────────────────────────────────── */

/**
 * A poster, not a play button dropped on a picture. The still is the first and
 * the last shot of the take side by side, the folder before and the canvas
 * after, and the control is a pill in the corner so it covers nothing.
 */
function VideoSlot() {
	return (
		<div className="group/vid relative w-full cursor-pointer overflow-hidden rounded-[10px] border border-border bg-canvas">
			<div className="relative" style={{ paddingTop: "46%" }}>
				<div className="absolute inset-0" style={dotGrid}>
					<div
						className="absolute inset-0"
						style={{
							background:
								"radial-gradient(680px 380px at 56% 44%, color-mix(in srgb, var(--color-thread) 11%, transparent), transparent 70%)",
						}}
					/>
					<div className="absolute inset-0 flex items-center justify-center gap-8 px-10 pb-5">
						{/* before: the folder */}
						<div className="w-[176px] shrink-0 rounded-[8px] border border-border bg-surface p-3.5">
							<div className="font-mono text-[11px] text-muted leading-5">~/projects/tvarso</div>
							<div className="mt-2.5 space-y-1">
								{["src/", "package.json", "README.md"].map((line) => (
									<div key={line} className="font-mono text-[11px] text-muted/70 leading-5">
										{line}
									</div>
								))}
								<div className="font-mono text-[11px] text-thread leading-5">design/</div>
							</div>
						</div>
						<svg className="h-3 w-16 shrink-0" viewBox="0 0 64 12" fill="none" aria-hidden="true">
							<path
								d="M0 6h52"
								stroke="var(--color-thread)"
								strokeWidth="1.3"
								strokeDasharray="4 5"
								strokeLinecap="round"
								opacity="0.7"
							/>
							<path d="M62 6 48 1.6v8.8Z" fill="var(--color-thread)" opacity="0.7" />
						</svg>
						{/* after: the canvas */}
						<div className="w-[420px] shrink-0 overflow-hidden rounded-[8px] border border-border bg-canvas">
							<div className="flex h-[26px] items-center gap-1.5 border-border border-b bg-surface px-3">
								{["#FF5F57", "#FEBC2E", "#28C840"].map((fill) => (
									<span
										key={fill}
										className="block h-[8px] w-[8px] rounded-full"
										style={{ background: fill }}
									/>
								))}
								<span className="ml-3 font-mono text-[10px] text-muted leading-none">tvarso</span>
							</div>
							<div className="relative h-[196px]" style={dotGrid}>
								{[
									{ x: 30, y: 32, w: 92, h: 124, rows: 5, lit: true },
									{ x: 164, y: 22, w: 106, h: 84, rows: 4 },
									{ x: 164, y: 122, w: 106, h: 52, rows: 2 },
									{ x: 306, y: 56, w: 78, h: 84, rows: 3 },
								].map((tile) => (
									<span
										key={`${tile.x}-${tile.y}`}
										className={cn(
											"absolute block space-y-[6px] overflow-hidden rounded-[4px] border bg-surface p-2",
											tile.lit === true ? "border-thread" : "border-border",
										)}
										style={{ left: tile.x, top: tile.y, width: tile.w, height: tile.h }}
									>
										<span className="block h-[5px] w-[62%] rounded-[1px] bg-raised" />
										{Array.from({ length: tile.rows }, (_, r) => (
											<span
												key={r}
												className="block h-[3px] rounded-full bg-border-raised"
												style={{ width: `${86 - r * 13}%` }}
											/>
										))}
										{tile.lit === true ? (
											<span className="mt-1 block h-[10px] w-full rounded-[2px] bg-thread/70" />
										) : null}
									</span>
								))}
								<svg
									className="pointer-events-none absolute top-0 left-0"
									width={420}
									height={196}
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M 122 94 C 146 94, 146 64, 158 64"
										stroke="var(--color-thread)"
										strokeWidth="1.3"
										strokeLinecap="round"
										opacity="0.8"
									/>
									<path d="M 166 64 L 156 60 L 156 68 Z" fill="var(--color-thread)" opacity="0.8" />
									<path
										d="M 270 64 C 292 64, 292 98, 300 98"
										stroke="var(--color-thread)"
										strokeWidth="1.3"
										strokeLinecap="round"
										opacity="0.8"
									/>
									<path d="M 308 98 L 298 94 L 298 102 Z" fill="var(--color-thread)" opacity="0.8" />
								</svg>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-4">
				<span className="flex items-center gap-2.5 rounded-full border border-thread/40 bg-bg/80 py-2 pr-4 pl-3.5 font-mono text-[12px] text-text leading-none backdrop-blur-[6px] transition-transform duration-300 ease-out group-hover/vid:scale-[1.03]">
					<PlayTri className="h-3 w-3 text-thread" />
					Play the walkthrough
					<span className="text-muted">2:14</span>
				</span>
				<span className="font-mono text-[11px] text-muted leading-none">
					An empty folder at 0:00, a walkable flow at 2:14
				</span>
			</div>
		</div>
	);
}

/* ── the first run ────────────────────────────────────────────────────── */

function FirstRun() {
	return (
		<div
			className="overflow-hidden rounded-[10px] border border-white/10 bg-bg"
			style={{ height: 320, ...volumeDepth }}
		>
			<div className="relative flex h-[36px] items-center border-border border-b bg-surface px-3.5">
				<div className="flex items-center gap-2">
					{["#FF5F57", "#FEBC2E", "#28C840"].map((fill) => (
						<span key={fill} className="block h-[11px] w-[11px] rounded-full" style={{ background: fill }} />
					))}
				</div>
				<span className="-translate-x-1/2 absolute left-1/2 font-medium text-[12px] leading-none">Spool</span>
			</div>
			<div className="flex h-[32px] items-center gap-1 border-border border-b px-2">
				<span className="flex h-[22px] items-center gap-1.5 rounded-[5px] bg-raised px-2.5 font-mono text-[11px] text-text leading-none">
					<span className="text-thread">+</span>
					Open a folder
				</span>
			</div>
			<div className="flex h-[252px] flex-col items-center justify-center gap-4" style={dotGrid}>
				<SpoolMark className="h-8 w-[26px] text-thread opacity-40" />
				<div className="font-mono text-[13px] text-text leading-none">no frames yet</div>
				<p className="w-[380px] text-center font-mono text-[11px] text-muted leading-5">
					Press + to pick a folder. Your agent writes the first frame, and it lands here while you watch.
				</p>
			</div>
		</div>
	);
}

/* ── the frame ────────────────────────────────────────────────────────── */

export default function SiteDeskDmg() {
	const [installed, setInstalled] = useState(false);

	return (
		<div className="h-full w-full overflow-y-auto overflow-x-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{/* ── hero ───────────────────────────────────────────────────── */}
			<section className="relative h-[900px] w-full overflow-hidden">
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"radial-gradient(1000px 700px at 72% 56%, color-mix(in srgb, var(--color-thread) 12%, transparent), transparent 68%)",
					}}
				/>

				<header className="relative flex items-center justify-between px-[76px] pt-8">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-[18px] w-[18px] text-thread" title="spool" />
						<span className="font-semibold text-md tracking-tight">spool</span>
					</div>
					<div className="flex items-center gap-7 font-mono text-[12px] text-muted">
						<span className="text-text">spool.page</span>
						<a href="https://github.com/liamvinberg/spool" className="hover:text-text">
							github
						</a>
						<span>v0.6.0</span>
					</div>
				</header>

				<div className="relative grid h-[calc(900px-104px)] grid-cols-[520px_1fr] items-center gap-16 px-[76px]">
					<div>
						<h1 className="font-semibold text-[56px] leading-[0.97] tracking-[-0.025em]">
							Download it.
							<br />
							Drag it.
							<br />
							Open a folder.
						</h1>
						<p className="mt-6 max-w-[440px] text-[16px] text-muted leading-[25px]">
							Spool.dmg carries the daemon, the canvas and the same CLI npm publishes. The window opens on
							a Mac that has never had Node on it.
						</p>

						<div className="mt-8 flex items-center gap-4">
							<a
								href="https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg"
								className="inline-flex items-center gap-2.5 rounded-md bg-thread px-5 py-3.5 font-medium text-[15px] text-on-thread leading-none transition-transform duration-200 ease-out hover:-translate-y-0.5"
							>
								<DownGlyph className="h-4 w-4" />
								Download Spool.dmg
							</a>
							<span className="font-mono text-[11px] text-muted leading-4">
								Apple silicon
								<br />
								macOS 14 or later
							</span>
						</div>

						<div className="mt-9 w-[440px]">
							<Steps done={installed ? 2 : 0} />
						</div>
					</div>

					<div className="flex flex-col items-center">
						<Volume
							installed={installed}
							onInstall={() => {
								setInstalled(true);
							}}
						/>
						<div className="mt-6 flex w-[620px] items-center justify-between font-mono text-[11px] text-muted leading-none">
							<span>Spool 0.6.0</span>
							<span>It checks GitHub for a newer release and updates itself in place.</span>
						</div>
					</div>
				</div>
			</section>

			{/* ── the video ──────────────────────────────────────────────── */}
			<section className="px-[76px] pt-[110px]">
				<Arrive className="flex items-end justify-between gap-8 border-border border-b pb-4">
					<h2 className="font-semibold text-[34px] leading-[1.08] tracking-[-0.02em]">
						Two minutes, start to walk.
					</h2>
					<span className="shrink-0 pb-1.5 font-mono text-[11px] text-muted leading-none">
						recorded in one take
					</span>
				</Arrive>
				<Arrive delay={0.06} className="mt-9 flex gap-14">
					<p className="w-[300px] shrink-0 text-[15px] text-muted leading-[25px]">
						An empty repository, a folder picked, an agent asked for a checkout, and four frames linked into
						a flow you can click through. Nothing is sped up.
					</p>
					<div className="min-w-0 flex-1">
						<VideoSlot />
					</div>
				</Arrive>
			</section>

			{/* ── the second door ────────────────────────────────────────── */}
			<section className="px-[76px] pt-[120px]">
				<Arrive className="flex items-end justify-between gap-8 border-border border-b pb-4">
					<h2 className="font-semibold text-[34px] leading-[1.08] tracking-[-0.02em]">
						Or type it, if that is where you live.
					</h2>
					<span className="shrink-0 pb-1.5 font-mono text-[11px] text-muted leading-none">Node 22+</span>
				</Arrive>
				<Arrive delay={0.06} className="mt-9 flex gap-14">
					<div className="w-[420px] shrink-0">
						<p className="text-[15px] text-muted leading-[25px]">
							The CLI and the app drive one daemon. Install both and whichever starts second adopts what
							is already running, so the canvas in the window and the canvas at localhost:7766 are the
							same canvas.
						</p>
						<p className="mt-5 text-[15px] text-muted leading-[25px]">
							The app checks GitHub for a newer release and updates itself in place when it finds one.
						</p>
					</div>
					<div className="min-w-0 flex-1">
						<div className="overflow-hidden rounded-[10px] border border-border bg-surface">
							<div className="flex items-center gap-2 border-border border-b bg-canvas px-4 py-2.5">
								<span className="block h-1.5 w-1.5 rounded-full bg-thread" />
								<span className="font-mono text-[11px] text-muted leading-none">~/projects/tvarso</span>
							</div>
							<div className="px-4 py-3">
								<CommandLine prompt="~ $" command="npm i -g spool.page" />
								<CommandLine prompt="~/projects/tvarso $" command="spool init" />
								<CommandLine prompt="~/projects/tvarso $" command="spool serve" />
							</div>
							<div className="border-border border-t px-4 py-3 font-mono text-[11px] text-muted leading-5">
								The canvas wants Chrome. macOS and Linux, and WSL on Windows.
							</div>
						</div>
					</div>
				</Arrive>
			</section>

			{/* ── the first window ───────────────────────────────────────── */}
			<section className="px-[76px] pt-[120px]">
				<Arrive className="flex items-end justify-between gap-8 border-border border-b pb-4">
					<h2 className="font-semibold text-[34px] leading-[1.08] tracking-[-0.02em]">
						The first window is empty.
					</h2>
					<span className="shrink-0 pb-1.5 font-mono text-[11px] text-muted leading-none">
						and says so, in one line
					</span>
				</Arrive>
				<Arrive delay={0.06} className="mt-9 flex gap-14">
					<div className="w-[340px] shrink-0">
						<p className="text-[15px] text-muted leading-[25px]">
							Spool opens with a field and one button. Press +, pick a folder, and design/ appears inside
							it. From there your agent writes frames and they land on the field as the files hit the
							disk.
						</p>
						<p className="mt-5 font-mono text-[12px] text-muted leading-6">
							Everything stays in that folder, and git tracks it beside your code.
						</p>
					</div>
					<div className="min-w-0 flex-1">
						<FirstRun />
					</div>
				</Arrive>
			</section>

			{/* ── the licence and the foot ───────────────────────────────── */}
			<section className="px-[76px] pt-[120px] pb-[110px]">
				<Arrive className="flex gap-14 border-border border-t pt-12">
					<h2 className="w-[480px] shrink-0 font-semibold text-[38px] leading-[1.04] tracking-[-0.02em]">
						MIT. Fork it, rework it,
						<br />
						rename it, ship it.
					</h2>
					<div className="flex-1 pt-2">
						<p className="max-w-[520px] text-[15px] text-muted leading-[25px]">
							It is a tool for designing things, so make it your own if you want to. The DMG job in the
							repository builds and notarizes a fork's own app with a fork's own certificate, and the
							wizard that sets that up ships with it.
						</p>
						<div className="mt-7 flex items-center gap-4">
							<a
								href="https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg"
								className="inline-flex items-center gap-2.5 rounded-md bg-thread px-4 py-3 font-medium text-[14px] text-on-thread leading-none transition-transform duration-200 ease-out hover:-translate-y-0.5"
							>
								<DownGlyph className="h-3.5 w-3.5" />
								Download Spool.dmg
							</a>
							<a
								href="https://github.com/liamvinberg/spool"
								className="font-mono text-[12px] text-muted leading-none hover:text-text"
							>
								github.com/liamvinberg/spool
							</a>
						</div>
					</div>
				</Arrive>

				<Arrive delay={0.06}>
					<div className="mt-16 flex items-center justify-between border-border border-t pt-7">
						<div className="flex items-center gap-3">
							<SpoolMark className="h-4 w-4 text-thread" />
							<span className="text-[13px] text-muted">spool.page</span>
						</div>
						<span className="font-mono text-[11px] text-muted leading-none">
							Pre-1.0, published and dogfooded daily.
						</span>
					</div>
				</Arrive>
			</section>
		</div>
	);
}
