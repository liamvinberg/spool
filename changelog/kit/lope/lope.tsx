import {
	AnimatePresence,
	animate,
	type MotionValue,
	motion,
	useMotionValue,
	useMotionValueEvent,
	useTransform,
} from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { ui } from "spool";
import { inkOn, k } from "./knobs";
import "./lope.css";
import { RouteMap } from "./map";

/* Lope, a running app. Flow: set a goal and start, run, save the run. */

type Mode = "distance" | "time";
type LopeState = {
	lopeMode?: Mode;
	lopeKm?: number;
	lopeMinutes?: number;
	lopeStartedAt?: number;
	lopeCountdown?: boolean;
};

const ease = [0.23, 1, 0.32, 1] as const;
const SECONDS_PER_KM = 332;

type Next = (patch?: Partial<LopeState>) => void;

/* the frame passes onNext, so each screen's walk is drawn from its own frame */
export function Lope({ screen, onNext }: { screen: "start" | "run" | "done"; onNext: Next }) {
	return (
		<div className="lope relative h-full overflow-hidden">
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,400..900;1,62..125,400..900&display=swap"
				precedence="default"
			/>
			{screen === "start" && <Start onNext={onNext} />}
			{screen === "run" && <Run onNext={onNext} />}
			{screen === "done" && <Done onNext={onNext} />}
		</div>
	);
}

function radius() {
	const r = k.card.radius;
	return typeof r === "number" ? r : r.map((x) => `${x}px`).join(" ");
}
function radiusPx() {
	const r = k.card.radius;
	return typeof r === "number" ? r : r[0];
}

function numStyle(): CSSProperties {
	return { fontStyle: k.numbers.slant ? "italic" : "normal", fontStretch: `${k.numbers.width}%` };
}

/* the card everything sits on: its corners and fill are the knobs */
function LopeCard({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
	return (
		<section className={className} style={{ borderRadius: radius(), background: "var(--lope-panel)", ...style }}>
			{children}
		</section>
	);
}

function StatusBar({ ink }: { ink?: string }) {
	return (
		<div
			className="relative flex h-[54px] items-center justify-between px-8 pt-1 text-[16px] font-semibold"
			style={{ color: ink }}
		>
			<span>18:42</span>
			<span className="flex items-center gap-1.5">
				<svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true">
					<rect x="0" y="8" width="3" height="4" rx="1" />
					<rect x="5" y="5.5" width="3" height="6.5" rx="1" />
					<rect x="10" y="3" width="3" height="9" rx="1" />
					<rect x="15" y="0" width="3" height="12" rx="1" />
				</svg>
				<svg width="27" height="13" viewBox="0 0 27 13" fill="none" aria-hidden="true">
					<rect x="0.5" y="0.5" width="23" height="12" rx="3.8" stroke="currentColor" opacity="0.4" />
					<rect x="2" y="2" width="17" height="9" rx="2.5" fill="currentColor" />
					<path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity="0.5" />
				</svg>
			</span>
		</div>
	);
}

/* ---------- start ---------- */

const rulers = {
	distance: { min: 1, max: 42.2, step: 0.1, px: 120, major: 1 },
	time: { min: 5, max: 180, step: 1, px: 12, major: 5 },
} as const;

function formatGoal(mode: Mode, v: number) {
	if (mode === "distance") return v.toFixed(2);
	return `${Math.round(v)}:00`;
}

function Start({ onNext }: { onNext: Next }) {
	const s = ui.use() as LopeState;
	const [mode, setMode] = useState<Mode>(s.lopeMode ?? "distance");
	const [cues, setCues] = useState(true);
	const [indoor, setIndoor] = useState(false);
	const km = useMotionValue(s.lopeKm ?? 5);
	const minutes = useMotionValue(s.lopeMinutes ?? 30);
	const value = mode === "distance" ? km : minutes;
	const [shown, setShown] = useState(value.get());
	useMotionValueEvent(km, "change", (v: number) => mode === "distance" && setShown(v));
	useMotionValueEvent(minutes, "change", (v: number) => mode === "time" && setShown(v));
	const accent = k.card.accent;

	const pick = (m: Mode) => {
		setMode(m);
		setShown((m === "distance" ? km : minutes).get());
	};
	const nudge = (dir: 1 | -1) => {
		const r = rulers[mode];
		const target = Math.min(
			r.max,
			Math.max(r.min, Math.round((value.get() + dir * r.major * (mode === "distance" ? 0.5 : 1)) / r.step) * r.step),
		);
		animate(value, target, { type: "spring", stiffness: 260, damping: 30 });
	};
	const start = () =>
		onNext({
			lopeMode: mode,
			lopeKm: Math.round(km.get() * 10) / 10,
			lopeMinutes: Math.round(minutes.get()),
			lopeStartedAt: Date.now(),
			lopeCountdown: true,
		});

	const shownRounded = mode === "distance" ? Math.round(shown * 10) / 10 : Math.round(shown);
	const estimate =
		mode === "distance"
			? `About ${Math.round((shownRounded * SECONDS_PER_KM) / 60)} min at your usual pace`
			: `About ${((shownRounded * 60) / SECONDS_PER_KM).toFixed(1)} km at your usual pace`;

	return (
		<div className="flex h-full flex-col">
			<StatusBar />
			<header className="flex items-end justify-between px-6 pt-3">
				<div>
					<h1 className="lope-title text-[40px] leading-none">Run</h1>
					<p className="mt-2 flex items-center gap-2 text-[15px] text-[var(--lope-dim)]">
						<span
							className="lope-blink size-2 rounded-full"
							style={{ background: indoor ? "var(--lope-dim)" : accent }}
						/>
						{indoor ? "Indoor, using the step counter" : "Greenwich · 8° and clear"}
					</p>
				</div>
				<span className="grid size-11 place-items-center rounded-full bg-[var(--lope-raised)] text-[15px] font-semibold">
					NE
				</span>
			</header>

			<LopeCard className="mx-4 mt-6 overflow-hidden pt-4 pb-5">
				<Segmented mode={mode} onPick={pick} />
				<div className="mt-6 flex items-center justify-between px-4">
					<RoundButton label="Less" onClick={() => nudge(-1)}>
						<path d="M6 12h12" />
					</RoundButton>
					<div className="text-center">
						<p className="lope-num text-[112px]" style={numStyle()}>
							{formatGoal(mode, shownRounded)}
						</p>
						<p className="mt-2 text-[15px] font-medium text-[var(--lope-dim)]">
							{mode === "distance" ? "kilometres" : "minutes"}
						</p>
					</div>
					<RoundButton label="More" onClick={() => nudge(1)}>
						<path d="M6 12h12M12 6v12" />
					</RoundButton>
				</div>
				<Ruler key={mode} mode={mode} value={value} accent={accent} />
				<p className="mt-3 text-center text-[14px] text-[var(--lope-dim)]">{estimate}</p>
			</LopeCard>

			<div className="mt-auto flex flex-col items-center pb-[calc(env(safe-area-inset-bottom,0px)+34px)]">
				<div className="flex w-full items-center justify-between px-10">
					<Toggle on={cues} onClick={() => setCues(!cues)} label={cues ? "Audio cues on" : "Audio cues off"}>
						<path d="M4 9.5h3l4.5-4v13L7 14.5H4Z" />
						{cues ? (
							<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
						) : (
							<path d="M16 9.5l5 5M21 9.5l-5 5" />
						)}
					</Toggle>
					<div className="relative grid size-[132px] place-items-center">
						<span className="lope-ring absolute inset-0 rounded-full" style={{ background: accent }} />
						<motion.button
							type="button"
							onClick={start}
							whileTap={{ scale: 0.93 }}
							whileHover={{ scale: 1.03 }}
							transition={{ type: "spring", stiffness: 500, damping: 30 }}
							className="lope-num relative grid size-[132px] cursor-pointer place-items-center rounded-full text-[34px]"
							style={{
								background: accent,
								color: inkOn(accent),
								...numStyle(),
								viewTransitionName: "lope-field",
							}}
						>
							START
						</motion.button>
					</div>
					<Toggle on={indoor} onClick={() => setIndoor(!indoor)} label={indoor ? "Indoor" : "Outdoor"}>
						{indoor ? (
							<path d="M4 11.5 12 5l8 6.5M6.5 10v9h11v-9" />
						) : (
							<>
								<circle cx="12" cy="10" r="2.5" />
								<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" />
							</>
						)}
					</Toggle>
				</div>
				<p className="mt-5 text-[14px] text-[var(--lope-dim)]">
					{cues ? "Your coach speaks every kilometre" : "Running quietly"}
				</p>
			</div>
		</div>
	);
}

function Segmented({ mode, onPick }: { mode: Mode; onPick: (m: Mode) => void }) {
	const options: { value: Mode; label: string }[] = [
		{ value: "distance", label: "Distance" },
		{ value: "time", label: "Time" },
	];
	return (
		<div className="mx-auto flex w-[220px] rounded-full bg-[var(--lope-raised)] p-1">
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					onClick={() => onPick(o.value)}
					className="relative h-9 flex-1 cursor-pointer rounded-full text-[15px] font-semibold"
				>
					{mode === o.value && (
						<motion.span
							layoutId="lope-seg"
							className="absolute inset-0 rounded-full bg-[var(--lope-ink)]"
							transition={{ type: "spring", stiffness: 420, damping: 34 }}
						/>
					)}
					<span className="relative" style={{ color: mode === o.value ? "var(--lope-bg)" : "var(--lope-dim)" }}>
						{o.label}
					</span>
				</button>
			))}
		</div>
	);
}

function Ruler({ mode, value, accent }: { mode: Mode; value: MotionValue<number>; accent: string }) {
	const r = rulers[mode];
	const x = useTransform(value, (v: number) => -(v - r.min) * r.px);
	const drag = useRef<{ x: number; v: number } | null>(null);
	const count = Math.round((r.max - r.min) / r.step);
	const ticks = Array.from({ length: count + 1 }, (_, i) => r.min + i * r.step);

	return (
		<div
			className="relative mt-6 h-14 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
			style={{ maskImage: "linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent)" }}
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId);
				drag.current = { x: e.clientX, v: value.get() };
			}}
			onPointerMove={(e) => {
				if (!drag.current) return;
				const v = drag.current.v - (e.clientX - drag.current.x) / r.px;
				value.set(Math.min(r.max, Math.max(r.min, v)));
			}}
			onPointerUp={() => {
				drag.current = null;
				animate(value, Math.round(value.get() / r.step) * r.step, { type: "spring", stiffness: 300, damping: 30 });
			}}
		>
			<motion.div className="absolute top-0 left-1/2 h-full" style={{ x }}>
				{ticks.map((t, i) => {
					const isMajor = Math.abs(t / r.major - Math.round(t / r.major)) < 0.001;
					return (
						<span key={t} className="absolute top-2" style={{ left: i * r.step * r.px }}>
							<span
								className="absolute -translate-x-1/2 rounded-full"
								style={{
									width: 2,
									height: isMajor ? 22 : 12,
									top: isMajor ? 0 : 5,
									background: isMajor ? "var(--lope-ink)" : "var(--lope-faint)",
								}}
							/>
							{isMajor && (
								<span className="absolute top-7 -translate-x-1/2 text-[12px] font-medium text-[var(--lope-dim)]">
									{Math.round(t)}
								</span>
							)}
						</span>
					);
				})}
			</motion.div>
			<span
				className="absolute top-0 left-1/2 h-[34px] w-[3px] -translate-x-1/2 rounded-full"
				style={{ background: accent }}
			/>
		</div>
	);
}

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
	return (
		<motion.button
			type="button"
			aria-label={label}
			onClick={onClick}
			whileTap={{ scale: 0.88 }}
			className="grid size-11 cursor-pointer place-items-center rounded-full bg-[var(--lope-raised)]"
		>
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2.2"
				strokeLinecap="round"
				aria-hidden="true"
			>
				{children}
			</svg>
		</motion.button>
	);
}

function Toggle({
	on,
	onClick,
	label,
	children,
}: {
	on: boolean;
	onClick: () => void;
	label: string;
	children: ReactNode;
}) {
	return (
		<motion.button
			type="button"
			aria-label={label}
			aria-pressed={on}
			onClick={onClick}
			whileTap={{ scale: 0.9 }}
			className="grid size-[54px] cursor-pointer place-items-center rounded-full bg-[var(--lope-raised)] transition-colors duration-300"
			style={{ color: on ? "var(--lope-ink)" : "var(--lope-dim)" }}
		>
			<svg
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				{children}
			</svg>
		</motion.button>
	);
}

/* ---------- run ---------- */

function pace(seconds: number) {
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return `${m}'${String(s).padStart(2, "0")}"`;
}
function clock(seconds: number) {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}

function Run({ onNext }: { onNext: Next }) {
	const s = ui.use() as LopeState;
	const [counting] = useState(() => s.lopeCountdown === true);
	const [count, setCount] = useState(counting ? 3 : 0);
	const [startedAt] = useState(() =>
		s.lopeStartedAt ? s.lopeStartedAt + (counting ? 2700 : 0) : Date.now() - 801_000,
	);
	const [paused, setPaused] = useState(false);
	const pausedFor = useRef(0);
	const pausedAt = useRef(0);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (!counting) return;
		ui.state.lopeCountdown = false;
		const id = setInterval(() => setCount((c) => Math.max(0, c - 1)), 900);
		return () => clearInterval(id);
	}, [counting]);

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 250);
		return () => clearInterval(id);
	}, []);

	const elapsed = Math.max(0, (paused ? pausedAt.current : now) - startedAt - pausedFor.current) / 1000;
	const km = elapsed / SECONDS_PER_KM;
	const mode = s.lopeMode ?? "distance";
	const goalKm = s.lopeKm ?? 5;
	const goalMin = s.lopeMinutes ?? 30;
	const progress = Math.min(1, mode === "distance" ? km / goalKm : elapsed / 60 / goalMin);
	const livePace = SECONDS_PER_KM + Math.sin(elapsed / 9) * 4;
	const bpm = Math.round(151 + Math.sin(elapsed / 13) * 4);

	const togglePause = () => {
		if (paused) {
			pausedFor.current += Date.now() - pausedAt.current;
			setPaused(false);
		} else {
			pausedAt.current = Date.now();
			setPaused(true);
		}
	};

	const accent = k.card.accent;
	const bg = paused ? "#0b0b0c" : accent;
	const ink = paused ? "#f4f3ef" : inkOn(accent);
	const big = paused ? accent : ink;

	return (
		<motion.div
			className="flex h-full flex-col"
			initial={false}
			animate={{ backgroundColor: bg, color: ink }}
			transition={{ duration: 0.5, ease }}
			style={{ viewTransitionName: "lope-field" }}
		>
			<StatusBar />
			<div className="px-6 pt-4">
				<div className="flex items-baseline justify-between text-[15px] font-semibold">
					<AnimatePresence mode="wait" initial={false}>
						<motion.span
							key={paused ? "p" : "r"}
							initial={{ opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -6 }}
							transition={{ duration: 0.25 }}
						>
							{paused ? "Paused" : count > 0 ? "Get ready" : "Evening run"}
						</motion.span>
					</AnimatePresence>
					<span style={{ opacity: 0.6 }}>
						{mode === "distance" ? `Goal ${goalKm.toFixed(1)} km` : `Goal ${goalMin} min`}
					</span>
				</div>
				<div
					className="mt-3 h-[5px] overflow-hidden rounded-full"
					style={{ background: paused ? "rgba(244,243,239,0.14)" : "rgba(0,0,0,0.14)" }}
				>
					<motion.div
						className="h-full rounded-full"
						animate={{ width: `${progress * 100}%`, backgroundColor: paused ? accent : ink }}
						transition={{ duration: 0.6, ease }}
					/>
				</div>
			</div>

			<div className="flex flex-1 flex-col justify-center px-6">
				<AnimatePresence mode="popLayout" initial={false}>
					{count > 0 ? (
						<motion.p
							key={`c${count}`}
							className="lope-num text-[260px]"
							style={numStyle()}
							initial={{ opacity: 0, scale: 1.25 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.8 }}
							transition={{ duration: 0.45, ease }}
						>
							{count}
						</motion.p>
					) : (
						<motion.div
							key="km"
							initial={{ opacity: 0, y: 24 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5, ease }}
						>
							<Rolling text={km.toFixed(2)} color={big} />
							<p className="mt-3 text-[22px] font-bold">Kilometres</p>
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			<div className="grid grid-cols-3 gap-2 px-6">
				{[
					{ label: "Pace", value: count > 0 ? "–'––\"" : pace(livePace) },
					{ label: "Time", value: clock(elapsed) },
					{ label: "Heart", value: count > 0 ? "––" : String(bpm) },
				].map((st) => (
					<div key={st.label}>
						<p className="lope-num text-[34px]" style={numStyle()}>
							{st.value}
						</p>
						<p className="mt-1.5 text-[14px] font-semibold" style={{ opacity: 0.6 }}>
							{st.label}
						</p>
					</div>
				))}
			</div>

			<div className="flex h-[200px] items-center justify-center gap-10 pb-[calc(env(safe-area-inset-bottom,0px)+18px)]">
				<AnimatePresence initial={false}>
					{paused && (
						<motion.button
							key="finish"
							type="button"
							onClick={() => onNext()}
							initial={{ opacity: 0, x: 40, scale: 0.8 }}
							animate={{ opacity: 1, x: 0, scale: 1 }}
							exit={{ opacity: 0, x: 40, scale: 0.8 }}
							whileTap={{ scale: 0.92 }}
							transition={{ type: "spring", stiffness: 380, damping: 30 }}
							className="flex cursor-pointer flex-col items-center gap-2"
						>
							<span className="grid size-[92px] place-items-center rounded-full bg-[#f4f3ef]">
								<span className="size-7 rounded-[6px] bg-[#0b0b0c]" />
							</span>
							<span className="text-[14px] font-semibold">Finish</span>
						</motion.button>
					)}
				</AnimatePresence>
				<motion.button
					type="button"
					layout
					onClick={togglePause}
					disabled={count > 0}
					whileTap={{ scale: 0.92 }}
					transition={{ type: "spring", stiffness: 380, damping: 30 }}
					className="flex cursor-pointer flex-col items-center gap-2 disabled:cursor-default"
				>
					<motion.span
						className="grid size-[92px] place-items-center rounded-full"
						animate={{ backgroundColor: paused ? accent : "#0b0b0c", color: paused ? inkOn(accent) : accent }}
						transition={{ duration: 0.4, ease }}
					>
						{paused ? (
							<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
							</svg>
						) : (
							<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<rect x="5.5" y="4" width="4.5" height="16" rx="1.2" />
								<rect x="14" y="4" width="4.5" height="16" rx="1.2" />
							</svg>
						)}
					</motion.span>
					<span className="text-[14px] font-semibold">{paused ? "Resume" : "Pause"}</span>
				</motion.button>
			</div>
		</motion.div>
	);
}

/* each digit rolls up when it changes */
function Rolling({ text, color }: { text: string; color: string }) {
	return (
		<motion.p
			className="lope-num flex text-[188px]"
			style={numStyle()}
			animate={{ color }}
			transition={{ duration: 0.5, ease }}
		>
			{text.split("").map((ch, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: each slot is a digit position; its digit rolls inside it
				<span key={i} className="relative inline-block overflow-hidden" style={{ paddingRight: "0.04em" }}>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={ch}
							className="inline-block"
							initial={{ y: "70%", opacity: 0 }}
							animate={{ y: 0, opacity: 1 }}
							exit={{ y: "-70%", opacity: 0 }}
							transition={{ duration: 0.45, ease }}
						>
							{ch}
						</motion.span>
					</AnimatePresence>
				</span>
			))}
		</motion.p>
	);
}

/* ---------- done ---------- */

const splits = [
	{ km: 1, secs: 341 },
	{ km: 2, secs: 333 },
	{ km: 3, secs: 329 },
	{ km: 4, secs: 336 },
	{ km: 5, secs: 318 },
];

function Done({ onNext }: { onNext: Next }) {
	const [title, setTitle] = useState("Isle of Dogs loop");
	const [saved, setSaved] = useState(false);
	const accent = k.card.accent;
	const fastest = Math.min(...splits.map((x) => x.secs));
	const slowest = Math.max(...splits.map((x) => x.secs));

	const save = () => {
		setSaved(true);
		setTimeout(() => onNext(), 650);
	};

	return (
		<div className="flex h-full flex-col">
			<div className="relative h-[300px] shrink-0">
				<RouteMap accent={accent} replay={k.motion.replay} />
				<div className="absolute inset-x-0 top-0">
					<StatusBar />
				</div>
				<button
					type="button"
					aria-label="Close"
					onClick={() => onNext()}
					className="absolute top-[60px] left-4 grid size-10 cursor-pointer place-items-center rounded-full bg-[rgba(11,11,12,0.7)]"
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.2"
						strokeLinecap="round"
						aria-hidden="true"
					>
						<path d="M6 6l12 12M18 6 6 18" />
					</svg>
				</button>
			</div>

			<LopeCard className="lope-rise relative z-10 mx-3 -mt-12 px-5 pt-5 pb-5">
				<input
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					aria-label="Run name"
					className="lope-title w-full bg-transparent text-[30px] leading-tight outline-none"
				/>
				<p className="mt-1 text-[14px] text-[var(--lope-dim)]">Wednesday 12 November · 18:42 · Greenwich</p>

				<div className="mt-4 flex items-center gap-3 rounded-[16px] bg-[var(--lope-raised)] px-3 py-2.5">
					<span
						className="grid size-9 place-items-center rounded-full"
						style={{ background: accent, color: inkOn(accent) }}
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
							<path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3M17 6h2.5a2.5 2.5 0 0 1-2.6 3M12 14v3M8.5 20h7" />
						</svg>
					</span>
					<span>
						<span className="block text-[15px] font-semibold">Your fastest 5K this year</span>
						<span className="block text-[13px] text-[var(--lope-dim)]">41 seconds quicker than October</span>
					</span>
				</div>

				<div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
					{[
						{ label: "Distance", value: "5.02", unit: "km" },
						{ label: "Avg pace", value: "5'31\"", unit: "/km" },
						{ label: "Time", value: "27:43", unit: "" },
						{ label: "Elevation", value: "38", unit: "m" },
					].map((st) => (
						<div key={st.label}>
							<p className="text-[13px] font-medium text-[var(--lope-dim)]">{st.label}</p>
							<p className="mt-1 flex items-baseline gap-1">
								<span className="lope-num text-[40px]" style={numStyle()}>
									{st.value}
								</span>
								<span className="text-[14px] font-semibold text-[var(--lope-dim)]">{st.unit}</span>
							</p>
						</div>
					))}
				</div>

				<ul className="mt-5 space-y-[7px]">
					{splits.map((sp, i) => (
						<li key={sp.km} className="flex items-center gap-3 text-[13px] font-semibold">
							<span className="w-3 text-[var(--lope-dim)]">{sp.km}</span>
							<span className="h-[10px] flex-1 overflow-hidden rounded-full">
								<span
									className="lope-grow block h-full rounded-full"
									style={{
										width: `${62 + ((slowest - sp.secs) / (slowest - fastest)) * 38}%`,
										background: sp.secs === fastest ? accent : "var(--lope-raised)",
										animationDelay: `${300 + i * 70}ms`,
									}}
								/>
							</span>
							<span className="w-11 text-right">{pace(sp.secs)}</span>
						</li>
					))}
				</ul>
			</LopeCard>

			<div className="mt-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+30px)]">
				<motion.button
					type="button"
					onClick={save}
					whileTap={{ scale: 0.97 }}
					className="relative flex h-[58px] w-full cursor-pointer items-center justify-center overflow-hidden text-[18px] font-bold"
					style={{ background: accent, color: inkOn(accent), borderRadius: Math.min(29, radiusPx()) }}
				>
					<AnimatePresence mode="wait" initial={false}>
						<motion.span
							key={saved ? "s" : "n"}
							className="flex items-center gap-2"
							initial={{ y: 18, opacity: 0 }}
							animate={{ y: 0, opacity: 1 }}
							exit={{ y: -18, opacity: 0 }}
							transition={{ duration: 0.25, ease }}
						>
							{saved && (
								<svg
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.6"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="M5 12.5l4.5 4.5L19 7.5" />
								</svg>
							)}
							{saved ? "Saved" : "Save run"}
						</motion.span>
					</AnimatePresence>
				</motion.button>
			</div>
		</div>
	);
}
