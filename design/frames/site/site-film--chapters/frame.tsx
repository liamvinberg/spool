import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";
import { MOMENTS, RUN_CLOCK, RUN_SECONDS, RecScreen, ThumbScreen, momentAt } from "./moments";

/**
 * site-film--chapters. The recording as an index.
 *
 * The argument against a hero: nobody sits through eighteen minutes to find out
 * whether the "+" takes an existing repo. So the tutorial is cut into its six
 * beats and every beat is addressable. One player stays pinned on the left while
 * the beats are read down the right, and pressing a beat cues the player rather
 * than opening anything, so the page never loses its place.
 *
 * The rows carry the whole story in text. Someone who reads the six and never
 * presses play still leaves knowing what the install is, what the "+" does, where
 * the files land and what design/ in this repo holds. The video is the proof, not
 * the only copy of the argument.
 */

const PLAYER_W = 600;
const PLAYER_H = 338;
const EASE = [0.22, 1, 0.36, 1] as const;

const pctOf = (seconds: number) => (seconds / RUN_SECONDS) * 100;

function PlayGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M3.4 2.2 9.6 6 3.4 9.8Z" />
		</svg>
	);
}

function Player({ cue }: { cue: number }) {
	const here = momentAt(cue);
	return (
		<div
			className="relative overflow-hidden rounded-[9px] border border-border-raised bg-bg"
			style={{ width: PLAYER_W, height: PLAYER_H }}
		>
			<AnimatePresence initial={false}>
				<motion.div
					key={here.id}
					className="absolute inset-0"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.34, ease: EASE }}
				>
					<RecScreen id={here.id} width={PLAYER_W} height={PLAYER_H} />
				</motion.div>
			</AnimatePresence>

			<div className="pointer-events-none absolute inset-0 rounded-[9px] ring-1 ring-white/[0.04] ring-inset" />

			<button
				type="button"
				aria-label={`Play from ${here.clock}`}
				className="group absolute inset-0 flex cursor-pointer items-end justify-start p-5 focus-visible:outline-none"
			>
				<span className="flex items-center gap-3 rounded-full border border-border-raised bg-bg/85 py-2 pr-4 pl-2 backdrop-blur-[2px] transition-colors duration-200 group-hover:border-thread">
					<span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-thread text-on-thread">
						<PlayGlyph className="ml-[1px] h-[9px] w-[9px]" />
					</span>
					<span className="font-mono text-[11px] text-muted leading-none">
						play from <span className="text-text">{here.clock}</span>
					</span>
				</span>
			</button>
		</div>
	);
}

function Track({ cue, onCue }: { cue: number; onCue: (i: number) => void }) {
	const head = pctOf(momentAt(cue).at);
	return (
		<div className="mt-6 flex items-center gap-5">
			<span className="font-mono text-[11px] text-thread leading-none">{momentAt(cue).clock}</span>
			<div className="relative h-[12px] flex-1">
				<div className="absolute top-[5px] right-0 left-0 h-[2px] rounded-full bg-border-raised" />
				<motion.div
					className="absolute top-[5px] left-0 h-[2px] rounded-full bg-thread"
					initial={false}
					animate={{ width: `${String(head)}%` }}
					transition={{ duration: 0.45, ease: EASE }}
				/>
				{MOMENTS.map((m, i) => (
					<button
						key={m.id}
						type="button"
						aria-label={`Cue ${m.clock}`}
						onClick={() => {
							onCue(i);
						}}
						className="absolute top-0 h-[12px] w-[12px] cursor-pointer focus-visible:outline-none"
						style={{ left: `${String(pctOf(m.at))}%`, transform: "translateX(-50%)" }}
					>
						<span
							className={cn(
								"block h-[12px] w-px transition-colors duration-200",
								i <= cue ? "bg-thread" : "bg-border-raised hover:bg-muted",
							)}
						/>
					</button>
				))}
			</div>
			<span className="font-mono text-[11px] text-muted leading-none">{RUN_CLOCK}</span>
		</div>
	);
}

function Caption({ cue }: { cue: number }) {
	const here = momentAt(cue);
	return (
		<div className="mt-8 min-h-[152px]">
			<div className="font-mono text-[11px] text-muted/70 leading-none">
				chapter {cue + 1} of {MOMENTS.length}
			</div>
			<h2 className="mt-4 font-medium text-[24px] leading-[30px] tracking-tight">{here.title}</h2>
			<div className="mt-6 flex gap-3.5">
				<span className="w-px shrink-0 self-stretch bg-thread/70" />
				<div>
					<div className="font-mono text-[14px] text-text leading-none">{here.say}</div>
					<div className="mt-2.5 font-mono text-[11px] text-muted/60 leading-none">on screen at {here.clock}</div>
				</div>
			</div>
		</div>
	);
}

function Row({ index, cue, onCue }: { index: number; cue: number; onCue: (i: number) => void }) {
	const m = momentAt(index);
	const active = index === cue;
	return (
		<button
			type="button"
			onClick={() => {
				onCue(index);
			}}
			className={cn(
				"group flex w-full cursor-pointer items-start gap-5 border-border border-b py-6 pr-4 pl-5 text-left transition-colors duration-200 focus-visible:outline-none",
				active ? "bg-surface/60" : "hover:bg-surface/30",
			)}
		>
			<span
				className={cn(
					"-ml-5 block w-[2px] shrink-0 self-stretch transition-colors duration-200",
					active ? "bg-thread" : "bg-transparent",
				)}
			/>
			<span
				className={cn(
					"w-[52px] shrink-0 pt-[3px] font-mono text-[11px] leading-none transition-colors duration-200",
					active ? "text-thread" : "text-muted/70",
				)}
			>
				{m.clock}
			</span>
			<span
				className={cn(
					"block shrink-0 overflow-hidden rounded-[6px] border transition-colors duration-200",
					active ? "border-thread" : "border-border group-hover:border-border-raised",
				)}
			>
				<ThumbScreen id={m.id} width={150} />
			</span>
			<span className="min-w-0 flex-1">
				<span
					className={cn(
						"block text-[16px] leading-[22px] transition-colors duration-200",
						active ? "text-text" : "text-muted group-hover:text-text",
					)}
				>
					{m.title}
				</span>
				<span className="mt-2 block text-[13px] text-muted/75 leading-[20px]">{m.line}</span>
			</span>
		</button>
	);
}

function Closing() {
	return (
		<section className="border-border border-t px-[72px] py-[56px]">
			<div className="flex items-start justify-between gap-14">
				<div className="max-w-[420px]">
					<div className="text-[20px] leading-[28px]">MIT. Fork it, rework it, rename it, ship it.</div>
					<p className="mt-3 text-[14px] text-muted leading-[22px]">
						The canvas in the last chapter is design/ in this repo. 12 pages, 142 frames, tracked in git
						beside the source.
					</p>
				</div>

				<div className="flex gap-4">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div>
						<div className="font-mono text-[15px] leading-[26px]">
							<span className="text-muted">~ $ </span>npm i -g spool.page
						</div>
						<p className="mt-3 max-w-[300px] text-[13px] text-muted/80 leading-[21px]">
							Node 22+, best in Chrome. There is a Mac app as well, Spool.dmg.
						</p>
					</div>
				</div>

				<div className="flex flex-col items-end gap-3 font-mono text-[12px] leading-none">
					<span className="text-text">github.com/liamvinberg/spool</span>
					<span className="text-muted">spool.page</span>
					<span className="text-muted">Spool.dmg</span>
				</div>
			</div>
		</section>
	);
}

export default function SiteFilmChapters() {
	const [cue, setCue] = useState(0);

	return (
		<div className="h-full w-full overflow-y-auto bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<header className="flex h-[76px] items-center justify-between border-border border-b px-[72px]">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-5 w-5 text-thread" title="spool" />
					<span className="font-semibold text-md tracking-tight">spool</span>
				</div>
				<div className="flex items-center gap-7 font-mono text-[12px] text-muted leading-none">
					<span>spool.page</span>
					<span className="text-text">github.com/liamvinberg/spool</span>
				</div>
			</header>

			<div className="flex gap-16 px-[72px] pt-[52px] pb-[64px]">
				<div className="sticky top-0 shrink-0 self-start pb-8" style={{ width: PLAYER_W }}>
					<h1 className="font-semibold text-[40px] leading-[1.02] tracking-[-0.025em]">
						Pick the part you need.
					</h1>
					<p className="mt-5 max-w-[520px] text-[16px] text-muted leading-[25px]">
						The recording is one take, {RUN_CLOCK} end to end. Each chapter cues it where that part starts.
					</p>

					<div className="mt-10">
						<Player cue={cue} />
						<Track cue={cue} onCue={setCue} />
						<Caption cue={cue} />
					</div>
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex items-baseline justify-between border-border border-b pb-4 font-mono text-[11px] text-muted/70 leading-none">
						<span>{MOMENTS.length} chapters</span>
						<span>{RUN_CLOCK}</span>
					</div>
					{MOMENTS.map((m, i) => (
						<Row key={m.id} index={i} cue={cue} onCue={setCue} />
					))}
					<p className="mt-8 pl-5 text-[14px] text-muted/75 leading-[22px]">
						Every chapter is the same session. I started on a machine that had never seen spool and
						stopped when the canvas was this repo's own.
					</p>
				</div>
			</div>

			<Closing />
		</div>
	);
}
