import { type CSSProperties, useEffect, useRef, useState } from "react";
import { ui } from "spool";
import { corners, k } from "./knobs";
import "./evenly.css";

/* Evenly: splitting a restaurant bill. The receipt is black and white; a colour is a person,
   so an item turns a colour the moment someone claims it, and on the last screen
   a person's colour only comes back once their money has. */

type PersonId = "you" | "leo" | "nina" | "ruby";
const people: { id: PersonId; name: string; short: string }[] = [
	{ id: "you", name: "You", short: "You" },
	{ id: "leo", name: "Leo", short: "L" },
	{ id: "nina", name: "Nina", short: "N" },
	{ id: "ruby", name: "Ruby", short: "R" },
];
const colourOf = (id: PersonId) => k.people[id];

type Item = { id: string; name: string; qty?: string; price: number };
const items: Item[] = [
	{ id: "burger", name: "Cheeseburger", price: 19.5 },
	{ id: "steak", name: "Steak frites", price: 24.5 },
	{ id: "bass", name: "Grilled sea bass", price: 22.5 },
	{ id: "rib", name: "Short rib", price: 28.5 },
	{ id: "lager", name: "Lager", qty: "×4", price: 32.8 },
	{ id: "mac", name: "Mac and cheese", price: 13.5 },
	{ id: "cake", name: "Chocolate cake", price: 11.5 },
	{ id: "coffee", name: "Coffee", qty: "×2", price: 9 },
];
const total = items.reduce((s, i) => s + i.price, 0);

type Owners = Record<string, PersonId[]>;
const seed: Owners = {
	burger: ["leo"],
	steak: ["you"],
	bass: ["nina"],
	rib: ["ruby"],
	lager: ["you", "leo", "nina", "ruby"],
	mac: [],
	cake: [],
	coffee: [],
};

function useOwners() {
	ui.use();
	return (ui.state.evOwners as Owners | undefined) ?? seed;
}

/** What each person owes: what they claimed, plus an even part of what nobody did. */
function shares(owners: Owners) {
	const claimed: Record<PersonId, number> = { you: 0, leo: 0, nina: 0, ruby: 0 };
	let unclaimed = 0;
	for (const it of items) {
		const o = owners[it.id] ?? [];
		if (o.length === 0) unclaimed += it.price;
		for (const p of o) claimed[p] += it.price / o.length;
	}
	const owe = Object.fromEntries(
		people.map((p) => [p.id, Math.round((claimed[p.id] + unclaimed / people.length) * 100) / 100]),
	) as Record<PersonId, number>;
	return { claimed, unclaimed, owe };
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Evenly({ screen, onNext }: { screen: "receipt" | "shares" | "sent"; onNext: () => void }) {
	return (
		<div className="ev">
			<StatusBar />
			{screen === "receipt" && <Receipt onNext={onNext} />}
			{screen === "shares" && <Shares onNext={onNext} />}
			{screen === "sent" && <Sent onNext={onNext} />}
		</div>
	);
}

function Receipt({ onNext }: { onNext: () => void }) {
	const owners = useOwners();
	const [who, setWho] = useState<PersonId>("nina");
	const { claimed, unclaimed } = shares(owners);
	const left = items.filter((i) => (owners[i.id] ?? []).length === 0).length;

	const toggle = (id: string) => {
		const o = owners[id] ?? [];
		const next = o.includes(who) ? o.filter((p) => p !== who) : [...o, who];
		ui.state.evOwners = { ...owners, [id]: people.map((p) => p.id).filter((p) => next.includes(p)) };
	};

	return (
		<>
			<header className="ev-rise" style={{ padding: "10px 24px 0" }}>
				<p style={{ fontSize: 16, color: "var(--ev-dim)" }}>
					<span style={{ fontWeight: 600, color: "var(--ev-ink)" }}>Marlow</span> · Fri, Nov 7 · 4 people
				</p>
				<p style={{ marginTop: 4, fontSize: 60, lineHeight: "64px", fontWeight: 600, letterSpacing: "-0.045em" }}>
					{usd(total)}
				</p>
			</header>

			<Split
				height={10}
				gap={3}
				radius={5}
				parts={[
					...people.map((p) => ({ key: p.id, value: claimed[p.id], colour: colourOf(p.id) })),
					{ key: "left", value: unclaimed, colour: "var(--ev-faint)" },
				]}
				style={{ margin: "18px 24px 0" }}
			/>

			<p
				className="ev-rise"
				style={{ margin: "22px 24px 0", fontSize: 15, color: "var(--ev-dim)", animationDelay: "80ms" }}
			>
				Pick a person, then tap what they had.
			</p>
			<div className="ev-rise" style={{ display: "flex", gap: 10, padding: "14px 20px 0", animationDelay: "120ms" }}>
				{people.map((p) => {
					const on = p.id === who;
					return (
						<button
							key={p.id}
							type="button"
							onClick={() => setWho(p.id)}
							style={{ display: "flex", width: 64, flexDirection: "column", alignItems: "center", gap: 7 }}
						>
							<span
								className="ev-person"
								style={{
									display: "grid",
									width: 52,
									height: 52,
									placeItems: "center",
									borderRadius: 999,
									background: colourOf(p.id),
									color: "#0f0f11",
									fontSize: p.short.length > 1 ? 14 : 19,
									fontWeight: 600,
									transform: on ? "scale(1)" : "scale(0.86)",
									boxShadow: on
										? `0 0 0 3px var(--ev-bg), 0 0 0 5px ${colourOf(p.id)}`
										: "0 0 0 0 transparent",
								}}
							>
								{p.short}
							</span>
							<span
								style={{
									fontSize: 13,
									fontWeight: on ? 600 : 500,
									color: on ? "var(--ev-ink)" : "var(--ev-dim)",
								}}
							>
								{p.name}
							</span>
						</button>
					);
				})}
			</div>

			<ul style={{ margin: "14px 24px 0" }}>
				{items.map((it, i) => {
					const o = owners[it.id] ?? [];
					return (
						<li key={it.id} className="ev-rise" style={{ animationDelay: `${160 + i * 35}ms` }}>
							<button
								type="button"
								className="ev-press"
								onClick={() => toggle(it.id)}
								style={{
									display: "flex",
									width: "100%",
									height: 46,
									alignItems: "center",
									gap: 14,
									borderBottom: "1px solid var(--ev-faint)",
									textAlign: "left",
								}}
							>
								<Marks owners={o} />
								<span
									style={{
										flex: 1,
										fontSize: 16,
										fontWeight: 500,
										color: o.length ? "var(--ev-ink)" : "var(--ev-dim)",
										transition: "color 300ms ease",
									}}
								>
									{it.name}
									{it.qty && <span style={{ color: "var(--ev-dim)" }}> {it.qty}</span>}
								</span>
								<span
									style={{
										fontSize: 16,
										fontWeight: 500,
										color: o.length ? "var(--ev-ink)" : "var(--ev-dim)",
									}}
								>
									{usd(it.price)}
								</span>
							</button>
						</li>
					);
				})}
			</ul>

			<div
				style={{
					position: "absolute",
					insetInline: 0,
					bottom: 0,
					padding: "34px 16px 34px",
					background: "linear-gradient(transparent, var(--ev-bg) 30%)",
				}}
			>
				<p style={{ marginBottom: 12, textAlign: "center", fontSize: 13, color: "var(--ev-dim)" }}>
					{left === 0
						? "Everything is claimed."
						: `${left} unclaimed ${left === 1 ? "item is" : "items are"} split evenly.`}
				</p>
				<button type="button" className="ev-primary" onClick={onNext}>
					Review split
				</button>
			</div>
		</>
	);
}

function Marks({ owners }: { owners: PersonId[] }) {
	if (owners.length === 0) {
		return (
			<span style={{ width: 48, display: "flex" }}>
				<span
					style={{ width: 16, height: 16, borderRadius: 999, border: "1.5px dashed var(--ev-dim)", opacity: 0.6 }}
				/>
			</span>
		);
	}
	return (
		<span style={{ width: 48, display: "flex" }}>
			{owners.map((p, i) => (
				<span
					key={p}
					className="ev-pop"
					style={{
						width: 16,
						height: 16,
						marginLeft: i === 0 ? 0 : -6,
						borderRadius: 999,
						background: colourOf(p),
						boxShadow: "0 0 0 2px var(--ev-bg)",
					}}
				/>
			))}
		</span>
	);
}

function Split({
	parts,
	height,
	gap,
	radius,
	style,
}: {
	parts: { key: string; value: number; colour: string }[];
	height: number;
	gap: number;
	radius: number;
	style?: CSSProperties;
}) {
	return (
		<div style={{ display: "flex", height, gap, viewTransitionName: "evenly-split", ...style }}>
			{parts.map((p) => (
				<span
					key={p.key}
					className="ev-seg"
					style={{
						flexGrow: p.value,
						flexBasis: 0,
						minWidth: p.value > 0 ? height / 2 : 0,
						borderRadius: radius,
						backgroundColor: p.colour,
						display: p.value > 0 ? "block" : "none",
					}}
				/>
			))}
		</div>
	);
}

const owers: PersonId[] = ["leo", "nina", "ruby"];

function summary(id: PersonId, owners: Owners, unclaimed: number) {
	const mine = items.filter((i) => (owners[i.id] ?? []).includes(id)).map((i) => i.name);
	const left = unclaimed > 0 ? items.filter((i) => (owners[i.id] ?? []).length === 0).length : 0;
	const more = mine.length - 1 + left;
	if (mine.length === 0) return left ? `A part of ${left} shared items` : "Nothing claimed";
	return more > 0 ? `${mine[0]} and ${more} more` : mine[0]!;
}

function Shares({ onNext }: { onNext: () => void }) {
	const owners = useOwners();
	const { owe, unclaimed } = shares(owners);
	const back = owers.reduce((s, p) => s + owe[p], 0);
	return (
		<>
			<TopRow />
			<header className="ev-rise" style={{ padding: "8px 24px 0" }}>
				<p style={{ fontSize: 16, color: "var(--ev-dim)" }}>
					<span style={{ fontWeight: 600, color: "var(--ev-ink)" }}>Marlow</span> · {usd(total)}
				</p>
				<p style={{ marginTop: 4, fontSize: 60, lineHeight: "64px", fontWeight: 600, letterSpacing: "-0.045em" }}>
					{usd(back)}
				</p>
				<p style={{ marginTop: 2, fontSize: 17, color: "var(--ev-dim)" }}>comes back to you</p>
			</header>

			<Split
				height={64}
				gap={4}
				radius={16}
				parts={[...owers, "you" as const].map((p) => ({ key: p, value: owe[p], colour: colourOf(p) }))}
				style={{ margin: "24px 16px 0" }}
			/>

			<ul style={{ display: "grid", gap: 10, margin: "22px 16px 0" }}>
				{owers.map((p, i) => (
					<li key={p} className="ev-rise" style={{ animationDelay: `${120 + i * 70}ms` }}>
						<PersonCard
							name={people.find((x) => x.id === p)!.name}
							detail={summary(p, owners, unclaimed)}
							amount={usd(owe[p])}
							colour={colourOf(p)}
						/>
					</li>
				))}
			</ul>
			<p
				className="ev-rise"
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					margin: "16px 24px 0",
					fontSize: 15,
					color: "var(--ev-dim)",
					animationDelay: "340ms",
				}}
			>
				<span style={{ width: 10, height: 10, borderRadius: 999, background: colourOf("you") }} />
				<span style={{ flex: 1 }}>Your part</span>
				<span>{usd(owe.you)}</span>
			</p>

			<div style={{ position: "absolute", insetInline: 16, bottom: 34 }}>
				<button type="button" className="ev-primary" onClick={onNext}>
					Send 3 requests
				</button>
			</div>
		</>
	);
}

/** The card worth tuning: one person's share, in their colour. */
export function PersonCard({
	name,
	detail,
	amount,
	colour,
}: {
	name: string;
	detail: string;
	amount: string;
	colour: string;
}) {
	return (
		<div
			style={{
				display: "flex",
				height: 96,
				alignItems: "center",
				gap: 16,
				padding: "0 22px",
				borderRadius: corners(k.card.radius),
				background: colour,
				color: "#0f0f11",
			}}
		>
			<span style={{ flex: 1, minWidth: 0 }}>
				<span style={{ display: "block", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>{name}</span>
				<span
					style={{
						display: "block",
						marginTop: 2,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						fontSize: 14,
						opacity: 0.62,
					}}
				>
					{detail}
				</span>
			</span>
			<span style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>{amount}</span>
		</div>
	);
}

function useTween(target: number, ms = 800) {
	const [v, setV] = useState(target);
	const from = useRef(target);
	useEffect(() => {
		const a = from.current;
		const start = performance.now();
		let raf = 0;
		const step = (t: number) => {
			const p = Math.min(1, (t - start) / ms);
			const e = 1 - (1 - p) ** 3;
			setV(a + (target - a) * e);
			if (p < 1) raf = requestAnimationFrame(step);
			else from.current = target;
		};
		raf = requestAnimationFrame(step);
		return () => {
			cancelAnimationFrame(raf);
			from.current = target;
		};
	}, [target, ms]);
	return v;
}

type Status = "paid" | "waiting" | "reminded";

function Sent({ onNext }: { onNext: () => void }) {
	const owners = useOwners();
	const { owe } = shares(owners);
	const [status, setStatus] = useState<Record<PersonId, Status>>({
		you: "paid",
		leo: "waiting",
		nina: "paid",
		ruby: "waiting",
	});
	const [fresh, setFresh] = useState<PersonId[]>([]);

	const pay = (p: PersonId) => {
		setStatus((s) => ({ ...s, [p]: "paid" }));
		setFresh((f) => [...f, p]);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: Leo pays once, on arrival
	useEffect(() => {
		const t = setTimeout(() => pay("leo"), 1900);
		return () => clearTimeout(t);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Ruby pays once she is reminded
	useEffect(() => {
		if (status.ruby !== "reminded") return;
		const t = setTimeout(() => pay("ruby"), 1600);
		return () => clearTimeout(t);
	}, [status.ruby]);

	const all = owers.reduce((s, p) => s + owe[p], 0);
	const got = owers.reduce((s, p) => s + (status[p] === "paid" ? owe[p] : 0), 0);
	const shown = useTween(got);
	const settled = got === all;

	const note: Record<PersonId, string> = {
		you: "",
		nina: "Paid with Apple Pay · 9:13 PM",
		leo: fresh.includes("leo") ? "Paid just now" : "Waiting",
		ruby: status.ruby === "paid" ? "Paid just now" : status.ruby === "reminded" ? "Reminded just now" : "Waiting",
	};

	return (
		<>
			<TopRow />
			<header className="ev-rise" style={{ padding: "8px 24px 0" }}>
				<p
					style={{
						fontSize: 16,
						color: settled ? "var(--ev-ink)" : "var(--ev-dim)",
						fontWeight: settled ? 600 : 400,
					}}
				>
					{settled ? "All settled" : "Requests sent"}
				</p>
				<p style={{ marginTop: 4, fontSize: 60, lineHeight: "64px", fontWeight: 600, letterSpacing: "-0.045em" }}>
					{usd(shown)}
				</p>
				<p style={{ marginTop: 2, fontSize: 17, color: "var(--ev-dim)" }}>back of {usd(all)}</p>
			</header>

			<div style={{ display: "flex", height: 18, gap: 4, margin: "24px 24px 0" }}>
				{owers.map((p) => (
					<span
						key={p}
						className="ev-paid"
						style={{
							flexGrow: owe[p],
							flexBasis: 0,
							borderRadius: 9,
							backgroundColor: status[p] === "paid" ? colourOf(p) : "var(--ev-faint)",
						}}
					/>
				))}
			</div>

			<ul style={{ margin: "26px 24px 0" }}>
				{owers.map((p, i) => {
					const person = people.find((x) => x.id === p)!;
					const paid = status[p] === "paid";
					return (
						<li
							key={p}
							className="ev-rise"
							style={{
								display: "flex",
								height: 80,
								alignItems: "center",
								gap: 16,
								borderBottom: "1px solid var(--ev-faint)",
								animationDelay: `${100 + i * 70}ms`,
							}}
						>
							<span style={{ position: "relative", width: 52, height: 52 }}>
								{fresh.includes(p) && (
									<span
										className="ev-burst"
										style={{ position: "absolute", inset: 0, borderRadius: 999, background: colourOf(p) }}
									/>
								)}
								<span
									className="ev-paid"
									style={{
										position: "relative",
										display: "grid",
										width: 52,
										height: 52,
										placeItems: "center",
										borderRadius: 999,
										fontSize: 19,
										fontWeight: 600,
										backgroundColor: paid ? colourOf(p) : "transparent",
										color: paid ? "#0f0f11" : "var(--ev-dim)",
										boxShadow: paid ? `inset 0 0 0 0 transparent` : "inset 0 0 0 1.5px var(--ev-faint)",
									}}
								>
									{paid ? <Check /> : person.short}
								</span>
							</span>
							<span style={{ flex: 1 }}>
								<span style={{ display: "block", fontSize: 18, fontWeight: 600 }}>{person.name}</span>
								<span style={{ display: "block", marginTop: 2, fontSize: 14, color: "var(--ev-dim)" }}>
									{note[p]}
								</span>
							</span>
							{status[p] === "waiting" && p === "ruby" ? (
								<button
									type="button"
									className="ev-press"
									onClick={() => setStatus((s) => ({ ...s, ruby: "reminded" }))}
									style={{
										height: 34,
										padding: "0 14px",
										borderRadius: 999,
										background: "var(--ev-faint)",
										fontSize: 14,
										fontWeight: 600,
									}}
								>
									Remind
								</button>
							) : null}
							<span
								style={{
									fontSize: 18,
									fontWeight: 600,
									color: paid ? "var(--ev-ink)" : "var(--ev-dim)",
									transition: "color 400ms ease",
								}}
							>
								{usd(owe[p])}
							</span>
						</li>
					);
				})}
			</ul>

			<div style={{ position: "absolute", insetInline: 16, bottom: 34 }}>
				<button type="button" className="ev-primary" onClick={onNext}>
					Done
				</button>
			</div>
		</>
	);
}

function TopRow() {
	return (
		<div style={{ display: "flex", height: 52, alignItems: "center", padding: "0 16px" }}>
			<button type="button" className="ev-round" onClick={() => ui.back()} aria-label="Back">
				<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24">
					<path
						fill="none"
						stroke="currentColor"
						strokeWidth={2}
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M14.5 5.5 8 12l6.5 6.5"
					/>
				</svg>
			</button>
		</div>
	);
}

function Check() {
	return (
		<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" className="ev-pop">
			<path
				fill="none"
				stroke="currentColor"
				strokeWidth={2.6}
				strokeLinecap="round"
				strokeLinejoin="round"
				d="m5.5 12.5 4.2 4.2 8.8-9.4"
			/>
		</svg>
	);
}

function StatusBar() {
	return (
		<div className="ev-bar">
			<span>9:14</span>
			<span style={{ display: "flex", alignItems: "center", gap: 6 }}>
				<svg aria-hidden="true" width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
					<rect x="0" y="8" width="3" height="4" rx="1" />
					<rect x="5" y="5.5" width="3" height="6.5" rx="1" />
					<rect x="10" y="3" width="3" height="9" rx="1" />
					<rect x="15" y="0" width="3" height="12" rx="1" />
				</svg>
				<svg aria-hidden="true" width="27" height="13" viewBox="0 0 27 13" fill="none">
					<rect x="0.5" y="0.5" width="23" height="12" rx="3.8" stroke="currentColor" opacity="0.4" />
					<rect x="2" y="2" width="15" height="9" rx="2.5" fill="currentColor" />
					<path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity="0.5" />
				</svg>
			</span>
		</div>
	);
}
