import { AnimatePresence, motion } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { ui } from "spool";
import dog from "./dog.webp";
import { k } from "./knobs";
import lunge from "./lunge.webp";
import "./sway.css";

/* Sway, guided mobility classes. Flow: open a class and start, follow along, done. */

const ease = [0.23, 1, 0.32, 1] as const;

const plan = [
	{ part: "Warm up", minutes: 4, moves: ["Cat and cow", "Thread the needle", "Child's pose"] },
	{
		part: "Hips and spine",
		minutes: 12,
		moves: ["Low lunge", "Downward dog", "High lunge reach", "Three-legged dog"],
	},
	{ part: "Cool down", minutes: 4, moves: ["Pigeon", "Supine twist"] },
];

const moves = [
	{ name: "Low lunge", seconds: 40, photo: lunge, cue: "Sink the hips and lift through the chest." },
	{ name: "Downward dog", seconds: 30, photo: dog, cue: "Press the floor away. Let your head hang." },
	{ name: "High lunge reach", seconds: 30, photo: lunge, cue: "Arms long, ribs soft, breathe into the back." },
	{ name: "Three-legged dog", seconds: 30, photo: dog, cue: "Lift one leg and keep both hips square." },
];

type Move = (typeof moves)[number];
const moveAt = (i: number) => moves[i] as Move;

type SwayState = { swayMove?: number; swaySaved?: boolean };

type Next = (patch?: Partial<SwayState>) => void;

/* the frame passes onNext, so each screen's walk is drawn from its own frame */
export function Sway({ screen, onNext }: { screen: "class" | "play" | "done"; onNext: Next }) {
	return (
		<div className="sway relative h-full overflow-hidden">
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600&display=swap"
				precedence="default"
			/>
			{screen === "class" && <ClassScreen onNext={onNext} />}
			{screen === "play" && <Play onNext={onNext} />}
			{screen === "done" && <Done onNext={onNext} />}
		</div>
	);
}

function titleStyle(): CSSProperties {
	return { fontFamily: `"${k.type.title}", Georgia, serif`, fontWeight: k.type.title === "Inter" ? 600 : 400 };
}
function radius() {
	const r = k.card.radius;
	return typeof r === "number" ? r : r.map((x) => `${x}px`).join(" ");
}
function paperInk() {
	const n = Number.parseInt(k.card.paper.replace("#", "").slice(0, 6), 16);
	const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
	return lum > 140 ? "#1e1a16" : "#fbf8f3";
}

/* the card the class sits on: its corners, paper and accent are the knobs */
function SwayCard({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
	return (
		<section
			className={className}
			style={{ borderRadius: radius(), background: k.card.paper, color: paperInk(), ...style }}
		>
			{children}
		</section>
	);
}

function StatusBar({ ink = "#1e1a16" }: { ink?: string }) {
	return (
		<div
			className="relative flex h-[54px] items-center justify-between px-8 pt-1 text-[16px] font-semibold"
			style={{ color: ink }}
		>
			<span>07:12</span>
			<span className="flex items-center gap-1.5">
				<svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true">
					<rect x="0" y="8" width="3" height="4" rx="1" />
					<rect x="5" y="5.5" width="3" height="6.5" rx="1" />
					<rect x="10" y="3" width="3" height="9" rx="1" />
					<rect x="15" y="0" width="3" height="12" rx="1" />
				</svg>
				<svg width="27" height="13" viewBox="0 0 27 13" fill="none" aria-hidden="true">
					<rect x="0.5" y="0.5" width="23" height="12" rx="3.8" stroke="currentColor" opacity="0.4" />
					<rect x="2" y="2" width="19" height="9" rx="2.5" fill="currentColor" />
					<path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity="0.5" />
				</svg>
			</span>
		</div>
	);
}

function Glass({ children, onClick, label }: { children: ReactNode; onClick: () => void; label: string }) {
	return (
		<motion.button
			type="button"
			aria-label={label}
			onClick={onClick}
			whileTap={{ scale: 0.92 }}
			className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-[var(--sway-glass)] px-4 text-[15px] font-semibold text-[var(--sway-ink)] backdrop-blur-xl"
		>
			{children}
		</motion.button>
	);
}

/* ---------- the class ---------- */

function ClassScreen({ onNext }: { onNext: Next }) {
	const s = ui.use() as SwayState;
	const saved = s.swaySaved ?? false;
	const [open, setOpen] = useState(-1);
	const accent = k.card.accent;

	return (
		<>
			<div className="absolute inset-0 overflow-y-auto pb-[140px]">
				<div className="relative h-[450px] overflow-hidden">
					<img
						src={lunge}
						alt=""
						className="sway-zoom absolute inset-0 size-full object-cover"
						style={{ objectPosition: "50% 22%", viewTransitionName: "sway-photo" }}
					/>
					<div
						className="absolute inset-0"
						style={{ background: "linear-gradient(180deg, transparent 52%, var(--sway-page) 94%)" }}
					/>
					<div className="absolute inset-x-0 top-0">
						<StatusBar />
						<div className="flex justify-end px-4 pt-1">
							<Glass label={saved ? "Saved" : "Save"} onClick={() => (ui.state.swaySaved = !saved)}>
								<motion.svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinejoin="round"
									animate={{
										scale: saved ? [1, 1.3, 1] : 1,
										fill: saved ? accent : "rgba(0,0,0,0)",
										color: saved ? accent : "#1e1a16",
									}}
									transition={{ duration: 0.4, ease }}
									aria-hidden="true"
								>
									<path d="M6 3.5h12v17l-6-4-6 4Z" />
								</motion.svg>
								{saved ? "Saved" : "Save"}
							</Glass>
						</div>
					</div>
				</div>

				<div className="relative -mt-14 px-6">
					<p className="sway-rise text-[15px] font-semibold" style={{ color: accent }}>
						Mobility with Ines Duarte
					</p>
					<h1
						className="sway-title sway-rise mt-2 text-[58px]"
						style={{ ...titleStyle(), animationDelay: "60ms" }}
					>
						Morning
						<br />
						Mobility
					</h1>
					<p className="sway-rise mt-4 text-[16px] text-[var(--sway-dim)]" style={{ animationDelay: "120ms" }}>
						20 min · 9 moves · No kit needed
					</p>
				</div>

				<SwayCard className="sway-rise mx-4 mt-5 px-5 py-1" style={{ animationDelay: "180ms" }}>
					{plan.map((p, i) => (
						<div key={p.part} className={i > 0 ? "border-t border-[var(--sway-faint)]" : ""}>
							<button
								type="button"
								onClick={() => setOpen(open === i ? -1 : i)}
								className="flex h-[60px] w-full cursor-pointer items-center gap-4 text-left"
							>
								<span
									className="grid size-8 place-items-center rounded-full text-[14px] font-semibold transition-colors duration-300"
									style={{
										background: open === i ? accent : "var(--sway-faint)",
										color: open === i ? "#fff" : "inherit",
									}}
								>
									{i + 1}
								</span>
								<span className="flex-1 text-[17px] font-semibold">{p.part}</span>
								<span className="text-[15px] text-[var(--sway-dim)]">{p.minutes} min</span>
								<motion.svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									className="text-[var(--sway-dim)]"
									animate={{ rotate: open === i ? 90 : 0 }}
									aria-hidden="true"
								>
									<path d="M9.5 6 15.5 12l-6 6" />
								</motion.svg>
							</button>
							<AnimatePresence initial={false}>
								{open === i && (
									<motion.ul
										initial={{ height: 0, opacity: 0 }}
										animate={{ height: "auto", opacity: 1 }}
										exit={{ height: 0, opacity: 0 }}
										transition={{ duration: 0.35, ease }}
										className="flex flex-wrap gap-2 overflow-hidden pl-12"
									>
										{p.moves.map((m) => (
											<li
												key={m}
												className="mb-3 rounded-full bg-[var(--sway-faint)] px-3 py-1.5 text-[13px] font-medium"
											>
												{m}
											</li>
										))}
									</motion.ul>
								)}
							</AnimatePresence>
						</div>
					))}
				</SwayCard>
			</div>

			<div
				className="absolute inset-x-0 bottom-0 px-4 pt-10 pb-[calc(env(safe-area-inset-bottom,0px)+30px)]"
				style={{ background: "linear-gradient(180deg, rgba(243,238,230,0), var(--sway-page) 40%)" }}
			>
				<motion.button
					type="button"
					onClick={() => onNext({ swayMove: 0 })}
					whileTap={{ scale: 0.97 }}
					className="flex h-[60px] w-full cursor-pointer items-center justify-center gap-3 rounded-full text-[18px] font-semibold text-[#fff]"
					style={{ background: accent }}
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8Z" />
					</svg>
					Start class
				</motion.button>
			</div>
		</>
	);
}

/* ---------- following along ---------- */

function Play({ onNext }: { onNext: Next }) {
	const s = ui.use() as SwayState;
	const [index, setIndex] = useState(() => Math.min(moves.length - 1, s.swayMove ?? 1));
	const [paused, setPaused] = useState(false);
	const [left, setLeft] = useState(() => moveAt(index).seconds - (s.swayMove === undefined ? 6 : 0));
	const last = index === moves.length - 1;
	const move = moveAt(index);
	const accent = k.card.accent;
	const tick = useRef<number | null>(null);

	useEffect(() => {
		if (paused) return;
		tick.current = window.setInterval(() => setLeft((l) => Math.max(0, l - 0.1)), 100);
		return () => {
			if (tick.current) clearInterval(tick.current);
		};
	}, [paused]);

	useEffect(() => {
		if (left > 0 || last) return;
		const id = setTimeout(() => go(index + 1), 300);
		return () => clearTimeout(id);
	});

	const go = (i: number) => {
		const next = Math.max(0, Math.min(moves.length - 1, i));
		setIndex(next);
		setLeft(moveAt(next).seconds);
		ui.state.swayMove = next;
	};

	const done = 1 - left / move.seconds;

	return (
		<div className="relative h-full" style={{ background: "#bf9c76" }}>
			<div className="absolute inset-x-0 top-0 h-[680px] overflow-hidden">
				<AnimatePresence initial={false}>
					<motion.img
						key={move.photo + String(index % 2)}
						src={move.photo}
						alt=""
						className="absolute inset-0 size-full object-cover"
						style={{
							objectPosition: move.photo === dog ? "60% 50%" : "50% 50%",
							viewTransitionName: "sway-photo",
						}}
						initial={{ opacity: 0, scale: 1.04 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.8, ease }}
					/>
				</AnimatePresence>
			</div>

			<div className="absolute inset-x-0 top-0">
				<StatusBar />
				<div className="flex gap-1.5 px-5 pt-1">
					{moves.map((m, i) => (
						<span key={m.name} className="h-[4px] flex-1 overflow-hidden rounded-full bg-[rgba(30,26,22,0.16)]">
							<span
								className="block h-full rounded-full bg-[var(--sway-ink)]"
								style={{
									width: `${i < index ? 100 : i === index ? done * 100 : 0}%`,
									transition: "width 120ms linear",
								}}
							/>
						</span>
					))}
				</div>
				<div className="flex items-center justify-between px-4 pt-3">
					<span className="flex h-10 items-center rounded-full bg-[var(--sway-glass)] px-4 text-[15px] font-semibold backdrop-blur-xl">
						Hips and spine · {index + 1} of {moves.length}
					</span>
					<Glass label="End class" onClick={() => onNext()}>
						End
					</Glass>
				</div>
			</div>

			<SwayCard className="absolute inset-x-2.5 bottom-2.5 px-6 pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+14px)]">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0 flex-1">
						<AnimatePresence mode="wait" initial={false}>
							<motion.div
								key={move.name}
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -10 }}
								transition={{ duration: 0.35, ease }}
							>
								<h1 className="sway-title text-[40px]" style={titleStyle()}>
									{move.name}
								</h1>
								<p className="mt-2 text-[15px] leading-snug opacity-60">{move.cue}</p>
							</motion.div>
						</AnimatePresence>
					</div>
					<p className="sway-title text-[52px] tabular-nums" style={{ ...titleStyle(), color: accent }}>
						:{String(Math.ceil(left)).padStart(2, "0")}
					</p>
				</div>

				<div className="mt-5 h-[5px] overflow-hidden rounded-full bg-[var(--sway-faint)]">
					<div
						className="h-full rounded-full"
						style={{ width: `${done * 100}%`, background: accent, transition: "width 120ms linear" }}
					/>
				</div>

				<div className="mt-5 flex items-center justify-between">
					<CircleButton label="Previous move" onClick={() => go(index - 1)} disabled={index === 0}>
						<path d="M17 6v12L8.5 12Z" fill="currentColor" stroke="none" />
						<path d="M6.5 6v12" />
					</CircleButton>
					<motion.button
						type="button"
						aria-label={paused ? "Play" : "Pause"}
						onClick={() => setPaused(!paused)}
						whileTap={{ scale: 0.92 }}
						className="grid size-[68px] cursor-pointer place-items-center rounded-full"
						style={{ background: paperInk(), color: k.card.paper }}
					>
						{paused ? (
							<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8Z" />
							</svg>
						) : (
							<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<rect x="6" y="4.5" width="4" height="15" rx="1.2" />
								<rect x="14" y="4.5" width="4" height="15" rx="1.2" />
							</svg>
						)}
					</motion.button>
					{last ? (
						<motion.button
							type="button"
							onClick={() => onNext()}
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							whileTap={{ scale: 0.94 }}
							className="h-12 cursor-pointer rounded-full px-5 text-[15px] font-semibold text-[#fff]"
							style={{ background: accent }}
						>
							Finish
						</motion.button>
					) : (
						<CircleButton label="Next move" onClick={() => go(index + 1)}>
							<path d="M7 6v12l8.5-6Z" fill="currentColor" stroke="none" />
							<path d="M17.5 6v12" />
						</CircleButton>
					)}
				</div>
			</SwayCard>
		</div>
	);
}

function CircleButton({
	label,
	onClick,
	disabled,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	children: ReactNode;
}) {
	return (
		<motion.button
			type="button"
			aria-label={label}
			onClick={onClick}
			disabled={disabled}
			whileTap={{ scale: 0.9 }}
			className="grid size-12 cursor-pointer place-items-center rounded-full bg-[var(--sway-faint)] transition-opacity disabled:cursor-default disabled:opacity-35"
		>
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2.2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				{children}
			</svg>
		</motion.button>
	);
}

/* ---------- done ---------- */

const week = [
	{ day: "M", done: true },
	{ day: "T", done: true },
	{ day: "W", done: true },
	{ day: "T", done: true, today: true },
	{ day: "F", done: false },
	{ day: "S", done: false },
	{ day: "S", done: false },
];
const feelings = ["Too easy", "Just right", "Tough"];

function Done({ onNext }: { onNext: Next }) {
	const [feel, setFeel] = useState("Just right");
	const accent = k.card.accent;

	return (
		<div className="flex h-full flex-col">
			<StatusBar />
			<div className="flex items-center justify-between px-4">
				<Glass label="Close" onClick={() => onNext()}>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.6"
						strokeLinecap="round"
						aria-hidden="true"
					>
						<path d="M6 6l12 12M18 6 6 18" />
					</svg>
				</Glass>
				<p className="text-[15px] font-medium text-[var(--sway-dim)]">Thursday 13 November</p>
				<span className="w-[46px]" />
			</div>

			<SwayCard
				className="sway-rise relative mx-4 mt-4 h-[230px] shrink-0 overflow-hidden"
				style={{ background: "#d9cfc1" }}
			>
				<img
					src={lunge}
					alt=""
					className="absolute inset-0 size-full object-cover"
					style={{ objectPosition: "50% 38%", viewTransitionName: "sway-photo" }}
				/>
				<div
					className="absolute inset-0"
					style={{ background: "linear-gradient(180deg, transparent 45%, rgba(30,26,22,0.62))" }}
				/>
				<div className="absolute right-5 bottom-4 left-5 text-[#fbf8f3]">
					<p className="text-[24px] leading-none" style={titleStyle()}>
						Morning Mobility
					</p>
					<p className="mt-1.5 text-[14px] opacity-80">20 min with Ines Duarte</p>
				</div>
			</SwayCard>

			<div className="px-6 pt-6">
				<h1 className="sway-title sway-rise text-[46px]" style={{ ...titleStyle(), animationDelay: "80ms" }}>
					Four mornings
					<br />
					in a row.
				</h1>

				<ul className="mt-5 flex justify-between">
					{week.map((d, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: the week is fixed and its letters repeat
						<li key={`${d.day}${i}`} className="flex flex-col items-center gap-2">
							<span className="text-[13px] font-medium text-[var(--sway-dim)]">{d.day}</span>
							<span className="relative grid size-10 place-items-center rounded-full border border-[var(--sway-faint)]">
								{d.done && (
									<motion.span
										className="absolute inset-0 grid place-items-center rounded-full text-[#fff]"
										style={{ background: accent }}
										initial={d.today ? { scale: 0 } : false}
										animate={{ scale: 1 }}
										transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.5 }}
									>
										<svg
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2.8"
											strokeLinecap="round"
											strokeLinejoin="round"
											aria-hidden="true"
										>
											<path d="M5 12.5l4.5 4.5L19 7.5" />
										</svg>
									</motion.span>
								)}
							</span>
						</li>
					))}
				</ul>

				<div className="mt-6 grid grid-cols-3 border-t border-[var(--sway-faint)] pt-4">
					{[
						{ value: "20:14", label: "minutes" },
						{ value: "9", label: "moves" },
						{ value: "86", label: "calories" },
					].map((x) => (
						<div key={x.label}>
							<p className="text-[30px] leading-none" style={titleStyle()}>
								{x.value}
							</p>
							<p className="mt-1 text-[13px] text-[var(--sway-dim)]">{x.label}</p>
						</div>
					))}
				</div>

				<p className="mt-6 text-[15px] font-semibold">How did it feel?</p>
				<div className="mt-3 flex gap-2">
					{feelings.map((f) => (
						<button
							key={f}
							type="button"
							onClick={() => setFeel(f)}
							className="relative h-10 cursor-pointer rounded-full px-4 text-[15px] font-medium"
						>
							{feel === f && (
								<motion.span
									layoutId="sway-feel"
									className="absolute inset-0 rounded-full"
									style={{ background: "var(--sway-ink)" }}
									transition={{ type: "spring", stiffness: 420, damping: 34 }}
								/>
							)}
							<span
								className="relative transition-colors duration-200"
								style={{ color: feel === f ? "#fbf8f3" : "var(--sway-ink)" }}
							>
								{f}
							</span>
							{feel !== f && (
								<span className="absolute inset-0 rounded-full border border-[var(--sway-faint)]" />
							)}
						</button>
					))}
				</div>
			</div>

			<div className="mt-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+30px)]">
				<motion.button
					type="button"
					onClick={() => onNext()}
					whileTap={{ scale: 0.97 }}
					className="h-[60px] w-full cursor-pointer rounded-full text-[18px] font-semibold text-[#fff]"
					style={{ background: accent }}
				>
					Done
				</motion.button>
			</div>
		</div>
	);
}
