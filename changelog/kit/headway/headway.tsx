import { type ReactNode, useEffect, useState } from "react";
import { ui } from "spool";
import { corners, k } from "./knobs";
import "./headway.css";

/* Headway: New York departures. Colour is never decoration here: a line's colour names the line,
   and the ticket wears the day's control colour so an inspector can tell it is live. */

type Family = "green" | "pink";
type Departure = { id: string; no: string; family: Family; to: string; min: number; at: string; platform: string };

const departures: Departure[] = [
	{ id: "17a", no: "17", family: "green", to: "Crown Heights", min: 3, at: "8:13", platform: "Platform 2" },
	{ id: "41", no: "41", family: "pink", to: "Newark Airport", min: 6, at: "8:16", platform: "Track 3" },
	{ id: "19", no: "19", family: "green", to: "Flatbush Avenue", min: 7, at: "8:17", platform: "Platform 2" },
	{ id: "43", no: "43", family: "pink", to: "Jamaica", min: 11, at: "8:21", platform: "Track 3" },
	{ id: "18", no: "18", family: "green", to: "Bowling Green", min: 12, at: "8:22", platform: "Platform 2" },
];

const RED = "#e2382f";
const BLUE = "#2f6bd8";

function familyColour(f: Family) {
	return f === "green" ? k.line.green : k.line.pink;
}
function familyName(f: Family) {
	return f === "green" ? "Green line" : "Commuter rail";
}

type Stop = { name: string; after: number; change?: { label: string; colour: string }[] };
const routes: Record<Family, { to: string; stops: Stop[] }> = {
	green: {
		to: "Wall Street",
		stops: [
			{ name: "Union Square", after: 0 },
			{ name: "Astor Place", after: 1 },
			{ name: "Bleecker Street", after: 3 },
			{
				name: "Canal Street",
				after: 5,
				change: [
					{ label: "Red", colour: RED },
					{ label: "Blue", colour: BLUE },
				],
			},
			{ name: "Fulton Street", after: 7, change: [{ label: "Red", colour: RED }] },
			{ name: "Wall Street", after: 9 },
		],
	},
	pink: {
		to: "Newark Airport",
		stops: [
			{ name: "Union Square", after: 0 },
			{
				name: "Penn Station",
				after: 3,
				change: [
					{ label: "Green", colour: "green" },
					{ label: "Red", colour: RED },
					{ label: "Blue", colour: BLUE },
				],
			},
			{ name: "Secaucus", after: 7 },
			{ name: "Newark Penn", after: 10 },
			{ name: "Newark Airport", after: 14 },
		],
	},
};

function addMinutes(at: string, m: number) {
	const [h, mm] = at.split(":").map(Number);
	const t = (h ?? 0) * 60 + (mm ?? 0) + m;
	return `${Math.floor(t / 60) % 12 || 12}:${String(t % 60).padStart(2, "0")}`;
}

function useDeparture() {
	ui.use();
	const id = (ui.state.hwDep as string | undefined) ?? "17a";
	return departures.find((d) => d.id === id) ?? departures[0]!;
}

export type HeadwayScreen = "departures" | "trip" | "ticket";
type Go = (to: HeadwayScreen, patch?: { hwDep?: string }) => void;

/* the frame passes onGo, so each screen's walks are drawn from its own frame */
export function Headway({ screen = "departures", onGo = () => {} }: { screen?: HeadwayScreen; onGo?: Go }) {
	return (
		<div className="hw">
			<StatusBar />
			{screen === "departures" && <Departures onGo={onGo} />}
			{screen === "trip" && <Trip onGo={onGo} />}
			{screen === "ticket" && <Ticket onGo={onGo} />}
		</div>
	);
}

function Departures({ onGo }: { onGo: Go }) {
	const [hero, ...later] = departures;
	const open = (d: Departure) => onGo("trip", { hwDep: d.id });
	if (!hero) return null;
	const colour = familyColour(hero.family);
	return (
		<>
			<header className="hw-rise" style={{ padding: "10px 24px 0" }}>
				<h1 style={{ fontSize: 38, lineHeight: "42px", fontWeight: 600, letterSpacing: "-0.03em" }}>
					Union Square
				</h1>
				<p style={{ marginTop: 4, fontSize: 16, color: "var(--hw-dim)" }}>2 min walk · 6 departures</p>
			</header>

			<DepartureCard d={hero} colour={colour} onOpen={() => open(hero)} />

			<section style={{ padding: "26px 24px 0" }}>
				<h2
					className="hw-rise"
					style={{ fontSize: 15, fontWeight: 600, color: "var(--hw-dim)", animationDelay: "160ms" }}
				>
					Later
				</h2>
				<ul style={{ marginTop: 4 }}>
					{later.map((d, i) => (
						<li key={d.id} className="hw-rise" style={{ animationDelay: `${200 + i * 50}ms` }}>
							<button type="button" className="hw-row hw-press" onClick={() => open(d)}>
								<span className="hw-chip" style={{ background: familyColour(d.family) }}>
									{d.no}
								</span>
								<span style={{ flex: 1, minWidth: 0 }}>
									<span style={{ display: "block", fontSize: 17, fontWeight: 600 }}>{d.to}</span>
									<span style={{ display: "block", fontSize: 13, color: "var(--hw-dim)" }}>
										{d.at} · {d.platform}
									</span>
								</span>
								<span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>
									{d.min}
									<span style={{ fontSize: 15, fontWeight: 500, color: "var(--hw-dim)" }}> min</span>
								</span>
							</button>
						</li>
					))}
				</ul>
			</section>

			<TabBar onGo={onGo} />
		</>
	);
}

/** The card worth tuning: the next train, filled with its line's colour. */
export function DepartureCard({ d, colour, onOpen }: { d: Departure; colour: string; onOpen: () => void }) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className="hw-card hw-press"
			style={{
				position: "relative",
				display: "flex",
				flexDirection: "column",
				justifyContent: "flex-start",
				width: "calc(100% - 32px)",
				height: 252,
				margin: "20px 16px 0",
				padding: 22,
				borderRadius: corners(k.card.radius),
				background: colour,
				color: "#fff",
				textAlign: "left",
				overflow: "hidden",
				animationDelay: "60ms",
			}}
		>
			<span style={{ display: "flex", alignItems: "center", gap: 10 }}>
				<span className="hw-chip" style={{ background: "rgba(255,255,255,0.22)" }}>
					{d.no}
				</span>
				<span style={{ fontSize: 15, fontWeight: 600, opacity: 0.88 }}>{familyName(d.family)}</span>
				<span style={{ flex: 1 }} />
				<Live />
			</span>
			<span
				style={{
					display: "block",
					marginTop: 20,
					fontSize: 32,
					lineHeight: "36px",
					fontWeight: 600,
					letterSpacing: "-0.025em",
				}}
			>
				{d.to}
			</span>
			<span style={{ display: "block", marginTop: 4, fontSize: 16, opacity: 0.78 }}>
				via Canal Street · {d.platform}
			</span>
			<span
				style={{
					position: "absolute",
					left: 22,
					right: 22,
					bottom: 20,
					display: "flex",
					alignItems: "flex-end",
					justifyContent: "space-between",
				}}
			>
				<span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
					<span style={{ fontSize: 92, lineHeight: "80px", fontWeight: 600, letterSpacing: "-0.05em" }}>
						{d.min}
					</span>
					<span style={{ fontSize: 24, fontWeight: 500 }}>min</span>
				</span>
				<span
					style={{
						display: "grid",
						width: 60,
						height: 60,
						placeItems: "center",
						borderRadius: 999,
						background: "#fff",
						color: colour,
					}}
				>
					<Arrow />
				</span>
			</span>
		</button>
	);
}

function Live() {
	return (
		<span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600 }}>
			<span style={{ position: "relative", width: 8, height: 8 }}>
				<span
					className="hw-ping"
					style={{ position: "absolute", inset: 0, borderRadius: 999, background: "currentColor" }}
				/>
				<span style={{ position: "absolute", inset: 0, borderRadius: 999, background: "currentColor" }} />
			</span>
			Live
		</span>
	);
}

function TabBar({ onGo }: { onGo: Go }) {
	const tabs = [
		{ label: "Departures", icon: <ClockIcon />, go: () => {} },
		{ label: "Trips", icon: <RouteIcon />, go: () => onGo("trip") },
		{ label: "Tickets", icon: <TicketIcon />, go: () => onGo("ticket") },
	];
	return (
		<nav
			style={{
				position: "absolute",
				insetInline: 0,
				bottom: 0,
				display: "flex",
				height: 86,
				paddingTop: 10,
				background: "var(--hw-panel)",
				borderTop: "1px solid var(--hw-faint)",
			}}
		>
			{tabs.map((t, i) => (
				<button
					key={t.label}
					type="button"
					onClick={t.go}
					style={{
						flex: 1,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 4,
						fontSize: 11,
						fontWeight: 600,
						color: i === 0 ? "var(--hw-ink)" : "var(--hw-dim)",
					}}
				>
					{t.icon}
					{t.label}
				</button>
			))}
		</nav>
	);
}

function Trip({ onGo }: { onGo: Go }) {
	const d = useDeparture();
	const route = routes[d.family];
	const colour = familyColour(d.family);
	const last = route.stops[route.stops.length - 1]!;
	return (
		<>
			<div style={{ display: "flex", height: 52, alignItems: "center", padding: "0 16px" }}>
				<button type="button" className="hw-round" onClick={() => ui.back()} aria-label="Back">
					<Back />
				</button>
			</div>

			<header className="hw-rise" style={{ padding: "10px 24px 0" }}>
				<p style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, fontWeight: 600 }}>
					<span className="hw-chip" style={{ background: colour }}>
						{d.no}
					</span>
					{d.to}
					<span style={{ fontWeight: 500, color: "var(--hw-dim)" }}>in {d.min} min</span>
				</p>
				<h1 style={{ marginTop: 18, fontSize: 38, lineHeight: "42px", fontWeight: 600, letterSpacing: "-0.03em" }}>
					To {route.to}
				</h1>
				<p style={{ marginTop: 6, fontSize: 17, color: "var(--hw-dim)" }}>
					Arrive {addMinutes(d.at, last.after)} · {last.after} min · {d.platform}
				</p>
			</header>

			<ol
				className="hw-rise"
				style={{
					position: "relative",
					margin: "24px 16px 0",
					padding: "18px 20px",
					borderRadius: 28,
					background: "var(--hw-panel)",
					animationDelay: "80ms",
				}}
			>
				<span
					className="hw-draw"
					style={{
						position: "absolute",
						left: 33,
						top: 44,
						bottom: 44,
						width: 6,
						borderRadius: 3,
						background: colour,
					}}
				/>
				{route.stops.map((s, i) => {
					const end = i === 0 || i === route.stops.length - 1;
					return (
						<li
							key={s.name}
							style={{ position: "relative", display: "flex", height: 52, alignItems: "center", gap: 18 }}
						>
							<span
								style={{ position: "relative", display: "grid", width: 26, height: 26, placeItems: "center" }}
							>
								{i === 0 && (
									<span
										className="hw-ping"
										style={{ position: "absolute", inset: 3, borderRadius: 999, background: colour }}
									/>
								)}
								<span
									className="hw-pop"
									style={{
										position: "relative",
										width: end ? 22 : 12,
										height: end ? 22 : 12,
										borderRadius: 999,
										background: end ? colour : "#fff",
										border: end ? "5px solid #fff" : `3px solid ${colour}`,
										boxSizing: "border-box",
										outline: end ? `3px solid ${colour}` : undefined,
										animationDelay: `${200 + i * 110}ms`,
									}}
								/>
							</span>
							<span style={{ flex: 1, minWidth: 0 }}>
								<span style={{ display: "block", fontSize: end ? 17 : 16, fontWeight: end ? 600 : 500 }}>
									{s.name}
								</span>
								{s.change && (
									<span
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											marginTop: 2,
											fontSize: 13,
											color: "var(--hw-dim)",
										}}
									>
										Change for
										{s.change.map((c) => (
											<span key={c.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
												<span
													style={{
														width: 8,
														height: 8,
														borderRadius: 999,
														background: c.colour === "green" ? k.line.green : c.colour,
													}}
												/>
												{c.label}
											</span>
										))}
									</span>
								)}
							</span>
							<span
								style={{
									fontSize: 15,
									fontWeight: end ? 600 : 500,
									color: end ? "var(--hw-ink)" : "var(--hw-dim)",
								}}
							>
								{addMinutes(d.at, s.after)}
							</span>
						</li>
					);
				})}
			</ol>

			<div style={{ position: "absolute", insetInline: 16, bottom: 34 }}>
				<button type="button" className="hw-primary" onClick={() => onGo("ticket")}>
					Buy ticket
					<span style={{ opacity: 0.55 }}>$2.90</span>
				</button>
			</div>
		</>
	);
}

function useCountdown(from: number) {
	const [left, setLeft] = useState(from);
	useEffect(() => {
		const start = Date.now();
		const id = setInterval(() => setLeft(Math.max(0, from - Math.floor((Date.now() - start) / 1000))), 250);
		return () => clearInterval(id);
	}, [from]);
	return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

function Ticket({ onGo }: { onGo: Go }) {
	const d = useDeparture();
	const route = routes[d.family];
	const left = useCountdown(75 * 60);
	const today = k.ticket.today;
	return (
		<>
			<div
				style={{
					display: "flex",
					height: 52,
					alignItems: "center",
					justifyContent: "space-between",
					padding: "0 16px",
				}}
			>
				<button type="button" className="hw-round" onClick={() => ui.back()} aria-label="Back">
					<Back />
				</button>
				<span style={{ fontSize: 17, fontWeight: 600 }}>Ticket</span>
				<button
					type="button"
					onClick={() => onGo("departures")}
					style={{ width: 40, fontSize: 17, fontWeight: 600, textAlign: "right" }}
				>
					Done
				</button>
			</div>

			<section
				className="hw-card hw-live"
				style={{
					position: "relative",
					height: 508,
					margin: "14px 16px 0",
					padding: 24,
					borderRadius: corners(k.card.radius),
					overflow: "hidden",
					color: "#141414",
					backgroundImage: `linear-gradient(110deg, ${today} 0%, color-mix(in oklab, ${today}, #fff 26%) 25%, ${today} 50%, color-mix(in oklab, ${today}, #fff 26%) 75%, ${today} 100%)`,
				}}
			>
				<span
					className="hw-sweep"
					style={{
						position: "absolute",
						top: -40,
						bottom: -40,
						left: 0,
						width: 90,
						background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.32), transparent)",
					}}
				/>
				<div
					style={{
						position: "relative",
						display: "flex",
						alignItems: "flex-start",
						justifyContent: "space-between",
					}}
				>
					<span>
						<span style={{ display: "block", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>
							Single ticket
						</span>
						<span style={{ display: "block", marginTop: 2, fontSize: 16, opacity: 0.62 }}>Adult · Zone A</span>
					</span>
					<Live />
				</div>

				<div style={{ position: "absolute", left: 24, right: 24, top: 150 }}>
					<p style={{ fontSize: 112, lineHeight: "100px", fontWeight: 600, letterSpacing: "-0.055em" }}>{left}</p>
					<p style={{ marginTop: 10, fontSize: 18, opacity: 0.62 }}>left on this ticket</p>
				</div>

				<dl
					style={{
						position: "absolute",
						left: 24,
						right: 24,
						bottom: 22,
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						rowGap: 4,
						paddingTop: 18,
						borderTop: "1px solid rgba(20,20,20,0.16)",
					}}
				>
					<dt style={{ fontSize: 13, opacity: 0.6 }}>Valid until</dt>
					<dt style={{ fontSize: 13, opacity: 0.6 }}>Today's color</dt>
					<dd style={{ fontSize: 22, fontWeight: 600 }}>9:27</dd>
					<dd style={{ fontSize: 22, fontWeight: 600 }}>{k.ticket.name}</dd>
				</dl>
			</section>

			<div
				className="hw-rise"
				style={{
					margin: "16px 16px 0",
					padding: "4px 20px",
					borderRadius: 24,
					background: "var(--hw-panel)",
					animationDelay: "240ms",
				}}
			>
				<Line>
					<span className="hw-chip" style={{ background: familyColour(d.family) }}>
						{d.no}
					</span>
					<span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Union Square to {route.to}</span>
					<span style={{ fontSize: 15, color: "var(--hw-dim)" }}>{d.at}</span>
				</Line>
				<Line last>
					<span style={{ flex: 1, fontSize: 16, color: "var(--hw-dim)" }}>Paid with Visa ·· 4421</span>
					<span style={{ fontSize: 16, fontWeight: 600 }}>$2.90</span>
				</Line>
			</div>
		</>
	);
}

function Line({ children, last }: { children: ReactNode; last?: boolean }) {
	return (
		<div
			style={{
				display: "flex",
				height: 56,
				alignItems: "center",
				gap: 12,
				borderBottom: last ? undefined : "1px solid var(--hw-faint)",
			}}
		>
			{children}
		</div>
	);
}

function StatusBar() {
	return (
		<div className="hw-bar">
			<span>8:10</span>
			<span style={{ display: "flex", alignItems: "center", gap: 6 }}>
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

const stroke = {
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round",
} as const;

function Arrow() {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
			<path {...stroke} strokeWidth={2.4} d="M5 12h14M13 6l6 6-6 6" />
		</svg>
	);
}
function Back() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
			<path {...stroke} d="M14.5 5.5 8 12l6.5 6.5" />
		</svg>
	);
}
function ClockIcon() {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
			<circle {...stroke} cx="12" cy="12" r="8.5" />
			<path {...stroke} d="M12 7.5V12l3 2" />
		</svg>
	);
}
function RouteIcon() {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
			<circle {...stroke} cx="6" cy="6" r="2.5" />
			<circle {...stroke} cx="18" cy="18" r="2.5" />
			<path {...stroke} d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5" />
		</svg>
	);
}
function TicketIcon() {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
			<path
				{...stroke}
				d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4Z"
			/>
			<path {...stroke} d="M14 6v12" strokeDasharray="2 2.5" />
		</svg>
	);
}
