import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { ui } from "spool";
import "./tern.css";

/* Tern, a flight app. The flight is the screen: codes, times, gate. */

export const k = ui.knobs({
	ticket: {
		radius: { type: "corners", value: 30, min: 0, max: 44 },
		accent: { type: "color", value: "#2f45f5", swatches: ["#2f45f5", "#ff5a1f", "#0f7a5c", "#111214", "#c2245a"] },
	},
	page: {
		paper: { type: "color", value: "#f3f1ec", swatches: ["#f3f1ec", "#ffffff", "#e9eef2"] },
	},
	motion: {
		spring: { type: "spring", value: { duration: 0.55, bounce: 0.18 } },
		replay: { type: "action", label: "Replay entrance" },
	},
});

export type TernScreen = "flight" | "seat" | "pass";

const flight = {
	number: "TN 500",
	date: "Thu, Nov 13",
	from: { city: "London", code: "LHR", time: "07:05" },
	to: { city: "Lisbon", code: "LIS", time: "09:50" },
	duration: "2 h 45 min",
	gate: "F34",
	boards: "06:25",
	passenger: "Maya Collins",
	group: "2",
};

function spring(delay = 0) {
	const s = k.motion.spring as { duration: number; bounce: number };
	return { type: "spring" as const, duration: s.duration, bounce: s.bounce, delay };
}

function useTrip() {
	ui.use();
	const seat = (ui.state.ternSeat as string | undefined) ?? "23C";
	const checkedIn = (ui.state.ternCheckedIn as boolean | undefined) ?? false;
	return { seat, checkedIn };
}

/** where a screen's primary action walks: the clip's frame says which frame that is */
export type TernGo = (to: TernScreen, patch?: Record<string, unknown>) => void;

export function Tern({ screen, onGo }: { screen: TernScreen; onGo?: TernGo }) {
	const style = { "--tern-paper": k.page.paper } as CSSProperties;
	const go: TernGo = (to, patch) => onGo?.(to, patch);
	return (
		<div className="tern" style={style} key={k.motion.replay}>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap"
				precedence="default"
			/>
			<StatusBar />
			{screen === "flight" && <Flight go={go} />}
			{screen === "seat" && <Seat go={go} />}
			{screen === "pass" && <Pass go={go} />}
		</div>
	);
}

/* the one card: the flight's live numbers, and later the pass itself */
export function Ticket({ children, delay = 0.12 }: { children: ReactNode; delay?: number }) {
	const r = k.ticket.radius as number | number[];
	const borderRadius = Array.isArray(r) ? r.map((v) => `${v}px`).join(" ") : r;
	return (
		<motion.section
			className="tern-card"
			style={{ background: k.ticket.accent, borderRadius }}
			initial={{ opacity: 0, y: 28 }}
			animate={{ opacity: 1, y: 0 }}
			transition={spring(delay)}
		>
			{children}
		</motion.section>
	);
}

function Rise({ children, i }: { children: ReactNode; i: number }) {
	return (
		<motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring(i * 0.06)}>
			{children}
		</motion.div>
	);
}

function Flight({ go }: { go: TernGo }) {
	const { seat, checkedIn } = useTrip();
	return (
		<>
			<div className="tern-top">
				<span>{flight.number}</span>
				<span className="tern-live tern-top-dim">
					<span className="tern-dot" />
					On time · {flight.date}
				</span>
			</div>

			<div className="tern-route">
				<Rise i={0}>
					<div className="tern-leg">
						<div>
							<div className="tern-city">{flight.from.city}</div>
							<div className="tern-code">{flight.from.code}</div>
						</div>
						<div className="tern-time">
							<small>Departs</small>
							{flight.from.time}
						</div>
					</div>
				</Rise>
				<Rise i={1}>
					<div className="tern-between">
						<Plane />
						<span>{flight.duration}, nonstop</span>
						<span className="tern-between-line" />
					</div>
				</Rise>
				<Rise i={2}>
					<div className="tern-leg">
						<div>
							<div className="tern-city">{flight.to.city}</div>
							<div className="tern-code">{flight.to.code}</div>
						</div>
						<div className="tern-time">
							<small>Lands</small>
							{flight.to.time}
						</div>
					</div>
				</Rise>
			</div>

			<div style={{ padding: "26px 16px 0" }}>
				<Ticket>
					<div className="tern-card-label">Boarding in</div>
					<div className="tern-big">42 min</div>
					<div className="tern-bar">
						<motion.span
							initial={{ scaleX: 0 }}
							animate={{ scaleX: 0.62 }}
							transition={{ duration: 1.6, ease: [0.23, 1, 0.32, 1], delay: 0.35 }}
						/>
					</div>
					<dl className="tern-grid">
						<div>
							<dt>Gate</dt>
							<dd>{flight.gate}</dd>
						</div>
						<div>
							<dt>Boards</dt>
							<dd>{flight.boards}</dd>
						</div>
						<div>
							<dt>Seat</dt>
							<AnimatePresence mode="popLayout" initial={false}>
								<motion.dd
									key={seat}
									initial={{ y: 16, opacity: 0 }}
									animate={{ y: 0, opacity: 1 }}
									transition={spring()}
								>
									{seat}
								</motion.dd>
							</AnimatePresence>
						</div>
					</dl>
				</Ticket>
			</div>

			<div className="tern-foot">
				{checkedIn ? (
					<>
						<p className="tern-note">
							You're checked in. Seat {seat}, group {flight.group}.
						</p>
						<button type="button" className="tern-cta" onClick={() => go("pass")}>
							Boarding pass
						</button>
					</>
				) : (
					<>
						<p className="tern-note">Check-in closes at 06:25</p>
						<button type="button" className="tern-cta" onClick={() => go("seat")}>
							Check in
						</button>
					</>
				)}
			</div>
		</>
	);
}

const COLS = ["A", "B", "C", "D", "E", "F"];
const ROWS = [10, 11, 12, 14, 15, 16, 17, 18, 19, 20];
/* taken seats, as an airline would send them */
const TAKEN = new Set([
	"10A",
	"10B",
	"10E",
	"10F",
	"11C",
	"11D",
	"11E",
	"12A",
	"12B",
	"12C",
	"12F",
	"14A",
	"14B",
	"14D",
	"15C",
	"15D",
	"15E",
	"15F",
	"16A",
	"16F",
	"17B",
	"17C",
	"17D",
	"17E",
	"18A",
	"18F",
	"19C",
	"19D",
	"20A",
	"20B",
	"20E",
	"20F",
]);

function kind(seat: string) {
	const col = seat.slice(-1);
	const row = Number(seat.slice(0, -1));
	const place = col === "A" || col === "F" ? "Window" : col === "C" || col === "D" ? "Aisle" : "Middle";
	return { place, extra: row === 14 ? "Extra legroom" : `Row ${row}` };
}

function Seat({ go }: { go: TernGo }) {
	const trip = useTrip();
	const [pick, setPick] = useState(trip.seat === "23C" ? "14F" : trip.seat);
	const info = kind(pick);
	return (
		<>
			<div className="tern-top">
				<button type="button" className="tern-round" onClick={() => ui.back()} aria-label="Back">
					<Chevron />
				</button>
				<span>
					LHR → LIS <span className="tern-top-dim">· {flight.number}</span>
				</span>
				<span style={{ width: 40 }} />
			</div>

			<div className="tern-pick">
				<div style={{ overflow: "hidden", height: 92 }}>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={pick}
							className="tern-pick-seat"
							style={{ color: k.ticket.accent }}
							initial={{ y: 70, opacity: 0 }}
							animate={{ y: 0, opacity: 1 }}
							exit={{ y: -70, opacity: 0 }}
							transition={spring()}
						>
							{pick}
						</motion.span>
					</AnimatePresence>
				</div>
				<div className="tern-pick-kind">
					{info.place}
					<br />
					{info.extra}
				</div>
			</div>

			<div className="tern-cabin">
				<div className="tern-cols">
					{["A", "B", "C", "aisle", "D", "E", "F"].map((c) => (
						<span key={c}>{c === "aisle" ? "" : c}</span>
					))}
				</div>
				<div className="tern-rows">
					{ROWS.map((row, ri) => (
						<div key={row}>
							{row === 14 && <div className="tern-exit">Exit</div>}
							<motion.div
								className="tern-row"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={spring(0.1 + ri * 0.025)}
							>
								{COLS.slice(0, 3).map((c) => (
									<SeatButton key={c} id={`${row}${c}`} pick={pick} onPick={setPick} />
								))}
								<span className="tern-rownum">{row}</span>
								{COLS.slice(3).map((c) => (
									<SeatButton key={c} id={`${row}${c}`} pick={pick} onPick={setPick} />
								))}
							</motion.div>
						</div>
					))}
				</div>
			</div>

			<div className="tern-foot" style={{ paddingTop: 12 }}>
				<button
					type="button"
					className="tern-cta"
					onClick={() => go("pass", { ternSeat: pick, ternCheckedIn: true })}
				>
					Check in to {pick}
				</button>
			</div>
		</>
	);
}

function SeatButton({ id, pick, onPick }: { id: string; pick: string; onPick: (id: string) => void }) {
	const taken = TAKEN.has(id);
	const on = id === pick;
	return (
		<button
			type="button"
			className="tern-seat"
			data-taken={taken ? "" : undefined}
			onClick={taken ? undefined : () => onPick(id)}
			aria-label={id}
		>
			<AnimatePresence>
				{on && (
					<motion.span
						className="tern-seat-fill"
						style={{ background: k.ticket.accent }}
						initial={{ scale: 0.4, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						exit={{ scale: 0.4, opacity: 0 }}
						transition={spring()}
					>
						✓
					</motion.span>
				)}
			</AnimatePresence>
		</button>
	);
}

function Pass({ go }: { go: TernGo }) {
	const { seat } = useTrip();
	return (
		<>
			<div className="tern-top">
				<button type="button" className="tern-round" onClick={() => ui.back()} aria-label="Back">
					<Chevron />
				</button>
				<span>Boarding pass</span>
				<span style={{ width: 40 }} />
			</div>

			<div style={{ padding: "8px 16px 0" }}>
				<Ticket delay={0.04}>
					<div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 500 }}>
						<span>{flight.number}</span>
						<span style={{ opacity: 0.72 }}>{flight.date}</span>
					</div>
					<div className="tern-pass-route">
						<span className="tern-big">{flight.from.code}</span>
						<Plane size={28} />
						<span className="tern-big">{flight.to.code}</span>
					</div>
					<dl className="tern-grid">
						<div>
							<dt>Gate</dt>
							<dd>{flight.gate}</dd>
						</div>
						<div>
							<dt>Boards</dt>
							<dd>{flight.boards}</dd>
						</div>
						<div>
							<dt>Seat</dt>
							<dd>{seat}</dd>
						</div>
					</dl>
					<div className="tern-perf">
						<i style={{ left: -14 }} />
						<i style={{ right: -14 }} />
					</div>
					<motion.div
						className="tern-qr"
						initial={{ opacity: 0, scale: 0.94 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={spring(0.3)}
					>
						<Code />
					</motion.div>
					<div className="tern-pax">
						<div>
							<div className="tern-card-label">Passenger</div>
							<b>{flight.passenger}</b>
						</div>
						<div style={{ textAlign: "right" }}>
							<div className="tern-card-label">Group</div>
							<b>{flight.group}</b>
						</div>
					</div>
				</Ticket>
			</div>

			<div className="tern-foot" style={{ paddingTop: 16 }}>
				<button type="button" className="tern-cta" onClick={() => go("flight")}>
					Done
				</button>
			</div>
		</>
	);
}

/* a scannable-looking code: three finder squares and a seeded field */
function Code() {
	const n = 25;
	let s = 1417;
	const rand = () => {
		s = (s * 16807) % 2147483647;
		return s / 2147483647;
	};
	const finder = (x: number, y: number) => {
		for (const [fx, fy] of [
			[0, 0],
			[n - 7, 0],
			[0, n - 7],
		] as const) {
			if (x >= fx && x < fx + 7 && y >= fy && y < fy + 7) return true;
		}
		return false;
	};
	const cells: ReactNode[] = [];
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			const r = rand();
			if (finder(x, y)) continue;
			if (r > 0.52) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
		}
	const square = (x: number, y: number) => (
		<g key={`f${x}${y}`}>
			<rect x={x} y={y} width={7} height={7} />
			<rect x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />
			<rect x={x + 2} y={y + 2} width={3} height={3} />
		</g>
	);
	return (
		<svg
			width={150}
			height={150}
			viewBox={`0 0 ${n} ${n}`}
			fill="#111214"
			shapeRendering="crispEdges"
			aria-label="Boarding code"
		>
			{cells}
			{square(0, 0)}
			{square(n - 7, 0)}
			{square(0, n - 7)}
		</svg>
	);
}

function Plane({ size = 18 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M21.5 12.6c0-.6-.5-1-1.1-1H15l-4.6-7.3a.9.9 0 0 0-.8-.4H8.3l2.4 7.7H5.9L4.2 9.4H2.8l1 3.2-1 3.2h1.4l1.7-2.2h4.8l-2.4 7.7h1.3c.3 0 .6-.2.8-.4l4.6-7.3h5.4c.6 0 1.1-.5 1.1-1Z" />
		</svg>
	);
}

function Chevron() {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2.2}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M14.5 5.5 8 12l6.5 6.5" />
		</svg>
	);
}

function StatusBar() {
	return (
		<div className="tern-status">
			<span>05:43</span>
			<span className="tern-status-icons">
				<svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true">
					<rect x="0" y="8" width="3" height="4" rx="1" />
					<rect x="5" y="5.5" width="3" height="6.5" rx="1" />
					<rect x="10" y="3" width="3" height="9" rx="1" />
					<rect x="15" y="0" width="3" height="12" rx="1" />
				</svg>
				<svg width="27" height="13" viewBox="0 0 27 13" fill="none" aria-hidden="true">
					<rect x="0.5" y="0.5" width="23" height="12" rx="3.8" stroke="currentColor" opacity="0.4" />
					<rect x="2" y="2" width="15" height="9" rx="2.5" fill="currentColor" />
					<path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity="0.5" />
				</svg>
			</span>
		</div>
	);
}
