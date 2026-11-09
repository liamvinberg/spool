import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { ui } from "spool";
import boil from "./boil.webp";
import hero from "./hero.webp";
import sear from "./sear.webp";
import butter from "./step.webp";
import "./dill.css";

/* Dill, a recipe app. The dish is the screen; the words sit on a sheet over it. */

export const k = ui.knobs({
	sheet: {
		radius: { type: "corners", value: 30, min: 0, max: 48 },
		accent: { type: "color", value: "#3e5c37", swatches: ["#3e5c37", "#c2481f", "#1d1a16", "#8a5a1c", "#2d4f7a"] },
		paper: { type: "color", value: "#f7f2ea", swatches: ["#f7f2ea", "#ffffff", "#efe8dc"] },
	},
	motion: {
		spring: { type: "spring", value: { duration: 0.6, bounce: 0.16 } },
		replay: { type: "action", label: "Replay entrance" },
	},
});

export type DillScreen = "recipe" | "step" | "done";

function spring(delay = 0) {
	const s = k.motion.spring as { duration: number; bounce: number };
	return { type: "spring" as const, duration: s.duration, bounce: s.bounce, delay };
}

function corners(top: boolean) {
	const r = k.sheet.radius as number | number[];
	const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r];
	return top ? `${a}px ${b}px 0 0` : `0 0 ${c}px ${d}px`;
}

/* each frame names where its primary action walks, so the canvas draws one arrow per walk */
export function Dill({ screen, onNext }: { screen: DillScreen; onNext: () => void }) {
	const style = { "--dill-cream": k.sheet.paper } as CSSProperties;
	return (
		<div className="dill" style={style} key={k.motion.replay}>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap"
				precedence="default"
			/>
			<StatusBar />
			{screen === "recipe" && <Recipe onNext={onNext} />}
			{screen === "step" && <Step onNext={onNext} />}
			{screen === "done" && <Done onNext={onNext} />}
		</div>
	);
}

/* the one card: the sheet the words sit on, over the photograph */
export function Sheet({ top, children }: { top: number; children: ReactNode }) {
	return (
		<motion.section
			className="dill-sheet"
			style={{ top, borderRadius: corners(true) }}
			initial={{ y: 60 }}
			animate={{ y: 0 }}
			transition={spring(0.05)}
		>
			{children}
		</motion.section>
	);
}

function Photo({
	src,
	height,
	zoom = 1.08,
	pos = "center",
}: {
	src: string;
	height: number | string;
	zoom?: number;
	pos?: string;
}) {
	return (
		<div className="dill-photo" style={{ height }}>
			<AnimatePresence initial={false}>
				<motion.img
					key={src}
					src={src}
					alt=""
					style={{ objectPosition: pos }}
					initial={{ opacity: 0, scale: zoom + 0.04 }}
					animate={{ opacity: 1, scale: zoom }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
				/>
			</AnimatePresence>
		</div>
	);
}

/* amounts for one serving */
const ingredients = [
	{ per: 250, unit: "g", name: "potato gnocchi" },
	{ per: 30, unit: "g", name: "butter" },
	{ per: 6, unit: "", name: "sage leaves" },
	{ per: 0.5, unit: "tbsp", name: "olive oil" },
	{ per: 15, unit: "g", name: "parmesan" },
	{ per: 0.25, unit: "", name: "lemon" },
];

function amount(per: number, unit: string, servings: number) {
	const v = per * servings;
	if (unit === "g") return v >= 1000 ? `${Math.round(v / 50) / 20} kg` : `${Math.round(v / 5) * 5} g`;
	const whole = Math.floor(v);
	const frac = { 0: "", 0.25: "¼", 0.5: "½", 0.75: "¾" }[Math.round((v - whole) * 4) / 4] ?? "";
	const n = `${whole || ""}${frac}` || "0";
	return unit ? `${n} ${unit}` : n;
}

function useServings() {
	ui.use();
	return (ui.state.dillServings as number | undefined) ?? 2;
}

function Recipe({ onNext }: { onNext: () => void }) {
	const servings = useServings();
	const [saved, setSaved] = useState(false);
	const set = (n: number) => {
		ui.state.dillServings = Math.min(8, Math.max(1, n));
	};
	return (
		<>
			<Photo src={hero} height={356} />
			<button
				type="button"
				className="dill-glass"
				style={{ right: 20 }}
				onClick={() => setSaved((s) => !s)}
				aria-label="Save"
			>
				<motion.svg
					key={String(saved)}
					initial={{ scale: 0.6 }}
					animate={{ scale: 1 }}
					transition={spring()}
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill={saved ? "currentColor" : "none"}
					stroke="currentColor"
					strokeWidth={2}
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="M6 3.5h12v17l-6-4.2-6 4.2z" />
				</motion.svg>
			</button>

			<Sheet top={322}>
				<div style={{ padding: "28px 24px 0", flex: 1, minHeight: 0, overflow: "hidden" }}>
					<h1 className="dill-title dill-serif">Brown butter gnocchi with crispy sage</h1>
					<div className="dill-meta">
						<span>25 min · 6 ingredients</span>
						<span className="dill-stepper">
							<button type="button" onClick={() => set(servings - 1)} aria-label="Fewer">
								−
							</button>
							<output>
								{servings} {servings === 1 ? "serving" : "servings"}
							</output>
							<button type="button" onClick={() => set(servings + 1)} aria-label="More">
								+
							</button>
						</span>
					</div>
					<ul className="dill-list">
						{ingredients.map((i) => (
							<li key={i.name}>
								<span className="dill-amt" style={{ color: k.sheet.accent }}>
									<AnimatePresence mode="popLayout" initial={false}>
										<motion.span
											key={amount(i.per, i.unit, servings)}
											initial={{ y: 18, opacity: 0 }}
											animate={{ y: 0, opacity: 1 }}
											exit={{ y: -18, opacity: 0 }}
											transition={spring()}
										>
											{amount(i.per, i.unit, servings)}
										</motion.span>
									</AnimatePresence>
								</span>
								<span>{i.name}</span>
							</li>
						))}
					</ul>
				</div>
				<div className="dill-foot" style={{ paddingTop: 12 }}>
					<button type="button" className="dill-cta" style={{ background: k.sheet.accent }} onClick={onNext}>
						Start cooking
					</button>
				</div>
			</Sheet>
		</>
	);
}

const steps: { photo: string; before: string; timer?: number; after?: string }[] = [
	{
		photo: boil,
		before: "Bring a wide pot of salted water to a boil. Drop in the gnocchi and lift them out as they float, about",
		timer: 120,
		after: ".",
	},
	{
		photo: sear,
		before: "Slide them into a hot pan with the oil. Leave them be until the undersides turn deep gold,",
		timer: 240,
		after: ".",
	},
	{
		photo: butter,
		before: "Add the butter and sage. Swirl until it foams, turns hazel and smells of toasted nuts,",
		timer: 180,
		after: ".",
	},
	{
		photo: hero,
		before: "Squeeze in the lemon, toss everything once and plate. Shave the parmesan over while it's hot.",
	},
];

function clock(s: number) {
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Step({ onNext }: { onNext: () => void }) {
	const servings = useServings();
	const [at, setAt] = useState(0);
	const [left, setLeft] = useState<number | null>(null);
	const step = steps[at] ?? steps[0]!;
	const total = step.timer ?? 0;

	useEffect(() => {
		if (left === null || left <= 0) return;
		const t = setTimeout(() => setLeft(left - 1), 1000);
		return () => clearTimeout(t);
	}, [left]);

	const go = (n: number) => {
		setLeft(null);
		setAt(n);
	};
	const last = at === steps.length - 1;

	return (
		<>
			<Photo src={step.photo} height={452} zoom={1.12} />
			<button type="button" className="dill-glass" style={{ left: 20 }} onClick={() => ui.back()} aria-label="Close">
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth={2.2}
					strokeLinecap="round"
					aria-hidden="true"
				>
					<path d="M6 6l12 12M18 6 6 18" />
				</svg>
			</button>

			<Sheet top={420}>
				<div style={{ padding: "26px 24px 0", flex: 1, minHeight: 0 }}>
					<div className="dill-progress">
						{steps.map((s, i) => (
							<span key={s.before}>
								<motion.i
									style={{ background: k.sheet.accent }}
									initial={false}
									animate={{ scaleX: i <= at ? 1 : 0 }}
									transition={spring()}
								/>
							</span>
						))}
					</div>
					<div className="dill-stepno">
						<span>
							Step {at + 1} of {steps.length}
						</span>
						<span>For {servings}</span>
					</div>
					<AnimatePresence mode="wait" initial={false}>
						<motion.p
							key={at}
							className="dill-step dill-serif"
							initial={{ opacity: 0, y: 16 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
						>
							{step.before}{" "}
							{step.timer ? (
								<button
									type="button"
									className="dill-timer"
									style={{
										color: left === null ? k.sheet.accent : "#fff",
										background:
											left === null
												? `color-mix(in srgb, ${k.sheet.accent} 14%, transparent)`
												: `color-mix(in srgb, ${k.sheet.accent} 55%, transparent)`,
									}}
									onClick={() => setLeft(left === null ? total : null)}
								>
									<motion.b
										style={{ background: k.sheet.accent }}
										initial={false}
										animate={{ scaleX: left === null ? 0 : 1 - left / total }}
										transition={{ duration: left === total ? 0.3 : 1, ease: "linear" }}
									/>
									<span>
										<Clock />
										{left === null ? `${total / 60} min` : left === 0 ? "Done" : clock(left)}
									</span>
								</button>
							) : null}
							{step.after}
						</motion.p>
					</AnimatePresence>
				</div>
				<div className="dill-foot">
					<div className="dill-nav">
						<button
							type="button"
							className="dill-back"
							disabled={at === 0}
							onClick={() => go(at - 1)}
							aria-label="Previous step"
						>
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
						</button>
						{last ? (
							<button type="button" className="dill-cta" style={{ background: k.sheet.accent }} onClick={onNext}>
								Finish
							</button>
						) : (
							<button
								type="button"
								className="dill-cta"
								style={{ background: k.sheet.accent }}
								onClick={() => go(at + 1)}
							>
								Next step
							</button>
						)}
					</div>
				</div>
			</Sheet>
		</>
	);
}

function Done({ onNext }: { onNext: () => void }) {
	const servings = useServings();
	const [stars, setStars] = useState(0);
	const [saved, setSaved] = useState(false);
	return (
		<>
			<Photo src={hero} height="100%" zoom={1.12} pos="center 18%" />
			<div className="dill-done">
				<div className="dill-done-shade" />
				<div style={{ position: "relative", marginTop: "auto", padding: "0 24px" }}>
					<motion.h1
						className="dill-big dill-serif"
						initial={{ opacity: 0, y: 24 }}
						animate={{ opacity: 1, y: 0 }}
						transition={spring(0.1)}
					>
						Dinner's ready.
					</motion.h1>
					<motion.p
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						transition={spring(0.18)}
						style={{ marginTop: 14, fontSize: 17, lineHeight: 1.4, color: "rgba(255,255,255,0.74)" }}
					>
						Brown butter gnocchi for {servings}, on the table in 26 minutes.
					</motion.p>
					<motion.div
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						transition={spring(0.26)}
						style={{ marginTop: 28 }}
					>
						<div style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.74)" }}>
							{stars
								? ["", "Not again", "It was fine", "Good", "Really good", "Making it again"][stars]
								: "How did it turn out?"}
						</div>
						<div className="dill-stars">
							{[1, 2, 3, 4, 5].map((n) => (
								<button type="button" key={n} onClick={() => setStars(n)} aria-label={`${n} stars`}>
									<motion.svg
										width="40"
										height="40"
										viewBox="0 0 24 24"
										initial={false}
										animate={{ scale: n <= stars ? [1, 1.25, 1] : 1 }}
										transition={{ duration: 0.4, delay: n * 0.04 }}
										aria-hidden="true"
									>
										<path
											d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8z"
											fill={n <= stars ? "#ffc65c" : "rgba(255,255,255,0.18)"}
											style={{ transition: "fill 200ms" }}
											strokeLinejoin="round"
										/>
									</motion.svg>
								</button>
							))}
						</div>
					</motion.div>
				</div>
				<div className="dill-foot" style={{ position: "relative", marginTop: 0, paddingTop: 28 }}>
					<button type="button" className="dill-cta dill-light" onClick={() => setSaved((s) => !s)}>
						<AnimatePresence mode="popLayout" initial={false}>
							<motion.span
								key={String(saved)}
								initial={{ opacity: 0, y: 12 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -12 }}
								transition={spring()}
								style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
							>
								{saved ? (
									<>
										<svg
											width="18"
											height="18"
											viewBox="0 0 24 24"
											fill="none"
											stroke={k.sheet.accent}
											strokeWidth={2.6}
											strokeLinecap="round"
											strokeLinejoin="round"
											aria-hidden="true"
										>
											<path d="M5 12.5l4.5 4.5L19 7.5" />
										</svg>
										Saved to your cookbook
									</>
								) : (
									"Save to cookbook"
								)}
							</motion.span>
						</AnimatePresence>
					</button>
					<button type="button" className="dill-link" onClick={onNext}>
						Back to the recipe
					</button>
				</div>
			</div>
		</>
	);
}

function Clock() {
	return (
		<svg
			width="17"
			height="17"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2.2}
			strokeLinecap="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="13" r="8" />
			<path d="M12 9v4l2.5 2M10 2.5h4" />
		</svg>
	);
}

function StatusBar() {
	return (
		<div className="dill-status">
			<span>18:52</span>
			<span>
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
