import { motion } from "motion/react";
import { ui } from "spool";
import { BOTTOM, CREAM, GREEN, IOS, POP, TOP } from "shared/ui/explore/cloud/phone-link/kaffe-app";

const up = (delay: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, ease: IOS, delay } });

export default function Frame() {
	return (
		<div data-kaffe className="fixed inset-0 flex select-none flex-col items-center px-8 font-sans text-[#1B1A17] antialiased" style={{ background: CREAM, paddingTop: `calc(${TOP} + 120px)`, paddingBottom: `calc(${BOTTOM} + 16px)` }}>
			<motion.span className="flex size-[88px] items-center justify-center rounded-full" style={{ background: GREEN }} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...POP, delay: 0.15 }}>
				<svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
					<motion.path d="M10 21l7 7 13-15" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease: IOS, delay: 0.35 }} />
				</svg>
			</motion.span>
			<motion.h1 {...up(0.45)} className="mt-7 text-center font-bold text-[28px] tracking-tight">
				Order 214 is in
			</motion.h1>
			<motion.p {...up(0.52)} className="mt-1.5 text-center text-[#1B1A17]/55 text-[16px]">
				We'll call your name at the window.
			</motion.p>
			<motion.div {...up(0.6)} className="mt-10 w-full rounded-[16px] bg-[#fff] px-4 py-4">
				<div className="flex justify-between text-[15px]">
					<span>Ready in about 6 min</span>
					<span className="text-[#1B1A17]/50">09:47</span>
				</div>
				<div className="mt-3 h-[6px] overflow-hidden rounded-full bg-[#1B1A17]/8">
					<motion.div className="h-full rounded-full" style={{ background: GREEN }} initial={{ width: "4%" }} animate={{ width: "38%" }} transition={{ duration: 2.4, ease: IOS, delay: 0.8 }} />
				</div>
			</motion.div>
			<motion.button
				{...up(0.7)}
				type="button"
				whileTap={{ scale: 0.97 }}
				data-go="explore/cloud/phone-link/kaffe-menu"
				data-transition="kaffe-done"
				onClick={() => {
					ui.state.cart = {};
				}}
				className="mt-auto h-[54px] w-full rounded-[18px] border border-[#1B1A17]/15 font-semibold text-[16px]"
			>
				Done
			</motion.button>
		</div>
	);
}
