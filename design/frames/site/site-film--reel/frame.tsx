import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";
import { MOMENTS, REC_H, REC_W, RUN_CLOCK, RUN_SECONDS, RecStill, ThumbScreen, momentAt } from "./moments";

/**
 * site-film--reel. The recording is the page.
 *
 * The argument: spool is a thing you watch someone use before it is a thing you
 * read about, so the capture gets the room and the words get a column. The band
 * on the right is the recording, full height and bleeding off the right edge,
 * cropped rather than letterboxed so it reads as film instead of as an embed. The
 * left column is everything a landing has to say, set once, at rest, never moving
 * while the band changes underneath the transport.
 *
 * The transport is the whole tutorial in one control. Six ticks on the track,
 * placed at the second each chapter actually starts, and pressing one cues the
 * band. Press play and it walks the six on its own, which is the closest a still
 * poster gets to being honest about what it stands in for.
 *
 * Below the fold, the same six as a filmstrip, because a scrub track says when
 * and a strip says what.
 */

const STAGE_H = 900;
const LEFT_W = 476;
const BAND_W = 1440 - LEFT_W;
const TRANSPORT_H = 132;
/**
 * The capture bleeds off the right edge rather than being fitted into the band:
 * fitting a 16:9 into a 964x900 column either letterboxes it into a strip or
 * crops the left half of the terminal away. At 0.86 it stands 1101 wide against
 * a 964 band, so it runs past the page and reads as film.
 */
const BAND_K = 0.86;
const BAND_TOP = 96;
const EASE = [0.22, 1, 0.36, 1] as const;

const pctOf = (seconds: number) => (seconds / RUN_SECONDS) * 100;

function PlayGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M3.4 2.2 9.6 6 3.4 9.8Z" />
		</svg>
	);
}

function PauseGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className={className}>
			<rect x="3.2" y="2.4" width="2.2" height="7.2" rx="0.6" />
			<rect x="6.6" y="2.4" width="2.2" height="7.2" rx="0.6" />
		</svg>
	);
}

function Transport({
	cue,
	playing,
	onCue,
	onToggle,
}: {
	cue: number;
	playing: boolean;
	onCue: (i: number) => void;
	onToggle: () => void;
}) {
	const here = momentAt(cue);
	const head = pctOf(here.at);
	return (
		<div
			className="absolute right-0 bottom-0 border-border-raised border-t bg-bg/90 backdrop-blur-[2px]"
			style={{ height: TRANSPORT_H, width: BAND_W }}
		>
			<div className="flex h-full items-center gap-6 pr-[72px] pl-[40px]">
				<button
					type="button"
					onClick={onToggle}
					aria-label={playing ? "Pause the walkthrough" : "Play the walkthrough"}
					className="flex h-[46px] w-[46px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-thread text-on-thread transition-transform duration-150 hover:scale-[1.04] focus-visible:outline-none"
				>
					{playing ? <PauseGlyph className="h-[13px] w-[13px]" /> : <PlayGlyph className="ml-[2px] h-[13px] w-[13px]" />}
				</button>

				<div className="min-w-0 flex-1">
					<div className="flex items-baseline justify-between gap-6">
						<div className="min-w-0 truncate text-[15px] text-text leading-none">{here.title}</div>
						<div className="shrink-0 font-mono text-[12px] text-muted leading-none">
							<span className="text-thread">{here.clock}</span> / {RUN_CLOCK}
						</div>
					</div>

					<div className="relative mt-5 h-[30px]">
						<div className="absolute top-[4px] right-0 left-0 h-[2px] rounded-full bg-border-raised" />
						<motion.div
							className="absolute top-[4px] left-0 h-[2px] rounded-full bg-thread"
							initial={false}
							animate={{ width: `${String(head)}%` }}
							transition={{ duration: 0.5, ease: EASE }}
						/>
						{MOMENTS.map((m, i) => (
							<button
								key={m.id}
								type="button"
								onClick={() => {
									onCue(i);
								}}
								aria-label={`Cue ${m.clock}, ${m.title}`}
								className="group absolute top-0 cursor-pointer focus-visible:outline-none"
								style={{ left: `${String(pctOf(m.at))}%`, transform: "translateX(-50%)" }}
							>
								<span
									className={cn(
										"block h-[10px] w-px transition-colors duration-200",
										i <= cue ? "bg-thread" : "bg-border-raised group-hover:bg-muted",
									)}
								/>
								<span
									className={cn(
										"mt-[6px] block font-mono text-[11px] leading-none transition-colors duration-200",
										i === cue ? "text-thread" : "text-muted/70 group-hover:text-text",
									)}
								>
									{m.clock}
								</span>
							</button>
						))}
						<motion.span
							className="absolute top-0 block h-[10px] w-[3px] rounded-full bg-thread"
							initial={false}
							animate={{ left: `${String(head)}%` }}
							transition={{ duration: 0.5, ease: EASE }}
							style={{ marginLeft: -1.5 }}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function Band({ cue }: { cue: number }) {
	const here = momentAt(cue);
	return (
		<div className="absolute top-0 right-0 bottom-0 overflow-hidden border-border border-l" style={{ width: BAND_W }}>
			<div
				className="absolute overflow-hidden"
				style={{ left: 0, top: BAND_TOP, width: BAND_W, height: REC_H * BAND_K }}
			>
				<AnimatePresence initial={false}>
					<motion.div
						key={here.id}
						className="absolute inset-0"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.42, ease: EASE }}
					>
						<div
							style={{
								width: REC_W,
								height: REC_H,
								transformOrigin: "0 0",
								transform: `scale(${String(BAND_K)})`,
							}}
						>
							<RecStill id={here.id} />
						</div>
					</motion.div>
				</AnimatePresence>
			</div>

			<div className="absolute top-[44px] right-[72px] flex items-center gap-2.5 rounded-full border border-border-raised bg-bg/80 px-3.5 py-2 font-mono text-[11px] text-muted leading-none backdrop-blur-[2px]">
				<span className="block h-[5px] w-[5px] rounded-full bg-thread" />
				chapter {cue + 1} of {MOMENTS.length}
			</div>
		</div>
	);
}

function Column() {
	return (
		<div className="absolute top-0 bottom-0 left-0 flex flex-col pr-[44px] pl-[72px]" style={{ width: LEFT_W }}>
			<div className="flex shrink-0 items-center gap-2.5 pt-[52px]">
				<SpoolMark className="h-5 w-5 text-thread" title="spool" />
				<span className="font-semibold text-md tracking-tight">spool</span>
			</div>

			<div className="flex flex-1 flex-col justify-center pb-[52px]">
				<h1 className="max-w-[350px] font-semibold text-[52px] leading-[0.98] tracking-[-0.025em]">
					The whole first run, in one take.
				</h1>
				<p className="mt-7 max-w-[330px] text-[16px] text-muted leading-[25px]">
					Fresh machine, empty folder, the first frames landing on disk. The last chapter opens the canvas
					spool itself is designed on.
				</p>

				<div className="mt-9 flex gap-4">
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

				<div className="mt-9 font-mono text-[12px] text-muted/70 leading-none">
					{RUN_CLOCK} · {MOMENTS.length} chapters · one take
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-5 border-border border-t py-6 font-mono text-[11px] text-muted leading-none">
				<span>spool.page</span>
				<span className="text-text">github.com/liamvinberg/spool</span>
			</div>
		</div>
	);
}

function Strip({ cue, onCue }: { cue: number; onCue: (i: number) => void }) {
	return (
		<section className="border-border border-t px-[72px] py-[56px]">
			<div className="flex items-baseline justify-between">
				<h2 className="font-medium text-[22px] tracking-tight">Six chapters, in the order they happened.</h2>
				<span className="font-mono text-[12px] text-muted leading-none">{RUN_CLOCK}</span>
			</div>

			<div className="mt-9 flex gap-[22px]">
				{MOMENTS.map((m, i) => (
					<button
						key={m.id}
						type="button"
						onClick={() => {
							onCue(i);
						}}
						className="group w-[190px] shrink-0 cursor-pointer text-left focus-visible:outline-none"
					>
						<div
							className={cn(
								"overflow-hidden rounded-[7px] border transition-colors duration-200",
								i === cue ? "border-thread" : "border-border group-hover:border-border-raised",
							)}
						>
							<ThumbScreen id={m.id} width={188} />
						</div>
						<div
							className={cn(
								"mt-3 font-mono text-[11px] leading-none transition-colors duration-200",
								i === cue ? "text-thread" : "text-muted/70",
							)}
						>
							{m.clock}
						</div>
						<div
							className={cn(
								"mt-2 text-[14px] leading-[20px] transition-colors duration-200",
								i === cue ? "text-text" : "text-muted group-hover:text-text",
							)}
						>
							{m.title}
						</div>
					</button>
				))}
			</div>

			<p className="mt-10 max-w-[720px] text-[15px] text-muted leading-[24px]">
				{momentAt(cue).line}
			</p>
		</section>
	);
}

function Footer() {
	return (
		<footer className="border-border border-t px-[72px] py-[52px]">
			<div className="flex items-start justify-between gap-16">
				<div className="max-w-[520px]">
					<div className="text-[18px] leading-[26px]">MIT. Fork it, rework it, rename it, ship it.</div>
					<p className="mt-3 text-[14px] text-muted leading-[22px]">
						The canvas in the last chapter is design/ in this repo. 12 pages, 142 frames, tracked in git
						beside the source.
					</p>
				</div>
				<div className="flex flex-col items-end gap-3 font-mono text-[12px] leading-none">
					<span className="text-text">github.com/liamvinberg/spool</span>
					<span className="text-muted">spool.page</span>
					<span className="text-muted">Spool.dmg</span>
				</div>
			</div>
		</footer>
	);
}

export default function SiteFilmReel() {
	const reduce = useReducedMotion() === true;
	const [cue, setCue] = useState(0);
	const [playing, setPlaying] = useState(false);

	useEffect(() => {
		if (!playing || reduce) return;
		const id = window.setInterval(() => {
			setCue((c) => {
				if (c >= MOMENTS.length - 1) {
					setPlaying(false);
					return c;
				}
				return c + 1;
			});
		}, 3400);
		return () => {
			window.clearInterval(id);
		};
	}, [playing, reduce]);

	return (
		<div className="h-full w-full overflow-y-auto bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<section className="relative w-full" style={{ height: STAGE_H }}>
				<Band cue={cue} />
				<Transport
					cue={cue}
					playing={playing}
					onCue={(i) => {
						setPlaying(false);
						setCue(i);
					}}
					onToggle={() => {
						setPlaying((p) => !p);
					}}
				/>
				<Column />
			</section>

			<Strip
				cue={cue}
				onCue={(i) => {
					setPlaying(false);
					setCue(i);
				}}
			/>
			<Footer />
		</div>
	);
}
