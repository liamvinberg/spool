import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { ui } from "spool";
import "./tern.css";

/* Tern: a trip. One ticket carries every screen; it is the piece to tune. */
const k = ui.knobs({
	ticket: {
		radius: { type: "corners", value: 30, min: 0, max: 48 },
		accent: { type: "color", value: "#f2542d", swatches: ["#f2542d", "#1f3cff", "#0b7a5c", "#6d3cf5", "#121316"] },
	},
});

const ease = [0.23, 1, 0.32, 1] as const;

const flight = {
	number: "TP 1284",
	date: "Fri 14 Nov",
	from: { code: "LHR", city: "London", time: "07:25" },
	to: { code: "LIS", city: "Lisbon", time: "10:05" },
	gate: "B22",
	boards: "06:45",
	length: "2 h 40 min",
	distance: "1,565 km",
};

const passengers = [
	{ name: "Ada Hughes", seat: "14A", group: "2", seed: 7 },
	{ name: "Tom Hughes", seat: "14B", group: "2", seed: 19 },
];

const later = [
	{ route: "LIS → LHR", when: "Sun 23 Nov · TP 1285", time: "17:40" },
	{ route: "LHR → AMS", when: "Thu 4 Dec · KL 1004", time: "08:10" },
	{ route: "AMS → LHR", when: "Sun 7 Dec · KL 1011", time: "19:55" },
];

function corners(r: number | number[]) {
	return typeof r === "number" ? r : r.map((v) => `${v}px`).join(" ");
}

/* Each frame passes where its primary action walks, so the canvas draws one arrow per screen. */
export function Tern({ screen, onNext }: { screen: "trips" | "flight" | "pass"; onNext: () => void }) {
	return (
		<>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap"
				precedence="default"
			/>
			{screen === "trips" && <TripsScreen onNext={onNext} />}
			{screen === "flight" && <FlightScreen onNext={onNext} />}
			{screen === "pass" && <PassScreen onNext={onNext} />}
		</>
	);
}

/* ---------- trips ---------- */

function TripsScreen({ onNext }: { onNext: () => void }) {
	const left = useCountdown(2 * 3600 + 9 * 60 + 41);
	return (
		<div className="tern flex h-full flex-col overflow-hidden bg-[var(--tern-ground)] text-[var(--tern-ink)]">
			<StatusBar />
			<header className="flex items-end justify-between px-6 pt-3">
				<div>
					<h1 className="text-[40px] font-bold leading-none tracking-[-0.035em]">Trips</h1>
					<p className="mt-2 flex items-center gap-2 text-[16px] font-medium text-[var(--tern-dim)]">
						<span className="tern-blink size-2 rounded-full" style={{ background: k.ticket.accent }} />
						Boards in {left}
					</p>
				</div>
				<span className="grid size-11 place-items-center rounded-full bg-[var(--tern-faint)] text-[15px] font-semibold">
					AH
				</span>
			</header>

			<motion.button
				type="button"
				whileTap={{ scale: 0.97 }}
				onClick={onNext}
				className="tern-rise mx-4 mt-6 block text-left"
			>
				<Ticket mode="hero" />
			</motion.button>

			<h2
				className="tern-rise mt-8 px-6 text-[20px] font-semibold tracking-[-0.02em]"
				style={{ animationDelay: "80ms" }}
			>
				Later
			</h2>
			<ul className="tern-rise mx-4 mt-3 rounded-[24px] bg-[#fff] px-5" style={{ animationDelay: "140ms" }}>
				{later.map((trip, i) => (
					<li
						key={trip.route}
						className={
							i > 0
								? "flex h-[76px] items-center border-t border-[var(--tern-faint)]"
								: "flex h-[76px] items-center"
						}
					>
						<div className="flex-1">
							<p className="text-[20px] font-semibold tracking-[-0.02em]">{trip.route}</p>
							<p className="mt-0.5 text-[14px] text-[var(--tern-dim)]">{trip.when}</p>
						</div>
						<span className="text-[18px] font-medium">{trip.time}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function useCountdown(start: number) {
	const [s, setS] = useState(start);
	useEffect(() => {
		const t = setInterval(() => setS((v) => Math.max(0, v - 1)), 1000);
		return () => clearInterval(t);
	}, []);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/* ---------- flight ---------- */

function FlightScreen({ onNext }: { onNext: () => void }) {
	return (
		<div className="tern flex h-full flex-col overflow-hidden bg-[var(--tern-ground)] text-[var(--tern-ink)]">
			<StatusBar />
			<header className="flex h-14 items-center justify-between px-5">
				<RoundButton label="Back" onClick={() => ui.back()}>
					<path d="M15 5l-7 7 7 7" />
				</RoundButton>
				<span className="text-[17px] font-semibold">{flight.number}</span>
				<span className="size-10" />
			</header>

			<div className="mx-4 mt-2">
				<Ticket mode="compact" />
			</div>

			<RouteMap />

			<div className="tern-rise mt-6 flex items-end justify-between px-6" style={{ animationDelay: "120ms" }}>
				<div>
					<p className="text-[16px] font-medium text-[var(--tern-dim)]">Gate</p>
					<p className="text-[96px] font-bold leading-[0.9] tracking-[-0.05em]">{flight.gate}</p>
				</div>
				<div className="flex flex-col gap-3 pb-1 text-right">
					<Stat label="Boards" value={flight.boards} />
					<Stat label="Seat" value="14A" />
				</div>
			</div>

			<div className="mt-auto px-4 pb-[calc(env(safe-area-inset-bottom)+34px)]">
				<motion.button
					type="button"
					whileTap={{ scale: 0.97 }}
					onClick={onNext}
					className="flex h-[62px] w-full items-center justify-center gap-3 rounded-full bg-[var(--tern-ink)] text-[19px] font-semibold text-[#fff]"
				>
					<svg
						aria-hidden="true"
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<rect x="4" y="4" width="6" height="6" rx="1" />
						<rect x="14" y="4" width="6" height="6" rx="1" />
						<rect x="4" y="14" width="6" height="6" rx="1" />
						<path d="M14 14h2v2M20 14v6h-6M17 17v3" />
					</svg>
					Boarding pass
				</motion.button>
			</div>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-[14px] font-medium text-[var(--tern-dim)]">{label}</p>
			<p className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">{value}</p>
		</div>
	);
}

function RouteMap() {
	/* the dot field is a fixed scatter, denser where land would be */
	const dots: [number, number][] = [];
	for (let x = 0; x < 30; x++) {
		for (let y = 0; y < 11; y++) {
			const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
			const r = n - Math.floor(n);
			const land = (x > 4 && x < 14 && y > 3) || (x > 14 && y < 7) || (x > 20 && y > 2);
			if (r < (land ? 0.82 : 0.12)) dots.push([12 + x * 12, 12 + y * 13]);
		}
	}
	return (
		<div
			className="tern-rise relative mx-4 mt-3 h-[164px] overflow-hidden rounded-[24px] bg-[#fff]"
			style={{ animationDelay: "60ms" }}
		>
			<svg aria-hidden="true" viewBox="0 0 358 164" className="absolute inset-0 size-full">
				{dots.map(([x, y]) => (
					<circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="var(--tern-faint)" />
				))}
				<path
					d="M300 34 Q 190 -8 64 120"
					fill="none"
					stroke="var(--tern-faint)"
					strokeWidth="3"
					strokeLinecap="round"
				/>
				<path
					d="M300 34 Q 190 -8 64 120"
					pathLength={1}
					className="tern-draw"
					fill="none"
					stroke={k.ticket.accent}
					strokeWidth="3"
					strokeLinecap="round"
				/>
				<circle cx="300" cy="34" r="6" fill={k.ticket.accent} />
				<circle cx="64" cy="120" r="6" fill="#fff" stroke={k.ticket.accent} strokeWidth="3" />
			</svg>
			<span className="absolute top-[46px] right-[34px] text-[14px] font-semibold">LHR</span>
			<span className="absolute top-[94px] left-[30px] text-[14px] font-semibold">LIS</span>
			<p className="absolute right-5 bottom-4 text-[14px] font-medium text-[var(--tern-dim)]">
				{flight.distance} · {flight.length}
			</p>
		</div>
	);
}

/* ---------- pass ---------- */

function PassScreen({ onNext }: { onNext: () => void }) {
	const [who, setWho] = useState(0);
	const [saved, setSaved] = useState(false);
	const p = passengers[who] ?? passengers[0]!;
	return (
		<div className="tern flex h-full flex-col overflow-hidden bg-[var(--tern-night)] text-[#fff]">
			<StatusBar />
			<header className="flex h-14 items-center justify-between px-5">
				<RoundButton label="Done" light onClick={onNext}>
					<path d="M6 6l12 12M18 6L6 18" />
				</RoundButton>
				<span className="text-[17px] font-semibold">Boarding pass</span>
				<span className="w-10 text-right text-[15px] font-medium text-[rgba(255,255,255,0.55)]">
					{who + 1}/{passengers.length}
				</span>
			</header>

			<button
				type="button"
				onClick={() => setWho((w) => (w + 1) % passengers.length)}
				className="mx-4 mt-3 block text-left"
			>
				<Ticket mode="pass" passenger={who} ground="var(--tern-night)" />
			</button>

			<div className="mt-4 flex justify-center gap-2">
				{passengers.map((x, i) => (
					<motion.span
						key={x.name}
						animate={{ width: i === who ? 20 : 6, opacity: i === who ? 1 : 0.35 }}
						transition={{ duration: 0.3, ease }}
						className="h-1.5 rounded-full bg-[#fff]"
					/>
				))}
			</div>

			<div className="mt-auto px-4 pb-[calc(env(safe-area-inset-bottom)+34px)]">
				<motion.button
					type="button"
					whileTap={{ scale: 0.97 }}
					onClick={() => setSaved(true)}
					className="flex h-[62px] w-full items-center justify-center gap-2 rounded-full bg-[#fff] text-[19px] font-semibold text-[var(--tern-ink)]"
				>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={saved ? "saved" : "save"}
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.28, ease }}
						>
							{saved ? `Saved for ${p.name.split(" ")[0]}` : "Save to phone"}
						</motion.span>
					</AnimatePresence>
				</motion.button>
			</div>
		</div>
	);
}

/* ---------- the ticket ---------- */

function Ticket({
	mode,
	passenger = 0,
	ground = "var(--tern-ground)",
}: {
	mode: "hero" | "compact" | "pass";
	passenger?: number;
	ground?: string;
}) {
	const p = passengers[passenger] ?? passengers[0]!;
	return (
		<div
			className="relative overflow-hidden"
			style={{
				borderRadius: corners(k.ticket.radius),
				background: mode === "pass" ? "#fff" : k.ticket.accent,
				viewTransitionName: "tern-ticket",
			}}
		>
			<div className="relative overflow-hidden px-6 pt-5 pb-6 text-[#fff]" style={{ background: k.ticket.accent }}>
				{mode === "pass" && (
					<span className="tern-shine pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-[rgba(255,255,255,0.18)]" />
				)}
				<div className="flex items-center justify-between text-[15px] font-medium">
					<span className="text-[rgba(255,255,255,0.8)]">
						{flight.number} · {flight.date}
					</span>
					<span className="flex items-center gap-1.5 rounded-full bg-[rgba(255,255,255,0.2)] px-2.5 py-1 text-[13px] font-semibold">
						<span className="size-1.5 rounded-full bg-[#fff]" />
						On time
					</span>
				</div>
				<div className="mt-5 flex items-center gap-3">
					<span className="text-[64px] font-bold leading-none tracking-[-0.04em]">{flight.from.code}</span>
					<span className="relative flex h-6 flex-1 items-center">
						<span className="h-0 flex-1 border-t-2 border-dashed border-[rgba(255,255,255,0.45)]" />
						<svg
							aria-hidden="true"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="#fff"
							className="mx-1.5 shrink-0 rotate-90"
						>
							<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z" />
						</svg>
						<span className="h-0 flex-1 border-t-2 border-dashed border-[rgba(255,255,255,0.45)]" />
					</span>
					<span className="text-[64px] font-bold leading-none tracking-[-0.04em]">{flight.to.code}</span>
				</div>
				<div className="mt-2 flex justify-between text-[15px] font-medium text-[rgba(255,255,255,0.8)]">
					<span>
						{flight.from.city} {flight.from.time}
					</span>
					<span>
						{flight.to.city} {flight.to.time}
					</span>
				</div>
				{mode === "hero" && (
					<div className="mt-5 grid grid-cols-3 border-t border-[rgba(255,255,255,0.25)] pt-4">
						<HeroStat label="Gate" value={flight.gate} />
						<HeroStat label="Boards" value={flight.boards} />
						<HeroStat label="Seat" value="14A" />
					</div>
				)}
			</div>

			{mode === "pass" && (
				<div className="relative text-[var(--tern-ink)]">
					<span className="absolute -top-3 -left-3 size-6 rounded-full" style={{ background: ground }} />
					<span className="absolute -top-3 -right-3 size-6 rounded-full" style={{ background: ground }} />
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.div
							key={p.name}
							initial={{ opacity: 0, x: 40 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -40 }}
							transition={{ duration: 0.36, ease }}
							className="px-6 pt-6 pb-6"
						>
							<p className="text-[14px] font-medium text-[var(--tern-dim)]">Passenger</p>
							<p className="text-[28px] font-bold tracking-[-0.03em]">{p.name}</p>
							<div className="mt-4 grid grid-cols-4">
								<PassStat label="Seat" value={p.seat} />
								<PassStat label="Group" value={p.group} />
								<PassStat label="Gate" value={flight.gate} />
								<PassStat label="Boards" value={flight.boards} />
							</div>
							<div className="mt-6 flex justify-center">
								<Code seed={p.seed} size={172} />
							</div>
						</motion.div>
					</AnimatePresence>
				</div>
			)}
		</div>
	);
}

function HeroStat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-[13px] font-medium text-[rgba(255,255,255,0.72)]">{label}</p>
			<p className="mt-0.5 text-[26px] font-semibold leading-tight tracking-[-0.03em]">{value}</p>
		</div>
	);
}

function PassStat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-[13px] font-medium text-[var(--tern-dim)]">{label}</p>
			<p className="text-[22px] font-semibold tracking-[-0.03em]">{value}</p>
		</div>
	);
}

/* A scannable-looking square: three finder marks and a seeded field. */
function Code({ seed, size }: { seed: number; size: number }) {
	const n = 25;
	const cells: [number, number][] = [];
	let s = seed * 9973;
	const rand = () => {
		s = (s * 16807) % 2147483647;
		return s / 2147483647;
	};
	const finder = (x: number, y: number) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
	for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!finder(x, y) && rand() < 0.5) cells.push([x, y]);
	const marks = [
		[0, 0],
		[n - 7, 0],
		[0, n - 7],
	];
	return (
		<svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges">
			{cells.map(([x, y]) => (
				<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="var(--tern-ink)" />
			))}
			{marks.map(([x = 0, y = 0]) => (
				<g key={`${x}-${y}`}>
					<rect
						x={x + 0.5}
						y={y + 0.5}
						width="6"
						height="6"
						rx="1.4"
						fill="none"
						stroke="var(--tern-ink)"
						strokeWidth="1"
					/>
					<rect x={x + 2} y={y + 2} width="3" height="3" rx="0.6" fill="var(--tern-ink)" />
				</g>
			))}
		</svg>
	);
}

/* ---------- parts ---------- */

function RoundButton({
	label,
	onClick,
	light = false,
	children,
}: {
	label: string;
	onClick: () => void;
	light?: boolean;
	children: ReactNode;
}) {
	return (
		<motion.button
			type="button"
			aria-label={label}
			whileTap={{ scale: 0.88 }}
			onClick={onClick}
			className={
				light
					? "grid size-10 place-items-center rounded-full bg-[rgba(255,255,255,0.12)]"
					: "grid size-10 place-items-center rounded-full bg-[var(--tern-faint)]"
			}
		>
			<svg
				aria-hidden="true"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2.4"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				{children}
			</svg>
		</motion.button>
	);
}

function StatusBar() {
	return (
		<div className="flex h-[54px] shrink-0 items-center justify-between px-8 pt-1 text-[16px] font-semibold">
			<span>9:41</span>
			<span className="flex items-center gap-1.5">
				<svg aria-hidden="true" width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
					<rect x="0" y="8" width="3" height="4" rx="1" />
					<rect x="5" y="5.5" width="3" height="6.5" rx="1" />
					<rect x="10" y="3" width="3" height="9" rx="1" />
					<rect x="15" y="0" width="3" height="12" rx="1" />
				</svg>
				<svg aria-hidden="true" width="27" height="13" viewBox="0 0 27 13" fill="none">
					<rect x="0.5" y="0.5" width="23" height="12" rx="3.8" stroke="currentColor" opacity="0.4" />
					<rect x="2" y="2" width="17" height="9" rx="2.5" fill="currentColor" />
					<path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity="0.5" />
				</svg>
			</span>
		</div>
	);
}
