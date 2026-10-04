import { AnimatePresence, animate, motion, type PanInfo, useMotionValue, useTransform } from "motion/react";
import { useState } from "react";
import { ui } from "spool";
import { BOTTOM, Bump, type Cart, CREAM, DRINKS, type Drink, haptic, IOS, MenuPage, NavBar, OrderBar, POP, TOP, total } from "shared/ui/explore/cloud/phone-link/kaffe-app";

const TIMES = ["Now", "15 min", "30 min"] as const;

/** Swipe left to delete, the way Mail does: a short swipe shows the button, a long one deletes. */
function Line({ drink, n, onDelete }: { drink: Drink; n: number; onDelete: () => void }) {
	const x = useMotionValue(0);
	const reveal = useTransform(x, [-88, -20, 0], [1, 0.4, 0]);
	const [armed, setArmed] = useState(false);
	return (
		<motion.div layout exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: IOS }} className="relative overflow-hidden">
			<motion.button type="button" onClick={onDelete} style={{ opacity: reveal }} className="absolute inset-y-0 right-0 flex w-full items-center justify-end bg-[#E5484D] pr-6 font-semibold text-[#fff] text-[15px]">
				Delete
			</motion.button>
			<motion.div
				drag="x"
				dragDirectionLock
				dragConstraints={{ left: -88, right: 0 }}
				dragElastic={{ left: 0.6, right: 0.05 }}
				style={{ x, background: "#fff" }}
				onDrag={(_: unknown, info: PanInfo) => {
					const past = info.offset.x < -170;
					if (past !== armed) {
						haptic();
						setArmed(past);
					}
				}}
				onDragEnd={(_: unknown, info: PanInfo) => {
					if (info.offset.x < -170) return onDelete();
					animate(x, info.offset.x < -44 ? -88 : 0, POP);
				}}
				className="relative flex items-center gap-3 px-4 py-3.5"
			>
				<span className="size-[42px] shrink-0 rounded-[12px]" style={{ background: drink.tint }} />
				<span className="flex-1 text-[16px]">
					<span className="text-[#1B1A17]/50 tabular-nums">{n}×</span> {drink.name}
				</span>
				<span className="text-[15px] tabular-nums">{n * drink.price} kr</span>
			</motion.div>
		</motion.div>
	);
}

export default function Frame() {
	ui.use();
	const cart = (ui.state.cart ?? { Cortado: 1, "Cardamom bun": 2 }) as Cart;
	const lines = DRINKS.filter((d) => (cart[d.name] ?? 0) > 0);
	const [time, setTime] = useState<(typeof TIMES)[number]>("Now");
	const [paying, setPaying] = useState(false);
	const solid = useMotionValue(0);

	// the edge swipe: this page follows the finger, the menu waits underneath
	const width = typeof window === "undefined" ? 390 : window.innerWidth;
	const x = useMotionValue(0);
	const under = useTransform(x, [0, width], [-width * 0.3, 0]);
	const shade = useTransform(x, [0, width], [0.12, 0]);
	const [swiping, setSwiping] = useState(false);
	const back = () => {
		animate(x, width, { duration: 0.28, ease: IOS }).then(() => {
			document.documentElement.dataset.kaffeSwipe = "";
			ui.back();
			window.setTimeout(() => delete document.documentElement.dataset.kaffeSwipe, 400);
		});
	};

	return (
		<div data-kaffe className="fixed inset-0 select-none overflow-hidden bg-[#000] font-sans text-[#1B1A17] antialiased [-webkit-touch-callout:none]">
			{swiping ? (
				<motion.div className="absolute inset-0" style={{ x: under }}>
					<MenuPage cart={cart} onAdd={() => {}} onOpen={() => {}} still />
					<motion.div className="absolute inset-0 bg-[#000]" style={{ opacity: shade }} />
				</motion.div>
			) : null}
			<motion.div className="absolute inset-0 shadow-[-10px_0_30px_rgba(0,0,0,0.18)]" style={{ x, background: CREAM }}>
				<div
					className="absolute inset-0 overflow-y-auto overscroll-y-contain"
					onScroll={(e) => solid.set(Math.min(1, Math.max(0, (e.currentTarget.scrollTop - 24) / 30)))}
				>
					<div className="space-y-6 px-4" style={{ paddingTop: `calc(${TOP} + 44px)`, paddingBottom: `calc(${BOTTOM} + 100px)` }}>
						<h1 className="pt-1 font-bold text-[34px] leading-[1.15] tracking-tight">Your order</h1>
						<div className="overflow-hidden rounded-[16px] bg-[#fff]">
							<AnimatePresence initial={false}>
								{lines.map((d) => (
									<Line
										key={d.name}
										drink={d}
										n={cart[d.name] ?? 0}
										onDelete={() => {
											haptic();
											const next = { ...cart };
											delete next[d.name];
											ui.state.cart = next;
										}}
									/>
								))}
							</AnimatePresence>
							{lines.length === 0 ? <p className="px-4 py-6 text-center text-[#1B1A17]/50 text-[15px]">Nothing here yet.</p> : null}
						</div>
						<p className="-mt-3 px-1 text-[#1B1A17]/45 text-[13px]">Swipe a line left to remove it.</p>
						<div className="overflow-hidden rounded-[16px] bg-[#fff]">
							<label className="flex items-center justify-between border-[#1B1A17]/8 border-b px-4 py-3 text-[16px]">
								Oat milk
								<input type="checkbox" {...{ switch: "" }} defaultChecked />
							</label>
							<label className="block px-4 py-3">
								<span className="block text-[#1B1A17]/50 text-[13px]">Note for the barista</span>
								<input type="text" placeholder="Extra hot, please" className="mt-0.5 w-full select-text bg-transparent text-[16px] outline-none" />
							</label>
						</div>
						<div>
							<p className="mb-2 px-1 text-[#1B1A17]/50 text-[13px] uppercase tracking-wide">Pick up</p>
							<div className="flex rounded-[10px] bg-[#1B1A17]/7 p-[3px]">
								{TIMES.map((t) => (
									<button
										key={t}
										type="button"
										onClick={() => {
											if (t === time) return;
											haptic();
											setTime(t);
										}}
										className="relative h-[34px] flex-1 font-medium text-[14px]"
									>
										{t === time ? <motion.span layoutId="seg-time" className="absolute inset-0 rounded-[8px] bg-[#fff] shadow-[0_2px_6px_rgba(0,0,0,0.1)]" transition={POP} /> : null}
										<span className="relative">{t}</span>
									</button>
								))}
							</div>
						</div>
					</div>
				</div>
				<NavBar
					title="Your order"
					solid={solid}
					left={
						<button type="button" onClick={() => ui.back()} className="-ml-2 flex items-center gap-0.5 px-1 text-[17px]" style={{ color: "#2F6B4F" }}>
							<svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
								<path d="M10 2 2 10l8 8" />
							</svg>
							Menu
						</button>
					}
				/>
				<AnimatePresence>
					{lines.length > 0 ? (
						<OrderBar
							pressed={paying}
							onPress={() => {
								if (paying) return;
								haptic();
								setPaying(true);
								window.setTimeout(() => ui.go("explore/cloud/phone-link/kaffe-receipt"), 900);
							}}
						>
							<AnimatePresence mode="popLayout" initial={false}>
								{paying ? (
									<motion.span key="paying" className="flex flex-1 items-center justify-center gap-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={POP}>
										<motion.span className="size-[16px] rounded-full border-2 border-[#fff]/30 border-t-[#fff]" animate={{ rotate: 360 }} transition={{ repeat: Number.POSITIVE_INFINITY, duration: 0.7, ease: "linear" }} />
										Paying
									</motion.span>
								) : (
									<motion.span key="pay" className="flex flex-1 items-center gap-3" exit={{ opacity: 0, y: -8 }}>
										<Bump value={lines.length} />
										<span>Pay with Apple Pay</span>
										<span className="ml-auto tabular-nums">{total(cart)} kr</span>
									</motion.span>
								)}
							</AnimatePresence>
						</OrderBar>
					) : null}
				</AnimatePresence>
			</motion.div>
			{/* the left edge: drag it and the page comes with you */}
			<motion.div
				className="absolute top-0 bottom-0 left-0 z-40 w-[22px]"
				style={{ touchAction: "none" }}
				onPanStart={() => setSwiping(true)}
				onPan={(_: unknown, info: PanInfo) => x.set(Math.max(0, info.offset.x))}
				onPanEnd={(_: unknown, info: PanInfo) => {
					if (info.offset.x > width * 0.35 || info.velocity.x > 500) return back();
					animate(x, 0, { duration: 0.3, ease: IOS }).then(() => setSwiping(false));
				}}
			/>
		</div>
	);
}
