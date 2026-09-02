import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { type UIEvent, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";
import { MOMENTS, RUN_CLOCK, RUN_SECONDS, RecScreen, momentAt } from "./moments";

/**
 * site-film--scrub. The wheel is the transport.
 *
 * The argument: a landing already asks you to scroll, so let the scroll do the
 * one job this page has. There is no play control and nothing to press. The
 * stage is pinned, the six moments pass through it as the track goes by, and the
 * clock in the corner counts up with the page, which is what tells you within a
 * second of arriving that scrolling and watching are the same act here.
 *
 * The index down the left is the only navigation, and it is a readout rather than
 * a menu: the playhead slides along the hairline and the row it reaches lights.
 * Pressing a row is honest too, since it just moves the scroll to that chapter's
 * stretch of track.
 *
 * The last stretch of track is the outro, where the still dims behind the licence
 * and the install line. It has to be earned by reaching the end of the run.
 */

const STAGE_H = 900;
const TRACK_H = 5400;
const SCROLL = TRACK_H - STAGE_H;

/** the track's budget: a title beat, six chapters, an outro. */
const FIRST = 0.06;
const LAST = 0.86;
const SPAN = (LAST - FIRST) / MOMENTS.length;

/** the stage: 16:9 exactly, so the capture lands on it without a letterbox. */
const STILL_X = 372;
const STILL_Y = 100;
const STILL_W = 960;
const STILL_H = 540;

const INDEX_X = 72;
const INDEX_Y = 280;
const ROW_PITCH = 64;
const INDEX_H = (MOMENTS.length - 1) * ROW_PITCH;

const EASE = [0.22, 1, 0.36, 1] as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const rampAt = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));

const indexAt = (v: number) => {
	const raw = Math.floor((v - FIRST) / SPAN);
	return raw < 0 ? 0 : raw > MOMENTS.length - 1 ? MOMENTS.length - 1 : raw;
};

/**
 * The run's clock, counting with the track rather than with a timer. It is read
 * per chapter rather than straight off the track, because the six chapters take
 * an equal share of the scroll and an unequal share of the recording: a linear
 * reading has the clock saying 06:46 while the caption says chapter 3.
 */
function clockAt(v: number): string {
	const i = indexAt(v);
	const local = clamp01((v - (FIRST + i * SPAN)) / SPAN);
	const from = momentAt(i).at;
	const to = i === MOMENTS.length - 1 ? RUN_SECONDS : momentAt(i + 1).at;
	const seconds = v < FIRST ? 0 : Math.round(from + (to - from) * local);
	const mm = Math.floor(seconds / 60);
	const ss = seconds % 60;
	return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function DownGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 14" fill="none" aria-hidden="true" className={className}>
			<path
				d="M6 1.5v9M2.5 7 6 10.5 9.5 7"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export default function SiteFilmScrub() {
	const p = useMotionValue(0);
	const [idx, setIdx] = useState(0);
	const [clock, setClock] = useState("00:00");

	const railFill = useTransform(p, (v: number) => `${String(clamp01(v) * 100)}%`);
	/** the playhead's offset inside the index block, which starts 26px above row one */
	const headY = useTransform(p, (v: number) => 23 + rampAt(v, FIRST, LAST) * INDEX_H);
	const titleOpacity = useTransform(p, (v: number) => 1 - rampAt(v, 0.005, 0.045));
	const captionOpacity = useTransform(p, (v: number) => rampAt(v, 0.05, 0.085));
	const outro = useTransform(p, (v: number) => rampAt(v, LAST + 0.02, 0.98));
	const stillDim = useTransform(p, (v: number) => 1 - 0.72 * rampAt(v, LAST + 0.02, 0.98));
	const beat = useTransform(p, (v: number) => {
		const local = clamp01((v - (FIRST + indexAt(v) * SPAN)) / SPAN);
		return `${String(local * 100)}%`;
	});

	function onScroll(e: UIEvent<HTMLDivElement>) {
		const v = e.currentTarget.scrollTop / SCROLL;
		p.set(v);
		const next = indexAt(v);
		setIdx((c) => (c === next ? c : next));
		const c = clockAt(v);
		setClock((prev) => (prev === c ? prev : c));
	}

	function cue(i: number) {
		const el = document.getElementById("film-track")?.parentElement;
		if (el === null || el === undefined) return;
		el.scrollTo({ top: (FIRST + i * SPAN + SPAN * 0.35) * SCROLL, behavior: "smooth" });
	}

	const here = momentAt(idx);

	return (
		<div
			onScroll={onScroll}
			className="h-full w-full overflow-y-auto bg-bg font-sans text-text antialiased [font-synthesis:none]"
		>
			<div id="film-track" className="relative w-full" style={{ height: TRACK_H }}>
				<div className="sticky top-0 h-[900px] w-full overflow-hidden">
					{/* the page's own playhead */}
					<div className="absolute top-0 right-0 left-0 z-20 h-[2px] bg-border">
						<motion.div className="h-full bg-thread" style={{ width: railFill }} />
					</div>

					<header className="absolute top-0 right-[72px] left-[72px] flex h-[76px] items-center justify-between">
						<div className="flex items-center gap-2.5">
							<SpoolMark className="h-5 w-5 text-thread" title="spool" />
							<span className="font-semibold text-md tracking-tight">spool</span>
						</div>
						<div className="flex items-center gap-7 font-mono text-[12px] leading-none">
							<span className="text-muted">github.com/liamvinberg/spool</span>
							<span className="tabular-nums">
								<span className="text-thread">{clock}</span>
								<span className="text-muted"> / {RUN_CLOCK}</span>
							</span>
						</div>
					</header>

					{/* the index: a readout with a playhead on it */}
					<div className="absolute" style={{ left: INDEX_X, top: INDEX_Y - 26 }}>
						<span
							className="absolute left-0 block w-px bg-border-raised"
							style={{ top: 26, height: INDEX_H + 14 }}
						/>
						<motion.span
							className="-left-[3px] absolute block h-[7px] w-[7px] rounded-full bg-thread"
							style={{ top: headY }}
						/>
						{MOMENTS.map((m, i) => (
							<button
								key={m.id}
								type="button"
								onClick={() => {
									cue(i);
								}}
								className="group absolute left-0 w-[210px] cursor-pointer pl-5 text-left focus-visible:outline-none"
								style={{ top: 26 + i * ROW_PITCH - 8 }}
							>
								<span
									className={cn(
										"block font-mono text-[11px] leading-none transition-colors duration-300",
										i === idx ? "text-thread" : "text-muted/60",
									)}
								>
									{m.clock}
								</span>
								<span
									className={cn(
										"mt-2 block text-[13px] leading-[18px] transition-colors duration-300",
										i === idx ? "text-text" : "text-muted/70 group-hover:text-muted",
									)}
								>
									{m.title}
								</span>
							</button>
						))}
					</div>

					{/* the stage */}
					<motion.div
						className="absolute overflow-hidden rounded-[10px] border border-border-raised bg-bg"
						style={{ left: STILL_X, top: STILL_Y, width: STILL_W, height: STILL_H, opacity: stillDim }}
					>
						<AnimatePresence initial={false}>
							<motion.div
								key={here.id}
								className="absolute inset-0"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.36, ease: EASE }}
							>
								<RecScreen id={here.id} width={STILL_W} height={STILL_H} />
							</motion.div>
						</AnimatePresence>
						<div className="absolute right-0 bottom-0 left-0 h-[2px] bg-border">
							<motion.div className="h-full bg-thread" style={{ width: beat }} />
						</div>
					</motion.div>

					{/* the words: the page's opening, then the chapter under the playhead */}
					<div className="absolute" style={{ left: STILL_X, top: STILL_Y + STILL_H + 44, width: 640 }}>
						<motion.div style={{ opacity: titleOpacity }}>
							<h1 className="font-semibold text-[42px] leading-[1.03] tracking-[-0.025em]">
								The first run, end to end.
							</h1>
							<p className="mt-4 flex items-center gap-3 text-[15px] text-muted leading-[24px]">
								<span className="text-thread">
									<DownGlyph className="h-4 w-3.5" />
								</span>
								Scrolling moves the playhead. Six moments, in the order they happened.
							</p>
						</motion.div>

						<motion.div className="absolute top-0 left-0 w-full" style={{ opacity: captionOpacity }}>
							<div className="font-mono text-[11px] text-muted/70 leading-none">
								chapter {idx + 1} of {MOMENTS.length} · {here.clock}
							</div>
							<h2 className="mt-4 font-medium text-[28px] leading-[34px] tracking-tight">{here.title}</h2>
							<p className="mt-3 max-w-[640px] text-[15px] text-muted leading-[24px]">{here.line}</p>
						</motion.div>
					</div>

					{/* what the machine is saying at this second, kept beside the stage */}
					<motion.div
						className="absolute flex gap-3.5"
						style={{ left: STILL_X + 700, top: STILL_Y + STILL_H + 44, opacity: captionOpacity }}
					>
						<span className="w-px shrink-0 self-stretch bg-thread/70" />
						<div className="w-[260px]">
							<div className="font-mono text-[13px] text-text leading-[20px]">{here.say}</div>
							<div className="mt-2 font-mono text-[11px] text-muted/60 leading-none">on screen</div>
						</div>
					</motion.div>

					{/* the outro, which the end of the run pays for */}
					<motion.div
						className="absolute flex items-center justify-center"
						style={{
							left: STILL_X,
							top: STILL_Y,
							width: STILL_W,
							height: STILL_H,
							opacity: outro,
							pointerEvents: "none",
						}}
					>
						<div className="w-[720px] rounded-[10px] border border-border-raised bg-surface px-12 py-11">
							<div className="text-[26px] leading-[34px]">
								MIT. Fork it, rework it, rename it, ship it.
							</div>
							<p className="mt-4 max-w-[540px] text-[15px] text-muted leading-[24px]">
								The canvas in the last chapter is design/ in this repo. 12 pages, 142 frames, tracked in
								git beside the source.
							</p>
							<div className="mt-9 flex gap-4">
								<span className="w-px shrink-0 self-stretch bg-thread/70" />
								<div>
									<div className="font-mono text-[15px] leading-[26px]">
										<span className="text-muted">~ $ </span>npm i -g spool.page
									</div>
									<p className="mt-2 text-[13px] text-muted/80 leading-[21px]">
										Node 22+, best in Chrome. There is a Mac app as well, Spool.dmg.
									</p>
								</div>
							</div>
							<div className="mt-9 flex items-center gap-7 border-border border-t pt-6 font-mono text-[12px] leading-none">
								<span className="text-text">github.com/liamvinberg/spool</span>
								<span className="text-muted">spool.page</span>
							</div>
						</div>
					</motion.div>
				</div>
			</div>
		</div>
	);
}
