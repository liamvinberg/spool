import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { ui } from "spool";
import "./kin.css";

/* Kin: paying a friend. The amount screen is one colour, edge to edge; the card is the piece to tune. */
const k = ui.knobs({
	card: {
		radius: { type: "corners", value: 26, min: 0, max: 48 },
		accent: { type: "color", value: "#3b3bf0", swatches: ["#3b3bf0", "#0f9d6b", "#ff5533", "#e8459a", "#141414"] },
	},
});

const ease = [0.23, 1, 0.32, 1] as const;
const BALANCE = 1284.5;

const people = [
	{ name: "Maya Collins", first: "Maya", tag: "$mayacollins", initials: "MC", note: "Ramen at Tajima" },
	{ name: "Leo Hart", first: "Leo", tag: "$leohart", initials: "LH", note: "Concert tickets" },
	{ name: "Sara Patel", first: "Sara", tag: "$sarapatel", initials: "SP", note: "Half the cabin" },
];

function useKin() {
	ui.use();
	ui.state.kinAmount ??= "42";
	ui.state.kinTo ??= 0;
	const amount = String(ui.state.kinAmount);
	const person = people[Number(ui.state.kinTo) % people.length] ?? people[0]!;
	return { amount, person, value: Number.parseFloat(amount) || 0 };
}

function money(amount: string) {
	const [whole = "0", cents] = amount.split(".");
	const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return `$${grouped}${cents !== undefined ? `.${cents}` : ""}`;
}

/* big amounts step down so seven characters still fit the width */
function fitSize(amount: string, max: number) {
	const n = money(amount).length;
	return n <= 4 ? max : n <= 5 ? max * 0.86 : max * 0.7;
}

function corners(r: number | number[]) {
	return typeof r === "number" ? r : r.map((v) => `${v}px`).join(" ");
}

function dollars(n: number) {
	return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* Each frame passes where its primary action walks, so the canvas draws one arrow per screen. */
export function Kin({ screen, onNext }: { screen: "amount" | "confirm" | "sent"; onNext: () => void }) {
	return (
		<>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&display=swap"
				precedence="default"
			/>
			{screen === "amount" && <AmountScreen onNext={onNext} />}
			{screen === "confirm" && <ConfirmScreen onNext={onNext} />}
			{screen === "sent" && <SentScreen onNext={onNext} />}
		</>
	);
}

/* ---------- amount ---------- */

function AmountScreen({ onNext }: { onNext: () => void }) {
	const { amount, person, value } = useKin();
	const shake = useAnimationControls();
	const [toast, setToast] = useState(false);

	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(false), 2200);
		return () => clearTimeout(t);
	}, [toast]);

	const press = (key: string) => {
		let next = amount;
		const [whole = "0", cents] = amount.split(".");
		if (key === "back") next = amount.length > 1 ? amount.slice(0, -1) : "0";
		else if (key === ".") next = cents !== undefined ? amount : `${amount}.`;
		else if (cents !== undefined && cents.length >= 2) next = amount;
		else if (cents === undefined && whole.length >= 4 && whole !== "0") next = amount;
		else next = amount === "0" ? key : amount + key;
		if (next === amount && key !== "back") {
			shake.start({ x: [0, -14, 12, -8, 5, 0], transition: { duration: 0.42, ease: "easeOut" } });
			return;
		}
		ui.state.kinAmount = next;
	};

	const chars = money(amount).split("");
	const size = chars.length <= 3 ? 136 : chars.length <= 5 ? 112 : 88;

	return (
		<div
			className="kin relative flex h-full flex-col overflow-hidden text-[#fff]"
			style={{ background: k.card.accent }}
		>
			<StatusBar />
			<header className="flex h-14 items-center justify-between px-5">
				<RoundButton label="Clear" onClick={() => (ui.state.kinAmount = "0")}>
					<path d="M6 6l12 12M18 6L6 18" />
				</RoundButton>
				<motion.button
					type="button"
					whileTap={{ scale: 0.94 }}
					onClick={() => (ui.state.kinTo = (Number(ui.state.kinTo) + 1) % people.length)}
					className="flex h-10 items-center gap-2 rounded-full bg-[rgba(255,255,255,0.16)] pr-4 pl-1.5 text-[16px] font-semibold"
				>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={person.initials}
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -8 }}
							transition={{ duration: 0.28, ease }}
							className="flex items-center gap-2"
						>
							<span
								className="grid size-7 place-items-center rounded-full bg-[#fff] text-[11px] font-bold"
								style={{ color: k.card.accent }}
							>
								{person.initials}
							</span>
							To {person.first}
						</motion.span>
					</AnimatePresence>
				</motion.button>
				<span className="size-10" />
			</header>

			<div className="flex flex-1 flex-col items-center justify-center">
				<motion.div animate={shake} className="flex items-center" style={{ viewTransitionName: "kin-amount" }}>
					<AnimatePresence mode="popLayout" initial={false}>
						{chars.map((c, i) => (
							<motion.span
								// biome-ignore lint/suspicious/noArrayIndexKey: a digit is its place and its value, so a changed one animates
								key={`${i}-${c}`}
								layout
								initial={{ opacity: 0, y: 28, scale: 0.8 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0, y: -18, scale: 0.8 }}
								transition={{ type: "spring", stiffness: 520, damping: 34 }}
								className="inline-block font-bold leading-none tracking-[-0.05em]"
								style={{ fontSize: size }}
							>
								{c}
							</motion.span>
						))}
					</AnimatePresence>
				</motion.div>
				<p className="mt-5 rounded-full bg-[rgba(255,255,255,0.14)] px-4 py-2 text-[15px] font-medium text-[rgba(255,255,255,0.9)]">
					{person.note}
				</p>
			</div>

			<div className="grid grid-cols-3 px-6">
				{["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map((key) => (
					<button
						key={key}
						type="button"
						onClick={() => press(key)}
						className="kin-key mx-auto grid h-[66px] w-[96px] place-items-center rounded-full text-[30px] font-semibold"
					>
						{key === "back" ? (
							<svg
								aria-hidden="true"
								width="26"
								height="26"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.4"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M15 5l-7 7 7 7" />
							</svg>
						) : (
							key
						)}
					</button>
				))}
			</div>

			<div className="grid grid-cols-2 gap-3 px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+34px)]">
				<motion.button
					type="button"
					whileTap={{ scale: 0.96 }}
					onClick={() => value > 0 && setToast(true)}
					className="h-[58px] rounded-full bg-[rgba(255,255,255,0.16)] text-[18px] font-semibold"
				>
					Request
				</motion.button>
				<motion.button
					type="button"
					whileTap={{ scale: 0.96 }}
					animate={{ opacity: value > 0 ? 1 : 0.55 }}
					onClick={() => value > 0 && onNext()}
					className="h-[58px] rounded-full bg-[#fff] text-[18px] font-bold"
					style={{ color: k.card.accent }}
				>
					Pay
				</motion.button>
			</div>

			<AnimatePresence>
				{toast && (
					<motion.div
						initial={{ opacity: 0, y: -24 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -16 }}
						transition={{ duration: 0.36, ease }}
						className="absolute inset-x-5 top-[58px] flex h-14 items-center gap-3 rounded-[20px] bg-[#fff] px-4 text-[15px] font-semibold text-[var(--kin-ink)]"
					>
						<Check color={k.card.accent} size={26} />
						Asked {person.first} for {money(amount)}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

/* ---------- confirm ---------- */

function ConfirmScreen({ onNext }: { onNext: () => void }) {
	const { amount, person } = useKin();
	const [paying, setPaying] = useState(false);

	const pay = () => {
		if (paying) return;
		setPaying(true);
		setTimeout(onNext, 900);
	};

	return (
		<div className="kin flex h-full flex-col overflow-hidden bg-[var(--kin-ground)] text-[var(--kin-ink)]">
			<StatusBar />
			<header className="flex h-14 items-center justify-between px-5">
				<RoundButton label="Back" dark onClick={() => ui.back()}>
					<path d="M15 5l-7 7 7 7" />
				</RoundButton>
				<span className="text-[17px] font-semibold">Review</span>
				<span className="size-10" />
			</header>

			<div className="kin-rise mt-6 flex flex-col items-center text-center">
				<span
					className="grid size-[92px] place-items-center rounded-full text-[32px] font-bold text-[#fff]"
					style={{ background: k.card.accent }}
				>
					{person.initials}
				</span>
				<p className="mt-4 text-[28px] font-bold tracking-[-0.02em]">{person.name}</p>
				<p className="mt-1 text-[16px] text-[var(--kin-dim)]">{person.tag}</p>
				<p
					className="mt-7 font-bold leading-none tracking-[-0.05em]"
					style={{ fontSize: fitSize(amount, 76), viewTransitionName: "kin-amount" }}
				>
					{money(amount)}
				</p>
				<p className="mt-3 text-[17px] text-[var(--kin-dim)]">{person.note}</p>
			</div>

			<div className="mt-auto px-5 pb-[calc(env(safe-area-inset-bottom)+34px)]">
				<p className="mb-3 px-1 text-[15px] font-medium text-[var(--kin-dim)]">Pay from</p>
				<KinCard balance={BALANCE} />
				<motion.button
					type="button"
					whileTap={{ scale: 0.97 }}
					onClick={pay}
					className="relative mt-5 h-[62px] w-full overflow-hidden rounded-full bg-[var(--kin-ink)] text-[19px] font-bold text-[#fff]"
				>
					<motion.span
						className="absolute inset-y-0 left-0"
						style={{ background: k.card.accent }}
						initial={{ width: "0%" }}
						animate={{ width: paying ? "100%" : "0%" }}
						transition={{ duration: 0.85, ease: [0.65, 0, 0.35, 1] }}
					/>
					<span className="relative">{paying ? "Paying…" : `Pay ${money(amount)}`}</span>
				</motion.button>
			</div>
		</div>
	);
}

/* ---------- sent ---------- */

function SentScreen({ onNext }: { onNext: () => void }) {
	const { amount, person, value } = useKin();
	const after = BALANCE - value;
	const shown = useCount(BALANCE, after, 1100, 500);

	return (
		<div className="kin flex h-full flex-col overflow-hidden text-[#fff]" style={{ background: k.card.accent }}>
			<StatusBar />
			<div className="flex flex-1 flex-col items-center justify-center text-center">
				<motion.span
					initial={{ scale: 0.4, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
					className="grid size-[112px] place-items-center rounded-full bg-[#fff]"
				>
					<svg
						aria-hidden="true"
						width="56"
						height="56"
						viewBox="0 0 24 24"
						fill="none"
						stroke={k.card.accent}
						strokeWidth="2.6"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<motion.path
							d="M5 12.5l4.5 4.5L19 7.5"
							initial={{ pathLength: 0 }}
							animate={{ pathLength: 1 }}
							transition={{ duration: 0.5, ease, delay: 0.35 }}
						/>
					</svg>
				</motion.span>
				<p
					className="mt-8 font-bold leading-none tracking-[-0.05em]"
					style={{ fontSize: fitSize(amount, 104), viewTransitionName: "kin-amount" }}
				>
					{money(amount)}
				</p>
				<p className="kin-rise mt-4 text-[24px] font-semibold" style={{ animationDelay: "300ms" }}>
					Sent to {person.first}
				</p>
				<p className="kin-rise mt-1 text-[17px] text-[rgba(255,255,255,0.7)]" style={{ animationDelay: "380ms" }}>
					{person.note}
				</p>
			</div>

			<div className="px-5 pb-[calc(env(safe-area-inset-bottom)+34px)]">
				<KinCard balance={shown} inverted />
				<motion.button
					type="button"
					whileTap={{ scale: 0.97 }}
					onClick={onNext}
					className="mt-5 h-[62px] w-full rounded-full bg-[#fff] text-[19px] font-bold"
					style={{ color: k.card.accent }}
				>
					Done
				</motion.button>
			</div>
		</div>
	);
}

function useCount(from: number, to: number, ms: number, delay: number) {
	const [n, setN] = useState(from);
	useEffect(() => {
		let raf = 0;
		const start = performance.now() + delay;
		const tick = (now: number) => {
			const t = Math.min(1, Math.max(0, (now - start) / ms));
			setN(from + (to - from) * (1 - (1 - t) ** 3));
			if (t < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [from, to, ms, delay]);
	return n;
}

/* ---------- the card ---------- */

function KinCard({ balance, inverted = false }: { balance: number; inverted?: boolean }) {
	const accent = k.card.accent;
	return (
		<div
			className="relative h-[196px] overflow-hidden p-6"
			style={{
				borderRadius: corners(k.card.radius),
				background: inverted ? "#ffffff" : accent,
				color: inverted ? accent : "#ffffff",
				viewTransitionName: "kin-card",
			}}
		>
			<span
				className="pointer-events-none absolute -top-24 -right-16 size-[260px] rounded-full"
				style={{ background: inverted ? accent : "#ffffff", opacity: 0.1 }}
			/>
			<span
				className="pointer-events-none absolute -right-2 -bottom-28 size-[200px] rounded-full"
				style={{ background: inverted ? accent : "#ffffff", opacity: 0.08 }}
			/>
			<div className="relative flex items-center justify-between">
				<span className="text-[22px] font-extrabold tracking-[-0.04em]">kin</span>
				<svg
					aria-hidden="true"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
				>
					<path d="M8 8.5a5 5 0 0 1 0 7M11.5 6a8.5 8.5 0 0 1 0 12M15 3.5a12 12 0 0 1 0 17" />
				</svg>
			</div>
			<div className="relative mt-[46px] flex items-end justify-between">
				<div>
					<p className="text-[14px] font-medium opacity-70">Balance</p>
					<p className="mt-0.5 text-[34px] font-bold leading-none tracking-[-0.03em]">{dollars(balance)}</p>
				</div>
				<p className="text-[16px] font-semibold opacity-80">•••• 4021</p>
			</div>
		</div>
	);
}

/* ---------- parts ---------- */

function RoundButton({
	label,
	onClick,
	dark = false,
	children,
}: {
	label: string;
	onClick: () => void;
	dark?: boolean;
	children: ReactNode;
}) {
	return (
		<motion.button
			type="button"
			aria-label={label}
			whileTap={{ scale: 0.88 }}
			onClick={onClick}
			className={
				dark
					? "grid size-10 place-items-center rounded-full bg-[rgba(0,0,0,0.06)]"
					: "grid size-10 place-items-center rounded-full bg-[rgba(255,255,255,0.16)]"
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

function Check({ color, size }: { color: string; size: number }) {
	return (
		<span className="grid place-items-center rounded-full" style={{ width: size, height: size, background: color }}>
			<svg
				aria-hidden="true"
				width={size * 0.6}
				height={size * 0.6}
				viewBox="0 0 24 24"
				fill="none"
				stroke="#fff"
				strokeWidth="3"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M5 12.5l4.5 4.5L19 7.5" />
			</svg>
		</span>
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
