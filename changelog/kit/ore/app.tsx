import { AnimatePresence, motion } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { PayCard } from "./card";
import "./ore.css";

/** Ore, a bank in your phone. Ordering its steel card: pick, limits, on its way. */

export type Look = { radius: number | number[]; accent: string };
export type Order = { finish: string; limit: number; online: boolean; abroad: boolean; cash: boolean; home: boolean };

export const finishes = [
	{ id: "clay", name: "Clay", note: "Brushed, warm as a flowerpot", hex: "" },
	{ id: "moss", name: "Moss", note: "Brushed, spruce green", hex: "#3d5a44" },
	{ id: "cobalt", name: "Cobalt", note: "Brushed, deep blue", hex: "#3150c4" },
	{ id: "ink", name: "Ink", note: "Matte, nearly black", hex: "#1c1d21" },
	{ id: "chalk", name: "Chalk", note: "Matte, off-white", hex: "#e3ddd0" },
];
/** Clay is the house colour, so it takes the accent knob. */
export const colourOf = (id: string, look: Look) => {
	const f = finishes.find((x) => x.id === id) ?? finishes[0]!;
	return { ...f, hex: f.hex || look.accent };
};
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const spring = { type: "spring", duration: 0.5, bounce: 0.15 } as const;

function Screen({ children }: { children: ReactNode }) {
	return (
		<div className="ore relative h-full overflow-hidden select-none">
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap"
				precedence="default"
			/>
			{children}
		</div>
	);
}

function StatusBar() {
	return (
		<div className="relative flex h-[54px] items-center justify-between px-8 pt-1 text-[16px] font-bold">
			<span>09:41</span>
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

function Press({
	children,
	onClick,
	className,
	style,
	disabled,
}: {
	children: ReactNode;
	onClick?: () => void;
	className?: string;
	style?: CSSProperties;
	disabled?: boolean;
}) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			disabled={disabled}
			whileTap={disabled ? undefined : { scale: 0.97 }}
			transition={spring}
			className={className}
			style={style}
		>
			{children}
		</motion.button>
	);
}

function Back({ onClick }: { onClick: () => void }) {
	return (
		<Press onClick={onClick} className="grid size-10 place-items-center rounded-full bg-[var(--m-well)]">
			<svg
				aria-hidden="true"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M14.5 5.5 8 12l6.5 6.5" />
			</svg>
		</Press>
	);
}

/** One word that changes in place, the old one lifting out. */
function Swap({ value, className }: { value: string; className?: string }) {
	return (
		<span className={className}>
			<span className="relative inline-grid overflow-hidden align-bottom">
				<AnimatePresence initial={false} mode="popLayout">
					<motion.span
						key={value}
						initial={{ y: "60%", opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: "-60%", opacity: 0 }}
						transition={spring}
						className="block"
					>
						{value}
					</motion.span>
				</AnimatePresence>
			</span>
		</span>
	);
}

/* ---------- Pick ---------- */

export function Pick({
	look,
	order,
	onFinish,
	onNext,
}: {
	look: Look;
	order: Order;
	onFinish: (id: string) => void;
	onNext: () => void;
}) {
	const f = colourOf(order.finish, look);
	return (
		<Screen>
			<StatusBar />
			<header className="flex h-12 items-center justify-between px-6">
				<span className="text-[24px] leading-none font-bold tracking-[-0.04em]">ore</span>
				<span className="grid size-9 place-items-center rounded-full bg-[var(--m-well)] text-[13px] font-bold">
					EB
				</span>
			</header>
			<div className="ore-rise px-6 pt-6">
				<h1 className="text-[44px] leading-[1.02] font-bold tracking-[-0.035em]">Pick your card</h1>
				<p className="mt-3 max-w-[300px] text-[16px] leading-[1.45] text-[var(--m-dim)]">
					Recycled steel, 18 grams. Free to order, and it works in your phone today.
				</p>
			</div>

			<div className="mt-9 flex justify-center">
				<PayCard colour={f.hex} radius={look.radius} swingKey={f.id} style={{ viewTransitionName: "ore-card" }} />
			</div>

			<div className="mt-3 text-center">
				<Swap value={f.name} className="text-[26px] leading-[1.2] font-bold tracking-[-0.02em]" />
				<p className="text-[15px] text-[var(--m-dim)]">
					<Swap value={f.note} />
				</p>
			</div>

			<ul className="mt-6 flex justify-center gap-3.5">
				{finishes.map((x) => {
					const hex = x.hex || look.accent;
					const on = x.id === f.id;
					return (
						<li key={x.id}>
							<button
								type="button"
								aria-label={x.name}
								onClick={() => onFinish(x.id)}
								className="relative grid size-11 place-items-center"
							>
								{on && (
									<motion.span
										layoutId="ore-ring"
										transition={spring}
										className="absolute inset-0 rounded-full border-2 border-[var(--m-ink)]"
									/>
								)}
								<motion.span
									whileTap={{ scale: 0.88 }}
									className="size-[34px] rounded-full border border-[var(--m-line)]"
									style={{ background: hex }}
								/>
							</button>
						</li>
					);
				})}
			</ul>

			<div className="absolute inset-x-6 bottom-[34px]">
				<Press
					onClick={onNext}
					className="flex h-14 w-full items-center justify-center gap-1.5 rounded-full bg-[var(--m-ink)] text-[17px] font-bold text-[var(--m-bg)]"
				>
					Continue with <Swap value={f.name} />
				</Press>
			</div>
		</Screen>
	);
}

/* ---------- Limits ---------- */

const MAX = 3000;

function Slider({ value, onChange }: { value: number; onChange: (n: number) => void }) {
	const track = useRef<HTMLDivElement>(null);
	const set = (clientX: number) => {
		const r = track.current!.getBoundingClientRect();
		const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
		onChange(Math.round((t * MAX) / 50) * 50);
	};
	const at = (value / MAX) * 100;
	return (
		<div
			ref={track}
			className="relative h-11 cursor-pointer touch-none"
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId);
				set(e.clientX);
			}}
			onPointerMove={(e) => {
				if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e.clientX);
			}}
		>
			<span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--m-line)]" />
			<motion.span
				className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-[var(--m-ink)]"
				animate={{ width: `${at}%` }}
				transition={{ type: "spring", duration: 0.3, bounce: 0 }}
			/>
			<motion.span
				className="absolute top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[6px] border-[var(--m-ink)] bg-[var(--m-bg)]"
				animate={{ left: `${at}%` }}
				transition={{ type: "spring", duration: 0.3, bounce: 0 }}
				whileTap={{ scale: 1.15 }}
			/>
		</div>
	);
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={on}
			aria-label={label}
			onClick={() => onChange(!on)}
			className="relative h-[31px] w-[51px] rounded-full transition-colors duration-300"
			style={{ background: on ? "var(--m-ink)" : "rgba(21,21,21,0.14)" }}
		>
			<motion.span
				animate={{ x: on ? 20 : 0 }}
				transition={spring}
				className="absolute top-[2px] left-[2px] size-[27px] rounded-full bg-[#fff]"
			/>
		</button>
	);
}

const addresses = { home: "64 Bedford Ave, Brooklyn, NY 11249", work: "12 Mercer St, New York, NY 10013" };

export function Limits({
	look,
	order,
	onChange,
	onBack,
	onOrder,
}: {
	look: Look;
	order: Order;
	onChange: (patch: Partial<Order>) => void;
	onBack: () => void;
	onOrder: () => void;
}) {
	const f = colourOf(order.finish, look);
	const [ordering, setOrdering] = useState(false);
	useEffect(() => {
		if (!ordering) return;
		const id = setTimeout(onOrder, 1150);
		return () => clearTimeout(id);
	}, [ordering, onOrder]);
	const rows: { key: "online" | "abroad" | "cash"; label: string; note: string }[] = [
		{ key: "online", label: "Online payments", note: "Shops, apps and subscriptions" },
		{ key: "abroad", label: "Payments abroad", note: "Outside the US, no fee" },
		{ key: "cash", label: "Cash withdrawals", note: "Up to $200 a week" },
	];
	return (
		<Screen>
			<StatusBar />
			<div className="absolute top-[58px] left-4 z-10">
				<Back onClick={onBack} />
			</div>
			<div className="mt-2 flex justify-center">
				<PayCard colour={f.hex} radius={look.radius} width={176} still style={{ viewTransitionName: "ore-card" }} />
			</div>

			<div className="ore-rise px-6 pt-2">
				<p className="text-[56px] leading-none font-bold tracking-[-0.04em]">{usd(order.limit)}</p>
				<p className="mt-2 text-[16px] text-[var(--m-dim)]">a month, the most this card can spend.</p>
				<div className="mt-3">
					<Slider value={order.limit} onChange={(limit) => onChange({ limit })} />
					<div className="flex justify-between text-[13px] font-semibold text-[var(--m-dim)]">
						<span>$0</span>
						<span>$1,500</span>
						<span>$3,000</span>
					</div>
				</div>
			</div>

			<ul className="ore-rise mx-6 mt-4 border-t border-[var(--m-line)] [animation-delay:100ms]">
				{rows.map((r) => (
					<li key={r.key} className="flex items-center justify-between border-b border-[var(--m-line)] py-2.5">
						<span>
							<span className="block text-[16px] font-semibold">{r.label}</span>
							<span className="block text-[14px] text-[var(--m-dim)]">{r.note}</span>
						</span>
						<Toggle label={r.label} on={order[r.key]} onChange={(v) => onChange({ [r.key]: v })} />
					</li>
				))}
				<li className="flex items-center justify-between py-2.5">
					<span>
						<span className="block text-[16px] font-semibold">Post it to</span>
						<span className="block text-[14px] text-[var(--m-dim)]">
							<Swap value={order.home ? addresses.home : addresses.work} />
						</span>
					</span>
					<button
						type="button"
						onClick={() => onChange({ home: !order.home })}
						className="text-[15px] font-bold underline decoration-[var(--m-line)] underline-offset-4"
					>
						Change
					</button>
				</li>
			</ul>

			<div className="absolute inset-x-6 bottom-[34px]">
				<Press
					onClick={() => setOrdering(true)}
					disabled={ordering}
					className="relative flex h-14 w-full items-center justify-center overflow-hidden rounded-full bg-[var(--m-ink)] text-[17px] font-bold text-[var(--m-bg)]"
				>
					{ordering && <span className="ore-sweep absolute inset-0" style={{ background: f.hex }} />}
					<span
						className="relative"
						style={ordering ? { color: f.id === "chalk" ? "var(--m-ink)" : "#fff" } : undefined}
					>
						{ordering ? "Ordering…" : `Order ${f.name} card · Free`}
					</span>
				</Press>
			</div>
		</Screen>
	);
}

/* ---------- On its way ---------- */

const stages = ["Ordered", "Pressed", "Posted", "Delivered"];

export function Shipped({ look, order, onDone }: { look: Look; order: Order; onDone: () => void }) {
	const f = colourOf(order.finish, look);
	const [added, setAdded] = useState(false);
	return (
		<Screen>
			<StatusBar />
			<div className="mt-12 flex justify-center">
				<PayCard colour={f.hex} radius={look.radius} width={330} style={{ viewTransitionName: "ore-card" }} />
			</div>
			<div className="ore-rise px-6 pt-8">
				<h1 className="text-[48px] leading-[1.02] font-bold tracking-[-0.035em]">On its way</h1>
				<p className="mt-3 text-[16px] leading-[1.45] text-[var(--m-dim)]">
					Your {f.name} card arrives Thursday, November 13 at {order.home ? "64 Bedford Ave" : "12 Mercer St"}.
				</p>
				<div className="mt-7">
					<div className="relative h-1.5 overflow-hidden rounded-full bg-[var(--m-line)]">
						<span
							className="ore-fill absolute inset-y-0 left-0 w-[38%] rounded-full"
							style={{ background: f.hex === "#e3ddd0" ? "var(--m-ink)" : f.hex }}
						/>
					</div>
					<ol className="mt-3 grid grid-cols-4 text-[13px] font-semibold">
						{stages.map((s, i) => (
							<li key={s} className={i < 2 ? "" : "text-[var(--m-dim)]"}>
								{s}
							</li>
						))}
					</ol>
				</div>
			</div>

			<div className="absolute inset-x-6 bottom-[34px]">
				<div className="mb-3 flex items-center justify-between rounded-[22px] bg-[var(--m-well)] py-3 pr-3 pl-5">
					<span>
						<span className="block text-[16px] font-semibold">Pay with your phone now</span>
						<span className="block text-[14px] text-[var(--m-dim)]">Same number, ends 4417</span>
					</span>
					<Press
						onClick={() => setAdded((v) => !v)}
						className="h-10 rounded-full px-4 text-[15px] font-bold"
						style={added ? { background: "transparent" } : { background: "var(--m-ink)", color: "var(--m-bg)" }}
					>
						<Swap value={added ? "Added ✓" : "Add"} />
					</Press>
				</div>
				<Press
					onClick={onDone}
					className="h-14 w-full rounded-full border border-[var(--m-line)] text-[17px] font-bold"
				>
					Done
				</Press>
			</div>
		</Screen>
	);
}
