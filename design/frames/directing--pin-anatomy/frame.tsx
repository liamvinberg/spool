import { motion } from "motion/react";
import { cn } from "../../shared/lib/utils";

/**
 * directing — pin language, up close. A specimen sheet for the annotation object,
 * shape-agnostic: the same pin whether it was dropped by a fourth tool or a verb
 * on select. Top: one pin dissected on its element (anchor, leader, order, target)
 * in the spool blueprint hand. Bottom: the three moments it moves through, writing
 * to just written to waiting. The order is the payload and reads human; everything
 * holding it is quiet mono.
 */

export default function DirectingPinAnatomy() {
	return (
		<div className="relative h-full w-full overflow-hidden bg-canvas font-sans text-text antialiased [font-synthesis:none]">
			<DotGrid />

			{/* the dissection */}
			<div className="absolute" style={{ left: 470, top: 176 }}>
				<HeroSpecimen />
			</div>

			<span className="absolute h-px bg-border/60" style={{ top: 474, left: 220, right: 220 }} />

			{/* the lifecycle */}
			<div className="absolute inset-x-0" style={{ top: 556 }}>
				<div className="mx-auto flex w-[1100px] items-start justify-between">
					<StateSpecimen state="writing" caption="writing" note="the order is being typed" />
					<StateSpecimen state="pinned" caption="just written" note="committed, unread" />
					<StateSpecimen state="waiting" caption="waiting" note="at rest until an agent sweeps" />
				</div>
			</div>
		</div>
	);
}

/* ---------- the dissected pin ---------- */

function HeroSpecimen() {
	return (
		<div className="relative" style={{ width: 500, height: 240 }}>
			{/* the element the pin sits on */}
			<div className="absolute" style={{ left: 0, top: 96 }}>
				<ElementRow />
			</div>

			{/* the pin: anchor on the element, leader out, bubble holding the order */}
			<span className="absolute h-2.5 w-2.5 rounded-full bg-thread ring-2 ring-thread/20" style={{ left: 225, top: 111 }} />
			<span className="absolute h-px bg-thread/60" style={{ left: 235, top: 116, width: 41 }} />
			<div
				className="absolute w-[264px] rounded-md border border-border-raised bg-bg/95 px-3 py-2.5 backdrop-blur"
				style={{ left: 276, top: 88 }}
			>
				<div className="flex items-start gap-2">
					<span className="mt-px flex h-4 min-w-4 items-center justify-center rounded bg-thread px-1 font-mono text-[10px] text-on-thread leading-none">
						1
					</span>
					<div className="min-w-0 flex-1">
						<p className="font-sans text-base text-text leading-base">swap this for the terminal variant</p>
						<p className="mt-1 font-mono text-2xs text-muted leading-3">
							cart · CheckoutButton <span className="text-muted/40">·</span>{" "}
							<span className="text-muted/70">queued</span>
						</p>
					</div>
				</div>
			</div>

			{/* callouts in the blueprint hand: a mono word, a hairline, a dot on the part */}
			<Callout label="anchor" cx={230} top={54} dir="down" reach={41} />
			<Callout label="order" cx={430} top={54} dir="down" reach={30} />
			<Callout label="element" cx={96} top={136} dir="up" reach={62} />
			<Callout label="target" cx={452} top={129} dir="up" reach={62} />
		</div>
	);
}

function Callout({ label, cx, top, dir, reach }: { label: string; cx: number; top: number; dir: "up" | "down"; reach: number }) {
	return (
		<div className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: cx, top }}>
			{dir === "up" ? <Lead reach={reach} dot="top" /> : null}
			<span className="py-1 font-mono text-2xs text-muted/70 leading-3">{label}</span>
			{dir === "down" ? <Lead reach={reach} dot="bottom" /> : null}
		</div>
	);
}

function Lead({ reach, dot }: { reach: number; dot: "top" | "bottom" }) {
	return (
		<span className="relative w-px bg-border-raised" style={{ height: reach }}>
			<span
				className={cn(
					"-translate-x-1/2 absolute left-1/2 h-1 w-1 rounded-full bg-muted/70",
					dot === "bottom" ? "-bottom-[1px]" : "-top-[1px]",
				)}
			/>
		</span>
	);
}

/* ---------- the three lifecycle moments ---------- */

function StateSpecimen({
	state,
	caption,
	note,
}: {
	state: "writing" | "pinned" | "waiting";
	caption: string;
	note: string;
}) {
	return (
		<div className="flex w-[300px] flex-col items-center">
			<span className="font-mono text-2xs text-thread leading-3">{caption}</span>
			<span className="mt-1.5 font-mono text-2xs text-muted/60 leading-3">{note}</span>

			<div className="mt-9 flex flex-col items-center">
				<ElementRow compact />
				{/* anchor on the element, hairline down to the note */}
				<span className="relative flex flex-col items-center">
					{state === "writing" ? <WritingDot /> : <span className="h-2 w-2 rounded-full bg-thread" />}
					<span className="h-5 w-px bg-thread/50" />
				</span>

				{state === "writing" ? (
					<div className="w-[212px] overflow-hidden rounded-md border border-thread/70 bg-bg/95 backdrop-blur">
						<div className="bg-thread/[0.06] px-2.5 py-2">
							<p className="font-sans text-sm text-text leading-sm">
								make this row denser
								<motion.span
									aria-hidden="true"
									className="ml-px inline-block h-[13px] w-px translate-y-[2px] bg-thread"
									animate={{ opacity: [1, 1, 0, 0] }}
									transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear", times: [0, 0.5, 0.5, 1] }}
								/>
							</p>
						</div>
						<div className="flex items-center justify-between px-2.5 py-1.5 font-mono text-2xs text-muted/60 leading-3">
							<span>drafting</span>
							<span className="flex items-center gap-1.5">
								<Kbd>esc</Kbd>
								<Kbd>⏎</Kbd>
							</span>
						</div>
					</div>
				) : null}

				{state === "pinned" ? (
					<div className="w-[212px] rounded-md border border-thread/40 bg-bg/95 px-2.5 py-2 backdrop-blur">
						<div className="flex items-start gap-1.5">
							<Chip />
							<div className="min-w-0 flex-1">
								<p className="font-sans text-sm text-text leading-sm">make this row denser</p>
								<p className="mt-0.5 font-mono text-2xs text-muted leading-3">cart · row · unread</p>
							</div>
						</div>
					</div>
				) : null}

				{state === "waiting" ? (
					<div className="flex items-center gap-2 rounded-full border border-border-raised bg-bg/80 py-1 pr-3 pl-1 backdrop-blur">
						<Chip round />
						<span className="font-sans text-sm text-muted leading-none">make this row denser</span>
					</div>
				) : null}
			</div>
		</div>
	);
}

function WritingDot() {
	return (
		<span className="relative flex h-2.5 w-2.5 items-center justify-center">
			<motion.span
				className="absolute h-2.5 w-2.5 rounded-full border border-thread/50"
				animate={{ scale: [1, 1.9], opacity: [0.5, 0] }}
				transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeOut" }}
			/>
			<span className="h-2 w-2 rounded-full bg-thread" />
		</span>
	);
}

function Chip({ round }: { round?: boolean }) {
	return (
		<span
			className={cn(
				"flex h-4 min-w-4 shrink-0 items-center justify-center bg-thread px-1 font-mono text-[10px] text-on-thread leading-none",
				round ? "rounded-full" : "rounded",
			)}
		>
			1
		</span>
	);
}

/* ---------- the element specimen ---------- */

function ElementRow({ compact }: { compact?: boolean }) {
	return (
		<div
			className={cn(
				"rounded-md border border-border bg-surface",
				compact ? "w-[204px] px-3 py-2.5" : "w-[228px] px-3.5 py-3",
			)}
		>
			<div className="flex items-center justify-between">
				<span className={cn("font-sans text-text leading-none", compact ? "text-sm" : "text-base")}>Bryggkaffe</span>
				<span className={cn("font-mono text-muted leading-none tabular-nums", compact ? "text-2xs" : "text-sm")}>
					30 kr
				</span>
			</div>
		</div>
	);
}

/* ---------- shared bits ---------- */

function DotGrid() {
	return (
		<div
			className="pointer-events-none absolute inset-0 opacity-30"
			style={{
				backgroundImage: "radial-gradient(circle, var(--color-border-raised) 0.75px, transparent 0.75px)",
				backgroundSize: "22px 22px",
			}}
		/>
	);
}

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<span className="flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border-raised bg-surface px-1 font-mono text-[9px] text-muted leading-none">
			{children}
		</span>
	);
}
