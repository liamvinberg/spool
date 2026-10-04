import { AnimatePresence, type MotionValue, motion, type PanInfo, useMotionValue, useTransform } from "motion/react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

/**
 * Kaffebar, a phone app built to be felt on a real phone through a shared
 * link (DEV-115): does a spool prototype opened from the Home Screen feel like
 * an app? It pads itself for the notch and home bar with env(safe-area-inset-*),
 * which reaches the frame inside the shared website's iframe (measured on an
 * iPhone 17 Pro, iOS 27: 62 top, 34 bottom, inside and out).
 *
 * The native moves: a large title that folds into the bar, a filtered list
 * that animates, a sheet that follows your finger, a card stack behind it, a
 * floating order bar, haptics through the iOS switch trick, swipe to delete,
 * and an edge swipe back that follows your finger (in the cart frame).
 *
 * Shared UI takes values and callbacks only; frames own ui.state and walks.
 * Prototype only.
 */

export const GREEN = "#1F3A2E";
export const CREAM = "#F6F1EA";
export const INK = "#1B1A17";
/** the curve iOS sheets and pushes ride */
export const IOS = [0.32, 0.72, 0, 1] as const;
export const SHEET = { type: "spring", stiffness: 420, damping: 42, mass: 1 } as const;
export const POP = { type: "spring", stiffness: 700, damping: 30 } as const;

export const TOP = "env(safe-area-inset-top)";
export const BOTTOM = "env(safe-area-inset-bottom)";

/**
 * iOS has no vibration API. Since Safari 18, toggling an <input switch>
 * through its label plays the system's tick, and it has to happen inside a
 * tap. Elsewhere this does nothing.
 */
export function haptic() {
	try {
		const label = document.createElement("label");
		label.ariaHidden = "true";
		label.style.display = "none";
		const input = document.createElement("input");
		input.type = "checkbox";
		input.setAttribute("switch", "");
		label.appendChild(input);
		document.body.appendChild(label);
		label.click();
		label.remove();
	} catch {
		// a browser without the switch: silence
	}
}

export type Category = "Coffee" | "Tea" | "Pastry" | "Lunch" | "Cold";

export interface Drink {
	name: string;
	note: string;
	price: number;
	tint: string;
	kind: Category;
}

export const DRINKS: Drink[] = [
	{ name: "Cortado", note: "Double shot, warm milk", price: 42, tint: "#C9A27E", kind: "Coffee" },
	{ name: "Flat white", note: "Ethiopia Guji, silky", price: 46, tint: "#D8B892", kind: "Coffee" },
	{ name: "Filter", note: "Kenya Nyeri, today's batch", price: 36, tint: "#8E5B3A", kind: "Coffee" },
	{ name: "Oat latte", note: "Oatly Barista", price: 49, tint: "#E4CDB0", kind: "Coffee" },
	{ name: "Espresso", note: "House blend", price: 32, tint: "#5A3522", kind: "Coffee" },
	{ name: "Cold brew", note: "Steeped 18 hours", price: 44, tint: "#3E2A1E", kind: "Cold" },
	{ name: "Chai", note: "Spiced, with honey", price: 45, tint: "#C08A55", kind: "Tea" },
	{ name: "Matcha", note: "Uji, ceremonial", price: 52, tint: "#8FA66B", kind: "Tea" },
	{ name: "Earl grey", note: "Bergamot, loose leaf", price: 34, tint: "#A37B57", kind: "Tea" },
	{ name: "Cardamom bun", note: "Baked at six", price: 38, tint: "#D9A35F", kind: "Pastry" },
	{ name: "Cinnamon bun", note: "Baked at six", price: 36, tint: "#B97A43", kind: "Pastry" },
	{ name: "Chocolate ball", note: "Oats, cocoa, coconut", price: 24, tint: "#4A3021", kind: "Pastry" },
	{ name: "Rye sandwich", note: "Cheese, cucumber", price: 68, tint: "#9A7B55", kind: "Lunch" },
	{ name: "Lentil soup", note: "With sourdough", price: 89, tint: "#C46A3A", kind: "Lunch" },
	{ name: "Lemonade", note: "Elderflower", price: 39, tint: "#E8DE8A", kind: "Cold" },
	{ name: "Iced latte", note: "Over big ice", price: 49, tint: "#CDB291", kind: "Cold" },
];

export const CHIPS = ["All", "Coffee", "Tea", "Pastry", "Lunch", "Cold"] as const;
export type Chip = (typeof CHIPS)[number];

export type Cart = Record<string, number>;
export const count = (cart: Cart) => Object.values(cart).reduce((a, b) => a + b, 0);
export const total = (cart: Cart) => DRINKS.reduce((sum, d) => sum + (cart[d.name] ?? 0) * d.price, 0);

/** Survives a walk in the player's one document, so back lands where you were. */
export const memory = { menuScroll: 0, chip: "All" as Chip };

/* ---------- bars ---------- */

/** The iOS bar: clear over the large title, frosted once content slides under it. */
export function NavBar({ title, solid, left, right }: { title: ReactNode; solid: MotionValue<number>; left?: ReactNode; right?: ReactNode }) {
	const line = useTransform(solid, [0, 1], ["rgba(27,26,23,0)", "rgba(27,26,23,0.12)"]);
	return (
		<div className="pointer-events-none absolute inset-x-0 top-0 z-20" style={{ paddingTop: TOP }}>
			<motion.div
				className="absolute inset-0 backdrop-blur-xl backdrop-saturate-150"
				style={{ opacity: solid, background: "rgba(246,241,234,0.78)", borderBottom: "0.5px solid", borderColor: line }}
			/>
			<div className="pointer-events-auto relative flex h-[44px] items-center justify-between px-4">
				<span className="min-w-[80px]">{left}</span>
				<motion.span className="font-semibold text-[17px]" style={{ opacity: solid }}>
					{title}
				</motion.span>
				<span className="flex min-w-[80px] justify-end">{right}</span>
			</div>
		</div>
	);
}

/** The order, floating above the home bar. Same name in both frames, so a walk keeps it in place. */
export function OrderBar({ children, onPress, go, pressed }: { children: ReactNode; onPress?: () => void; go?: string; pressed?: boolean }) {
	return (
		<motion.div
			className="fixed inset-x-3 z-30"
			style={{ bottom: `calc(${BOTTOM} + 8px)`, viewTransitionName: "kaffe-bar" }}
			initial={{ y: 120 }}
			animate={{ y: 0 }}
			exit={{ y: 120 }}
			transition={SHEET}
		>
			<motion.button
				type="button"
				data-go={go}
				onClick={onPress}
				whileTap={{ scale: 0.97 }}
				animate={{ scale: pressed ? 0.97 : 1 }}
				className="flex h-[58px] w-full items-center gap-3 rounded-[20px] px-5 font-semibold text-[#fff] text-[16px] shadow-[0_10px_30px_rgba(31,58,46,0.35)]"
				style={{ background: GREEN }}
			>
				{children}
			</motion.button>
		</motion.div>
	);
}

export function Bump({ value }: { value: number | string }) {
	return (
		<span className="relative inline-flex h-[22px] min-w-[22px] items-center justify-center overflow-hidden rounded-full bg-[#fff]/18 px-1.5 text-[13px] tabular-nums">
			<AnimatePresence mode="popLayout" initial={false}>
				<motion.span key={value} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={POP}>
					{value}
				</motion.span>
			</AnimatePresence>
		</span>
	);
}

/* ---------- the menu ---------- */

function ChipRow({ chip, onChip }: { chip: Chip; onChip: (c: Chip) => void }) {
	return (
		<div className="flex snap-x gap-2 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
			{CHIPS.map((c) => (
				<button
					key={c}
					type="button"
					onClick={() => {
						if (c === chip) return;
						haptic();
						onChip(c);
					}}
					className="relative shrink-0 snap-start rounded-full px-4 py-2 text-[14px]"
				>
					{c === chip ? <motion.span layoutId="kaffe-chip" className="absolute inset-0 rounded-full" style={{ background: INK }} transition={POP} /> : <span className="absolute inset-0 rounded-full border border-[#1B1A17]/12 bg-[#fff]" />}
					<span className={c === chip ? "relative text-[#fff]" : "relative"}>{c}</span>
				</button>
			))}
		</div>
	);
}

function Row({ drink, n, onOpen, onAdd }: { drink: Drink; n: number; onOpen: () => void; onAdd: () => void }) {
	return (
		<motion.div
			layout
			initial={{ opacity: 0, scale: 0.98 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.98 }}
			transition={{ duration: 0.22, ease: IOS }}
			onClick={onOpen}
			className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-[#1B1A17]/5"
		>
			<motion.span layoutId={`kaffe-swatch-${drink.name}`} className="size-[54px] shrink-0 rounded-[15px]" style={{ background: drink.tint }} />
			<span className="min-w-0 flex-1 border-[#1B1A17]/8 border-b pb-3 [margin-bottom:-12px]">
				<span className="block font-medium text-[16px]">{drink.name}</span>
				<span className="block text-[#1B1A17]/55 text-[13px]">{drink.note}</span>
			</span>
			<span className="text-[15px] tabular-nums">{drink.price} kr</span>
			<motion.button
				type="button"
				whileTap={{ scale: 0.82 }}
				onClick={(e) => {
					e.stopPropagation();
					haptic();
					onAdd();
				}}
				className="flex size-[34px] items-center justify-center rounded-full text-[#fff]"
				style={{ background: GREEN }}
			>
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.span key={n} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={POP} className={n > 0 ? "text-[14px] tabular-nums" : "text-[20px] leading-none"}>
						{n > 0 ? n : "+"}
					</motion.span>
				</AnimatePresence>
			</motion.button>
		</motion.div>
	);
}

/**
 * The menu page itself, its own scroller. The cart frame draws it too, still,
 * underneath an edge swipe, so it takes `still` to turn every control off.
 */
export function MenuPage({ cart, onAdd, onOpen, still = false }: { cart: Cart; onAdd: (name: string, n?: number) => void; onOpen: (d: Drink) => void; still?: boolean }) {
	const scroller = useRef<HTMLDivElement | null>(null);
	const solid = useMotionValue(0);
	const title = useTransform(solid, [0, 1], [1, 0]);
	const [chip, setChip] = useState<Chip>(memory.chip);
	const shown = DRINKS.filter((d) => chip === "All" || d.kind === chip);

	useLayoutEffect(() => {
		const el = scroller.current;
		if (el === null) return;
		el.scrollTop = memory.menuScroll;
		solid.set(Math.min(1, Math.max(0, (el.scrollTop - 24) / 30)));
	}, [solid]);

	return (
		<div className={`absolute inset-0 ${still ? "pointer-events-none" : ""}`} style={{ background: CREAM }}>
			<div
				ref={scroller}
				onScroll={(e) => {
					const top = e.currentTarget.scrollTop;
					solid.set(Math.min(1, Math.max(0, (top - 24) / 30)));
					if (!still) memory.menuScroll = top;
				}}
				className="absolute inset-0 overflow-y-auto overscroll-y-contain"
			>
				<div style={{ paddingTop: `calc(${TOP} + 44px)` }}>
					<motion.h1 className="origin-left px-4 pt-1 pb-0.5 font-bold text-[34px] leading-[1.15] tracking-tight" style={{ opacity: title }}>
						Kaffebar
					</motion.h1>
					<p className="px-4 pb-3 text-[#1B1A17]/55 text-[15px]">Order ahead, pick up at the window.</p>
					<ChipRow
						chip={chip}
						onChip={(c) => {
							memory.chip = c;
							setChip(c);
						}}
					/>
					<div style={{ paddingBottom: `calc(${BOTTOM} + 90px)` }}>
						<AnimatePresence mode="popLayout" initial={false}>
							{shown.map((drink) => (
								<Row key={drink.name} drink={drink} n={cart[drink.name] ?? 0} onOpen={() => onOpen(drink)} onAdd={() => onAdd(drink.name)} />
							))}
						</AnimatePresence>
					</div>
				</div>
			</div>
			<NavBar title="Kaffebar" solid={solid} right={<span className="text-[#1B1A17]/50 text-[15px]">Södermalm</span>} />
		</div>
	);
}

/* ---------- the sheet ---------- */

const SIZES = [
	{ id: "S", add: -4 },
	{ id: "M", add: 0 },
	{ id: "L", add: 8 },
] as const;

function Segmented<T extends string>({ value, options, onChange, id }: { value: T; options: readonly T[]; onChange: (v: T) => void; id: string }) {
	return (
		<div className="flex rounded-[10px] bg-[#1B1A17]/7 p-[3px]">
			{options.map((o) => (
				<button
					key={o}
					type="button"
					onClick={() => {
						if (o === value) return;
						haptic();
						onChange(o);
					}}
					className="relative h-[34px] flex-1 font-medium text-[14px]"
				>
					{o === value ? <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-[8px] bg-[#fff] shadow-[0_2px_6px_rgba(0,0,0,0.1)]" transition={POP} /> : null}
					<span className="relative">{o}</span>
				</button>
			))}
		</div>
	);
}

/** A card sheet: the page behind steps back, the sheet follows your finger down. */
export function DrinkSheet({ drink, onClose, onAdd, drag }: { drink: Drink; onClose: () => void; onAdd: (n: number) => void; drag: MotionValue<number> }) {
	const [size, setSize] = useState<"S" | "M" | "L">("M");
	const [n, setN] = useState(1);
	const price = (drink.price + (SIZES.find((s) => s.id === size)?.add ?? 0)) * n;
	return (
		<motion.div
			className="absolute inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-[14px]"
			style={{ top: `calc(${TOP} + 12px)`, background: CREAM, y: drag }}
			initial={{ y: sheetRest() }}
			animate={{ y: 0 }}
			exit={{ y: sheetRest() }}
			transition={SHEET}
			drag="y"
			dragConstraints={{ top: 0, bottom: 0 }}
			dragElastic={{ top: 0.04, bottom: 1 }}
			onDragEnd={(_: unknown, info: PanInfo) => {
				if (info.offset.y > 140 || info.velocity.y > 600) onClose();
			}}
		>
			<span className="mx-auto mt-2 h-[5px] w-[36px] shrink-0 rounded-full bg-[#1B1A17]/20" />
			<div className="flex flex-1 flex-col px-5 pt-6">
				<motion.span layoutId={`kaffe-swatch-${drink.name}`} className="mx-auto size-[150px] rounded-[40px]" style={{ background: drink.tint }} />
				<h2 className="mt-6 text-center font-bold text-[28px] tracking-tight">{drink.name}</h2>
				<p className="text-center text-[#1B1A17]/55 text-[15px]">{drink.note}</p>
				<div className="mt-8 space-y-4">
					<Segmented id="size" value={size} options={["S", "M", "L"] as const} onChange={setSize} />
					<div className="flex items-center justify-between rounded-[14px] bg-[#fff] px-4 py-2.5">
						<span className="text-[16px]">Quantity</span>
						<span className="flex items-center gap-4">
							<motion.button type="button" whileTap={{ scale: 0.85 }} onClick={() => (haptic(), setN((v) => Math.max(1, v - 1)))} className="flex size-[34px] items-center justify-center rounded-full bg-[#1B1A17]/7 text-[20px]">
								−
							</motion.button>
							<span className="relative w-[18px] overflow-hidden text-center font-semibold text-[17px] tabular-nums">
								<AnimatePresence mode="popLayout" initial={false}>
									<motion.span key={n} className="block" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} transition={POP}>
										{n}
									</motion.span>
								</AnimatePresence>
							</span>
							<motion.button type="button" whileTap={{ scale: 0.85 }} onClick={() => (haptic(), setN((v) => v + 1))} className="flex size-[34px] items-center justify-center rounded-full bg-[#1B1A17]/7 text-[20px]">
								+
							</motion.button>
						</span>
					</div>
				</div>
				<motion.button
					type="button"
					whileTap={{ scale: 0.97 }}
					onClick={() => {
						haptic();
						onAdd(n);
					}}
					className="mt-auto flex h-[56px] w-full items-center justify-between rounded-[18px] px-5 font-semibold text-[#fff] text-[16px]"
					style={{ background: GREEN, marginBottom: `calc(${BOTTOM} + 12px)` }}
				>
					<span>Add to order</span>
					<span className="tabular-nums">{price} kr</span>
				</motion.button>
			</div>
		</motion.div>
	);
}

/** How far the sheet sits below its resting place, in px: the screen height when closed. */
export const sheetRest = () => (typeof window === "undefined" ? 900 : window.innerHeight);

/** The page behind a sheet: steps back and rounds off as the sheet rises, and comes forward as you drag it down. */
export function StepBack({ drag, children }: { drag: MotionValue<number>; children: ReactNode }) {
	const h = sheetRest();
	const scale = useTransform(drag, [0, h], [0.93, 1]);
	const borderRadius = useTransform(drag, [0, h], [12, 0]);
	const y = useTransform(drag, [0, h], [6, 0]);
	return (
		<motion.div className="absolute inset-0 overflow-hidden" style={{ scale, borderRadius, y }}>
			{children}
		</motion.div>
	);
}
